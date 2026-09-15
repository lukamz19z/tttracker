import { NextResponse } from "next/server";

import {
  requireTrainingUser,
  trainingApiError,
  userCanReviewTraining,
} from "@/lib/training/server";
import { publishApprovedTrainingRecord } from "@/lib/training/sharepoint";
import { createTrainingNotifications } from "@/lib/training/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ recordId: string }>;
};

type ReviewAction = "approve" | "request_changes" | "reject";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

type ApprovedRecordStatusInput = {
  does_not_expire?: boolean | null;
  expiry_date?: string | null;
};

function statusForApprovedRecord(
  record: ApprovedRecordStatusInput,
) {
  if (record.does_not_expire || !record.expiry_date) return "current";

  const expiry = new Date(
    `${record.expiry_date.slice(0, 10)}T23:59:59`,
  );

  if (Number.isNaN(expiry.getTime())) return "current";

  return expiry.getTime() < Date.now() ? "expired" : "current";
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { recordId } = await context.params;
    const { service, identity } = await requireTrainingUser(request);

    const body = (await request.json()) as {
      action?: ReviewAction;
      comment?: string;
    };

    const action = clean(body.action) as ReviewAction;
    const comment = clean(body.comment) || null;

    if (!["approve", "request_changes", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "Select a valid review action." },
        { status: 400 },
      );
    }

    if (
      (action === "request_changes" || action === "reject") &&
      !comment
    ) {
      return NextResponse.json(
        {
          error:
            action === "reject"
              ? "Enter the reason for rejection."
              : "Describe the changes required.",
        },
        { status: 400 },
      );
    }

    const { data: record, error: recordError } = await service
      .from("employee_training_records")
      .select("*")
      .eq("id", recordId)
      .maybeSingle();

    if (recordError) throw new Error(recordError.message);
    if (!record) {
      return NextResponse.json(
        { error: "Training record could not be found." },
        { status: 404 },
      );
    }

    if (
      !["pending_review", "changes_required"].includes(
        clean(record.workflow_status),
      )
    ) {
      return NextResponse.json(
        {
          error: `This record is already ${clean(
            record.workflow_status,
          ) || "processed"}.`,
        },
        { status: 409 },
      );
    }

    const { data: trainingType, error: typeError } = await service
      .from("training_types")
      .select("id,name,category_id")
      .eq("id", record.training_type_id)
      .maybeSingle();

    if (typeError) throw new Error(typeError.message);

    const allowed = await userCanReviewTraining({
      service,
      identity,
      trainingTypeId: clean(record.training_type_id) || null,
      categoryId: clean(trainingType?.category_id) || null,
    });

    if (!allowed) throw new Error("REVIEW_FORBIDDEN");

    const { data: employee, error: employeeError } = await service
      .from("employees")
      .select("id,full_name,user_id")
      .eq("id", record.employee_id)
      .maybeSingle();

    if (employeeError) throw new Error(employeeError.message);

    const now = new Date().toISOString();

    if (action === "approve") {
      // Publish first. If SharePoint fails, the record stays pending so the
      // reviewer can retry without losing the staged evidence.
      const { count: documentCount, error: countError } = await service
        .from("employee_training_documents")
        .select("id", { count: "exact", head: true })
        .eq("training_record_id", recordId)
        .eq("active", true);

      if (countError) throw new Error(countError.message);

      if ((documentCount ?? 0) > 0) {
        await publishApprovedTrainingRecord({
          service,
          recordId,
        });
      }

      if (record.supersedes_record_id) {
        const { error: supersedeError } = await service
          .from("employee_training_records")
          .update({
            superseded_at: now,
            superseded_by_record_id: recordId,
            current_version: false,
            record_status: "superseded",
            updated_at: now,
          })
          .eq("id", record.supersedes_record_id)
          .eq("employee_id", record.employee_id);

        if (supersedeError) throw new Error(supersedeError.message);
      }

      const { error: approveError } = await service
        .from("employee_training_records")
        .update({
          workflow_status: "approved",
          record_status: statusForApprovedRecord(record),
          review_comment: comment,
          reviewed_at: now,
          reviewed_by_user_id: identity.userId,
          reviewed_by_name: identity.name,
          reviewed_by_email: identity.email,
          approved_at: now,
          current_version: true,
          updated_at: now,
        })
        .eq("id", recordId);

      if (approveError) throw new Error(approveError.message);

      let notificationWarning: string | null = null;

      if (employee?.user_id) {
        try {
          await createTrainingNotifications({
            service,
            userIds: [employee.user_id],
            eventType: "training_record_approved",
            title: "Training record approved",
            message: `${trainingType?.name || record.training_name} has been approved and added to your training profile.`,
            severity: "success",
            actionRoute: "/profile",
            actionParams: { training_record_id: recordId },
            sourceRecordId: recordId,
          });
        } catch (error) {
          console.error("Training approval notification failed", error);

          const notificationError =
            error instanceof Error
              ? error.message
              : String(error ?? "Unknown notification error");

          notificationWarning =
            `The record was approved and published, but the employee notification could not be sent: ${notificationError}`;
        }
      }

      return NextResponse.json({
        success: true,
        action,
        workflowStatus: "approved",
        notificationWarning,
      });
    }

    const workflowStatus =
      action === "request_changes" ? "changes_required" : "rejected";
    const recordStatus =
      action === "request_changes" ? "changes_required" : "rejected";

    const { error: updateError } = await service
      .from("employee_training_records")
      .update({
        workflow_status: workflowStatus,
        record_status: recordStatus,
        review_comment: comment,
        reviewed_at: now,
        reviewed_by_user_id: identity.userId,
        reviewed_by_name: identity.name,
        reviewed_by_email: identity.email,
        current_version: action !== "reject",
        updated_at: now,
      })
      .eq("id", recordId);

    if (updateError) throw new Error(updateError.message);

    let notificationWarning: string | null = null;

    if (employee?.user_id) {
      try {
        await createTrainingNotifications({
          service,
          userIds: [employee.user_id],
          eventType:
            action === "request_changes"
              ? "training_changes_required"
              : "training_record_rejected",
          title:
            action === "request_changes"
              ? "Training evidence needs changes"
              : "Training record rejected",
          message:
            action === "request_changes"
              ? `${trainingType?.name || record.training_name}: ${comment}`
              : `${trainingType?.name || record.training_name} was rejected: ${comment}`,
          severity: "warning",
          actionRoute: "/profile",
          actionParams: {
            training_record_id: recordId,
            review_comment: comment,
          },
          sourceRecordId: recordId,
        });
      } catch (error) {
        console.error("Training review outcome notification failed", error);

        const notificationError =
          error instanceof Error
            ? error.message
            : String(error ?? "Unknown notification error");

        notificationWarning =
          `The review action was saved, but the employee notification could not be sent: ${notificationError}`;
      }
    }

    return NextResponse.json({
      success: true,
      action,
      workflowStatus,
      notificationWarning,
    });
  } catch (error) {
    console.error("Training review action route failed", error);

    const apiError = trainingApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
