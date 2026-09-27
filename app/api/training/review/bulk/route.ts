import { NextResponse } from "next/server";

import {
  requireTrainingUser,
  trainingApiError,
} from "@/lib/training/server";
import {
  executeTrainingReviewAction,
  type TrainingReviewAction,
} from "@/lib/training/review-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SERVER_BATCH = 10;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(request: Request) {
  try {
    const { service, identity } = await requireTrainingUser(request);

    const body = (await request.json()) as {
      recordIds?: unknown;
      action?: TrainingReviewAction;
    };

    const recordIds = Array.from(
      new Set(
        (Array.isArray(body.recordIds) ? body.recordIds : [])
          .map(clean)
          .filter(Boolean),
      ),
    );

    const action =
      body.action === "approve"
        ? "approve"
        : null;

    if (!action) {
      return NextResponse.json(
        {
          error:
            "Bulk review currently supports approval only. Reject and request changes remain individual actions so each record keeps a meaningful review comment.",
        },
        {
          status: 400,
        },
      );
    }

    if (recordIds.length === 0) {
      return NextResponse.json(
        {
          error:
            "Select at least one Training record.",
        },
        {
          status: 400,
        },
      );
    }

    if (recordIds.length > MAX_SERVER_BATCH) {
      return NextResponse.json(
        {
          error:
            `Approve a maximum of ${MAX_SERVER_BATCH} Training records per server batch. ` +
            "Large approvals should use the Verification Queue, which processes records through separate requests to avoid server timeouts.",
        },
        {
          status: 400,
        },
      );
    }

    const approved: Array<{
      recordId: string;
      emailSent: number;
      notificationWarning: string | null;
    }> = [];

    const failed: Array<{
      recordId: string;
      error: string;
    }> = [];

    /**
     * This endpoint is intentionally limited to small batches.
     *
     * The Verification Queue should process large selections using the
     * single-record review endpoint with controlled browser-side concurrency.
     *
     * We still process this small batch sequentially so:
     * - SharePoint is not flooded with parallel Graph requests;
     * - one failed record does not roll back records already approved;
     * - each record retains its own review/publishing transaction.
     */
    for (const recordId of recordIds) {
      try {
        const result =
          await executeTrainingReviewAction({
            service,
            identity,
            recordId,
            action,
            comment: null,
          });

        approved.push({
          recordId,
          emailSent:
            result.emailSent,
          notificationWarning:
            result.notificationWarning,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : String(
                error ??
                  "Approval failed",
              );

        console.error(
          "Bulk Training record approval failed",
          {
            recordId,
            error:
              errorMessage,
          },
        );

        failed.push({
          recordId,
          error:
            errorMessage,
        });
      }
    }

    const emailsSent =
      approved.reduce(
        (total, item) =>
          total +
          item.emailSent,
        0,
      );

    const notificationWarnings =
      approved.filter(
        (item) =>
          Boolean(
            item.notificationWarning,
          ),
      ).length;

    return NextResponse.json({
      success:
        failed.length === 0,

      summary: {
        requested:
          recordIds.length,

        approved:
          approved.length,

        failed:
          failed.length,

        emailsSent,

        notificationWarnings,
      },

      approved,

      failed,
    });
  } catch (error) {
    console.error(
      "Bulk Training approval route failed",
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