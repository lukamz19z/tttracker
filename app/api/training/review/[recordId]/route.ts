import { NextResponse } from "next/server";

import {
  requireTrainingUser,
  trainingApiError,
} from "@/lib/training/server";
import {
  executeTrainingReviewAction,
  TrainingReviewActionError,
  type TrainingReviewAction,
} from "@/lib/training/review-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ recordId: string }>;
};

export async function POST(
  request: Request,
  context: RouteContext,
) {
  try {
    const { recordId } = await context.params;
    const { service, identity } = await requireTrainingUser(request);

    const body = (await request.json()) as {
      action?: TrainingReviewAction;
      comment?: string;
    };

    const result = await executeTrainingReviewAction({
      service,
      identity,
      recordId,
      action: body.action as TrainingReviewAction,
      comment: body.comment,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Training review action route failed", error);

    if (error instanceof TrainingReviewActionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    const apiError = trainingApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
