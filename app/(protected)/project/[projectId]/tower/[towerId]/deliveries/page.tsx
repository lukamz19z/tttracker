"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
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
  const [latestDate, setLatestDate] = useState<string | null>(null);

  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);

  const [deliveredBy, setDeliveredBy] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [date, setDate] = useState("");
  const [comments, setComments] = useState("");

  const [enteredQty, setEnteredQty] = useState<Record<string, string>>({});
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingQty, setEditingQty] = useState("");

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
        .select("*, tower_bundle_delivery_items(*)")
        .eq("tower_id", towerId)
        .order("delivery_date", { ascending: false }),
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

  async function saveDelivery() {
    if (!bundles.length) {
      alert("Create the materials register first.");
      return;
    }

    const items = bundles
      .map((b) => ({
        bundle_no: b.bundle_no,
        qty: Number(enteredQty[b.bundle_no] || 0),
      }))
      .filter((i) => i.qty > 0);

    if (!items.length) {
      alert("Enter at least one delivered quantity.");
      return;
    }

    const { data, error } = await supabase
      .from("tower_bundle_deliveries")
      .insert({
        tower_id: towerId,
        delivered_by: deliveredBy || null,
        vehicle: vehicle || null,
        delivery_date: date || null,
        comments: comments || null,
      })
      .select()
      .single();

    if (error || !data) {
      console.error(error);
      alert("Failed to save delivery.");
      return;
    }

    const { error: itemError } = await supabase
      .from("tower_bundle_delivery_items")
      .insert(
        items.map((i) => ({
          delivery_id: data.id,
          bundle_no: i.bundle_no,
          qty_delivered: i.qty,
        }))
      );

    if (itemError) {
      console.error(itemError);
      alert("Failed to save delivery items.");
      return;
    }

    setEnteredQty({});
    setDeliveredBy("");
    setVehicle("");
    setDate("");
    setComments("");

    await load();
    alert("Delivery saved.");
  }

  async function deleteDelivery(id: string) {
    const ok = window.confirm("Delete this delivery?");
    if (!ok) return;

    const { error } = await supabase
      .from("tower_bundle_deliveries")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(error);
      alert("Failed to delete delivery.");
      return;
    }

    await load();
  }

  async function deleteItem(id: string) {
    const ok = window.confirm("Delete this delivery item?");
    if (!ok) return;

    const { error } = await supabase
      .from("tower_bundle_delivery_items")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(error);
      alert("Failed to delete delivery item.");
      return;
    }

    await load();
  }

  function startEditItem(item: DeliveryItem) {
    setEditingItemId(item.id);
    setEditingQty(String(item.qty_delivered));
  }

  function cancelEditItem() {
    setEditingItemId(null);
    setEditingQty("");
  }

  async function saveEditItem(itemId: string) {
    const qty = Number(editingQty);
    if (Number.isNaN(qty) || qty < 0) {
      alert("Enter a valid quantity.");
      return;
    }

    const { error } = await supabase
      .from("tower_bundle_delivery_items")
      .update({ qty_delivered: qty })
      .eq("id", itemId);

    if (error) {
      console.error(error);
      alert("Failed to update item.");
      return;
    }

    cancelEditItem();
    await load();
  }

  const totalRequired = useMemo(() => {
    return bundles.reduce((sum, b) => sum + Number(b.qty_required || 0), 0);
  }, [bundles]);

  const totalDelivered = useMemo(() => {
    return bundles.reduce((sum, b) => sum + deliveredQty(b.bundle_no), 0);
  }, [bundles, deliveries]);

  const totalRemaining = Math.max(totalRequired - totalDelivered, 0);
  const progress = totalRequired > 0 ? ((totalDelivered / totalRequired) * 100).toFixed(1) : "0.0";

  if (loading) {
    return <div className="p-8">Loading deliveries...</div>;
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      {tower && (
        <TowerHeader projectId={projectId} tower={tower} latestDate={latestDate} />
      )}

      <div className="bg-white border rounded-2xl p-6 space-y-6">
        <div className="flex justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Deliveries</h1>
            <p className="text-slate-500 mt-1">
              Record truck deliveries against the tower materials register.
            </p>
          </div>

          <div className="flex gap-3 flex-wrap">
            <StatCard label="Required Qty" value={String(totalRequired)} />
            <StatCard label="Delivered Qty" value={String(totalDelivered)} />
            <StatCard label="Remaining Qty" value={String(totalRemaining)} />
            <StatCard label="Progress" value={`${progress}%`} />
          </div>
        </div>

        <div className="border rounded-2xl p-4 space-y-4">
          <div>
            <div className="text-lg font-semibold">New Delivery</div>
            <div className="text-sm text-slate-500">
              Enter truck details and quantities delivered for each bundle.
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs mb-1 text-slate-600">Delivered By</label>
              <input
                value={deliveredBy}
                onChange={(e) => setDeliveredBy(e.target.value)}
                className="border p-2 rounded w-full"
                placeholder="Delivered By"
              />
            </div>

            <div>
              <label className="block text-xs mb-1 text-slate-600">Vehicle / Rego</label>
              <input
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
                className="border p-2 rounded w-full"
                placeholder="Vehicle / Rego"
              />
            </div>

            <div>
              <label className="block text-xs mb-1 text-slate-600">Delivery Date & Time</label>
              <input
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="border p-2 rounded w-full"
              />
            </div>

            <div>
              <label className="block text-xs mb-1 text-slate-600">Comments</label>
              <input
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                className="border p-2 rounded w-full"
                placeholder="Comments"
              />
            </div>
          </div>

          {bundles.length === 0 ? (
            <div className="bg-yellow-100 border rounded-xl p-4 text-sm">
              No materials register exists yet. Add the steel schedule in the Materials tab first.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[950px]">
                <div className="grid grid-cols-6 gap-2 px-2 py-2 text-xs font-semibold text-slate-500 bg-slate-50 rounded-t-xl border">
                  <div>Bundle No</div>
                  <div>Section</div>
                  <div>Required</div>
                  <div>Delivered</div>
                  <div>Remaining</div>
                  <div>Deliver Now</div>
                </div>

                {bundles.map((b) => (
                  <div
                    key={b.bundle_no}
                    className="grid grid-cols-6 gap-2 p-2 border-x border-b items-center"
                  >
                    <div>{b.bundle_no}</div>
                    <div>{b.section || "-"}</div>
                    <div>{b.qty_required}</div>
                    <div>{deliveredQty(b.bundle_no)}</div>
                    <div>{remainingQty(b)}</div>

                    <input
                      className="border p-2 rounded"
                      placeholder="0"
                      value={enteredQty[b.bundle_no] || ""}
                      onChange={(e) => {
                        const val = Number(e.target.value || 0);
                        if (val > remainingQty(b)) {
                          alert(`Only ${remainingQty(b)} remaining`);
                          return;
                        }

                        setEnteredQty((prev) => ({
                          ...prev,
                          [b.bundle_no]: e.target.value,
                        }));
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={saveDelivery}
              className="bg-green-600 text-white px-6 py-2 rounded"
            >
              Save Delivery
            </button>
          </div>
        </div>

        <div className="border rounded-2xl p-4 space-y-4">
          <div>
            <div className="text-lg font-semibold">Delivery History</div>
            <div className="text-sm text-slate-500">
              Review, edit, and delete previous deliveries.
            </div>
          </div>

          {deliveries.length === 0 ? (
            <div className="text-sm text-slate-500">No deliveries recorded yet.</div>
          ) : (
            <div className="space-y-3">
              {deliveries.map((d) => (
                <div key={d.id} className="border rounded-xl p-4 space-y-3">
                  <div className="flex justify-between gap-4 flex-wrap">
                    <div>
                      <div className="font-semibold">
                        {d.delivered_by || "-"} • {d.vehicle || "-"}
                      </div>
                      <div className="text-sm text-slate-500">
                        {d.delivery_date
                          ? new Date(d.delivery_date).toLocaleString()
                          : "-"}
                      </div>
                      {d.comments && (
                        <div className="text-sm text-slate-600 mt-1">
                          {d.comments}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => deleteDelivery(d.id)}
                      className="text-red-600 text-sm"
                    >
                      Delete Delivery
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <div className="min-w-[650px]">
                      <div className="grid grid-cols-4 gap-2 text-xs font-semibold text-slate-500 pb-2 border-b">
                        <div>Bundle</div>
                        <div>Qty Delivered</div>
                        <div>Edit</div>
                        <div>Delete</div>
                      </div>

                      {d.tower_bundle_delivery_items.map((item) => (
                        <div
                          key={item.id}
                          className="grid grid-cols-4 gap-2 py-2 border-b items-center text-sm"
                        >
                          <div>{item.bundle_no}</div>

                          <div>
                            {editingItemId === item.id ? (
                              <input
                                value={editingQty}
                                onChange={(e) => setEditingQty(e.target.value)}
                                className="border p-2 rounded w-full"
                              />
                            ) : (
                              item.qty_delivered
                            )}
                          </div>

                          <div>
                            {editingItemId === item.id ? (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => saveEditItem(item.id)}
                                  className="text-blue-600"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={cancelEditItem}
                                  className="text-slate-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startEditItem(item)}
                                className="text-blue-600"
                              >
                                Edit
                              </button>
                            )}
                          </div>

                          <div>
                            <button
                              onClick={() => deleteItem(item.id)}
                              className="text-red-600"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
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