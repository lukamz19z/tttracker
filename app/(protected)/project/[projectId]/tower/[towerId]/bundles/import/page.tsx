"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import Papa from "papaparse";
import { createSupabaseBrowser } from "@/lib/supabase";

export default function ImportBundlesPage() {
  const { towerId } = useParams();
  const supabase = createSupabaseBrowser();

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  function mapRow(r: any) {
    const keys = Object.keys(r).reduce((acc: any, k) => {
      acc[k.toLowerCase().trim()] = r[k];
      return acc;
    }, {});

    function find(fieldNames: string[]) {
      for (const f of fieldNames) {
        const match = Object.keys(keys).find((k) => k.includes(f));
        if (match) return keys[match];
      }
      return null;
    }

    return {
      bundle_no: find(["bundle"]),
      pcs: Number(find(["pcs"])) || null,
      bundle_mass: Number(find(["mass"])) || null,
      qty_required: Number(find(["qty", "quantity"])) || null,
      total_weight: Number(find(["total"])) || null,
      section: find(["section", "group", "type"]),
    };
  }

  function handleFile(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const cleaned = results.data
          .map(mapRow)
          .filter((r: any) => r.bundle_no);

        setRows(cleaned);
      },
    });
  }

  async function importBundles() {
    setLoading(true);

    for (const r of rows) {
      await supabase.from("tower_required_bundles").insert({
        tower_id: towerId,
        ...r,
      });
    }

    alert("Bundles Imported");
    setRows([]);
    setLoading(false);
  }

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Import Required Bundles</h1>

      <input
        type="file"
        accept=".csv"
        onChange={(e) =>
          e.target.files && handleFile(e.target.files[0])
        }
      />

      <div>Bundles detected: {rows.length}</div>

      <button
        onClick={importBundles}
        className="bg-blue-600 text-white px-6 py-2 rounded"
      >
        Import
      </button>
    </div>
  );
}