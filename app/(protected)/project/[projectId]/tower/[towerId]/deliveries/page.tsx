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
  created_at?: string;
  isNew?: boolean;
};

type DeliveryItem = {
  id: string;
  delivery_id: string;
  bundle_no: string;
  qty_delivered: number | null;
  created_at?: string;
};

type Delivery = {
  id: string;
  tower_id: string;
  delivered_by: string | null;
  vehicle: string | null;
  delivery_date: string | null;
  comments: string | null;
  created_at?: string;
  tower_bundle_delivery_items: DeliveryItem[];
};

export default function DeliveriesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<any>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);

  const [bundles, setBundles] = useState<RequiredBundle[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [registerCollapsed, setRegisterCollapsed] = useState(false);

  const [loading, setLoading] = useState(true);
  const [savingRegister, setSavingRegister] = useState(false);
  const [savingDelivery, setSavingDelivery] = useState(false);

  const [deliveredBy, setDeliveredBy] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [date, setDate] = useState("");
  const [comments, setComments] = useState("");

  const [enteredQty, setEnteredQty] = useState<Record<string, string>>({});

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemQty, setEditingItemQty] = useState("");

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

    if (towerRes.error) console.error("tower load error", towerRes.error);
    if (docketRes.error) console.error("docket load error", docketRes.error);
    if (reqRes.error) console.error("bundle load error", reqRes.error);
    if (delRes.error) console.error("delivery load error", delRes.error);

    setTower(towerRes.data || null);
    setLatestDate(docketRes.data?.[0]?.docket_date || null);
    setBundles((reqRes.data || []) as RequiredBundle[]);
    setDeliveries((delRes.data || []) as Delivery[]);
    setLoading(false);
  }

  function addBundleRow() {
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
        isNew: true,
      },
    ]);
  }

  function updateBundleRow(index: number, field: keyof RequiredBundle, value: string) {
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

  async function saveRegister() {
    const newRows = bundles.filter(
      (b) => b.isNew && String(b.bundle_no || "").trim()
    );

    if (!newRows.length) {
      alert("No new rows to save.");
      return;
    }

    try {
      setSavingRegister(true);

      const payload = newRows.map((b) => ({
        tower_id: towerId,
        bundle_no: String(b.bundle_no || "").trim(),
        section: b.section ? String(b.section).trim() : null,
        qty_required: b.qty_required ?? null,
        bundle_mass: b.bundle_mass ?? null,
        total_weight: b.total_weight ?? null,
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
      alert("Register saved.");
    } finally {
      setSavingRegister(false);
    }
  }

  async function deleteBundle(row: RequiredBundle) {
    if (row.isNew) {
      setBundles((prev) => prev.filter((b) => b.id !== row.id));
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
      alert("Failed to delete bundle.");
      return;
    }

    await load();
  }

  function handleCSV(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = (results.data as any[])
            .map((r) => {
              const bundleNo =
                r.bundle_no ||
                r.bundle ||
                r["Bundle No"] ||
                r["Bundle Reference"];

              if (!bundleNo) return null;

              return {
                tower_id: towerId,
                bundle_no: String(bundleNo).trim(),
                qty_required:
                  Number(r.qty_required || r.quantity || r["Qty/Tower"]) || null,
                bundle_mass:
                  Number(r.bundle_mass || r["Bundle Mass"]) || null,
                total_weight:
                  Number(r.total_weight || r["Total Weight"]) || null,
                section: r.section || r["Section"] || null,
              };
            })
            .filter(Boolean);

          if (!rows.length) {
            alert("No valid bundle rows found in CSV.");
            return;
          }

          const { error } = await supabase
            .from("tower_required_bundles")
            .insert(rows);

          if (error) {
            console.error(error);
            alert("CSV import failed.");
            return;
          }

          await load();
          alert("CSV imported.");
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
      alert("Create or import the bundle register first.");
      return;
    }

    if (!date) {
      alert("Enter delivery date and time.");
      return;
    }

    const items = bundles
      .map((b) => ({
        bundle_no: b.bundle_no,
        qty_delivered: Number(enteredQty[b.bundle_no] || 0),
      }))
      .filter((x) => x.qty_delivered > 0);

    if (!items.length) {
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
        alert("Failed to save delivery.");
        return;
      }

      const payload = items.map((i) => ({
        delivery_id: data.id,
        bundle_no: i.bundle_no,
        qty_delivered: i.qty_delivered,
      }));

      const { error: itemError } = await supabase
        .from("tower_bundle_delivery_items")
        .insert(payload);

      if (itemError) {
        console.error(itemError);
        alert("Failed to save delivery items.");
        return;
      }

      setDeliveredBy("");
      setVehicle("");
      setDate("");
      setComments("");
      setEnteredQty({});

      await load();
      alert("Delivery saved.");
    } finally {
      setSavingDelivery(false);
    }
  }

  async function deleteDelivery(deliveryId: string) {
    const ok = window.confirm("Delete this delivery and all its items?");
    if (!ok) return;

    const { error } = await supabase
      .from("tower_bundle_deliveries")
      .delete()
      .eq("id", deliveryId);

    if (error) {
      console.error(error);
      alert("Failed to delete delivery.");
      return;
    }

    await load();
  }

  async function deleteDeliveryItem(itemId: string) {
    const ok = window.confirm("Delete this delivery item?");
    if (!ok) return;

    const { error } = await supabase
      .from("tower_bundle_delivery_items")
      .delete()
      .eq("id", itemId);

    if (error) {
      console.error(error);
      alert("Failed to delete item.");
      return;
    }

    await load();
  }

  function startEditItem(item: DeliveryItem) {
    setEditingItemId(item.id);
    setEditingItemQty(String(item.qty_delivered ?? ""));
  }

  function cancelEditItem() {
    setEditingItemId(null);
    setEditingItemQty("");
  }

  async function saveEditItem(itemId: string) {
    const qty = Number(editingItemQty);

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

  const groupedBundles = useMemo(() => {
    return bundles.reduce<Record<string, RequiredBundle[]>>((acc, b) => {
      const section = b.section?.trim() || "Other";
      if (!acc[section]) acc[section] = [];
      acc[section].push(b);
      return acc;
    }, {});
  }, [bundles]);

  const progress = useMemo(() => {
    let required = 0;
    let delivered = 0;

    bundles.forEach((b) => {
      required += getRequiredQty(b);
      delivered += getDeliveredQty(b.bundle_no);
    });

    return required > 0 ? ((delivered / required) * 100).toFixed(1) : "0.0";
  }, [bundles, deliveries]);

  const totalRequiredMass = useMemo(() => {
    return bundles.reduce((sum, b) => sum + Number(b.total_weight || 0), 0);
  }, [bundles]);

  const totalDeliveredMass = useMemo(() => {
    let mass = 0;

    bundles.forEach((b) => {
      const required = getRequiredQty(b);
      const delivered = getDeliveredQty(b.bundle_no);
      const totalWeight = Number(b.total_weight || 0);

      if (required > 0 && totalWeight > 0) {
        mass += (delivered / required) * totalWeight;
      }
    });

    return mass;
  }, [bundles, deliveries]);

  if (loading) {
    return <div className="p-8">Loading deliveries...</div>;
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      {tower ? (
        <TowerHeader
          projectId={projectId}
          tower={tower}
          latestDate={latestDate}
        />
      ) : (
        <div className="bg-white border rounded-2xl p-4 text-slate-500">
          Tower header unavailable.
        </div>
      )}

      <div className="bg-white border rounded-2xl p-6 space-y-6">
        <div className="flex justify-between items-start gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Steel Deliveries</h1>
            <p className="text-slate-500 mt-1">
              Manage the steel bundle register and record delivered quantities.
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

        <div className="border rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setRegisterCollapsed((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-4 bg-slate-50 border-b"
          >
            <div className="text-left">
              <div className="text-lg font-semibold">
                Bundle Register ({bundles.length})
              </div>
              <div className="text-sm text-slate-500">
                Import CSV or add rows manually.
              </div>
            </div>
            <div className="text-xl">{registerCollapsed ? "▾" : "▴"}</div>
          </button>

          {!registerCollapsed && (
            <div className="p-4 space-y-4">
              <div className="flex gap-2 flex-wrap">
                <label className="bg-white border px-4 py-2 rounded cursor-pointer">
                  Import CSV
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleCSV(file);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>

                <button
                  onClick={addBundleRow}
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

              {bundles.length === 0 ? (
                <div className="border rounded-xl p-6 text-center text-slate-500">
                  No bundle register yet. Import a CSV or add rows manually.
                </div>
              ) : (
                Object.entries(groupedBundles).map(([section, rows]) => (
                  <div key={section} className="space-y-2">
                    <div className="font-semibold text-slate-700">{section}</div>

                    <div className="overflow-x-auto">
                      <div className="min-w-[1050px]">
                        <div className="grid grid-cols-7 gap-2 px-2 py-2 text-xs font-semibold text-slate-500 bg-slate-50 rounded-t-xl border">
                          <div>Bundle No</div>
                          <div>Section</div>
                          <div>Qty Required</div>
                          <div>Bundle Mass (kg)</div>
                          <div>Total Weight (kg)</div>
                          <div>Delivered Qty</div>
                          <div>Action</div>
                        </div>

                        {rows.map((b) => {
                          const globalIndex = bundles.findIndex((x) => x.id === b.id);

                          return (
                            <div
                              key={b.id}
                              className="grid grid-cols-7 gap-2 p-2 border-x border-b items-center"
                            >
                              <div>
                                <label className="block text-[11px] text-slate-500 mb-1 md:hidden">
                                  Bundle No
                                </label>
                                <input
                                  value={b.bundle_no || ""}
                                  disabled={!b.isNew}
                                  onChange={(e) =>
                                    updateBundleRow(globalIndex, "bundle_no", e.target.value)
                                  }
                                  className={`border p-2 rounded w-full ${
                                    b.isNew ? "bg-white" : "bg-slate-100"
                                  }`}
                                  placeholder="Bundle No"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] text-slate-500 mb-1 md:hidden">
                                  Section
                                </label>
                                <input
                                  value={b.section || ""}
                                  disabled={!b.isNew}
                                  onChange={(e) =>
                                    updateBundleRow(globalIndex, "section", e.target.value)
                                  }
                                  className={`border p-2 rounded w-full ${
                                    b.isNew ? "bg-white" : "bg-slate-100"
                                  }`}
                                  placeholder="Section"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] text-slate-500 mb-1 md:hidden">
                                  Qty Required
                                </label>
                                <input
                                  value={b.qty_required ?? ""}
                                  disabled={!b.isNew}
                                  onChange={(e) =>
                                    updateBundleRow(globalIndex, "qty_required", e.target.value)
                                  }
                                  className={`border p-2 rounded w-full ${
                                    b.isNew ? "bg-white" : "bg-slate-100"
                                  }`}
                                  placeholder="Qty"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] text-slate-500 mb-1 md:hidden">
                                  Bundle Mass
                                </label>
                                <input
                                  value={b.bundle_mass ?? ""}
                                  disabled={!b.isNew}
                                  onChange={(e) =>
                                    updateBundleRow(globalIndex, "bundle_mass", e.target.value)
                                  }
                                  className={`border p-2 rounded w-full ${
                                    b.isNew ? "bg-white" : "bg-slate-100"
                                  }`}
                                  placeholder="Mass"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] text-slate-500 mb-1 md:hidden">
                                  Total Weight
                                </label>
                                <input
                                  value={b.total_weight ?? ""}
                                  disabled={!b.isNew}
                                  onChange={(e) =>
                                    updateBundleRow(globalIndex, "total_weight", e.target.value)
                                  }
                                  className={`border p-2 rounded w-full ${
                                    b.isNew ? "bg-white" : "bg-slate-100"
                                  }`}
                                  placeholder="Total Weight"
                                />
                              </div>

                              <div className="text-sm px-2">
                                {getDeliveredQty(b.bundle_no)}
                              </div>

                              <div>
                                <button
                                  onClick={() => deleteBundle(b)}
                                  className="text-red-600 text-sm"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="border rounded-2xl p-4 space-y-4">
          <div>
            <div className="text-lg font-semibold">New Delivery</div>
            <div className="text-sm text-slate-500">
              Fill out the delivery details and enter the quantity delivered against each bundle.
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs mb-1 text-slate-600">Delivered By</label>
              <input
                placeholder="Delivered By"
                value={deliveredBy}
                onChange={(e) => setDeliveredBy(e.target.value)}
                className="border p-2 rounded w-full"
              />
            </div>

            <div>
              <label className="block text-xs mb-1 text-slate-600">Vehicle / Rego</label>
              <input
                placeholder="Vehicle / Rego"
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
                className="border p-2 rounded w-full"
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
                placeholder="Comments"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                className="border p-2 rounded w-full"
              />
            </div>
          </div>

          {bundles.length === 0 ? (
            <div className="bg-yellow-100 border rounded-xl p-4 text-sm">
              No bundle register exists yet. Create the register above first.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[1050px]">
                <div className="grid grid-cols-7 gap-2 px-2 py-2 text-xs font-semibold text-slate-500 bg-slate-50 rounded-t-xl border">
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
                      className="grid grid-cols-7 gap-2 p-2 border-x border-b items-center"
                    >
                      <div className="text-sm">{b.bundle_no}</div>
                      <div className="text-sm">{b.section || "-"}</div>
                      <div className="text-sm">{required}</div>
                      <div className="text-sm">{delivered}</div>
                      <div className="text-sm">{remaining}</div>

                      <div>
                        <input
                          placeholder="0"
                          value={enteredQty[b.bundle_no] || ""}
                          onChange={(e) =>
                            setEnteredQty((prev) => ({
                              ...prev,
                              [b.bundle_no]: e.target.value,
                            }))
                          }
                          className="border p-2 rounded w-full"
                        />
                      </div>

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
              className="bg-green-600 text-white px-6 py-2 rounded disabled:opacity-50"
            >
              {savingDelivery ? "Saving..." : "Save Delivery"}
            </button>
          </div>
        </div>

        <div className="border rounded-2xl p-4 space-y-4">
          <div>
            <div className="text-lg font-semibold">Delivery History</div>
            <div className="text-sm text-slate-500">
              Review, edit, or delete previously recorded deliveries.
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

                    <div className="text-right">
                      <div className="text-sm text-slate-500 mb-2">
                        Items: {(d.tower_bundle_delivery_items || []).length}
                      </div>
                      <button
                        onClick={() => deleteDelivery(d.id)}
                        className="text-red-600 text-sm"
                      >
                        Delete Delivery
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <div className="min-w-[700px]">
                      <div className="grid grid-cols-4 gap-2 text-xs font-semibold text-slate-500 pb-2 border-b">
                        <div>Bundle</div>
                        <div>Qty Delivered</div>
                        <div>Edit</div>
                        <div>Delete</div>
                      </div>

                      {(d.tower_bundle_delivery_items || []).map((item) => (
                        <div
                          key={item.id}
                          className="grid grid-cols-4 gap-2 py-2 border-b items-center text-sm"
                        >
                          <div>{item.bundle_no}</div>

                          <div>
                            {editingItemId === item.id ? (
                              <input
                                value={editingItemQty}
                                onChange={(e) => setEditingItemQty(e.target.value)}
                                className="border p-2 rounded w-full"
                              />
                            ) : (
                              item.qty_delivered ?? 0
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
                              onClick={() => deleteDeliveryItem(item.id)}
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
    <div className="bg-slate-100 rounded-xl px-4 py-3 min-w-[120px]">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}