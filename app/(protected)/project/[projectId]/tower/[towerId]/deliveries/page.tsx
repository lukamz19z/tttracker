"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Papa from "papaparse";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type RequiredBundle = {
  id: string;
  tower_id: string;
  bundle_no: string;
  section: string | null;
  qty_required: number | null;
  bundle_mass: number | null;
  total_weight: number | null;
  isNew?: boolean;
};

type DeliveryItem = {
  id: string;
  delivery_id: string;
  bundle_no: string;
  qty_delivered: number | null;
};

type Delivery = {
  id: string;
  tower_id: string;
  delivered_by: string | null;
  vehicle: string | null;
  delivery_date: string | null;
  comments: string | null;
  tower_bundle_delivery_items: DeliveryItem[];
};

export default function DeliveriesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<any>(null);
  const [bundles, setBundles] = useState<RequiredBundle[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  const [deliveredBy, setDeliveredBy] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [date, setDate] = useState("");
  const [comments, setComments] = useState("");

  const [enteredQty, setEnteredQty] = useState<Record<string, string>>({});

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const towerRes = await supabase.from("towers").select("*").eq("id", towerId).single();
    const reqRes = await supabase.from("tower_required_bundles").select("*").eq("tower_id", towerId);
    const delRes = await supabase
      .from("tower_bundle_deliveries")
      .select(`*, tower_bundle_delivery_items(*)`)
      .eq("tower_id", towerId)
      .order("delivery_date", { ascending: false });

    setTower(towerRes.data);
    setBundles(reqRes.data || []);
    setDeliveries(delRes.data || []);
  }

  function getRequired(b: RequiredBundle) {
    return Number(b.qty_required || 0);
  }

  function getDelivered(bundleNo: string) {
    let t = 0;
    deliveries.forEach((d) =>
      d.tower_bundle_delivery_items.forEach((i) => {
        if (i.bundle_no === bundleNo) t += Number(i.qty_delivered || 0);
      })
    );
    return t;
  }

  function getRemaining(b: RequiredBundle) {
    return Math.max(getRequired(b) - getDelivered(b.bundle_no), 0);
  }

  function getStatus(b: RequiredBundle) {
    const r = getRequired(b);
    const d = getDelivered(b.bundle_no);

    if (d === 0) return { label: "NOT STARTED", color: "bg-slate-300" };
    if (d < r) return { label: "PART DELIVERED", color: "bg-orange-400" };
    return { label: "COMPLETE", color: "bg-green-500" };
  }

  async function saveDelivery() {
    const items = bundles
      .map((b) => ({
        bundle_no: b.bundle_no,
        qty: Number(enteredQty[b.bundle_no] || 0),
      }))
      .filter((x) => x.qty > 0);

    if (!items.length) return alert("Enter quantities.");

    const { data } = await supabase
      .from("tower_bundle_deliveries")
      .insert({
        tower_id: towerId,
        delivered_by: deliveredBy,
        vehicle,
        delivery_date: date,
        comments,
      })
      .select()
      .single();

    await supabase.from("tower_bundle_delivery_items").insert(
      items.map((i) => ({
        delivery_id: data.id,
        bundle_no: i.bundle_no,
        qty_delivered: i.qty,
      }))
    );

    setEnteredQty({});
    setDeliveredBy("");
    setVehicle("");
    setDate("");
    setComments("");

    load();
  }

  function addRow() {
    setBundles((p) => [
      ...p,
      {
        id: "new-" + Math.random(),
        tower_id: towerId,
        bundle_no: "",
        section: "",
        qty_required: null,
        bundle_mass: null,
        total_weight: null,
        isNew: true,
      },
    ]);
  }

  async function saveRegister() {
    const rows = bundles.filter((b) => b.isNew && b.bundle_no);

    await supabase.from("tower_required_bundles").insert(
      rows.map((r) => ({
        tower_id: towerId,
        bundle_no: r.bundle_no,
        section: r.section,
        qty_required: r.qty_required,
        bundle_mass: r.bundle_mass,
        total_weight: r.total_weight,
      }))
    );

    load();
  }

  function handleCSV(file: File) {
    Papa.parse(file, {
      header: true,
      complete: async (res) => {
        const rows = res.data.map((r: any) => ({
          tower_id: towerId,
          bundle_no: r.bundle_no,
          section: r.section,
          qty_required: Number(r.qty_required),
          bundle_mass: Number(r.bundle_mass),
          total_weight: Number(r.total_weight),
        }));

        await supabase.from("tower_required_bundles").insert(rows);
        load();
      },
    });
  }

  const progress = useMemo(() => {
    let req = 0;
    let del = 0;

    bundles.forEach((b) => {
      req += getRequired(b);
      del += getDelivered(b.bundle_no);
    });

    return req ? ((del / req) * 100).toFixed(1) : "0";
  }, [bundles, deliveries]);

  return (
    <div className="p-8 space-y-6">
      {tower && <TowerHeader projectId={projectId} tower={tower} />}

      <div className="bg-white border rounded-2xl p-6 space-y-6">
        <h1 className="text-2xl font-bold">Steel Deliveries</h1>

        <div className="text-lg">Progress: {progress}%</div>

        <div className="border rounded-xl">
          <div
            onClick={() => setCollapsed(!collapsed)}
            className="p-4 bg-slate-100 cursor-pointer font-semibold"
          >
            Bundle Register ({bundles.length})
          </div>

          {!collapsed && (
            <div className="p-4 space-y-3">
              <input type="file" onChange={(e) => handleCSV(e.target.files![0])} />
              <button onClick={addRow} className="bg-slate-200 px-3 py-1 rounded">
                Add Row
              </button>
              <button onClick={saveRegister} className="bg-blue-600 text-white px-3 py-1 rounded">
                Save Register
              </button>

              {bundles.map((b, i) => {
                const status = getStatus(b);
                return (
                  <div key={i} className="grid grid-cols-7 gap-2 border p-2 rounded">
                    <input
                      placeholder="Bundle"
                      value={b.bundle_no}
                      onChange={(e) => {
                        const copy = [...bundles];
                        copy[i].bundle_no = e.target.value;
                        setBundles(copy);
                      }}
                      className="border p-1"
                    />
                    <input
                      placeholder="Section"
                      value={b.section || ""}
                      onChange={(e) => {
                        const copy = [...bundles];
                        copy[i].section = e.target.value;
                        setBundles(copy);
                      }}
                      className="border p-1"
                    />
                    <input
                      placeholder="Qty"
                      value={b.qty_required || ""}
                      onChange={(e) => {
                        const copy = [...bundles];
                        copy[i].qty_required = Number(e.target.value);
                        setBundles(copy);
                      }}
                      className="border p-1"
                    />
                    <div>{getDelivered(b.bundle_no)}</div>
                    <div>{getRemaining(b)}</div>
                    <div className={`${status.color} text-white px-2 py-1 rounded text-xs`}>
                      {status.label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border rounded-xl p-4 space-y-3">
          <div className="font-semibold">New Delivery</div>

          <div className="grid grid-cols-4 gap-2">
            <input placeholder="Delivered By" value={deliveredBy} onChange={(e) => setDeliveredBy(e.target.value)} className="border p-2"/>
            <input placeholder="Vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="border p-2"/>
            <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="border p-2"/>
            <input placeholder="Comments" value={comments} onChange={(e) => setComments(e.target.value)} className="border p-2"/>
          </div>

          {bundles.map((b) => {
            const remaining = getRemaining(b);
            return (
              <div key={b.bundle_no} className="grid grid-cols-4 gap-2">
                <div>{b.bundle_no}</div>
                <div>Remaining: {remaining}</div>
                <input
                  placeholder="Deliver qty"
                  value={enteredQty[b.bundle_no] || ""}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val > remaining) return alert("Too many delivered");
                    setEnteredQty({ ...enteredQty, [b.bundle_no]: e.target.value });
                  }}
                  className="border p-1"
                />
              </div>
            );
          })}

          <button onClick={saveDelivery} className="bg-green-600 text-white px-4 py-2 rounded">
            Save Delivery
          </button>
        </div>
      </div>
    </div>
  );
}