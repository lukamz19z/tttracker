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
  created_at: string;
  isNew?: boolean;
};

type DeliveryItem = {
  id: string;
  delivery_id: string;
  bundle_no: string;
  qty_delivered: number | null;
  created_at: string;
};

type Delivery = {
  id: string;
  tower_id: string;
  delivered_by: string | null;
  vehicle: string | null;
  delivery_date: string | null;
  comments: string | null;
  created_at: string;
  tower_bundle_delivery_items: DeliveryItem[];
};

export default function DeliveriesPage() {
  const { projectId, towerId } = useParams<{
    projectId: string;
    towerId: string;
  }>();

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<any>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);

  const [bundles, setBundles] = useState<RequiredBundle[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRegister, setSavingRegister] = useState(false);
  const [savingDelivery, setSavingDelivery] = useState(false);

  const [deliveredBy, setDeliveredBy] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [date, setDate] = useState("");
  const [comments, setComments] = useState("");

  const [enteredQty, setEnteredQty] = useState<Record<string, string>>({});

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [towerId]);

  async function load() {
    setLoading(true);

    const [towerRes, docketRes, reqRes, delRes] = await Promise.all([
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
        .select(
          `
          *,
          tower_bundle_delivery_items (*)
        `
        )
        .eq("tower_id", towerId)
        .order("delivery_date", { ascending: false }),
    ]);

    if (towerRes.error) console.error(towerRes.error);
    if (docketRes.error) console.error(docketRes.error);
    if (reqRes.error) console.error(reqRes.error);
    if (delRes.error) console.error(delRes.error);

    setTower(towerRes.data || null);
    setLatestDate(docketRes.data?.[0]?.docket_date || null);
    setBundles((reqRes.data || []) as RequiredBundle[]);
    setDeliveries((delRes.data || []) as Delivery[]);
    setLoading(false);
  }

  function addRegisterRow() {
    setBundles((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}-${Math.random()}`,
        tower_id: towerId,
        bundle_no: "",
        section: "",
        qty_required: null,
        bundle_mass: null,
        total_weight: null,
        created_at: new Date().toISOString(),
        isNew: true,
      },
    ]);
  }

  function updateRegisterRow(index: number, field: keyof RequiredBundle, value: string) {
    setBundles((prev) => {
      const copy = [...prev];
      const row = { ...copy[index] };

      if (field === "qty_required" || field === "bundle_mass" || field === "total_weight") {
        (row as any)[field] = value === "" ? null : Number(value);
      } else {
        (row as any)[field] = value;
      }

      copy[index] = row;
      return copy;
    });
  }

  async function deleteRegisterRow(row: RequiredBundle) {
    if (row.isNew) {
      setBundles((prev) => prev.filter((r) => r.id !== row.id));
      return;
    }

    const ok = window.confirm(`Delete bundle ${row.bundle_no}?`);
    if (!ok) return;

    const { error } = await supabase
      .from("tower_required_bundles")
      .delete()
      .eq("id", row.id);

    if (error) {
      console.error(error);
      alert("Failed to delete bundle row.");
      return;
    }

    await load();
  }

  async function saveRegister() {
    const validNewRows = bundles.filter(
      (r) => r.isNew && String(r.bundle_no || "").trim()
    );

    if (!validNewRows.length) {
      alert("No new bundle rows to save.");
      return;
    }

    try {
      setSavingRegister(true);

      const payload = validNewRows.map((r) => ({
        tower_id: towerId,
        bundle_no: String(r.bundle_no || "").trim(),
        section: r.section ? String(r.section).trim() : null,
        qty_required: r.qty_required ?? null,
        bundle_mass: r.bundle_mass ?? null,
        total_weight: r.total_weight ?? null,
      }));

      const { error } = await supabase
        .from("tower_required_bundles")
        .insert(payload);

      if (error) {
        console.error(error);
        alert("Failed to save register.");
        return;
      }

      await load();
      alert("Bundle register saved.");
    } finally {
      setSavingRegister(false);
    }
  }

  function mapCsvRow(raw: any) {
    const normalized: Record<string, any> = {};
    Object.keys(raw).forEach((k) => {
      normalized[k.toLowerCase().trim()] = raw[k];
    });

    function pick(...names: string[]) {
      for (const name of names) {
        const exact = normalized[name];
        if (exact !== undefined) return exact;

        const containsKey = Object.keys(normalized).find((k) => k.includes(name));
        if (containsKey) return normalized[containsKey];
      }
      return null;
    }

    const bundleNo =
      pick("bundle no", "bundle_no", "bundle reference", "bundle", "mark") ?? null;

    if (!bundleNo || !String(bundleNo).trim()) return null;

    const qtyRequired = pick("qty/tower", "qty_required", "quantity", "qty");
    const bundleMass = pick("bundle mass", "unit mass", "mass");
    const totalWeight = pick("total weight", "total mass", "total");
    const section = pick("section", "group", "type");

    return {
      tower_id: towerId,
      bundle_no: String(bundleNo).trim(),
      section: section ? String(section).trim() : null,
      qty_required:
        qtyRequired === null || qtyRequired === "" ? null : Number(qtyRequired),
      bundle_mass:
        bundleMass === null || bundleMass === "" ? null : Number(bundleMass),
      total_weight:
        totalWeight === null || totalWeight === "" ? null : Number(totalWeight),
    };
  }

  function handleCsvImport(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const mapped = (results.data as any[])
            .map(mapCsvRow)
            .filter(Boolean) as any[];

          if (!mapped.length) {
            alert("No valid bundle rows found in CSV.");
            return;
          }

          const ok = window.confirm(
            `Import ${mapped.length} bundle rows into this tower register?`
          );
          if (!ok) return;

          const { error } = await supabase
            .from("tower_required_bundles")
            .insert(mapped);

          if (error) {
            console.error(error);
            alert("CSV import failed.");
            return;
          }

          await load();
          alert("CSV imported successfully.");
        } catch (err) {
          console.error(err);
          alert("CSV import failed.");
        }
      },
    });
  }

  function getRequiredQty(bundle: RequiredBundle) {
    return Number(bundle.qty_required ?? 1);
  }

  function getDeliveredQty(bundleNo: string) {
    let total = 0;

    deliveries.forEach((d) => {
      (d.tower_bundle_delivery_items || []).forEach((i) => {
        if (i.bundle_no === bundleNo) {
          total += Number(i.qty_delivered || 0);
        }
      });
    });

    return total;
  }

  async function saveDelivery() {
    if (!bundles.length) {
      alert("Create or import a bundle register first.");
      return;
    }

    if (!date) {
      alert("Enter delivery date/time.");
      return;
    }

    const itemsToSave = bundles
      .map((b) => ({
        bundle_no: b.bundle_no,
        qty_delivered: Number(enteredQty[b.bundle_no] || 0),
      }))
      .filter((x) => x.qty_delivered > 0);

    if (!itemsToSave.length) {
      alert("Enter at least one delivered quantity.");
      return;
    }

    try {
      setSavingDelivery(true);

      const { data, error } = await supabase
        .from("tower_bundle_deliveries")
        .insert({
          tower_id: towerId,
          delivered_by: deliveredBy || null,
          vehicle: vehicle || null,
          delivery_date: date,
          comments: comments || null,
        })
        .select()
        .single();

      if (error || !data) {
        console.error(error);
        alert("Failed to save delivery header.");
        return;
      }

      const payload = itemsToSave.map((x) => ({
        delivery_id: data.id,
        bundle_no: x.bundle_no,
        qty_delivered: x.qty_delivered,
      }));

      const { error: itemError } = await supabase
        .from("tower_bundle_delivery_items")
        .insert(payload);

      if (itemError) {
        console.error(itemError);
        alert("Failed to save delivery items.");
        return;
      }

      setEnteredQty({});
      setComments("");
      await load();
      alert("Delivery saved.");
    } finally {
      setSavingDelivery(false);
    }
  }

  const progress = useMemo(() => {
    let req = 0;
    let del = 0;

    bundles.forEach((b) => {
      req += getRequiredQty(b);
      del += getDeliveredQty(b.bundle_no);
    });

    return req > 0 ? ((del / req) * 100).toFixed(1) : "0.0";
  }, [bundles, deliveries]);

  const totalRequiredMass = useMemo(() => {
    return bundles.reduce((sum, b) => sum + Number(b.total_weight || 0), 0);
  }, [bundles]);

  const totalDeliveredMass = useMemo(() => {
    let mass = 0;

    bundles.forEach((b) => {
      const delivered = getDeliveredQty(b.bundle_no);
      const req = getRequiredQty(b);
      const totalWeight = Number(b.total_weight || 0);

      if (req > 0 && totalWeight > 0) {
        mass += (delivered / req) * totalWeight;
      }
    });

    return mass;
  }, [bundles, deliveries]);

  if (loading) {
    return <div className="p-8">Loading deliveries...</div>;
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      {tower && (
        <TowerHeader
          projectId={projectId}
          tower={tower}
          latestDate={latestDate}
        />
      )}

      <div className="bg-white border rounded-2xl p-6 space-y-6">
        <div className="flex justify-between items-start gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Steel Deliveries</h1>
            <p className="text-slate-500 mt-1">
              Create the bundle register manually or by CSV, then record site deliveries.
            </p>
          </div>

          <div className="flex gap-3 flex-wrap">
            <StatCard label="Bundles" value={String(bundles.length)} />
            <StatCard label="Progress" value={`${progress}%`} />
            <StatCard
              label="Mass Delivered"
              value={`${(totalDeliveredMass / 1000).toFixed(2)} t`}
            />
            <StatCard
              label="Mass Required"
              value={`${(totalRequiredMass / 1000).toFixed(2)} t`}
            />
          </div>
        </div>

        <div className="border rounded-2xl p-4 bg-slate-50 space-y-4">
          <div className="flex justify-between items-center gap-4 flex-wrap">
            <div>
              <div className="text-lg font-semibold">Bundle Register</div>
              <div className="text-sm text-slate-500">
                Import a CSV or add bundle rows manually.
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <label className="bg-white border px-4 py-2 rounded cursor-pointer">
                Import CSV
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleCsvImport(file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>

              <button
                onClick={addRegisterRow}
                className="bg-slate-200 px-4 py-2 rounded"
              >
                Add Row
              </button>

              <button
                onClick={saveRegister}
                disabled={savingRegister}
                className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
              >
                {savingRegister ? "Saving..." : "Save Register"}
              </button>
            </div>
          </div>

          {bundles.length === 0 ? (
            <div className="border rounded-xl p-6 bg-white text-center text-slate-500">
              No bundle register yet. Use <strong>Import CSV</strong> or <strong>Add Row</strong>.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[950px]">
                <div className="grid grid-cols-7 gap-2 px-2 py-2 text-xs font-semibold text-slate-500">
                  <div>Bundle No</div>
                  <div>Section</div>
                  <div>Qty Required</div>
                  <div>Bundle Mass (kg)</div>
                  <div>Total Weight (kg)</div>
                  <div>Delivered</div>
                  <div>Action</div>
                </div>

                {bundles.map((r, i) => (
                  <div
                    key={r.id}
                    className="grid grid-cols-7 gap-2 p-2 border-t items-center"
                  >
                    <input
                      value={r.bundle_no || ""}
                      disabled={!r.isNew}
                      onChange={(e) => updateRegisterRow(i, "bundle_no", e.target.value)}
                      className={`border p-2 rounded ${
                        r.isNew ? "bg-white" : "bg-slate-100"
                      }`}
                      placeholder="Bundle No"
                    />

                    <input
                      value={r.section || ""}
                      disabled={!r.isNew}
                      onChange={(e) => updateRegisterRow(i, "section", e.target.value)}
                      className={`border p-2 rounded ${
                        r.isNew ? "bg-white" : "bg-slate-100"
                      }`}
                      placeholder="Section"
                    />

                    <input
                      value={r.qty_required ?? ""}
                      disabled={!r.isNew}
                      onChange={(e) =>
                        updateRegisterRow(i, "qty_required", e.target.value)
                      }
                      className={`border p-2 rounded ${
                        r.isNew ? "bg-white" : "bg-slate-100"
                      }`}
                      placeholder="Qty"
                    />

                    <input
                      value={r.bundle_mass ?? ""}
                      disabled={!r.isNew}
                      onChange={(e) =>
                        updateRegisterRow(i, "bundle_mass", e.target.value)
                      }
                      className={`border p-2 rounded ${
                        r.isNew ? "bg-white" : "bg-slate-100"
                      }`}
                      placeholder="Mass"
                    />

                    <input
                      value={r.total_weight ?? ""}
                      disabled={!r.isNew}
                      onChange={(e) =>
                        updateRegisterRow(i, "total_weight", e.target.value)
                      }
                      className={`border p-2 rounded ${
                        r.isNew ? "bg-white" : "bg-slate-100"
                      }`}
                      placeholder="Total"
                    />

                    <div className="text-sm px-2">
                      {getDeliveredQty(r.bundle_no)}
                    </div>

                    <button
                      onClick={() => deleteRegisterRow(r)}
                      className="text-red-600 text-sm text-left"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border rounded-2xl p-4 space-y-4">
          <div>
            <div className="text-lg font-semibold">Record Delivery</div>
            <div className="text-sm text-slate-500">
              Enter header details, then put delivered quantities against the bundle rows.
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-3">
            <input
              placeholder="Delivered By"
              value={deliveredBy}
              onChange={(e) => setDeliveredBy(e.target.value)}
              className="border p-2 rounded"
            />
            <input
              placeholder="Vehicle / Rego"
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
              className="border p-2 rounded"
            />
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border p-2 rounded"
            />
            <input
              placeholder="Comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="border p-2 rounded"
            />
          </div>

          {bundles.length === 0 ? (
            <div className="bg-yellow-100 border rounded-xl p-4 text-sm">
              No bundle register exists yet. Create the register above first.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
                <div className="grid grid-cols-7 gap-2 px-2 py-2 text-xs font-semibold text-slate-500">
                  <div>Bundle No</div>
                  <div>Section</div>
                  <div>Required</div>
                  <div>Delivered</div>
                  <div>Remaining</div>
                  <div>Deliver Now</div>
                  <div>Total Weight (kg)</div>
                </div>

                {bundles.map((b) => {
                  const required = getRequiredQty(b);
                  const delivered = getDeliveredQty(b.bundle_no);
                  const remaining = required - delivered;

                  return (
                    <div
                      key={`delivery-${b.id}`}
                      className="grid grid-cols-7 gap-2 p-2 border-t items-center"
                    >
                      <div className="text-sm">{b.bundle_no}</div>
                      <div className="text-sm">{b.section || "-"}</div>
                      <div className="text-sm">{required}</div>
                      <div className="text-sm">{delivered}</div>
                      <div className="text-sm">{remaining}</div>
                      <input
                        placeholder="0"
                        value={enteredQty[b.bundle_no] || ""}
                        onChange={(e) =>
                          setEnteredQty((prev) => ({
                            ...prev,
                            [b.bundle_no]: e.target.value,
                          }))
                        }
                        className="border p-2 rounded"
                      />
                      <div className="text-sm">{b.total_weight ?? "-"}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={saveDelivery}
              disabled={savingDelivery || bundles.length === 0}
              className="bg-blue-600 text-white px-6 py-2 rounded disabled:opacity-50"
            >
              {savingDelivery ? "Saving..." : "Save Delivery"}
            </button>
          </div>
        </div>

        <div className="border rounded-2xl p-4 space-y-4">
          <div className="text-lg font-semibold">Delivery History</div>

          {deliveries.length === 0 ? (
            <div className="text-sm text-slate-500">No deliveries recorded yet.</div>
          ) : (
            <div className="space-y-3">
              {deliveries.map((d) => (
                <div key={d.id} className="border rounded-xl p-4">
                  <div className="flex justify-between gap-4 flex-wrap">
                    <div className="space-y-1">
                      <div className="font-semibold">
                        {d.delivered_by || "-"} • {d.vehicle || "-"}
                      </div>
                      <div className="text-sm text-slate-500">
                        {d.delivery_date
                          ? new Date(d.delivery_date).toLocaleString()
                          : "-"}
                      </div>
                      <div className="text-sm text-slate-600">
                        {d.comments || ""}
                      </div>
                    </div>

                    <div className="text-sm text-slate-500">
                      Items: {(d.tower_bundle_delivery_items || []).length}
                    </div>
                  </div>

                  <div className="mt-3 overflow-x-auto">
                    <div className="min-w-[500px]">
                      <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-500 pb-2">
                        <div>Bundle</div>
                        <div>Qty Delivered</div>
                      </div>

                      {(d.tower_bundle_delivery_items || []).map((item) => (
                        <div
                          key={item.id}
                          className="grid grid-cols-2 gap-2 py-1 border-t text-sm"
                        >
                          <div>{item.bundle_no}</div>
                          <div>{item.qty_delivered ?? 0}</div>
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
    <div className="bg-slate-100 rounded-xl px-4 py-3 min-w-[120px]">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}