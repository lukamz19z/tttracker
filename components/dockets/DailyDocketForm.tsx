"use client";

import { useMemo, useState } from "react";
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

type DocketRecord = {
  id?: string;
  project_id: string;
  tower_id: string;
  docket_date: string | null;
  crew: string | null;
  leading_hand: string | null;
  weather: string | null;
  assembly_percent?: number | null;
  erection_percent?: number | null;
  weather_delay_hours: number | null;
  lightning_delay_hours: number | null;
  toolbox_delay_hours: number | null;
  other_delay_hours: number | null;
  other_delay_reason: string | null;
  delays_comments: string | null;
  missing_items_bolts: string | null;
  bc_rep_name: string | null;
  client_rep_name: string | null;
  signed_date: string | null;
  docket_file_url: string | null;
};

const DEFAULT_PROGRESS_ROWS: ProgressRow[] = [
  { section_label: "Legs", assembled_qty: "", erected_qty: "" },
  { section_label: "Body Extensions", assembled_qty: "", erected_qty: "" },
  { section_label: "Common Body", assembled_qty: "", erected_qty: "" },
  { section_label: "Superstructure", assembled_qty: "", erected_qty: "" },
  { section_label: "Crossarms", assembled_qty: "", erected_qty: "" },
];

function toStringValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function clampPercent(value: string) {
  if (value === "") return "";
  const n = Number(value);
  if (Number.isNaN(n)) return "";
  return String(Math.max(0, Math.min(100, n)));
}

function isSignedDocket(docket: {
  client_rep_name?: string | null;
  signed_date?: string | null;
}) {
  return Boolean(
    docket.client_rep_name?.trim() && docket.signed_date && docket.signed_date.trim()
  );
}

export default function DailyDocketForm({
  mode,
  projectId,
  towerId,
  docketId,
  initialDocket,
  initialLabourRows,
  initialProgressRows,
}: {
  mode: "create" | "edit";
  projectId: string;
  towerId: string;
  docketId?: string;
  initialDocket?: Partial<DocketRecord> | null;
  initialLabourRows?: LabourRow[];
  initialProgressRows?: ProgressRow[];
}) {
  const router = useRouter();
  const supabase = createSupabaseBrowser();

  const [docketDate, setDocketDate] = useState(toStringValue(initialDocket?.docket_date));
  const [crewName, setCrewName] = useState(toStringValue(initialDocket?.crew));
  const [leadingHand, setLeadingHand] = useState(toStringValue(initialDocket?.leading_hand));
  const [weather, setWeather] = useState(toStringValue(initialDocket?.weather));
  const [weatherDelayHours, setWeatherDelayHours] = useState(
    toStringValue(initialDocket?.weather_delay_hours)
  );
  const [lightningDelayHours, setLightningDelayHours] = useState(
    toStringValue(initialDocket?.lightning_delay_hours)
  );
  const [toolboxDelayHours, setToolboxDelayHours] = useState(
    toStringValue(initialDocket?.toolbox_delay_hours)
  );
  const [otherDelayHours, setOtherDelayHours] = useState(
    toStringValue(initialDocket?.other_delay_hours)
  );
  const [otherDelayReason, setOtherDelayReason] = useState(
    toStringValue(initialDocket?.other_delay_reason)
  );
  const [missingItemsBolts, setMissingItemsBolts] = useState(
    toStringValue(initialDocket?.missing_items_bolts)
  );
  const [delaysComments, setDelaysComments] = useState(
    toStringValue(initialDocket?.delays_comments)
  );
  const [bcRepName, setBcRepName] = useState(toStringValue(initialDocket?.bc_rep_name));
  const [clientRepName, setClientRepName] = useState(
    toStringValue(initialDocket?.client_rep_name)
  );
  const [signedDate, setSignedDate] = useState(toStringValue(initialDocket?.signed_date));
  const [docketFile, setDocketFile] = useState<File | null>(null);
  const [existingDocketFileUrl, setExistingDocketFileUrl] = useState(
    toStringValue(initialDocket?.docket_file_url)
  );

  const [labourRows, setLabourRows] = useState<LabourRow[]>(
    initialLabourRows && initialLabourRows.length > 0
      ? initialLabourRows
      : [{ worker_name: "", time_in: "", time_out: "", total_hours: "" }]
  );

  const [progressRows, setProgressRows] = useState<ProgressRow[]>(
    initialProgressRows && initialProgressRows.length > 0
      ? initialProgressRows
      : DEFAULT_PROGRESS_ROWS
  );

  const [saving, setSaving] = useState(false);

  const locked = useMemo(
    () => isSignedDocket({ client_rep_name: clientRepName, signed_date: signedDate }),
    [clientRepName, signedDate]
  );

  const totalAssemblyPercent = useMemo(() => {
    if (progressRows.length === 0) return 0;
    const weight = 100 / progressRows.length;

    const total = progressRows.reduce((sum, row) => {
      const rowPercent = Math.max(0, Math.min(100, Number(row.assembled_qty || 0)));
      return sum + (rowPercent / 100) * weight;
    }, 0);

    return Math.round(total);
  }, [progressRows]);

  const totalErectionPercent = useMemo(() => {
    if (progressRows.length === 0) return 0;
    const weight = 100 / progressRows.length;

    const total = progressRows.reduce((sum, row) => {
      const rowPercent = Math.max(0, Math.min(100, Number(row.erected_qty || 0)));
      return sum + (rowPercent / 100) * weight;
    }, 0);

    return Math.round(total);
  }, [progressRows]);

  const displayProgress = useMemo(() => {
    return Math.max(totalAssemblyPercent, totalErectionPercent);
  }, [totalAssemblyPercent, totalErectionPercent]);

  function addLabourRow() {
    setLabourRows((prev) => [
      ...prev,
      { worker_name: "", time_in: "", time_out: "", total_hours: "" },
    ]);
  }

  function updateLabourRow(index: number, key: keyof LabourRow, value: string) {
    setLabourRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: value } : row))
    );
  }

  function removeLabourRow(index: number) {
    setLabourRows((prev) => prev.filter((_, i) => i !== index));
  }

  function updateProgressRow(index: number, key: keyof ProgressRow, value: string) {
    const nextValue = key === "section_label" ? value : clampPercent(value);

    setProgressRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: nextValue } : row))
    );
  }

  async function uploadFileIfNeeded() {
    if (!docketFile) return existingDocketFileUrl || null;

    const safeName = docketFile.name.replace(/\s+/g, "_");
    const path = `dockets/${projectId}/${towerId}/${Date.now()}_${safeName}`;

    const uploadRes = await supabase.storage
      .from("tower-files")
      .upload(path, docketFile, { upsert: true });

    if (uploadRes.error) {
      throw new Error("Failed to upload docket file");
    }

    const publicUrlRes = supabase.storage.from("tower-files").getPublicUrl(path);
    return publicUrlRes.data.publicUrl;
  }

  function buildTowerStatus() {
    if (totalErectionPercent >= 100) return "Complete";
    if (totalErectionPercent > 0) return "Erection Started";
    if (totalAssemblyPercent > 0) return "Assembly Started";
    return "Not Started";
  }

  async function handleCreate() {
    const docketFileUrl = await uploadFileIfNeeded();

    const { data: docket, error: docketError } = await supabase
      .from("tower_daily_dockets")
      .insert({
        project_id: projectId,
        tower_id: towerId,
        docket_date: docketDate,
        crew: crewName,
        leading_hand: leadingHand,
        weather,
        assembly_percent: totalAssemblyPercent,
        erection_percent: totalErectionPercent,
        weather_delay_hours: Number(weatherDelayHours || 0),
        lightning_delay_hours: Number(lightningDelayHours || 0),
        toolbox_delay_hours: Number(toolboxDelayHours || 0),
        other_delay_hours: Number(otherDelayHours || 0),
        other_delay_reason: otherDelayReason,
        delays_comments: delaysComments,
        missing_items_bolts: missingItemsBolts,
        bc_rep_name: bcRepName,
        client_rep_name: clientRepName,
        signed_date: signedDate || null,
        docket_file_url: docketFileUrl,
      })
      .select()
      .single();

    if (docketError || !docket) {
      throw new Error("Failed to save daily docket");
    }

    const labourPayload = labourRows
      .filter((row) => row.worker_name.trim())
      .map((row) => ({
        docket_id: docket.id,
        worker_name: row.worker_name,
        time_in: row.time_in || null,
        time_out: row.time_out || null,
        total_hours: Number(row.total_hours || 0),
      }));

    if (labourPayload.length > 0) {
      const labourRes = await supabase.from("tower_docket_labour").insert(labourPayload);
      if (labourRes.error) {
        throw new Error("Daily docket saved, but labour rows failed.");
      }
    }

    const progressPayload = progressRows.map((row) => ({
      docket_id: docket.id,
      section: row.section_label,
      section_label: row.section_label,
      assembled_qty: Number(row.assembled_qty || 0),
      erected_qty: Number(row.erected_qty || 0),
    }));

    if (progressPayload.length > 0) {
      const progressRes = await supabase
        .from("tower_docket_progress")
        .insert(progressPayload);

      if (progressRes.error) {
        throw new Error("Daily docket saved, but progress rows failed.");
      }
    }

    const towerStatus = buildTowerStatus();

    const towerUpdateRes = await supabase
      .from("towers")
      .update({
        progress: displayProgress,
        status: towerStatus,
        last_docket_date: docketDate || null,
      })
      .eq("id", towerId);

    if (towerUpdateRes.error) {
      throw new Error("Docket saved, but tower status/progress failed to update.");
    }

    router.push(`/project/${projectId}/tower/${towerId}/docket/${docket.id}`);
  }

  async function handleUpdate() {
    if (!docketId) throw new Error("Missing docket id");

    const { data: existing, error: existingError } = await supabase
      .from("tower_daily_dockets")
      .select("id, client_rep_name, signed_date")
      .eq("id", docketId)
      .single();

    if (existingError || !existing) {
      throw new Error("Could not load docket for editing.");
    }

    if (isSignedDocket(existing)) {
      throw new Error("This docket is signed and cannot be edited.");
    }

    const docketFileUrl = await uploadFileIfNeeded();

    const updateRes = await supabase
      .from("tower_daily_dockets")
      .update({
        docket_date: docketDate,
        crew: crewName,
        leading_hand: leadingHand,
        weather,
        assembly_percent: totalAssemblyPercent,
        erection_percent: totalErectionPercent,
        weather_delay_hours: Number(weatherDelayHours || 0),
        lightning_delay_hours: Number(lightningDelayHours || 0),
        toolbox_delay_hours: Number(toolboxDelayHours || 0),
        other_delay_hours: Number(otherDelayHours || 0),
        other_delay_reason: otherDelayReason,
        delays_comments: delaysComments,
        missing_items_bolts: missingItemsBolts,
        bc_rep_name: bcRepName,
        client_rep_name: clientRepName,
        signed_date: signedDate || null,
        docket_file_url: docketFileUrl,
      })
      .eq("id", docketId);

    if (updateRes.error) {
      throw new Error("Failed to update docket.");
    }

    const deleteLabourRes = await supabase
      .from("tower_docket_labour")
      .delete()
      .eq("docket_id", docketId);

    if (deleteLabourRes.error) {
      throw new Error("Failed to refresh labour rows.");
    }

    const deleteProgressRes = await supabase
      .from("tower_docket_progress")
      .delete()
      .eq("docket_id", docketId);

    if (deleteProgressRes.error) {
      throw new Error("Failed to refresh progress rows.");
    }

    const labourPayload = labourRows
      .filter((row) => row.worker_name.trim())
      .map((row) => ({
        docket_id: docketId,
        worker_name: row.worker_name,
        time_in: row.time_in || null,
        time_out: row.time_out || null,
        total_hours: Number(row.total_hours || 0),
      }));

    if (labourPayload.length > 0) {
      const labourInsertRes = await supabase
        .from("tower_docket_labour")
        .insert(labourPayload);

      if (labourInsertRes.error) {
        throw new Error("Failed to save labour rows.");
      }
    }

    const progressPayload = progressRows.map((row) => ({
      docket_id: docketId,
      section: row.section_label,
      section_label: row.section_label,
      assembled_qty: Number(row.assembled_qty || 0),
      erected_qty: Number(row.erected_qty || 0),
    }));

    if (progressPayload.length > 0) {
      const progressInsertRes = await supabase
        .from("tower_docket_progress")
        .insert(progressPayload);

      if (progressInsertRes.error) {
        throw new Error("Failed to save progress rows.");
      }
    }

    const towerStatus = buildTowerStatus();

    const towerUpdateRes = await supabase
      .from("towers")
      .update({
        progress: displayProgress,
        status: towerStatus,
        last_docket_date: docketDate || null,
      })
      .eq("id", towerId);

    if (towerUpdateRes.error) {
      throw new Error("Docket updated, but tower status/progress failed to update.");
    }

    router.push(`/project/${projectId}/tower/${towerId}/docket/${docketId}`);
  }

  async function handleSubmit() {
    if (!projectId || !towerId) {
      alert("Invalid route");
      return;
    }

    if (!docketDate) {
      alert("Please enter docket date");
      return;
    }

    if (!leadingHand.trim()) {
      alert("Please enter leading hand name");
      return;
    }

    setSaving(true);

    try {
      if (mode === "create") {
        await handleCreate();
      } else {
        await handleUpdate();
      }
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Something went wrong");
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold">
          {mode === "create" ? "Add Daily Docket" : "Edit Daily Docket"}
        </h1>
        <p className="text-slate-500 mt-1">
          Enter labour, section percentages, delays, and upload the scanned docket.
        </p>
      </div>

      {locked && mode === "edit" && (
        <div className="border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-2xl p-4">
          This docket has been signed by the client and is now locked.
        </div>
      )}

      <section className="bg-white border rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-semibold">Header</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Input
            label="Date"
            type="date"
            value={docketDate}
            onChange={setDocketDate}
            disabled={locked}
          />
          <Input
            label="Crew Name"
            value={crewName}
            onChange={setCrewName}
            disabled={locked}
          />
          <Input
            label="Leading Hand Name"
            value={leadingHand}
            onChange={setLeadingHand}
            disabled={locked}
          />
          <Input
            label="Weather"
            value={weather}
            onChange={setWeather}
            disabled={locked}
          />
        </div>
      </section>

      <section className="bg-white border rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-semibold">Section Quantities</h2>
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="p-3">Section</th>
                <th className="p-3">Assembly %</th>
                <th className="p-3">Erection %</th>
              </tr>
            </thead>
            <tbody>
              {progressRows.map((row, index) => (
                <tr key={index} className="border-t">
                  <td className="p-3">{row.section_label}</td>
                  <td className="p-3">
                    <input
                      className="border rounded-lg p-2 w-full disabled:bg-slate-100"
                      type="number"
                      min="0"
                      max="100"
                      value={row.assembled_qty}
                      disabled={locked}
                      onChange={(e) =>
                        updateProgressRow(index, "assembled_qty", e.target.value)
                      }
                    />
                  </td>
                  <td className="p-3">
                    <input
                      className="border rounded-lg p-2 w-full disabled:bg-slate-100"
                      type="number"
                      min="0"
                      max="100"
                      value={row.erected_qty}
                      disabled={locked}
                      onChange={(e) =>
                        updateProgressRow(index, "erected_qty", e.target.value)
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end gap-10 p-4 bg-slate-50 border-t">
            <div className="text-right">
              <p className="text-sm text-slate-500">Total Assembly</p>
              <p className="text-2xl font-bold">{totalAssemblyPercent}%</p>
            </div>

            <div className="text-right">
              <p className="text-sm text-slate-500">Total Erection</p>
              <p className="text-2xl font-bold">{totalErectionPercent}%</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white border rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-semibold">Delay Hours & Issues</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Input
            label="Weather Delay Hours"
            type="number"
            value={weatherDelayHours}
            onChange={setWeatherDelayHours}
            disabled={locked}
          />
          <Input
            label="Lightning Delay Hours"
            type="number"
            value={lightningDelayHours}
            onChange={setLightningDelayHours}
            disabled={locked}
          />
          <Input
            label="Toolbox Delay Hours"
            type="number"
            value={toolboxDelayHours}
            onChange={setToolboxDelayHours}
            disabled={locked}
          />
          <Input
            label="Other Delay Hours"
            type="number"
            value={otherDelayHours}
            onChange={setOtherDelayHours}
            disabled={locked}
          />
          <Input
            label="Other Delay Reason"
            value={otherDelayReason}
            onChange={setOtherDelayReason}
            disabled={locked}
          />
          <Input
            label="Missing Items / Bolts"
            value={missingItemsBolts}
            onChange={setMissingItemsBolts}
            disabled={locked}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Delay / Site Comments
          </label>
          <textarea
            className="border rounded-lg p-3 w-full min-h-28 disabled:bg-slate-100"
            value={delaysComments}
            disabled={locked}
            onChange={(e) => setDelaysComments(e.target.value)}
          />
        </div>
      </section>

      <section className="bg-white border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Labour</h2>
          {!locked && (
            <button
              type="button"
              onClick={addLabourRow}
              className="bg-slate-900 text-white px-4 py-2 rounded-lg"
            >
              Add Worker
            </button>
          )}
        </div>

        <div className="space-y-4">
          {labourRows.map((row, index) => (
            <div
              key={index}
              className="grid md:grid-cols-5 gap-3 items-end border rounded-xl p-4"
            >
              <Input
                label="Worker Name"
                value={row.worker_name}
                disabled={locked}
                onChange={(value) => updateLabourRow(index, "worker_name", value)}
              />
              <Input
                label="Time In"
                type="time"
                value={row.time_in}
                disabled={locked}
                onChange={(value) => updateLabourRow(index, "time_in", value)}
              />
              <Input
                label="Time Out"
                type="time"
                value={row.time_out}
                disabled={locked}
                onChange={(value) => updateLabourRow(index, "time_out", value)}
              />
              <Input
                label="Total Hours"
                type="number"
                value={row.total_hours}
                disabled={locked}
                onChange={(value) => updateLabourRow(index, "total_hours", value)}
              />
              {!locked ? (
                <button
                  type="button"
                  onClick={() => removeLabourRow(index)}
                  className="border px-4 py-2 rounded-lg h-10"
                >
                  Remove
                </button>
              ) : (
                <div />
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-semibold">Sign-Off & Upload</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Input
            label="BC Rep Name"
            value={bcRepName}
            onChange={setBcRepName}
            disabled={locked}
          />
          <Input
            label="Client Rep Name"
            value={clientRepName}
            onChange={setClientRepName}
            disabled={locked}
          />
          <Input
            label="Signed Date"
            type="date"
            value={signedDate}
            onChange={setSignedDate}
            disabled={locked}
          />
          <div>
            <label className="block text-sm font-medium mb-1">
              Upload Docket Scan
            </label>
            <input
              type="file"
              disabled={locked}
              onChange={(e) => setDocketFile(e.target.files?.[0] || null)}
              className="border rounded-lg p-2 w-full disabled:bg-slate-100"
            />
            {existingDocketFileUrl && (
              <a
                href={existingDocketFileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 text-sm font-medium mt-2 inline-block"
              >
                Open current uploaded docket
              </a>
            )}
          </div>
        </div>
      </section>

      <div className="flex gap-3">
        {!locked && (
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="bg-blue-600 text-white px-6 py-3 rounded-xl"
          >
            {saving
              ? mode === "create"
                ? "Saving..."
                : "Updating..."
              : mode === "create"
              ? "Save Daily Docket"
              : "Update Daily Docket"}
          </button>
        )}

        <button
          type="button"
          onClick={() =>
            mode === "create"
              ? router.push(`/project/${projectId}/tower/${towerId}`)
              : router.push(
                  `/project/${projectId}/tower/${towerId}/docket/${docketId}`
                )
          }
          className="border px-6 py-3 rounded-xl"
        >
          {locked ? "Back" : "Cancel"}
        </button>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        className="border rounded-lg p-2 w-full disabled:bg-slate-100"
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}