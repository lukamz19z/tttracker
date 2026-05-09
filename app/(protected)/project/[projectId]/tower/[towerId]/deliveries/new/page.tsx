"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

type Tower = {
  id: string;
  name?: string | null;
  tower_number?: string | null;
  structure_number?: string | null;
  tower_no?: string | null;
  line?: string | null;
  extra_data?: Record<string, unknown> | null;
};

type Bundle = {
  bundle_no: string;
  section: string | null;
  qty_required: number;
};

type DeliveryItem = {
  bundle_no: string;
  qty_delivered: number;
};

type Delivery = {
  id: string;
  delivered_by: string | null;
  vehicle: string | null;
  created_at: string;
  tower_bundle_delivery_items: DeliveryItem[];
};

function safeString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function getTowerLabel(tower: Tower | null): string {
  if (!tower) return "Tower";
  const extra = tower.extra_data || {};
  return (
    safeString(tower.tower_number) ||
    safeString(tower.structure_number) ||
    safeString(tower.tower_no) ||
    safeString(tower.name) ||
    safeString(extra["Tower No"]) ||
    safeString(extra["Tower Number"]) ||
    safeString(extra["Structure Number"]) ||
    "Tower"
  );
}

export default function DriverDeliveryPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [tower, setTower] = useState<Tower | null>(null);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [search, setSearch] = useState("");
  const [deliveredBy, setDeliveredBy] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const [editingDeliveryId, setEditingDeliveryId] = useState<string | null>(null);
  const [editDeliveredBy, setEditDeliveredBy] = useState("");
  const [editVehicle, setEditVehicle] = useState("");
  const [editQtyMap, setEditQtyMap] = useState<Record<string, number>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!towerId) return;

    let cancelled = false;

    async function run() {
      setLoading(true);

      const [towerRes, bundleRes, deliveryRes] = await Promise.all([
        supabase.from("towers").select("*").eq("id", towerId).single(),
        supabase
          .from("tower_required_bundles")
          .select("*")
          .eq("tower_id", towerId)
          .order("section")
          .order("bundle_no"),
        supabase
          .from("tower_bundle_deliveries")
          .select("*, tower_bundle_delivery_items(*)")
          .eq("tower_id", towerId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      if (cancelled) return;

      if (towerRes.error) console.error("tower load error", towerRes.error);
      if (bundleRes.error) console.error("bundle load error", bundleRes.error);
      if (deliveryRes.error) console.error("delivery load error", deliveryRes.error);

      setTower((towerRes.data as Tower | null) ?? null);
      setBundles((bundleRes.data as Bundle[]) ?? []);
      setDeliveries((deliveryRes.data as Delivery[]) ?? []);
      setLoading(false);
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [towerId, reloadKey, supabase]);

  const deliveredTotals = useMemo(() => {
    const map: Record<string, number> = {};
    deliveries.forEach((delivery) => {
      delivery.tower_bundle_delivery_items?.forEach((item) => {
        map[item.bundle_no] = (map[item.bundle_no] || 0) + safeNumber(item.qty_delivered, 0);
      });
    });
    return map;
  }, [deliveries]);

  const filteredBundles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bundles;

    return bundles.filter((bundle) => {
      const text = [bundle.bundle_no, bundle.section || ""].join(" ").toLowerCase();
      return text.includes(q);
    });
  }, [bundles, search]);

  const selectedQty = useMemo(
    () => Object.values(qtyMap).reduce((sum, value) => sum + safeNumber(value, 0), 0),
    [qtyMap],
  );

  async function saveDelivery() {
    const items = Object.entries(qtyMap)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([bundle_no, qty]) => ({ bundle_no, qty_delivered: Number(qty) }));

    if (!deliveredBy.trim()) {
      alert("Enter driver / delivered by name.");
      return;
    }

    if (!items.length) {
      alert("Enter at least one delivered quantity.");
      return;
    }

    setSaving(true);

    const { data, error } = await supabase
      .from("tower_bundle_deliveries")
      .insert({ tower_id: towerId, delivered_by: deliveredBy, vehicle })
      .select()
      .single();

    if (error || !data) {
      setSaving(false);
      alert(error?.message || "Failed to save delivery docket.");
      return;
    }

    const payload = items.map((item) => ({
      delivery_id: data.id,
      bundle_no: item.bundle_no,
      qty_delivered: item.qty_delivered,
    }));

    const { error: itemError } = await supabase.from("tower_bundle_delivery_items").insert(payload);

    setSaving(false);

    if (itemError) {
      alert(itemError.message || "Failed to save delivery items.");
      return;
    }

    setQtyMap({});
    setSearch("");
    setReloadKey((v) => v + 1);
    alert("Delivery docket submitted.");
  }

  function startEditDelivery(delivery: Delivery) {
    const map: Record<string, number> = {};
    delivery.tower_bundle_delivery_items.forEach((item) => {
      map[item.bundle_no] = safeNumber(item.qty_delivered, 0);
    });

    setEditingDeliveryId(delivery.id);
    setEditDeliveredBy(delivery.delivered_by || "");
    setEditVehicle(delivery.vehicle || "");
    setEditQtyMap(map);
  }

  function cancelEditDelivery() {
    setEditingDeliveryId(null);
    setEditDeliveredBy("");
    setEditVehicle("");
    setEditQtyMap({});
  }

  async function saveEditDelivery() {
    if (!editingDeliveryId) return;

    const items = Object.entries(editQtyMap)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([bundle_no, qty]) => ({ delivery_id: editingDeliveryId, bundle_no, qty_delivered: Number(qty) }));

    if (!items.length) {
      alert("Enter at least one delivered quantity.");
      return;
    }

    setSavingEdit(true);

    const { error: updateError } = await supabase
      .from("tower_bundle_deliveries")
      .update({ delivered_by: editDeliveredBy, vehicle: editVehicle })
      .eq("id", editingDeliveryId);

    if (updateError) {
      setSavingEdit(false);
      alert(updateError.message || "Failed to update delivery docket.");
      return;
    }

    const { error: deleteError } = await supabase
      .from("tower_bundle_delivery_items")
      .delete()
      .eq("delivery_id", editingDeliveryId);

    if (deleteError) {
      setSavingEdit(false);
      alert(deleteError.message || "Failed to update delivery items.");
      return;
    }

    const { error: insertError } = await supabase.from("tower_bundle_delivery_items").insert(items);

    setSavingEdit(false);

    if (insertError) {
      alert(insertError.message || "Failed to save edited delivery quantities.");
      return;
    }

    cancelEditDelivery();
    setReloadKey((v) => v + 1);
  }

  if (loading) {
    return <div className="p-8">Loading delivery docket...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="rounded-[2rem] bg-slate-950 text-white p-5 md:p-7 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Driver Delivery Docket</p>
              <h1 className="text-2xl md:text-3xl font-black mt-1">{getTowerLabel(tower)}</h1>
              <p className="text-slate-300 mt-1">Simple entry page for delivered bundles. Updates the same register and Materials page.</p>
            </div>

            <Link
              href={`/project/${projectId}/tower/${towerId}/deliveries`}
              className="px-4 py-2 rounded-xl bg-white text-slate-950 text-sm font-semibold text-center"
            >
              Back to Register
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-600">Delivered By</span>
              <input
                value={deliveredBy}
                onChange={(e) => setDeliveredBy(e.target.value)}
                placeholder="Driver / name"
                className="w-full border border-slate-300 rounded-2xl px-4 py-3 text-sm"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-600">Vehicle / Truck</span>
              <input
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
                placeholder="Rego / truck"
                className="w-full border border-slate-300 rounded-2xl px-4 py-3 text-sm"
              />
            </label>
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bundle number or section..."
            className="w-full border border-slate-300 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 grid grid-cols-[1fr_90px] gap-2">
              <div>Bundle</div>
              <div>Qty</div>
            </div>

            <div className="divide-y divide-slate-100 max-h-[520px] overflow-auto">
              {filteredBundles.length === 0 ? (
                <div className="p-6 text-center text-slate-500">No bundles found.</div>
              ) : (
                filteredBundles.map((bundle) => (
                  <div key={bundle.bundle_no} className="grid grid-cols-[1fr_90px] gap-2 p-3 items-center">
                    <div>
                      <div className="font-bold text-slate-900">{bundle.bundle_no}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {bundle.section || "General"} • Required {safeNumber(bundle.qty_required)} • Previously delivered {deliveredTotals[bundle.bundle_no] || 0}
                      </div>
                    </div>

                    <input
                      type="number"
                      min="0"
                      value={qtyMap[bundle.bundle_no] ?? ""}
                      onChange={(e) => setQtyMap((prev) => ({ ...prev, [bundle.bundle_no]: Number(e.target.value) }))}
                      placeholder="0"
                      className="border border-slate-300 rounded-xl px-3 py-2 text-sm w-full"
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-2xl bg-slate-50 border border-slate-200 p-4">
            <div>
              <div className="text-xs font-semibold text-slate-500">Selected Quantity</div>
              <div className="text-2xl font-black text-slate-950">{selectedQty}</div>
            </div>

            <button
              onClick={() => void saveDelivery()}
              disabled={saving}
              className="px-5 py-3 rounded-2xl bg-slate-950 text-white text-sm font-bold hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "Submitting..." : "Submit Delivery Docket"}
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="font-black text-slate-950">Recent Dockets</h2>
              <p className="text-xs text-slate-500">Drivers can edit recent dockets here if a mistake is made.</p>
            </div>
          </div>

          {deliveries.length === 0 ? (
            <div className="text-sm text-slate-500">No recent deliveries.</div>
          ) : (
            <div className="space-y-3">
              {deliveries.map((delivery) => {
                const isEditing = editingDeliveryId === delivery.id;
                const totalQty = delivery.tower_bundle_delivery_items.reduce((sum, item) => sum + safeNumber(item.qty_delivered), 0);
                const itemText = delivery.tower_bundle_delivery_items.map((item) => `${item.bundle_no} × ${item.qty_delivered}`).join(", ");

                if (isEditing) {
                  return (
                    <div key={delivery.id} className="rounded-2xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-900">Editing Docket</div>
                          <div className="text-xs text-slate-500">{formatDateTime(delivery.created_at)}</div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={cancelEditDelivery} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold">Cancel</button>
                          <button onClick={() => void saveEditDelivery()} disabled={savingEdit} className="px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-60">
                            {savingEdit ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-3">
                        <input value={editDeliveredBy} onChange={(e) => setEditDeliveredBy(e.target.value)} placeholder="Delivered by" className="border border-slate-300 rounded-xl px-3 py-2.5 text-sm" />
                        <input value={editVehicle} onChange={(e) => setEditVehicle(e.target.value)} placeholder="Vehicle / truck" className="border border-slate-300 rounded-xl px-3 py-2.5 text-sm" />
                      </div>

                      <div className="rounded-2xl border border-blue-100 bg-white overflow-hidden">
                        <div className="divide-y divide-slate-100 max-h-[320px] overflow-auto">
                          {bundles.map((bundle) => (
                            <div key={`${delivery.id}-${bundle.bundle_no}`} className="grid grid-cols-[1fr_90px] gap-2 p-3 items-center">
                              <div>
                                <div className="font-semibold text-slate-900">{bundle.bundle_no}</div>
                                <div className="text-xs text-slate-500">{bundle.section || "General"}</div>
                              </div>
                              <input
                                type="number"
                                min="0"
                                value={editQtyMap[bundle.bundle_no] ?? ""}
                                onChange={(e) => setEditQtyMap((prev) => ({ ...prev, [bundle.bundle_no]: Number(e.target.value) }))}
                                className="border border-slate-300 rounded-xl px-3 py-2 text-sm"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={delivery.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div>
                        <div className="font-bold text-slate-900">{delivery.delivered_by || "—"} · {delivery.vehicle || "—"}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{formatDateTime(delivery.created_at)}</div>
                        <div className="text-sm text-slate-600 mt-2">{itemText || "No items"}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-xl bg-slate-100 px-3 py-1 text-sm font-bold text-slate-800">Qty {totalQty}</span>
                        <button onClick={() => startEditDelivery(delivery)} className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">Edit</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
