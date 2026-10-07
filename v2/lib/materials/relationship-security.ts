import { MaterialsSecurityError } from "./access-policy";

export type RelatedRecord = Record<string, unknown> & { id: string };
export type ProjectRecordReader = (table: string, id: string) => Promise<RelatedRecord | null>;
const relatedTables: Record<string, string> = {
  towerId: "v2_towers", sourceTowerId: "v2_towers", destinationTowerId: "v2_towers", currentTowerId: "v2_towers",
  bundleId: "v2_material_bundles", materialItemId: "v2_material_register", baseMaterialItemId: "v2_material_register",
  deliveryId: "v2_material_deliveries", deliveryItemId: "v2_material_delivery_items",
  locationId: "v2_material_locations", sourceLocationId: "v2_material_locations", destinationLocationId: "v2_material_locations", currentLocationId: "v2_material_locations",
  reservationId: "v2_material_reservations", movementId: "v2_material_movements", issueId: "v2_material_issues",
  amendmentId: "v2_material_amendments", docketId: "v2_daily_dockets",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = () => { throw new MaterialsSecurityError("MATERIALS_RELATIONSHIP_INVALID", 422); };

// Reader must scope every lookup to the authorized project and canonical data organisation.
export async function validateMaterialRelationships(body: Record<string, unknown>, read: ProjectRecordReader) {
  const records = new Map<string, RelatedRecord>();
  for (const [field, table] of Object.entries(relatedTables)) {
    const value = body[field];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string" || !uuid.test(value)) fail();
    const row = await read(table, String(value));
    if (!row) throw new MaterialsSecurityError("MATERIALS_RELATIONSHIP_INVALID", 422);
    records.set(field, row);
  }
  if (body.bundleIds !== undefined) {
    if (!Array.isArray(body.bundleIds)) fail();
    for (const id of body.bundleIds as unknown[]) {
      await validateMaterialRelationships({ bundleId: id, towerId: body.towerId }, read);
    }
  }
  if (body.items !== undefined) {
    if (!Array.isArray(body.items)) fail();
    for (const item of body.items as unknown[]) {
      if (!item || typeof item !== "object" || Array.isArray(item)) fail();
      await validateMaterialRelationships({ ...(item as Record<string, unknown>), towerId: body.towerId }, read);
    }
  }
  const bundle = records.get("bundleId");
  const tower = records.get("towerId");
  const item = records.get("materialItemId") ?? records.get("baseMaterialItemId");
  if (bundle && tower && bundle.tower_id !== tower.id) fail();
  if (item && tower && item.tower_id !== null && item.tower_id !== tower.id) fail();
  if (item && bundle && item.bundle_id !== bundle.id) fail();
  const deliveryItem = records.get("deliveryItemId");
  if (deliveryItem) {
    const delivery = await read("v2_material_deliveries", String(deliveryItem.delivery_id));
    if (!delivery || (records.get("deliveryId") && delivery.id !== records.get("deliveryId")?.id)) fail();
    const linkedBundle = await read("v2_material_bundles", String(deliveryItem.bundle_id));
    if (!linkedBundle || linkedBundle.tower_id !== deliveryItem.tower_id) fail();
    if (bundle && deliveryItem.bundle_id !== bundle.id) fail();
    if (tower && deliveryItem.tower_id !== tower.id) fail();
  }
  for (const [locationKey, towerKey] of [["locationId", "towerId"], ["sourceLocationId", "sourceTowerId"], ["destinationLocationId", "destinationTowerId"], ["currentLocationId", "currentTowerId"]]) {
    const location = records.get(locationKey); const selectedTower = records.get(towerKey);
    if (location && selectedTower && location.tower_id != null && location.tower_id !== selectedTower.id) fail();
  }
  const issue = records.get("issueId");
  if (issue && item && issue.material_item_id != null && issue.material_item_id !== item.id) fail();
  if (issue && bundle && issue.bundle_id != null && issue.bundle_id !== bundle.id) fail();
  return records;
}
