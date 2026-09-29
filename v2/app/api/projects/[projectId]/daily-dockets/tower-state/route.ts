import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireProjectContext } from "@/lib/projects/project-context";
import { getProjectProgressConfiguration } from "@/lib/projects/operations";

type Context = {
  params: Promise<{ projectId: string }>;
};

export async function GET(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const url = new URL(request.url);
    const organisationId = url.searchParams.get("organisation");
    const towerId = String(url.searchParams.get("towerId") ?? "").trim();

    if (!towerId) {
      return NextResponse.json(
        { error: "Tower is required." },
        { status: 400 },
      );
    }

    await requireProjectContext(projectId, organisationId);

    const admin = createSupabaseAdmin();

    const [{ data: tower, error: towerError }, config] = await Promise.all([
      admin
        .from("v2_towers")
        .select("id, tower_identifier, tower_weight_t")
        .eq("id", towerId)
        .eq("project_id", projectId)
        .single(),

      getProjectProgressConfiguration(projectId),
    ]);

    if (towerError || !tower) {
      throw new Error(towerError?.message ?? "Tower not found.");
    }

    const { data: states, error: stateError } = await admin
      .from("v2_tower_progress_stage_state")
      .select("stage_definition_id, is_applicable, percent_complete")
      .eq("tower_id", towerId);

    if (stateError) throw new Error(stateError.message);

    const stateMap = new Map<
      string,
      {
        stage_definition_id: string;
        is_applicable: boolean;
        percent_complete: number;
      }
    >(
      ((states ?? []) as Array<{
        stage_definition_id: string;
        is_applicable: boolean;
        percent_complete: number;
      }>).map((state) => [
        state.stage_definition_id,
        state,
      ]),
    );

    return NextResponse.json({
      tower,
      profile: config.profile,
      stages: config.stages.map((stage) => {
        const state = stateMap.get(stage.id);

        return {
          id: stage.id,
          stageKey: stage.stage_key,
          label: stage.label,
          phase: stage.phase,
          weight: Number(stage.weight ?? 0),
          applicable:
            state?.is_applicable ??
            stage.default_applicable ??
            true,
          percentBefore: Number(state?.percent_complete ?? 0),
          percentAfter: Number(state?.percent_complete ?? 0),
        };
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load tower progress.",
      },
      { status: 400 },
    );
  }
}
