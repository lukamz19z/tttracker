export type Ladder = {
  id: string;
  ladder_number: string;
  serial_number?: string | null;
  make: string | null;
  ladder_type: string | null;
  height: string | null;
  height_measurement_type?: string | null;
  crew_id: string | null;
  status: string | null;
  last_internal_inspection: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  supersedes_ladder_id: string | null;
  superseded_at: string | null;
};

export type LadderReference = Pick<Ladder, "id" | "ladder_number">;
export const ladderStatuses = ["Active", "Out of Service", "Missing", "Retired"];
export const ladderHeightMeasurements = ["Platform Height", "Overall Height", "Working Height", "Other"];
export const defaultLadderHeightMeasurement = "Platform Height";
export const ladderMeasurementLabel = (value: string | null | undefined) => value?.trim() || "Not specified";
export function ladderHeightLabel(value: string | null | undefined) {
  const height = value?.trim();
  if (!height) return "\u2014";
  // Keep stored text/units intact. Never infer units for a historical bare number.
  if (/^\d+(?:[.,]\d+)?$/.test(height)) return `${height} (unit not specified)`;
  return height.replace(/^(\d+(?:[.,]\d+)?)\s*(m|mm|cm|ft)$/i, "$1 $2");
}
export const ladderNumberKey = (value: string) => value.trim().toUpperCase();
export const ladderDetailHref = (id: string) => `/assets/equipment/records/ladder/${id}`;
export const duplicateLadderMessage = (number: string) =>
  `A ladder with register number ${number.trim()} already exists.`;

export function ladderRelations(item: Ladder, items: Ladder[]) {
  return {
    supersedes: items.find(row => row.id === item.supersedes_ladder_id) ?? null,
    supersededBy: items.find(row => row.supersedes_ladder_id === item.id) ?? null,
  };
}

export type LadderFilters = { search: string; crew: string; status: string; type: string; inspection: string };
export function filterLadders(items: Ladder[], filters: LadderFilters, crewLabel: (item: Ladder) => string, inspectionLabel: (value: string | null) => string) {
  const term = filters.search.trim().toLowerCase();
  return items.filter(item => {
    const crew = crewLabel(item), inspection = inspectionLabel(item.last_internal_inspection);
    const searchable = [item.ladder_number, item.serial_number, item.make, item.ladder_type,
      item.height, item.height_measurement_type, item.status, item.notes, item.last_internal_inspection, crew, inspection].join(" ").toLowerCase();
    return searchable.includes(term)
      && (filters.crew === "All Crews" || crew === filters.crew)
      && (filters.status === "All" || (item.status?.trim() || "Active") === filters.status)
      && (filters.type === "All Types" || item.ladder_type?.trim() === filters.type)
      && (filters.inspection === "All Inspections" || inspection === filters.inspection);
  });
}

export function ladderCsv(items: Ladder[], allItems: Ladder[], crewLabel: (item: Ladder) => string, inspectionLabel: (value: string | null) => string) {
  const headers = ["Ladder Register Number", "Serial Number", "Make", "Ladder Type", "Height", "Height Measurement", "Crew", "Status", "Last Internal Inspection", "Inspection Status", "Supersedes", "Superseded By", "Notes"];
  const rows = items.map(item => {
    const relations = ladderRelations(item, allItems);
    return [item.ladder_number, item.serial_number, item.make, item.ladder_type, item.height,
      ladderMeasurementLabel(item.height_measurement_type), crewLabel(item), item.status || "Active",
      item.last_internal_inspection, inspectionLabel(item.last_internal_inspection),
      relations.supersedes?.ladder_number, relations.supersededBy?.ladder_number, item.notes];
  });
  const safe = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return "\ufeff" + [headers, ...rows].map(row => row.map(safe).join(",")).join("\r\n");
}
