import type { ProjectAccess } from "@/lib/projects/access";
import type { MaterialsControlPayload } from "./types";
import { canReadMaterialRecord, materialsCapabilities } from "./access-policy";

export function filterMaterialsPayload(payload: MaterialsControlPayload, access: ProjectAccess): MaterialsControlPayload {
  const permissions = Object.fromEntries(materialsCapabilities.map((key) => [key, access.permissions[`materials.${key}`] === true && !(access.kind === "party" && key === "import")])) as Record<typeof materialsCapabilities[number], boolean>;
  if (access.kind === "host") return { ...payload, permissions };
  const visible = (table: string, id: string) => canReadMaterialRecord(access, table, id);
  const bundles = payload.bundles.filter((row) => visible("v2_material_bundles", row.id));
  const issues = access.permissions["materials.issues.view"] ? payload.issues.filter((row) => visible("v2_material_issues", row.id)) : [];
  const deliveries = payload.deliveries.filter((row) => visible("v2_material_deliveries", row.id)).map((delivery) => ({ ...delivery,
    items: delivery.items.filter((item) => visible("v2_material_delivery_items", item.id) && visible("v2_material_bundles", item.bundle_id)) }));
  const movements = payload.movements.filter((row) => visible("v2_material_movements", row.id));
  const reservations = payload.reservations.filter((row) => visible("v2_material_reservations", row.id));
  const amendments = payload.amendments.filter((row) => visible("v2_material_amendments", row.id));
  return { ...payload, permissions, bundles, issues, deliveries, movements, reservations, amendments,
    towers: payload.towers.filter((row) => visible("v2_towers", row.id)),
    locations: payload.locations.filter((row) => visible("v2_material_locations", row.id)),
    findings: payload.findings.filter((row) => visible("v2_material_reconciliation_findings", row.id)),
    dockets: [], // Daily Dockets have a separate portal section; Materials access does not grant it.
    options: payload.options.map((row) => ({ ...row, settings: null })),
    metrics: { ...payload.metrics, bundleCount: bundles.length,
      checkedBundles: bundles.filter((row) => row.check && row.check.status !== "not_checked").length,
      memberCount: 0, boltCount: 0, packerCount: 0,
      openMissing: issues.filter((row) => row.issue_type_key === "missing" && !["resolved", "closed"].includes(row.status)).length,
      openExcess: issues.filter((row) => row.issue_type_key === "excess" && !["resolved", "closed"].includes(row.status)).length,
      outstandingMissingQty: issues.filter((row) => row.issue_type_key === "missing").reduce((sum, row) => sum + Math.max(row.quantity_affected-row.quantity_resolved,0),0),
      inTransit: movements.filter((row) => row.status === "in_transit").length,
      deliveryItemsDelivered: deliveries.flatMap((row) => row.items).filter((row) => row.status === "delivered").length,
      awaitingSiteVerification: 0, openReconciliation: 0,
      activeReservations: reservations.filter((row) => row.status === "reserved").length,
    },
  };
}
