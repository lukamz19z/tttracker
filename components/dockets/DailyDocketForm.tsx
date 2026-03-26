"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

type Mode = "create" | "edit";

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
];

export default function DailyDocketForm({
  mode,
  projectId,
  towerId,
  docketId,
}: {
  mode: Mode;
  projectId: string;
  towerId: string;
  docketId?: string;
}) {
  const supabase = createSupabaseBrowser();
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(mode === "edit");

  const [docketDate, setDocketDate] = useState("");
  const [supervisor, setSupervisor] = useState("");
  const [weather, setWeather] = useState("");
  const [crewSize, setCrewSize] = useState("");
  const [notes, setNotes] = useState("");

  const [labourRows, setLabourRows] = useState<LabourRow[]>([]);
  const [progressRows, setProgressRows] =
    useState<ProgressRow[]>(DEFAULT_PROGRESS_ROWS);

  const progressPercent = useMemo(() => {
    const erectedTotal = progressRows.reduce(
      (sum, r) => sum + Number(r.erected_qty || 0),
      0
    );
    return erectedTotal;
  }, [progressRows]);

  useEffect(() => {
    if (mode === "edit" && docketId) load();
  }, []);

  async function load() {
    const { data } = await supabase
      .from("tower_daily_dockets")
      .select("*")
      .eq("id", docketId)
      .single();

    if (data) {
      setDocketDate(data.docket_date);
      setSupervisor(data.supervisor);
      setWeather(data.weather);
      setCrewSize(data.crew_size);
      setNotes(data.notes || "");
      setLabourRows(data.labour_rows || []);
      setProgressRows(data.progress_rows || DEFAULT_PROGRESS_ROWS);
    }

    setLoading(false);
  }

  function addLabourRow() {
    setLabourRows([
      ...labourRows,
      { worker_name: "", time_in: "", time_out: "", total_hours: "" },
    ]);
  }

  function updateLabourRow(index: number, field: string, value: string) {
    const rows = [...labourRows];
    (rows[index] as any)[field] = value;
    setLabourRows(rows);
  }

  function updateProgressRow(index: number, field: string, value: string) {
    const rows = [...progressRows];
    (rows[index] as any)[field] = value;
    setProgressRows(rows);
  }

  async function handleCreate() {
    setSaving(true);

    const { data: docket } = await supabase
      .from("tower_daily_dockets")
      .insert({
        tower_id: towerId,
        docket_date: docketDate,
        supervisor,
        weather,
        crew_size: crewSize,
        notes,
        labour_rows: labourRows,
        progress_rows: progressRows,
        progress: progressPercent,
      })
      .select()
      .single();

    await supabase
      .from("towers")
      .update({ progress: progressPercent })
      .eq("id", towerId);

    router.push(`/project/${projectId}/tower/${towerId}/dockets`);
    router.refresh();
  }

  async function handleUpdate() {
    setSaving(true);

    await supabase
      .from("tower_daily_dockets")
      .update({
        docket_date: docketDate,
        supervisor,
        weather,
        crew_size: crewSize,
        notes,
        labour_rows: labourRows,
        progress_rows: progressRows,
        progress: progressPercent,
      })
      .eq("id", docketId);

    await supabase
      .from("towers")
      .update({ progress: progressPercent })
      .eq("id", towerId);

    router.push(`/project/${projectId}/tower/${towerId}/dockets`);
    router.refresh();
  }

  if (loading) return <div className="p-8">Loading docket...</div>;

  return (
    <div className="p-8 space-y-6">

      <div className="bg-white border rounded-2xl p-6 space-y-4">

        <div className="text-xl font-semibold">
          {mode === "create" ? "New Daily Docket" : "Edit Daily Docket"}
        </div>

        <input
          className="border rounded-lg p-2 w-full"
          type="date"
          value={docketDate}
          onChange={(e) => setDocketDate(e.target.value)}
        />

        <input
          className="border rounded-lg p-2 w-full"
          placeholder="Supervisor"
          value={supervisor}
          onChange={(e) => setSupervisor(e.target.value)}
        />

        <input
          className="border rounded-lg p-2 w-full"
          placeholder="Weather"
          value={weather}
          onChange={(e) => setWeather(e.target.value)}
        />

        <input
          className="border rounded-lg p-2 w-full"
          placeholder="Crew Size"
          value={crewSize}
          onChange={(e) => setCrewSize(e.target.value)}
        />

        <textarea
          className="border rounded-lg p-2 w-full"
          placeholder="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="text-lg font-semibold">Progress</div>

        {progressRows.map((row, i) => (
          <div key={i} className="grid grid-cols-3 gap-2">
            <div>{row.section_label}</div>

            <input
              className="border p-2 rounded"
              placeholder="Assembled"
              value={row.assembled_qty}
              onChange={(e) =>
                updateProgressRow(i, "assembled_qty", e.target.value)
              }
            />

            <input
              className="border p-2 rounded"
              placeholder="Erected"
              value={row.erected_qty}
              onChange={(e) =>
                updateProgressRow(i, "erected_qty", e.target.value)
              }
            />
          </div>
        ))}

        <div className="text-lg font-semibold">Labour</div>

        {labourRows.map((row, i) => (
          <div key={i} className="grid grid-cols-4 gap-2">
            <input
              className="border p-2 rounded"
              placeholder="Name"
              value={row.worker_name}
              onChange={(e) =>
                updateLabourRow(i, "worker_name", e.target.value)
              }
            />
            <input
              className="border p-2 rounded"
              type="time"
              value={row.time_in}
              onChange={(e) =>
                updateLabourRow(i, "time_in", e.target.value)
              }
            />
            <input
              className="border p-2 rounded"
              type="time"
              value={row.time_out}
              onChange={(e) =>
                updateLabourRow(i, "time_out", e.target.value)
              }
            />
            <input
              className="border p-2 rounded"
              placeholder="Hours"
              value={row.total_hours}
              onChange={(e) =>
                updateLabourRow(i, "total_hours", e.target.value)
              }
            />
          </div>
        ))}

        <button
          onClick={addLabourRow}
          className="bg-slate-200 px-4 py-2 rounded"
        >
          Add Labour Row
        </button>

        <div className="flex gap-3 pt-4">
          <button
            disabled={saving}
            onClick={mode === "create" ? handleCreate : handleUpdate}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg"
          >
            {saving ? "Saving..." : "Save"}
          </button>

          <button
            onClick={() =>
              router.push(`/project/${projectId}/tower/${towerId}/dockets`)
            }
            className="border px-6 py-2 rounded-lg"
          >
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
}