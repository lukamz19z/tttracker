import { findingReadiness } from "./finding-readiness";
import type { DetailValues } from "./operational-details";

export const FIELD_STATUSES = ["All", "Open", "In Progress", "Ready", "Rectified"] as const;
export const FIELD_GROUPS = ["Section", "Defect Type", "Status", "FLI"] as const;
export type FieldListState = { search: string; status: string; section: string; defectType: string; source: string; assignment: string; group: typeof FIELD_GROUPS[number] };
export const DEFAULT_FIELD_STATE: FieldListState = { search: "", status: "All", section: "", defectType: "", source: "", assignment: "", group: "Section" };
export type FieldItem = {
  pendingSync?: boolean;
  id: string; status: string; fli_number?: string | null; item_number?: number | null;
  tower_segment?: string | null; issue_type_id?: string | null; other_issue_text?: string | null;
  assigned_flag?: string | null; source_type?: string | null; external_reference?: string | null;
  member_number?: string | null; leg?: string | null; finding?: string | null;
  rectification_comment?: string | null; operational_details?: DetailValues | null;
};
export type FieldRow<T extends FieldItem = FieldItem> = { item: T; section: string; defectType: string; issueName: string; workflow: string; source: string; assignment: string; search: string };
export function fieldListRows<T extends FieldItem>(items: T[], types: { id: string; name: string }[], files: { revision_item_id: string | null; file_role: string; deletion_pending?: boolean }[]): FieldRow<T>[] {
  const issues = new Map(types.map(type => [type.id, type.name]));
  const byName = new Map<string, string[]>();
  for (const type of types) {
    const key = type.name.trim().toLowerCase();
    byName.set(key, [...(byName.get(key) || []), type.id]);
  }
  const counts = new Map<string, { before: number; after: number }>();
  for (const file of files) {
    if (!file.revision_item_id || file.deletion_pending) continue;
    const count = counts.get(file.revision_item_id) || { before: 0, after: 0 };
    if (file.file_role === "before_photo") count.before++;
    if (file.file_role === "after_photo") count.after++;
    counts.set(file.revision_item_id, count);
  }
  return items.map(item => {
    const count = counts.get(item.id) || { before: 0, after: 0 };
    const ready = findingReadiness(item, count.before, count.after).ready;
    const workflow = ["Rectified", "Verified"].includes(item.status) ? "Rectified" : ready ? "Ready" : count.after > 0 || item.rectification_comment?.trim() ? "In Progress" : "Open";
    const sourceIssueName = issues.get(item.issue_type_id || "") || item.other_issue_text || "Unspecified";
    // Match labels only for list navigation, and only when unambiguous. This
    // never changes imported provenance or assigns a structured schema to data.
    const candidates = byName.get(sourceIssueName.trim().toLowerCase()) || [];
    const defectType = item.issue_type_id || (candidates.length === 1 ? candidates[0] : `text:${sourceIssueName}`);
    const issueName = issues.get(defectType) || sourceIssueName;
    return { item, section: item.tower_segment?.trim() || "", defectType, issueName, workflow, source: item.source_type === "punchlist" ? "Punchlist" : "Manual", assignment: item.assigned_flag?.trim() || "", search: [item.fli_number, item.external_reference, item.member_number, item.leg, item.tower_segment, item.finding, issueName].join(" ").toLowerCase() };
  });
}
export function filterFieldRows<T extends FieldItem>(rows: FieldRow<T>[], state: FieldListState) {
  const search = state.search.trim().toLowerCase();
  return rows.filter(row => (!search || row.search.includes(search)) && (state.status === "All" || row.workflow === state.status) && (!state.section || row.section === state.section) && (!state.defectType || row.defectType === state.defectType) && (!state.source || row.source === state.source) && (!state.assignment || (state.assignment === "__unassigned__" ? !row.assignment : row.assignment === state.assignment)));
}
export function groupFieldRows<T extends FieldItem>(rows: FieldRow<T>[], group: FieldListState["group"]) {
  const groups = new Map<string, FieldRow<T>[]>();
  for (const row of rows) {
    const label = group === "Section" ? row.section || "No section" : group === "Defect Type" ? row.issueName : group === "Status" ? row.workflow : "FLI";
    const entries = groups.get(label) || [];
    entries.push(row);
    groups.set(label, entries);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([label, entries]) => ({ label, rows: entries.sort((a, b) => (a.item.item_number || 0) - (b.item.item_number || 0) || (a.item.fli_number || "").localeCompare(b.item.fli_number || "", undefined, { numeric: true })) }));
}
export function restoreFieldState(value: unknown): FieldListState {
  const result = { ...DEFAULT_FIELD_STATE };
  if (!value || typeof value !== "object") return result;
  for (const key of Object.keys(result) as (keyof FieldListState)[]) {
    const entry = (value as Record<string, unknown>)[key];
    if (typeof entry !== "string" || entry.length > 500) continue;
    if (key === "group") { if (FIELD_GROUPS.includes(entry as FieldListState["group"])) result.group = entry as FieldListState["group"]; }
    else if (key !== "status" || FIELD_STATUSES.includes(entry as typeof FIELD_STATUSES[number])) result[key] = entry;
  }
  return result;
}
export function fieldStateKey(userId: string, projectId: string, revisionId: string) { return `quality:field-list:v1:${userId}:${projectId}:${revisionId}`; }
