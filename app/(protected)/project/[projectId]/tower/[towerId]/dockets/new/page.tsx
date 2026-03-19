"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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

export default function NewDailyDocketPage() {
  const params = useParams();
  const router = useRouter();

  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const [docketDate, setDocketDate] = useState("");
  const [crewName, setCrewName] = useState("");
  const [leadingHand, setLeadingHand] = useState("");
  const [weather, setWeather] = useState("");
  const [assemblyPercent, setAssemblyPercent] = useState("");
  const [erectionPercent, setErectionPercent] = useState("");
  const [weatherDelayHours, setWeatherDelayHours] = useState("");
  const [lightningDelayHours, setLightningDelayHours] = useState("");
  const [toolboxDelayHours, setToolboxDelayHours] = useState("");
  const [otherDelayHours, setOtherDelayHours] = useState("");
  const [otherDelayReason, setOtherDelayReason] = useState("");
  const [missingItemsBolts, setMissingItemsBolts] = useState("");
  const [delaysComments, setDelaysComments] = useState("");
  const [bcRepName, setBcRepName] = useState("");
  const [clientRepName, setClientRepName] = useState("");
  const [signedDate, setSignedDate] = useState("");
  const [docketFile, setDocketFile] = useState<File | null>(null);

  const [labourRows, setLabourRows] = useState<LabourRow[]>([
    { worker_name: "", time_in: "", time_out: "", total_hours: "" },
  ]);

  const [progressRows, setProgressRows] =
    useState<ProgressRow[]>(DEFAULT_PROGRESS_ROWS);

  const [saving, setSaving] = useState(false);

  const displayProgress = useMemo(() => {
    const assembly = Number(assemblyPercent || 0);
    const erection = Number(erectionPercent || 0);
    return Math.max(assembly, erection);
  }, [assemblyPercent, erectionPercent]);

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

  function updateProgressRow(
    index: number,
    key: keyof ProgressRow,
    value: string
  ) {
    setProgressRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: value } : row))
    );
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
    const supabase = createSupabaseBrowser();

    let docketFileUrl: string | null = null;

    if (docketFile) {
      const safeName = docketFile.name.replace(/\s+/g, "_");
      const path = `dockets/${projectId}/${towerId}/${Date.now()}_${safeName}`;

      const uploadRes = await supabase.storage
        .from("tower-files")
        .upload(path, docketFile, { upsert: true });

      if (uploadRes.error) {
        console.error(uploadRes.error);
        alert("Failed to upload docket file");
        setSaving(false);
        return;
      }

      const publicUrlRes = supabase.storage
        .from("tower-files")
        .getPublicUrl(path);

      docketFileUrl = publicUrlRes.data.publicUrl;
    }

    const { data: docket, error: docketError } = await supabase
      .from("tower_daily_dockets")
      .insert({
        project_id: projectId,
        tower_id: towerId,
        docket_date: docketDate,
        crew: crewName,
        leading_hand: leadingHand,
        weather,
        assembly_percent: Number(assemblyPercent || 0),
        erection_percent: Number(erectionPercent || 0),
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
      console.error(docketError);
      alert("Failed to save daily docket");
      setSaving(false);
      return;
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
      const labourRes = await supabase
        .from("tower_docket_labour")
        .insert(labourPayload);

      if (labourRes.error) {
        console.error(labourRes.error);
        alert("Daily docket saved, but labour rows failed.");
        setSaving(false);
        return;
      }
    }

    const progressPayload = progressRows
      .filter(
        (row) =>
          row.section_label.trim() &&
          (row.assembled_qty !== "" || row.erected_qty !== "")
      )
      .map((row) => ({
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
        console.error(progressRes.error);
        alert("Daily docket saved, but progress rows failed.");
        setSaving(false);
        return;
      }
    }

    const towerStatus =
      Number(erectionPercent || 0) >= 100
        ? "Complete"
        : Number(erectionPercent || 0) > 0
        ? "Erection Started"
        : Number(assemblyPercent || 0) > 0
        ? "Assembly Started"
        : "Not Started";

    const towerUpdateRes = await supabase
      .from("towers")
      .update({
        progress: displayProgress,
        status: towerStatus,
      })
      .eq("id", towerId);

    if (towerUpdateRes.error) {
      console.error(towerUpdateRes.error);
      alert("Docket saved, but tower status/progress failed to update.");
      setSaving(false);
      return;
    }

    router.push(`/project/${projectId}/tower/${towerId}`);
  }

  return (
    <div className="p-8 max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Add Daily Docket</h1>
        <p className="text-slate-500 mt-1">
          Enter labour, section quantities, delays, and upload the scanned docket.
        </p>
      </div>

      <section className="bg-white border rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-semibold">Header</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Input label="Date" type="date" value={docketDate} onChange={setDocketDate} />
          <Input label="Crew Name" value={crewName} onChange={setCrewName} />
          <Input
            label="Leading Hand Name"
            value={leadingHand}
            onChange={setLeadingHand}
          />
          <Input label="Weather" value={weather} onChange={setWeather} />
          <Input
            label="Assembly %"
            type="number"
            value={assemblyPercent}
            onChange={setAssemblyPercent}
          />
          <Input
            label="Erection %"
            type="number"
            value={erectionPercent}
            onChange={setErectionPercent}
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
                <th className="p-3">Assembled Qty</th>
                <th className="p-3">Erected Qty</th>
              </tr>
            </thead>
            <tbody>
              {progressRows.map((row, index) => (
                <tr key={index} className="border-t">
                  <td className="p-3">{row.section_label}</td>
                  <td className="p-3">
                    <input
                      className="border rounded-lg p-2 w-full"
                      type="number"
                      value={row.assembled_qty}
                      onChange={(e) =>
                        updateProgressRow(index, "assembled_qty", e.target.value)
                      }
                    />
                  </td>
                  <td className="p-3">
                    <input
                      className="border rounded-lg p-2 w-full"
                      type="number"
                      value={row.erected_qty}
                      onChange={(e) =>
                        updateProgressRow(index, "erected_qty", e.target.value)
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
          <Input
            label="Other Delay Hours"
            type="number"
            value={otherDelayHours}
            onChange={setOtherDelayHours}
          />
          <Input
            label="Other Delay Reason"
            value={otherDelayReason}
            onChange={setOtherDelayReason}
          />
          <Input
            label="Missing Items / Bolts"
            value={missingItemsBolts}
            onChange={setMissingItemsBolts}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Delay / Site Comments</label>
          <textarea
            className="border rounded-lg p-3 w-full min-h-28"
            value={delaysComments}
            onChange={(e) => setDelaysComments(e.target.value)}
          />
        </div>
      </section>

      <section className="bg-white border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Labour</h2>
          <button
            type="button"
            onClick={addLabourRow}
            className="bg-slate-900 text-white px-4 py-2 rounded-lg"
          >
            Add Worker
          </button>
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
                onChange={(value) => updateLabourRow(index, "worker_name", value)}
              />
              <Input
                label="Time In"
                type="time"
                value={row.time_in}
                onChange={(value) => updateLabourRow(index, "time_in", value)}
              />
              <Input
                label="Time Out"
                type="time"
                value={row.time_out}
                onChange={(value) => updateLabourRow(index, "time_out", value)}
              />
              <Input
                label="Total Hours"
                type="number"
                value={row.total_hours}
                onChange={(value) => updateLabourRow(index, "total_hours", value)}
              />
              <button
                type="button"
                onClick={() => removeLabourRow(index)}
                className="border px-4 py-2 rounded-lg h-10"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-semibold">Sign-Off & Upload</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Input label="BC Rep Name" value={bcRepName} onChange={setBcRepName} />
          <Input
            label="Client Rep Name"
            value={clientRepName}
            onChange={setClientRepName}
          />
          <Input
            label="Signed Date"
            type="date"
            value={signedDate}
            onChange={setSignedDate}
          />
          <div>
            <label className="block text-sm font-medium mb-1">Upload Docket Scan</label>
            <input
              type="file"
              onChange={(e) => setDocketFile(e.target.files?.[0] || null)}
              className="border rounded-lg p-2 w-full"
            />
          </div>
        </div>
      </section>

      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl"
        >
          {saving ? "Saving..." : "Save Daily Docket"}
        </button>

        <button
          type="button"
          onClick={() => router.push(`/project/${projectId}/tower/${towerId}`)}
          className="border px-6 py-3 rounded-xl"
        >
          Cancel
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        className="border rounded-lg p-2 w-full"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}