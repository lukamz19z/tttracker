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

type BundleStatus = Bundle & {
  required: number;
  delivered: number;
  remaining: number;
  percent: number;
  isComplete: boolean;
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

function clampQty(value: unknown, max: number): number {
  const next = Math.floor(Math.max(0, safeNumber(value, 0)));
  return Math.min(next, Math.max(0, Math.floor(max)));
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
          .limit(20),
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

  const bundleStatus = useMemo<BundleStatus[]>(() => {
    return bundles.map((bundle) => {
      const required = Math.max(0, safeNumber(bundle.qty_required, 0));
      const delivered = Math.max(0, deliveredTotals[bundle.bundle_no] || 0);
      const remaining = Math.max(0, required - delivered);
      const percent = required > 0 ? Math.min(100, Math.round((delivered / required) * 100)) : 0;

      return {
        ...bundle,
        required,
        delivered,
        remaining,
        percent,
        isComplete: required > 0 && delivered >= required,
      };
    });
  }, [bundles, deliveredTotals]);

  const filteredBundles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bundleStatus;

    return bundleStatus.filter((bundle) => {
      const text = [bundle.bundle_no, bundle.section || ""].join(" ").toLowerCase();
      return text.includes(q);
    });
  }, [bundleStatus, search]);

  const totalRequired = useMemo(
    () => bundleStatus.reduce((sum, bundle) => sum + bundle.required, 0),
    [bundleStatus],
  );

  const totalDelivered = useMemo(
    () => bundleStatus.reduce((sum, bundle) => sum + bundle.delivered, 0),
    [bundleStatus],
  );

  const totalRemaining = Math.max(0, totalRequired - totalDelivered);
  const deliveryPercent = totalRequired > 0 ? Math.min(100, Math.round((totalDelivered / totalRequired) * 100)) : 0;

  const selectedQty = useMemo(
    () => Object.values(qtyMap).reduce((sum, value) => sum + safeNumber(value, 0), 0),
    [qtyMap],
  );

  const selectedLines = useMemo(
    () => Object.entries(qtyMap).filter(([, qty]) => safeNumber(qty, 0) > 0).length,
    [qtyMap],
  );

  function remainingForBundle(bundleNo: string): number {
    const bundle = bundleStatus.find((item) => item.bundle_no === bundleNo);
    return bundle?.remaining ?? 0;
  }

  function updateQty(bundleNo: string, rawValue: string) {
    const max = remainingForBundle(bundleNo);
    const next = rawValue === "" ? 0 : clampQty(rawValue, max);

    setQtyMap((prev) => {
      const copy = { ...prev };
      if (next <= 0) delete copy[bundleNo];
      else copy[bundleNo] = next;
      return copy;
    });
  }

  function getOriginalEditQty(bundleNo: string): number {
    const delivery = deliveries.find((item) => item.id === editingDeliveryId);
    if (!delivery) return 0;
    return delivery.tower_bundle_delivery_items
      .filter((item) => item.bundle_no === bundleNo)
      .reduce((sum, item) => sum + safeNumber(item.qty_delivered, 0), 0);
  }

  function maxEditQtyForBundle(bundleNo: string): number {
    const bundle = bundles.find((item) => item.bundle_no === bundleNo);
    const required = safeNumber(bundle?.qty_required, 0);
    const deliveredIncludingThisDocket = deliveredTotals[bundleNo] || 0;
    const originalThisDocketQty = getOriginalEditQty(bundleNo);
    const deliveredByOtherDockets = Math.max(0, deliveredIncludingThisDocket - originalThisDocketQty);

    return Math.max(0, required - deliveredByOtherDockets);
  }

  function updateEditQty(bundleNo: string, rawValue: string) {
    const max = maxEditQtyForBundle(bundleNo);
    const next = rawValue === "" ? 0 : clampQty(rawValue, max);

    setEditQtyMap((prev) => {
      const copy = { ...prev };
      if (next <= 0) delete copy[bundleNo];
      else copy[bundleNo] = next;
      return copy;
    });
  }

  function validateItems(items: DeliveryItem[], editMode = false): string | null {
    for (const item of items) {
      const bundle = bundles.find((b) => b.bundle_no === item.bundle_no);
      const required = safeNumber(bundle?.qty_required, 0);
      const currentDelivered = deliveredTotals[item.bundle_no] || 0;
      const allowed = editMode ? maxEditQtyForBundle(item.bundle_no) : Math.max(0, required - currentDelivered);

      if (safeNumber(item.qty_delivered, 0) > allowed) {
        return `${item.bundle_no} only has ${allowed} remaining. Reduce the delivered quantity before saving.`;
      }
    }

    return null;
  }

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

    const validationError = validateItems(items);
    if (validationError) {
      alert(validationError);
      return;
    }

    setSaving(true);

    const { data, error } = await supabase
      .from("tower_bundle_deliveries")
      .insert({ tower_id: towerId, delivered_by: deliveredBy.trim(), vehicle: vehicle.trim() })
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

    if (!editDeliveredBy.trim()) {
      alert("Enter driver / delivered by name.");
      return;
    }

    if (!items.length) {
      alert("Enter at least one delivered quantity.");
      return;
    }

    const validationError = validateItems(items, true);
    if (validationError) {
      alert(validationError);
      return;
    }

    setSavingEdit(true);

    const { error: updateError } = await supabase
      .from("tower_bundle_deliveries")
      .update({ delivered_by: editDeliveredBy.trim(), vehicle: editVehicle.trim() })
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
      <div className="mx-auto max-w-5xl space-y-5 pb-28">
        <div className="rounded-[2rem] bg-slate-950 text-white p-5 md:p-7 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Driver Delivery Docket</p>
              <h1 className="text-2xl md:text-3xl font-black mt-1">{getTowerLabel(tower)}</h1>
              <p className="text-slate-300 mt-1">Enter delivered bundles only. The page prevents over-delivery and updates Materials automatically.</p>
            </div>

            <Link
              href={`/project/${projectId}/tower/${towerId}/deliveries`}
              className="px-4 py-2 rounded-xl bg-white text-slate-950 text-sm font-semibold text-center"
            >
              Back to Register
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Delivery Progress</div>
            <div className="text-3xl font-black text-slate-950 mt-1">{deliveryPercent}%</div>
            <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${deliveryPercent}%` }} />
            </div>
          </div>

          <div className="rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Required</div>
            <div className="text-3xl font-black text-slate-950 mt-1">{totalRequired}</div>
            <div className="text-xs text-slate-500 mt-1">total bundle qty</div>
          </div>

          <div className="rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Delivered</div>
            <div className="text-3xl font-black text-emerald-700 mt-1">{totalDelivered}</div>
            <div className="text-xs text-slate-500 mt-1">already received</div>
          </div>

          <div className="rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Remaining</div>
            <div className="text-3xl font-black text-amber-700 mt-1">{totalRemaining}</div>
            <div className="text-xs text-slate-500 mt-1">still outstanding</div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">New Delivery Docket</h2>
              <p className="text-xs text-slate-500">Only bundles with remaining quantity can be entered.</p>
            </div>

            <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm">
              <span className="text-slate-500 font-semibold">Selected:</span>{" "}
              <span className="font-black text-slate-950">{selectedQty}</span>{" "}
              <span className="text-slate-400">across {selectedLines} bundle{selectedLines === 1 ? "" : "s"}</span>
            </div>
          </div>

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
            <div className="hidden md:grid bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 grid-cols-[1.4fr_90px_90px_90px_90px] gap-2">
              <div>Bundle</div>
              <div className="text-right">Required</div>
              <div className="text-right">Delivered</div>
              <div className="text-right">Remaining</div>
              <div className="text-right">Add Qty</div>
            </div>

            <div className="divide-y divide-slate-100 max-h-[620px] overflow-auto">
              {filteredBundles.length === 0 ? (
                <div className="p-6 text-center text-slate-500">No bundles found.</div>
              ) : (
                filteredBundles.map((bundle) => {
                  const selected = qtyMap[bundle.bundle_no] ?? "";
                  const complete = bundle.isComplete;

                  return (
                    <div
                      key={bundle.bundle_no}
                      className={`grid md:grid-cols-[1.4fr_90px_90px_90px_90px] gap-2 p-3 items-center ${complete ? "bg-emerald-50/60" : "bg-white"}`}
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-bold text-slate-900">{bundle.bundle_no}</div>
                          {complete ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">Complete</span>
                          ) : (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-700">{bundle.remaining} remaining</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{bundle.section || "General"}</div>
                        <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${bundle.percent}%` }} />
                        </div>

                        <div className="md:hidden grid grid-cols-3 gap-2 mt-3 text-xs">
                          <div className="rounded-xl bg-slate-50 border border-slate-200 p-2">
                            <div className="text-slate-500">Required</div>
                            <div className="font-black text-slate-900">{bundle.required}</div>
                          </div>
                          <div className="rounded-xl bg-slate-50 border border-slate-200 p-2">
                            <div className="text-slate-500">Delivered</div>
                            <div className="font-black text-emerald-700">{bundle.delivered}</div>
                          </div>
                          <div className="rounded-xl bg-slate-50 border border-slate-200 p-2">
                            <div className="text-slate-500">Remaining</div>
                            <div className="font-black text-amber-700">{bundle.remaining}</div>
                          </div>
                        </div>
                      </div>

                      <div className="hidden md:block text-right text-sm font-black text-slate-800">{bundle.required}</div>
                      <div className="hidden md:block text-right text-sm font-black text-emerald-700">{bundle.delivered}</div>
                      <div className="hidden md:block text-right text-sm font-black text-amber-700">{bundle.remaining}</div>

                      <input
                        type="number"
                        min="0"
                        max={bundle.remaining}
                        disabled={complete}
                        value={selected}
                        onChange={(e) => updateQty(bundle.bundle_no, e.target.value)}
                        placeholder="0"
                        className="border border-slate-300 rounded-xl px-3 py-2 text-sm w-full disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-right font-bold"
                      />
                    </div>
                  );
                })
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
              disabled={saving || selectedQty <= 0}
              className="px-5 py-3 rounded-2xl bg-slate-950 text-white text-sm font-bold hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? "Submitting..." : "Submit Delivery Docket"}
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="font-black text-slate-950">Recent Dockets</h2>
              <p className="text-xs text-slate-500">Drivers can edit recent dockets here if a mistake is made. Edits also cannot over-deliver.</p>
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
                  const editSelectedQty = Object.values(editQtyMap).reduce((sum, value) => sum + safeNumber(value, 0), 0);

                  return (
                    <div key={delivery.id} className="rounded-2xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-900">Editing Docket</div>
                          <div className="text-xs text-slate-500">{formatDateTime(delivery.created_at)} · Selected qty {editSelectedQty}</div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={cancelEditDelivery} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold">Cancel</button>
                          <button onClick={() => void saveEditDelivery()} disabled={savingEdit || editSelectedQty <= 0} className="px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-60">
                            {savingEdit ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-3">
                        <input value={editDeliveredBy} onChange={(e) => setEditDeliveredBy(e.target.value)} placeholder="Delivered by" className="border border-slate-300 rounded-xl px-3 py-2.5 text-sm" />
                        <input value={editVehicle} onChange={(e) => setEditVehicle(e.target.value)} placeholder="Vehicle / truck" className="border border-slate-300 rounded-xl px-3 py-2.5 text-sm" />
                      </div>

                      <div className="rounded-2xl border border-blue-100 bg-white overflow-hidden">
                        <div className="hidden md:grid bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 grid-cols-[1.4fr_90px_90px_90px_90px] gap-2">
                          <div>Bundle</div>
                          <div className="text-right">Required</div>
                          <div className="text-right">Other Dockets</div>
                          <div className="text-right">Max Allowed</div>
                          <div className="text-right">Qty</div>
                        </div>

                        <div className="divide-y divide-slate-100 max-h-[420px] overflow-auto">
                          {bundles.map((bundle) => {
                            const required = safeNumber(bundle.qty_required, 0);
                            const originalQty = getOriginalEditQty(bundle.bundle_no);
                            const otherDelivered = Math.max(0, (deliveredTotals[bundle.bundle_no] || 0) - originalQty);
                            const maxAllowed = maxEditQtyForBundle(bundle.bundle_no);
                            const value = editQtyMap[bundle.bundle_no] ?? "";

                            return (
                              <div key={`${delivery.id}-${bundle.bundle_no}`} className="grid md:grid-cols-[1.4fr_90px_90px_90px_90px] gap-2 p-3 items-center">
                                <div>
                                  <div className="font-semibold text-slate-900">{bundle.bundle_no}</div>
                                  <div className="text-xs text-slate-500">{bundle.section || "General"}</div>
                                  <div className="md:hidden text-xs text-slate-500 mt-1">
                                    Required {required} · Other dockets {otherDelivered} · Max allowed {maxAllowed}
                                  </div>
                                </div>
                                <div className="hidden md:block text-right text-sm font-bold text-slate-800">{required}</div>
                                <div className="hidden md:block text-right text-sm font-bold text-slate-600">{otherDelivered}</div>
                                <div className="hidden md:block text-right text-sm font-bold text-amber-700">{maxAllowed}</div>
                                <input
                                  type="number"
                                  min="0"
                                  max={maxAllowed}
                                  value={value}
                                  onChange={(e) => updateEditQty(bundle.bundle_no, e.target.value)}
                                  className="border border-slate-300 rounded-xl px-3 py-2 text-sm text-right font-bold"
                                />
                              </div>
                            );
                          })}
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

      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 p-3 md:hidden">
        <div className="mx-auto max-w-5xl flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500 font-semibold">Selected Qty</div>
            <div className="text-xl font-black text-slate-950">{selectedQty}</div>
          </div>
          <button
            onClick={() => void saveDelivery()}
            disabled={saving || selectedQty <= 0}
            className="px-5 py-3 rounded-2xl bg-slate-950 text-white text-sm font-bold disabled:opacity-60"
          >
            {saving ? "Submitting..." : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
