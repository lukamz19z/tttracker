import { createHash, randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import {
  authUserEmailMap,
  createDocketAdminSupabase,
  requireAuthenticatedProjectUser,
} from "@/lib/dockets/server";
import { isConfiguredBcReviewer } from "@/lib/dockets/reviewers";
import { generateDailyDocketPdf } from "@/lib/dockets/daily-docket-pdf";
import { loadSystemPdfBranding } from "@/lib/branding/server";
import {
  docketEmailShell,
  sendDailyDocketEmail,
} from "@/lib/email/daily-dockets";
import {
  buildDailyDocketPdfFileName,
  ensureDailyDocketTowerFolder,
} from "@/lib/sharepoint/daily-dockets";
import {
  ensureDriveFolder,
  uploadDriveItemContent,
} from "@/lib/sharepoint/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ docketId: string }>;
};

type ReviewAction = "approve" | "request_changes";

type ReviewBody = {
  action?: ReviewAction;
  comments?: string;
  change_requests?: Array<{
    category?: string;
    detail?: string;
  }>;
  reviewer_signature_data_url?: string;
  reviewer_made_changes?: boolean;
  client_content_keys?: string[];
};

const CLIENT_CONTENT_KEYS = [
  "progress",
  "workforce",
  "raw_manhours",
  "plant",
  "mobilisation",
  "travel",
  "delays",
  "missing_materials",
  "received_materials",
  "safety",
] as const;

type ClientContentKey = (typeof CLIENT_CONTENT_KEYS)[number];

function normaliseClientContentKeys(value: unknown): ClientContentKey[] {
  if (!Array.isArray(value)) return [];

  const allowed = new Set<string>(CLIENT_CONTENT_KEYS);

  return Array.from(
    new Set(
      value
        .map((item) => String(item ?? "").trim())
        .filter((item): item is ClientContentKey => allowed.has(item)),
    ),
  );
}

type DocketRow = {
  id: string;
  project_id: string;
  tower_id: string;
  docket_date: string | null;
  crew: string | null;
  leading_hand: string | null;
  approval_status: string | null;
  bc_rep_name: string | null;
  bc_signature_data_url?: string | null;
  bc_signed_at?: string | null;
  bc_submitted_by?: string | null;
  bc_submitted_at?: string | null;
  approval_revision?: number | null;
  docket_file_url?: string | null;
  [key: string]: unknown;
};

type ProjectRow = {
  id: string;
  name: string | null;
  project_number: string | null;
  client: string | null;
  sharepoint_site_id: string | null;
  sharepoint_drive_id: string | null;
  sharepoint_folder_id: string | null;
};

type ClientContactRow = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  receives_approval: boolean;
  active: boolean;
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

function isMissingMaterialEvent(event: Record<string, unknown>) {
  const type = String(event.event_type ?? "").trim().toLowerCase();
  return type.includes("missing") || type.includes("short");
}

function isReceivedMaterialEvent(event: Record<string, unknown>) {
  const type = String(event.event_type ?? "").trim().toLowerCase();
  return (
    type.includes("received") ||
    type.includes("found") ||
    type.includes("deliver") ||
    type.includes("transfer")
  );
}

function buildClientOperationalSummaryHtml({
  docket,
  labour,
  plant,
  delays,
  materialEvents,
  clientContentKeys,
}: {
  docket: DocketRow;
  labour: Array<Record<string, unknown>>;
  plant: Array<Record<string, unknown>>;
  delays: Array<Record<string, unknown>>;
  materialEvents: Array<Record<string, unknown>>;
  clientContentKeys: ClientContentKey[];
}) {
  const visible = new Set<ClientContentKey>(clientContentKeys);

  const visibleMaterialEvents = materialEvents.filter((event) => {
    const missing = isMissingMaterialEvent(event);
    const received = isReceivedMaterialEvent(event);

    if (missing && visible.has("missing_materials")) return true;
    if (received && visible.has("received_materials")) return true;

    if (!missing && !received) {
      return (
        visible.has("missing_materials") &&
        visible.has("received_materials")
      );
    }

    return false;
  });

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

  const people = visibleMaterialEvents.flatMap((event) =>
    nestedRows(event, "tower_material_event_people"),
  );
  const affectedPlant = visibleMaterialEvents.flatMap((event) =>
    nestedRows(event, "tower_material_event_plant"),
  );

  const personHours = people.reduce(
    (sum, row) => sum + (durationHours(row.started_at, row.finished_at) ?? 0),
    0,
  );

  const plantHours = affectedPlant.reduce(
    (sum, row) => sum + (durationHours(row.started_at, row.finished_at) ?? 0),
    0,
  );

  const delayHours = delays.reduce(
    (sum, row) => sum + num(row.delay_hours),
    0,
  );

  const peopleRows = people
    .map((row) => {
      const hours = durationHours(row.started_at, row.finished_at);
      const start = String(row.started_at ?? "").slice(11, 16);
      const finish = String(row.finished_at ?? "").slice(11, 16);

      return `<li style="margin:5px 0">${escapeHtml(
        row.employee_name || "Personnel",
      )}${
        start || finish
          ? `: ${escapeHtml(start || "—")}–${escapeHtml(finish || "—")}`
          : ""
      }${hours !== null ? ` (${hours.toFixed(2)} h)` : ""}</li>`;
    })
    .join("");

  const plantRows = affectedPlant
    .map((row) => {
      const hours = durationHours(row.started_at, row.finished_at);

      return `<li style="margin:5px 0">${escapeHtml(
        row.plant_name || "Plant / equipment",
      )}${hours !== null ? ` — ${hours.toFixed(2)} h` : ""}</li>`;
    })
    .join("");

  const materialBlocks = visibleMaterialEvents
    .map((event) => {
      const affected = [event.affected_section, event.affected_activity]
        .filter(Boolean)
        .join(" · ");

      const mitigation = Array.isArray(event.mitigation_actions)
        ? event.mitigation_actions.map(titleCase).join("; ")
        : "";

      return `
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0">
          <div style="font-weight:700;color:#0f172a">
            ${escapeHtml(titleCase(event.event_type) || "Material Event")}
            ${affected ? ` — ${escapeHtml(affected)}` : ""}
          </div>
          ${
            event.work_outcome
              ? `<div style="margin-top:5px;color:#334155"><strong>Work outcome:</strong> ${escapeHtml(
                  titleCase(event.work_outcome),
                )}</div>`
              : ""
          }
          ${
            event.current_effect
              ? `<div style="margin-top:5px;color:#334155"><strong>Remaining effect:</strong> ${escapeHtml(
                  titleCase(event.current_effect),
                )}</div>`
              : ""
          }
          ${
            mitigation
              ? `<div style="margin-top:5px;color:#334155"><strong>Mitigation:</strong> ${escapeHtml(
                  mitigation,
                )}</div>`
              : ""
          }
          ${
            event.notes
              ? `<div style="margin-top:5px;color:#334155"><strong>Notes:</strong> ${escapeHtml(
                  event.notes,
                )}</div>`
              : ""
          }
        </div>
      `;
    })
    .join("");

  const delayRows = delays
    .map(
      (row) =>
        `<li style="margin:5px 0"><strong>${escapeHtml(
          titleCase(row.delay_type) || "Delay",
        )}</strong> — ${num(row.delay_hours).toFixed(2)} h${
          row.delay_reason ? ` — ${escapeHtml(row.delay_reason)}` : ""
        }</li>`,
    )
    .join("");

  const summaryRows = [
    visible.has("workforce")
      ? `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;width:180px">Workforce</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-weight:600">${labour.length} personnel</td>
        </tr>`
      : "",
    visible.has("raw_manhours")
      ? `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b">Raw man-hours</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-weight:600">${num(
            docket.raw_manhours,
          ).toFixed(2)} raw MH</td>
        </tr>`
      : "",
    visible.has("plant")
      ? `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b">Plant / equipment</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-weight:600">${plant.length} items recorded</td>
        </tr>`
      : "",
    visible.has("mobilisation")
      ? `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b">Mobilisation</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-weight:600">${
            num(docket.mobilisation_hours) > 0
              ? `${num(docket.mobilisation_hours).toFixed(2)} h recorded`
              : "No separate mobilisation hours recorded"
          }</td>
        </tr>`
      : "",
    visible.has("travel")
      ? `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b">Travel</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-weight:600">${
            num(docket.travel_hours) > 0
              ? `${num(docket.travel_hours).toFixed(2)} h recorded`
              : "No separate travel hours recorded"
          }</td>
        </tr>`
      : "",
    visible.has("delays")
      ? `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b">Delays / disruptions</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-weight:600">${
            delays.length
              ? `${delayHours.toFixed(2)} recorded delay hours`
              : "No delays recorded"
          }</td>
        </tr>`
      : "",
    visible.has("missing_materials") || visible.has("received_materials")
      ? `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b">Materials</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-weight:600">${
            visibleMaterialEvents.length
              ? `${visibleMaterialEvents.length} material event${
                  visibleMaterialEvents.length === 1 ? "" : "s"
                } recorded`
              : "No selected material events recorded"
          }</td>
        </tr>`
      : "",
    visible.has("safety")
      ? `
        <tr>
          <td style="padding:10px 14px;color:#64748b">Safety</td>
          <td style="padding:10px 14px;color:#0f172a;font-weight:600">${
            docket.incident_occurred
              ? `Incident/event recorded${
                  docket.incident_type
                    ? ` — ${escapeHtml(docket.incident_type)}`
                    : ""
                }`
              : "No incident recorded"
          }</td>
        </tr>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const selectedLabels = CLIENT_CONTENT_KEYS.filter((key) =>
    visible.has(key),
  )
    .map((key) => titleCase(key))
    .join(", ");

  return `
    <div style="margin:22px 0;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden">
      <div style="background:#0f172a;color:#ffffff;padding:11px 14px;font-weight:700">
        BC daily site update
      </div>
      ${
        summaryRows
          ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">${summaryRows}</table>`
          : ""
      }
      <div style="padding:10px 14px;color:#64748b;font-size:12px;border-top:1px solid #e2e8f0">
        Client docket sections: ${escapeHtml(selectedLabels)}
      </div>
    </div>

    ${
      visible.has("delays") && delays.length
        ? `<div style="margin:18px 0;padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px">
             <div style="font-weight:700;color:#92400e;margin-bottom:7px">Delays / disruptions</div>
             <ul style="margin:0;padding-left:20px;color:#334155">${delayRows}</ul>
           </div>`
        : ""
    }

    ${
      (visible.has("missing_materials") ||
        visible.has("received_materials")) &&
      visibleMaterialEvents.length
        ? `<div style="margin:18px 0;padding:14px 16px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px">
             <div style="font-weight:700;color:#0f172a">Material search / verification and impact</div>
             ${
               peopleRows
                 ? `<div style="margin-top:10px;color:#334155"><strong>Search undertaken by:</strong><ul style="margin:6px 0 0;padding-left:20px">${peopleRows}</ul></div>`
                 : ""
             }
             ${
               plantRows
                 ? `<div style="margin-top:10px;color:#334155"><strong>Plant / equipment affected:</strong><ul style="margin:6px 0 0;padding-left:20px">${plantRows}</ul></div>`
                 : ""
             }
             ${
               people.length
                 ? `<div style="margin-top:10px;color:#334155"><strong>Personnel impact:</strong> ${people.length} personnel spent approximately ${personHours.toFixed(
                     2,
                   )} person-hours searching for or verifying material.</div>`
                 : ""
             }
             ${
               affectedPlant.length
                 ? `<div style="margin-top:6px;color:#334155"><strong>Plant impact:</strong> approximately ${plantHours.toFixed(
                     2,
                   )} affected hours recorded.</div>`
                 : ""
             }
             ${materialBlocks}
           </div>`
        : ""
    }
  `;
}

function makeClientToken() {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

function addDaysIso(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

async function loadPdfBundle(
  admin: ReturnType<typeof createDocketAdminSupabase>,
  docket: DocketRow,
) {
  const [
    projectResult,
    towerResult,
    labourResult,
    plantResult,
    delayResult,
    progressResult,
    materialEventResult,
  ] = await Promise.all([
    admin
      .from("projects")
      .select(
        "id,name,project_number,client,sharepoint_site_id,sharepoint_drive_id,sharepoint_folder_id",
      )
      .eq("id", docket.project_id)
      .single(),

    admin
      .from("towers")
      .select("*")
      .eq("id", docket.tower_id)
      .single(),

    admin
      .from("tower_docket_labour")
      .select("*")
      .eq("docket_id", docket.id)
      .order("worker_name"),

    admin
      .from("tower_docket_plant")
      .select("*")
      .eq("docket_id", docket.id),

    admin
      .from("tower_docket_delays")
      .select("*")
      .eq("docket_id", docket.id)
      .order("created_at"),

    admin
      .from("tower_docket_progress")
      .select("*")
      .eq("docket_id", docket.id),

    admin
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

  if (projectResult.error || !projectResult.data) {
    throw new Error(
      projectResult.error?.message ?? "Project could not be loaded.",
    );
  }

  if (towerResult.error || !towerResult.data) {
    throw new Error(
      towerResult.error?.message ?? "Tower could not be loaded.",
    );
  }

  const childError =
    labourResult.error ||
    plantResult.error ||
    delayResult.error ||
    progressResult.error ||
    materialEventResult.error;

  if (childError) {
    throw new Error(
      `Daily Docket details could not be loaded: ${childError.message}`,
    );
  }

  return {
    project: projectResult.data as unknown as ProjectRow,
    tower: towerResult.data,
    labour: labourResult.data ?? [],
    plant: plantResult.data ?? [],
    delays: delayResult.data ?? [],
    progress: progressResult.data ?? [],
    materialEvents: materialEventResult.data ?? [],
  };
}

async function publishDraftPdf({
  project,
  tower,
  docket,
  pdf,
}: {
  project: ProjectRow;
  tower: Record<string, unknown>;
  docket: DocketRow;
  pdf: Uint8Array;
}) {
  if (!project.sharepoint_drive_id || !project.sharepoint_folder_id) {
    throw new Error(
      "This project is not linked to its Project Delivery SharePoint folder.",
    );
  }

  const towerName = String(
    tower.name || "",
  ).trim();

  if (!towerName) {
    throw new Error(
      "The tower does not have a usable name for its SharePoint folder.",
    );
  }

  const docketDate = String(docket.docket_date ?? "").slice(0, 10);

  if (!docketDate) {
    throw new Error("The Daily Docket does not have a docket date.");
  }

  const { towerFolder } = await ensureDailyDocketTowerFolder({
    driveId: project.sharepoint_drive_id,
    projectFolderId: project.sharepoint_folder_id,
    towerName,
  });

  const draftFolder = await ensureDriveFolder({
    driveId: project.sharepoint_drive_id,
    parentItemId: towerFolder.id,
    name: "Draft",
  });

  const baseFileName = buildDailyDocketPdfFileName({
    towerName,
    docketDate,
  });

  const revision = Math.max(1, Number(docket.approval_revision ?? 1) || 1);
  const revisionLabel = `R${String(revision).padStart(2, "0")}`;
  const fileName = baseFileName.replace(
    /\.pdf$/i,
    `-${revisionLabel}-DRAFT.pdf`,
  );

  const item = await uploadDriveItemContent({
    driveId: project.sharepoint_drive_id,
    parentItemId: draftFolder.id,
    fileName,
    content: pdf,
    contentType: "application/pdf",
  });

  return {
    towerName,
    docketDate,
    fileName,
    folder: draftFolder,
    item,
  };
}

function validateReviewerSignature(value: unknown) {
  const signature = String(value ?? "").trim();

  if (!signature.startsWith("data:image/png;base64,")) {
    return {
      ok: false as const,
      error: "A valid BC reviewer signature is required before approval.",
    };
  }

  const base64 = signature.split(",")[1] || "";
  const approximateBytes = Math.ceil((base64.length * 3) / 4);

  if (approximateBytes > 400 * 1024) {
    return {
      ok: false as const,
      error: "The BC reviewer signature is too large. Clear it and sign again.",
    };
  }

  return { ok: true as const, signature };
}

async function recordWorkflowEvents(
  admin: ReturnType<typeof createDocketAdminSupabase>,
  events: Array<Record<string, unknown>>,
) {
  if (events.length === 0) return;

  const safeEvents = events.map((event) => ({
    ...event,
    metadata:
      event.metadata &&
      typeof event.metadata === "object" &&
      !Array.isArray(event.metadata)
        ? event.metadata
        : {},
  }));

  const { error } = await admin
    .from("tower_docket_workflow_events")
    .insert(safeEvents);

  if (error) {
    console.error("DAILY DOCKET WORKFLOW HISTORY ERROR", error);
  }
}

function normaliseChangeRequests(value: ReviewBody["change_requests"]) {
  if (!Array.isArray(value)) return [];

  return value
    .map((row) => ({
      category: String(row?.category ?? "").trim(),
      detail: String(row?.detail ?? "").trim(),
    }))
    .filter((row) => row.category && row.detail)
    .slice(0, 20);
}

export async function POST(request: Request, context: RouteContext) {
  const { docketId } = await context.params;

  try {
    const body = (await request.json().catch(() => ({}))) as ReviewBody;

    if (body.action !== "approve" && body.action !== "request_changes") {
      return NextResponse.json(
        { error: "A valid review action is required." },
        { status: 400 },
      );
    }

    const comments = String(body.comments ?? "").trim();
    const changeRequests = normaliseChangeRequests(body.change_requests);

    if (body.action === "request_changes" && changeRequests.length === 0 && !comments) {
      return NextResponse.json(
        {
          error:
            "Select the docket sections requiring changes and enter the required correction for each section.",
        },
        { status: 400 },
      );
    }

    const reviewerSignatureResult =
      body.action === "approve"
        ? validateReviewerSignature(body.reviewer_signature_data_url)
        : null;

    if (reviewerSignatureResult && !reviewerSignatureResult.ok) {
      return NextResponse.json(
        { error: reviewerSignatureResult.error },
        { status: 400 },
      );
    }

    const reviewerSignature =
      reviewerSignatureResult?.ok ? reviewerSignatureResult.signature : null;

    const admin = createDocketAdminSupabase();

    const { data: docketData, error: docketError } = await admin
      .from("tower_daily_dockets")
      .select("*")
      .eq("id", docketId)
      .single();

    if (docketError || !docketData) {
      return NextResponse.json(
        { error: "Daily Docket not found." },
        { status: 404 },
      );
    }

    const docket = docketData as unknown as DocketRow;

    const { user } = await requireAuthenticatedProjectUser(
      docket.project_id,
    );

    const reviewStatus = String(docket.approval_status || "");
    const allowedReviewStatuses = new Set([
      "submitted_bc",
      "client_changes_requested",
    ]);

    if (!allowedReviewStatuses.has(reviewStatus)) {
      return NextResponse.json(
        {
          error:
            "This Daily Docket is not currently awaiting action from a BC reviewer.",
        },
        { status: 409 },
      );
    }

    const currentRevision = Math.max(
      1,
      Number(docket.approval_revision ?? 1) || 1,
    );

    const allowedReviewer = await isConfiguredBcReviewer(
      admin,
      docket.project_id,
      user.id,
    );

    if (!allowedReviewer) {
      return NextResponse.json(
        {
          error:
            "You are not one of the configured BC reviewers for this project.",
        },
        { status: 403 },
      );
    }

    const reviewerMap = await authUserEmailMap(admin, [user.id]);
    const reviewer = reviewerMap.get(user.id);

    const reviewedAt = new Date().toISOString();
    const reviewerName =
      reviewer?.name ||
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      null;
    const reviewerEmail = reviewer?.email || user.email || null;

    if (body.action === "request_changes") {
      const { error: docketUpdateError } = await admin
        .from("tower_daily_dockets")
        .update({
          approval_status: "bc_changes_requested",
        })
        .eq("id", docketId)
        .in("approval_status", [
          "submitted_bc",
          "client_changes_requested",
        ]);

      if (docketUpdateError) {
        throw new Error(
          `Daily Docket could not be returned for changes: ${docketUpdateError.message}`,
        );
      }

      if (reviewStatus === "submitted_bc") {
        const { error: approvalUpdateError } = await admin
          .from("tower_docket_approvals")
          .update({
            status: "changes_requested",
            reviewed_by: user.id,
            reviewed_by_name: reviewerName,
            reviewed_by_email: reviewerEmail,
            reviewed_at: reviewedAt,
            comments:
              comments ||
              changeRequests
                .map((request) => `${request.category}: ${request.detail}`)
                .join("\n") ||
              null,
          })
          .eq("docket_id", docketId)
          .eq("stage", "bc")
          .eq("revision", currentRevision)
          .eq("status", "pending");

        if (approvalUpdateError) {
          throw new Error(
            `BC approval record could not be updated: ${approvalUpdateError.message}`,
          );
        }
      }

      await recordWorkflowEvents(admin, [
        {
          docket_id: docketId,
          project_id: docket.project_id,
          event_type: "bc_changes_requested",
          performed_by: user.id,
          performed_by_name: reviewerName,
          performed_by_email: reviewerEmail,
          comments:
            comments ||
            changeRequests
              .map((request) => `${request.category}: ${request.detail}`)
              .join("\n") ||
            null,
          revision: currentRevision,
          metadata: {
            change_requests: changeRequests,
            source_status: reviewStatus,
            originated_from_client:
              reviewStatus === "client_changes_requested",
          },
        },
      ]);

      if (docket.bc_submitted_by) {
        const submitterMap = await authUserEmailMap(admin, [
          docket.bc_submitted_by,
        ]);
        const submitter = submitterMap.get(docket.bc_submitted_by);

        if (submitter?.email) {
          const bundle = await loadPdfBundle(admin, docket);
          const project = bundle.project;
          const towerName = String(
            bundle.tower.name || "Tower",
          );

          const origin =
            process.env.NEXT_PUBLIC_APP_URL ||
            new URL(request.url).origin;

          const editUrl =
            `${origin}/project/${docket.project_id}` +
            `/tower/${docket.tower_id}/dockets/${docketId}/edit`;

          await sendDailyDocketEmail({
            to: [submitter.email],
            subject: `Daily Docket changes required - ${towerName} - ${docket.docket_date || ""}`,
            html: docketEmailShell(
              "Daily Docket changes required",
              `
                <p>The BC reviewer has requested changes to this Daily Docket.</p>

                <table role="presentation" style="width:100%;border-collapse:collapse;margin:20px 0">
                  <tr>
                    <td style="padding:7px 0;color:#64748b;width:140px">Project</td>
                    <td style="padding:7px 0;font-weight:600">
                      ${escapeHtml(project.project_number || "")}
                      ${escapeHtml(project.name || "")}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:7px 0;color:#64748b">Tower</td>
                    <td style="padding:7px 0;font-weight:600">${escapeHtml(towerName)}</td>
                  </tr>
                  <tr>
                    <td style="padding:7px 0;color:#64748b">Reviewer</td>
                    <td style="padding:7px 0">${escapeHtml(reviewerName || reviewerEmail || "BC Reviewer")}</td>
                  </tr>
                  ${
                    comments
                      ? `
                        <tr>
                          <td style="padding:7px 0;color:#64748b;vertical-align:top">Comments</td>
                          <td style="padding:7px 0">${escapeHtml(comments)}</td>
                        </tr>
                      `
                      : ""
                  }
                </table>

                ${
                  changeRequests.length
                    ? `
                      <div style="margin:18px 0;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
                        <div style="font-weight:700;margin-bottom:8px">Required changes</div>
                        ${changeRequests
                          .map(
                            (item) =>
                              `<div style="margin:6px 0"><strong>${escapeHtml(item.category)}:</strong> ${escapeHtml(item.detail)}</div>`,
                          )
                          .join("")}
                      </div>
                    `
                    : ""
                }

                <p style="margin:24px 0 8px">
                  <a
                    href="${escapeHtml(editUrl)}"
                    style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700"
                  >
                    Open Daily Docket
                  </a>
                </p>
              `,
            ),
          });
        }
      }

      return NextResponse.json({
        success: true,
        status: "bc_changes_requested",
      });
    }

    const reviewerMadeChanges = Boolean(body.reviewer_made_changes);
    const createsNewRevision =
      reviewStatus === "client_changes_requested" || reviewerMadeChanges;
    const approvalRevision = createsNewRevision
      ? currentRevision + 1
      : currentRevision;

    if (createsNewRevision) {
      const { error: revisionUpdateError } = await admin
        .from("tower_daily_dockets")
        .update({
          approval_revision: approvalRevision,
        })
        .eq("id", docketId)
        .eq("approval_revision", currentRevision);

      if (revisionUpdateError) {
        throw new Error(
          `The corrected Daily Docket revision could not be created: ${revisionUpdateError.message}`,
        );
      }

      const { error: newBcApprovalError } = await admin
        .from("tower_docket_approvals")
        .insert({
          docket_id: docketId,
          project_id: docket.project_id,
          stage: "bc",
          status: "pending",
          revision: approvalRevision,
          submitted_by: user.id,
          submitted_at: reviewedAt,
          created_at: reviewedAt,
        });

      if (newBcApprovalError) {
        throw new Error(
          `The corrected BC approval attempt could not be created: ${newBcApprovalError.message}`,
        );
      }

      await recordWorkflowEvents(admin, [
        {
          docket_id: docketId,
          project_id: docket.project_id,
          event_type:
            reviewStatus === "client_changes_requested"
              ? "bc_corrected_client_changes"
              : "bc_reviewer_corrected_docket",
          performed_by: user.id,
          performed_by_name: reviewerName,
          performed_by_email: reviewerEmail,
          revision: approvalRevision,
          metadata: {
            from_revision: currentRevision,
            to_revision: approvalRevision,
            source_status: reviewStatus,
            reviewer_made_changes: reviewerMadeChanges,
          },
        },
      ]);
    }

    const docketAtApproval: DocketRow = {
      ...docket,
      approval_revision: approvalRevision,
    };

    const clientContentKeys = normaliseClientContentKeys(
      body.client_content_keys,
    );

    if (clientContentKeys.length === 0) {
      return NextResponse.json(
        {
          error:
            "Select at least one section to include in the client Daily Docket.",
        },
        { status: 400 },
      );
    }

    const { error: clearClientContentError } = await admin
      .from("tower_docket_client_content")
      .delete()
      .eq("docket_id", docketId)
      .eq("revision", approvalRevision);

    if (clearClientContentError) {
      throw new Error(
        `The client docket content selection could not be prepared: ${clearClientContentError.message}`,
      );
    }

    const selectedClientContent = CLIENT_CONTENT_KEYS.map((contentKey) => ({
      docket_id: docketId,
      project_id: docket.project_id,
      revision: approvalRevision,
      content_key: contentKey,
      included: clientContentKeys.includes(contentKey),
      selected_by: user.id,
      selected_at: reviewedAt,
    }));

    const { error: clientContentError } = await admin
      .from("tower_docket_client_content")
      .insert(selectedClientContent);

    if (clientContentError) {
      throw new Error(
        `The client docket content selection could not be saved: ${clientContentError.message}`,
      );
    }

    await recordWorkflowEvents(admin, [
      {
        docket_id: docketId,
        project_id: docket.project_id,
        event_type: "client_content_selected",
        performed_by: user.id,
        performed_by_name: reviewerName,
        performed_by_email: reviewerEmail,
        revision: approvalRevision,
        metadata: {
          included_content: clientContentKeys,
        },
      },
    ]);

    const { data: contactsData, error: contactsError } = await admin
      .from("project_docket_contacts")
      .select(
        "id,name,email,company,receives_approval,active",
      )
      .eq("project_id", docket.project_id)
      .eq("active", true)
      .eq("receives_approval", true)
      .order("name");

    if (contactsError) {
      throw new Error(
        `Client approval contacts could not be loaded: ${contactsError.message}`,
      );
    }

    const contacts = (contactsData ?? []) as ClientContactRow[];

    if (contacts.length === 0) {
      return NextResponse.json(
        {
          error:
            "No active client approval contacts are configured for this project.",
        },
        { status: 409 },
      );
    }

    const [bundle, branding] = await Promise.all([
      loadPdfBundle(admin, docket),
      loadSystemPdfBranding(),
    ]);
    const project = bundle.project;

    await admin
      .from("tower_daily_dockets")
      .update({
        sharepoint_sync_status: "publishing",
        sharepoint_sync_error: null,
      })
      .eq("id", docketId);

    const docketForPdf: DocketRow = {
      ...docketAtApproval,
      bc_approved_at: reviewedAt,
      bc_approved_by: user.id,
      bc_approved_name: reviewerName,
      bc_approved_email: reviewerEmail,
      bc_reviewer_signature_data_url: reviewerSignature,
      bc_approval_signature_data_url: reviewerSignature,
    };

    const pdf = generateDailyDocketPdf({
      project: bundle.project,
      tower: bundle.tower,
      docket: docketForPdf,
      labour: bundle.labour,
      plant: bundle.plant,
      delays: bundle.delays,
      progress: bundle.progress,
      materialEvents: bundle.materialEvents,
      branding: {
        logoDataUrl: branding.logoDataUrl,
        companyName: branding.companyName,
        abn: branding.abn,
        addressLine1: branding.addressLine1,
        addressLine2: branding.addressLine2,
        suburb: branding.suburb,
        state: branding.state,
        postcode: branding.postcode,
        phone: branding.phone,
        email: branding.email,
        website: branding.website,
      },
      clientContentKeys,
    });

    const published = await publishDraftPdf({
      project,
      tower: bundle.tower,
      docket: docketForPdf,
      pdf,
    });

    const { error: supersedeClientTokensError } = await admin
      .from("tower_docket_approvals")
      .update({
        token_superseded_at: reviewedAt,
        status: "superseded",
      })
      .eq("docket_id", docketId)
      .eq("stage", "client")
      .eq("status", "pending");

    if (supersedeClientTokensError) {
      throw new Error(
        `Previous client approval links could not be superseded: ${supersedeClientTokensError.message}`,
      );
    }

    const tokenExpiry = addDaysIso(14);
    const approvalLinks: Array<{
      contact: ClientContactRow;
      token: string;
    }> = [];

    for (const contact of contacts) {
      const { token, tokenHash } = makeClientToken();

      const { error: tokenInsertError } = await admin
        .from("tower_docket_approvals")
        .insert({
          docket_id: docketId,
          project_id: docket.project_id,
          stage: "client",
          status: "pending",
          revision: approvalRevision,
          recipient_name: contact.name,
          recipient_email: contact.email.trim().toLowerCase(),
          token_hash: tokenHash,
          token_expires_at: tokenExpiry,
          submitted_by: user.id,
          submitted_at: reviewedAt,
        });

      if (tokenInsertError) {
        throw new Error(
          `Client approval link could not be created: ${tokenInsertError.message}`,
        );
      }

      approvalLinks.push({ contact, token });
    }

    const { error: bcApprovalUpdateError } = await admin
      .from("tower_docket_approvals")
      .update({
        status: "approved",
        reviewed_by: user.id,
        reviewed_by_name: reviewerName,
        reviewed_by_email: reviewerEmail,
        reviewed_at: reviewedAt,
        signature_data_url: reviewerSignature,
        comments: comments || null,
      })
      .eq("docket_id", docketId)
      .eq("stage", "bc")
      .eq("revision", approvalRevision)
      .eq("status", "pending");

    if (bcApprovalUpdateError) {
      throw new Error(
        `BC approval record could not be completed: ${bcApprovalUpdateError.message}`,
      );
    }

    const {
      data: docketUpdateData,
      error: docketUpdateError,
    } = await admin
      .from("tower_daily_dockets")
      .update({
        approval_status: "client_pending",
        approval_revision: approvalRevision,
        bc_approved_at: reviewedAt,
        bc_approved_by: user.id,
        bc_approved_name: reviewerName,
        bc_approved_email: reviewerEmail,

        draft_sharepoint_site_id:
          project.sharepoint_site_id ?? null,
        draft_sharepoint_drive_id:
          project.sharepoint_drive_id,
        draft_sharepoint_folder_id:
          published.folder.id,
        draft_sharepoint_item_id:
          published.item.id,
        draft_sharepoint_web_url:
          published.item.webUrl ?? null,
        draft_pdf_file_name:
          published.fileName,
        draft_pdf_generated_at:
          reviewedAt,

        sharepoint_site_id:
          project.sharepoint_site_id ?? null,
        sharepoint_drive_id:
          project.sharepoint_drive_id,
        sharepoint_folder_id:
          published.folder.id,
        sharepoint_item_id:
          published.item.id,
        sharepoint_web_url:
          published.item.webUrl ?? null,
        sharepoint_synced_at:
          reviewedAt,
        sharepoint_sync_status:
          "published",
        sharepoint_sync_error:
          null,
      })
      .eq("id", docketId)
      .in("approval_status", [
        "submitted_bc",
        "client_changes_requested",
      ])
      .eq("approval_revision", approvalRevision)
      .select("id,approval_status,approval_revision")
      .maybeSingle();

    if (docketUpdateError) {
      throw new Error(
        `The draft PDF was uploaded to SharePoint, but TTTracker could not save the draft reference: ${docketUpdateError.message}`,
      );
    }

    if (!docketUpdateData) {
      throw new Error(
        "The Daily Docket changed while BC approval was being completed. The draft PDF was uploaded, but the approval state was not overwritten.",
      );
    }

    await recordWorkflowEvents(admin, [
        {
          docket_id: docketId,
          project_id: docket.project_id,
          event_type: "bc_approved",
          revision: approvalRevision,
          performed_by: user.id,
          performed_by_name: reviewerName,
          performed_by_email: reviewerEmail,
          comments: comments || null,
          metadata: {
            reviewer_signature_captured: Boolean(reviewerSignature),
            from_revision: currentRevision,
            revision: approvalRevision,
            reviewer_made_changes: reviewerMadeChanges,
            corrected_client_change_request:
              reviewStatus === "client_changes_requested",
          },
        },
        {
          docket_id: docketId,
          project_id: docket.project_id,
          event_type: "draft_published_to_sharepoint",
          revision: approvalRevision,
          performed_by: user.id,
          performed_by_name: reviewerName,
          performed_by_email: reviewerEmail,
          comments: published.item.webUrl ?? null,
          metadata: {
            sharepoint_item_id: published.item.id,
            sharepoint_folder_id: published.folder.id,
            file_name: published.fileName,
            web_url: published.item.webUrl ?? null,
          },
        },
        {
          docket_id: docketId,
          project_id: docket.project_id,
          event_type: "client_approval_requested",
          revision: approvalRevision,
          performed_by: user.id,
          performed_by_name: reviewerName,
          performed_by_email: reviewerEmail,
          metadata: {
            client_recipient_count: approvalLinks.length,
            token_expires_at: tokenExpiry,
          },
        },
      ]);


    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      new URL(request.url).origin;

    const clientEmailFailures: string[] = [];

    const clientOperationalSummary = buildClientOperationalSummaryHtml({
      docket: docketForPdf,
      labour: bundle.labour as Array<Record<string, unknown>>,
      plant: bundle.plant as Array<Record<string, unknown>>,
      delays: bundle.delays as Array<Record<string, unknown>>,
      materialEvents: bundle.materialEvents as Array<Record<string, unknown>>,
      clientContentKeys,
    });

    for (const { contact, token } of approvalLinks) {
      const approvalUrl =
        `${origin}/docket-approval/${encodeURIComponent(token)}`;
      const pdfUrl =
        `${origin}/api/daily-dockets/client/${encodeURIComponent(token)}/pdf`;

      try {
        await sendDailyDocketEmail({
          to: [contact.email],
          subject: `Daily Docket approval required - ${published.towerName} - ${published.docketDate} - R${String(approvalRevision).padStart(2, "0")}`,
          html: docketEmailShell(
            "Daily Docket approval required",
            `
              <p>Good afternoon,</p>
              <p>Please see below BC’s daily site update for your review and approval.</p>

              <table role="presentation" style="width:100%;border-collapse:collapse;margin:20px 0">
                <tr>
                  <td style="padding:7px 0;color:#64748b;width:140px">Project</td>
                  <td style="padding:7px 0;font-weight:600">
                    ${escapeHtml(project.project_number || "")}
                    ${escapeHtml(project.name || "")}
                  </td>
                </tr>
                <tr>
                  <td style="padding:7px 0;color:#64748b">Tower</td>
                  <td style="padding:7px 0;font-weight:600">${escapeHtml(published.towerName)}</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;color:#64748b">Date</td>
                  <td style="padding:7px 0">${escapeHtml(published.docketDate)}</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;color:#64748b">Revision</td>
                  <td style="padding:7px 0">R${String(approvalRevision).padStart(2, "0")}</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;color:#64748b">BC Approved By</td>
                  <td style="padding:7px 0">${escapeHtml(reviewerName || reviewerEmail || "BC Reviewer")}</td>
                </tr>
              </table>

              ${clientOperationalSummary}

              <p style="margin:24px 0 8px">
                <a
                  href="${escapeHtml(approvalUrl)}"
                  style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;margin-right:8px"
                >
                  Review &amp; Approve
                </a>

                <a
                  href="${escapeHtml(pdfUrl)}"
                  style="display:inline-block;background:#ffffff;color:#0f172a;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:700;border:1px solid #cbd5e1"
                >
                  View Daily Docket PDF
                </a>
              </p>

              <p style="margin-top:18px;color:#64748b;font-size:13px">
                This secure approval link expires in 14 days.
              </p>
            `,
          ),
        });
      } catch (emailError) {
        console.error(
          `Client Daily Docket approval email failed for ${contact.email}`,
          emailError,
        );
        clientEmailFailures.push(contact.email);
      }
    }

    return NextResponse.json({
      success: true,
      status: "client_pending",
      revision: approvalRevision,
      clientRecipients: approvalLinks.length,
      clientEmailsSent: approvalLinks.length - clientEmailFailures.length,
      warning:
        clientEmailFailures.length > 0
          ? "BC approval completed and the draft PDF was saved, but one or more client approval emails could not be sent."
          : null,
      draft: {
        fileName: published.fileName,
        webUrl: published.item.webUrl ?? null,
      },
    });
  } catch (error) {
    console.error("DAILY DOCKET BC REVIEW ERROR", error);

    try {
      const { docketId } = await context.params;
      const admin = createDocketAdminSupabase();

      const { data: currentDocket } = await admin
        .from("tower_daily_dockets")
        .select(
          "approval_status,draft_sharepoint_item_id,sharepoint_sync_status",
        )
        .eq("id", docketId)
        .maybeSingle();

      const alreadyPublished =
        currentDocket?.approval_status === "client_pending" &&
        Boolean(currentDocket?.draft_sharepoint_item_id);

      if (!alreadyPublished) {
        await admin
          .from("tower_daily_dockets")
          .update({
            sharepoint_sync_status: "failed",
            sharepoint_sync_error:
              error instanceof Error
                ? error.message
                : "Daily Docket BC review failed.",
          })
          .eq("id", docketId);
      }
    } catch (statusError) {
      console.error(
        "DAILY DOCKET BC REVIEW STATUS ERROR",
        statusError,
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "Daily Docket review failed.";

    if (message === "AUTH_REQUIRED") {
      return NextResponse.json(
        { error: "You must be logged in." },
        { status: 401 },
      );
    }

    if (message === "PROJECT_FORBIDDEN") {
      return NextResponse.json(
        { error: "You do not have access to this project." },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
