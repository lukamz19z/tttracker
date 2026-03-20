"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

type LabourRow = {
  worker_name: string;
  hours: string;
};

type ProgressRow = {
  section_label: string;
  progress_percent: string;
};

const DEFAULT_PROGRESS_ROWS: ProgressRow[] = [
  { section_label: "Legs", progress_percent: "" },
  { section_label: "Body Extensions", progress_percent: "" },
  { section_label: "Common Body", progress_percent: "" },
  { section_label: "Superstructure", progress_percent: "" },
  { section_label: "Crossarms", progress_percent: "" },
];

export default function NewDailyDocketPage() {
  const params = useParams();
  const router = useRouter();

  const towerId = params.towerId as string;
  const projectId = params.projectId as string;

  const [docketDate, setDocketDate] = useState("");
  const [crewName, setCrewName] = useState("");
  const [leadingHand, setLeadingHand] = useState("");

  const [weatherDelayHours, setWeatherDelayHours] = useState("");
  const [lightningDelayHours, setLightningDelayHours] = useState("");
  const [toolboxDelayHours, setToolboxDelayHours] = useState("");
  const [comments, setComments] = useState("");

  const [labourRows, setLabourRows] = useState<LabourRow[]>([
    { worker_name: "", hours: "" },
  ]);

  const [progressRows, setProgressRows] =
    useState<ProgressRow[]>(DEFAULT_PROGRESS_ROWS);

  const [saving, setSaving] = useState(false);

  function updateProgressRow(i: number, value: string) {
    setProgressRows((prev) =>
      prev.map((r, idx) =>
        idx === i ? { ...r, progress_percent: value } : r
      )
    );
  }

  function updateLabourRow(i: number, key: keyof LabourRow, value: string) {
    setLabourRows((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r))
    );
  }

  function addLabourRow() {
    setLabourRows((prev) => [...prev, { worker_name: "", hours: "" }]);
  }

  /* ================= PROGRESS ENGINE ================= */

  function calculateTowerProgress() {
    const weights: Record<string, number> = {
      Legs: 40,
      "Body Extensions": 15,
      "Common Body": 20,
      Superstructure: 10,
      Crossarms: 15,
    };

    let total = 0;

    progressRows.forEach((row) => {
      const pct = Number(row.progress_percent || 0);
      total += (pct / 100) * (weights[row.section_label] || 0);
    });

    return Math.round(total);
  }

  function calculateStatus(progress: number) {
    if (progress >= 100) return "Complete";
    if (progress > 0) return "In Progress";
    return "Not Started";
  }

  /* ================= SUBMIT ================= */

  async function handleSubmit() {
    if (!docketDate) return alert("Enter docket date");
    if (!leadingHand) return alert("Enter Leading Hand");

    setSaving(true);
    const supabase = createSupabaseBrowser();

    const { data: docket, error } = await supabase
      .from("tower_daily_dockets")
      .insert({
        tower_id: towerId,
        docket_date: docketDate,
        crew: crewName,
        leading_hand: leadingHand,
        weather_delay_hours: Number(weatherDelayHours || 0),
        lightning_delay_hours: Number(lightningDelayHours || 0),
        toolbox_delay_hours: Number(toolboxDelayHours || 0),
        comments,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      alert("Failed to save docket");
      setSaving(false);
      return;
    }

    /* LABOUR */
    const labourPayload = labourRows
      .filter((r) => r.worker_name)
      .map((r) => ({
        docket_id: docket.id,
        worker_name: r.worker_name,
        hours: Number(r.hours || 0),
      }));

    if (labourPayload.length) {
      await supabase.from("tower_docket_labour").insert(labourPayload);
    }

    /* PROGRESS */
    const progressPayload = progressRows
      .filter((r) => r.progress_percent !== "")
      .map((r) => ({
        docket_id: docket.id,
        section: r.section_label,
        erected_qty: Number(r.progress_percent),
      }));

    if (progressPayload.length) {
      await supabase.from("tower_docket_progress").insert(progressPayload);
    }

    /* UPDATE TOWER */
    const progress = calculateTowerProgress();

    await supabase
      .from("towers")
      .update({
        progress,
        status: calculateStatus(progress),
      })
      .eq("id", towerId);

    router.push(`/project/${projectId}/tower/${towerId}`);
  }

  return (
    <div className="p-8 space-y-8 max-w-5xl">

      <h1 className="text-3xl font-bold">New Daily Docket</h1>

      <section className="bg-white border rounded-2xl p-6 space-y-4">
        <Input label="Date" type="date" value={docketDate} onChange={setDocketDate} />
        <Input label="Crew" value={crewName} onChange={setCrewName} />
        <Input label="Leading Hand" value={leadingHand} onChange={setLeadingHand} />
      </section>

      <section className="bg-white border rounded-2xl p-6">
        <h2 className="font-semibold mb-3">Section Progress %</h2>

        {progressRows.map((row, i) => (
          <div key={i} className="flex gap-4 mb-2">
            <div className="w-48">{row.section_label}</div>
            <input
              className="border p-2 rounded w-32"
              type="number"
              value={row.progress_percent}
              onChange={(e) => updateProgressRow(i, e.target.value)}
            />
          </div>
        ))}
      </section>

      <section className="bg-white border rounded-2xl p-6 space-y-3">
        <h2 className="font-semibold">Labour</h2>

        {labourRows.map((row, i) => (
          <div key={i} className="flex gap-3">
            <input
              className="border p-2 rounded"
              placeholder="Worker"
              value={row.worker_name}
              onChange={(e) =>
                updateLabourRow(i, "worker_name", e.target.value)
              }
            />
            <input
              className="border p-2 rounded w-24"
              placeholder="Hours"
              type="number"
              value={row.hours}
              onChange={(e) =>
                updateLabourRow(i, "hours", e.target.value)
              }
            />
          </div>
        ))}

        <button
          onClick={addLabourRow}
          className="bg-slate-800 text-white px-4 py-2 rounded"
        >
          Add Worker
        </button>
      </section>

      <section className="bg-white border rounded-2xl p-6 space-y-3">
        <Input
          label="Weather Delay Hours"
          type="number"
          value={weatherDelayHours}
          onChange={setWeatherDelayHours}
        />
        <Input
          label="Lightning Delay Hours"
          type="number"
          value={lightningDelayHours}
          onChange={setLightningDelayHours}
        />
        <Input
          label="Toolbox Delay Hours"
          type="number"
          value={toolboxDelayHours}
          onChange={setToolboxDelayHours}
        />
        <Input label="Comments" value={comments} onChange={setComments} />
      </section>

      <button
        onClick={handleSubmit}
        disabled={saving}
        className="bg-blue-600 text-white px-6 py-3 rounded-xl"
      >
        {saving ? "Saving..." : "Save Daily Docket"}
      </button>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: any) {
  return (
    <div>
      <label className="block text-sm mb-1">{label}</label>
      <input
        className="border p-2 rounded w-full"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}