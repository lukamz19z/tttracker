import { NextResponse } from "next/server";

import {
  clean,
  requireTrainingUser,
  reviewerRecipientsFor,
  trainingApiError,
  userCanReviewTraining,
} from "@/lib/training/server";
import { createTrainingNotifications } from "@/lib/training/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ recordId: string }>;
};

type ExistingNotificationRow = {
  user_id: string | null;
};

export async function POST(
  request: Request,
  context: RouteContext,
) {
  try {
    const { recordId } = await context.params;
    const { service, identity } =
      await requireTrainingUser(request);

    const { data: record, error: recordError } = await service
      .from("employee_training_records")
      .select(
        "id,employee_id,training_type_id,training_name,workflow_status,submitted_by_user_id",
      )
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
          error:
            "Only records waiting for review can send reviewer notifications.",
        },
        { status: 409 },
      );
    }

    const trainingTypeId = clean(record.training_type_id);

    if (!trainingTypeId) {
      return NextResponse.json(
        {
          error:
            "This Training record is not linked to a Training Type.",
        },
        { status: 400 },
      );
    }

    const { data: trainingType, error: typeError } =
      await service
        .from("training_types")
        .select("id,name,category_id")
        .eq("id", trainingTypeId)
        .maybeSingle();

    if (typeError) throw new Error(typeError.message);

    const allowed = await userCanReviewTraining({
      service,
      identity,
      trainingTypeId,
      categoryId: clean(trainingType?.category_id) || null,
    });

    if (!allowed) {
      throw new Error("REVIEW_FORBIDDEN");
    }

    const { data: employee, error: employeeError } =
      await service
        .from("employees")
        .select("id,full_name,user_id")
        .eq("id", record.employee_id)
        .maybeSingle();

    if (employeeError) throw new Error(employeeError.message);

    const recipients = (
      await reviewerRecipientsFor({
        service,
        trainingTypeId,
        categoryId: clean(trainingType?.category_id) || null,
      })
    ).filter((recipient) => Boolean(recipient.userId));

    if (recipients.length === 0) {
      return NextResponse.json(
        {
          error:
            "No reviewer rule currently matches this Training record. Add a reviewer in Workflow & SharePoint first.",
        },
        { status: 400 },
      );
    }

    // The submitter can still be a valid reviewer and can still approve the
    // record, but they do not need a notification about their own submission.
    // Other matching reviewers are still notified normally.
    const notificationRecipients = recipients.filter(
      (recipient) =>
        recipient.userId !== clean(record.submitted_by_user_id),
    );

    if (notificationRecipients.length === 0) {
      return NextResponse.json({
        success: true,
        notified: 0,
        alreadyNotified: 0,
        pushAttempted: 0,
        emailSent: 0,
        message:
          "The submitter is the only matching reviewer, so no self-notification was sent. The record remains available in the Verification Queue.",
      });
    }

    const recipientIds = notificationRecipients.map(
      (recipient) => recipient.userId,
    );

    const { data: existingData, error: existingError } =
      await service
        .from("user_notifications")
        .select("user_id")
        .eq("event_type", "training_review_required")
        .eq("action_route", "/people/training/verification")
        .contains("action_params", {
          training_record_id: recordId,
        })
        .in("user_id", recipientIds);

    if (existingError) {
      throw new Error(existingError.message);
    }

    const existingRows =
      (existingData ?? []) as ExistingNotificationRow[];

    const alreadyNotified = new Set(
      existingRows
        .map((row) => clean(row.user_id))
        .filter(Boolean),
    );

    const missingInAppRecipients = notificationRecipients.filter(
      (recipient) =>
        recipient.receivesInApp &&
        !alreadyNotified.has(recipient.userId),
    );

    // Manual "Notify Reviewers" is also the retry mechanism for email/push.
    // An existing in-app notification must NOT prevent the configured reviewer
    // from receiving email or push.
    const inAppIds = missingInAppRecipients.map(
      (recipient) => recipient.userId,
    );
    const pushIds = notificationRecipients
      .filter((recipient) => recipient.receivesPush)
      .map((recipient) => recipient.userId);
    const emailIds = notificationRecipients
      .filter((recipient) => recipient.receivesEmail)
      .map((recipient) => recipient.userId);

    const notificationResult =
      await createTrainingNotifications({
        service,
        userIds: recipientIds,
        inAppUserIds: inAppIds,
        pushUserIds: pushIds,
        emailUserIds: emailIds,
        emailSubject: `Training review required - ${employee?.full_name || "Employee"} - ${trainingType?.name || record.training_name || "Training"}`,
        eventType: "training_review_required",
        title: "Training record requires review",
        message: `${employee?.full_name || "An employee"} submitted ${
          trainingType?.name || record.training_name || "Training"
        } for review.`,
        severity: "warning",
        actionRoute: "/people/training/verification",
        actionParams: {
          training_record_id: recordId,
          employee_id: record.employee_id,
        },
        sourceRecordId: recordId,
      });

    return NextResponse.json({
      success: true,
      notified: recipients.length,
      alreadyNotified: alreadyNotified.size,
      inAppCreated: notificationResult.inApp,
      pushAttempted: notificationResult.pushAttempted,
      emailSent: notificationResult.emailSent,
    });
  } catch (error) {
    console.error("Training reviewer notification failed", error);

    const apiError = trainingApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
