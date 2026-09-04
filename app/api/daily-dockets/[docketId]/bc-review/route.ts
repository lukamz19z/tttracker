import { createHash, randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import {
  authUserEmailMap,
  createDocketAdminSupabase,
  requireAuthenticatedProjectUser,
} from "@/lib/dockets/server";
import { isConfiguredBcReviewer } from "@/lib/dockets/reviewers";
import { generateDailyDocketPdf } from "@/lib/dockets/daily-docket-pdf";
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
  bc_submitted_by?: string | null;
  bc_submitted_at?: string | null;
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
    tower.name ||
      tower.tower_number ||
      tower.structure_number ||
      "",
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

  const fileName = baseFileName.replace(/\.pdf$/i, "-DRAFT.pdf");

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

    if ((docket.approval_status || "") !== "submitted_bc") {
      return NextResponse.json(
        {
          error:
            "This Daily Docket is not currently awaiting BC approval.",
        },
        { status: 409 },
      );
    }

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
        .eq("approval_status", "submitted_bc");

      if (docketUpdateError) {
        throw new Error(
          `Daily Docket could not be returned for changes: ${docketUpdateError.message}`,
        );
      }

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
        .eq("status", "pending");

      if (approvalUpdateError) {
        throw new Error(
          `BC approval record could not be updated: ${approvalUpdateError.message}`,
        );
      }

      const { error: workflowError } = await admin
        .from("tower_docket_workflow_events")
        .insert({
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
          metadata: {
            change_requests: changeRequests,
          },
        });

      if (workflowError) {
        throw new Error(
          `Workflow history could not be recorded: ${workflowError.message}`,
        );
      }

      if (docket.bc_submitted_by) {
        const submitterMap = await authUserEmailMap(admin, [
          docket.bc_submitted_by,
        ]);
        const submitter = submitterMap.get(docket.bc_submitted_by);

        if (submitter?.email) {
          const bundle = await loadPdfBundle(admin, docket);
          const project = bundle.project;
          const towerName = String(
            bundle.tower.tower_number ||
              bundle.tower.structure_number ||
              bundle.tower.name ||
              "Tower",
          );

          const origin =
            process.env.NEXT_PUBLIC_APP_URL ||
            new URL(request.url).origin;

          const editUrl =
            `${origin}/project/${docket.project_id}` +
            `/tower/${docket.tower_id}/dockets/${docketId}`;

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

    const bundle = await loadPdfBundle(admin, docket);
    const project = bundle.project;

    await admin
      .from("tower_daily_dockets")
      .update({
        sharepoint_sync_status: "publishing",
        sharepoint_sync_error: null,
      })
      .eq("id", docketId);

    const docketForPdf: DocketRow = {
      ...docket,
      bc_approved_at: reviewedAt,
      bc_approved_by: user.id,
      bc_approved_name: reviewerName,
      bc_approved_email: reviewerEmail,
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
    });

    const published = await publishDraftPdf({
      project,
      tower: bundle.tower,
      docket,
      pdf,
    });

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
      .eq("status", "pending");

    if (bcApprovalUpdateError) {
      throw new Error(
        `BC approval record could not be completed: ${bcApprovalUpdateError.message}`,
      );
    }

    const { error: docketUpdateError } = await admin
      .from("tower_daily_dockets")
      .update({
        approval_status: "client_pending",
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
      .eq("approval_status", "submitted_bc");

    if (docketUpdateError) {
      throw new Error(
        `The draft PDF was uploaded to SharePoint, but TTTracker could not save the draft reference: ${docketUpdateError.message}`,
      );
    }

    const { error: workflowError } = await admin
      .from("tower_docket_workflow_events")
      .insert([
        {
          docket_id: docketId,
          project_id: docket.project_id,
          event_type: "bc_approved",
          performed_by: user.id,
          performed_by_name: reviewerName,
          performed_by_email: reviewerEmail,
          comments: comments || null,
          metadata: {
            reviewer_signature_captured: Boolean(reviewerSignature),
          },
        },
        {
          docket_id: docketId,
          project_id: docket.project_id,
          event_type: "draft_published_to_sharepoint",
          performed_by: user.id,
          performed_by_name: reviewerName,
          performed_by_email: reviewerEmail,
          comments: published.item.webUrl ?? null,
        },
        {
          docket_id: docketId,
          project_id: docket.project_id,
          event_type: "client_approval_requested",
          performed_by: user.id,
          performed_by_name: reviewerName,
          performed_by_email: reviewerEmail,
        },
      ]);

    if (workflowError) {
      throw new Error(
        `Workflow history could not be recorded: ${workflowError.message}`,
      );
    }

    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      new URL(request.url).origin;

    const clientEmailFailures: string[] = [];

    for (const { contact, token } of approvalLinks) {
      const approvalUrl =
        `${origin}/docket-approval/${encodeURIComponent(token)}`;
      const pdfUrl =
        `${origin}/api/daily-dockets/client/${encodeURIComponent(token)}/pdf`;

      try {
        await sendDailyDocketEmail({
          to: [contact.email],
          subject: `Daily Docket approval required - ${published.towerName} - ${published.docketDate}`,
          html: docketEmailShell(
            "Daily Docket approval required",
            `
              <p>A Daily Docket is ready for your review and approval.</p>

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
                  <td style="padding:7px 0;color:#64748b">BC Approved By</td>
                  <td style="padding:7px 0">${escapeHtml(reviewerName || reviewerEmail || "BC Reviewer")}</td>
                </tr>
              </table>

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
