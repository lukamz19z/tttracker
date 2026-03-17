"use client";

import { useState } from "react";
import Papa from "papaparse";
import { useRouter } from "next/navigation";

type Row = Record<string, any>;

export default function ImportTowersPage({
  params,
}: {
  params: { id: string };
}) {
  const projectId = params.id;
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // ---------- CSV Upload ----------
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

        const firstRow = data[0];

        if (!firstRow || typeof firstRow !== "object") {
          alert("Invalid CSV format");
          return;
        }

        setRows(data);
        setColumns(Object.keys(firstRow));
      },
    });
  }

  // ---------- Import Logic ----------
  async function handleImport() {
    if (!mapping) return;

    // Validate required field
    const hasName = Object.values(mapping).includes("name");

    if (!hasName) {
      alert("You must map at least ONE column to Tower Name");
      return;
    }

    setLoading(true);

    // Transform rows into system format
    const towersToInsert = rows.map((row, index) => {
      const core: any = {
        project_id: projectId,
        status: "Pending",
      };

      const extra: any = {};

      columns.forEach((col) => {
        const map = mapping[col];

        if (!map) return;

        if (map === "name") core.name = row[col];
        else if (map === "latitude") core.latitude = Number(row[col]);
        else if (map === "longitude") core.longitude = Number(row[col]);
        else if (map === "line") core.line = row[col];
        else if (map.startsWith("extra:")) {
          extra[col] = row[col];
        }
      });

      core.extra_data = extra;

      return core;
    });

    console.log("READY TO INSERT:", towersToInsert);

    // TODO: Supabase insert goes here

    alert("Towers imported successfully");

    router.push(`/project/${projectId}/towers`);
  }

  return (
    <div className="p-8 max-w-6xl">

      {/* HEADER */}
      <h1 className="text-3xl font-bold mb-2">Import Towers</h1>
      <p className="text-slate-500 mb-6">
        Upload a CSV file and map the columns to tower fields.
      </p>

      {/* UPLOAD BOX */}
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

      {/* COLUMN MAPPING */}
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
                <option value={`extra:${col}`}>Save as Extra Field</option>
              </select>
            </div>
          ))}
        </div>
      )}

      {/* PREVIEW TABLE */}
      {rows.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xl font-semibold mb-3">Preview</h2>

          <div className="border rounded-xl overflow-auto bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  {columns.map((c) => (
                    <th key={c} className="p-2 text-left">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.slice(0, 6).map((row, i) => (
                  <tr key={i} className="border-t">
                    {columns.map((c) => (
                      <td key={c} className="p-2">
                        {row[c]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* IMPORT BUTTON */}
      {rows.length > 0 && (
        <button
          onClick={handleImport}
          disabled={loading}
          className="bg-blue-600 text-white px-8 py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Importing..." : "Import Towers"}
        </button>
      )}
    </div>
  );
}