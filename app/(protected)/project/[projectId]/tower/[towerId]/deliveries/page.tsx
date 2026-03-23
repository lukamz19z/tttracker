"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Papa from "papaparse";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

/* ================= TYPES ================= */

type Bundle = {
  id: string;
  tower_id: string;
  bundle_no: string;
  section: string | null;
  qty_required: number | null;
  total_weight: number | null;
  isNew?: boolean;
};

type DeliveryItem = {
  id: string;
  delivery_id: string;
  bundle_no: string;
  qty_delivered: number;
};

type Delivery = {
  id: string;
  delivered_by: string | null;
  vehicle: string | null;
  delivery_date: string | null;
  comments: string | null;
  tower_bundle_delivery_items: DeliveryItem[];
};

/* ================= PAGE ================= */

export default function DeliveriesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<any>(null);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [registerCollapsed, setRegisterCollapsed] = useState(false);

  const [deliveredBy, setDeliveredBy] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [date, setDate] = useState("");
  const [comments, setComments] = useState("");

  const [enteredQty, setEnteredQty] = useState<Record<string, string>>({});

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingQty, setEditingQty] = useState("");

  /* ================= LOAD ================= */

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const t = await supabase
      .from("towers")
      .select("*")
      .eq("id", towerId)
      .single();

    const b = await supabase
      .from("tower_required_bundles")
      .select("*")
      .eq("tower_id", towerId);

    const d = await supabase
      .from("tower_bundle_deliveries")
      .select("*, tower_bundle_delivery_items(*)")
      .eq("tower_id", towerId)
      .order("delivery_date", { ascending: false });

    setTower(t.data);
    setBundles(b.data || []);
    setDeliveries(d.data || []);
  }

  /* ================= HELPERS ================= */

  function getRequired(b: Bundle): number {
    return Number(b.qty_required || 0);
  }

  function getDelivered(bundleNo: string): number {
    let total = 0;

    deliveries.forEach((d) => {
      d.tower_bundle_delivery_items.forEach((i) => {
        if (i.bundle_no === bundleNo) {
          total += Number(i.qty_delivered || 0);
        }
      });
    });

    return total;
  }

  function getRemaining(b: Bundle): number {
    return Math.max(getRequired(b) - getDelivered(b.bundle_no), 0);
  }

  function getStatusColor(b: Bundle): string {
    const r = getRequired(b);
    const d = getDelivered(b.bundle_no);

    if (d === 0) return "bg-slate-400";
    if (d < r) return "bg-orange-400";
    return "bg-green-500";
  }

  /* ================= REGISTER ================= */

  function addBundleRow() {
    setBundles((prev) => [
      ...prev,
      {
        id: "new-" + Math.random(),
        tower_id: towerId,
        bundle_no: "",
        section: "",
        qty_required: null,
        total_weight: null,
        isNew: true,
      },
    ]);
  }

  async function saveRegister() {
    const newRows = bundles.filter(
      (b) => b.isNew && b.bundle_no.trim() !== ""
    );

    if (!newRows.length) {
      alert("No new rows to save.");
      return;
    }

    await supabase.from("tower_required_bundles").insert(newRows);
    load();
  }

  function importCSV(file: File) {
    Papa.parse(file, {
      header: true,
      complete: async (res) => {
        const rows = (res.data as any[]).map((r) => ({
          tower_id: towerId,
          bundle_no: r.bundle_no,
          section: r.section,
          qty_required: Number(r.qty_required),
          total_weight: Number(r.total_weight),
        }));

        await supabase.from("tower_required_bundles").insert(rows);
        load();
      },
    });
  }

  /* ================= DELIVERY ================= */

  async function saveDelivery() {
    if (!bundles.length) {
      alert("Create bundle register first.");
      return;
    }

    const items = bundles
      .map((b) => ({
        bundle_no: b.bundle_no,
        qty: Number(enteredQty[b.bundle_no] || 0),
      }))
      .filter((i) => i.qty > 0);

    if (!items.length) {
      alert("Enter quantities.");
      return;
    }

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

  async function deleteDelivery(id: string) {
    if (!confirm("Delete delivery?")) return;

    await supabase.from("tower_bundle_deliveries").delete().eq("id", id);
    load();
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete item?")) return;

    await supabase.from("tower_bundle_delivery_items").delete().eq("id", id);
    load();
  }

  async function updateItem(id: string) {
    await supabase
      .from("tower_bundle_delivery_items")
      .update({ qty_delivered: Number(editingQty) })
      .eq("id", id);

    setEditingItemId(null);
    load();
  }

  /* ================= PROGRESS ================= */

  const progress = useMemo(() => {
    let r = 0;
    let d = 0;

    bundles.forEach((b) => {
      r += getRequired(b);
      d += getDelivered(b.bundle_no);
    });

    return r ? ((d / r) * 100).toFixed(1) : "0";
  }, [bundles, deliveries]);

  /* ================= UI ================= */

  return (
    <div className="p-8 space-y-6">
      {tower && (
        <TowerHeader projectId={projectId} tower={tower} />
      )}

      <div className="bg-white border rounded-2xl p-6 space-y-6">
        <h1 className="text-2xl font-bold">Steel Deliveries</h1>

        <div className="text-lg">Progress: {progress}%</div>

        {/* REGISTER */}
        <div className="border rounded-xl">
          <div
            className="bg-slate-100 p-4 cursor-pointer font-semibold"
            onClick={() => setRegisterCollapsed(!registerCollapsed)}
          >
            Bundle Register ({bundles.length})
          </div>

          {!registerCollapsed && (
            <div className="p-4 space-y-3">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importCSV(f);
                }}
              />

              <button
                onClick={addBundleRow}
                className="bg-slate-200 px-3 py-1 rounded"
              >
                Add Row
              </button>

              <button
                onClick={saveRegister}
                className="bg-blue-600 text-white px-3 py-1 rounded"
              >
                Save Register
              </button>

              {bundles.map((b, i) => (
                <div
                  key={b.id}
                  className="grid grid-cols-6 gap-2 border p-2 rounded"
                >
                  <input
                    className="border p-1"
                    placeholder="Bundle"
                    value={b.bundle_no}
                    onChange={(e) => {
                      const copy = [...bundles];
                      copy[i].bundle_no = e.target.value;
                      setBundles(copy);
                    }}
                  />

                  <input
                    className="border p-1"
                    placeholder="Section"
                    value={b.section || ""}
                    onChange={(e) => {
                      const copy = [...bundles];
                      copy[i].section = e.target.value;
                      setBundles(copy);
                    }}
                  />

                  <input
                    className="border p-1"
                    placeholder="Qty"
                    value={b.qty_required || ""}
                    onChange={(e) => {
                      const copy = [...bundles];
                      copy[i].qty_required = Number(e.target.value);
                      setBundles(copy);
                    }}
                  />

                  <div>Delivered: {getDelivered(b.bundle_no)}</div>
                  <div>Remaining: {getRemaining(b)}</div>

                  <div
                    className={`${getStatusColor(
                      b
                    )} text-white px-2 py-1 rounded text-xs`}
                  >
                    Status
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* NEW DELIVERY */}
        <div className="border rounded-xl p-4 space-y-3">
          <div className="font-semibold">New Delivery</div>

          <div className="grid grid-cols-4 gap-2">
            <input
              className="border p-2"
              placeholder="Delivered By"
              value={deliveredBy}
              onChange={(e) => setDeliveredBy(e.target.value)}
            />

            <input
              className="border p-2"
              placeholder="Vehicle"
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
            />

            <input
              type="datetime-local"
              className="border p-2"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />

            <input
              className="border p-2"
              placeholder="Comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
          </div>

          {bundles.map((b) => (
            <div key={b.bundle_no} className="grid grid-cols-3 gap-2">
              <div>{b.bundle_no}</div>
              <div>Remaining: {getRemaining(b)}</div>

              <input
                className="border p-1"
                placeholder="Deliver qty"
                value={enteredQty[b.bundle_no] || ""}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val > getRemaining(b)) {
                    alert("Too many delivered");
                    return;
                  }

                  setEnteredQty({
                    ...enteredQty,
                    [b.bundle_no]: e.target.value,
                  });
                }}
              />
            </div>
          ))}

          <button
            onClick={saveDelivery}
            className="bg-green-600 text-white px-4 py-2 rounded"
          >
            Save Delivery
          </button>
        </div>

        {/* DELIVERY HISTORY */}
        <div className="border rounded-xl p-4 space-y-4">
          <div className="font-semibold">Delivery History</div>

          {deliveries.map((d) => (
            <div key={d.id} className="border rounded p-3">
              <div className="flex justify-between">
                <div>
                  {d.delivered_by} • {d.vehicle}
                  <div className="text-sm text-slate-500">
                    {new Date(d.delivery_date || "").toLocaleString()}
                  </div>
                </div>

                <button
                  onClick={() => deleteDelivery(d.id)}
                  className="text-red-600"
                >
                  Delete Delivery
                </button>
              </div>

              {d.tower_bundle_delivery_items.map((i) => (
                <div
                  key={i.id}
                  className="flex justify-between mt-2 border-t pt-2"
                >
                  <div>{i.bundle_no}</div>

                  {editingItemId === i.id ? (
                    <div className="flex gap-2">
                      <input
                        className="border p-1"
                        value={editingQty}
                        onChange={(e) => setEditingQty(e.target.value)}
                      />

                      <button
                        onClick={() => updateItem(i.id)}
                        className="text-blue-600"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <div>{i.qty_delivered}</div>

                      <button
                        className="text-blue-600"
                        onClick={() => {
                          setEditingItemId(i.id);
                          setEditingQty(String(i.qty_delivered));
                        }}
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => deleteItem(i.id)}
                        className="text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}