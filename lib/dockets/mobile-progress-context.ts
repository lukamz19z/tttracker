import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTowerProgressForTowers, type TowerProgressDocket, type TowerProgressTower } from "./tower-progress";
import { towerWeightTonnes } from "./daily-productivity";

export async function mobileProgressContext(service: SupabaseClient, projectId: string, towers: TowerProgressTower[], options: { excludeDocketId?: string; throughDate?: string } = {}) {
  const dockets: TowerProgressDocket[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await service.from("tower_daily_dockets")
      .select("id,tower_id,docket_date,approval_status,progress_model,assembly_percent,erection_percent")
      .eq("project_id", projectId).order("id").range(offset, offset + 999);
    if (error) throw new Error(`Tower progress dockets could not be loaded: ${error.message}`);
    dockets.push(...(data || []));
    if ((data || []).length < 1000) break;
  }
  const resolved = await loadTowerProgressForTowers(service, towers, dockets, options);
  return { dockets, resolved, productivityTowers: towers.map((tower) => ({
    id: tower.id, weightTonnes: towerWeightTonnes(tower.extra_data),
    baselinePercent: resolved.get(tower.id)?.totalProgressPercent ?? 0,
  })) };
}
