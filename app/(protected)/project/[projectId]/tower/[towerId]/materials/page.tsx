"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Papa from "papaparse";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

/* =========================================================
   TYPES
========================================================= */

type DbBundleRow = {
  id?: string;
  tower_id: string;
  bundle_no: string;
  section: string | null;
  qty_required: number | null;
  total_weight: number | null;
};

type Bundle = {
  ui_id: string;
  id?: string;
  tower_id: string;
  bundle_no: string;
  section: string;
  qty_required: number;
  total_weight: number | null;
  group_key: string;
};

type DeliveryItem = {
  bundle_no: string;
  qty_delivered: number;
};

type Delivery = {
  tower_bundle_delivery_items: DeliveryItem[];
};

type SegmentTotals = {
  required: number;
  delivered: number;
  remaining: number;
  progress: number;
};

/* =========================================================
   HELPERS
========================================================= */

function safeString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normaliseSection(value: string): string {
  const trimmed = value.trim();
  return trimmed === "" ? "General" : trimmed;
}

function makeUiId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ui-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/* =========================================================
   PAGE
========================================================= */

export default function MaterialsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<any>(null);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [collapsedSegments, setCollapsedSegments] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [latestDate, setLatestDate] = useState<string | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* =========================================================
     LOAD
  ========================================================= */

  useEffect(() => {
    void load();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [towerId]);

  async function load() {
    setLoading(true);

    const [towerRes, bundlesRes, deliveriesRes, docketRes] = await Promise.all([
      supabase.from("towers").select("*").eq("id", towerId).single(),
      supabase
        .from("tower_required_bundles")
        .select("*")
        .eq("tower_id", towerId)
        .order("section", { ascending: true })
        .order("bundle_no", { ascending: true }),
      supabase
        .from("tower_bundle_deliveries")
        .select("tower_bundle_delivery_items(*)")
        .eq("tower_id", towerId),
      supabase
        .from("tower_daily_dockets")
        .select("docket_date")
        .eq("tower_id", towerId)
        .order("docket_date", { ascending: false })
        .limit(1),
    ]);

    if (towerRes.error) console.error("tower load error", towerRes.error);
    if (bundlesRes.error) console.error("bundles load error", bundlesRes.error);
    if (deliveriesRes.error) console.error("deliveries load error", deliveriesRes.error);
    if (docketRes.error) console.error("dockets load error", docketRes.error);

    setTower(towerRes.data || null);
    setLatestDate(docketRes.data?.[0]?.docket_date || null);

    const loadedBundles: Bundle[] = ((bundlesRes.data || []) as DbBundleRow[]).map((row) => {
      const section = normaliseSection(safeString(row.section, "General"));
      return {
        ui_id: makeUiId(),
        id: row.id,
        tower_id: towerId,
        bundle_no: safeString(row.bundle_no),
        section,
        qty_required: safeNumber(row.qty_required, 0),
        total_weight:
          row.total_weight === null || row.total_weight === undefined
            ? null
            : safeNumber(row.total_weight, 0),
        group_key: section,
      };
    });

    setBundles(loadedBundles);
    setDeliveries((deliveriesRes.data || []) as Delivery[]);
    setLoading(false);
  }

  /* =========================================================
     DELIVERY CALCS
  ========================================================= */

  function deliveredQty(bundleNo: string): number {
    let total = 0;

    deliveries.forEach((delivery) => {
      delivery.tower_bundle_delivery_items.forEach((item) => {
        if (item.bundle_no === bundleNo) {
          total += safeNumber(item.qty_delivered, 0);
        }
      });
    });

    return total;
  }

  function remainingQty(bundle: Bundle): number {
    return Math.max(bundle.qty_required - deliveredQty(bundle.bundle_no), 0);
  }

  function getSegmentTotals(rows: Bundle[]): SegmentTotals {
    const required = rows.reduce((sum, row) => sum + safeNumber(row.qty_required, 0), 0);
    const delivered = rows.reduce((sum, row) => sum + deliveredQty(row.bundle_no), 0);
    const remaining = Math.max(required - delivered, 0);
    const progress = required > 0 ? (delivered / required) * 100 : 0;

    return {
      required,
      delivered,
      remaining,
      progress,
    };
  }

  /* =========================================================
     AUTO SAVE
  ========================================================= */

  function scheduleAutoSave(nextRows: Bundle[]) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      void persistRegister(nextRows);
    }, 1200);
  }

  async function persistRegister(rows: Bundle[]) {
    const payload = rows
      .filter((row) => row.bundle_no.trim() !== "")
      .map((row) => ({
        tower_id: towerId,
        bundle_no: row.bundle_no.trim(),
        section: normaliseSection(row.section),
        qty_required: safeNumber(row.qty_required, 0),
        total_weight:
          row.total_weight === null || row.total_weight === undefined
            ? null
            : safeNumber(row.total_weight, 0),
      }));

    if (!payload.length) return;

    setSaving(true);

    const { error } = await supabase
      .from("tower_required_bundles")
      .upsert(payload, {
        onConflict: "tower_id,bundle_no",
      });

    if (error) {
      console.error("auto save error", error);
    }

    setSaving(false);
  }

  /* =========================================================
     ROW ACTIONS
  ========================================================= */

  function addRow() {
    setBundles((prev) => [
      ...prev,
      {
        ui_id: makeUiId(),
        tower_id: towerId,
        bundle_no: "",
        section: "General",
        qty_required: 0,
        total_weight: null,
        group_key: "General",
      },
    ]);
  }

  function updateRow(ui_id: string, field: keyof Bundle, value: string | number | null) {
    setBundles((prev) => {
      const next = prev.map((row) => {
        if (row.ui_id !== ui_id) return row;

        return {
          ...row,
          [field]: value,
        };
      });

      scheduleAutoSave(next);
      return next;
    });
  }

  function commitSectionGrouping(ui_id: string) {
    setBundles((prev) => {
      const next = prev.map((row) => {
        if (row.ui_id !== ui_id) return row;

        const finalSection = normaliseSection(row.section);
        return {
          ...row,
          section: finalSection,
          group_key: finalSection,
        };
      });

      scheduleAutoSave(next);
      return next;
    });
  }

  async function deleteRow(row: Bundle) {
    const confirmed = window.confirm(
      row.bundle_no.trim()
        ? `Remove bundle "${row.bundle_no}"?`
        : "Remove this unsaved row?"
    );

    if (!confirmed) return;

    setBundles((prev) => prev.filter((b) => b.ui_id !== row.ui_id));

    if (row.bundle_no.trim() === "") return;

    const { error } = await supabase
      .from("tower_required_bundles")
      .delete()
      .eq("tower_id", towerId)
      .eq("bundle_no", row.bundle_no.trim());

    if (error) {
      console.error("delete row error", error);
      alert("Failed to delete row from register.");
      return;
    }
  }

  async function saveNow() {
    await persistRegister(bundles);
    alert("Register saved.");
    await load();
  }

  /* =========================================================
     CSV IMPORT
  ========================================================= */

  function importCSV(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (res) => {
        const rows = (res.data as any[])
          .map((r) => {
            const bundleNo =
              r.bundle_no ||
              r["Bundle No"] ||
              r.bundle ||
              r["Bundle Reference"];

            if (!bundleNo) return null;

            return {
              tower_id: towerId,
              bundle_no: String(bundleNo).trim(),
              section: normaliseSection(
                safeString(r.section || r["Section"] || "General")
              ),
              qty_required: safeNumber(r.qty_required || r["Qty/Tower"] || 0, 0),
              total_weight: (() => {
                const n = Number(r.total_weight || r["Total Weight"]);
                return Number.isFinite(n) ? n : null;
              })(),
            };
          })
          .filter(Boolean);

        if (!rows.length) {
          alert("No valid rows found in CSV.");
          return;
        }

        const { error } = await supabase
          .from("tower_required_bundles")
          .upsert(rows, {
            onConflict: "tower_id,bundle_no",
          });

        if (error) {
          console.error("csv import error", error);
          alert("CSV import failed.");
          return;
        }

        await load();
        alert("CSV imported.");
      },
    });
  }

  /* =========================================================
     SEGMENTS
  ========================================================= */

  const segments = useMemo(() => {
    const map: Record<string, Bundle[]> = {};

    bundles.forEach((row) => {
      const key = row.group_key || "General";
      if (!map[key]) map[key] = [];
      map[key].push(row);
    });

    return map;
  }, [bundles]);

  const overallRequired = useMemo(
    () => bundles.reduce((sum, row) => sum + safeNumber(row.qty_required, 0), 0),
    [bundles]
  );

  const overallDelivered = useMemo(
    () => bundles.reduce((sum, row) => sum + deliveredQty(row.bundle_no), 0),
    [bundles, deliveries]
  );

  const overallRemaining = Math.max(overallRequired - overallDelivered, 0);
  const overallProgress = overallRequired > 0 ? (overallDelivered / overallRequired) * 100 : 0;

  /* =========================================================
     RENDER
  ========================================================= */

  if (loading) {
    return <div className="p-8">Loading materials register...</div>;
  }

  return (
    <div className="p-8 space-y-6">
      {tower && (
        <TowerHeader
          projectId={projectId}
          tower={tower}
          latestDate={latestDate}
        />
      )}

      <div className="bg-white border rounded-2xl p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Materials Register</h1>
            <p className="text-slate-500 mt-1">
              Permanent steel schedule for this tower. Deliveries deduct from this register.
            </p>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {saving && (
              <div className="text-sm text-blue-600 font-medium">
                Auto saving register…
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-4 flex-wrap">
          <StatCard label="Required" value={overallRequired} />
          <StatCard label="Delivered" value={overallDelivered} />
          <StatCard label="Remaining" value={overallRemaining} />
          <StatCard label="Progress" value={`${overallProgress.toFixed(1)}%`} />
        </div>

        <div className="bg-slate-50 border rounded-xl p-4 space-y-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Import CSV
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importCSV(file);
                  e.currentTarget.value = "";
                }}
              />
            </div>

            <button
              onClick={addRow}
              className="bg-slate-200 px-4 py-2 rounded-lg"
            >
              Add Row
            </button>

            <button
              onClick={saveNow}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg"
            >
              Save Register
            </button>
          </div>

          <div className="text-sm text-slate-500">
            Tip: Segment changes apply to grouping after you leave the Segment field.
          </div>
        </div>

        {Object.entries(segments).map(([segmentName, rows]) => {
          const totals = getSegmentTotals(rows);
          const isCollapsed = !!collapsedSegments[segmentName];

          return (
            <div key={segmentName} className="border rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setCollapsedSegments((prev) => ({
                    ...prev,
                    [segmentName]: !prev[segmentName],
                  }))
                }
                className="w-full bg-slate-100 px-4 py-4 text-left flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold">{segmentName}</div>
                  <div className="text-sm text-slate-500 mt-1">
                    Required {totals.required} • Delivered {totals.delivered} • Remaining{" "}
                    {totals.remaining}
                  </div>
                </div>

                <div className="min-w-[180px]">
                  <div className="text-right text-sm text-slate-600 mb-1">
                    {totals.progress.toFixed(1)}%
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-green-500 h-2 rounded-full"
                      style={{ width: `${Math.min(totals.progress, 100)}%` }}
                    />
                  </div>
                </div>
              </button>

              {!isCollapsed && (
                <div className="p-4 space-y-4">
                  {rows.map((row) => (
                    <div
                      key={row.ui_id}
                      className="grid grid-cols-1 md:grid-cols-6 gap-4 border rounded-xl p-4"
                    >
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">
                          Bundle Number
                        </label>
                        <input
                          className="border p-2 rounded w-full"
                          value={row.bundle_no}
                          onChange={(e) =>
                            updateRow(row.ui_id, "bundle_no", e.target.value)
                          }
                          placeholder="Enter bundle number"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-500 mb-1">
                          Segment
                        </label>
                        <input
                          className="border p-2 rounded w-full"
                          value={row.section}
                          onChange={(e) =>
                            updateRow(row.ui_id, "section", e.target.value)
                          }
                          onBlur={() => commitSectionGrouping(row.ui_id)}
                          placeholder="Enter segment"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-500 mb-1">
                          Qty Required
                        </label>
                        <input
                          className="border p-2 rounded w-full"
                          value={row.qty_required}
                          onChange={(e) =>
                            updateRow(
                              row.ui_id,
                              "qty_required",
                              safeNumber(e.target.value, 0)
                            )
                          }
                          placeholder="Enter quantity"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-500 mb-1">
                          Total Weight
                        </label>
                        <input
                          className="border p-2 rounded w-full"
                          value={row.total_weight ?? ""}
                          onChange={(e) =>
                            updateRow(
                              row.ui_id,
                              "total_weight",
                              e.target.value === ""
                                ? null
                                : safeNumber(e.target.value, 0)
                            )
                          }
                          placeholder="Enter total weight"
                        />
                      </div>

                      <div className="flex flex-col justify-end">
                        <label className="block text-xs text-slate-500 mb-1">
                          Delivered
                        </label>
                        <div className="font-bold text-lg">
                          {deliveredQty(row.bundle_no)}
                        </div>
                      </div>

                      <div className="flex flex-col justify-end">
                        <label className="block text-xs text-slate-500 mb-1">
                          Remaining
                        </label>
                        <div className="font-bold text-lg">
                          {remainingQty(row)}
                        </div>
                      </div>

                      <div className="md:col-span-6">
                        <button
                          onClick={() => deleteRow(row)}
                          className="text-red-600 text-sm"
                        >
                          Remove Row
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================
   SMALL UI
========================================================= */

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-slate-100 rounded-xl px-4 py-3 min-w-[110px]">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}