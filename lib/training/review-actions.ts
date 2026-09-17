import {
  clean,
  type TrainingIdentity,
  type createTrainingServiceClient,
  userCanReviewTraining,
} from "@/lib/training/server";
import { createTrainingNotifications } from "@/lib/training/notifications";
import {
  archiveSupersededTrainingRecord,
  publishApprovedTrainingRecord,
} from "@/lib/training/sharepoint";

export type TrainingReviewAction =
  | "approve"
  | "request_changes"
  | "reject";

type TrainingService = ReturnType<typeof createTrainingServiceClient>;

type TrainingRecordRow = {
  id: string;
  employee_id: string;
  training_type_id: string | null;
  training_name: string | null;
  workflow_status: string | null;
  does_not_expire: boolean | null;
  expiry_date: string | null;
  supersedes_record_id: string | null;
  submitted_by_user_id: string | null;
  submitted_by_email: string | null;
  [key: string]: unknown;
};

export type TrainingReviewResult = {
  success: true;
  action: TrainingReviewAction;
  workflowStatus: string;
  notificationWarning: string | null;
  emailSent: number;
  notifiedUserIds: string[];
};

export class TrainingReviewActionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TrainingReviewActionError";
    this.status = status;
  }
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => clean(value)).filter(Boolean)),
  );
}

function statusForApprovedRecord(record: {
  does_not_expire?: boolean | null;
  expiry_date?: string | null;
}) {
  if (record.does_not_expire || !record.expiry_date) {
    return "current";
  }

  const expiry = new Date(
    `${record.expiry_date.slice(0, 10)}T23:59:59`,
  );

  if (Number.isNaN(expiry.getTime())) {
    return "current";
  }

  return expiry.getTime() < Date.now() ? "expired" : "current";
}

function outcomeRecipients({
  reviewerUserId,
  employeeUserId,
  submittedByUserId,
  submittedByEmail,
}: {
  reviewerUserId: string;
  employeeUserId?: string | null;
  submittedByUserId?: string | null;
  submittedByEmail?: string | null;
}) {
  // Review authority and outcome confirmation are separate concerns.
  // The employee and submitter should receive the result even when one of
  // them is also the reviewer who just performed the action.
  void reviewerUserId;

  const employeeId = clean(employeeUserId);
  const submitterId = clean(submittedByUserId);

  const userIds = unique([
    employeeId,
    submitterId,
  ]);

  // Keep the captured submitter email as a direct fallback. The notification
  // helper deduplicates it against the auth email resolved from userIds.
  const directEmails = unique([
    clean(submittedByEmail).toLowerCase(),
  ]);

  return {
    userIds,
    directEmails,
  };
}

async function sendOutcome({
  service,
  identity,
  record,
  employee,
  trainingName,
  action,
  comment,
}: {
  service: TrainingService;
  identity: TrainingIdentity;
  record: TrainingRecordRow;
  employee:
    | {
        id: string;
        full_name: string | null;
        user_id: string | null;
      }
    | null;
  trainingName: string;
  action: TrainingReviewAction;
  comment: string | null;
}) {
  const recipients = outcomeRecipients({
    reviewerUserId: identity.userId,
    employeeUserId: employee?.user_id,
    submittedByUserId: record.submitted_by_user_id,
    submittedByEmail: record.submitted_by_email,
  });

  // If neither the employee nor submitter can be resolved there is nobody
  // to notify. Self-review is NOT excluded: confirmation is still sent.
  if (
    recipients.userIds.length === 0 &&
    recipients.directEmails.length === 0
  ) {
    return {
      notificationWarning: null,
      emailSent: 0,
      notifiedUserIds: [] as string[],
    };
  }

  const employeeName = clean(employee?.full_name) || "Employee";

  const title =
    action === "approve"
      ? "Training record approved"
      : action === "request_changes"
        ? "Training evidence needs changes"
        : "Training record rejected";

  const message =
    action === "approve"
      ? `${employeeName} - ${trainingName} has been approved and added to the Training register.`
      : action === "request_changes"
        ? `${employeeName} - ${trainingName}: ${comment || "Changes are required."}`
        : `${employeeName} - ${trainingName} was rejected: ${
            comment || "No reason supplied."
          }`;

  const eventType =
    action === "approve"
      ? "training_record_approved"
      : action === "request_changes"
        ? "training_changes_required"
        : "training_record_rejected";

  try {
    const result = await createTrainingNotifications({
      service,
      userIds: recipients.userIds,
      inAppUserIds: recipients.userIds,
      pushUserIds: recipients.userIds,
      emailUserIds: recipients.userIds,
      emailAddresses: recipients.directEmails,
      emailSubject:
        action === "approve"
          ? `Training approved - ${trainingName}`
          : title,
      eventType,
      title,
      message,
      severity: action === "approve" ? "success" : "warning",
      actionRoute: "/profile",
      actionParams: {
        training_record_id: clean(record.id),
        ...(comment ? { review_comment: comment } : {}),
      },
      sourceRecordId: clean(record.id),
    });

    return {
      notificationWarning: null,
      emailSent: Number(result.emailSent ?? 0),
      notifiedUserIds: recipients.userIds,
    };
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : String(error ?? "Unknown notification error");

    console.error("Training outcome notification failed", {
      recordId: clean(record.id),
      action,
      detail,
    });

    return {
      notificationWarning:
        action === "approve"
          ? `The record was approved and published, but the outcome notification could not be sent: ${detail}`
          : `The review action was saved, but the outcome notification could not be sent: ${detail}`,
      emailSent: 0,
      notifiedUserIds: recipients.userIds,
    };
  }
}

export async function executeTrainingReviewAction({
  service,
  identity,
  recordId,
  action,
  comment,
}: {
  service: TrainingService;
  identity: TrainingIdentity;
  recordId: string;
  action: TrainingReviewAction;
  comment?: string | null;
}): Promise<TrainingReviewResult> {
  const cleanRecordId = clean(recordId);
  const cleanComment = clean(comment) || null;

  if (!cleanRecordId) {
    throw new TrainingReviewActionError(
      "Training record ID is required.",
      400,
    );
  }

  if (!["approve", "request_changes", "reject"].includes(action)) {
    throw new TrainingReviewActionError(
      "Select a valid review action.",
      400,
    );
  }

  if (
    (action === "request_changes" || action === "reject") &&
    !cleanComment
  ) {
    throw new TrainingReviewActionError(
      action === "reject"
        ? "Enter the reason for rejection."
        : "Describe the changes required.",
      400,
    );
  }

  const { data: record, error: recordError } = await service
    .from("employee_training_records")
    .select("*")
    .eq("id", cleanRecordId)
    .maybeSingle();

  if (recordError) {
    throw new Error(recordError.message);
  }

  if (!record) {
    throw new TrainingReviewActionError(
      "Training record could not be found.",
      404,
    );
  }

  const trainingRecord = record as TrainingRecordRow;
  const workflowStatus = clean(trainingRecord.workflow_status);

  if (
    !["pending_review", "changes_required"].includes(workflowStatus)
  ) {
    throw new TrainingReviewActionError(
      `This record is already ${workflowStatus || "processed"}.`,
      409,
    );
  }

  const { data: trainingType, error: typeError } = await service
    .from("training_types")
    .select("id,name,category_id")
    .eq("id", trainingRecord.training_type_id)
    .maybeSingle();

  if (typeError) {
    throw new Error(typeError.message);
  }

  const allowed = await userCanReviewTraining({
    service,
    identity,
    trainingTypeId: clean(trainingRecord.training_type_id) || null,
    categoryId: clean(trainingType?.category_id) || null,
  });

  if (!allowed) {
    throw new TrainingReviewActionError(
      "You are not configured to review this Training record.",
      403,
    );
  }

  const { data: employee, error: employeeError } = await service
    .from("employees")
    .select("id,full_name,user_id")
    .eq("id", trainingRecord.employee_id)
    .maybeSingle();

  if (employeeError) {
    throw new Error(employeeError.message);
  }

  const trainingName =
    clean(trainingType?.name) ||
    clean(trainingRecord.training_name) ||
    "Training";

  const now = new Date().toISOString();

  if (action === "approve") {
    const { count: documentCount, error: countError } = await service
      .from("employee_training_documents")
      .select("id", { count: "exact", head: true })
      .eq("training_record_id", cleanRecordId)
      .eq("active", true);

    if (countError) {
      throw new Error(countError.message);
    }

    // Publish BEFORE final approval. If SharePoint fails the row remains in
    // the queue, so the reviewer can retry without losing staged evidence.
    if ((documentCount ?? 0) > 0) {
      await publishApprovedTrainingRecord({
        service,
        recordId: cleanRecordId,
      });
    }

    if (trainingRecord.supersedes_record_id) {
      // Archive the previous SharePoint evidence only after the replacement
      // has published successfully. If archiving fails, the approval is not
      // finalised and the reviewer can retry safely.
      await archiveSupersededTrainingRecord({
        service,
        recordId: trainingRecord.supersedes_record_id,
      });

      const { error: supersedeError } = await service
        .from("employee_training_records")
        .update({
          superseded_at: now,
          superseded_by_record_id: cleanRecordId,
          current_version: false,
          record_status: "superseded",
          updated_at: now,
        })
        .eq("id", trainingRecord.supersedes_record_id)
        .eq("employee_id", trainingRecord.employee_id);

      if (supersedeError) {
        throw new Error(supersedeError.message);
      }
    }

    const { error: approveError } = await service
      .from("employee_training_records")
      .update({
        workflow_status: "approved",
        record_status: statusForApprovedRecord(trainingRecord),
        review_comment: cleanComment,
        reviewed_at: now,
        reviewed_by_user_id: identity.userId,
        reviewed_by_name: identity.name,
        reviewed_by_email: identity.email,
        approved_at: now,
        current_version: true,
        updated_at: now,
      })
      .eq("id", cleanRecordId);

    if (approveError) {
      throw new Error(approveError.message);
    }

    const outcome = await sendOutcome({
      service,
      identity,
      record: { ...trainingRecord, id: cleanRecordId },
      employee,
      trainingName,
      action,
      comment: cleanComment,
    });

    return {
      success: true,
      action,
      workflowStatus: "approved",
      ...outcome,
    };
  }

  const nextWorkflowStatus =
    action === "request_changes"
      ? "changes_required"
      : "rejected";

  const { error: updateError } = await service
    .from("employee_training_records")
    .update({
      workflow_status: nextWorkflowStatus,
      record_status: nextWorkflowStatus,
      review_comment: cleanComment,
      reviewed_at: now,
      reviewed_by_user_id: identity.userId,
      reviewed_by_name: identity.name,
      reviewed_by_email: identity.email,
      current_version: action !== "reject",
      updated_at: now,
    })
    .eq("id", cleanRecordId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const outcome = await sendOutcome({
    service,
    identity,
    record: { ...trainingRecord, id: cleanRecordId },
    employee,
    trainingName,
    action,
    comment: cleanComment,
  });

  return {
    success: true,
    action,
    workflowStatus: nextWorkflowStatus,
    ...outcome,
  };
}
