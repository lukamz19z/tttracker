import type { BundleRecord, TowerMaterialRecord } from "@/types/materials";

const clean = (value: unknown) => String(value ?? "").trim();

/** Resolve a picker/route value to the project's canonical tower UUID. */
export function resolveMaterialTowerId(
  value: unknown,
  towers: TowerMaterialRecord[],
) {
  const candidate = clean(value);
  if (!candidate) return "";

  const byId = towers.find((tower) => clean(tower.id) === candidate);
  if (byId) return clean(byId.id);

  const matches = towers.filter((tower) => {
    const record = tower as Record<string, unknown>;
    return [tower.name, tower.line, record.tower_number, record.tower_no]
      .some((label) => clean(label).toLowerCase() === candidate.toLowerCase());
  });
  return matches.length === 1 ? clean(matches[0].id) : candidate;
}

/** Match material foreign keys after normalising both sides to a tower UUID. */
export function matchesMaterialTower(
  recordTowerId: unknown,
  selectedTowerId: unknown,
  towers: TowerMaterialRecord[],
) {
  const selected = resolveMaterialTowerId(selectedTowerId, towers);
  if (!selected) return true;
  return resolveMaterialTowerId(recordTowerId, towers) === selected;
}

export function filterMaterialBundles(input: {
  bundles: BundleRecord[];
  selectedTowerId: unknown;
  towers: TowerMaterialRecord[];
  section: string;
  query: string;
  towerName: (towerId: unknown) => string;
}) {
  const search = input.query.trim().toLowerCase();
  return input.bundles.filter((bundle) => {
    if (!matchesMaterialTower(bundle.tower_id, input.selectedTowerId, input.towers)) return false;
    if (input.section && (clean(bundle.section) || "General") !== input.section) return false;
    if (search) {
      const text = [bundle.bundle_no, bundle.section, input.towerName(bundle.tower_id)]
        .map(clean)
        .join(" ")
        .toLowerCase();
      if (!text.includes(search)) return false;
    }
    return true;
  });
}
