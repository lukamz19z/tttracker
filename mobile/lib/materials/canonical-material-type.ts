export const CANONICAL_MATERIAL_TYPES = [
  "steel_member",
  "bolt",
  "nut",
  "washer",
  "flat_plate",
  "packer_spacer",
  "other",
] as const;

export type CanonicalMaterialType = (typeof CANONICAL_MATERIAL_TYPES)[number];

function knownType(value: unknown): CanonicalMaterialType | null {
  const token = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (["steel_member", "member", "steel"].includes(token)) return "steel_member";
  if (["bolt", "j_bolt", "jbolt", "anchor_bolt"].includes(token)) return "bolt";
  if (token === "nut") return "nut";
  if (token === "washer") return "washer";
  if (["flat_plate", "plate"].includes(token)) return "flat_plate";
  if (["packer", "packer_plate", "packer_spacer", "spacer"].includes(token)) return "packer_spacer";
  if (["other", "manual", "mesh", "grid_mesh", "bracket", "clip", "fitting", "consumable"].includes(token)) return "other";
  return null;
}

/**
 * Keep the constrained DB type canonical and independent of display category.
 * Register linkage takes precedence over user-facing text; manual entries use
 * category-only aliases when they match a known canonical material class.
 */
export function normalizeMissingMaterialType(input: {
  sourceTable?: unknown;
  sourceRecordId?: unknown;
  linkedType?: unknown;
  category?: unknown;
}): CanonicalMaterialType {
  const table = String(input.sourceTable ?? "").trim().toLowerCase();
  const linked = String(input.linkedType ?? "").trim().toLowerCase();
  const hasRegisterId = Boolean(String(input.sourceRecordId ?? "").trim());

  if (hasRegisterId && table.includes("member")) return "steel_member";
  if (hasRegisterId && table.includes("bundle")) return "other";
  if (hasRegisterId && table.includes("bolt")) {
    const actualType = knownType(linked);
    return actualType === "packer_spacer" || actualType === "nut" || actualType === "washer" || actualType === "flat_plate" || actualType === "bolt"
      ? actualType
      : "bolt";
  }
  if (hasRegisterId) return knownType(linked) || "other";
  return knownType(input.category) || "other";
}
