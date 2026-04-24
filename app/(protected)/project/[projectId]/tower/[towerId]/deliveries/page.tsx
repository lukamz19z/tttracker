"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

/* ================= TYPES ================= */

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

/* ================= HELPERS ================= */

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

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/* ================= PAGE ================= */

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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQtyMap, setEditQtyMap] = useState<Record<string, number>>({});

  const [reloadKey, setReloadKey] = useState(0);

  /* ================= LOAD ================= */

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

  /* ================= TOTALS ================= */

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

  const filteredBundles = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return bundles;

    return bundles.filter((bundle) => {
      const text = [
        bundle.bundle_no,
        bundle.section || "",
        String(bundle.qty_required || 0),
        String(deliveredTotals[bundle.bundle_no] || 0),
      ]
        .join(" ")
        .toLowerCase();

      return text.includes(q);
    });
  }, [bundles, search, deliveredTotals]);

  /* ================= SAVE DELIVERY ================= */

  async function saveDelivery() {
    const items = Object.entries(qtyMap)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([bundle_no, qty]) => ({
        bundle_no,
        qty_delivered: Number(qty),
      }));

    if (!items.length) {
      alert("Enter delivered quantities");
      return;
    }

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
      alert(error?.message || "Insert failed");
      return;
    }

    const payload = items.map((item) => ({
      delivery_id: data.id,
      bundle_no: item.bundle_no,
      qty_delivered: item.qty_delivered,
    }));

    const { error: itemError } = await supabase.from("tower_bundle_delivery_items").insert(payload);

    if (itemError) {
      alert(itemError.message || "Failed to save delivery items");
      return;
    }

    setDeliveredBy("");
    setVehicle("");
    setQtyMap({});
    setReloadKey((v) => v + 1);
  }

  /* ================= DELETE ================= */

  async function deleteDelivery(id: string) {
    if (!confirm("Delete delivery?")) return;

    const { error } = await supabase.from("tower_bundle_deliveries").delete().eq("id", id);

    if (error) {
      alert(error.message || "Failed to delete delivery");
      return;
    }

    setReloadKey((v) => v + 1);
  }

  /* ================= EDIT ================= */

  function startEdit(delivery: Delivery) {
    setEditingId(delivery.id);

    const map: Record<string, number> = {};
    delivery.tower_bundle_delivery_items?.forEach((item) => {
      map[item.bundle_no] = Number(item.qty_delivered);
    });

    setEditQtyMap(map);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditQtyMap({});
  }

  async function saveEdit() {
    if (!editingId) return;

    const { error: deleteError } = await supabase
      .from("tower_bundle_delivery_items")
      .delete()
      .eq("delivery_id", editingId);

    if (deleteError) {
      alert(deleteError.message || "Failed to clear old delivery items");
      return;
    }

    const payload = Object.entries(editQtyMap)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([bundle_no, qty]) => ({
        delivery_id: editingId,
        bundle_no,
        qty_delivered: Number(qty),
      }));

    if (payload.length > 0) {
      const { error: insertError } = await supabase.from("tower_bundle_delivery_items").insert(payload);

      if (insertError) {
        alert(insertError.message || "Failed to save edited delivery");
        return;
      }
    }

    setEditingId(null);
    setEditQtyMap({});
    setReloadKey((v) => v + 1);
  }

  /* ================= PRINT / PDF ================= */

  function printDeliveriesPDF() {
    const towerLabel = getTowerPrintLabel(tower);
    const towerLine = safeString(tower?.line, "");
    const title = "Delivery Register";

    const bundleRows = bundles
      .map((bundle) => {
        const delivered = deliveredTotals[bundle.bundle_no] || 0;
        const required = safeNumber(bundle.qty_required, 0);
        const remaining = Math.max(required - delivered, 0);

        return `
          <tr>
            <td>${bundle.bundle_no}</td>
            <td>${bundle.section || ""}</td>
            <td>${required}</td>
            <td>${delivered}</td>
            <td>${remaining}</td>
            <td>${remaining <= 0 ? "Complete" : delivered > 0 ? "Partial" : "Outstanding"}</td>
          </tr>
        `;
      })
      .join("");

    const deliveryRows = deliveries
      .map((delivery) => {
        const items = delivery.tower_bundle_delivery_items
          ?.map((item) => `${item.bundle_no} × ${item.qty_delivered}`)
          .join("<br/>");

        return `
          <tr>
            <td>${formatDateTime(delivery.created_at)}</td>
            <td>${delivery.delivered_by || ""}</td>
            <td>${delivery.vehicle || ""}</td>
            <td>${items || ""}</td>
          </tr>
        `;
      })
      .join("");

    const html = `
      <html>
        <head>
          <title>${title} - ${towerLabel}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 24px;
              color: #0f172a;
            }

            .print-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 12px;
              margin-bottom: 18px;
            }

            h1 {
              margin: 0;
              font-size: 22px;
            }

            h2 {
              margin: 24px 0 10px 0;
              font-size: 16px;
            }

            .tower-label {
              font-size: 18px;
              font-weight: 700;
            }

            .meta {
              font-size: 12px;
              color: #64748b;
              margin-top: 4px;
            }

            .summary {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 10px;
              margin-bottom: 18px;
            }

            .summary-card {
              border: 1px solid #cbd5e1;
              background: #f8fafc;
              padding: 10px;
              border-radius: 10px;
            }

            .summary-label {
              font-size: 11px;
              color: #64748b;
            }

            .summary-value {
              font-size: 18px;
              font-weight: 700;
              margin-top: 4px;
            }

            table {
              border-collapse: collapse;
              width: 100%;
              margin-bottom: 24px;
            }

            th,
            td {
              border: 1px solid #cbd5e1;
              padding: 8px;
              font-size: 12px;
              text-align: left;
              vertical-align: top;
            }

            th {
              background: #f1f5f9;
            }

            thead {
              display: table-header-group;
            }

            tr {
              page-break-inside: avoid;
            }

            .print-footer {
              margin-top: 20px;
              padding-top: 8px;
              border-top: 1px solid #cbd5e1;
              font-size: 11px;
              color: #64748b;
              display: flex;
              justify-content: space-between;
            }

            @page {
              margin: 14mm 10mm;
            }
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
            <div class="summary-card">
              <div class="summary-label">Required Qty</div>
              <div class="summary-value">${totalRequired}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Delivered Qty</div>
              <div class="summary-value">${totalDelivered}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Remaining Qty</div>
              <div class="summary-value">${totalRemaining}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Progress</div>
              <div class="summary-value">${progress.toFixed(1)}%</div>
            </div>
          </div>

          <h2>Bundle Delivery Summary</h2>
          <table>
            <thead>
              <tr>
                <th>Bundle No</th>
                <th>Section</th>
                <th>Required</th>
                <th>Delivered</th>
                <th>Remaining</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${bundleRows || `<tr><td colspan="6">No bundles found.</td></tr>`}
            </tbody>
          </table>

          <h2>Delivery History</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Delivered By</th>
                <th>Vehicle</th>
                <th>Items</th>
              </tr>
            </thead>
            <tbody>
              ${deliveryRows || `<tr><td colspan="4">No deliveries logged.</td></tr>`}
            </tbody>
          </table>

          <div class="print-footer">
            <span>${title} - Tower ${towerLabel}</span>
            <span>TTTracker</span>
          </div>
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

  /* ================= RENDER ================= */

  if (loading) {
    return <div className="p-8">Loading deliveries...</div>;
  }

  return (
    <div className="p-4 md:p-8 space-y-6 bg-slate-50 min-h-screen">
      {tower && <TowerHeader projectId={projectId} tower={tower} latestDate={latestDate} />}

      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
        <div className="p-4 md:p-6 border-b border-slate-200">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                Deliveries
              </h1>
              <p className="text-slate-500 mt-1">
                Record delivered bundles and track outstanding steel for this tower.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={printDeliveriesPDF}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium"
              >
                Print / Export PDF
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-6">
            <SummaryCard label="Required" value={totalRequired} />
            <SummaryCard label="Delivered" value={totalDelivered} tone="green" />
            <SummaryCard label="Remaining" value={totalRemaining} tone="red" />
            <SummaryCard label="Progress" value={`${progress.toFixed(1)}%`} tone="blue" />
          </div>

          <div className="mt-5 h-4 rounded-full overflow-hidden bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="p-4 md:p-6 space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 md:p-5">
            <h2 className="text-xl font-bold text-slate-900">Add Delivery</h2>

            <div className="grid md:grid-cols-3 gap-3 mt-4">
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

              <button
                onClick={saveDelivery}
                className="rounded-2xl bg-slate-900 text-white px-4 py-3 text-sm font-medium hover:bg-slate-800"
              >
                Save Delivery
              </button>
            </div>

            <div className="mt-4">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search bundle number or section..."
                className="w-full border border-slate-300 rounded-2xl px-4 py-3 text-sm"
              />
            </div>

            <div className="mt-4 grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredBundles.map((bundle) => {
                const delivered = deliveredTotals[bundle.bundle_no] || 0;
                const required = safeNumber(bundle.qty_required, 0);
                const remaining = Math.max(required - delivered, 0);

                return (
                  <div
                    key={bundle.bundle_no}
                    className="rounded-2xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">{bundle.bundle_no}</div>
                        <div className="text-sm text-slate-500 mt-1">
                          {bundle.section || "General"}
                        </div>
                      </div>

                      <span className="rounded-full bg-slate-100 text-slate-700 px-3 py-1 text-xs font-medium">
                        Rem {remaining}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-4 text-sm">
                      <MiniStat label="Req" value={required} />
                      <MiniStat label="Del" value={delivered} />
                      <MiniStat label="Rem" value={remaining} />
                    </div>

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
                      placeholder="Qty delivered now"
                      className="mt-4 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden">
            <div className="p-4 md:p-5 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-900">Delivery History</h2>
              <p className="text-sm text-slate-500 mt-1">
                Logged delivery records for this tower.
              </p>
            </div>

            {deliveries.length === 0 ? (
              <div className="p-8 text-slate-500">No deliveries logged yet.</div>
            ) : (
              <div className="divide-y divide-slate-200">
                {deliveries.map((delivery) => {
                  const isEditing = editingId === delivery.id;

                  return (
                    <div key={delivery.id} className="p-4 md:p-5">
                      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                        <div>
                          <div className="font-semibold text-slate-900">
                            {formatDateTime(delivery.created_at)}
                          </div>
                          <div className="text-sm text-slate-500 mt-1">
                            Delivered by {delivery.delivered_by || "—"} • Vehicle{" "}
                            {delivery.vehicle || "—"}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {!isEditing ? (
                            <>
                              <button
                                onClick={() => startEdit(delivery)}
                                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-medium"
                              >
                                Edit
                              </button>

                              <button
                                onClick={() => void deleteDelivery(delivery.id)}
                                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-medium"
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={cancelEdit}
                                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-medium"
                              >
                                Cancel
                              </button>

                              <button
                                onClick={saveEdit}
                                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium"
                              >
                                Save Edit
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {!isEditing ? (
                        <div className="mt-4 grid md:grid-cols-2 xl:grid-cols-4 gap-2">
                          {delivery.tower_bundle_delivery_items?.map((item) => (
                            <div
                              key={`${delivery.id}-${item.bundle_no}`}
                              className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3"
                            >
                              <div className="font-semibold text-slate-900">{item.bundle_no}</div>
                              <div className="text-sm text-slate-500 mt-1">
                                Qty delivered: {item.qty_delivered}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-4 grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                          {bundles.map((bundle) => (
                            <div
                              key={`${delivery.id}-edit-${bundle.bundle_no}`}
                              className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3"
                            >
                              <div className="font-semibold text-slate-900">{bundle.bundle_no}</div>
                              <div className="text-sm text-slate-500 mt-1">
                                {bundle.section || "General"}
                              </div>
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
                                className="mt-3 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= SMALL UI ================= */

function SummaryCard({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  tone?: "slate" | "green" | "red" | "blue";
}) {
  const toneMap: Record<string, string> = {
    slate: "bg-slate-100 text-slate-800",
    green: "bg-emerald-100 text-emerald-800",
    red: "bg-rose-100 text-rose-800",
    blue: "bg-blue-100 text-blue-800",
  };

  return (
    <div className={`rounded-2xl px-4 py-4 ${toneMap[tone]}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="font-bold text-lg mt-1">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-100 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-semibold text-slate-900">{value}</div>
    </div>
  );
}