import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { createDocketAdminSupabase } from "@/lib/dockets/server";
import { getBcReviewerRecipients } from "@/lib/dockets/reviewers";
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
  params: Promise<{ token: string }>;
};

type ClientAction = "approve" | "request_changes";

type ClientReviewBody = {
  action?: ClientAction;
  name?: string;
  signatureDataUrl?: string;
  comments?: string;
};

type ApprovalRow = {
  id: string;
  docket_id: string;
  project_id: string;
  stage: string | null;
  status: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  token_expires_at: string | null;
  token_used_at: string | null;
  token_superseded_at: string | null;
  revision: number | null;
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
  bc_signature_data_url?: string | null;
  bc_signed_at?: string | null;
  bc_approved_at?: string | null;
  bc_approved_by?: string | null;
  bc_approved_name?: string | null;
  bc_approved_email?: string | null;
  bc_reviewer_signature_data_url?: string | null;
  bc_approval_signature_data_url?: string | null;
  client_rep_name?: string | null;
  signed_date?: string | null;
  approval_revision?: number | null;
  bc_submitted_by?: string | null;
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
  name: string;
  email: string;
  receives_final: boolean;
  active: boolean;
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

type ClientContentSnapshotRow = {
  content_key: string;
  included: boolean;
};

type ProjectClientContentRow = {
  content_key: string;
  included_by_default: boolean;
};

function isClientContentKey(value: string): value is ClientContentKey {
  return (CLIENT_CONTENT_KEYS as readonly string[]).includes(value);
}

async function loadClientContentKeys({
  admin,
  docketId,
  projectId,
  revision,
}: {
  admin: ReturnType<typeof createDocketAdminSupabase>;
  docketId: string;
  projectId: string;
  revision: number;
}): Promise<ClientContentKey[]> {
  const [snapshotResult, defaultsResult] = await Promise.all([
    admin
      .from("tower_docket_client_content")
      .select("content_key,included")
      .eq("docket_id", docketId)
      .eq("revision", revision),
    admin
      .from("project_docket_client_content")
      .select("content_key,included_by_default")
      .eq("project_id", projectId),
  ]);

  if (snapshotResult.error) {
    throw new Error(
      `Client Daily Docket content snapshot could not be loaded: ${snapshotResult.error.message}`,
    );
  }

  if (defaultsResult.error) {
    throw new Error(
      `Client Daily Docket defaults could not be loaded: ${defaultsResult.error.message}`,
    );
  }

  const snapshotRows = (snapshotResult.data ?? []) as ClientContentSnapshotRow[];

  if (snapshotRows.length > 0) {
    const selected = snapshotRows
      .filter((row) => row.included)
      .map((row) => String(row.content_key ?? "").trim())
      .filter(isClientContentKey);

    if (selected.length === 0) {
      throw new Error(
        `Daily Docket R${String(revision).padStart(2, "0")} has no client-visible sections selected.`,
      );
    }

    return [...new Set(selected)];
  }

  const defaultRows = (defaultsResult.data ?? []) as ProjectClientContentRow[];

  if (defaultRows.length > 0) {
    const selected = defaultRows
      .filter((row) => row.included_by_default)
      .map((row) => String(row.content_key ?? "").trim())
      .filter(isClientContentKey);

    if (selected.length > 0) {
      return [...new Set(selected)];
    }
  }

  // Backward compatibility for approvals created before client-content
  // snapshots/defaults were introduced.
  return [...CLIENT_CONTENT_KEYS];
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function validSignatureDataUrl(value: string) {
  if (!value.startsWith("data:image/png;base64,")) return false;

  // Rough upper bound matching the intended 400 KB signature limit.
  const base64 = value.slice("data:image/png;base64,".length);
  const estimatedBytes = Math.ceil((base64.length * 3) / 4);

  return estimatedBytes > 0 && estimatedBytes <= 400 * 1024;
}

function publicDocketPayload({
  approval,
  docket,
  project,
  tower,
}: {
  approval: ApprovalRow;
  docket: DocketRow;
  project: ProjectRow;
  tower: Record<string, unknown>;
}) {
  return {
    docketId: docket.id,
    status: docket.approval_status,
    docketDate: docket.docket_date,
    crew: docket.crew,
    leadingHand: docket.leading_hand,
    bcRepresentative: docket.bc_rep_name,
    bcApprovedBy: docket.bc_approved_name,
    bcApprovedAt: docket.bc_approved_at,
    project: {
      name: project.name,
      projectNumber: project.project_number,
      client: project.client,
    },
    tower: {
      name: tower.name || "Tower",
    },
    recipient: {
      name: approval.recipient_name,
      email: approval.recipient_email,
    },
    expiresAt: approval.token_expires_at,
    revision:
      approval.revision ??
      Math.max(1, Number(docket.approval_revision ?? 1) || 1),
  };
}

async function loadApproval(
  admin: ReturnType<typeof createDocketAdminSupabase>,
  rawToken: string,
) {
  const hash = tokenHash(rawToken);

  const { data, error } = await admin
    .from("tower_docket_approvals")
    .select(
      "id,docket_id,project_id,stage,status,recipient_name,recipient_email,token_expires_at,token_used_at,token_superseded_at,revision",
    )
    .eq("token_hash", hash)
    .eq("stage", "client")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Client approval link could not be loaded: ${error.message}`,
    );
  }

  return (data ?? null) as ApprovalRow | null;
}

function currentRevision(docket: DocketRow) {
  return Math.max(1, Number(docket.approval_revision ?? 1) || 1);
}

function revisionMismatchReason(
  approval: ApprovalRow,
  docket: DocketRow,
) {
  const approvalRevision = Math.max(1, Number(approval.revision ?? 1) || 1);
  const docketRevision = currentRevision(docket);

  if (approvalRevision !== docketRevision) {
    return "This approval link has been replaced by a newer Daily Docket revision.";
  }

  return null;
}

function approvalUnavailableReason(approval: ApprovalRow | null) {
  if (!approval) return "This approval link is invalid.";

  if (approval.token_superseded_at) {
    return "This approval link has been replaced by a newer approval request.";
  }

  if (approval.token_used_at || approval.status !== "pending") {
    return "This approval link has already been completed.";
  }

  if (
    approval.token_expires_at &&
    new Date(approval.token_expires_at).getTime() < Date.now()
  ) {
    return "This approval link has expired.";
  }

  return null;
}


async function claimApprovalToken(
  admin: ReturnType<typeof createDocketAdminSupabase>,
  approvalId: string,
  claimedAt: string,
) {
  const { data, error } = await admin
    .from("tower_docket_approvals")
    .update({
      token_used_at: claimedAt,
    })
    .eq("id", approvalId)
    .eq("status", "pending")
    .is("token_used_at", null)
    .is("token_superseded_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Client approval link could not be secured: ${error.message}`,
    );
  }

  return Boolean(data?.id);
}

async function releaseApprovalTokenClaim(
  admin: ReturnType<typeof createDocketAdminSupabase>,
  approvalId: string,
  claimedAt: string,
) {
  const { error } = await admin
    .from("tower_docket_approvals")
    .update({
      token_used_at: null,
    })
    .eq("id", approvalId)
    .eq("status", "pending")
    .eq("token_used_at", claimedAt);

  if (error) {
    console.error("Could not release Daily Docket client token claim", error);
  }
}

async function loadBundle(
  admin: ReturnType<typeof createDocketAdminSupabase>,
  docketId: string,
) {
  const { data: docketData, error: docketError } = await admin
    .from("tower_daily_dockets")
    .select("*")
    .eq("id", docketId)
    .single();

  if (docketError || !docketData) {
    throw new Error("Daily Docket could not be found.");
  }

  const docket = docketData as unknown as DocketRow;

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

    admin.from("towers").select("*").eq("id", docket.tower_id).single(),

    admin
      .from("tower_docket_labour")
      .select("*")
      .eq("docket_id", docketId)
      .order("worker_name"),

    admin
      .from("tower_docket_plant")
      .select("*")
      .eq("docket_id", docketId),

    admin
      .from("tower_docket_delays")
      .select("*")
      .eq("docket_id", docketId)
      .order("created_at"),

    admin
      .from("tower_docket_progress")
      .select("*")
      .eq("docket_id", docketId),

    admin
      .from("tower_material_events")
      .select(`
        *,
        tower_material_event_items(*),
        tower_material_event_people(*),
        tower_material_event_plant(*)
      `)
      .eq("docket_id", docketId)
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
    docket,
    project: projectResult.data as unknown as ProjectRow,
    tower: towerResult.data as Record<string, unknown>,
    labour: labourResult.data ?? [],
    plant: plantResult.data ?? [],
    delays: delayResult.data ?? [],
    progress: progressResult.data ?? [],
    materialEvents: materialEventResult.data ?? [],
  };
}

async function publishFinalPdf({
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

  const towerName = String(tower.name || "").trim();

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

  const finalFolder = await ensureDriveFolder({
    driveId: project.sharepoint_drive_id,
    parentItemId: towerFolder.id,
    name: "Final",
  });

  const baseFileName = buildDailyDocketPdfFileName({
    towerName,
    docketDate,
  });

  const revision = Math.max(1, Number(docket.approval_revision ?? 1) || 1);
  const revisionLabel = `R${String(revision).padStart(2, "0")}`;
  const fileName = baseFileName.replace(
    /\.pdf$/i,
    `-${revisionLabel}-FINAL.pdf`,
  );

  const item = await uploadDriveItemContent({
    driveId: project.sharepoint_drive_id,
    parentItemId: finalFolder.id,
    fileName,
    content: pdf,
    contentType: "application/pdf",
  });

  return {
    towerName,
    docketDate,
    fileName,
    folder: finalFolder,
    item,
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;

  try {
    if (!token) {
      return NextResponse.json(
        { error: "Approval token is required." },
        { status: 400 },
      );
    }

    const admin = createDocketAdminSupabase();
    const approval = await loadApproval(admin, token);
    const unavailable = approvalUnavailableReason(approval);

    if (unavailable || !approval) {
      return NextResponse.json(
        { error: unavailable || "This approval link is invalid." },
        { status: 410 },
      );
    }

    const bundle = await loadBundle(admin, approval.docket_id);

    if (bundle.docket.approval_status !== "client_pending") {
      return NextResponse.json(
        {
          error:
            "This Daily Docket is no longer awaiting client approval.",
        },
        { status: 409 },
      );
    }

    const revisionUnavailable = revisionMismatchReason(
      approval,
      bundle.docket,
    );

    if (revisionUnavailable) {
      return NextResponse.json(
        { error: revisionUnavailable },
        { status: 410 },
      );
    }

    return NextResponse.json({
      success: true,
      docket: publicDocketPayload({
        approval,
        docket: bundle.docket,
        project: bundle.project,
        tower: bundle.tower,
      }),
    });
  } catch (error) {
    console.error("DAILY DOCKET CLIENT GET ERROR", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Daily Docket could not be loaded.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;

  let claimedApprovalId: string | null = null;
  let claimedAt: string | null = null;
  let claimAdmin: ReturnType<typeof createDocketAdminSupabase> | null = null;

  try {
    if (!token) {
      return NextResponse.json(
        { error: "Approval token is required." },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as ClientReviewBody;

    if (body.action !== "approve" && body.action !== "request_changes") {
      return NextResponse.json(
        { error: "A valid approval action is required." },
        { status: 400 },
      );
    }

    const name = String(body.name ?? "").trim();
    const comments = String(body.comments ?? "").trim();
    const signatureDataUrl = String(body.signatureDataUrl ?? "").trim();

    if (!name) {
      return NextResponse.json(
        { error: "Enter your name before submitting your response." },
        { status: 400 },
      );
    }

    if (body.action === "request_changes" && !comments) {
      return NextResponse.json(
        { error: "Enter the changes required before returning this Daily Docket." },
        { status: 400 },
      );
    }

    if (body.action === "approve" && !validSignatureDataUrl(signatureDataUrl)) {
      return NextResponse.json(
        {
          error:
            "A valid client signature is required before approving the Daily Docket.",
        },
        { status: 400 },
      );
    }

    const admin = createDocketAdminSupabase();
    const approval = await loadApproval(admin, token);
    const unavailable = approvalUnavailableReason(approval);

    if (unavailable || !approval) {
      return NextResponse.json(
        { error: unavailable || "This approval link is invalid." },
        { status: 410 },
      );
    }

    const bundle = await loadBundle(admin, approval.docket_id);
    const { docket, project, tower } = bundle;

    const approvalRevision = Math.max(
      1,
      Number(approval.revision ?? currentRevision(docket)) || 1,
    );

    if (docket.approval_status !== "client_pending") {
      return NextResponse.json(
        {
          error:
            "This Daily Docket is no longer awaiting client approval.",
        },
        { status: 409 },
      );
    }

    const revisionUnavailable = revisionMismatchReason(approval, docket);

    if (revisionUnavailable) {
      return NextResponse.json(
        { error: revisionUnavailable },
        { status: 410 },
      );
    }

    const clientContentKeys = await loadClientContentKeys({
      admin,
      docketId: docket.id,
      projectId: docket.project_id,
      revision: approvalRevision,
    });

    const now = new Date().toISOString();

    const tokenClaimed = await claimApprovalToken(
      admin,
      approval.id,
      now,
    );

    if (!tokenClaimed) {
      return NextResponse.json(
        {
          error:
            "This approval link has already been used or another approval response is being processed.",
        },
        { status: 409 },
      );
    }

    claimedApprovalId = approval.id;
    claimedAt = now;
    claimAdmin = admin;

    const recipientEmail =
      String(approval.recipient_email ?? "").trim().toLowerCase() || null;

    if (body.action === "request_changes") {
      const { error: docketUpdateError } = await admin
        .from("tower_daily_dockets")
        .update({
          approval_status: "client_changes_requested",
        })
        .eq("id", docket.id)
        .eq("approval_status", "client_pending");

      if (docketUpdateError) {
        throw new Error(
          `Daily Docket could not be returned for changes: ${docketUpdateError.message}`,
        );
      }

      const { error: approvalUpdateError } = await admin
        .from("tower_docket_approvals")
        .update({
          status: "changes_requested",
          reviewed_by_name: name,
          reviewed_by_email: recipientEmail,
          reviewed_at: now,
          comments: comments || null,
        })
        .eq("id", approval.id)
        .eq("status", "pending");

      if (approvalUpdateError) {
        throw new Error(
          `Client approval record could not be updated: ${approvalUpdateError.message}`,
        );
      }

      // All other client links for this version must stop working.
      const { error: supersedeError } = await admin
        .from("tower_docket_approvals")
        .update({
          token_superseded_at: now,
          status: "superseded",
        })
        .eq("docket_id", docket.id)
        .eq("stage", "client")
        .eq("status", "pending")
        .neq("id", approval.id);

      if (supersedeError) {
        throw new Error(
          `Other client approval links could not be closed: ${supersedeError.message}`,
        );
      }

      const { error: workflowError } = await admin
        .from("tower_docket_workflow_events")
        .insert({
          docket_id: docket.id,
          project_id: docket.project_id,
          event_type: "client_changes_requested",
          revision: approvalRevision,
          performed_by: null,
          performed_by_name: name,
          performed_by_email: recipientEmail,
          comments: comments || null,
          metadata: {
            action_required_by: "bc_reviewer",
            client_approval_id: approval.id,
          },
        });

      if (workflowError) {
        throw new Error(
          `Workflow history could not be recorded: ${workflowError.message}`,
        );
      }

      const reviewers = await getBcReviewerRecipients(
        admin,
        docket.project_id,
      );

      let reviewerEmailWarning: string | null = null;

      if (reviewers.length > 0) {
        const origin =
          process.env.NEXT_PUBLIC_APP_URL ||
          new URL(request.url).origin;

        const reviewUrl =
          `${origin}/project/${docket.project_id}` +
          `/tower/${docket.tower_id}/dockets/${docket.id}/review`;

        const towerName = String(tower.name || "Tower");

        try {
          await sendDailyDocketEmail({
            to: reviewers.map((reviewer) => reviewer.email),
            subject: `Client requested Daily Docket changes - ${towerName} - ${docket.docket_date || ""}`,
            html: docketEmailShell(
              "Client requested Daily Docket changes",
              `
                <p>The client has requested changes to a Daily Docket.</p>

                <table role="presentation" style="width:100%;border-collapse:collapse;margin:20px 0">
                  <tr>
                    <td style="padding:7px 0;color:#64748b;width:150px">Project</td>
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
                    <td style="padding:7px 0;color:#64748b">Revision</td>
                    <td style="padding:7px 0">R${String(
                      approval.revision ??
                        Math.max(1, Number(docket.approval_revision ?? 1) || 1),
                    ).padStart(2, "0")}</td>
                  </tr>
                  <tr>
                    <td style="padding:7px 0;color:#64748b">Client Representative</td>
                    <td style="padding:7px 0">${escapeHtml(name)}</td>
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

                <p style="margin:24px 0 8px">
                  <a
                    href="${escapeHtml(reviewUrl)}"
                    style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700"
                  >
                    Review Client Changes
                  </a>
                </p>
              `,
            ),
          });
        } catch (emailError) {
          console.error(
            "Client change request was saved but BC reviewer email failed",
            emailError,
          );
          reviewerEmailWarning =
            "The change request was saved, but the BC notification email could not be sent.";
        }
      }

      claimedApprovalId = null;
      claimedAt = null;
      claimAdmin = null;

      return NextResponse.json({
        success: true,
        status: "client_changes_requested",
        warning: reviewerEmailWarning,
      });
    }

    /*
      APPROVAL:
      Generate the final PDF with the client signature/approval details,
      publish it to SharePoint /Final, then close every outstanding token.
    */
    const { data: bcApprovalData, error: bcApprovalError } = await admin
      .from("tower_docket_approvals")
      .select(
        "signature_data_url,reviewed_by_name,reviewed_by_email,reviewed_at,status",
      )
      .eq("docket_id", docket.id)
      .eq("stage", "bc")
      .eq("revision", approvalRevision)
      .eq("status", "approved")
      .maybeSingle();

    if (bcApprovalError) {
      throw new Error(
        `The BC approval record could not be loaded for the final PDF: ${bcApprovalError.message}`,
      );
    }

    if (!bcApprovalData) {
      throw new Error(
        "The approved BC review record for this Daily Docket revision could not be found.",
      );
    }

    const finalDocketForPdf: DocketRow = {
      ...docket,
      approval_revision: approvalRevision,
      bc_approved_at: bcApprovalData.reviewed_at || docket.bc_approved_at,
      bc_approved_name:
        bcApprovalData.reviewed_by_name || docket.bc_approved_name,
      bc_approved_email:
        bcApprovalData.reviewed_by_email || docket.bc_approved_email,
      bc_reviewer_signature_data_url:
        bcApprovalData.signature_data_url || null,
      bc_approval_signature_data_url:
        bcApprovalData.signature_data_url || null,
      client_rep_name: name,
      signed_date: now.slice(0, 10),
      client_approved_at: now,
      client_approved_name: name,
      client_approved_email: recipientEmail,
      client_signature_data_url: signatureDataUrl,
      finalised_at: now,
      approval_status: "final",
    };

    await admin
      .from("tower_daily_dockets")
      .update({
        sharepoint_sync_status: "publishing",
        sharepoint_sync_error: null,
      })
      .eq("id", docket.id);

    const branding = await loadSystemPdfBranding();

    const finalPdf = generateDailyDocketPdf({
      project,
      tower,
      docket: finalDocketForPdf,
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

    const published = await publishFinalPdf({
      project,
      tower,
      docket: finalDocketForPdf,
      pdf: finalPdf,
    });

    const { data: finalisedDocket, error: docketUpdateError } = await admin
      .from("tower_daily_dockets")
      .update({
        approval_status: "final",
        approval_revision: approvalRevision,

        client_submitted_at: now,
        client_approved_at: now,
        client_approved_name: name,
        client_approved_email: recipientEmail,
        client_signature_data_url: signatureDataUrl,

        // Compatibility fields already used by the existing docket UI/PDF.
        client_rep_name: name,
        signed_date: now.slice(0, 10),

        finalised_at: now,

        final_pdf_file_name: published.fileName,
        final_pdf_generated_at: now,
        final_sharepoint_site_id: project.sharepoint_site_id ?? null,
        final_sharepoint_drive_id: project.sharepoint_drive_id,
        final_sharepoint_folder_id: published.folder.id,
        final_sharepoint_item_id: published.item.id,
        final_sharepoint_web_url: published.item.webUrl ?? null,

        // Existing generic SharePoint fields point at the current controlled
        // copy once the docket is final.
        pdf_file_name: published.fileName,
        pdf_generated_at: now,
        sharepoint_site_id: project.sharepoint_site_id ?? null,
        sharepoint_drive_id: project.sharepoint_drive_id,
        sharepoint_folder_id: published.folder.id,
        sharepoint_item_id: published.item.id,
        sharepoint_web_url: published.item.webUrl ?? null,
        docket_file_url: published.item.webUrl ?? null,
        sharepoint_synced_at: now,
        sharepoint_sync_status: "published",
        sharepoint_sync_error: null,
      })
      .eq("id", docket.id)
      .eq("approval_status", "client_pending")
      .eq("approval_revision", approvalRevision)
      .select("id,approval_status")
      .maybeSingle();

    if (docketUpdateError) {
      await releaseApprovalTokenClaim(admin, approval.id, now);

      throw new Error(
        `The final PDF was uploaded to SharePoint, but TTTracker could not save the final approval: ${docketUpdateError.message}`,
      );
    }

    if (!finalisedDocket) {
      claimedApprovalId = null;
      claimedAt = null;
      claimAdmin = null;

      return NextResponse.json(
        {
          error:
            "This Daily Docket has already been finalised by another approval response.",
        },
        { status: 409 },
      );
    }

    claimedApprovalId = null;
    claimedAt = null;
    claimAdmin = null;

    const finalWarnings: string[] = [];

    const { error: approvalUpdateError } = await admin
      .from("tower_docket_approvals")
      .update({
        status: "approved",
        reviewed_by_name: name,
        reviewed_by_email: recipientEmail,
        reviewed_at: now,
        comments: comments || null,
        client_signature_data_url: signatureDataUrl,
        client_signed_name: name,
        client_signed_email: recipientEmail,
        client_signed_at: now,
      })
      .eq("id", approval.id)
      .eq("status", "pending");

    if (approvalUpdateError) {
      console.error(
        "Daily Docket finalised but client approval record could not be completed",
        approvalUpdateError,
      );
      finalWarnings.push(
        "The Daily Docket was finalised, but its approval audit record could not be fully updated.",
      );
    }

    const { error: supersedeError } = await admin
      .from("tower_docket_approvals")
      .update({
        token_superseded_at: now,
        status: "superseded",
      })
      .eq("docket_id", docket.id)
      .eq("stage", "client")
      .eq("status", "pending")
      .neq("id", approval.id);

    if (supersedeError) {
      console.error(
        "Daily Docket finalised but other client approval links could not be superseded",
        supersedeError,
      );
      finalWarnings.push(
        "The Daily Docket was finalised, but one or more unused approval links could not be closed.",
      );
    }

    const { error: workflowError } = await admin
      .from("tower_docket_workflow_events")
      .insert([
        {
          docket_id: docket.id,
          project_id: docket.project_id,
          event_type: "client_approved",
          revision: approvalRevision,
          performed_by: null,
          performed_by_name: name,
          performed_by_email: recipientEmail,
          comments: comments || null,
          metadata: {
            client_approval_id: approval.id,
            client_content: clientContentKeys,
          },
        },
        {
          docket_id: docket.id,
          project_id: docket.project_id,
          event_type: "final_published_to_sharepoint",
          revision: approvalRevision,
          performed_by: null,
          performed_by_name: name,
          performed_by_email: recipientEmail,
          comments: published.item.webUrl ?? null,
          metadata: {
            sharepoint_item_id: published.item.id,
            sharepoint_folder_id: published.folder.id,
            file_name: published.fileName,
            web_url: published.item.webUrl ?? null,
            client_content: clientContentKeys,
          },
        },
      ]);

    if (workflowError) {
      console.error(
        "Daily Docket finalised but workflow history could not be recorded",
        workflowError,
      );
      finalWarnings.push(
        "The Daily Docket was finalised, but part of the workflow history could not be recorded.",
      );
    }

    let finalContacts: ClientContactRow[] = [];

    const { data: finalContactsData, error: finalContactsError } =
      await admin
        .from("project_docket_contacts")
        .select("name,email,receives_final,active")
        .eq("project_id", docket.project_id)
        .eq("active", true)
        .eq("receives_final", true);

    if (finalContactsError) {
      console.error(
        "Daily Docket finalised but final client recipients could not be loaded",
        finalContactsError,
      );
      finalWarnings.push(
        "The Daily Docket was finalised, but final client recipients could not be loaded.",
      );
    } else {
      finalContacts = (finalContactsData ?? []) as ClientContactRow[];
    }

    let reviewers: Awaited<ReturnType<typeof getBcReviewerRecipients>> = [];

    try {
      reviewers = await getBcReviewerRecipients(
        admin,
        docket.project_id,
      );
    } catch (reviewerError) {
      console.error(
        "Daily Docket finalised but BC final recipients could not be loaded",
        reviewerError,
      );
      finalWarnings.push(
        "The Daily Docket was finalised, but BC final recipients could not be loaded.",
      );
    }

    let preparerEmail: string | null = null;

    if (docket.bc_submitted_by) {
      const { data: preparerAuth } = await admin.auth.admin.getUserById(
        docket.bc_submitted_by,
      );
      preparerEmail =
        String(preparerAuth?.user?.email ?? "").trim().toLowerCase() || null;
    }

    const finalRecipients = [
      ...new Set(
        [
          ...finalContacts.map((contact) => contact.email),
          ...reviewers.map((reviewer) => reviewer.email),
          preparerEmail,
        ]
          .map((email) => String(email || "").trim().toLowerCase())
          .filter(Boolean),
      ),
    ];

    if (finalRecipients.length > 0) {
      try {
        await sendDailyDocketEmail({
          to: finalRecipients,
          subject: `Approved Daily Docket - ${published.towerName} - ${published.docketDate} - R${String(approvalRevision).padStart(2, "0")}`,
          html: docketEmailShell(
            "Daily Docket approved",
            `
              <p>The Daily Docket has been approved and finalised.</p>

              <table role="presentation" style="width:100%;border-collapse:collapse;margin:20px 0">
                <tr>
                  <td style="padding:7px 0;color:#64748b;width:150px">Project</td>
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
                  <td style="padding:7px 0;color:#64748b">Client Representative</td>
                  <td style="padding:7px 0">${escapeHtml(name)}</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;color:#64748b">Approved</td>
                  <td style="padding:7px 0">${escapeHtml(new Date(now).toLocaleString("en-AU"))}</td>
                </tr>
              </table>

              <p>The approved Daily Docket is attached for your records.</p>
            `,
          ),
          attachments: [
            {
              name: published.fileName,
              contentType: "application/pdf",
              contentBytes: Buffer.from(finalPdf).toString("base64"),
            },
          ],
        });
      } catch (emailError) {
        console.error(
          "Daily Docket finalised but final email distribution failed",
          emailError,
        );
        finalWarnings.push(
          "The Daily Docket was approved and saved to SharePoint, but the final email could not be sent.",
        );
      }
    }

    return NextResponse.json({
      success: true,
      status: "final",
      revision: approvalRevision,
      warning: finalWarnings.length > 0 ? finalWarnings.join(" ") : null,
      final: {
        fileName: published.fileName,
        webUrl: published.item.webUrl ?? null,
      },
    });
  } catch (error) {
    if (claimAdmin && claimedApprovalId && claimedAt) {
      await releaseApprovalTokenClaim(
        claimAdmin,
        claimedApprovalId,
        claimedAt,
      );
    }

    console.error("DAILY DOCKET CLIENT APPROVAL ERROR", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Daily Docket approval could not be completed.",
      },
      { status: 500 },
    );
  }
}
