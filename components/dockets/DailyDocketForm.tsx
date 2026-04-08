"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

type LabourRow = {
  worker_name: string;
  time_in: string;
  time_out: string;
  total_hours: string;
};

type ProgressRow = {
  section_label: string;
  assembled_qty: string;
  erected_qty: string;
};

const DEFAULT_PROGRESS_ROWS: ProgressRow[] = [
  { section_label: "Legs", assembled_qty: "", erected_qty: "" },
  { section_label: "Body Extensions", assembled_qty: "", erected_qty: "" },
  { section_label: "Common Body", assembled_qty: "", erected_qty: "" },
  { section_label: "Superstructure", assembled_qty: "", erected_qty: "" },
  { section_label: "Crossarms", assembled_qty: "", erected_qty: "" },
];

export default function DailyDocketForm({
  mode,
  projectId,
  towerId,
  docketId,
  initialDocket,
  initialLabourRows,
  initialProgressRows,
}: {
  mode: "create" | "edit" | "view";
  projectId: string;
  towerId: string;
  docketId?: string;
  initialDocket?: any;              // ✅ ADDED
  initialLabourRows?: any[];        // ✅ ADDED
  initialProgressRows?: any[];      // ✅ ADDED
}){
  const isView = mode === "view";
  const router = useRouter();
  const supabase = createSupabaseBrowser();

  const [docketDate, setDocketDate] = useState("");
  const [crewName, setCrewName] = useState("");
  const [leadingHand, setLeadingHand] = useState("");
  const [weather, setWeather] = useState("");

  const [bcRepName, setBcRepName] = useState("");
  const [clientRepName, setClientRepName] = useState("");
  const [signedDate, setSignedDate] = useState("");

  const [labourRows, setLabourRows] = useState<LabourRow[]>([
    { worker_name: "", time_in: "", time_out: "", total_hours: "" },
  ]);

  const [progressRows, setProgressRows] =
    useState<ProgressRow[]>(DEFAULT_PROGRESS_ROWS);

  const [saving, setSaving] = useState(false);

  // 🔥 LOAD EXISTING DOCKET (VIEW / EDIT)
 useEffect(() => {
  if (!docketId && !initialDocket) return;

  async function loadDocket() {

    // ✅ ADD THIS BLOCK RIGHT HERE
    if (initialDocket) {
      setDocketDate(initialDocket.docket_date || "");
      setCrewName(initialDocket.crew || "");
      setLeadingHand(initialDocket.leading_hand || "");
      setWeather(initialDocket.weather || "");

      setBcRepName(initialDocket.bc_rep_name || "");
      setClientRepName(initialDocket.client_rep_name || "");
      setSignedDate(initialDocket.signed_date || "");

      if (initialLabourRows?.length) {
        setLabourRows(
          initialLabourRows.map((r) => ({
            worker_name: r.worker_name || "",
            time_in: r.time_in || "",
            time_out: r.time_out || "",
            total_hours: String(r.total_hours || ""),
          }))
        );
      }

      if (initialProgressRows?.length) {
        setProgressRows(
          initialProgressRows.map((r) => ({
            section_label: r.section_label,
            assembled_qty: String(r.assembled_qty || ""),
            erected_qty: String(r.erected_qty || ""),
          }))
        );
      }

      return; // 🚨 VERY IMPORTANT (stops duplicate fetch)
    }

    // 🔽 YOUR EXISTING CODE CONTINUES (DO NOT REMOVE)
    const { data } = await supabase
      .from("tower_daily_dockets")
      .select("*")
      .eq("id", docketId)
      .single();

    if (!data) return;

    setDocketDate(data.docket_date || "");
    setCrewName(data.crew || "");
    setLeadingHand(data.leading_hand || "");
    setWeather(data.weather || "");

    setBcRepName(data.bc_rep_name || "");
    setClientRepName(data.client_rep_name || "");
    setSignedDate(data.signed_date || "");

    const { data: labour } = await supabase
      .from("tower_docket_labour")
      .select("*")
      .eq("docket_id", docketId);

    if (labour?.length) {
      setLabourRows(
        labour.map((r) => ({
          worker_name: r.worker_name || "",
          time_in: r.time_in || "",
          time_out: r.time_out || "",
          total_hours: String(r.total_hours || ""),
        }))
      );
    }

    const { data: progress } = await supabase
      .from("tower_docket_progress")
      .select("*")
      .eq("docket_id", docketId);

    if (progress?.length) {
      setProgressRows(
        progress.map((r) => ({
          section_label: r.section_label,
          assembled_qty: String(r.assembled_qty || ""),
          erected_qty: String(r.erected_qty || ""),
        }))
      );
    }
  }

  loadDocket();
}, [docketId, initialDocket]);

  // 🔥 PREFILL (WITH DATE INCREMENT)
  async function prefillFromLastDocket() {
    try {
      const { data: lastDocket } = await supabase
        .from("tower_daily_dockets")
        .select("*")
        .eq("tower_id", towerId)
        .order("docket_date", { ascending: false })
        .limit(1)
        .single();

      if (!lastDocket) return alert("No previous docket found");

      const { data: labour } = await supabase
        .from("tower_docket_labour")
        .select("*")
        .eq("docket_id", lastDocket.id);

      const { data: progress } = await supabase
        .from("tower_docket_progress")
        .select("*")
        .eq("docket_id", lastDocket.id);

      if (lastDocket.docket_date) {
        const nextDate = new Date(lastDocket.docket_date);
        nextDate.setDate(nextDate.getDate() + 1);
        setDocketDate(nextDate.toISOString().slice(0, 10));
      }

      setCrewName(lastDocket.crew || "");
      setLeadingHand(lastDocket.leading_hand || "");
      setWeather(lastDocket.weather || "");

      setBcRepName("");
      setClientRepName("");
      setSignedDate("");

      if (labour?.length) {
        setLabourRows(
          labour.map((r) => ({
            worker_name: r.worker_name || "",
            time_in: r.time_in || "",
            time_out: r.time_out || "",
            total_hours: String(r.total_hours || ""),
          }))
        );
      }

      if (progress?.length) {
        setProgressRows(
          progress.map((r) => ({
            section_label: r.section_label,
            assembled_qty: String(r.assembled_qty || ""),
            erected_qty: String(r.erected_qty || ""),
          }))
        );
      }
    } catch (err) {
      console.error(err);
    }
  }

  function updateLabourRow(index: number, key: keyof LabourRow, value: string) {
    if (isView) return;
    setLabourRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [key]: value } : r))
    );
  }

  function updateProgressRow(index: number, key: keyof ProgressRow, value: string) {
    if (isView) return;
    setProgressRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [key]: value } : r))
    );
  }

  async function handleSubmit() {
    if (isView) return;
    setSaving(true);

    try {
      await supabase.from("tower_daily_dockets").insert({
        project_id: projectId,
        tower_id: towerId,
        docket_date: docketDate,
        crew: crewName,
        leading_hand: leadingHand,
        weather,
      });

      router.push(`/project/${projectId}/tower/${towerId}/dockets`);
    } catch {
      alert("Failed to save");
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-6xl space-y-8">

      <div className="flex items-start justify-between">
        <h1 className="text-3xl font-bold">
          {isView ? "View Daily Docket" : "Add Daily Docket"}
        </h1>

        <div className="flex gap-2">
          {!isView && (
            <button onClick={prefillFromLastDocket} className="bg-slate-700 text-white px-4 py-2 rounded-xl">
              Prefill Yesterday
            </button>
          )}

          <button
            onClick={() =>
              router.push(`/project/${projectId}/tower/${towerId}/dockets`)
            }
            className="border px-4 py-2 rounded-xl"
          >
            Back
          </button>
        </div>
      </div>

      {/* BASIC */}
      <section className="bg-white border p-6 rounded-2xl grid md:grid-cols-2 gap-4">
        <Input label="Date" type="date" value={docketDate} onChange={setDocketDate} disabled={isView} />
        <Input label="Crew" value={crewName} onChange={setCrewName} disabled={isView} />
        <Input label="Leading Hand" value={leadingHand} onChange={setLeadingHand} disabled={isView} />
        <Input label="Weather" value={weather} onChange={setWeather} disabled={isView} />
      </section>

      {/* PROGRESS */}
      <section className="bg-white border p-6 rounded-2xl">
        <h2 className="text-xl font-semibold mb-4">Progress</h2>
        {progressRows.map((row, i) => (
          <div key={i} className="grid grid-cols-3 gap-3 mb-2">
            <div>{row.section_label}</div>
            <input disabled={isView} value={row.assembled_qty}
              onChange={(e) => updateProgressRow(i, "assembled_qty", e.target.value)}
              className="border p-2 rounded" />
            <input disabled={isView} value={row.erected_qty}
              onChange={(e) => updateProgressRow(i, "erected_qty", e.target.value)}
              className="border p-2 rounded" />
          </div>
        ))}
      </section>

      {/* LABOUR */}
      <section className="bg-white border p-6 rounded-2xl">
        <h2 className="text-xl font-semibold mb-4">Labour</h2>
        {labourRows.map((row, i) => (
          <div key={i} className="grid grid-cols-4 gap-3 mb-2">
            <input disabled={isView} value={row.worker_name}
              onChange={(e) => updateLabourRow(i, "worker_name", e.target.value)}
              className="border p-2 rounded" />
            <input disabled={isView} value={row.time_in}
              onChange={(e) => updateLabourRow(i, "time_in", e.target.value)}
              type="time" className="border p-2 rounded" />
            <input disabled={isView} value={row.time_out}
              onChange={(e) => updateLabourRow(i, "time_out", e.target.value)}
              type="time" className="border p-2 rounded" />
            <input disabled={isView} value={row.total_hours}
              onChange={(e) => updateLabourRow(i, "total_hours", e.target.value)}
              type="number" className="border p-2 rounded" />
          </div>
        ))}
      </section>

      {!isView && (
        <button onClick={handleSubmit} className="bg-blue-600 text-white px-6 py-3 rounded-xl">
          {saving ? "Saving..." : "Save Docket"}
        </button>
      )}

    </div>
  );
}

function Input({ label, value, onChange, type = "text", disabled = false }: any) {
  return (
    <div>
      <label className="block text-sm mb-1">{label}</label>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="border p-2 rounded w-full"
      />
    </div>
  );
}