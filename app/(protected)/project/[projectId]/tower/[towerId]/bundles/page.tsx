"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type Tower = {
  id: string;
  name?: string | null;
  line?: string | null;
  status?: string | null;
  progress?: number | null;
  tower_number?: string | null;
  structure_number?: string | null;
  tower_no?: string | null;
  cover_photo_path?: string | null;
  [key: string]: unknown;
};

type BundleRow = {
  id?: string;
  tower_id?: string;
  bundle_no: string;
  section: string;
  qty_required: string;
};

export default function BundlesPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const [tower, setTower] = useState<Tower | null>(null);
  const [rows, setRows] = useState<BundleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!towerId) return;

    let cancelled = false;

    async function run() {
      setLoading(true);

      const [towerRes, bundlesRes] = await Promise.all([
        supabase.from("towers").select("*").eq("id", towerId).single(),
        supabase
          .from("tower_required_bundles")
          .select("*")
          .eq("tower_id", towerId)
          .order("bundle_no"),
      ]);

      if (cancelled) return;

      setTower((towerRes.data as Tower | null) ?? null);

      const bundleData = (bundlesRes.data as
        | {
            id?: string;
            tower_id?: string;
            bundle_no?: string | null;
            section?: string | null;
            qty_required?: number | null;
          }[]
        | null) ?? [];

      if (bundleData.length > 0) {
        setRows(
          bundleData.map((row) => ({
            id: row.id,
            tower_id: row.tower_id,
            bundle_no: row.bundle_no ?? "",
            section: row.section ?? "",
            qty_required:
              row.qty_required === null || row.qty_required === undefined
                ? ""
                : String(row.qty_required),
          }))
        );
      } else {
        setRows([
          {
            bundle_no: "",
            section: "",
            qty_required: "",
          },
        ]);
      }

      setLoading(false);
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [towerId, supabase]);

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        bundle_no: "",
        section: "",
        qty_required: "",
      },
    ]);
  }

  function removeRow(index: number) {
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0
        ? next
        : [
            {
              bundle_no: "",
              section: "",
              qty_required: "",
            },
          ];
    });
  }

  function updateRow(index: number, key: keyof BundleRow, value: string) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: value } : row))
    );
  }

  const totalRequired = useMemo(() => {
    return rows.reduce((sum, row) => sum + Number(row.qty_required || 0), 0);
  }, [rows]);

  const duplicateBundleNos = useMemo(() => {
    const seen = new Map<string, number[]>();

    rows.forEach((row, index) => {
      const key = row.bundle_no.trim().toLowerCase();
      if (!key) return;

      const current = seen.get(key) || [];
      current.push(index);
      seen.set(key, current);
    });

    const duplicateIndexes = new Set<number>();

    seen.forEach((indexes) => {
      if (indexes.length > 1) {
        indexes.forEach((i) => duplicateIndexes.add(i));
      }
    });

    return duplicateIndexes;
  }, [rows]);

  async function saveBundles() {
    if (!towerId) {
      alert("Missing tower id");
      return;
    }

    const cleanRows = rows.filter(
      (row) =>
        row.bundle_no.trim() || row.section.trim() || row.qty_required.trim()
    );

    if (cleanRows.length === 0) {
      alert("Please add at least one bundle row");
      return;
    }

    if (duplicateBundleNos.size > 0) {
      alert("Duplicate bundle numbers found. Each bundle number must be unique.");
      return;
    }

    const invalidQty = cleanRows.some(
      (row) => row.qty_required.trim() === "" || Number(row.qty_required) < 0
    );

    if (invalidQty) {
      alert("Please enter a valid required quantity for each bundle.");
      return;
    }

    setSaving(true);

    try {
      const { error: deleteError } = await supabase
        .from("tower_required_bundles")
        .delete()
        .eq("tower_id", towerId);

      if (deleteError) {
        throw new Error(deleteError.message || "Failed to clear old bundles");
      }

      const payload = cleanRows.map((row) => ({
        tower_id: towerId,
        bundle_no: row.bundle_no.trim(),
        section: row.section.trim() || null,
        qty_required: Number(row.qty_required || 0),
      }));

      const { error: insertError } = await supabase
        .from("tower_required_bundles")
        .insert(payload);

      if (insertError) {
        throw new Error(insertError.message || "Failed to save bundles");
      }

      alert("Bundles saved");
      router.refresh();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8">Loading bundles...</div>;
  }

  return (
    <div className="p-8 space-y-6">
      {tower && (
        <TowerHeader projectId={projectId} tower={tower} latestDate={null} />
      )}

      <div className="bg-white border rounded-2xl p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Bundle Register</h1>
            <p className="text-slate-500 mt-1">
              Add the required bundles for this tower so deliveries can be tracked
              properly.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={addRow}
              className="bg-slate-900 text-white px-4 py-2 rounded-lg"
            >
              Add Bundle
            </button>

            <button
              type="button"
              onClick={saveBundles}
              disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Bundles"}
            </button>
          </div>
        </div>

        {duplicateBundleNos.size > 0 && (
          <div className="border border-red-200 bg-red-50 text-red-700 rounded-2xl p-4">
            Duplicate bundle numbers detected. Each bundle number must only appear once.
          </div>
        )}

        <div className="border rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 gap-3 bg-slate-100 p-4 font-semibold text-sm">
            <div className="col-span-4">Bundle No</div>
            <div className="col-span-4">Section</div>
            <div className="col-span-2">Qty Required</div>
            <div className="col-span-2">Action</div>
          </div>

          <div className="divide-y">
            {rows.map((row, index) => {
              const isDuplicate = duplicateBundleNos.has(index);

              return (
                <div
                  key={row.id ?? `new-${index}`}
                  className={`grid grid-cols-12 gap-3 p-4 items-end ${
                    isDuplicate ? "bg-red-50" : ""
                  }`}
                >
                  <div className="col-span-4">
                    <label className="block text-xs text-slate-500 mb-1">
                      Bundle No
                    </label>
                    <input
                      className={`border rounded-lg p-2 w-full ${
                        isDuplicate ? "border-red-500" : ""
                      }`}
                      value={row.bundle_no}
                      onChange={(e) =>
                        updateRow(index, "bundle_no", e.target.value)
                      }
                      placeholder="e.g. B001"
                    />
                    {isDuplicate && row.bundle_no.trim() && (
                      <p className="text-xs text-red-600 mt-1">
                        Bundle number already exists in this register.
                      </p>
                    )}
                  </div>

                  <div className="col-span-4">
                    <label className="block text-xs text-slate-500 mb-1">
                      Section
                    </label>
                    <input
                      className="border rounded-lg p-2 w-full"
                      value={row.section}
                      onChange={(e) =>
                        updateRow(index, "section", e.target.value)
                      }
                      placeholder="e.g. Legs / Body / Crossarms"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs text-slate-500 mb-1">
                      Qty Required
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="border rounded-lg p-2 w-full"
                      value={row.qty_required}
                      onChange={(e) =>
                        updateRow(index, "qty_required", e.target.value)
                      }
                      placeholder="0"
                    />
                  </div>

                  <div className="col-span-2">
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      className="border px-4 py-2 rounded-lg w-full"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t bg-slate-50 p-4 flex justify-end">
            <div className="text-right">
              <div className="text-sm text-slate-500">Total Required Qty</div>
              <div className="text-2xl font-bold">{totalRequired}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}