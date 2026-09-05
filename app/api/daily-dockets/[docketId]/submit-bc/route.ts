import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import {
  getBcReviewerRecipients,
  isConfiguredBcReviewer,
} from "@/lib/dockets/reviewers";
import {
  docketEmailShell,
  sendDailyDocketEmail,
} from "@/lib/email/daily-dockets";

type RouteContext = {
  params: Promise<{
    docketId: string;
  }>;
};

type DocketRow = {
  id: string;
  project_id: string;
  tower_id: string;
  docket_date: string | null;
  crew: string | null;
  leading_hand: string | null;
  approval_status: string | null;
  bc_rep_name: string | null;
  bc_signature_data_url: string | null;
  bc_signed_at: string | null;
  approval_revision: number | null;
  raw_manhours?: number | null;
  weather?: string | null;
  incident_occurred?: boolean | null;
  incident_type?: string | null;
  delays_comments?: string | null;
  progress_model?: string | null;
};

type ProjectRow = {
  id: string;
  name: string | null;
  project_number: string | null;
};

type TowerRow = {
  id: string;
  name: string | null;
  extra_data: Record<string, unknown> | null;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function titleCase(value: unknown) {
  return String(value ?? "")
    .replace(/_/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function durationHours(start: unknown, finish: unknown) {
  const a = Date.parse(String(start ?? ""));
  const b = Date.parse(String(finish ?? ""));
  return Number.isFinite(a) && Number.isFinite(b) && b >= a
    ? (b - a) / 3_600_000
    : null;
}

function buildOperationalSummaryHtml({
  docket,
  labour,
  plant,
  delays,
  materialEvents,
}: {
  docket: DocketRow;
  labour: Array<Record<string, unknown>>;
  plant: Array<Record<string, unknown>>;
  delays: Array<Record<string, unknown>>;
  materialEvents: Array<Record<string, unknown>>;
}) {
  const delayHours = delays.reduce((sum, row) => sum + num(row.delay_hours), 0);
  const nestedRows = (
    event: Record<string, unknown>,
    key: string,
  ): Array<Record<string, unknown>> => {
    const value = event[key];

    if (!Array.isArray(value)) return [];

    return value.filter(
      (row): row is Record<string, unknown> =>
        Boolean(row) &&
        typeof row === "object" &&
        !Array.isArray(row),
    );
  };

  const materialPeople = materialEvents.flatMap((event) =>
    nestedRows(event, "tower_material_event_people"),
  );
  const materialPlant = materialEvents.flatMap((event) =>
    nestedRows(event, "tower_material_event_plant"),
  );
  const materialPersonHours = materialPeople.reduce((sum, row) => {
    return sum + (durationHours(row.started_at, row.finished_at) ?? 0);
  }, 0);
  const materialPlantHours = materialPlant.reduce((sum, row) => {
    return sum + (durationHours(row.started_at, row.finished_at) ?? 0);
  }, 0);

  const materialImpactRows = materialEvents
    .map((event) => {
      const label = titleCase(event.event_type) || "Material Event";
      const affected = [
        event.affected_section,
        event.affected_activity,
      ].filter(Boolean).join(" · ");
      const effect = event.current_effect
        ? ` — ${titleCase(event.current_effect)}`
        : "";
      return `<li style="margin:5px 0"><strong>${escapeHtml(label)}</strong>${affected ? `: ${escapeHtml(affected)}` : ""}${escapeHtml(effect)}</li>`;
    })
    .join("");

  const delayRows = delays
    .map(
      (row) =>
        `<li style="margin:5px 0"><strong>${escapeHtml(titleCase(row.delay_type) || "Delay")}</strong> — ${num(row.delay_hours).toFixed(2)} h${row.delay_reason ? ` — ${escapeHtml(row.delay_reason)}` : ""}</li>`,
    )
    .join("");

  const plantUsed = plant.filter(
    (row) =>
      String(row.plant_name ?? row.asset_number ?? "").trim() &&
      num(row.total_hours) > 0,
  );

  return `
    <div style="margin:22px 0;border:1px solid #dbe3ec;border-radius:12px;overflow:hidden">
      <div style="background:#0f172a;color:#ffffff;padding:11px 14px;font-weight:700">
        Daily operational summary
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;width:180px">Workforce</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-weight:600">${labour.length} personnel · ${num(docket.raw_manhours).toFixed(2)} raw MH</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b">Plant recorded</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-weight:600">${plant.length}${plantUsed.length ? ` · ${plantUsed.length} with recorded operating hours` : ""}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b">Delays</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-weight:600">${delays.length ? `${delayHours.toFixed(2)} recorded delay hours` : "No delays recorded"}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b">Materials</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-weight:600">${materialEvents.length ? `${materialEvents.length} material event${materialEvents.length === 1 ? "" : "s"}` : "No structured material events recorded"}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;color:#64748b">Safety</td>
          <td style="padding:10px 14px;color:#0f172a;font-weight:600">${docket.incident_occurred ? `Incident/event recorded${docket.incident_type ? ` — ${escapeHtml(docket.incident_type)}` : ""}` : "No incident recorded"}</td>
        </tr>
      </table>
    </div>

    ${
      delays.length
        ? `<div style="margin:18px 0;padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px">
             <div style="font-weight:700;color:#92400e;margin-bottom:7px">Delays / disruptions</div>
             <ul style="margin:0;padding-left:20px;color:#334155">${delayRows}</ul>
           </div>`
        : ""
    }

    ${
      materialEvents.length
        ? `<div style="margin:18px 0;padding:14px 16px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px">
             <div style="font-weight:700;color:#0f172a;margin-bottom:7px">Material impact</div>
             <ul style="margin:0 0 10px;padding-left:20px;color:#334155">${materialImpactRows}</ul>
             ${
               materialPeople.length
                 ? `<div style="margin-top:8px;color:#334155"><strong>Search / verification:</strong> ${materialPeople.length} personnel · approximately ${materialPersonHours.toFixed(2)} person-hours.</div>`
                 : ""
             }
             ${
               materialPlant.length
                 ? `<div style="margin-top:6px;color:#334155"><strong>Plant / equipment affected:</strong> approximately ${materialPlantHours.toFixed(2)} hours.</div>`
                 : ""
             }
           </div>`
        : ""
    }
  `;
}

async function createRouteSupabase() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase server configuration is missing.");
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Cookie writes can be unavailable in some server contexts.
        }
      },
    },
  });
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase service configuration is missing. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function formatDate(value: string | null) {
  if (!value) return "No date";

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function getTowerName(tower: TowerRow | null) {
  if (!tower) return "Tower";

  const extra = tower.extra_data || {};

  return String(
    tower.name ||
      extra.tower_number ||
      extra.structure_number ||
      extra.tower_no ||
      "Tower",
  );
}

function buildReviewUrl({
  projectId,
  towerId,
  docketId,
}: {
  projectId: string;
  towerId: string;
  docketId: string;
}) {
  const configuredBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    "";

  let baseUrl = configuredBaseUrl.trim();

  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
    baseUrl = `https://${baseUrl}`;
  }

  if (!baseUrl) {
    throw new Error(
      "TTTracker application URL is not configured. Set NEXT_PUBLIC_APP_URL in production.",
    );
  }

  return `${baseUrl.replace(/\/$/, "")}/project/${encodeURIComponent(
    projectId,
  )}/tower/${encodeURIComponent(towerId)}/dockets/${encodeURIComponent(
    docketId,
  )}/review`;
}

async function recordWorkflowEvent(
  service: ReturnType<typeof createServiceClient>,
  values: {
    docketId: string;
    projectId: string;
    actorUserId: string;
    actorName?: string | null;
    actorEmail?: string | null;
    eventType: string;
    revision: number;
    comments?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await service.from("tower_docket_workflow_events").insert({
    docket_id: values.docketId,
    project_id: values.projectId,
    event_type: values.eventType,
    performed_by: values.actorUserId,
    performed_by_name: values.actorName || null,
    performed_by_email: values.actorEmail || null,
    comments: values.comments || null,
    metadata: values.metadata ?? {},
    revision: values.revision,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Could not record Daily Docket workflow event", error);
  }
}

export async function POST(
  _request: Request,
  context: RouteContext,
) {
  try {
    const { docketId } = await context.params;

    if (!docketId) {
      return NextResponse.json(
        { error: "Daily Docket ID is required." },
        { status: 400 },
      );
    }

    const supabase = await createRouteSupabase();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be signed in to submit this Daily Docket." },
        { status: 401 },
      );
    }

    const service = createServiceClient();

    const { data: docketData, error: docketError } = await service
      .from("tower_daily_dockets")
      .select(`
        id,
        project_id,
        tower_id,
        docket_date,
        crew,
        leading_hand,
        approval_status,
        bc_rep_name,
        bc_signature_data_url,
        bc_signed_at,
        approval_revision,
        raw_manhours,
        weather,
        incident_occurred,
        incident_type,
        delays_comments,
        progress_model
      `)
      .eq("id", docketId)
      .single();

    if (docketError || !docketData) {
      return NextResponse.json(
        { error: "Daily Docket could not be found." },
        { status: 404 },
      );
    }

    const docket = docketData as DocketRow;

    const allowedStatuses = new Set([
      "draft",
      "legacy",
      "bc_changes_requested",
      "client_changes_requested",
    ]);

    if (!allowedStatuses.has(String(docket.approval_status || "legacy"))) {
      return NextResponse.json(
        {
          error:
            "This Daily Docket cannot be submitted from its current approval status.",
        },
        { status: 409 },
      );
    }

    const { data: accessData, error: accessError } = await service
      .from("project_access")
      .select("user_id")
      .eq("project_id", docket.project_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (accessError) {
      return NextResponse.json(
        { error: "Project access could not be verified." },
        { status: 500 },
      );
    }

    const submitterIsReviewer = await isConfiguredBcReviewer(
      service,
      docket.project_id,
      user.id,
    );

    if (!accessData && !submitterIsReviewer) {
      return NextResponse.json(
        { error: "You do not have access to submit this Daily Docket." },
        { status: 403 },
      );
    }

    if (!docket.bc_rep_name?.trim()) {
      return NextResponse.json(
        {
          error:
            "A BC Representative must be recorded before the Daily Docket can be submitted.",
        },
        { status: 400 },
      );
    }

    if (!docket.bc_signature_data_url?.trim()) {
      return NextResponse.json(
        {
          error:
            "The BC Representative signature must be captured before submission.",
        },
        { status: 400 },
      );
    }

    const reviewers = await getBcReviewerRecipients(
      service,
      docket.project_id,
    );

    if (reviewers.length === 0) {
      return NextResponse.json(
        {
          error:
            "No BC reviewers are configured for this project. Update Daily Docket Approval Settings before submitting.",
        },
        { status: 400 },
      );
    }

    const submittedAt = new Date().toISOString();
    const previousRevision = Math.max(
      0,
      Number(docket.approval_revision ?? 0) || 0,
    );
    const revision = previousRevision + 1;

    // Any unused client links belong to an older draft and must never become
    // valid again after the docket is resubmitted to BC.
    const { error: supersedeClientError } = await service
      .from("tower_docket_approvals")
      .update({
        token_superseded_at: submittedAt,
        status: "superseded",
      })
      .eq("docket_id", docket.id)
      .eq("stage", "client")
      .eq("status", "pending");

    if (supersedeClientError) {
      return NextResponse.json(
        {
          error: `Previous client approval links could not be closed: ${supersedeClientError.message}`,
        },
        { status: 500 },
      );
    }

    const { data: updatedDocket, error: updateError } = await service
      .from("tower_daily_dockets")
      .update({
        approval_status: "submitted_bc",
        bc_submitted_at: submittedAt,
        bc_submitted_by: user.id,
        approval_revision: revision,
      })
      .eq("id", docket.id)
      .in("approval_status", [
        "draft",
        "legacy",
        "bc_changes_requested",
        "client_changes_requested",
      ])
      .select("id, approval_status, approval_revision")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json(
        { error: `Daily Docket could not be submitted: ${updateError.message}` },
        { status: 500 },
      );
    }

    if (!updatedDocket) {
      return NextResponse.json(
        {
          error:
            "The Daily Docket changed before it could be submitted. Refresh the page and try again.",
        },
        { status: 409 },
      );
    }

    await service.from("tower_docket_approvals").insert({
      docket_id: docket.id,
      project_id: docket.project_id,
      stage: "bc",
      status: "pending",
      revision,
      submitted_by: user.id,
      submitted_at: submittedAt,
      created_at: submittedAt,
    });

    await recordWorkflowEvent(service, {
      docketId: docket.id,
      projectId: docket.project_id,
      actorUserId: user.id,
      actorName:
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        null,
      actorEmail: user.email || null,
      eventType: previousRevision > 0 ? "bc_resubmitted" : "bc_submitted",
      revision,
      metadata: {
        previous_revision: previousRevision,
        source_status: docket.approval_status || "legacy",
      },
    });

    const [
      { data: projectData },
      { data: towerData },
      labourResult,
      plantResult,
      delayResult,
      materialResult,
    ] = await Promise.all([
      service
        .from("projects")
        .select("id, name, project_number")
        .eq("id", docket.project_id)
        .maybeSingle(),
      service
        .from("towers")
        .select("id, name, extra_data")
        .eq("id", docket.tower_id)
        .maybeSingle(),
      service
        .from("tower_docket_labour")
        .select("*")
        .eq("docket_id", docket.id)
        .order("worker_name"),
      service
        .from("tower_docket_plant")
        .select("*")
        .eq("docket_id", docket.id),
      service
        .from("tower_docket_delays")
        .select("*")
        .eq("docket_id", docket.id)
        .order("created_at"),
      service
        .from("tower_material_events")
        .select(`
          *,
          tower_material_event_items(*),
          tower_material_event_people(*),
          tower_material_event_plant(*)
        `)
        .eq("docket_id", docket.id)
        .order("occurred_at"),
    ]);

    const project = (projectData as ProjectRow | null) || null;
    const tower = (towerData as TowerRow | null) || null;

    let emailWarning: string | null = null;

    try {
      const reviewUrl = buildReviewUrl({
        projectId: docket.project_id,
        towerId: docket.tower_id,
        docketId: docket.id,
      });

      const projectName =
        project?.name ||
        project?.project_number ||
        "TTTracker Project";

      const towerName = getTowerName(tower);
      const docketDate = formatDate(docket.docket_date);

      const recipientNames = reviewers
        .map((reviewer) => reviewer.name)
        .filter(Boolean);

      const operationalSummary = buildOperationalSummaryHtml({
        docket,
        labour: (labourResult.data ?? []) as Array<Record<string, unknown>>,
        plant: (plantResult.data ?? []) as Array<Record<string, unknown>>,
        delays: (delayResult.data ?? []) as Array<Record<string, unknown>>,
        materialEvents: (materialResult.data ?? []) as Array<Record<string, unknown>>,
      });

      const html = docketEmailShell(
        "Daily Docket awaiting BC approval",
        `
          <p>A Daily Docket has been submitted for BC approval.</p>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;border-collapse:collapse;">
            <tr>
              <td style="padding:8px 0;color:#64748b;width:150px;">Project</td>
              <td style="padding:8px 0;color:#0f172a;font-weight:600;">${projectName}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#64748b;">Tower</td>
              <td style="padding:8px 0;color:#0f172a;font-weight:600;">${towerName}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#64748b;">Docket Date</td>
              <td style="padding:8px 0;color:#0f172a;font-weight:600;">${docketDate}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#64748b;">Revision</td>
              <td style="padding:8px 0;color:#0f172a;font-weight:600;">R${String(revision).padStart(2, "0")}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#64748b;">Leading Hand</td>
              <td style="padding:8px 0;color:#0f172a;font-weight:600;">${docket.leading_hand || "—"}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#64748b;">BC Representative</td>
              <td style="padding:8px 0;color:#0f172a;font-weight:600;">${docket.bc_rep_name || "—"}</td>
            </tr>
          </table>

          ${operationalSummary}

          <p style="margin-top:20px;">
            Review the Daily Docket in TTTracker and either approve it for client review or request changes.
          </p>

          <p style="margin:24px 0;">
            <a href="${reviewUrl}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">
              Review Daily Docket
            </a>
          </p>

          <p style="font-size:13px;color:#64748b;">
            This approval request was sent to ${recipientNames.length} configured BC reviewer${recipientNames.length === 1 ? "" : "s"}.
          </p>
        `,
      );

      await sendDailyDocketEmail({
        to: reviewers.map((reviewer) => reviewer.email),
        subject: `Daily Docket approval required · ${towerName} · ${docketDate}`,
        html,
      });
    } catch (emailError) {
      console.error(
        "Daily Docket submitted but BC reviewer email could not be sent",
        emailError,
      );

      emailWarning =
        "The Daily Docket was submitted successfully, but the reviewer email could not be sent.";
    }

    return NextResponse.json({
      success: true,
      status: "submitted_bc",
      submittedAt,
      revision,
      reviewers: reviewers.length,
      warning: emailWarning,
    });
  } catch (error) {
    console.error("Daily Docket submit-bc route failed", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The Daily Docket could not be submitted.",
      },
      { status: 500 },
    );
  }
}
