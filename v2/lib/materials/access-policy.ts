import type { ProjectAccess } from "@/lib/projects/access";

export const materialsCapabilities = ["view", "import", "check_bundles", "manage_deliveries", "manage_issues", "manage_movements", "manage_reservations", "manage_amendments", "configure"] as const;
export type MaterialsCapability = typeof materialsCapabilities[number];
export class MaterialsSecurityError extends Error {
  constructor(message: string, public readonly status = 403) { super(message); }
}
export function requireMaterialsPermission(access: ProjectAccess, capability: MaterialsCapability) {
  if (!access.permissions["materials.view"] || !access.permissions[`materials.${capability}`]) {
    throw new MaterialsSecurityError("MATERIALS_PERMISSION_DENIED");
  }
  if (access.kind === "party" && capability !== "view" && capability !== "configure"
    && !access.parties.some((party) => ["selected_records", "live_filtered"].includes(party.sharingMode))) throw new MaterialsSecurityError("MATERIALS_SCOPE_DENIED");
  // Batch reconciliation/import can touch unshared rows. External scoped access cannot authorize these globally.
  if (access.kind === "party" && capability === "import") throw new MaterialsSecurityError("MATERIALS_SCOPE_DENIED");
}
export function canReadMaterialRecord(access: ProjectAccess, table: string, id: string): boolean {
  if (access.kind === "host") return true;
  return access.shares.some((share) => share.id === id && share.type === table);
}
export function requireMaterialRecordAccess(access: ProjectAccess, table: string, id: string) {
  if (!canReadMaterialRecord(access, table, id)) throw new MaterialsSecurityError("MATERIALS_RECORD_ACCESS_DENIED");
}
