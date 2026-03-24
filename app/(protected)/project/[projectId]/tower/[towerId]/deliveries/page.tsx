"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type Bundle = {
  id: string;
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
  delivered_by: string;
  vehicle: string;
  created_at: string;
  tower_bundle_delivery_items: DeliveryItem[];
};

export default function DeliveriesPage() {
  const params = useParams();

  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = createSupabaseBrowser();

  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [search, setSearch] = useState("");

  const [deliveredBy, setDeliveredBy] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQtyMap, setEditQtyMap] = useState<Record<string, number>>({});

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: b } = await supabase
      .from("tower_required_bundles")
      .select("*")
      .eq("tower_id", towerId)
      .order("bundle_no");

    const { data: d } = await supabase
      .from("tower_bundle_deliveries")
      .select("*, tower_bundle_delivery_items(*)")
      .eq("tower_id", towerId)
      .order("created_at", { ascending: false });

    setBundles(b || []);
    setDeliveries(d || []);
  }

  /* ================= DELIVERY TOTALS ================= */

  const deliveredTotals = useMemo(() => {
    const map: Record<string, number> = {};

    deliveries.forEach((d) => {
      d.tower_bundle_delivery_items.forEach((i) => {
        map[i.bundle_no] = (map[i.bundle_no] || 0) + i.qty_delivered;
      });
    });

    return map;
  }, [deliveries]);

  /* ================= SAVE DELIVERY ================= */

  async function saveDelivery() {
    const items = Object.entries(qtyMap)
      .filter(([, v]) => v > 0)
      .map(([bundle_no, qty]) => ({
        bundle_no,
        qty_delivered: qty,
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

    if (error) {
      alert(error.message);
      return;
    }

    const payload = items.map((i) => ({
      delivery_id: data.id,
      bundle_no: i.bundle_no,
      qty_delivered: i.qty_delivered,
    }));

    await supabase.from("tower_bundle_delivery_items").insert(payload);

    setDeliveredBy("");
    setVehicle("");
    setQtyMap({});
    load();
  }

  /* ================= DELETE DELIVERY ================= */

  async function deleteDelivery(id: string) {
    if (!confirm("Delete delivery?")) return;

    await supabase.from("tower_bundle_deliveries").delete().eq("id", id);
    load();
  }

  /* ================= EDIT DELIVERY ================= */

  function startEdit(d: Delivery) {
    setEditingId(d.id);

    const map: Record<string, number> = {};
    d.tower_bundle_delivery_items.forEach((i) => {
      map[i.bundle_no] = i.qty_delivered;
    });

    setEditQtyMap(map);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditQtyMap({});
  }

  async function saveEdit() {
    if (!editingId) return;

    await supabase
      .from("tower_bundle_delivery_items")
      .delete()
      .eq("delivery_id", editingId);

    const payload = Object.entries(editQtyMap).map(([bundle_no, qty]) => ({
      delivery_id: editingId,
      bundle_no,
      qty_delivered: qty,
    }));

    await supabase.from("tower_bundle_delivery_items").insert(payload);

    setEditingId(null);
    setEditQtyMap({});
    load();
  }

  /* ================= FILTER ================= */

  const filtered = useMemo(() => {
    return bundles.filter((b) =>
      b.bundle_no.toLowerCase().includes(search.toLowerCase())
    );
  }, [bundles, search]);

  /* ================= PROGRESS ================= */

  const totalRequired = bundles.reduce(
    (s, b) => s + b.qty_required,
    0
  );

  const totalDelivered = Object.values(deliveredTotals).reduce(
    (s, v) => s + v,
    0
  );

  const progress = totalRequired
    ? Math.round((totalDelivered / totalRequired) * 100)
    : 0;

  return (
    <div className="p-6 space-y-6">

      {/* FIXED HEADER */}
      <TowerHeader projectId={projectId} towerId={towerId} />

      <div className="bg-white p-6 rounded-2xl shadow space-y-4">
        <h1 className="text-2xl font-bold">Steel Deliveries</h1>

        {/* PROGRESS BAR */}
        <div>
          <div className="text-sm font-semibold">Tower Progress {progress}%</div>
          <div className="w-full bg-gray-200 h-4 rounded">
            <div
              className="bg-green-600 h-4 rounded"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* SEARCH */}
        <div>
          <label className="text-sm font-semibold">Search Bundle</label>
          <input
            className="border p-3 rounded w-full text-lg"
            placeholder="Type bundle number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* BUNDLE ENTRY */}
        <div className="border rounded-xl">
          {filtered.map((b) => {
            const delivered = deliveredTotals[b.bundle_no] || 0;
            const remaining = b.qty_required - delivered;

            return (
              <div
                key={b.id}
                className="grid grid-cols-4 gap-4 p-4 border-b items-center"
              >
                <div>
                  <div className="font-bold text-lg">{b.bundle_no}</div>
                  <div className="text-xs text-gray-500">{b.section}</div>
                </div>

                <div>
                  <div className="text-xs">Required</div>
                  <div className="font-bold">{b.qty_required}</div>
                </div>

                <div>
                  <div className="text-xs">Remaining</div>
                  <div className="font-bold">{remaining}</div>
                </div>

                <div>
                  <label className="text-xs">Deliver Qty</label>
                  <input
                    type="number"
                    className="border p-2 rounded w-full"
                    value={qtyMap[b.bundle_no] || ""}
                    onChange={(e) =>
                      setQtyMap({
                        ...qtyMap,
                        [b.bundle_no]: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* DELIVERY META */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold">Delivered By</label>
            <input
              className="border p-3 rounded w-full"
              value={deliveredBy}
              onChange={(e) => setDeliveredBy(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-semibold">Vehicle</label>
            <input
              className="border p-3 rounded w-full"
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
            />
          </div>
        </div>

        <button
          onClick={saveDelivery}
          className="bg-green-600 text-white px-6 py-3 rounded-xl text-lg"
        >
          Save Delivery
        </button>
      </div>

      {/* DELIVERY REGISTER */}
      <div className="bg-white p-6 rounded-2xl shadow space-y-4">
        <h2 className="text-xl font-bold">Delivery Register</h2>

        {deliveries.map((d) => {
          const isEditing = editingId === d.id;

          return (
            <div key={d.id} className="border rounded-xl p-4 space-y-3">
              <div className="flex justify-between">
                <div>
                  <div className="font-bold">{d.delivered_by}</div>
                  <div className="text-sm text-gray-500">{d.vehicle}</div>
                  <div className="text-xs text-gray-400">
                    {new Date(d.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="flex gap-3">
                  {!isEditing && (
                    <button
                      onClick={() => startEdit(d)}
                      className="text-blue-600"
                    >
                      Edit
                    </button>
                  )}

                  {isEditing && (
                    <>
                      <button
                        onClick={saveEdit}
                        className="text-green-600"
                      >
                        Save
                      </button>

                      <button
                        onClick={cancelEdit}
                        className="text-gray-500"
                      >
                        Cancel
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => deleteDelivery(d.id)}
                    className="text-red-600"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="border rounded">
                {d.tower_bundle_delivery_items.map((i) => (
                  <div
                    key={i.bundle_no}
                    className="flex justify-between p-2 border-t"
                  >
                    <div>{i.bundle_no}</div>

                    {!isEditing ? (
                      <div className="font-semibold">
                        {i.qty_delivered}
                      </div>
                    ) : (
                      <input
                        type="number"
                        className="border p-1 rounded"
                        value={editQtyMap[i.bundle_no] || ""}
                        onChange={(e) =>
                          setEditQtyMap({
                            ...editQtyMap,
                            [i.bundle_no]: Number(e.target.value),
                          })
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}