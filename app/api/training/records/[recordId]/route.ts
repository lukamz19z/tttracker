import { NextResponse } from "next/server";

import {
  requireTrainingUser,
  trainingApiError,
  userHasFullAccessRole,
} from "@/lib/training/server";
import {
  deleteTrainingRecordEvidence,
  restoreSupersededTrainingRecordEvidence,
} from "@/lib/training/sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ recordId: string }>;
};

type DeleteBody = {
  reason?: unknown;
};

type PreviousRecord = {
  id: string;
  employee_id: string;
  training_name: string | null;
  expiry_date: string | null;
  does_not_expire: boolean | null;
  revoked_at: string | null;
  record_status: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function statusForRestoredRecord(record: PreviousRecord) {
  if (record.does_not_expire || !record.expiry_date) return "current";

  const expiry = new Date(
    `${record.expiry_date.slice(0, 10)}T23:59:59`,
  );

  if (Number.isNaN(expiry.getTime())) return "current";

  return expiry.getTime() < Date.now()
    ? "expired"
    : "current";
}

export async function DELETE(
  request: Request,
  context: RouteContext,
) {
  try {
    const { recordId } = await context.params;
    const cleanRecordId = clean(recordId);

    if (!cleanRecordId) {
      return NextResponse.json(
        {
          error: "Training record ID is required.",
        },
        {
          status: 400,
        },
      );
    }

    const { service, identity } =
      await requireTrainingUser(request);

    const fullAdministrator =
      await userHasFullAccessRole(
        service,
        identity.userId,
      );

    if (!fullAdministrator) {
      return NextResponse.json(
        {
          error:
            "Full Administrator access is required to remove an incorrect Training upload.",
        },
        {
          status: 403,
        },
      );
    }

    let body: DeleteBody = {};

    try {
      body =
        (await request.json()) as DeleteBody;
    } catch {
      body = {};
    }

    const reason = clean(body.reason);

    if (!reason) {
      return NextResponse.json(
        {
          error:
            "Enter a reason for removing the incorrect upload.",
        },
        {
          status: 400,
        },
      );
    }

    const {
      data: record,
      error: recordError,
    } = await service
      .from(
        "employee_training_records",
      )
      .select("*")
      .eq(
        "id",
        cleanRecordId,
      )
      .maybeSingle();

    if (recordError) {
      throw new Error(
        recordError.message,
      );
    }

    if (!record) {
      return NextResponse.json(
        {
          error:
            "Training record could not be found.",
        },
        {
          status: 404,
        },
      );
    }

    if (
      record.revoked_at ||
      clean(
        record.record_status,
      ) === "revoked"
    ) {
      return NextResponse.json(
        {
          error:
            "This Training record has already been revoked.",
        },
        {
          status: 409,
        },
      );
    }

    if (
      record.current_version === false ||
      record.superseded_at
    ) {
      return NextResponse.json(
        {
          error:
            "Historical or superseded Training records cannot be removed with this action. They are retained as compliance history.",
        },
        {
          status: 409,
        },
      );
    }

    const {
      data: employee,
      error: employeeError,
    } = await service
      .from("employees")
      .select(
        "id,full_name,payroll_id",
      )
      .eq(
        "id",
        record.employee_id,
      )
      .maybeSingle();

    if (employeeError) {
      throw new Error(
        employeeError.message,
      );
    }

    let previousRecord:
      | PreviousRecord
      | null = null;

    const previousRecordId =
      clean(
        record.supersedes_record_id,
      );

    if (previousRecordId) {
      const {
        data: previous,
        error: previousError,
      } = await service
        .from(
          "employee_training_records",
        )
        .select(
          "id,employee_id,training_name,expiry_date,does_not_expire,revoked_at,record_status",
        )
        .eq(
          "id",
          previousRecordId,
        )
        .eq(
          "employee_id",
          record.employee_id,
        )
        .maybeSingle();

      if (previousError) {
        throw new Error(
          previousError.message,
        );
      }

      if (
        previous &&
        !previous.revoked_at &&
        clean(
          previous.record_status,
        ) !== "revoked"
      ) {
        previousRecord =
          previous as PreviousRecord;

        // Restore the previously superseded evidence back into
        // its normal category folder before changing the database
        // version flags.
        await restoreSupersededTrainingRecordEvidence(
          {
            service,
            recordId:
              previousRecord.id,
          },
        );
      }
    }

    const evidenceResult =
      await deleteTrainingRecordEvidence(
        {
          service,
          recordId:
            cleanRecordId,
        },
      );

    const now =
      new Date().toISOString();

    if (previousRecord) {
      const {
        error:
          restoreRecordError,
      } = await service
        .from(
          "employee_training_records",
        )
        .update({
          superseded_at: null,
          superseded_by_record_id:
            null,
          current_version: true,
          record_status:
            statusForRestoredRecord(
              previousRecord,
            ),
          updated_at: now,
        })
        .eq(
          "id",
          previousRecord.id,
        )
        .eq(
          "employee_id",
          record.employee_id,
        );

      if (restoreRecordError) {
        throw new Error(
          restoreRecordError.message,
        );
      }
    }

    const {
      error: revokeError,
    } = await service
      .from(
        "employee_training_records",
      )
      .update({
        revoked_at: now,
        revoked_reason: reason,
        current_version: false,
        record_status: "revoked",
        sharepoint_web_url: null,
        sharepoint_file_name: null,
        updated_at: now,
      })
      .eq(
        "id",
        cleanRecordId,
      );

    if (revokeError) {
      throw new Error(
        revokeError.message,
      );
    }

    let auditWarning:
      | string
      | null = null;

    const {
      error: auditError,
    } = await service
      .from(
        "training_audit_log",
      )
      .insert({
        event_type:
          "training_incorrect_upload_removed",

        entity_type:
          "employee_training_record",

        entity_id:
          cleanRecordId,

        employee_id:
          record.employee_id,

        training_type_id:
          record.training_type_id ??
          null,

        training_record_id:
          cleanRecordId,

        project_id:
          record.project_id ??
          null,

        action_label:
          "Incorrect Training upload removed",

        description:
          `${
            clean(
              record.training_name,
            ) || "Training"
          } was removed from ${
            clean(
              employee?.full_name,
            ) || "the employee"
          } because the uploaded evidence was incorrect.`,

        reason,

        old_values: {
          workflow_status:
            record.workflow_status ??
            null,

          record_status:
            record.record_status ??
            null,

          current_version:
            record.current_version ??
            null,

          sharepoint_web_url:
            record.sharepoint_web_url ??
            null,

          supersedes_record_id:
            record.supersedes_record_id ??
            null,
        },

        new_values: {
          record_status:
            "revoked",

          current_version:
            false,

          revoked_at: now,

          restored_previous_record_id:
            previousRecord?.id ??
            null,
        },

        metadata: {
          action_source:
            "training_register",

          evidence_documents_deactivated:
            evidenceResult.documentsDeactivated,

          sharepoint_files_deleted:
            evidenceResult.deletedSharePointFiles,

          staged_files_removed:
            evidenceResult.removedStagedFiles,

          restored_previous_record_id:
            previousRecord?.id ??
            null,
        },

        performed_by:
          identity.userId,

        performed_by_name:
          identity.name,
      });

    if (auditError) {
      console.error(
        "Training delete audit warning",
        auditError,
      );

      auditWarning =
        "The upload was removed, but the Training audit log entry could not be written.";
    }

    const evidenceWarning =
      evidenceResult.warnings.length
        ? evidenceResult.warnings.join(
            " ",
          )
        : null;

    return NextResponse.json({
      success: true,

      recordId:
        cleanRecordId,

      restoredPreviousRecord:
        Boolean(
          previousRecord,
        ),

      restoredPreviousRecordId:
        previousRecord?.id ??
        null,

      restoredPreviousTrainingName:
        previousRecord?.training_name ??
        null,

      documentsDeactivated:
        evidenceResult.documentsDeactivated,

      sharePointFilesDeleted:
        evidenceResult.deletedSharePointFiles,

      stagedFilesRemoved:
        evidenceResult.removedStagedFiles,

      warning:
        [
          evidenceWarning,
          auditWarning,
        ]
          .filter(Boolean)
          .join(" ") || null,
    });
  } catch (error) {
    console.error(
      "Delete incorrect Training upload failed",
      error,
    );

    const apiError =
      trainingApiError(error);

    return NextResponse.json(
      {
        error:
          apiError.message,
      },
      {
        status:
          apiError.status,
      },
    );
  }
}