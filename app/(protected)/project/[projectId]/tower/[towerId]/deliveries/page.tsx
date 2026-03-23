"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Papa from "papaparse";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

export default function DeliveriesPage() {
  const { projectId, towerId } = useParams();
  const supabase = createSupabaseBrowser();

  const [bundles, setBundles] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);

  const [deliveredBy, setDeliveredBy] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [date, setDate] = useState("");
  const [comments, setComments] = useState("");

  const [enteredQty, setEnteredQty] = useState<any>({});
  const [editingDelivery, setEditingDelivery] = useState<any>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    const req = await supabase
      .from("tower_required_bundles")
      .select("*")
      .eq("tower_id", towerId)
      .order("section");

    const del = await supabase
      .from("tower_bundle_deliveries")
      .select(`*, tower_bundle_delivery_items(*)`)
      .eq("tower_id", towerId)
      .order("delivery_date", { ascending: false });

    setBundles(req.data || []);
    setDeliveries(del.data || []);
    setLoading(false);
  }

  function handleCSV(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        for (const r of results.data as any[]) {
          const bundle =
            r.bundle_no ||
            r.bundle ||
            r["Bundle No"] ||
            r["Bundle Reference"];

          if (!bundle) continue;

          await supabase.from("tower_required_bundles").insert({
            tower_id: towerId,
            bundle_no: bundle,
            qty_required:
              Number(r.qty_required || r.quantity || r["Qty/Tower"]) ||
              null,
            bundle_mass:
              Number(r.bundle_mass || r["Bundle Mass"]) || null,
            total_weight:
              Number(r.total_weight || r["Total Weight"]) || null,
            section: r.section || r["Section"] || null,
          });
        }

        alert("CSV Imported");
        load();
      },
    });
  }

  function addBundleRow() {
    setBundles([
      ...bundles,
      {
        id: Math.random(),
        bundle_no: "",
        section: "",
        qty_required: "",
        bundle_mass: "",
        total_weight: "",
        isNew: true,
      },
    ]);
  }

  async function saveRegister() {
    for (const b of bundles) {
      if (b.isNew && b.bundle_no) {
        await supabase.from("tower_required_bundles").insert({
          tower_id: towerId,
          bundle_no: b.bundle_no,
          section: b.section,
          qty_required: Number(b.qty_required) || null,
          bundle_mass: Number(b.bundle_mass) || null,
          total_weight: Number(b.total_weight) || null,
        });
      }
    }

    alert("Register Saved");
    load();
  }

  async function deleteBundle(id: string) {
    await supabase
      .from("tower_required_bundles")
      .delete()
      .eq("id", id);
    load();
  }

  function getDeliveredQty(bundle: string) {
    let t = 0;
    deliveries.forEach((d) =>
      d.tower_bundle_delivery_items.forEach((i: any) => {
        if (i.bundle_no === bundle)
          t += Number(i.qty_delivered || 0);
      })
    );
    return t;
  }

  async function saveDelivery() {
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

    for (const b of bundles) {
      const qty = Number(enteredQty[b.bundle_no] || 0);

      if (qty > 0) {
        await supabase.from("tower_bundle_delivery_items").insert({
          delivery_id: data.id,
          bundle_no: b.bundle_no,
          qty_delivered: qty,
        });
      }
    }

    alert("Delivery Saved");
    setEnteredQty({});
    load();
  }

  async function deleteDelivery(id: string) {
    if (!confirm("Delete delivery?")) return;

    await supabase
      .from("tower_bundle_deliveries")
      .delete()
      .eq("id", id);

    load();
  }

  async function deleteDeliveryItem(id: string) {
    await supabase
      .from("tower_bundle_delivery_items")
      .delete()
      .eq("id", id);

    load();
  }

  if (loading) return <div className="p-8">Loading...</div>;

  const grouped = Object.values(
    bundles.reduce((acc: any, b) => {
      const key = b.section || "Other";
      if (!acc[key]) acc[key] = [];
      acc[key].push(b);
      return acc;
    }, {})
  );

  return (
    <div className="p-8 space-y-6">

      <h1 className="text-3xl font-bold">Steel Deliveries</h1>

      {/* REGISTER */}

      <div className="bg-white border rounded-2xl shadow">
        <div
          className="flex justify-between items-center p-4 cursor-pointer"
          onClick={() => setCollapsed(!collapsed)}
        >
          <h2 className="text-xl font-semibold">
            Bundle Register ({bundles.length})
          </h2>
          <div>{collapsed ? "▼" : "▲"}</div>
        </div>

        {!collapsed && (
          <div className="p-4 space-y-3">
            <div className="flex gap-3">
              <input
                type="file"
                accept=".csv"
                onChange={(e) =>
                  e.target.files && handleCSV(e.target.files[0])
                }
              />

              <button
                onClick={addBundleRow}
                className="bg-slate-200 px-4 py-2 rounded"
              >
                Add Row
              </button>

              <button
                onClick={saveRegister}
                className="bg-blue-600 text-white px-4 py-2 rounded"
              >
                Save Register
              </button>
            </div>

            {grouped.map((group: any, gi) => (
              <div key={gi}>
                <h3 className="font-bold mt-4">
                  {group[0].section || "Other"}
                </h3>

                {group.map((b: any, i: number) => (
                  <div
                    key={i}
                    className="grid grid-cols-6 gap-2 border-b p-2"
                  >
                    <input
                      value={b.bundle_no || ""}
                      onChange={(e) => (b.bundle_no = e.target.value)}
                      className="border p-1"
                    />
                    <input
                      value={b.qty_required || ""}
                      onChange={(e) =>
                        (b.qty_required = e.target.value)
                      }
                      className="border p-1"
                    />
                    <input
                      value={b.bundle_mass || ""}
                      onChange={(e) =>
                        (b.bundle_mass = e.target.value)
                      }
                      className="border p-1"
                    />
                    <input
                      value={b.total_weight || ""}
                      onChange={(e) =>
                        (b.total_weight = e.target.value)
                      }
                      className="border p-1"
                    />
                    <div>
                      Delivered: {getDeliveredQty(b.bundle_no)}
                    </div>

                    <button
                      onClick={() => deleteBundle(b.id)}
                      className="text-red-500"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* NEW DELIVERY */}

      <div className="bg-white border rounded-2xl shadow p-4 space-y-3">
        <h2 className="text-xl font-semibold">New Delivery</h2>

        <div className="grid grid-cols-4 gap-3">
          <input
            placeholder="Delivered By"
            value={deliveredBy}
            onChange={(e) => setDeliveredBy(e.target.value)}
            className="border p-2"
          />
          <input
            placeholder="Vehicle"
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
            className="border p-2"
          />
          <input
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border p-2"
          />
          <input
            placeholder="Comments"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            className="border p-2"
          />
        </div>

        {bundles.map((b) => (
          <div key={b.id} className="grid grid-cols-5 gap-2">
            <div>{b.bundle_no}</div>
            <div>Req {b.qty_required || 1}</div>
            <div>Del {getDeliveredQty(b.bundle_no)}</div>
            <input
              placeholder="Deliver now"
              value={enteredQty[b.bundle_no] || ""}
              onChange={(e) =>
                setEnteredQty({
                  ...enteredQty,
                  [b.bundle_no]: e.target.value,
                })
              }
              className="border p-1"
            />
          </div>
        ))}

        <button
          onClick={saveDelivery}
          className="bg-green-600 text-white px-6 py-2 rounded"
        >
          Save Delivery
        </button>
      </div>

      {/* DELIVERY HISTORY */}

      <div className="bg-white border rounded-2xl shadow p-4 space-y-3">
        <h2 className="text-xl font-semibold">Delivery History</h2>

        {deliveries.map((d) => (
          <div key={d.id} className="border rounded-xl p-3">
            <div className="flex justify-between">
              <div>
                <strong>
                  {d.delivered_by} • {d.vehicle}
                </strong>
                <div className="text-sm">
                  {new Date(d.delivery_date).toLocaleString()}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => deleteDelivery(d.id)}
                  className="text-red-600"
                >
                  Delete Delivery
                </button>
              </div>
            </div>

            {d.tower_bundle_delivery_items.map((i: any) => (
              <div
                key={i.id}
                className="flex justify-between border-t pt-1 mt-1"
              >
                <div>
                  {i.bundle_no} → {i.qty_delivered}
                </div>

                <button
                  onClick={() => deleteDeliveryItem(i.id)}
                  className="text-red-500 text-sm"
                >
                  Delete Item
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}