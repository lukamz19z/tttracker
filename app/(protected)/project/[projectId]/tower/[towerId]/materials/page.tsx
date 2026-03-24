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

type Delivery = {
  tower_bundle_delivery_items: {
    bundle_no: string;
    qty_delivered: number;
  }[];
};

export default function MaterialsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<any>(null);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [collapsedSegments, setCollapsedSegments] = useState<Record<string, boolean>>({});

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const t = await supabase.from("towers").select("*").eq("id", towerId).single();

    const b = await supabase
      .from("tower_required_bundles")
      .select("*")
      .eq("tower_id", towerId)
      .order("section")
      .order("bundle_no");

    const d = await supabase
      .from("tower_bundle_deliveries")
      .select("tower_bundle_delivery_items(*)")
      .eq("tower_id", towerId);

    setTower(t.data);
    setBundles(b.data || []);
    setDeliveries(d.data || []);
  }

  function deliveredQty(bundleNo: string) {
    let total = 0;
    deliveries.forEach((d) =>
      d.tower_bundle_delivery_items.forEach((i) => {
        if (i.bundle_no === bundleNo) total += Number(i.qty_delivered);
      })
    );
    return total;
  }

  function remainingQty(b: Bundle) {
    return Math.max(b.qty_required - deliveredQty(b.bundle_no), 0);
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
        section: b.section || "General",
        qty_required: Number(b.qty_required),
        total_weight: b.total_weight,
      }));

    await supabase.from("tower_required_bundles").upsert(payload, {
      onConflict: "tower_id,bundle_no",
    });

    alert("Register saved");
    load();
  }

  function importCSV(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (res) => {
        const rows = (res.data as any[]).map((r) => ({
          tower_id: towerId,
          bundle_no: r.bundle_no,
          section: r.section || "General",
          qty_required: Number(r.qty_required || 0),
          total_weight: Number(r.total_weight || 0),
        }));

        await supabase.from("tower_required_bundles").upsert(rows, {
          onConflict: "tower_id,bundle_no",
        });

        alert("CSV Imported");
        load();
      },
    });
  }

  /* ===== SEGMENT GROUPING ===== */

  const segments = useMemo(() => {
    const map: Record<string, Bundle[]> = {};

    bundles.forEach((b) => {
      const seg = b.section?.trim() || "General";
      if (!map[seg]) map[seg] = [];
      map[seg].push(b);
    });

    return map;
  }, [bundles]);

  const overallRequired = bundles.reduce((s, b) => s + Number(b.qty_required), 0);
  const overallDelivered = bundles.reduce((s, b) => s + deliveredQty(b.bundle_no), 0);

  return (
    <div className="p-8 space-y-6">
      {tower && <TowerHeader projectId={projectId} tower={tower} />}

      <div className="bg-white border rounded-2xl p-6 space-y-6">
        <h1 className="text-2xl font-bold">Materials Register</h1>

        <div className="flex gap-6">
          <Stat label="Required" value={overallRequired} />
          <Stat label="Delivered" value={overallDelivered} />
          <Stat label="Remaining" value={overallRequired - overallDelivered} />
        </div>

        <div className="flex gap-3">
          <input
            type="file"
            accept=".csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importCSV(f);
            }}
          />
          <button onClick={addRow} className="bg-slate-200 px-3 py-1 rounded">
            Add Row
          </button>
          <button onClick={saveRegister} className="bg-blue-600 text-white px-3 py-1 rounded">
            Save Register
          </button>
        </div>

        {Object.entries(segments).map(([segment, rows]) => {
          const segReq = rows.reduce((s, b) => s + Number(b.qty_required), 0);
          const segDel = rows.reduce((s, b) => s + deliveredQty(b.bundle_no), 0);

          return (
            <div key={segment} className="border rounded-xl">
              <div
                className="bg-slate-100 p-3 cursor-pointer font-semibold flex justify-between"
                onClick={() =>
                  setCollapsedSegments((p) => ({
                    ...p,
                    [segment]: !p[segment],
                  }))
                }
              >
                <div>{segment}</div>
                <div>
                  {segDel}/{segReq}
                </div>
              </div>

              {!collapsedSegments[segment] && (
                <div className="p-3 space-y-2">
                  {rows.map((b, i) => (
                    <div key={i} className="grid grid-cols-6 gap-2 border p-2 rounded">
                      <input
                        className="border p-1"
                        value={b.bundle_no}
                        onChange={(e) => {
                          const copy = [...bundles];
                          copy[bundles.indexOf(b)].bundle_no = e.target.value;
                          setBundles(copy);
                        }}
                      />

                      <input
                        className="border p-1"
                        value={b.section || ""}
                        onChange={(e) => {
                          const copy = [...bundles];
                          copy[bundles.indexOf(b)].section = e.target.value;
                          setBundles(copy);
                        }}
                      />

                      <input
                        className="border p-1"
                        value={b.qty_required}
                        onChange={(e) => {
                          const copy = [...bundles];
                          copy[bundles.indexOf(b)].qty_required = Number(e.target.value);
                          setBundles(copy);
                        }}
                      />

                      <div>Delivered: {deliveredQty(b.bundle_no)}</div>
                      <div>Remaining: {remainingQty(b)}</div>
                      <div></div>
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

function Stat({ label, value }: any) {
  return (
    <div className="bg-slate-100 rounded-xl px-4 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}