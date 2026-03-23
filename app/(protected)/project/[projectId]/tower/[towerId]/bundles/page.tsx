"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Papa from "papaparse";
import { createSupabaseBrowser } from "@/lib/supabase";

export default function BundleRegisterPage() {
  const { towerId } = useParams();
  const supabase = createSupabaseBrowser();

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data } = await supabase
      .from("tower_required_bundles")
      .select("*")
      .eq("tower_id", towerId)
      .order("bundle_no");

    setRows(data || []);
    setLoading(false);
  }

  function addRow() {
    setRows([
      ...rows,
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

  function updateRow(index: number, field: string, value: any) {
    const newRows = [...rows];
    newRows[index][field] = value;
    setRows(newRows);
  }

  async function saveRows() {
    for (const r of rows) {
      if (r.isNew) {
        await supabase.from("tower_required_bundles").insert({
          tower_id: towerId,
          bundle_no: r.bundle_no,
          section: r.section,
          qty_required: Number(r.qty_required) || null,
          bundle_mass: Number(r.bundle_mass) || null,
          total_weight: Number(r.total_weight) || null,
        });
      }
    }

    alert("Saved");
    load();
  }

  async function deleteRow(id: string) {
    await supabase
      .from("tower_required_bundles")
      .delete()
      .eq("id", id);

    load();
  }

  function handleCSV(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        for (const r of results.data as any[]) {
          await supabase.from("tower_required_bundles").insert({
            tower_id: towerId,
            bundle_no:
              r.bundle_no ||
              r.bundle ||
              r["Bundle No"] ||
              r["Bundle Reference"],

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

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Bundle Register</h1>

      <input
        type="file"
        accept=".csv"
        onChange={(e) =>
          e.target.files && handleCSV(e.target.files[0])
        }
      />

      <button
        onClick={addRow}
        className="bg-slate-200 px-4 py-2 rounded"
      >
        Add Bundle Row
      </button>

      <div className="border rounded">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-6 gap-2 p-2 border-b">
            <input
              placeholder="Bundle"
              value={r.bundle_no || ""}
              onChange={(e) =>
                updateRow(i, "bundle_no", e.target.value)
              }
              className="border p-1"
            />
            <input
              placeholder="Section"
              value={r.section || ""}
              onChange={(e) =>
                updateRow(i, "section", e.target.value)
              }
              className="border p-1"
            />
            <input
              placeholder="Qty"
              value={r.qty_required || ""}
              onChange={(e) =>
                updateRow(i, "qty_required", e.target.value)
              }
              className="border p-1"
            />
            <input
              placeholder="Bundle Mass"
              value={r.bundle_mass || ""}
              onChange={(e) =>
                updateRow(i, "bundle_mass", e.target.value)
              }
              className="border p-1"
            />
            <input
              placeholder="Total Weight"
              value={r.total_weight || ""}
              onChange={(e) =>
                updateRow(i, "total_weight", e.target.value)
              }
              className="border p-1"
            />

            {!r.isNew && (
              <button
                onClick={() => deleteRow(r.id)}
                className="text-red-500"
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={saveRows}
        className="bg-blue-600 text-white px-6 py-2 rounded"
      >
        Save Register
      </button>
    </div>
  );
}