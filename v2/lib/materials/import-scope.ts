import type { PreparedImportRow, ImportRowError } from "./import-validation";
export type MaterialImportScope = "single" | "selected" | "all" | "csv";
export type ImportTower = { id: string; tower_identifier: string; tower_type?: string | null };
export const towerReferenceAliases = ["tower", "tower no", "tower number", "tower_number", "tower_no", "structure", "structure no", "structure number", "structure_id", "structure_no"];
export function importTargets(scope: MaterialImportScope, towers: ImportTower[], towerId: string, selectedIds: string[], rows: PreparedImportRow[]) {
  const errors: ImportRowError[] = [];
  const targets = new Map<string, ImportTower>();
  if (scope === "csv") {
    const byReference = new Map<string, ImportTower[]>();
    for (const tower of towers) {
      const key = tower.tower_identifier.trim().toUpperCase();
      byReference.set(key, [...(byReference.get(key) ?? []), tower]);
    }
    for (const row of rows) {
      const source = String(row.values.tower_reference ?? "");
      const matches = byReference.get(source.trim().toUpperCase()) ?? [];
      if (matches.length !== 1) errors.push({ row: row.row_number, message: `${matches.length ? "Ambiguous" : "Unmatched"} tower: ${source || "(blank)"}` });
      else targets.set(matches[0].id, matches[0]);
    }
  } else {
    const ids = scope === "all" ? towers.map(tower => tower.id) : scope === "selected" ? selectedIds : [towerId];
    for (const id of ids) {
      const tower = towers.find(tower => tower.id === id);
      if (tower) targets.set(id, tower);
    }
  }
  const types = new Map<string, number>();
  for (const tower of targets.values()) { const type = tower.tower_type || "Unspecified"; types.set(type, (types.get(type) ?? 0) + 1); }
  return { towers: [...targets.values()], types: [...types], rowErrors: errors };
}
