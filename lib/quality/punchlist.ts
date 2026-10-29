export const punchlistFields = ["tower", "externalReference", "member", "segment", "leg", "drawing", "defectType", "description", "inspector", "inspectorComment", "sourceDate", "assignedFlag", "photos"] as const;
export type PunchlistRow = Record<typeof punchlistFields[number], string> & { rowKey: string; towerId?: string };
export function mapPunchlistRows(rows: Record<string, unknown>[], mapping: Record<string, string>): PunchlistRow[] {
  return rows.map((row, index) => ({ ...Object.fromEntries(punchlistFields.map(key => [key, String(row[mapping[key]] ?? "").trim()])), rowKey: String(index + 2) }) as PunchlistRow);
}
export function punchlistPhotoNames(value: string) { return value.split(/[;|\n]/).map(name => name.trim()).filter(Boolean); }
export function suggestPunchlistMapping(columns: string[]) {
  const aliases: Record<string, string[]> = { externalReference: ["externaldefectnumber", "externalreference", "referencenumber"], inspector: ["inspector", "inspectedby", "raisedby"] };
  return Object.fromEntries(punchlistFields.map(key => [key, columns.find(column => [key.toLowerCase(), ...(aliases[key] || [])].includes(column.toLowerCase().replace(/[^a-z]/g, ""))) || ""]));
}
/** Exact reference followed only by an optional numeric image suffix. Never fuzzy match. */
export function matchPunchlistPhotos(rows: PunchlistRow[], files: {name:string}[], assignments: Record<number,string> = {}) {
  const matches = files.map((file, index) => {
    const name = file.name.toUpperCase(), stem = name.replace(/\.[^.]+$/, "");
    const candidates = rows.filter(row => {
      if (punchlistPhotoNames(row.photos).some(photo => photo.toUpperCase() === name)) return true;
      const reference = row.externalReference.trim().toUpperCase();
      return reference && (stem === reference || (stem.startsWith(reference) && /^[_ -]\d+$/.test(stem.slice(reference.length))));
    });
    const assigned = assignments[index];
    const rowKey = assigned === "skip" ? null : assigned ? rows.find(row => row.rowKey === assigned)?.rowKey : candidates.length === 1 ? candidates[0].rowKey : null;
    return {index, rowKey:rowKey || null, candidates:candidates.map(row=>row.rowKey), state:assigned === "skip" ? "skipped" : rowKey ? "matched" : candidates.length > 1 ? "ambiguous" : "unmatched"};
  });
  const duplicateReferences = [...new Set(rows.filter((row,index)=>rows.some((other,j)=>j!==index && other.externalReference.trim().toUpperCase()===row.externalReference.trim().toUpperCase())).map(row=>row.externalReference))];
  return {matches, duplicateReferences, findingsWithoutPhotos:rows.filter(row=>!matches.some(match=>match.rowKey===row.rowKey))};
}
export function qualityItemMatches(item: { source_type?: string | null; external_reference?: string | null; fli_number?: string | null; status: string; finding?: string | null; other_issue_text?: string | null; member_number?: string | null; tower_segment?: string | null; leg?: string | null }, search: string, status: string, source: string) {
  const done = ["Rectified", "Verified"].includes(item.status);
  return (source === "All" || (source === "Imported" ? item.source_type === "punchlist" : item.source_type !== "punchlist"))
    && (status === "All" || (status === "Open" ? !done : status === "Rectified" ? done : item.status === status))
    && [item.fli_number, item.external_reference, item.member_number, item.tower_segment, item.leg, item.other_issue_text, item.finding].join(" ").toLowerCase().includes(search.trim().toLowerCase());
}

export function samePunchlistSource(a:Partial<PunchlistRow>|null|undefined,b:PunchlistRow){return Boolean(a && punchlistFields.every(key=>a[key]===b[key]));}
