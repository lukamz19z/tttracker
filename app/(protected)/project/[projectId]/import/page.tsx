"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";
import Papa from "papaparse";

export default function ImportTowersPage() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = createSupabaseBrowser();

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function handleFile(e: any) {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setMsg("");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async function (results) {
        const rows = results.data;

        const towers = rows.map((r: any) => ({
          project_id: id,
          tower_number: r["TowerID"],
          type: r["Type"],
          latitude: Number(r["Latitude"]),
          longitude: Number(r["Longitude"]),
          tower_height: Number(r["TOWER HEIGHT"]),
          body_extension: Number(r["BODY EXT"]),
          leg_a: Number(r["Leg A"]),
          leg_b: Number(r["Leg B"]),
          leg_c: Number(r["Leg C"]),
          leg_d: Number(r["Leg D"]),
        }));

        const { error } = await supabase.from("towers").insert(towers);

        if (error) {
          setMsg(error.message);
          setLoading(false);
          return;
        }

        setMsg("Towers imported successfully");
        setLoading(false);

        setTimeout(() => {
          router.push(`/project/${id}/towers`);
        }, 1200);
      },
    });
  }

  return (
    <AppShell title="Import Towers CSV">
      <div className="bg-white p-6 rounded-2xl shadow-sm max-w-xl">
        <h2 className="text-xl font-semibold mb-4">
          Upload Tower Schedule CSV
        </h2>

        <input type="file" accept=".csv" onChange={handleFile} />

        {loading && <p className="mt-4">Importing towers...</p>}
        {msg && <p className="mt-4 text-blue-600">{msg}</p>}
      </div>
    </AppShell>
  );
}