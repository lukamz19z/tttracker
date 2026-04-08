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

function isClientSignedDocket(docket: {
  client_rep_name?: string | null;
  signed_date?: string | null;
}) {
  return Boolean(
    docket.client_rep_name?.trim() && docket.signed_date?.trim()
  );
}

function calculateHours(timeIn: string, timeOut: string) {
  if (!timeIn || !timeOut) return "";

  const [h1, m1] = timeIn.split(":").map(Number);
  const [h2, m2] = timeOut.split(":").map(Number);

  if (
    Number.isNaN(h1) ||
    Number.isNaN(m1) ||
    Number.isNaN(h2) ||
    Number.isNaN(m2)
  ) {
    return "";
  }

  let diffMinutes = h2 * 60 + m2 - (h1 * 60 + m1);
  if (diffMinutes < 0) diffMinutes += 24 * 60;

  return (diffMinutes / 60).toFixed(2);
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
  mode: "create" | "edit" | "view";
  projectId: string;
  towerId: string;
  docketId?: string;
  initialDocket?: Partial<DocketRecord> | null;
  initialLabourRows?: LabourRow[];
  initialProgressRows?: ProgressRow[];
}) {
  const router = useRouter();
  const supabase = createSupabaseBrowser();

  const isView = mode === "view";

  const [docketDate, setDocketDate] = useState(
    toStringValue(initialDocket?.docket_date)
  );
  const [crewName, setCrewName] = useState(toStringValue(initialDocket?.crew));
  const [leadingHand, setLeadingHand] = useState(
    toStringValue(initialDocket?.leading_hand)
  );
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
  const [bcRepName, setBcRepName] = useState(
    toStringValue(initialDocket?.bc_rep_name)
  );
  const [clientRepName, setClientRepName] = useState(
    toStringValue(initialDocket?.client_rep_name)
  );
  const [signedDate, setSignedDate] = useState(
    toStringValue(initialDocket?.signed_date)
  );
  const [docketFile, setDocketFile] = useState<File | null>(null);
  const [existingDocketFileUrl, setExistingDocketFileUrl] = useState(
    toStringValue(initialDocket?.docket_file_url)
  );
  const [bulkTimeIn, setBulkTimeIn] = useState("");
const [bulkTimeOut, setBulkTimeOut] = useState("");

  const [labourRows, setLabourRows] = useState<LabourRow[]>(
    initialLabourRows && initialLabourRows.length > 0
      ? initialLabourRows.map((r) => ({
          worker_name: toStringValue(r.worker_name),
          time_in: toStringValue(r.time_in),
          time_out: toStringValue(r.time_out),
          total_hours: toStringValue(r.total_hours),
        }))
      : [{ worker_name: "", time_in: "", time_out: "", total_hours: "" }]
  );

  const [progressRows, setProgressRows] = useState<ProgressRow[]>(
    initialProgressRows && initialProgressRows.length > 0
      ? initialProgressRows.map((r) => ({
          section_label: toStringValue(r.section_label),
          assembled_qty: toStringValue(r.assembled_qty),
          erected_qty: toStringValue(r.erected_qty),
        }))
      : DEFAULT_PROGRESS_ROWS
  );

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!docketId && !initialDocket) return;

    async function loadDocket() {
      if (initialDocket) {
        setDocketDate(toStringValue(initialDocket.docket_date));
        setCrewName(toStringValue(initialDocket.crew));
        setLeadingHand(toStringValue(initialDocket.leading_hand));
        setWeather(toStringValue(initialDocket.weather));

        setWeatherDelayHours(toStringValue(initialDocket.weather_delay_hours));
        setLightningDelayHours(
          toStringValue(initialDocket.lightning_delay_hours)
        );
        setToolboxDelayHours(toStringValue(initialDocket.toolbox_delay_hours));
        setOtherDelayHours(toStringValue(initialDocket.other_delay_hours));
        setOtherDelayReason(toStringValue(initialDocket.other_delay_reason));
        setMissingItemsBolts(toStringValue(initialDocket.missing_items_bolts));
        setDelaysComments(toStringValue(initialDocket.delays_comments));

        setBcRepName(toStringValue(initialDocket.bc_rep_name));
        setClientRepName(toStringValue(initialDocket.client_rep_name));
        setSignedDate(toStringValue(initialDocket.signed_date));
        setExistingDocketFileUrl(toStringValue(initialDocket.docket_file_url));

        if (initialLabourRows?.length) {
          setLabourRows(
            initialLabourRows.map((r) => ({
              worker_name: toStringValue(r.worker_name),
              time_in: toStringValue(r.time_in),
              time_out: toStringValue(r.time_out),
              total_hours: toStringValue(r.total_hours),
            }))
          );
        }

        if (initialProgressRows?.length) {
          setProgressRows(
            initialProgressRows.map((r) => ({
              section_label: toStringValue(r.section_label),
              assembled_qty: toStringValue(r.assembled_qty),
              erected_qty: toStringValue(r.erected_qty),
            }))
          );
        }

        return;
      }

      const { data } = await supabase
        .from("tower_daily_dockets")
        .select("*")
        .eq("id", docketId)
        .single();

      if (!data) return;

      setDocketDate(toStringValue(data.docket_date));
      setCrewName(toStringValue(data.crew));
      setLeadingHand(toStringValue(data.leading_hand));
      setWeather(toStringValue(data.weather));

      setWeatherDelayHours(toStringValue(data.weather_delay_hours));
      setLightningDelayHours(toStringValue(data.lightning_delay_hours));
      setToolboxDelayHours(toStringValue(data.toolbox_delay_hours));
      setOtherDelayHours(toStringValue(data.other_delay_hours));
      setOtherDelayReason(toStringValue(data.other_delay_reason));
      setMissingItemsBolts(toStringValue(data.missing_items_bolts));
      setDelaysComments(toStringValue(data.delays_comments));

      setBcRepName(toStringValue(data.bc_rep_name));
      setClientRepName(toStringValue(data.client_rep_name));
      setSignedDate(toStringValue(data.signed_date));
      setExistingDocketFileUrl(toStringValue(data.docket_file_url));

      const { data: labour } = await supabase
        .from("tower_docket_labour")
        .select("*")
        .eq("docket_id", docketId);

      if (labour && labour.length > 0) {
        setLabourRows(
          labour.map((r) => ({
            worker_name: toStringValue(r.worker_name),
            time_in: toStringValue(r.time_in),
            time_out: toStringValue(r.time_out),
            total_hours: toStringValue(r.total_hours),
          }))
        );
      }

      const { data: progress } = await supabase
        .from("tower_docket_progress")
        .select("*")
        .eq("docket_id", docketId);

      if (progress && progress.length > 0) {
        setProgressRows(
          progress.map((r) => ({
            section_label: toStringValue(r.section_label),
            assembled_qty: toStringValue(r.assembled_qty),
            erected_qty: toStringValue(r.erected_qty),
          }))
        );
      }
    }

    loadDocket();
  }, [
    docketId,
    initialDocket,
    initialLabourRows,
    initialProgressRows,
    supabase,
  ]);

  const locked = useMemo(
    () =>
      isClientSignedDocket({
        client_rep_name: clientRepName,
        signed_date: signedDate,
      }),
    [clientRepName, signedDate]
  );

  const totalAssemblyPercent = useMemo(() => {
    if (progressRows.length === 0) return 0;
    const weight = 100 / progressRows.length;

    const total = progressRows.reduce((sum, row) => {
      const rowPercent = Math.max(
        0,
        Math.min(100, Number(row.assembled_qty || 0))
      );
      return sum + (rowPercent / 100) * weight;
    }, 0);

    return Math.round(total);
  }, [progressRows]);

  const totalErectionPercent = useMemo(() => {
    if (progressRows.length === 0) return 0;
    const weight = 100 / progressRows.length;

    const total = progressRows.reduce((sum, row) => {
      const rowPercent = Math.max(
        0,
        Math.min(100, Number(row.erected_qty || 0))
      );
      return sum + (rowPercent / 100) * weight;
    }, 0);

    return Math.round(total);
  }, [progressRows]);

  const displayProgress = useMemo(() => {
    return Math.round(totalAssemblyPercent * 0.5 + totalErectionPercent * 0.5);
  }, [totalAssemblyPercent, totalErectionPercent]);

  const totalLabourHours = useMemo(() => {
    return labourRows.reduce((sum, row) => {
      return sum + (Number(row.total_hours) || 0);
    }, 0);
  }, [labourRows]);

  function buildTowerStatus(progress: number) {
    if (progress >= 100) return "Complete";
    if (progress > 0) return "In Progress";
    return "Not Started";
  }

  async function recalcTowerProgressAndStatus() {
    const { data, error } = await supabase
      .from("tower_daily_dockets")
      .select("assembly_percent, erection_percent")
      .eq("tower_id", towerId);

    if (error) {
      throw new Error("Failed to recalculate tower progress.");
    }

    const maxProgress =
      data?.reduce((max, d) => {
        const assembly = Number(d.assembly_percent || 0);
        const erection = Number(d.erection_percent || 0);
        const docketProgress = Math.max(assembly, erection);
        return Math.max(max, docketProgress);
      }, 0) ?? 0;

    const status = buildTowerStatus(maxProgress);

    const towerUpdateRes = await supabase
      .from("towers")
      .update({
        progress: Math.round(maxProgress),
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", towerId);

    if (towerUpdateRes.error) {
      throw new Error("Docket saved, but tower status/progress failed to update.");
    }
  }

  function addLabourRow() {
    setLabourRows((prev) => [
      ...prev,
      { worker_name: "", time_in: "", time_out: "", total_hours: "" },
    ]);
  }

  function removeLabourRow(index: number) {
    setLabourRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0
        ? next
        : [{ worker_name: "", time_in: "", time_out: "", total_hours: "" }];
    });
  }

  function focusById(id?: string) {
    if (!id) return;
    window.setTimeout(() => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      el?.focus();
      el?.select?.();
    }, 0);
  }

  function handleLabourKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    nextId?: string
  ) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    focusById(nextId);
  }

  function updateLabourRow(index: number, key: keyof LabourRow, value: string) {
    if (isView || locked) return;

    setLabourRows((prev) => {
      const updated = prev.map((row, i) =>
        i === index ? { ...row, [key]: value } : row
      );

      const current = updated[index];

      if (key === "time_in" || key === "time_out") {
        const autoHours = calculateHours(current.time_in, current.time_out);
        current.total_hours = autoHours || current.total_hours;
      }

      const last = updated[updated.length - 1];
      const hasBlankRow = updated.some(
        (row, i) =>
          i !== updated.length - 1 &&
          !row.worker_name &&
          !row.time_in &&
          !row.time_out &&
          !row.total_hours
      );

      if (
        last.worker_name.trim() &&
        last.time_in.trim() &&
        last.time_out.trim() &&
        last.total_hours.trim() &&
        !hasBlankRow
      ) {
        updated.push({
          worker_name: "",
          time_in: "",
          time_out: "",
          total_hours: "",
        });
      }

      return updated;
    });
  }

  function updateProgressRow(index: number, key: keyof ProgressRow, value: string) {
    if (isView || locked) return;
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
        signed_date: null,
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

    await recalcTowerProgressAndStatus();

    router.push(`/project/${projectId}/tower/${towerId}/dockets`);
    router.refresh();
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

    if (isClientSignedDocket(existing)) {
      throw new Error("This docket is client signed and cannot be edited.");
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
        signed_date: existing.signed_date,
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

    await recalcTowerProgressAndStatus();

    router.push(`/project/${projectId}/tower/${towerId}/dockets`);
    router.refresh();
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
      } else if (mode === "edit") {
        await handleUpdate();
      }
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Something went wrong");
      setSaving(false);
    }
  }

  async function prefillFromLastDocket() {
    try {
      const { data: lastDocket } = await supabase
        .from("tower_daily_dockets")
        .select("*")
        .eq("tower_id", towerId)
        .order("docket_date", { ascending: false })
        .limit(1)
        .single();

      if (!lastDocket) {
        alert("No previous docket found");
        return;
      }

      const { data: labour } = await supabase
        .from("tower_docket_labour")
        .select("*")
        .eq("docket_id", lastDocket.id);

      const { data: progress } = await supabase
        .from("tower_docket_progress")
        .select("*")
        .eq("docket_id", lastDocket.id);

      const nextDate = lastDocket.docket_date
        ? (() => {
            const d = new Date(lastDocket.docket_date);
            d.setDate(d.getDate() + 1);
            return d.toISOString().slice(0, 10);
          })()
        : "";

      setDocketDate(nextDate);
      setCrewName(toStringValue(lastDocket.crew));
      setLeadingHand(toStringValue(lastDocket.leading_hand));
      setWeather(toStringValue(lastDocket.weather));

      setWeatherDelayHours(toStringValue(lastDocket.weather_delay_hours));
      setLightningDelayHours(toStringValue(lastDocket.lightning_delay_hours));
      setToolboxDelayHours(toStringValue(lastDocket.toolbox_delay_hours));
      setOtherDelayHours(toStringValue(lastDocket.other_delay_hours));
      setOtherDelayReason(toStringValue(lastDocket.other_delay_reason));
      setMissingItemsBolts(toStringValue(lastDocket.missing_items_bolts));
      setDelaysComments(toStringValue(lastDocket.delays_comments));

      setBcRepName("");
      setClientRepName("");
      setSignedDate("");
      setDocketFile(null);
      setExistingDocketFileUrl("");

      if (labour && labour.length > 0) {
        setLabourRows([
          ...labour.map((r) => ({
            worker_name: toStringValue(r.worker_name),
            time_in: toStringValue(r.time_in),
            time_out: toStringValue(r.time_out),
            total_hours: toStringValue(r.total_hours),
          })),
          { worker_name: "", time_in: "", time_out: "", total_hours: "" },
        ]);
      } else {
        setLabourRows([
          { worker_name: "", time_in: "", time_out: "", total_hours: "" },
        ]);
      }

      if (progress && progress.length > 0) {
        setProgressRows(
          progress.map((r) => ({
            section_label: toStringValue(r.section_label),
            assembled_qty: toStringValue(r.assembled_qty),
            erected_qty: toStringValue(r.erected_qty),
          }))
        );
      } else {
        setProgressRows(DEFAULT_PROGRESS_ROWS);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to prefill docket");
    }
  }
// 🔥 ADD THIS HERE (above return)

function applyBulkTimes() {
  setLabourRows((prev) =>
    prev.map((row) => {
      const time_in = bulkTimeIn || row.time_in;
      const time_out = bulkTimeOut || row.time_out;

      return {
        ...row,
        time_in,
        time_out,
        total_hours: calculateHours(time_in, time_out) || row.total_hours,
      };
    })
  );
}

// ⬇️ your existing return starts here
return (


    <div className="p-8 max-w-6xl space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">
            {mode === "create"
              ? "Add Daily Docket"
              : mode === "edit"
              ? "Edit Daily Docket"
              : "View Daily Docket"}
          </h1>
          <p className="text-slate-500 mt-1">
            Enter labour, section percentages, delays, and upload the scanned docket.
          </p>
        </div>

        <div className="flex gap-2">
          {mode === "create" && !isView && !locked && (
            <button
              type="button"
              onClick={prefillFromLastDocket}
              className="bg-slate-700 text-white px-5 py-3 rounded-xl"
            >
              Prefill Yesterday
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              router.push(`/project/${projectId}/tower/${towerId}/dockets`)
            }
            className="border px-5 py-3 rounded-xl"
          >
            ← Back
          </button>
        </div>
      </div>

      {locked && mode === "edit" && (
        <div className="border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-2xl p-4">
          This docket has been client signed and is now locked.
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
            disabled={locked || isView}
          />
          <Input
            label="Crew Name"
            value={crewName}
            onChange={setCrewName}
            disabled={locked || isView}
          />
          <Input
            label="Leading Hand Name"
            value={leadingHand}
            onChange={setLeadingHand}
            disabled={locked || isView}
          />
          <Input
            label="Weather"
            value={weather}
            onChange={setWeather}
            disabled={locked || isView}
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
                      disabled={locked || isView}
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
                      disabled={locked || isView}
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

            <div className="text-right">
              <p className="text-sm text-slate-500">Tower Progress Used</p>
              <p className="text-2xl font-bold">{displayProgress}%</p>
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
            disabled={locked || isView}
          />
          <Input
            label="Lightning Delay Hours"
            type="number"
            value={lightningDelayHours}
            onChange={setLightningDelayHours}
            disabled={locked || isView}
          />
          <Input
            label="Toolbox Delay Hours"
            type="number"
            value={toolboxDelayHours}
            onChange={setToolboxDelayHours}
            disabled={locked || isView}
          />
          <Input
            label="Other Delay Hours"
            type="number"
            value={otherDelayHours}
            onChange={setOtherDelayHours}
            disabled={locked || isView}
          />
          <Input
            label="Other Delay Reason"
            value={otherDelayReason}
            onChange={setOtherDelayReason}
            disabled={locked || isView}
          />
          <Input
            label="Missing Items / Bolts"
            value={missingItemsBolts}
            onChange={setMissingItemsBolts}
            disabled={locked || isView}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Delay / Site Comments
          </label>
          <textarea
            className="border rounded-lg p-3 w-full min-h-28 disabled:bg-slate-100"
            value={delaysComments}
            disabled={locked || isView}
            onChange={(e) => setDelaysComments(e.target.value)}
          />
        </div>
      </section>

<section className="bg-white border rounded-2xl p-6 space-y-4">

  <div className="flex items-center justify-between">
    <h2 className="text-xl font-semibold">Labour</h2>

    <div className="flex items-center gap-4">
      <div className="text-right">
        <p className="text-sm text-slate-500">Total Labour Hours</p>
        <p className="text-2xl font-bold">{totalLabourHours.toFixed(2)}</p>
      </div>

      {!locked && !isView && (
        <button
          type="button"
          onClick={addLabourRow}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg"
        >
          Add Worker
        </button>
      )}
    </div>
  </div>

  {/* 🔥 ADD BULK TIME SECTION HERE */}
  {!locked && !isView && (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
      <input
        type="time"
        value={bulkTimeIn}
        onChange={(e) => setBulkTimeIn(e.target.value)}
        className="border p-2 rounded text-sm"
      />

      <input
        type="time"
        value={bulkTimeOut}
        onChange={(e) => setBulkTimeOut(e.target.value)}
        className="border p-2 rounded text-sm"
      />

      <button
        type="button"
        onClick={applyBulkTimes}
        className="bg-slate-800 text-white rounded p-2 text-sm"
      >
        Apply to All
      </button>
    </div>
  )}

  {/* 👇 EXISTING LABOUR ROWS (DO NOT TOUCH) */}



        <div className="space-y-4">
          {labourRows.map((row, index) => (
            <div
              key={index}
             className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end border rounded-xl p-3"
            >
              <div>
                <label className="block text-sm font-medium mb-1">Worker Name</label>
                <input
                  id={`labour-name-${index}`}
                 className="border rounded-lg p-2 text-sm w-full disabled:bg-slate-100"
                  value={row.worker_name}
                  disabled={locked || isView}
                  placeholder="Name"
                  onKeyDown={(e) =>
                    handleLabourKeyDown(e, `labour-timein-${index}`)
                  }
                  onChange={(e) =>
                    updateLabourRow(index, "worker_name", e.target.value)
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Time In</label>
                <input
                  id={`labour-timein-${index}`}
                  className="border rounded-lg p-2 text-sm w-full disabled:bg-slate-100"
                  type="time"
                  value={row.time_in}
                  disabled={locked || isView}
                  onKeyDown={(e) =>
                    handleLabourKeyDown(e, `labour-timeout-${index}`)
                  }
                  onChange={(e) =>
                    updateLabourRow(index, "time_in", e.target.value)
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Time Out</label>
                <input
                  id={`labour-timeout-${index}`}
                  className="border rounded-lg p-2 text-sm w-full disabled:bg-slate-100"
                  type="time"
                  value={row.time_out}
                  disabled={locked || isView}
                  onKeyDown={(e) =>
                    handleLabourKeyDown(e, `labour-hours-${index}`)
                  }
                  onChange={(e) =>
                    updateLabourRow(index, "time_out", e.target.value)
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Total Hours</label>
                <input
                  id={`labour-hours-${index}`}
                  className="border rounded-lg p-2 text-sm w-full disabled:bg-slate-100"
                  type="number"
                  step="0.01"
                  value={row.total_hours}
                  disabled={locked || isView}
                  placeholder="Hours"
                  onKeyDown={(e) =>
                    handleLabourKeyDown(e, `labour-name-${index + 1}`)
                  }
                  onChange={(e) =>
                    updateLabourRow(index, "total_hours", e.target.value)
                  }
                />
              </div>

              {!locked && !isView ? (
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
            disabled={locked || isView}
          />
          <Input
            label="Client Rep Name"
            value={clientRepName}
            onChange={setClientRepName}
            disabled={locked || isView}
          />
          <Input
            label="Signed Date"
            type="date"
            value={signedDate}
            onChange={setSignedDate}
            disabled
          />
          <div>
            <label className="block text-sm font-medium mb-1">
              Upload Docket Scan
            </label>
            <input
              type="file"
              disabled={locked || isView}
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
        {!locked && !isView && (
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
            router.push(`/project/${projectId}/tower/${towerId}/dockets`)
          }
          className="border px-6 py-3 rounded-xl"
        >
          {locked || isView ? "Back" : "Cancel"}
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