import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireProjectContext } from "@/lib/projects/project-context";

type Context = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const body = await request.json();

    const project = await requireProjectContext(
      projectId,
      String(body.organisationId ?? "") || null,
    );

    const admin = createSupabaseAdmin();

    const assemblyShare = Number(body.assemblyShare ?? 50);
    const erectionShare = Number(body.erectionShare ?? 50);

    if (
      assemblyShare < 0 ||
      erectionShare < 0 ||
      assemblyShare + erectionShare <= 0
    ) {
      return NextResponse.json(
        { error: "Assembly and erection shares must produce a total greater than zero." },
        { status: 400 },
      );
    }

    const { data: profile, error: profileError } = await admin
      .from("v2_project_progress_profiles")
      .upsert(
        {
          organisation_id:
            project.workspace.organisation.organisationId,
          project_id: projectId,
          assembly_share: assemblyShare,
          erection_share: erectionShare,
          normalize_applicable_weights:
            body.normalizeApplicableWeights !== false,
          mh_t_basis:
            body.mhTBasis === "manual_tonnes"
              ? "manual_tonnes"
              : "progress_earned_tonnes",
          requires_review: false,
        },
        { onConflict: "project_id" },
      )
      .select("id")
      .single();

    if (profileError || !profile) {
      throw new Error(profileError?.message ?? "Could not save progress profile.");
    }

    const stages = Array.isArray(body.stages) ? body.stages : [];

    for (const stage of stages) {
      const phase =
        stage.phase === "erection" ? "erection" : "assembly";

      const stageKey = String(stage.stageKey ?? "").trim();
      const label = String(stage.label ?? "").trim();

      if (!stageKey || !label) continue;

      const payload = {
        organisation_id:
          project.workspace.organisation.organisationId,
        project_id: projectId,
        progress_profile_id: profile.id,
        stage_key: stageKey,
        label,
        phase,
        weight: Math.max(0, Number(stage.weight ?? 0)),
        sort_order: Number(stage.sortOrder ?? 100),
        is_active: stage.isActive !== false,
        default_applicable: stage.defaultApplicable !== false,
      };

      const { error } = await admin
        .from("v2_progress_stage_definitions")
        .upsert(payload, {
          onConflict: "project_id,stage_key,phase",
        });

      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save project progress configuration.",
      },
      { status: 400 },
    );
  }
}
