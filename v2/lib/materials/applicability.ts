import type { PreparedImportRow, ImportRowError } from "./import-validation";
import type { ImportTower } from "./import-scope";
export type ApplicabilityRule = { kind: "tower_list"; blank: "common" | "none" | "error"; delimiter: string; unmatched?: "error" | "retain" };
export type ImportOptions = { applicability?: ApplicabilityRule; bundleIdentity?: "source_row" | "reference_context" };
export const memberScheduleApplicability: ApplicabilityRule = { kind: "tower_list", blank: "common", delimiter: ",", unmatched: "retain" };
export function profileApplicability(defaults: Record<string, unknown>): ApplicabilityRule {
  const options = defaults.import_options;
  const rule = options && typeof options === "object" && "applicability" in options ? options.applicability : null;
  if (!rule || typeof rule !== "object" || !("kind" in rule) || rule.kind !== "tower_list") return { ...memberScheduleApplicability };
  return { kind: "tower_list", blank: "blank" in rule && (rule.blank === "none" || rule.blank === "error") ? rule.blank : "common",
    delimiter: "delimiter" in rule && typeof rule.delimiter === "string" ? rule.delimiter : ",", unmatched: "retain" };
}
export function evaluateApplicability(rows: PreparedImportRow[], projectTowers: ImportTower[], scopeTowers: ImportTower[], rule?: ApplicabilityRule) {
  if (rule && (!rule.delimiter || rule.delimiter.length > 5)) return { common:0,conditional:0,referencedTowers:0,unmatchedReferences:[],effective:[],outOfScopeRows:0, applicableRows:0, relationships:0, rowErrors:rows.length ? [{row:rows[0].row_number,message:"Configure a non-empty applicability delimiter (up to five characters)."}] : [] };
  const byReference = new Map<string, ImportTower[]>();
  const normalize = (value: string) => value.trim().toUpperCase();
  for (const tower of projectTowers) { const key = normalize(tower.tower_identifier); byReference.set(key, [...(byReference.get(key) ?? []), tower]); }
  const selected = new Set(scopeTowers.map(tower => tower.id));
  const effective = new Map<string, { common: number; conditional: number; total: number }>();
  const rowErrors: ImportRowError[] = []; const referenced = new Set<string>();
  const unmatchedReferences = new Set<string>();
  let common = 0; let conditional = 0; let outOfScopeRows = 0; let applicableRows = 0;
  for (const row of rows) {
    const value = String(row.values.applicable_towers ?? "").trim();
    const isCommon = !rule || (!value && rule.blank === "common");
    if (isCommon) common++; else conditional++;
    let targets: string[] = [];
    if (isCommon) targets = [...selected];
    else if (!value) { if (rule?.blank === "error") rowErrors.push({row:row.row_number,message:"Applicable towers is required by this profile."}); }
    else {
      for (const reference of new Set(value.split(rule?.delimiter ?? ",").map(normalize))) {
        if (!reference) { rowErrors.push({row:row.row_number,message:"Empty tower identifier in applicability list."}); continue; }
        referenced.add(reference); const matches = byReference.get(reference) ?? [];
        if (!matches.length) unmatchedReferences.add(reference);
        else if (matches.length !== 1) rowErrors.push({row:row.row_number,message:`${matches.length ? "Ambiguous" : "Unmatched"} tower: ${reference}`});
        else if (selected.has(matches[0].id)) targets.push(matches[0].id);
      }
    }
    if (targets.length) applicableRows++; else outOfScopeRows++;
    for (const id of new Set(targets)) { const count = effective.get(id) ?? { common:0,conditional:0,total:0 }; count[isCommon ? "common" : "conditional"]++; count.total++; effective.set(id,count); }
  }
  return { common, conditional, outOfScopeRows, applicableRows, relationships:[...effective.values()].reduce((sum,value)=>sum+value.total,0), referencedTowers:referenced.size, unmatchedReferences:[...unmatchedReferences], effective:[...effective].map(([towerId,counts])=>({towerId,...counts})), rowErrors };
}
