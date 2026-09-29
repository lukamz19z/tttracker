import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function getProjectProgressConfiguration(projectId: string) {
  const admin = createSupabaseAdmin();

  const { data: profile, error } = await admin
    .from("v2_project_progress_profiles")
    .select(`
      id,
      name,
      assembly_share,
      erection_share,
      normalize_applicable_weights,
      mh_t_basis,
      requires_review
    `)
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!profile) {
    throw new Error("Project progress configuration is missing.");
  }

  const { data: stages, error: stageError } = await admin
    .from("v2_progress_stage_definitions")
    .select(`
      id,
      stage_key,
      label,
      phase,
      weight,
      sort_order,
      is_active,
      default_applicable,
      applicability_rules
    `)
    .eq("project_id", projectId)
    .eq("is_active", true)
    .order("phase")
    .order("sort_order");

  if (stageError) throw new Error(stageError.message);

  return {
    profile,
    stages: stages ?? [],
  };
}

export async function getProjectOptions(
  projectId: string,
  optionGroup?: string,
) {
  const admin = createSupabaseAdmin();

  let query = admin
    .from("v2_project_option_definitions")
    .select(`
      id,
      option_group,
      option_key,
      label,
      sort_order,
      is_active,
      settings
    `)
    .eq("project_id", projectId)
    .eq("is_active", true)
    .order("option_group")
    .order("sort_order");

  if (optionGroup) {
    query = query.eq("option_group", optionGroup);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return data ?? [];
}

export async function upsertProductionActualsFromDocket(
  admin: SupabaseClient,
  input: {
    organisationId: string;
    projectId: string;
    docketId: string;
    docketDate: string;
    crewLabel?: string | null;
    allocations: Array<{
      towerId: string;
      assemblyAfter: number;
      erectionAfter: number;
      progressDelta: number;
      earnedTonnes: number;
      rawHours: number;
      productionHours: number;
      delayHours?: number;
    }>;
  },
) {
  const rows = input.allocations.map((allocation) => ({
    organisation_id: input.organisationId,
    project_id: input.projectId,
    tower_id: allocation.towerId,
    actual_date: input.docketDate,
    crew_label: input.crewLabel ?? null,
    source_type: "daily_docket",
    source_id: input.docketId,
    assembly_percent: allocation.assemblyAfter,
    erection_percent: allocation.erectionAfter,
    overall_progress_percent: null,
    progress_delta_percent: allocation.progressDelta,
    production_tonnes: allocation.earnedTonnes,
    raw_hours: allocation.rawHours,
    production_hours: allocation.productionHours,
    delay_hours: allocation.delayHours ?? 0,
    metadata: {
      allocation_source: "v2_daily_docket",
    },
  }));

  if (rows.length === 0) return;

  const { error } = await admin
    .from("v2_project_production_actuals")
    .upsert(rows, {
      onConflict: "project_id,source_type,source_id,tower_id",
    });

  if (error) throw new Error(error.message);
}
