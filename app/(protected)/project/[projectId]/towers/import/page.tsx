"use client";

import { useState } from "react";
import Papa from "papaparse";
import { useRouter } from "next/navigation";

export default function ImportTowers({ params }: { params: { id: string } }) {
  const projectId = params.id;
  const router = useRouter();

  const [rows, setRows] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<any>({});

function handleFile(file: File) {
  Papa.parse<Record<string, string>>(file, {
    header: true,
    skipEmptyLines: true,
    complete: (res) => {
      const data = res.data;

      if (!data || data.length === 0) {
        alert("CSV has no rows");
        return;
      }

      setRows(data);
      setColumns(Object.keys(data[0]));
    },
  });
}

  function handleImport() {
    // later: send mapped data to supabase
    console.log("Importing", rows, mapping);

    alert("Imported towers successfully");

    router.push(`/project/${projectId}/towers`);
  }

  return (
    <div className="p-8">

      <h1 className="text-3xl font-bold mb-4">Import Towers</h1>

      {/* Upload */}
      <div className="border-2 border-dashed p-10 rounded-xl mb-6 text-center">
        <input
          type="file"
          accept=".csv"
          onChange={(e) => handleFile(e.target.files![0])}
        />
        <p className="text-slate-500 mt-2">
          Upload tower CSV file
        </p>
      </div>

      {/* Preview */}
      {rows.length > 0 && (
        <>
          <h2 className="text-xl font-semibold mb-2">Column Mapping</h2>

          {columns.map((col) => (
            <div key={col} className="flex gap-4 mb-2">
              <div className="w-60">{col}</div>

              <select
                className="border p-2 rounded"
                onChange={(e) =>
                  setMapping({ ...mapping, [col]: e.target.value })
                }
              >
                <option value="">Ignore</option>
                <option value="name">Tower Name</option>
                <option value="latitude">Latitude</option>
                <option value="longitude">Longitude</option>
                <option value="line">Line</option>
              </select>
            </div>
          ))}

          <button
            onClick={handleImport}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg mt-4"
          >
            Import Towers
          </button>

          {/* Table preview */}
          <div className="mt-6 border rounded-xl overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  {columns.map((c) => (
                    <th key={c} className="p-2">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-t">
                    {columns.map((c) => (
                      <td key={c} className="p-2">{row[c]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}