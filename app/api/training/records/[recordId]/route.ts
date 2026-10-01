import { NextResponse } from "next/server";

import {
  requireTrainingUser,
  trainingApiError,
  userHasAccessCode,
} from "@/lib/training/server";

import {
  archiveSupersededTrainingRecord,
  deleteTrainingRecordEvidence,
  restoreSupersededTrainingRecordEvidence,
} from "@/lib/training/sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DELETE_ACCESS_CODE = "tt.training.delete";

type RouteContext = {
  params: Promise<{
    recordId: string;
  }>;
};

type DeleteBody = {
  reason?: unknown;
};

type PreviousRecord = {
  id: string;

  employee_id: string;

  training_name:
    | string
    | null;

  expiry_date:
    | string
    | null;

  does_not_expire:
    | boolean
    | null;

  revoked_at:
    | string
    | null;

  deleted_at:
    | string
    | null;

  record_status:
    | string
    | null;

  current_version:
    | boolean
    | null;

  superseded_at:
    | string
    | null;

  superseded_by_record_id:
    | string
    | null;
};

function clean(
  value: unknown,
) {
  return String(
    value ?? "",
  ).trim();
}

function normalise(
  value: unknown,
) {
  return clean(
    value,
  ).toLowerCase();
}

function statusForRestoredRecord(
  record: PreviousRecord,
) {
  if (
    record.does_not_expire ||
    !record.expiry_date
  ) {
    return "current";
  }

  const expiry =
    new Date(
      `${record.expiry_date.slice(
        0,
        10,
      )}T23:59:59`,
    );

  if (
    Number.isNaN(
      expiry.getTime(),
    )
  ) {
    return "current";
  }

  return expiry.getTime() <
    Date.now()
    ? "expired"
    : "current";
}

function recordIsCurrent(
  record: {
    current_version?:
      | boolean
      | null;

    superseded_at?:
      | string
      | null;

    revoked_at?:
      | string
      | null;

    record_status?:
      | string
      | null;

    deleted_at?:
      | string
      | null;
  },
) {
  if (
    record.deleted_at
  ) {
    return false;
  }

  if (
    record.revoked_at
  ) {
    return false;
  }

  if (
    record.superseded_at
  ) {
    return false;
  }

  if (
    record.current_version ===
    false
  ) {
    return false;
  }

  const status =
    normalise(
      record.record_status,
    );

  if (
    [
      "superseded",
      "revoked",
      "deleted",
      "cancelled",
      "void",
    ].includes(
      status,
    )
  ) {
    return false;
  }

  return true;
}

function previousRecordCanBeRestored(
  previous:
    PreviousRecord | null,
  deletingRecordId:
    string,
) {
  if (!previous) {
    return false;
  }

  if (
    previous.deleted_at
  ) {
    return false;
  }

  if (
    previous.revoked_at ||
    normalise(
      previous.record_status,
    ) === "revoked"
  ) {
    return false;
  }

  /**
   * Prefer the explicit relationship.
   *
   * Compatibility checks below allow restoration of
   * records created before superseded_by_record_id was
   * consistently populated.
   */
  if (
    clean(
      previous.superseded_by_record_id,
    ) ===
    deletingRecordId
  ) {
    return true;
  }

  return (
    Boolean(
      previous.superseded_at,
    ) ||
    previous.current_version ===
      false ||
    normalise(
      previous.record_status,
    ) === "superseded"
  );
}

export async function DELETE(
  request: Request,
  context: RouteContext,
) {
  try {
    const {
      recordId,
    } =
      await context.params;

    const cleanRecordId =
      clean(
        recordId,
      );

    if (
      !cleanRecordId
    ) {
      return NextResponse.json(
        {
          error:
            "Training record ID is required.",
        },
        {
          status: 400,
        },
      );
    }

    const {
      service,
      identity,
    } =
      await requireTrainingUser(
        request,
      );

    /**
     * Dynamic RBAC.
     *
     * Full grants_all Administrators are always permitted.
     * Otherwise permission is controlled through:
     *
     * tt.training.delete
     *
     * No hard-coded role names.
     */
    const canDelete =
      identity.grantsAll ===
        true ||
      (await userHasAccessCode(
        service,
        identity.userId,
        DELETE_ACCESS_CODE,
      ));

    if (
      !canDelete
    ) {
      return NextResponse.json(
        {
          error:
            "You do not have permission to delete Training records.",
        },
        {
          status: 403,
        },
      );
    }

    let body:
      DeleteBody = {};

    try {
      body =
        (await request.json()) as DeleteBody;
    } catch {
      body = {};
    }

    const reason =
      clean(
        body.reason,
      );

    if (!reason) {
      return NextResponse.json(
        {
          error:
            "Enter a reason for deleting the Training record.",
        },
        {
          status: 400,
        },
      );
    }

    const {
      data: record,
      error:
        recordError,
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

    if (
      recordError
    ) {
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

    /**
     * Idempotent delete.
     *
     * Pressing Delete twice should not break anything.
     */
    if (
      record.deleted_at
    ) {
      return NextResponse.json({
        success:
          true,

        alreadyDeleted:
          true,

        recordId:
          cleanRecordId,

        warning:
          null,
      });
    }

    const {
      data: employee,
      error:
        employeeError,
    } = await service
      .from(
        "employees",
      )
      .select(
        "id,full_name,payroll_id",
      )
      .eq(
        "id",
        record.employee_id,
      )
      .maybeSingle();

    if (
      employeeError
    ) {
      throw new Error(
        employeeError.message,
      );
    }

    const now =
      new Date().toISOString();

    const warnings:
      string[] = [];

    /**
     * -----------------------------------------------------
     * PREVIOUS SUPERSEDED RECORD
     * -----------------------------------------------------
     *
     * Example:
     *
     * Old correct licence
     *       ↓
     * accidentally replaced by duplicate upload
     *
     * If the duplicate is deleted, restore the old licence
     * and its SharePoint evidence.
     *
     * We only do this when the record being deleted is itself
     * the CURRENT record.
     *
     * Deleting an older historical record must NOT suddenly
     * reactivate another old record.
     */
    const previousRecordId =
      clean(
        record.supersedes_record_id,
      );

    let previousRecord:
      | PreviousRecord
      | null = null;

    let previousRestored =
      false;

    if (
      previousRecordId &&
      recordIsCurrent(
        record,
      )
    ) {
      const {
        data:
          previous,
        error:
          previousError,
      } = await service
        .from(
          "employee_training_records",
        )
        .select(
          [
            "id",
            "employee_id",
            "training_name",
            "expiry_date",
            "does_not_expire",
            "revoked_at",
            "deleted_at",
            "record_status",
            "current_version",
            "superseded_at",
            "superseded_by_record_id",
          ].join(","),
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

      if (
        previousError
      ) {
        throw new Error(
          previousError.message,
        );
      }

      if (
        previous
      ) {
previousRecord =
  previous as unknown as PreviousRecord;
      }

      if (
        previousRecordCanBeRestored(
          previousRecord,
          cleanRecordId,
        )
      ) {
        /**
         * Restore SharePoint evidence first.
         *
         * If SharePoint restoration fails, stop the delete.
         * We do not want to remove the replacement and leave
         * the employee without their valid previous evidence.
         */
        await restoreSupersededTrainingRecordEvidence(
          {
            service,

            recordId:
              previousRecord!.id,
          },
        );

        const {
          error:
            restoreDatabaseError,
        } = await service
          .from(
            "employee_training_records",
          )
          .update({
            superseded_at:
              null,

            superseded_by_record_id:
              null,

            current_version:
              true,

            record_status:
              statusForRestoredRecord(
                previousRecord!,
              ),

            updated_at:
              now,
          })
          .eq(
            "id",
            previousRecord!.id,
          )
          .eq(
            "employee_id",
            record.employee_id,
          );

        if (
          restoreDatabaseError
        ) {
          /**
           * SharePoint was restored but DB could not be changed.
           * Put the file back into Superseded so the two systems
           * remain aligned.
           */
          try {
            await archiveSupersededTrainingRecord(
              {
                service,

                recordId:
                  previousRecord!.id,
              },
            );
          } catch (
            rollbackError
          ) {
            console.error(
              "Training previous-record SharePoint rollback failed",
              rollbackError,
            );
          }

          throw new Error(
            `The previous Training evidence was restored, but its TTTracker record could not be reactivated: ${restoreDatabaseError.message}`,
          );
        }

        previousRestored =
          true;
      }
    }

    /**
     * -----------------------------------------------------
     * SOFT DELETE RECORD
     * -----------------------------------------------------
     *
     * Deleted means:
     * - hide from employee profile
     * - hide from matrix/register/planner
     * - retain database audit history
     *
     * Deleted is intentionally NOT the same thing as revoked.
     */
    const {
      error:
        deleteRecordError,
    } = await service
      .from(
        "employee_training_records",
      )
      .update({
        deleted_at:
          now,

        deleted_by_user_id:
          identity.userId,

        deleted_reason:
          reason,

        current_version:
          false,

        sharepoint_web_url:
          null,

        sharepoint_file_name:
          null,

        updated_at:
          now,
      })
      .eq(
        "id",
        cleanRecordId,
      );

    if (
      deleteRecordError
    ) {
      /**
       * We already restored the previous record.
       *
       * If the duplicate itself could not be marked deleted,
       * revert that restoration so we don't end up with two
       * active records.
       */
      if (
        previousRestored &&
        previousRecord
      ) {
        try {
          await archiveSupersededTrainingRecord(
            {
              service,

              recordId:
                previousRecord.id,
            },
          );

          const {
            error:
              rollbackDatabaseError,
          } = await service
            .from(
              "employee_training_records",
            )
            .update({
              superseded_at:
                previousRecord.superseded_at ||
                now,

              superseded_by_record_id:
                previousRecord.superseded_by_record_id ||
                cleanRecordId,

              current_version:
                previousRecord.current_version ??
                false,

              record_status:
                previousRecord.record_status ||
                "superseded",

              updated_at:
                now,
            })
            .eq(
              "id",
              previousRecord.id,
            );

          if (
            rollbackDatabaseError
          ) {
            console.error(
              "Training previous-record database rollback failed",
              rollbackDatabaseError,
            );
          }
        } catch (
          rollbackError
        ) {
          console.error(
            "Training previous-record rollback failed",
            rollbackError,
          );
        }
      }

      throw new Error(
        deleteRecordError.message,
      );
    }

    /**
     * -----------------------------------------------------
     * REMOVE PHYSICAL EVIDENCE
     * -----------------------------------------------------
     *
     * The TTTracker row has now safely been hidden.
     *
     * Remove:
     * - SharePoint evidence
     * - staging files
     * - active document references
     *
     * If physical cleanup has a problem, keep the logical
     * deletion and return a warning rather than resurrecting
     * the duplicate record.
     */
    let documentsDeactivated =
      0;

    let sharePointFilesDeleted =
      0;

    let stagedFilesRemoved =
      0;

    try {
      const evidenceResult =
        await deleteTrainingRecordEvidence(
          {
            service,

            recordId:
              cleanRecordId,
          },
        );

      documentsDeactivated =
        evidenceResult.documentsDeactivated ??
        0;

      sharePointFilesDeleted =
        evidenceResult.deletedSharePointFiles ??
        0;

      stagedFilesRemoved =
        evidenceResult.removedStagedFiles ??
        0;

      if (
        Array.isArray(
          evidenceResult.warnings,
        )
      ) {
        warnings.push(
          ...evidenceResult.warnings
            .map(clean)
            .filter(Boolean),
        );
      }
    } catch (
      evidenceError
    ) {
      console.error(
        "Training evidence cleanup warning",
        evidenceError,
      );

      warnings.push(
        `The Training record was deleted from TTTracker, but some evidence could not be cleaned up automatically: ${
          evidenceError instanceof Error
            ? evidenceError.message
            : "Unknown evidence cleanup error"
        }`,
      );
    }

    /**
     * -----------------------------------------------------
     * AUDIT
     * -----------------------------------------------------
     *
     * The employee should never see the deleted duplicate,
     * but administrators still retain an audit trail.
     */
    const {
      error:
        auditError,
    } = await service
      .from(
        "training_audit_log",
      )
      .insert({
        event_type:
          "training_record_deleted",

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
          "Training record deleted",

        description:
          `${
            clean(
              record.training_name,
            ) ||
            "Training"
          } was deleted from ${
            clean(
              employee?.full_name,
            ) ||
            "the employee"
          } profile as an incorrect or duplicate record.`,

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

          sharepoint_file_name:
            record.sharepoint_file_name ??
            null,

          supersedes_record_id:
            record.supersedes_record_id ??
            null,

          superseded_at:
            record.superseded_at ??
            null,

          revoked_at:
            record.revoked_at ??
            null,

          deleted_at:
            record.deleted_at ??
            null,
        },

        new_values: {
          deleted_at:
            now,

          deleted_by_user_id:
            identity.userId,

          deleted_reason:
            reason,

          current_version:
            false,

          restored_previous_record_id:
            previousRestored
              ? previousRecord?.id ??
                null
              : null,
        },

        metadata: {
          action_source:
            "employee_training_profile",

          delete_permission:
            DELETE_ACCESS_CODE,

          documents_deactivated:
            documentsDeactivated,

          sharepoint_files_deleted:
            sharePointFilesDeleted,

          staged_files_removed:
            stagedFilesRemoved,

          previous_record_restored:
            previousRestored,

          restored_previous_record_id:
            previousRestored
              ? previousRecord?.id ??
                null
              : null,
        },

        performed_by:
          identity.userId,

        performed_by_name:
          identity.name,
      });

    if (
      auditError
    ) {
      console.error(
        "Training delete audit warning",
        auditError,
      );

      warnings.push(
        "The Training record was deleted, but its audit-log entry could not be written.",
      );
    }

    return NextResponse.json({
      success:
        true,

      recordId:
        cleanRecordId,

      deleted:
        true,

      restoredPreviousRecord:
        previousRestored,

      restoredPreviousRecordId:
        previousRestored
          ? previousRecord?.id ??
            null
          : null,

      restoredPreviousTrainingName:
        previousRestored
          ? previousRecord
              ?.training_name ??
            null
          : null,

      documentsDeactivated,

      sharePointFilesDeleted,

      stagedFilesRemoved,

      warning:
        warnings.length >
        0
          ? warnings.join(
              " ",
            )
          : null,
    });
  } catch (
    error
  ) {
    console.error(
      "Delete Training record failed",
      error,
    );

    const apiError =
      trainingApiError(
        error,
      );

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