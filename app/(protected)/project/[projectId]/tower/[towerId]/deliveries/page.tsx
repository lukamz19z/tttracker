"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type Tower = {
  id: string;
  name?: string | null;
  line?: string | null;
  status?: string | null;
  progress?: number | null;
  tower_number?: string | null;
  structure_number?: string | null;
  tower_no?: string | null;
  extra_data?: Record<string, unknown> | null;
  [key: string]: unknown;
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

type DocketRow = {
  docket_date: string | null;
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

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function getTowerPrintLabel(tower: Tower | null): string {
  if (!tower) return "Unknown Tower";

  const extra = tower.extra_data || {};

  return (
    safeString(tower.tower_number) ||
    safeString(tower.structure_number) ||
    safeString(tower.tower_no) ||
    safeString(tower.name) ||
    safeString(extra["Tower No"]) ||
    safeString(extra["Tower Number"]) ||
    safeString(extra["Structure Number"]) ||
    safeString(extra["Structure No"]) ||
    safeString(extra["Label"]) ||
    safeString(extra["label"]) ||
    "Unknown Tower"
  );
}

function getStatus(required: number, delivered: number) {
  const remaining = Math.max(required - delivered, 0);
  if (required <= 0) return "No Qty";
  if (remaining <= 0) return "Complete";
  if (delivered > 0) return "Partial";
  return "Outstanding";
}

function getStatusClasses(status: string) {
  if (status === "Complete") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "Partial") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "Outstanding") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

export default function DeliveriesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [tower, setTower] = useState<Tower | null>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deliveredBy, setDeliveredBy] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const [summaryOpen, setSummaryOpen] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [editingDeliveryId, setEditingDeliveryId] = useState<string | null>(null);
  const [editQtyMap, setEditQtyMap] = useState<Record<string, number>>({});
  const [editDeliveredBy, setEditDeliveredBy] = useState("");
  const [editVehicle, setEditVehicle] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!towerId) return;

    let cancelled = false;

    async function run() {
      setLoading(true);

      const [towerRes, bundleRes, deliveryRes, docketRes] = await Promise.all([
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
          .order("created_at", { ascending: false }),
        supabase
          .from("tower_daily_dockets")
          .select("docket_date")
          .eq("tower_id", towerId)
          .order("docket_date", { ascending: false })
          .limit(1),
      ]);

      if (cancelled) return;

      if (towerRes.error) console.error("tower load error", towerRes.error);
      if (bundleRes.error) console.error("bundle load error", bundleRes.error);
      if (deliveryRes.error) console.error("delivery load error", deliveryRes.error);
      if (docketRes.error) console.error("docket load error", docketRes.error);

      setTower((towerRes.data as Tower | null) ?? null);
      setBundles((bundleRes.data as Bundle[]) ?? []);
      setDeliveries((deliveryRes.data as Delivery[]) ?? []);
      setLatestDate(((docketRes.data as DocketRow[] | null) ?? [])[0]?.docket_date || null);
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

  const totalRequired = useMemo(
    () => bundles.reduce((sum, bundle) => sum + safeNumber(bundle.qty_required, 0), 0),
    [bundles],
  );

  const totalDelivered = useMemo(
    () => Object.values(deliveredTotals).reduce((sum, value) => sum + safeNumber(value, 0), 0),
    [deliveredTotals],
  );

  const totalRemaining = Math.max(totalRequired - totalDelivered, 0);
  const progress = totalRequired > 0 ? clampPercent((totalDelivered / totalRequired) * 100) : 0;
  const completeBundles = bundles.filter((bundle) => {
    const required = safeNumber(bundle.qty_required, 0);
    const delivered = deliveredTotals[bundle.bundle_no] || 0;
    return required > 0 && delivered >= required;
  }).length;
  const partialBundles = bundles.filter((bundle) => {
    const required = safeNumber(bundle.qty_required, 0);
    const delivered = deliveredTotals[bundle.bundle_no] || 0;
    return required > 0 && delivered > 0 && delivered < required;
  }).length;
  const outstandingBundles = bundles.filter((bundle) => {
    const required = safeNumber(bundle.qty_required, 0);
    const delivered = deliveredTotals[bundle.bundle_no] || 0;
    return required > 0 && delivered <= 0;
  }).length;

  const filteredBundles = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return bundles;

    return bundles.filter((bundle) => {
      const delivered = deliveredTotals[bundle.bundle_no] || 0;
      const required = safeNumber(bundle.qty_required, 0);
      const remaining = Math.max(required - delivered, 0);
      const status = getStatus(required, delivered);

      const text = [
        bundle.bundle_no,
        bundle.section || "",
        String(required),
        String(delivered),
        String(remaining),
        status,
      ]
        .join(" ")
        .toLowerCase();

      return text.includes(q);
    });
  }, [bundles, search, deliveredTotals]);

  async function saveDelivery() {
    const items = Object.entries(qtyMap)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([bundle_no, qty]) => ({
        bundle_no,
        qty_delivered: Number(qty),
      }));

    if (!items.length) {
      alert("Enter at least one delivered quantity.");
      return;
    }

    setSaving(true);

    const { data, error } = await supabase
      .from("tower_bundle_deliveries")
      .insert({
        tower_id: towerId,
        delivered_by: deliveredBy,
        vehicle,
      })
      .select()
      .single();

    if (error || !data) {
      setSaving(false);
      alert(error?.message || "Insert failed.");
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

    setDeliveredBy("");
    setVehicle("");
    setQtyMap({});
    setAddOpen(false);
    setHistoryOpen(true);
    setReloadKey((v) => v + 1);
  }

  function startEditDelivery(delivery: Delivery) {
    const map: Record<string, number> = {};

    delivery.tower_bundle_delivery_items.forEach((item) => {
      map[item.bundle_no] = safeNumber(item.qty_delivered, 0);
    });

    setHistoryOpen(true);
    setEditMode(true);
    setEditingDeliveryId(delivery.id);
    setEditQtyMap(map);
    setEditDeliveredBy(delivery.delivered_by || "");
    setEditVehicle(delivery.vehicle || "");
  }

  function cancelEditDelivery() {
    setEditingDeliveryId(null);
    setEditQtyMap({});
    setEditDeliveredBy("");
    setEditVehicle("");
  }

  async function saveEditDelivery() {
    if (!editingDeliveryId) return;

    const items = Object.entries(editQtyMap)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([bundle_no, qty]) => ({
        delivery_id: editingDeliveryId,
        bundle_no,
        qty_delivered: Number(qty),
      }));

    if (!items.length) {
      alert("This edit has no delivered quantities. Delete the delivery instead if it was a mistake.");
      return;
    }

    setSavingEdit(true);

    const { error: deliveryUpdateError } = await supabase
      .from("tower_bundle_deliveries")
      .update({
        delivered_by: editDeliveredBy,
        vehicle: editVehicle,
      })
      .eq("id", editingDeliveryId);

    if (deliveryUpdateError) {
      setSavingEdit(false);
      alert(deliveryUpdateError.message || "Failed to update delivery.");
      return;
    }

    const { error: deleteItemsError } = await supabase
      .from("tower_bundle_delivery_items")
      .delete()
      .eq("delivery_id", editingDeliveryId);

    if (deleteItemsError) {
      setSavingEdit(false);
      alert(deleteItemsError.message || "Failed to update delivery items.");
      return;
    }

    const { error: insertItemsError } = await supabase
      .from("tower_bundle_delivery_items")
      .insert(items);

    setSavingEdit(false);

    if (insertItemsError) {
      alert(insertItemsError.message || "Failed to save edited quantities.");
      return;
    }

    cancelEditDelivery();
    setReloadKey((v) => v + 1);
  }

  async function deleteDelivery(id: string) {
    const confirmed = window.confirm(
      "Delete this delivery?\n\nThis should only be used for a misclick or incorrect entry.",
    );

    if (!confirmed) return;

    const { error } = await supabase.from("tower_bundle_deliveries").delete().eq("id", id);

    if (error) {
      alert(error.message || "Failed to delete delivery.");
      return;
    }

    if (editingDeliveryId === id) {
      cancelEditDelivery();
    }

    setReloadKey((v) => v + 1);
  }

  function printDeliveriesPDF() {
    const towerLabel = getTowerPrintLabel(tower);
    const towerLine = safeString(tower?.line, "");
    const title = "Delivery Checklist";

    const bundleRows = filteredBundles
      .map((bundle) => {
        const required = safeNumber(bundle.qty_required, 0);
        const delivered = deliveredTotals[bundle.bundle_no] || 0;
        const remaining = Math.max(required - delivered, 0);
        const status = getStatus(required, delivered);

        return `
          <tr>
            <td class="tick-cell"></td>
            <td>${bundle.bundle_no}</td>
            <td>${bundle.section || "General"}</td>
            <td>${required}</td>
            <td>${delivered}</td>
            <td>${remaining}</td>
            <td>${status}</td>
            <td></td>
          </tr>
        `;
      })
      .join("");

    const html = `
      <html>
        <head>
          <title>${title} - ${towerLabel}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 18px; color: #0f172a; }
            .print-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
            h1 { margin: 0; font-size: 20px; }
            .tower-label { font-size: 16px; font-weight: 700; }
            .meta { font-size: 11px; color: #64748b; margin-top: 4px; }
            .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
            .summary-card { border: 1px solid #cbd5e1; background: #f8fafc; padding: 7px; border-radius: 6px; }
            .summary-label { font-size: 9px; color: #64748b; }
            .summary-value { font-size: 15px; font-weight: 700; margin-top: 2px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #94a3b8; padding: 5px 6px; font-size: 10.5px; text-align: left; vertical-align: middle; }
            th { background: #e2e8f0; font-weight: 700; }
            tr { page-break-inside: avoid; height: 22px; }
            .tick-cell { width: 22px; min-width: 22px; }
            .tick-cell:before { content: ""; display: inline-block; width: 12px; height: 12px; border: 1.5px solid #0f172a; }
            .footer { margin-top: 12px; padding-top: 8px; border-top: 1px solid #cbd5e1; font-size: 10px; color: #64748b; display: flex; justify-content: space-between; }
            @page { margin: 12mm 8mm; }
          </style>
        </head>
        <body>
          <div class="print-header">
            <div>
              <h1>${title}</h1>
              <div class="meta">Printed ${new Date().toLocaleString()}</div>
            </div>
            <div style="text-align:right">
              <div class="tower-label">Tower: ${towerLabel}</div>
              <div class="meta">${towerLine ? `Line: ${towerLine}` : ""}</div>
            </div>
          </div>
          <div class="summary">
            <div class="summary-card"><div class="summary-label">Required Qty</div><div class="summary-value">${totalRequired}</div></div>
            <div class="summary-card"><div class="summary-label">Delivered Qty</div><div class="summary-value">${totalDelivered}</div></div>
            <div class="summary-card"><div class="summary-label">Remaining Qty</div><div class="summary-value">${totalRemaining}</div></div>
            <div class="summary-card"><div class="summary-label">Progress</div><div class="summary-value">${progress.toFixed(1)}%</div></div>
          </div>
          <table>
            <thead>
              <tr><th>Check</th><th>Bundle No</th><th>Section</th><th>Required</th><th>Delivered</th><th>Remaining</th><th>Status</th><th>Notes</th></tr>
            </thead>
            <tbody>${bundleRows || `<tr><td colspan="8">No bundles found.</td></tr>`}</tbody>
          </table>
          <div class="footer"><span>${title} - Tower ${towerLabel}</span><span>TTTracker</span></div>
        </body>
      </html>
    `;

    const win = window.open("", "_blank", "width=1200,height=800");
    if (!win) return;

    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  if (loading) {
    return <div className="p-8">Loading deliveries...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {tower && <TowerHeader projectId={projectId} tower={tower} latestDate={latestDate} />}

        <div className="rounded-[2rem] border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-5 md:p-6 text-white">
            <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                  Materials Control
                </p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">
                  Delivery Register
                </h1>
                <p className="text-slate-300 mt-1 max-w-2xl">
                  Track delivery dockets, bundle quantities and remaining steel for this tower.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/project/${projectId}/tower/${towerId}/deliveries/new`}
                  className="px-4 py-2 rounded-xl bg-white text-slate-900 hover:bg-slate-100 text-sm font-semibold"
                >
                  Driver Docket Page
                </Link>

                <button
                  onClick={() => setAddOpen((v) => !v)}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold"
                >
                  {addOpen ? "Close Add Delivery" : "+ Add Delivery"}
                </button>

                <button
                  onClick={printDeliveriesPDF}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium border border-white/15"
                >
                  Print / Export PDF
                </button>

                <button
                  onClick={() => {
                    setEditMode((prev) => !prev);
                    setHistoryOpen(true);
                    cancelEditDelivery();
                  }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border ${
                    editMode
                      ? "bg-amber-400 text-slate-950 border-amber-400"
                      : "bg-white/10 text-white border-white/15 hover:bg-white/20"
                  }`}
                >
                  {editMode ? "Exit Edit Mode" : "Edit Deliveries"}
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 md:p-6 space-y-5">
            <CollapsibleSection
              title="Delivery Summary"
              subtitle="High-level delivery progress for this tower."
              open={summaryOpen}
              onToggle={() => setSummaryOpen((v) => !v)}
              rightContent={<span className="text-sm font-bold text-slate-900">{progress.toFixed(1)}%</span>}
            >
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <PowerMetric label="Required" value={totalRequired} helper="Total bundle qty" accent="slate" />
                <PowerMetric label="Delivered" value={totalDelivered} helper={`${completeBundles} complete bundles`} accent="green" />
                <PowerMetric label="Remaining" value={totalRemaining} helper={`${outstandingBundles} outstanding`} accent="red" />
                <PowerMetric label="Progress" value={`${progress.toFixed(1)}%`} helper={`${partialBundles} partial bundles`} accent="blue" />
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3 text-sm mb-2">
                  <span className="font-semibold text-slate-700">Steel Delivery Progress</span>
                  <span className="font-bold text-slate-900">
                    {totalDelivered} / {totalRequired}
                  </span>
                </div>
                <div className="h-3 rounded-full overflow-hidden bg-slate-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Add Delivery"
              subtitle="Internal delivery entry. The driver page uses the same records but has a simpler layout."
              open={addOpen}
              onToggle={() => setAddOpen((v) => !v)}
              rightContent={
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void saveDelivery();
                  }}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Delivery"}
                </button>
              }
            >
              <DeliveryEntryTable
                bundles={filteredBundles}
                deliveredTotals={deliveredTotals}
                qtyMap={qtyMap}
                setQtyMap={setQtyMap}
                deliveredBy={deliveredBy}
                setDeliveredBy={setDeliveredBy}
                vehicle={vehicle}
                setVehicle={setVehicle}
                search={search}
                setSearch={setSearch}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Bundle Register"
              subtitle="Live bundle register. This is the same information used by the Materials page and Tower Overview."
              open={registerOpen}
              onToggle={() => setRegisterOpen((v) => !v)}
              rightContent={<span className="text-xs font-semibold text-slate-500">{filteredBundles.length} shown</span>}
            >
              <div className="mb-4">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search bundle, section, status..."
                  className="w-full border border-slate-300 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <BundleRegisterTable bundles={filteredBundles} deliveredTotals={deliveredTotals} />
            </CollapsibleSection>

            {editMode && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Edit mode is on. Use this to fix a misclick, adjust delivered quantities, or delete an incorrect delivery record.
              </div>
            )}

            <CollapsibleSection
              title="Delivery History"
              subtitle="Logged delivery dockets for this tower. Admins/supervisors can edit these if a driver makes a mistake."
              open={historyOpen}
              onToggle={() => setHistoryOpen((v) => !v)}
              rightContent={<span className="text-xs font-semibold text-slate-500">{deliveries.length} dockets</span>}
            >
              <DeliveryHistory
                deliveries={deliveries}
                bundles={bundles}
                editMode={editMode}
                editingDeliveryId={editingDeliveryId}
                editDeliveredBy={editDeliveredBy}
                setEditDeliveredBy={setEditDeliveredBy}
                editVehicle={editVehicle}
                setEditVehicle={setEditVehicle}
                editQtyMap={editQtyMap}
                setEditQtyMap={setEditQtyMap}
                savingEdit={savingEdit}
                startEditDelivery={startEditDelivery}
                cancelEditDelivery={cancelEditDelivery}
                saveEditDelivery={() => void saveEditDelivery()}
                deleteDelivery={(id) => void deleteDelivery(id)}
              />
            </CollapsibleSection>
          </div>
        </div>
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  subtitle,
  open,
  onToggle,
  rightContent,
  children,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  rightContent?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 px-4 md:px-5 py-4 text-left hover:bg-slate-50"
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700 font-black">
            {open ? "−" : "+"}
          </div>
          <div>
            <h2 className="font-bold text-slate-950">{title}</h2>
            {subtitle && <p className="text-xs md:text-sm text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {rightContent}
          <span className="text-slate-400 text-lg">{open ? "⌃" : "⌄"}</span>
        </div>
      </button>

      {open && <div className="border-t border-slate-200 p-4 md:p-5">{children}</div>}
    </section>
  );
}

function PowerMetric({
  label,
  value,
  helper,
  accent = "slate",
}: {
  label: string;
  value: string | number;
  helper?: string;
  accent?: "slate" | "green" | "red" | "blue";
}) {
  const accentMap = {
    slate: "border-slate-200 bg-slate-50 text-slate-900 before:bg-slate-500",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900 before:bg-emerald-500",
    red: "border-rose-200 bg-rose-50 text-rose-900 before:bg-rose-500",
    blue: "border-blue-200 bg-blue-50 text-blue-900 before:bg-blue-500",
  } as const;

  return (
    <div className={`relative overflow-hidden rounded-3xl border p-4 shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-1 ${accentMap[accent]}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-black mt-1">{value}</div>
      {helper && <div className="text-xs opacity-70 mt-1">{helper}</div>}
    </div>
  );
}

function DeliveryEntryTable({
  bundles,
  deliveredTotals,
  qtyMap,
  setQtyMap,
  deliveredBy,
  setDeliveredBy,
  vehicle,
  setVehicle,
  search,
  setSearch,
}: {
  bundles: Bundle[];
  deliveredTotals: Record<string, number>;
  qtyMap: Record<string, number>;
  setQtyMap: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  deliveredBy: string;
  setDeliveredBy: (value: string) => void;
  vehicle: string;
  setVehicle: (value: string) => void;
  search: string;
  setSearch: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-[1fr_220px_220px] gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search bundle, section, status..."
          className="w-full border border-slate-300 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />

        <input
          value={deliveredBy}
          onChange={(e) => setDeliveredBy(e.target.value)}
          placeholder="Delivered by"
          className="border border-slate-300 rounded-2xl px-4 py-3 text-sm"
        />

        <input
          value={vehicle}
          onChange={(e) => setVehicle(e.target.value)}
          placeholder="Vehicle / truck"
          className="border border-slate-300 rounded-2xl px-4 py-3 text-sm"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="hidden md:grid grid-cols-[44px_1.5fr_1fr_80px_80px_80px_115px_110px] gap-2 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
          <div>Tick</div>
          <div>Bundle No</div>
          <div>Section</div>
          <div>Req</div>
          <div>Del</div>
          <div>Rem</div>
          <div>Status</div>
          <div>Qty Now</div>
        </div>

        <div className="divide-y divide-slate-100 max-h-[560px] overflow-auto">
          {bundles.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No bundles match your search.</div>
          ) : (
            bundles.map((bundle) => {
              const delivered = deliveredTotals[bundle.bundle_no] || 0;
              const required = safeNumber(bundle.qty_required, 0);
              const remaining = Math.max(required - delivered, 0);
              const status = getStatus(required, delivered);
              const isComplete = status === "Complete";

              return (
                <div
                  key={bundle.bundle_no}
                  className="grid grid-cols-1 md:grid-cols-[44px_1.5fr_1fr_80px_80px_80px_115px_110px] gap-2 px-3 py-2 items-center text-sm hover:bg-slate-50"
                >
                  <TickCell checked={isComplete} />

                  <div>
                    <div className="font-semibold text-slate-900">{bundle.bundle_no}</div>
                    <div className="md:hidden text-xs text-slate-500 mt-1">
                      {bundle.section || "General"} • Req {required} • Del {delivered} • Rem {remaining}
                    </div>
                  </div>

                  <div className="hidden md:block text-slate-600 truncate">{bundle.section || "General"}</div>
                  <div className="hidden md:block text-slate-700">{required}</div>
                  <div className="hidden md:block text-slate-700">{delivered}</div>

                  <div className={`hidden md:block font-semibold ${remaining <= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {remaining}
                  </div>

                  <StatusPill status={status} />

                  <input
                    type="number"
                    min="0"
                    value={qtyMap[bundle.bundle_no] ?? ""}
                    onChange={(e) =>
                      setQtyMap((prev) => ({
                        ...prev,
                        [bundle.bundle_no]: Number(e.target.value),
                      }))
                    }
                    placeholder="0"
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function BundleRegisterTable({ bundles, deliveredTotals }: { bundles: Bundle[]; deliveredTotals: Record<string, number> }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="hidden md:grid grid-cols-[44px_1.5fr_1fr_80px_80px_80px_115px] gap-2 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
        <div>Tick</div>
        <div>Bundle No</div>
        <div>Section</div>
        <div>Req</div>
        <div>Del</div>
        <div>Rem</div>
        <div>Status</div>
      </div>

      <div className="divide-y divide-slate-100 max-h-[640px] overflow-auto">
        {bundles.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No bundles match your search.</div>
        ) : (
          bundles.map((bundle) => {
            const delivered = deliveredTotals[bundle.bundle_no] || 0;
            const required = safeNumber(bundle.qty_required, 0);
            const remaining = Math.max(required - delivered, 0);
            const status = getStatus(required, delivered);
            const isComplete = status === "Complete";

            return (
              <div
                key={`${bundle.bundle_no}-register`}
                className="grid grid-cols-1 md:grid-cols-[44px_1.5fr_1fr_80px_80px_80px_115px] gap-2 px-3 py-2 items-center text-sm hover:bg-slate-50"
              >
                <TickCell checked={isComplete} />
                <div>
                  <div className="font-semibold text-slate-900">{bundle.bundle_no}</div>
                  <div className="md:hidden text-xs text-slate-500 mt-1">
                    {bundle.section || "General"} • Req {required} • Del {delivered} • Rem {remaining}
                  </div>
                </div>
                <div className="hidden md:block text-slate-600 truncate">{bundle.section || "General"}</div>
                <div className="hidden md:block text-slate-700">{required}</div>
                <div className="hidden md:block text-slate-700">{delivered}</div>
                <div className={`hidden md:block font-semibold ${remaining <= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {remaining}
                </div>
                <StatusPill status={status} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function DeliveryHistory({
  deliveries,
  bundles,
  editMode,
  editingDeliveryId,
  editDeliveredBy,
  setEditDeliveredBy,
  editVehicle,
  setEditVehicle,
  editQtyMap,
  setEditQtyMap,
  savingEdit,
  startEditDelivery,
  cancelEditDelivery,
  saveEditDelivery,
  deleteDelivery,
}: {
  deliveries: Delivery[];
  bundles: Bundle[];
  editMode: boolean;
  editingDeliveryId: string | null;
  editDeliveredBy: string;
  setEditDeliveredBy: (value: string) => void;
  editVehicle: string;
  setEditVehicle: (value: string) => void;
  editQtyMap: Record<string, number>;
  setEditQtyMap: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  savingEdit: boolean;
  startEditDelivery: (delivery: Delivery) => void;
  cancelEditDelivery: () => void;
  saveEditDelivery: () => void;
  deleteDelivery: (id: string) => void;
}) {
  if (deliveries.length === 0) {
    return <div className="p-6 text-slate-500">No deliveries logged yet.</div>;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="divide-y divide-slate-100">
        {deliveries.map((delivery) => {
          const totalQty = delivery.tower_bundle_delivery_items.reduce(
            (sum, item) => sum + safeNumber(item.qty_delivered, 0),
            0,
          );

          const itemText = delivery.tower_bundle_delivery_items
            .map((item) => `${item.bundle_no} × ${item.qty_delivered}`)
            .join(", ");

          const isEditing = editingDeliveryId === delivery.id;

          return (
            <div key={delivery.id}>
              {!isEditing ? (
                <div className="grid grid-cols-1 md:grid-cols-[170px_1fr_1fr_80px_2fr_160px] gap-2 px-4 py-3 items-center text-sm hover:bg-slate-50">
                  <div className="text-slate-700">{formatDateTime(delivery.created_at)}</div>
                  <div className="font-medium text-slate-900">{delivery.delivered_by || "—"}</div>
                  <div className="text-slate-700">{delivery.vehicle || "—"}</div>
                  <div className="font-semibold text-slate-900">Qty {totalQty}</div>
                  <div className="text-slate-600 truncate">{itemText || "No items"}</div>

                  <div className="flex gap-2 md:justify-end">
                    {editMode && (
                      <>
                        <button
                          onClick={() => startEditDelivery(delivery)}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => deleteDelivery(delivery.id)}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-blue-50 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="font-bold text-slate-900">Editing Delivery</div>
                      <div className="text-sm text-slate-600 mt-1">{formatDateTime(delivery.created_at)}</div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={cancelEditDelivery}
                        className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-medium hover:bg-slate-50"
                      >
                        Cancel
                      </button>

                      <button
                        onClick={saveEditDelivery}
                        disabled={savingEdit}
                        className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
                      >
                        {savingEdit ? "Saving..." : "Save Edit"}
                      </button>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    <input
                      value={editDeliveredBy}
                      onChange={(e) => setEditDeliveredBy(e.target.value)}
                      placeholder="Delivered by"
                      className="border border-slate-300 rounded-xl px-3 py-2.5 text-sm"
                    />

                    <input
                      value={editVehicle}
                      onChange={(e) => setEditVehicle(e.target.value)}
                      placeholder="Vehicle / truck"
                      className="border border-slate-300 rounded-xl px-3 py-2.5 text-sm"
                    />
                  </div>

                  <div className="rounded-2xl border border-blue-100 bg-white overflow-hidden">
                    <div className="hidden md:grid grid-cols-[1.5fr_1fr_110px] bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
                      <div>Bundle</div>
                      <div>Section</div>
                      <div>Qty</div>
                    </div>

                    <div className="divide-y divide-slate-100 max-h-[360px] overflow-auto">
                      {bundles.map((bundle) => (
                        <div
                          key={`${delivery.id}-edit-${bundle.bundle_no}`}
                          className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_110px] gap-2 px-3 py-2 items-center text-sm"
                        >
                          <div>
                            <div className="font-semibold text-slate-900">{bundle.bundle_no}</div>
                            <div className="md:hidden text-xs text-slate-500 mt-1">{bundle.section || "General"}</div>
                          </div>

                          <div className="hidden md:block text-slate-600">{bundle.section || "General"}</div>

                          <input
                            type="number"
                            min="0"
                            value={editQtyMap[bundle.bundle_no] ?? ""}
                            onChange={(e) =>
                              setEditQtyMap((prev) => ({
                                ...prev,
                                [bundle.bundle_no]: Number(e.target.value),
                              }))
                            }
                            placeholder="0"
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TickCell({ checked }: { checked: boolean }) {
  return (
    <div className="hidden md:flex items-center">
      <div
        className={`h-5 w-5 rounded border flex items-center justify-center text-xs font-bold ${
          checked ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-slate-400 text-white"
        }`}
      >
        {checked ? "✓" : ""}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <div>
      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClasses(status)}`}>
        {status}
      </span>
    </div>
  );
}
