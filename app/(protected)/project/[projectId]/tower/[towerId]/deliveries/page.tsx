"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type Bundle = {
  bundle_no: string;
  section: string;
  qty_required: number;
};

type DeliveryItem = {
  bundle_no: string;
  qty_delivered: number;
};

type Delivery = {
  id: string;
  driver: string;
  vehicle: string;
  created_at: string;
  tower_bundle_delivery_items: DeliveryItem[];
};

export default function DeliveriesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<any>(null);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [search, setSearch] = useState("");

  const [driver, setDriver] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});

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
      .select("*, tower_bundle_delivery_items(*)")
      .eq("tower_id", towerId)
      .order("created_at", { ascending: false });

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

  function remaining(bundle: Bundle) {
    return Math.max(bundle.qty_required - deliveredQty(bundle.bundle_no), 0);
  }

  async function saveDelivery() {
    const items = Object.entries(qtyMap)
      .filter(([_, qty]) => qty > 0)
      .map(([bundle_no, qty]) => ({
        bundle_no,
        qty_delivered: qty,
      }));

    if (!items.length) {
      alert("Enter at least one bundle quantity");
      return;
    }

    const { data: delivery } = await supabase
      .from("tower_bundle_deliveries")
      .insert({
        tower_id: towerId,
        driver,
        vehicle,
      })
      .select()
      .single();

    const payload = items.map((i) => ({
      delivery_id: delivery.id,
      bundle_no: i.bundle_no,
      qty_delivered: i.qty_delivered,
    }));

    await supabase.from("tower_bundle_delivery_items").insert(payload);

    alert("Delivery saved");

    setDriver("");
    setVehicle("");
    setQtyMap({});

    load();
  }

  async function deleteDelivery(id: string) {
    if (!confirm("Delete this delivery?")) return;

    await supabase
      .from("tower_bundle_delivery_items")
      .delete()
      .eq("delivery_id", id);

    await supabase
      .from("tower_bundle_deliveries")
      .delete()
      .eq("id", id);

    load();
  }

  const filtered = useMemo(() => {
    return bundles.filter(
      (b) =>
        b.bundle_no.toLowerCase().includes(search.toLowerCase()) ||
        b.section.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, bundles]);

  return (
    <div className="p-8 space-y-6">
      {tower && <TowerHeader projectId={projectId} tower={tower} />}

      <div className="bg-white border rounded-2xl p-6 space-y-6">
        <h1 className="text-2xl font-bold">Truck Delivery Entry</h1>

        <input
          className="border p-3 rounded w-full"
          placeholder="Search bundle or segment..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="grid md:grid-cols-2 gap-4">
          <input
            className="border p-3 rounded"
            placeholder="Driver Name"
            value={driver}
            onChange={(e) => setDriver(e.target.value)}
          />

          <input
            className="border p-3 rounded"
            placeholder="Truck Registration"
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
          />
        </div>

        <div className="space-y-3 max-h-[400px] overflow-auto">
          {filtered.map((b) => {
            const rem = remaining(b);

            return (
              <div key={b.bundle_no} className="border rounded-xl p-4 grid md:grid-cols-5 gap-3 items-center">
                <div>
                  <div className="font-semibold">{b.bundle_no}</div>
                  <div className="text-xs text-slate-500">{b.section}</div>
                </div>

                <div>
                  Required
                  <div className="font-bold">{b.qty_required}</div>
                </div>

                <div>
                  Remaining
                  <div className="font-bold">{rem}</div>
                </div>

                <input
                  className="border p-2 rounded"
                  type="number"
                  placeholder="Delivered"
                  value={qtyMap[b.bundle_no] || ""}
                  onChange={(e) =>
                    setQtyMap({
                      ...qtyMap,
                      [b.bundle_no]: Math.min(
                        Number(e.target.value),
                        rem
                      ),
                    })
                  }
                />

                {qtyMap[b.bundle_no] > rem && (
                  <div className="text-red-600 text-xs">
                    Over delivery
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={saveDelivery}
          className="bg-green-600 text-white px-6 py-3 rounded text-lg"
        >
          Save Delivery
        </button>
      </div>

      <div className="bg-white border rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-bold">Delivery Register</h2>

        {deliveries.map((d) => (
          <div key={d.id} className="border rounded-xl p-4">
            <div className="flex justify-between">
              <div>
                <div className="font-semibold">{d.driver}</div>
                <div className="text-xs text-slate-500">{d.vehicle}</div>
              </div>

              <button
                onClick={() => deleteDelivery(d.id)}
                className="text-red-600"
              >
                Delete
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
              {d.tower_bundle_delivery_items.map((i) => (
                <div key={i.bundle_no} className="bg-slate-100 rounded p-2">
                  {i.bundle_no} — {i.qty_delivered}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}