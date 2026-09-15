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
      body.action === "approve" ? "approve" : null;

    if (!action) {
      return NextResponse.json(
        {
          error:
            "Bulk review currently supports approval only. Reject and request changes remain individual actions so each record keeps a meaningful review comment.",
        },
        { status: 400 },
      );
    }

    if (recordIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least one Training record." },
        { status: 400 },
      );
    }

    if (recordIds.length > 100) {
      return NextResponse.json(
        {
          error:
            "Approve a maximum of 100 Training records at a time.",
        },
        { status: 400 },
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

    // Intentionally sequential. Each approval publishes its own evidence to
    // SharePoint and finalises its own row. One failed certificate must not
    // roll back certificates that were already safely published.
    for (const recordId of recordIds) {
      try {
        const result = await executeTrainingReviewAction({
          service,
          identity,
          recordId,
          action,
          comment: null,
        });

        approved.push({
          recordId,
          emailSent: result.emailSent,
          notificationWarning: result.notificationWarning,
        });
      } catch (error) {
        failed.push({
          recordId,
          error:
            error instanceof Error
              ? error.message
              : String(error ?? "Approval failed"),
        });
      }
    }

    return NextResponse.json({
      success: failed.length === 0,
      summary: {
        requested: recordIds.length,
        approved: approved.length,
        failed: failed.length,
        emailsSent: approved.reduce(
          (total, item) => total + item.emailSent,
          0,
        ),
        notificationWarnings: approved.filter(
          (item) => Boolean(item.notificationWarning),
        ).length,
      },
      approved,
      failed,
    });
  } catch (error) {
    console.error("Bulk Training approval route failed", error);

    const apiError = trainingApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
