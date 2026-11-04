export const UNASSIGNED_LIFTING_GEAR_CREW = "__unassigned__";
export const MULTIPLE_LIFTING_GEAR_CREWS = "__multiple__";

export type LiftingGearBulkField =
  | "tag"
  | "inspected_on"
  | "next_inspection_due"
  | "event_type"
  | "comment"
  | "status"
  | "crew_id";

export type LiftingGearBulkValues = Record<LiftingGearBulkField, string>;
export type LiftingGearBulkCrew = {
  id: string;
  crew_number: string;
  crew_name: string | null;
};

export function getBulkCrewSelection(
  items: ReadonlyArray<{ crew_id: string | null }>,
) {
  const crewIds = new Set(
    items.map((item) => item.crew_id || UNASSIGNED_LIFTING_GEAR_CREW),
  );

  return crewIds.size > 1
    ? MULTIPLE_LIFTING_GEAR_CREWS
    : [...crewIds][0] ?? "";
}

export function buildLiftingGearBulkPatch({
  fields,
  values,
  crews,
  updatedAt,
}: {
  fields: ReadonlySet<LiftingGearBulkField>;
  values: LiftingGearBulkValues;
  crews: readonly LiftingGearBulkCrew[];
  updatedAt: string;
}) {
  const patch: Record<string, string | null> = { updated_at: updatedAt };

  for (const field of fields) {
    if (field === "crew_id") {
      if (values.crew_id === UNASSIGNED_LIFTING_GEAR_CREW) {
        patch.crew_id = null;
        patch.crew_label = null;
        continue;
      }

      const crew = crews.find((candidate) => candidate.id === values.crew_id);
      if (!crew) throw new Error("Choose a configured crew or Unassigned.");

      patch.crew_id = crew.id;
      patch.crew_label = `${crew.crew_number}${crew.crew_name ? ` - ${crew.crew_name}` : ""}`;
      continue;
    }

    const value = values[field].trim();
    patch[field] = value || null;
  }

  if (fields.size === 0) throw new Error("Choose at least one field to update.");
  return patch;
}
