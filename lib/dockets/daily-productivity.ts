import { calculateProgressTotals } from "./calculations";

type ProgressInput = Parameters<typeof calculateProgressTotals>[0];
export type ProductivityTower = {
  id: string;
  weightTonnes: number | null;
  baselinePercent: number;
};

/** Same field/value conventions as the V1 tower overview's imported weight. */
export function towerWeightTonnes(extra: Record<string, unknown> | null | undefined): number | null {
  const entries = Object.entries(extra || {});
  const entry = entries.find(([key]) => ["tower weight", "tower weight (t)", "tower_weight", "towerweight", "structure total weights", "structure total weight"].includes(key.trim().toLowerCase()))
    || entries.find(([key]) => /tower|structure/i.test(key) && /weight/i.test(key))
    || entries.find(([key]) => /weight/i.test(key));
  const value = entry?.[1];
  const match = String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  const weight = match ? Number(match[0]) : 0;
  return weight > 0 ? weight : null;
}

export function calculateDailyProductivity(input: {
  rawManhours: number; productionManhours: number;
  towers: ProductivityTower[];
  work: { towerId: string; progress: ProgressInput }[];
}) {
  let tonnes = 0;
  let unresolved = false;
  const seen = new Set<string>();
  for (const work of input.work) {
    if (seen.has(work.towerId)) continue;
    seen.add(work.towerId);
    const tower = input.towers.find((row) => row.id === work.towerId);
    if (!tower) { unresolved = true; continue; }
    const progress = calculateProgressTotals(work.progress).totalProgressPercent;
    const gain = Math.max(0, progress - tower.baselinePercent);
    if (!gain) continue;
    if (!tower.weightTonnes) { unresolved = true; continue; }
    tonnes += tower.weightTonnes * gain / 100;
  }
  const completedTonnes = unresolved ? null : tonnes;
  return {
    completedTonnes,
    productionMhPerTonne: completedTonnes && completedTonnes > 0 ? input.productionManhours / completedTonnes : null,
    rawMhPerTonne: completedTonnes && completedTonnes > 0 ? input.rawManhours / completedTonnes : null,
  };
}
