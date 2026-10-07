export type ImportCategory = "bundles" | "members" | "bolts" | "packers";
export type ImportMode = "add" | "merge" | "replace";
export type ImportRowError = { row: number; message: string };
export type PreparedImportRow = {
  row_number: number;
  values: Record<string, string | number>;
  raw_payload: Record<string, unknown>;
};
const textFields = [
  "package_context", "applicable_towers", "tower_reference", "item_reference", "bundle_reference", "segment", "drawing_reference",
  "drawing_revision", "source_revision", "description", "profile", "material_code",
  "diameter", "length", "bolt_type", "packer_mark", "material_item_id", "bundle_id",
] as const;
const numericFields = ["required_quantity", "total_weight_t"] as const;
const requiredFields: Record<ImportCategory, string[]> = {
  bundles: ["bundle_reference"], members: ["item_reference"],
  bolts: ["diameter", "required_quantity", "drawing_reference"],
  packers: ["packer_mark", "required_quantity", "drawing_reference"],
};
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** Cached spreadsheet values may be blank even when a cell has a formula or formatting. */
export function isEmptySourceCell(value: unknown): boolean {
  if (value == null || (typeof value === "string" && !value.trim())) return true;
  if (isRecord(value)) {
    if ("v" in value) return isEmptySourceCell(value.v);
    // Formula without a cached result is unknown, not safely empty.
    if (value.f) return false;
    return Object.keys(value).every((key) => ["s", "t", "z"].includes(key));
  }
  return false;
}
export function isEmptySourceRow(row: unknown): boolean {
  return Array.isArray(row) ? row.every(isEmptySourceCell)
    : isRecord(row) && Object.values(row).every(isEmptySourceCell);
}
export function importValidationCounts(total: number, errors: ImportRowError[], applied = 0) {
  const invalid = new Set(errors.map((error) => error.row)).size;
  return { validRows: Math.max(0, total - invalid), invalidRows: invalid, appliedRows: applied };
}
export function groupImportErrors(errors: ImportRowError[]) {
  const groups = new Map<string, ImportRowError[]>();
  for (const error of errors) {
    const key = error.message.replace(/^(Unmatched|Ambiguous) tower:.*$/, "$1 tower").replace(/: '[^']*' is not a non-negative decimal\./, ": invalid quantity.");
    groups.set(key, [...(groups.get(key) ?? []), error]);
  }
  return [...groups].map(([message, rows]) => ({ message, rows }));
}
/** No database writes: blank/unmapped fields are omitted, never defaulted. */
export function prepareImportRows(
  rows: unknown[], mapping: Record<string, unknown>, category: ImportCategory, sourceRowNumbers?: number[],
): { rows: PreparedImportRow[]; rowErrors: ImportRowError[]; ignoredEmptyRows: number; validRows: number; invalidRows: number; appliedRows: number } {
  const prepared: PreparedImportRow[] = [];
  const rowErrors: ImportRowError[] = [];
  let ignoredEmptyRows = 0;
  rows.forEach((raw, index) => {
    const row = sourceRowNumbers?.[index] ?? index + 2;
    if (isEmptySourceRow(raw)) { ignoredEmptyRows += 1; return; }
    if (!isRecord(raw)) { rowErrors.push({ row, message: "Expected a column/value record." }); return; }
    const values: Record<string, string | number> = {};
    for (const key of [...textFields, ...numericFields]) {
      const header = mapping[key];
      if (typeof header !== "string" || !header.trim()) continue;
      if (!(header in raw)) { rowErrors.push({ row, message: `Mapped column '${header}' is absent (${key}).` }); continue; }
      const incoming = raw[header];
      if (incoming == null || (typeof incoming === "string" && !incoming.trim())) continue;
      if (typeof incoming !== "string" && typeof incoming !== "number") {
        rowErrors.push({ row, message: `${key} must be text or a number.` }); continue;
      }
      const text = String(incoming).trim();
      if (numericFields.some((field) => field === key)) {
        if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) {
          rowErrors.push({ row, message: `${key}: '${text}' is not a non-negative decimal.` }); continue;
        }
        const number = Number(text.replaceAll(",", ""));
        if (!Number.isFinite(number) || number > Number.MAX_SAFE_INTEGER) {
          rowErrors.push({ row, message: `${key} is outside the supported numeric range.` }); continue;
        }
        values[key] = number;
      } else {
        if ((key === "bundle_id" || key === "material_item_id") && !uuidPattern.test(text)) {
          rowErrors.push({ row, message: `${key} must be a UUID.` });
        }
        values[key] = text;
      }
    }
    for (const field of requiredFields[category]) {
      if (values[field] === undefined) rowErrors.push({ row, message: `${field} is required.` });
    }
    if (category === "bolts" && !values.item_reference) {
      values.item_reference = [values.diameter, values.length, values.bolt_type].filter(Boolean).join(" ");
    }
    if (category === "packers" && !values.item_reference) {
      values.item_reference = [values.diameter, values.packer_mark].filter(Boolean).join(" ");
    }
    prepared.push({ row_number: row, values, raw_payload: raw });
  });
  return { rows: prepared, rowErrors, ignoredEmptyRows, ...importValidationCounts(rows.length - ignoredEmptyRows, rowErrors) };
}
