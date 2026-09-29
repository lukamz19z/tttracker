import { NextRequest, NextResponse } from "next/server";

import { applySetupStep } from "@/lib/setup/apply";
import { requireTenantSetupContext } from "@/lib/setup/context";
import { recomputeSetupProgress } from "@/lib/setup/progress";
import {
  normaliseFieldValue,
  validateSetupValues,
} from "@/lib/setup/validation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const organisationId = String(
      body.organisationId ?? "",
    ).trim();

    const stepKey = String(
      body.stepKey ?? "",
    ).trim();

    const suppliedValues =
      body.values &&
      typeof body.values === "object" &&
      !Array.isArray(body.values)
        ? (body.values as Record<string, unknown>)
        : {};

    if (!organisationId || !stepKey) {
      return NextResponse.json(
        {
          error:
            "Organisation and setup step are required.",
        },
        { status: 400 },
      );
    }

    const context =
      await requireTenantSetupContext(
        organisationId,
      );

    const step = context.steps.find(
      (item) => item.stepKey === stepKey,
    );

    if (!step) {
      return NextResponse.json(
        {
          error:
            "This setup step is not available for the organisation.",
        },
        { status: 404 },
      );
    }

    const values: Record<string, unknown> = {
      ...step.values,
    };

    for (const field of step.formSchema.fields) {
      values[field.key] = normaliseFieldValue(
        field,
        suppliedValues[field.key],
      );
    }

    const errors = validateSetupValues(
      step.formSchema,
      values,
    );

    if (Object.keys(errors).length > 0) {
      return NextResponse.json(
        {
          error: "Check the required fields.",
          fields: errors,
        },
        { status: 400 },
      );
    }

    await applySetupStep({
      organisationId,
      handlerKey: step.handlerKey,
      values,
    });

    const admin = createSupabaseAdmin();

    const { error: updateError } = await admin
      .from("v2_organisation_setup_steps")
      .update({
        status: "completed",
        values,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        skipped_at: null,
      })
      .eq("organisation_id", organisationId)
      .eq("step_key", stepKey);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 },
      );
    }

    const progress =
      await recomputeSetupProgress(
        organisationId,
      );

    return NextResponse.json({
      ok: true,
      ...progress,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save setup step.",
      },
      { status: 400 },
    );
  }
}
