import type { DailyDocketDraft } from "@/types/daily-dockets";

export type CopyableDocketValues = Pick<DailyDocketDraft,
  "crewName" | "leadingHand" | "weather" | "rateType" | "prestartMinutes" | "lunchBreakMinutes" |
  "travelInMinutes" | "travelOutMinutes" | "mobilisationHours" | "mobilisation" | "labourRows" | "plantRows" |
  "progressModel" | "legacyProgressRows" | "sectionV2Rows" | "hasBodyExtension" |
  "primaryWorkActivity" | "primaryWorkNotes" | "additionalTowerWork" | "towerRevisionAllocations"
>;

export type CopyPreviousResponse =
  | { found: false }
  | { found: true; previousDocketId: string; previousDocketDate: string; copy: CopyableDocketValues };

export const COPYABLE_DOCKET_FIELDS: (keyof CopyableDocketValues)[] = [
  "crewName", "leadingHand", "weather", "rateType", "prestartMinutes", "lunchBreakMinutes",
  "travelInMinutes", "travelOutMinutes", "mobilisationHours", "mobilisation", "labourRows", "plantRows",
  "progressModel", "legacyProgressRows", "sectionV2Rows", "hasBodyExtension",
  "primaryWorkActivity", "primaryWorkNotes", "additionalTowerWork", "towerRevisionAllocations",
];

/** Validate the narrow response, then construct one new-draft update. */
export function applyPreviousDocketSnapshot(
  current: DailyDocketDraft,
  response: CopyPreviousResponse,
): DailyDocketDraft | null {
  if (!response.found) return null;
  if (current.mode !== "create" || !current.docketId ||
      !response.previousDocketId || !/^\d{4}-\d{2}-\d{2}$/.test(response.previousDocketDate) ||
      response.previousDocketDate >= current.docketDate) throw new Error("Previous Daily Docket is not valid for this draft.");
  const copy = response.copy;
  if (!copy || !COPYABLE_DOCKET_FIELDS.every((field) => field in copy) ||
      !Array.isArray(copy.labourRows) || !Array.isArray(copy.plantRows) ||
      !Array.isArray(copy.sectionV2Rows) || !Array.isArray(copy.legacyProgressRows) ||
      !Array.isArray(copy.additionalTowerWork) || !Array.isArray(copy.towerRevisionAllocations)) throw new Error("Previous Daily Docket snapshot is incomplete.");
  const patch = Object.fromEntries(COPYABLE_DOCKET_FIELDS.map((field) => [field, copy[field]])) as CopyableDocketValues;
  // Keep the current draft's identity, workflow state, events, and signatures.
  return { ...current, ...patch };
}
