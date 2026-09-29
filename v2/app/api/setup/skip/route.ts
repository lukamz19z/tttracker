import { NextRequest, NextResponse } from "next/server";

import { requireTenantSetupContext } from "@/lib/setup/context";
import { recomputeSetupProgress } from "@/lib/setup/progress";
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

    if (!organisationId || !stepKey) {
      return NextResponse.json(
        { error: "Organisation and setup step are required." },
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
        { error: "Setup step not found." },
        { status: 404 },
      );
    }

    if (step.isRequired) {
      return NextResponse.json(
        { error: "Required setup steps cannot be skipped." },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdmin();

    const { error: updateError } = await admin
      .from("v2_organisation_setup_steps")
      .update({
        status: "skipped",
        skipped_at: new Date().toISOString(),
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
            : "Could not skip setup step.",
      },
      { status: 400 },
    );
  }
}
