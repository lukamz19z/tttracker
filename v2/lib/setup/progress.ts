import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function recomputeSetupProgress(
  organisationId: string,
) {
  const admin = createSupabaseAdmin();

  const { data: steps, error } = await admin
    .from("v2_organisation_setup_steps")
    .select(`
      step_key,
      status,
      is_required
    `)
    .eq("organisation_id", organisationId);

  if (error) {
    throw new Error(
      `Could not recompute setup progress: ${error.message}`,
    );
  }

  const required = (steps ?? []).filter(
    (step) => step.is_required,
  );

  const requiredComplete = required.every(
    (step) => step.status === "completed",
  );

  const firstIncomplete =
    (steps ?? []).find(
      (step) =>
        step.status !== "completed" &&
        step.status !== "skipped",
    ) ?? null;

  const status =
    required.length > 0 && requiredComplete
      ? "completed"
      : "in_progress";

  await admin
    .from("v2_organisation_setup_state")
    .upsert(
      {
        organisation_id: organisationId,
        status,
        current_step_key:
          status === "completed"
            ? null
            : firstIncomplete?.step_key ?? null,
        completed_at:
          status === "completed"
            ? new Date().toISOString()
            : null,
        started_at: new Date().toISOString(),
      },
      {
        onConflict: "organisation_id",
      },
    );

  return {
    status,
    nextStepKey:
      status === "completed"
        ? null
        : firstIncomplete?.step_key ?? null,
  };
}
