"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Papa from "papaparse";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type Bundle = {
  ui_id: string;
  id?: string;
  tower_id: string;
  bundle_no: string;
  section: string;
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
  const [collapsedSegments, setCollapsedSegments] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const t = await supabase.from("towers").select("*").eq("id", towerId).single();

    const b = await supabase
      .from("tower_required_bundles")
      .select("*")
      .eq("tower_id", towerId);

    const d = await supabase
      .from("tower_bundle_deliveries")
      .select("tower_bundle_delivery_items(*)")
      .eq("tower_id", towerId);

    setTower(t.data);

    setBundles(
      (b.data || []).map((row: any) => ({
        ...row,
        ui_id: crypto.randomUUID(),
        section: row.section || "General",
      }))
    );

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

  function updateRow(id: string, field: keyof Bundle, value: any) {
    setBundles(prev =>
      prev.map(b =>
        b.ui_id === id ? { ...b, [field]: value } : b
      )
    );
  }

  function addRow() {
    setBundles((prev) => [
      ...prev,
      {
        ui_id: crypto.randomUUID(),
        tower_id: towerId,
        bundle_no: "",
        section: "General",
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
        section: b.section,
        qty_required: b.qty_required,
        total_weight: b.total_weight,
      }));

    const { error } = await supabase
      .from("tower_required_bundles")
      .upsert(payload, {
        onConflict: "tower_id,bundle_no",
      });

    if (error) {
      alert("Save failed");
      return;
    }

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

  function deleteRow(ui_id: string) {
    setBundles((prev) => prev.filter((b) => b.ui_id !== ui_id));
  }

  const segments = useMemo(() => {
    const map: Record<string, Bundle[]> = {};

    bundles.forEach((b) => {
      if (!map[b.section]) map[b.section] = [];
      map[b.section].push(b);
    });

    return map;
  }, [bundles]);

  const totalRequired = bundles.reduce((s, b) => s + b.qty_required, 0);
  const totalDelivered = bundles.reduce(
    (s, b) => s + deliveredQty(b.bundle_no),
    0
  );

  return (
    <div className="p-8 space-y-6">
      {tower && <TowerHeader projectId={projectId} tower={tower} />}

      <div className="bg-white border rounded-2xl p-6 space-y-6">
        <h1 className="text-2xl font-bold">Materials Register</h1>

        <div className="flex gap-6">
          <Stat label="Required" value={totalRequired} />
          <Stat label="Delivered" value={totalDelivered} />
          <Stat label="Remaining" value={totalRequired - totalDelivered} />
        </div>

        <div className="flex gap-3">
          <input type="file" accept=".csv" onChange={(e)=>{const f=e.target.files?.[0]; if(f) importCSV(f)}} />
          <button onClick={addRow} className="bg-slate-200 px-3 py-1 rounded">Add Row</button>
          <button onClick={saveRegister} className="bg-blue-600 text-white px-3 py-1 rounded">Save Register</button>
        </div>

        {Object.entries(segments).map(([segment, rows]) => (
          <div key={segment} className="border rounded-xl">
            <div className="bg-slate-100 p-3 font-semibold">{segment}</div>

            <div className="p-3 space-y-3">
              {rows.map((b) => (
                <div key={b.ui_id} className="grid grid-cols-5 gap-3 border p-3 rounded-xl">
                  
                  <input
                    className="border p-2 rounded"
                    placeholder="Bundle Number"
                    value={b.bundle_no}
                    onChange={(e)=>updateRow(b.ui_id,"bundle_no",e.target.value)}
                  />

                  <input
                    className="border p-2 rounded"
                    placeholder="Segment"
                    value={b.section}
                    onChange={(e)=>updateRow(b.ui_id,"section",e.target.value)}
                  />

                  <input
                    className="border p-2 rounded"
                    placeholder="Qty Required"
                    value={b.qty_required}
                    onChange={(e)=>updateRow(b.ui_id,"qty_required",Number(e.target.value))}
                  />

                  <div>
                    Delivered
                    <div className="font-bold">{deliveredQty(b.bundle_no)}</div>
                  </div>

                  <div>
                    Remaining
                    <div className="font-bold">{remainingQty(b)}</div>
                  </div>

                  <button onClick={()=>deleteRow(b.ui_id)} className="text-red-600 text-sm col-span-5">
                    Remove Row
                  </button>

                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({label,value}:any){
  return(
    <div className="bg-slate-100 rounded-xl px-4 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  )
}