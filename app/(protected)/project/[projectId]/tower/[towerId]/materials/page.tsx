"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Papa from "papaparse";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type Bundle = {
  id?: string;
  tower_id: string;
  bundle_no: string;
  section: string | null;
  qty_required: number;
  total_weight: number | null;
};

type DeliveryItem = {
  id: string;
  delivery_id: string;
  bundle_no: string;
  qty_delivered: number;
};

type Delivery = {
  id: string;
  tower_bundle_delivery_items: DeliveryItem[];
};

export default function MaterialsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<any>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);

  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [towerId]);

  async function load() {
    setLoading(true);

    const [towerRes, docketRes, bundleRes, deliveryRes] = await Promise.all([
      supabase.from("towers").select("*").eq("id", towerId).single(),
      supabase
        .from("tower_daily_dockets")
        .select("docket_date")
        .eq("tower_id", towerId)
        .order("docket_date", { ascending: false })
        .limit(1),
      supabase
        .from("tower_required_bundles")
        .select("*")
        .eq("tower_id", towerId)
        .order("section", { ascending: true })
        .order("bundle_no", { ascending: true }),
      supabase
        .from("tower_bundle_deliveries")
        .select("id, tower_bundle_delivery_items(*)")
        .eq("tower_id", towerId),
    ]);

    setTower(towerRes.data || null);
    setLatestDate(docketRes.data?.[0]?.docket_date || null);
    setBundles(bundleRes.data || []);
    setDeliveries(deliveryRes.data || []);
    setLoading(false);
  }

  function deliveredQty(bundleNo: string): number {
    let total = 0;
    deliveries.forEach((d) => {
      d.tower_bundle_delivery_items.forEach((i) => {
        if (i.bundle_no === bundleNo) total += Number(i.qty_delivered || 0);
      });
    });
    return total;
  }

  function remainingQty(b: Bundle): number {
    return Math.max(Number(b.qty_required || 0) - deliveredQty(b.bundle_no), 0);
  }

  function statusMeta(b: Bundle) {
    const delivered = deliveredQty(b.bundle_no);
    const required = Number(b.qty_required || 0);

    if (delivered === 0) {
      return { label: "Not Started", cls: "bg-slate-200 text-slate-700" };
    }
    if (delivered < required) {
      return { label: "Part Delivered", cls: "bg-orange-100 text-orange-700" };
    }
    return { label: "Complete", cls: "bg-green-100 text-green-700" };
  }

  function addRow() {
    setBundles((prev) => [
      ...prev,
      {
        tower_id: towerId,
        bundle_no: "",
        section: "",
        qty_required: 0,
        total_weight: null,
      },
    ]);
  }

  async function saveRegister() {
    const payload = bundles
      .filter((b) => b.bundle_no.trim() !== "")
      .map((b) => ({
        tower_id: towerId,
        bundle_no: b.bundle_no.trim(),
        section: b.section || null,
        qty_required: Number(b.qty_required || 0),
        total_weight: b.total_weight === null ? null : Number(b.total_weight),
      }));

    if (!payload.length) {
      alert("Enter at least one bundle row.");
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase
        .from("tower_required_bundles")
        .upsert(payload, {
          onConflict: "tower_id,bundle_no",
        });

      if (error) {
        console.error(error);
        alert("Failed to save materials register.");
        return;
      }

      await load();
      alert("Materials register saved.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteBundle(bundleNo: string) {
    const ok = window.confirm(`Delete bundle ${bundleNo}?`);
    if (!ok) return;

    const { error } = await supabase
      .from("tower_required_bundles")
      .delete()
      .eq("tower_id", towerId)
      .eq("bundle_no", bundleNo);

    if (error) {
      console.error(error);
      alert("Failed to delete bundle.");
      return;
    }

    await load();
  }

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
              r["bundle"] ||
              r["Bundle Reference"];

            if (!bundleNo) return null;

            return {
              tower_id: towerId,
              bundle_no: String(bundleNo).trim(),
              section: r.section || r["Section"] || null,
              qty_required: Number(r.qty_required || r["Qty/Tower"] || 0),
              total_weight: Number(r.total_weight || r["Total Weight"] || 0) || null,
            };
          })
          .filter(Boolean);

        if (!rows.length) {
          alert("No valid bundle rows found in CSV.");
          return;
        }

        const { error } = await supabase
          .from("tower_required_bundles")
          .upsert(rows, {
            onConflict: "tower_id,bundle_no",
          });

        if (error) {
          console.error(error);
          alert("CSV import failed.");
          return;
        }

        await load();
        alert("CSV imported.");
      },
    });
  }

  const filteredBundles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bundles;

    return bundles.filter((b) => {
      return (
        b.bundle_no.toLowerCase().includes(q) ||
        (b.section || "").toLowerCase().includes(q)
      );
    });
  }, [bundles, search]);

  const groupedBundles = useMemo(() => {
    return filteredBundles.reduce<Record<string, Bundle[]>>((acc, b) => {
      const section = b.section?.trim() || "Other";
      if (!acc[section]) acc[section] = [];
      acc[section].push(b);
      return acc;
    }, {});
  }, [filteredBundles]);

  const totalRequired = useMemo(() => {
    return bundles.reduce((sum, b) => sum + Number(b.qty_required || 0), 0);
  }, [bundles]);

  const totalDelivered = useMemo(() => {
    return bundles.reduce((sum, b) => sum + deliveredQty(b.bundle_no), 0);
  }, [bundles]);

  const totalRemaining = Math.max(totalRequired - totalDelivered, 0);

  const progress = totalRequired > 0 ? ((totalDelivered / totalRequired) * 100).toFixed(1) : "0.0";

  if (loading) {
    return <div className="p-8">Loading materials...</div>;
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      {tower && (
        <TowerHeader projectId={projectId} tower={tower} latestDate={latestDate} />
      )}

      <div className="bg-white border rounded-2xl p-6 space-y-6">
        <div className="flex justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Materials Register</h1>
            <p className="text-slate-500 mt-1">
              Permanent steel schedule for this tower. Deliveries are tracked separately.
            </p>
          </div>

          <div className="flex gap-3 flex-wrap">
            <StatCard label="Bundles" value={String(bundles.length)} />
            <StatCard label="Required Qty" value={String(totalRequired)} />
            <StatCard label="Delivered Qty" value={String(totalDelivered)} />
            <StatCard label="Remaining Qty" value={String(totalRemaining)} />
            <StatCard label="Progress" value={`${progress}%`} />
          </div>
        </div>

        <div className="border rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="w-full flex justify-between items-center px-4 py-4 bg-slate-50 border-b"
          >
            <div className="text-left">
              <div className="text-lg font-semibold">Bundle Register</div>
              <div className="text-sm text-slate-500">
                This register stays permanently for the tower.
              </div>
            </div>
            <div className="text-xl">{collapsed ? "▾" : "▴"}</div>
          </button>

          {!collapsed && (
            <div className="p-4 space-y-4">
              <div className="flex gap-2 flex-wrap items-center">
                <label className="bg-white border px-4 py-2 rounded cursor-pointer">
                  Import CSV
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) importCSV(file);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>

                <button
                  onClick={addRow}
                  className="bg-slate-200 px-4 py-2 rounded"
                >
                  Add Row
                </button>

                <button
                  onClick={saveRegister}
                  disabled={saving}
                  className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Register"}
                </button>

                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search bundle or section"
                  className="border p-2 rounded ml-auto min-w-[240px]"
                />
              </div>

              {filteredBundles.length === 0 ? (
                <div className="border rounded-xl p-6 text-center text-slate-500">
                  No bundle rows yet.
                </div>
              ) : (
                Object.entries(groupedBundles).map(([section, rows]) => (
                  <div key={section} className="space-y-2">
                    <div className="font-semibold text-slate-700">{section}</div>

                    <div className="overflow-x-auto">
                      <div className="min-w-[1000px]">
                        <div className="grid grid-cols-7 gap-2 px-2 py-2 text-xs font-semibold text-slate-500 bg-slate-50 border rounded-t-xl">
                          <div>Bundle No</div>
                          <div>Section</div>
                          <div>Qty Required</div>
                          <div>Delivered</div>
                          <div>Remaining</div>
                          <div>Status</div>
                          <div>Action</div>
                        </div>

                        {rows.map((b) => {
                          const idx = bundles.findIndex(
                            (x) => x.bundle_no === b.bundle_no && x.section === b.section
                          );
                          const status = statusMeta(b);

                          return (
                            <div
                              key={`${b.bundle_no}-${b.section}`}
                              className="grid grid-cols-7 gap-2 p-2 border-x border-b items-center"
                            >
                              <input
                                value={b.bundle_no}
                                onChange={(e) => {
                                  const copy = [...bundles];
                                  copy[idx].bundle_no = e.target.value;
                                  setBundles(copy);
                                }}
                                className="border p-2 rounded"
                                placeholder="Bundle No"
                              />

                              <input
                                value={b.section || ""}
                                onChange={(e) => {
                                  const copy = [...bundles];
                                  copy[idx].section = e.target.value;
                                  setBundles(copy);
                                }}
                                className="border p-2 rounded"
                                placeholder="Section"
                              />

                              <input
                                value={b.qty_required}
                                onChange={(e) => {
                                  const copy = [...bundles];
                                  copy[idx].qty_required = Number(e.target.value || 0);
                                  setBundles(copy);
                                }}
                                className="border p-2 rounded"
                                placeholder="Qty"
                              />

                              <div>{deliveredQty(b.bundle_no)}</div>
                              <div>{remainingQty(b)}</div>

                              <div>
                                <span
                                  className={`px-3 py-1 rounded-full text-sm ${status.cls}`}
                                >
                                  {status.label}
                                </span>
                              </div>

                              <div>
                                <button
                                  onClick={() => deleteBundle(b.bundle_no)}
                                  className="text-red-600"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-100 rounded-xl px-4 py-3 min-w-[110px]">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}