
import { NextRequest, NextResponse } from "next/server";

import {
  mobileApiError,
  requireMobileUser,
} from "@/lib/mobile/server";
import {
  financeCapabilitiesForUser,
  isDocketReviewerForProject,
} from "@/lib/mobile/approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    kind: string;
    id: string;
  }>;
};

const DOCKET_CLIENT_CONTENT_OPTIONS = [
  ["daily_site_summary", "Daily Site Summary"],
  ["rfi_references", "RFI References"],
  ["progress", "Progress"],
  ["workforce", "Workforce"],
  ["raw_manhours", "Raw Man-hours"],
  ["plant", "Plant"],
  ["mobilisation", "Mobilisation"],
  ["travel", "Travel"],
  ["delays", "Delays"],
  ["missing_materials", "Missing Materials"],
  ["received_materials", "Received Materials"],
  ["bundle_transfers", "Bundle Transfers"],
  ["safety", "Safety"],
] as const;

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { kind, id } = await context.params;
    const { service, identity } =
      await requireMobileUser(request);

    if (kind === "docket") {
      const { data: docket, error } = await service
        .from("tower_daily_dockets")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw new Error(error.message);

      if (!docket) {
        return NextResponse.json(
          { error: "Daily Docket not found." },
          { status: 404 },
        );
      }

      const allowed = await isDocketReviewerForProject(
        service,
        identity.userId,
        String(docket.project_id),
      );

      if (!allowed) {
        return NextResponse.json(
          {
            error:
              "You are not configured to review this Daily Docket.",
          },
          { status: 403 },
        );
      }

      const [
        project,
        tower,
        labour,
        plant,
        delays,
        progress,
        allocations,
        events,
        transfers,
      ] = await Promise.all([
        service
          .from("projects")
          .select("id,name,project_number,client")
          .eq("id", docket.project_id)
          .maybeSingle(),
        service
          .from("towers")
          .select("id,name,line,extra_data")
          .eq("id", docket.tower_id)
          .maybeSingle(),
        service
          .from("tower_docket_labour")
          .select("*")
          .eq("docket_id", id)
          .order("worker_name"),
        service
          .from("tower_docket_plant")
          .select("*")
          .eq("docket_id", id),
        service
          .from("tower_docket_delays")
          .select("*")
          .eq("docket_id", id)
          .order("created_at"),
        service
          .from("tower_docket_progress")
          .select("*")
          .eq("docket_id", id),
        service
          .from("tower_docket_hour_allocations")
          .select("*")
          .eq("docket_id", id)
          .order("created_at"),
        service
          .from("tower_material_events")
          .select(
            "*,tower_material_event_items(*),tower_material_event_people(*),tower_material_event_plant(*)",
          )
          .eq("docket_id", id)
          .order("occurred_at"),
        service
          .from("tower_material_transfers")
          .select("*")
          .or(
            `source_docket_id.eq.${id},destination_docket_id.eq.${id}`,
          )
          .order("transferred_at"),
      ]);

      for (const result of [
        project,
        tower,
        labour,
        plant,
        delays,
        progress,
        allocations,
        events,
        transfers,
      ]) {
        if (result.error) {
          throw new Error(result.error.message);
        }
      }

      return NextResponse.json({
        kind: "docket",
        docket,
        project: project.data,
        tower: tower.data,
        labour: labour.data ?? [],
        plant: plant.data ?? [],
        delays: delays.data ?? [],
        progress: progress.data ?? [],
        allocations: allocations.data ?? [],
        materialEvents: events.data ?? [],
        transfers: transfers.data ?? [],
        clientContentOptions:
          DOCKET_CLIENT_CONTENT_OPTIONS.map(
            ([key, label]) => ({
              key,
              label,
            }),
          ),
      });
    }

    if (kind !== "expense" && kind !== "invoice") {
      return NextResponse.json(
        { error: "Unknown approval type." },
        { status: 404 },
      );
    }

    const submissionType =
      kind === "expense" ? "expense_claim" : "invoice";

    // Load the record before enforcing reviewer authority so the record owner
    // can still open their own Finance submission read-only.
    const {
      data: submission,
      error: submissionError,
    } = await service
      .from("financial_submissions")
      .select("*")
      .eq("id", id)
      .eq("submission_type", submissionType)
      .maybeSingle();

    if (submissionError) {
      throw new Error(submissionError.message);
    }

    if (!submission) {
      return NextResponse.json(
        { error: "Finance submission not found." },
        { status: 404 },
      );
    }

    const finance = await financeCapabilitiesForUser(
      service,
      identity.userId,
    );

    const capability =
      kind === "expense"
        ? finance.expense
        : finance.invoice;

    const isReviewer = Boolean(
      capability.canReviewEdit ||
        capability.canApprove ||
        capability.canMarkPaid,
    );

    let isOwner =
      String(submission.created_by ?? "") ===
        identity.userId ||
      String(submission.submitted_by ?? "") ===
        identity.userId;

    if (
      !isOwner &&
      kind === "expense" &&
      submission.submitted_for_employee_id
    ) {
      const { data: employee, error: employeeError } =
        await service
          .from("employees")
          .select("user_id")
          .eq(
            "id",
            submission.submitted_for_employee_id,
          )
          .maybeSingle();

      if (employeeError) {
        throw new Error(employeeError.message);
      }

      isOwner =
        String(employee?.user_id ?? "") ===
        identity.userId;
    }

    if (!isReviewer && !isOwner) {
      return NextResponse.json(
        {
          error:
            "You do not have access to this Finance submission.",
        },
        { status: 403 },
      );
    }

    const [items, attachments, categories, project] =
      await Promise.all([
        service
          .from("financial_submission_items")
          .select("*")
          .eq("submission_id", id)
          .order("sort_order"),
        service
          .from("financial_attachments")
          .select(
            "id,submission_id,item_id,attachment_type,file_name,content_type,file_size_bytes,uploaded_at",
          )
          .eq("submission_id", id)
          .order("uploaded_at"),
        service
          .from("financial_categories")
          .select("id,name")
          .order("name"),
        submission.project_id
          ? service
              .from("projects")
              .select("id,name,project_number")
              .eq("id", submission.project_id)
              .maybeSingle()
          : Promise.resolve({
              data: null,
              error: null,
            }),
      ]);

    for (const result of [
      items,
      attachments,
      categories,
      project,
    ]) {
      if (result.error) {
        throw new Error(result.error.message);
      }
    }

    return NextResponse.json({
      kind,
      capability,
      viewer: {
        isOwner,
        isReviewer,
        readOnly: !isReviewer,
      },
      submission,
      items: items.data ?? [],
      attachments: attachments.data ?? [],
      categories: categories.data ?? [],
      project: project.data,
    });
  } catch (error) {
    const apiError = mobileApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
