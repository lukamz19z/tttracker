import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import {
  getBcReviewerRecipients,
  isConfiguredBcReviewer,
} from "@/lib/dockets/reviewers";
import { resolveSystemUserIdentity } from "@/lib/dockets/system-user-identity";
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
  bc_rep_email: string | null;
  bc_rep_user_id: string | null;
  bc_signature_data_url: string | null;
  bc_signed_at: string | null;
  approval_revision: number | null;
  raw_manhours?: number | null;
  production_manhours?: number | null;
  prestart_minutes?: number | null;
  daily_site_summary?: string | null;
  rfi_references?: string[] | null;
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

function allocationManhours(row: Record<string, unknown>) {
  const workers = Array.isArray(row.worker_names) ? row.worker_names.length : 0;
  return num(row.hours) * Math.max(workers, 1);
}

function workedTowerNames(
  docket: DocketRow,
  towers: Array<Record<string, unknown>>,
  allocations: Array<Record<string, unknown>>,
) {
  const byId = new Map(
    towers.map((row) => [String(row.id ?? ""), String(row.name ?? "Tower")]),
  );
  const ids = new Set<string>([docket.tower_id]);

  allocations
    .filter(
      (row) =>
        String(row.allocation_type ?? "").trim().toLowerCase() === "production",
    )
    .forEach((row) => {
      const id = String(row.target_tower_id ?? "").trim();
      if (id) ids.add(id);
    });

  return Array.from(ids).map((id) => byId.get(id) || id);
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
  towers,
  hourAllocations,
}: {
  docket: DocketRow;
  labour: Array<Record<string, unknown>>;
  plant: Array<Record<string, unknown>>;
  delays: Array<Record<string, unknown>>;
  materialEvents: Array<Record<string, unknown>>;
  towers: Array<Record<string, unknown>>;
  hourAllocations: Array<Record<string, unknown>>;
}) {
  const delayHours = delays.reduce((sum, row) => sum + num(row.delay_hours), 0);
  const prestartManhours = labour.reduce(
    (sum, row) => sum + num(row.prestart_minutes) / 60,
    0,
  );
  const workfronts = workedTowerNames(docket, towers, hourAllocations);
  const productionAllocations = hourAllocations.filter(
    (row) =>
      String(row.allocation_type ?? "").trim().toLowerCase() === "production",
  );
  const allocatedProductionMh = productionAllocations.reduce(
    (sum, row) => sum + allocationManhours(row),
    0,
  );
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
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-weight:600">${labour.length} personnel · ${num(docket.raw_manhours).toFixed(2)} raw MH · ${num(docket.production_manhours).toFixed(2)} production MH${prestartManhours > 0 ? ` · ${prestartManhours.toFixed(2)} prestart MH` : ""}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b">Towers worked</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-weight:600">${escapeHtml(workfronts.join(", "))}${allocatedProductionMh > 0 ? ` · ${allocatedProductionMh.toFixed(2)} allocated production MH` : ""}</td>
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
      String(docket.daily_site_summary ?? "").trim()
        ? `<div style="margin:18px 0;padding:14px 16px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px">
             <div style="font-weight:700;color:#0f172a;margin-bottom:7px">Daily site summary</div>
             <div style="color:#334155">${escapeHtml(docket.daily_site_summary)}</div>
           </div>`
        : ""
    }

    ${
      Array.isArray(docket.rfi_references) && docket.rfi_references.length
        ? `<div style="margin:18px 0;padding:12px 16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;color:#1e3a8a">
             <strong>RFI references:</strong> ${escapeHtml(docket.rfi_references.join(", "))}
           </div>`
        : ""
    }

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


type SupabaseLikeError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function isTransientApprovalLinkError(error: SupabaseLikeError | null | undefined) {
  if (!error) return false;

  const combined = [
    error.message,
    error.code,
    error.details,
    error.hint,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    combined.includes("gateway timeout") ||
    combined.includes("timeout") ||
    combined.includes("57014") ||
    combined.includes("55p03") ||
    combined.includes("lock")
  );
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function supersedePendingClientApprovalLinks({
  client,
  docketId,
  supersededAt,
  attempts = 3,
}: {
  client: ReturnType<typeof createServiceClient>;
  docketId: string;
  supersededAt: string;
  attempts?: number;
}) {
  let lastError: SupabaseLikeError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { error } = await client
      .from("tower_docket_approvals")
      .update({
        token_superseded_at: supersededAt,
        status: "superseded",
      })
      .eq("docket_id", docketId)
      .eq("stage", "client")
      .eq("status", "pending");

    if (!error) return;

    lastError = error;

    if (!isTransientApprovalLinkError(error) || attempt === attempts) {
      break;
    }

    await wait(250 * attempt);
  }

  throw new Error(
    `Previous client approval links could not be closed after ${attempts} attempt${attempts === 1 ? "" : "s"}: ${
      lastError?.message || "Unknown database error"
    }`,
  );
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

    const authorization = _request.headers.get("authorization") || "";
    const bearerToken = authorization.toLowerCase().startsWith("bearer ")
      ? authorization.slice(7).trim()
      : "";

    let user = null;
    let userError: { message?: string } | null = null;

    if (bearerToken) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        return NextResponse.json(
          { error: "Supabase public configuration is missing." },
          { status: 500 },
        );
      }

      const bearerClient = createClient(
        supabaseUrl,
        supabaseAnonKey,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        },
      );

      const authResult = await bearerClient.auth.getUser(bearerToken);
      user = authResult.data.user;
      userError = authResult.error;
    } else {
      const supabase = await createRouteSupabase();
      const authResult = await supabase.auth.getUser();
      user = authResult.data.user;
      userError = authResult.error;
    }

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
        bc_rep_email,
        bc_rep_user_id,
        bc_signature_data_url,
        bc_signed_at,
        approval_revision,
        raw_manhours,
        production_manhours,
        prestart_minutes,
        daily_site_summary,
        rfi_references,
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

    const signerIdentity = await resolveSystemUserIdentity(service, user);

    // A signature is permanently associated with the user account that made it.
    // Do not silently relabel another person's saved signature as the current user.
    if (
      docket.bc_rep_user_id &&
      docket.bc_rep_user_id !== signerIdentity.userId
    ) {
      return NextResponse.json(
        {
          error:
            "This Daily Docket was signed by another TTTracker user. That user must submit it, or the signature must be cleared and re-signed by the current user.",
        },
        { status: 409 },
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
            "No individual BC reviewers are configured for this project. Update Daily Docket Approval Settings before submitting.",
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

    // A never-submitted docket cannot have an earlier client approval link.
    // Avoid touching the approvals table on its first BC submission.
    //
    // On resubmission, old client links MUST be invalidated before this docket
    // is allowed back into BC review. Retry transient Supabase/Postgres
    // timeouts rather than failing immediately on a short lock.
    if (previousRevision > 0) {
      try {
        await supersedePendingClientApprovalLinks({
          client: service,
          docketId: docket.id,
          supersededAt: submittedAt,
        });
      } catch (supersedeError) {
        return NextResponse.json(
          {
            error:
              supersedeError instanceof Error
                ? supersedeError.message
                : "Previous client approval links could not be closed.",
          },
          { status: 503 },
        );
      }
    }

    const { data: updatedDocket, error: updateError } = await service
      .from("tower_daily_dockets")
      .update({
        approval_status: "submitted_bc",
        bc_submitted_at: submittedAt,
        bc_submitted_by: user.id,
        approval_revision: revision,
        bc_rep_user_id: signerIdentity.userId,
        bc_rep_name: signerIdentity.name,
        bc_rep_email: signerIdentity.email,
        bc_signed_at: docket.bc_signed_at || submittedAt,
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
      actorName: signerIdentity.name,
      actorEmail: signerIdentity.email,
      eventType: previousRevision > 0 ? "bc_resubmitted" : "bc_submitted",
      revision,
      metadata: {
        previous_revision: previousRevision,
        source_status: docket.approval_status || "legacy",
        reviewer_user_ids: reviewers.map((reviewer) => reviewer.userId),
        reviewer_names: reviewers.map((reviewer) => reviewer.name),
        reviewer_emails: reviewers.map((reviewer) => reviewer.email),
      },
    });

    const [
      { data: projectData },
      { data: towerData },
      { data: projectTowersData },
      labourResult,
      plantResult,
      delayResult,
      materialResult,
      allocationResult,
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
        .from("towers")
        .select("id,name,extra_data")
        .eq("project_id", docket.project_id)
        .order("name"),
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
      service
        .from("tower_docket_hour_allocations")
        .select("*")
        .eq("docket_id", docket.id)
        .order("created_at"),
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
        towers: (projectTowersData ?? []) as Array<Record<string, unknown>>,
        hourAllocations: (allocationResult.data ?? []) as Array<Record<string, unknown>>,
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
              <td style="padding:8px 0;color:#0f172a;font-weight:600;">${escapeHtml(signerIdentity.name)} · ${escapeHtml(signerIdentity.email)}</td>
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
            This approval request was sent to ${recipientNames.length} individually configured BC reviewer${recipientNames.length === 1 ? "" : "s"}${recipientNames.length ? `: ${escapeHtml(recipientNames.join(", "))}` : ""}.
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
      reviewerRecipients: reviewers.map((reviewer) => ({
        userId: reviewer.userId,
        name: reviewer.name,
        email: reviewer.email,
      })),
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