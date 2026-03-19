"use client";

import { useState } from "react";
import Papa from "papaparse";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

type Row = Record<string, any>;

export default function ImportTowersPage({
  params,
}: {
  params: { projectId: string };
}) {
  const projectId = params.projectId;
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  function handleFile(file: File) {
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const data = res.data;

        if (!data || data.length === 0) {
          alert("CSV contains no rows");
          return;
        }

        setRows(data);
        setColumns(Object.keys(data[0]));
      },
    });
  }

  async function handleImport() {
    const hasName = Object.values(mapping).includes("name");

    if (!hasName) {
      alert("You must map at least ONE column to Tower Name");
      return;
    }

    setLoading(true);

    const towersToInsert = rows.map((row) => {
      const core: any = {
        project_id: projectId,
        status: "Not Started",
        progress: 0,
      };

      const extra: any = {};

      columns.forEach((col) => {
        const map = mapping[col];

        if (!map) return;

        if (map === "name") core.name = row[col];
        else if (map === "latitude") core.latitude = Number(row[col]);
        else if (map === "longitude") core.longitude = Number(row[col]);
        else if (map === "line") core.line = row[col];
        else if (map.startsWith("extra:")) extra[col] = row[col];
      });

      core.extra_data = extra;

      return core;
    });

    const supabase = createSupabaseBrowser();

    const { error } = await supabase.from("towers").insert(towersToInsert);

    if (error) {
      console.error(error);
      alert("Error importing towers");
      setLoading(false);
      return;
    }

    alert("Towers imported successfully");
    router.push(`/project/${projectId}/towers`);
  }

  return (
    <div className="p-8 max-w-6xl">

      <h1 className="text-3xl font-bold mb-2">Import Towers</h1>
      <p className="text-slate-500 mb-6">
        Upload a CSV file and map columns.
      </p>

      <div className="border-2 border-dashed rounded-xl p-10 text-center mb-8 bg-white">
        <input
          type="file"
          accept=".csv"
          onChange={(e) => {
            if (!e.target.files) return;
            handleFile(e.target.files[0]);
          }}
        />
        <p className="text-slate-400 mt-2">Upload CSV file</p>
      </div>

      {columns.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xl font-semibold mb-4">Column Mapping</h2>

          {columns.map((col) => (
            <div
              key={col}
              className="flex items-center gap-6 mb-3 bg-white p-3 rounded-lg border"
            >
              <div className="w-64 font-medium">{col}</div>

              <select
                className="border p-2 rounded-lg"
                value={mapping[col] || ""}
                onChange={(e) =>
                  setMapping({ ...mapping, [col]: e.target.value })
                }
              >
                <option value="">Ignore</option>
                <option value="name">Tower Name</option>
                <option value="latitude">Latitude</option>
                <option value="longitude">Longitude</option>
                <option value="line">Line</option>
                <option value={`extra:${col}`}>Save as Extra</option>
              </select>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <button
          onClick={handleImport}
          disabled={loading}
          className="bg-blue-600 text-white px-8 py-3 rounded-xl hover:bg-blue-700"
        >
          {loading ? "Importing..." : "Import Towers"}
        </button>
      )}
    </div>
  );
}