import { NextResponse } from "next/server";

import {
  authUserEmailMap,
  createDocketAdminSupabase,
  getBcReviewerRecipients,
  requireAuthenticatedProjectUser,
  type BcReviewerRecipient,
} from "@/lib/dockets/server";
import {
  docketEmailShell,
  sendDailyDocketEmail,
} from "@/lib/email/daily-dockets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ docketId: string }>;
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
};

type ProjectRow = {
  name: string | null;
  project_number: string | null;
};

type TowerRow = {
  name: string | null;
  tower_number: string | null;
  structure_number: string | null;
};

export async function POST(request: Request, context: RouteContext) {
  const { docketId } = await context.params;

  try {
    const admin = createDocketAdminSupabase();

    const { data: docketData, error: docketError } = await admin
      .from("tower_daily_dockets")
      .select(
        "id,project_id,tower_id,docket_date,crew,leading_hand,approval_status,bc_rep_name",
      )
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

    const currentStatus = docket.approval_status || "draft";

    if (
      ![
        "draft",
        "bc_changes_requested",
        "client_changes_requested",
      ].includes(currentStatus)
    ) {
      return NextResponse.json(
        {
          error:
            "This Daily Docket cannot be submitted for approval in its current status.",
        },
        { status: 409 },
      );
    }

    const reviewers = await getBcReviewerRecipients(
      admin,
      docket.project_id,
    );

    if (reviewers.length === 0) {
      return NextResponse.json(
        {
          error:
            "No Commercial, Supervisor or Admin reviewers with project access were found.",
        },
        { status: 409 },
      );
    }

    const [
      { data: projectData, error: projectError },
      { data: towerData, error: towerError },
    ] = await Promise.all([
      admin
        .from("projects")
        .select("name,project_number")
        .eq("id", docket.project_id)
        .single(),

      admin
        .from("towers")
        .select("name,tower_number,structure_number")
        .eq("id", docket.tower_id)
        .single(),
    ]);

    if (projectError) {
      throw new Error(
        `Project could not be loaded: ${projectError.message}`,
      );
    }

    if (towerError) {
      throw new Error(
        `Tower could not be loaded: ${towerError.message}`,
      );
    }

    const project = projectData as unknown as ProjectRow;
    const tower = towerData as unknown as TowerRow;

    const submitterMap = await authUserEmailMap(admin, [user.id]);
    const submitter = submitterMap.get(user.id);

    const submittedAt = new Date().toISOString();

    const { error: updateError } = await admin
      .from("tower_daily_dockets")
      .update({
        approval_status: "submitted_bc",
        bc_submitted_at: submittedAt,
        bc_submitted_by: user.id,
      })
      .eq("id", docketId);

    if (updateError) {
      throw new Error(
        `Daily Docket could not be submitted: ${updateError.message}`,
      );
    }

    const { error: approvalError } = await admin
      .from("tower_docket_approvals")
      .insert({
        docket_id: docketId,
        project_id: docket.project_id,
        stage: "bc",
        status: "pending",
        submitted_by: user.id,
        submitted_at: submittedAt,
      });

    if (approvalError) {
      throw new Error(
        `Approval record could not be created: ${approvalError.message}`,
      );
    }

    const { error: workflowError } = await admin
      .from("tower_docket_workflow_events")
      .insert({
        docket_id: docketId,
        project_id: docket.project_id,
        event_type: "submitted_for_bc_approval",
        performed_by: user.id,
        performed_by_name:
          submitter?.name ||
          docket.bc_rep_name ||
          docket.leading_hand ||
          null,
        performed_by_email: submitter?.email || null,
      });

    if (workflowError) {
      throw new Error(
        `Workflow history could not be recorded: ${workflowError.message}`,
      );
    }

    const origin =
      process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

    const towerName =
      tower.tower_number ||
      tower.structure_number ||
      tower.name ||
      "Tower";

    const reviewUrl =
      `${origin}/project/${docket.project_id}` +
      `/tower/${docket.tower_id}/dockets/${docketId}`;

    const reviewerEmails = reviewers.map(
      (reviewer: BcReviewerRecipient) => reviewer.email,
    );

    await sendDailyDocketEmail({
      to: reviewerEmails,
      subject: `Daily Docket awaiting approval - ${towerName} - ${docket.docket_date || ""}`,
      html: docketEmailShell(
        "Daily Docket awaiting approval",
        `
          <p>A Daily Docket has been submitted for BC review.</p>

          <table
            role="presentation"
            style="width:100%;border-collapse:collapse;margin:20px 0"
          >
            <tr>
              <td style="padding:7px 0;color:#64748b;width:140px">Project</td>
              <td style="padding:7px 0;font-weight:600">
                ${project.project_number || ""} ${project.name || ""}
              </td>
            </tr>
            <tr>
              <td style="padding:7px 0;color:#64748b">Tower</td>
              <td style="padding:7px 0;font-weight:600">${towerName}</td>
            </tr>
            <tr>
              <td style="padding:7px 0;color:#64748b">Date</td>
              <td style="padding:7px 0">${docket.docket_date || ""}</td>
            </tr>
            <tr>
              <td style="padding:7px 0;color:#64748b">Crew</td>
              <td style="padding:7px 0">${docket.crew || "—"}</td>
            </tr>
            <tr>
              <td style="padding:7px 0;color:#64748b">Leading Hand</td>
              <td style="padding:7px 0">${docket.leading_hand || "—"}</td>
            </tr>
          </table>

          <p style="margin:24px 0 8px">
            <a
              href="${reviewUrl}"
              style="
                display:inline-block;
                background:#2563eb;
                color:#ffffff;
                text-decoration:none;
                padding:12px 18px;
                border-radius:8px;
                font-weight:700;
              "
            >
              Review Daily Docket
            </a>
          </p>
        `,
      ),
    });

    return NextResponse.json({
      success: true,
      status: "submitted_bc",
      reviewers: reviewers.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Submission failed.";

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

    console.error("DAILY DOCKET SUBMIT BC ERROR", error);

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
