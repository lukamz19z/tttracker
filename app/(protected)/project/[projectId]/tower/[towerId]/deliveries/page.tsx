"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

/* ================= TYPES ================= */

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
  delivered_by: string;
  vehicle: string;
  created_at: string;
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

  const [search, setSearch] = useState("");

  const [deliveredBy, setDeliveredBy] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQtyMap, setEditQtyMap] = useState<Record<string, number>>({});

  /* ================= LOAD ================= */

  useEffect(() => {
    if (towerId) load();
  }, [towerId]);

  async function load() {
    const [towerRes, bundleRes, deliveryRes] = await Promise.all([
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
    ]);

    setTower(towerRes.data);
    setBundles(bundleRes.data || []);
    setDeliveries(deliveryRes.data || []);
  }

  /* ================= TOTALS ================= */

  const deliveredTotals = useMemo(() => {
    const map: Record<string, number> = {};
    deliveries.forEach((d) => {
      d.tower_bundle_delivery_items.forEach((i) => {
        map[i.bundle_no] =
          (map[i.bundle_no] || 0) + Number(i.qty_delivered);
      });
    });
    return map;
  }, [deliveries]);

  /* ================= PROGRESS ================= */

  const totalRequired = bundles.reduce(
    (s, b) => s + Number(b.qty_required),
    0
  );

  const totalDelivered = Object.values(deliveredTotals).reduce(
    (s, v) => s + v,
    0
  );

  const progress = totalRequired
    ? (totalDelivered / totalRequired) * 100
    : 0;

  /* ================= SAVE DELIVERY ================= */

  async function saveDelivery() {
    const items = Object.entries(qtyMap)
      .filter(([, qty]) => qty > 0)
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

    if (error || !data) {
      alert(error?.message || "Insert failed");
      return;
    }

    const payload = items.map((i) => ({
      delivery_id: data.id,
      bundle_no: i.bundle_no,
      qty_delivered: i.qty_delivered,
    }));

    await supabase
      .from("tower_bundle_delivery_items")
      .insert(payload);

    setDeliveredBy("");
    setVehicle("");
    setQtyMap({});
    load();
  }

  /* ================= DELETE ================= */

  async function deleteDelivery(id: string) {
    if (!confirm("Delete delivery?")) return;

    await supabase
      .from("tower_bundle_deliveries")
      .delete()
      .eq("id", id);

    load();
  }

  /* ================= EDIT ================= */

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

    const payload = Object.entries(editQtyMap).map(
      ([bundle_no, qty]) => ({
        delivery_id: editingId,
        bundle_no,
        qty_delivered: qty,
      })
    );

    await supabase
      .from("tower_bundle_delivery_items")
      .insert(payload);

    cancelEdit();
    load();
  }

  /* ================= SEARCH ================= */

  const filteredBundles = useMemo(() => {
    return bundles.filter((b) =>
      b.bundle_no.toLowerCase().includes(search.toLowerCase())
    );
  }, [bundles, search]);

  /* ================= UI ================= */

  return (
    <div className="p-8 space-y-6">
      {tower && (
        <TowerHeader
          projectId={projectId}
          tower={tower}
          latestDate={null}
        />
      )}

      {/* ===== DELIVERY ENTRY ===== */}

      <div className="bg-white border rounded-2xl p-6 space-y-6">
        <h1 className="text-2xl font-bold">Steel Deliveries</h1>

        {/* PROGRESS */}
        <div>
          <div className="text-sm font-semibold mb-1">
            Delivery Progress {progress.toFixed(1)}%
          </div>
          <div className="w-full bg-gray-200 h-3 rounded">
            <div
              className="bg-green-600 h-3 rounded"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* SEARCH */}
        <div>
          <label className="text-sm font-semibold">
            Search Bundle Number
          </label>
          <input
            className="border p-3 rounded w-full"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type bundle number..."
          />
        </div>

        {/* BUNDLE TABLE */}
        <div className="border rounded-xl">
          {filteredBundles.map((b) => {
            const delivered =
              deliveredTotals[b.bundle_no] || 0;
            const remaining =
              Number(b.qty_required) - delivered;

            return (
              <div
                key={b.bundle_no}
                className="grid grid-cols-5 gap-4 p-4 border-b items-center"
              >
                <div>
                  <div className="text-xs text-gray-500">
                    Bundle
                  </div>
                  <div className="font-bold">
                    {b.bundle_no}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">
                    Segment
                  </div>
                  <div className="font-semibold">
                    {b.section || "-"}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">
                    Required
                  </div>
                  <div className="font-bold">
                    {b.qty_required}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">
                    Remaining
                  </div>
                  <div className="font-bold text-orange-600">
                    {remaining}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold">
                    Deliver Qty
                  </label>
                  <input
                    type="number"
                    className="border p-2 rounded w-full"
                    value={qtyMap[b.bundle_no] || ""}
                    onChange={(e) =>
                      setQtyMap((prev) => ({
                        ...prev,
                        [b.bundle_no]: Number(
                          e.target.value
                        ),
                      }))
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* DELIVERY DETAILS */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold">
              Delivered By
            </label>
            <input
              className="border p-3 rounded w-full"
              value={deliveredBy}
              onChange={(e) =>
                setDeliveredBy(e.target.value)
              }
            />
          </div>

          <div>
            <label className="text-sm font-semibold">
              Vehicle
            </label>
            <input
              className="border p-3 rounded w-full"
              value={vehicle}
              onChange={(e) =>
                setVehicle(e.target.value)
              }
            />
          </div>
        </div>

        <button
          onClick={saveDelivery}
          className="bg-green-600 text-white px-6 py-3 rounded-xl font-semibold"
        >
          Save Delivery
        </button>
      </div>

      {/* ===== REGISTER ===== */}

      <div className="bg-white border rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-bold">
          Delivery Register
        </h2>

        {deliveries.map((d) => {
          const isEditing = editingId === d.id;

          return (
            <div
              key={d.id}
              className="border rounded-2xl p-5 space-y-4"
            >
              <div className="flex justify-between">
                <div className="space-y-1">
                  <div>
                    <div className="text-xs text-gray-500">
                      Delivered By
                    </div>
                    <div className="font-bold">
                      {d.delivered_by || "-"}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">
                      Vehicle
                    </div>
                    <div className="font-semibold">
                      {d.vehicle || "-"}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">
                      Date
                    </div>
                    <div className="font-semibold">
                      {new Date(
                        d.created_at
                      ).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  {!isEditing && (
                    <button
                      onClick={() => startEdit(d)}
                      className="text-blue-600 font-semibold"
                    >
                      Edit
                    </button>
                  )}

                  {isEditing && (
                    <>
                      <button
                        onClick={saveEdit}
                        className="text-green-600 font-semibold"
                      >
                        Save
                      </button>

                      <button
                        onClick={cancelEdit}
                        className="text-gray-500 font-semibold"
                      >
                        Cancel
                      </button>
                    </>
                  )}

                  <button
                    onClick={() =>
                      deleteDelivery(d.id)
                    }
                    className="text-red-600 font-semibold"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="border rounded-xl overflow-hidden">
                <div className="grid grid-cols-2 bg-gray-100 p-3 font-semibold text-sm">
                  <div>Bundle Number</div>
                  <div>Qty Delivered</div>
                </div>

                {d.tower_bundle_delivery_items.map(
                  (i) => (
                    <div
                      key={i.bundle_no}
                      className="grid grid-cols-2 p-3 border-t items-center"
                    >
                      <div className="font-medium">
                        {i.bundle_no}
                      </div>

                      {!isEditing ? (
                        <div className="font-bold">
                          {i.qty_delivered}
                        </div>
                      ) : (
                        <input
                          type="number"
                          className="border p-2 rounded w-24"
                          value={
                            editQtyMap[
                              i.bundle_no
                            ] || ""
                          }
                          onChange={(e) =>
                            setEditQtyMap(
                              (prev) => ({
                                ...prev,
                                [i.bundle_no]:
                                  Number(
                                    e.target.value
                                  ),
                              })
                            )
                          }
                        />
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}