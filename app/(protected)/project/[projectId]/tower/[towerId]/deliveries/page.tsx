"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

export default function DeliveriesPage() {
  const { towerId } = useParams();
  const supabase = createSupabaseBrowser();

  const [bundles, setBundles] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [deliveredBy, setDeliveredBy] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [date, setDate] = useState("");

  const [enteredQty, setEnteredQty] = useState<any>({});

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const req = await supabase
      .from("tower_required_bundles")
      .select("*")
      .eq("tower_id", towerId);

    const del = await supabase
      .from("tower_bundle_deliveries")
      .select(
        `
        *,
        tower_bundle_delivery_items(*)
      `
      )
      .eq("tower_id", towerId);

    setBundles(req.data || []);
    setDeliveries(del.data || []);
    setLoading(false);
  }

  function getDeliveredQty(bundleNo: string) {
    let total = 0;
    deliveries.forEach((d) =>
      d.tower_bundle_delivery_items.forEach((i: any) => {
        if (i.bundle_no === bundleNo)
          total += Number(i.qty_delivered || 0);
      })
    );
    return total;
  }

  async function saveDelivery() {
    const { data } = await supabase
      .from("tower_bundle_deliveries")
      .insert({
        tower_id: towerId,
        delivered_by: deliveredBy,
        vehicle,
        delivery_date: date,
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

  const progress = useMemo(() => {
    let req = 0;
    let del = 0;

    bundles.forEach((b) => {
      req += Number(b.qty_required || 1);
      del += getDeliveredQty(b.bundle_no);
    });

    return ((del / req) * 100 || 0).toFixed(1);
  }, [bundles, deliveries]);

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Steel Deliveries</h1>

      <div className="text-lg">Delivery Progress: {progress}%</div>

      <div className="grid grid-cols-3 gap-3">
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
      </div>

      <div className="border rounded">
        {bundles.map((b) => {
          const delivered = getDeliveredQty(b.bundle_no);
          const remaining =
            Number(b.qty_required || 1) - delivered;

          return (
            <div
              key={b.id}
              className="grid grid-cols-6 gap-3 border-b p-2"
            >
              <div>{b.bundle_no}</div>
              <div>Req: {b.qty_required || 1}</div>
              <div>Del: {delivered}</div>
              <div>Rem: {remaining}</div>

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
          );
        })}
      </div>

      <button
        onClick={saveDelivery}
        className="bg-blue-600 text-white px-6 py-2 rounded"
      >
        Save Delivery
      </button>
    </div>
  );
}