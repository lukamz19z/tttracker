import type { MaterialBundle, MaterialDeliveryItem } from "./types";

type Allocation = { id: string; delivery_number: string; status: string; items: MaterialDeliveryItem[] };
export type DeliveryAvailability = { state: "remaining" | "planned" | "delivered"; eligible: boolean; label: string };

/** Delivery evidence alone determines planning; site checks never participate. */
export function deliveryAvailability(bundle: Pick<MaterialBundle, "id" | "tower_id" | "required_quantity">, deliveries: readonly Allocation[]): DeliveryAvailability {
  let received = 0;
  const active: string[] = [];
  const partial: string[] = [];
  for (const delivery of deliveries) {
    for (const item of delivery.items.filter((row) => row.bundle_id === bundle.id && row.tower_id === bundle.tower_id)) {
      if (["delivered", "short"].includes(item.status)) received += Math.max(Number(item.delivered_quantity) || 0, 0);
      if (delivery.status !== "cancelled" && !["delivered", "short", "rejected", "cancelled"].includes(item.status)) active.push(delivery.delivery_number);
      if (item.status === "short" && Number(item.delivered_quantity) > 0) partial.push(delivery.delivery_number);
    }
  }
  if (received >= Math.max(Number(bundle.required_quantity) || 1, 1)) return { state: "delivered", eligible: false, label: "Delivered" };
  if (active.length) return { state: "planned", eligible: false, label: `Scheduled / ${[...new Set(active)].join(", ")}` };
  // Whole-pack selection cannot safely schedule a fractional remainder.
  if (received > 0) return { state: "planned", eligible: false, label: `Part delivered / ${[...new Set(partial)].join(", ")} / review required` };
  return { state: "remaining", eligible: true, label: "Available" };
}

export function deliveryCandidates(bundles: readonly MaterialBundle[], towerId: string, deliveries: readonly Allocation[]) {
  return bundles.filter((bundle) => bundle.tower_id === towerId).map((bundle) => ({ bundle, ...deliveryAvailability(bundle, deliveries) }));
}

export function bundleContextLabel(bundle: Pick<MaterialBundle, "package_context" | "segment">) {
  const text = [...new Set([bundle.package_context, bundle.segment].filter((value): value is string => Boolean(value)))].join(" / ");
  return text ? text.split(" / ").map((part) => part === part.toUpperCase() ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part).join(" / ") : "No context";
}
