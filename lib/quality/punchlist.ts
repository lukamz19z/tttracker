export const punchlistFields = ["tower", "externalReference", "member", "segment", "leg", "drawing", "defectType", "description", "inspectorComment", "sourceDate", "assignedFlag", "photos"] as const;
export type PunchlistRow = Record<typeof punchlistFields[number], string> & { rowKey: string; towerId?: string };
export function mapPunchlistRows(rows: Record<string, unknown>[], mapping: Record<string, string>): PunchlistRow[] {
  return rows.map((row, index) => ({ ...Object.fromEntries(punchlistFields.map(key => [key, String(row[mapping[key]] ?? "").trim()])), rowKey: String(index + 2) }) as PunchlistRow);
}
export function punchlistPhotoNames(value: string) { return value.split(/[;|\n]/).map(name => name.trim()).filter(Boolean); }
export function qualityItemMatches(item: { source_type?: string | null; external_reference?: string | null; fli_number?: string | null; status: string; finding?: string | null; other_issue_text?: string | null; member_number?: string | null; tower_segment?: string | null; leg?: string | null }, search: string, status: string, source: string) {
  const done = ["Rectified", "Verified"].includes(item.status);
  return (source === "All" || (source === "Imported" ? item.source_type === "punchlist" : item.source_type !== "punchlist"))
    && (status === "All" || (status === "Open" ? !done : status === "Rectified" ? done : item.status === status))
    && [item.fli_number, item.external_reference, item.member_number, item.tower_segment, item.leg, item.other_issue_text, item.finding].join(" ").toLowerCase().includes(search.trim().toLowerCase());
}

export function samePunchlistSource(a:Partial<PunchlistRow>|null|undefined,b:PunchlistRow){return Boolean(a && punchlistFields.every(key=>a[key]===b[key]));}
