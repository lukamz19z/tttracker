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
  lunch_minutes: string;
  travel_in_minutes: string;
  travel_out_minutes: string;
  mobilisation_hours: string;
  delay_hours: string;
  delay_reason: string;
  production_hours: string;
};

type DelayScope = "entire_crew" | "selected_workers";

type DelayType = "weather" | "lightning" | "toolbox" | "mobilisation" | "access" | "plant" | "materials" | "other";

type DelayRow = {
  ui_id: string;
  id?: string;
  delay_type: DelayType;
  delay_reason: string;
  delay_hours: string;
  applies_to: DelayScope;
  worker_names: string[];
};

type DbDelayRow = {
  id?: string;
  docket_id: string;
  delay_type: DelayType | string | null;
  delay_reason: string | null;
  delay_hours: number | null;
  applies_to: DelayScope | string | null;
  worker_names: string[] | null;
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
  lunch_break_minutes?: number | null;
  travel_in_minutes?: number | null;
  travel_out_minutes?: number | null;
  mobilisation_hours?: number | null;
  mobilisation_notes?: string | null;
  raw_manhours?: number | null;
  production_manhours?: number | null;
};

type TowerRecord = {
  id: string;
  extra_data?: Record<string, unknown> | null;
  [key: string]: unknown;
};

const DEFAULT_PROGRESS_ROWS: ProgressRow[] = [
  { section_label: "Legs", assembled_qty: "", erected_qty: "" },
  { section_label: "Body Extensions", assembled_qty: "", erected_qty: "" },
  { section_label: "Common Body", assembled_qty: "", erected_qty: "" },
  { section_label: "Superstructure", assembled_qty: "", erected_qty: "" },
  { section_label: "Crossarms", assembled_qty: "", erected_qty: "" },
];

const BODY_EXTENSION_LABEL = "Body Extensions";

function toStringValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function toNumber(value: string | number | null | undefined) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
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
  return Boolean(docket.client_rep_name?.trim() && docket.signed_date?.trim());
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

function calculateProductionHours(row: LabourRow, appliedDelayHours?: number) {
  const raw = toNumber(row.total_hours);
  const lunch = toNumber(row.lunch_minutes) / 60;
  const travelIn = toNumber(row.travel_in_minutes) / 60;
  const travelOut = toNumber(row.travel_out_minutes) / 60;
  const mobilisation = toNumber(row.mobilisation_hours);
  const delay = appliedDelayHours ?? toNumber(row.delay_hours);

  return Math.max(0, raw - lunch - travelIn - travelOut - mobilisation - delay).toFixed(2);
}

function normalizeWorkerName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function getDuplicateWorkerIndexes(rows: LabourRow[]) {
  const seen = new Map<string, number[]>();

  rows.forEach((row, index) => {
    const key = normalizeWorkerName(row.worker_name);
    if (!key) return;

    const existing = seen.get(key) || [];
    existing.push(index);
    seen.set(key, existing);
  });

  const duplicateIndexes = new Set<number>();

  seen.forEach((indexes) => {
    if (indexes.length > 1) {
      indexes.forEach((i) => duplicateIndexes.add(i));
    }
  });

  return duplicateIndexes;
}

function isBodyExtensionRow(row: ProgressRow) {
  return row.section_label.trim().toLowerCase() === BODY_EXTENSION_LABEL.toLowerCase();
}

function readExtraNumber(extra: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = extra[key];
    if (value === null || value === undefined || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;

    const text = String(value).trim().toLowerCase();
    if (["yes", "y", "true", "included", "include"].includes(text)) return 1;
    if (["no", "n", "false", "none", "nil", "na", "n/a"].includes(text)) return 0;
  }

  return null;
}

function inferTowerHasBodyExtension(tower: TowerRecord | null) {
  const extra = tower?.extra_data || {};

  const value = readExtraNumber(extra, [
    "Body Extension",
    "Body Extensions",
    "Body Extension Height",
    "Body Extension Length",
    "Body Extension Qty",
    "Body Extension Required",
    "BE",
    "BE Height",
    "Extension",
    "Extension Height",
    "body_extension",
    "body_extensions",
    "body_extension_height",
  ]);

  if (value === null) return false;
  return value > 0;
}
function makeUiId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `ui-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function makeLabourRow(row?: Partial<LabourRow> | any): LabourRow {
  const mapped: LabourRow = {
    worker_name: toStringValue(row?.worker_name),
    time_in: toStringValue(row?.time_in),
    time_out: toStringValue(row?.time_out),
    total_hours: toStringValue(row?.total_hours),
    lunch_minutes: toStringValue(row?.lunch_minutes),
    travel_in_minutes: toStringValue(row?.travel_in_minutes),
    travel_out_minutes: toStringValue(row?.travel_out_minutes),
    mobilisation_hours: toStringValue(row?.mobilisation_hours),
    delay_hours: toStringValue(row?.delay_hours),
    delay_reason: toStringValue(row?.delay_reason),
    production_hours: toStringValue(row?.production_hours),
  };

  mapped.production_hours = calculateProductionHours(mapped);
  return mapped;
}

function blankLabourRow(defaults?: {
  lunchBreakMinutes?: string;
  travelInMinutes?: string;
  travelOutMinutes?: string;
  mobilisationHours?: string;
}): LabourRow {
  return makeLabourRow({
    worker_name: "",
    time_in: "",
    time_out: "",
    total_hours: "",
    lunch_minutes: defaults?.lunchBreakMinutes || "",
    travel_in_minutes: defaults?.travelInMinutes || "",
    travel_out_minutes: defaults?.travelOutMinutes || "",
    mobilisation_hours: defaults?.mobilisationHours || "",
    delay_hours: "",
    delay_reason: "",
    production_hours: "",
  });
}

type DelayRowInput = {
  id?: string;
  delay_type?: DelayType | string | null;
  delay_reason?: unknown;
  delay_hours?: unknown;
  applies_to?: DelayScope | string | null;
  worker_names?: string[] | string | null;
};

function makeDelayRow(row?: DelayRowInput): DelayRow {
  const workerNamesValue = row?.worker_names;

  const rawWorkers: string[] = Array.isArray(workerNamesValue)
    ? workerNamesValue
    : typeof workerNamesValue === "string"
    ? workerNamesValue.split(",")
    : [];

  const delayRow: DelayRow = {
    ui_id: makeUiId(),
    id: row?.id,
    delay_type: (row?.delay_type || "weather") as DelayType,
    delay_reason: toStringValue(row?.delay_reason),
    delay_hours: toStringValue(row?.delay_hours),
    applies_to: (row?.applies_to || "entire_crew") as DelayScope,
    worker_names: rawWorkers.map((name) => toStringValue(name).trim()).filter(Boolean),
  };

  return delayRow;
}

function blankDelayRow(): DelayRow {
  return makeDelayRow({
    delay_type: "weather",
    delay_reason: "",
    delay_hours: "",
    applies_to: "entire_crew",
    worker_names: [],
  });
}

function uniqueWorkerNames(rows: LabourRow[]) {
  const seen = new Set<string>();
  const names: string[] = [];

  rows.forEach((row) => {
    const name = row.worker_name.trim();
    const key = normalizeWorkerName(name);
    if (!name || seen.has(key)) return;
    seen.add(key);
    names.push(name);
  });

  return names;
}

function delayAppliesToWorker(delay: DelayRow, workerName: string) {
  if (delay.applies_to === "entire_crew") return true;
  const target = normalizeWorkerName(workerName);
  return delay.worker_names.some((name) => normalizeWorkerName(name) === target);
}

function delayTypeLabel(type: DelayType) {
  switch (type) {
    case "weather":
      return "Weather";
    case "lightning":
      return "Lightning";
    case "toolbox":
      return "Toolbox";
    case "mobilisation":
      return "Mobilisation";
    case "access":
      return "Access / Bogged";
    case "plant":
      return "Plant / Equipment";
    case "materials":
      return "Materials";
    case "other":
    default:
      return "Other";
  }
}

export default function DailyDocketForm({
  mode,
  projectId,
  towerId,
  docketId,
  initialDocket,
  initialLabourRows,
  initialProgressRows,
  initialDelayRows,
}: {
  mode: "create" | "edit" | "view";
  projectId: string;
  towerId: string;
  docketId?: string;
  initialDocket?: Partial<DocketRecord> | null;
  initialLabourRows?: LabourRow[];
  initialProgressRows?: ProgressRow[];
  initialDelayRows?: DelayRow[];
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

  const [lunchBreakMinutes, setLunchBreakMinutes] = useState(
    toStringValue(initialDocket?.lunch_break_minutes)
  );
  const [travelInMinutes, setTravelInMinutes] = useState(
    toStringValue(initialDocket?.travel_in_minutes)
  );
  const [travelOutMinutes, setTravelOutMinutes] = useState(
    toStringValue(initialDocket?.travel_out_minutes)
  );
  const [mobilisationHours, setMobilisationHours] = useState(
    toStringValue(initialDocket?.mobilisation_hours)
  );
  const [mobilisationNotes, setMobilisationNotes] = useState(
    toStringValue(initialDocket?.mobilisation_notes)
  );

  const [labourRows, setLabourRows] = useState<LabourRow[]>(
    initialLabourRows && initialLabourRows.length > 0
      ? initialLabourRows.map((r) => makeLabourRow(r))
      : [blankLabourRow()]
  );

  const [delayRows, setDelayRows] = useState<DelayRow[]>(
    initialDelayRows && initialDelayRows.length > 0
      ? initialDelayRows.map((r) => makeDelayRow(r))
      : []
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

  const [hasBodyExtension, setHasBodyExtension] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadTowerBodyExtensionDefault() {
      if (mode !== "create" || initialProgressRows?.length) return;

      const { data } = await supabase
        .from("towers")
        .select("*")
        .eq("id", towerId)
        .single();

      setHasBodyExtension(inferTowerHasBodyExtension((data as TowerRecord | null) || null));
    }

    void loadTowerBodyExtensionDefault();
  }, [mode, initialProgressRows, supabase, towerId]);

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

        setLunchBreakMinutes(toStringValue(initialDocket.lunch_break_minutes));
        setTravelInMinutes(toStringValue(initialDocket.travel_in_minutes));
        setTravelOutMinutes(toStringValue(initialDocket.travel_out_minutes));
        setMobilisationHours(toStringValue(initialDocket.mobilisation_hours));
        setMobilisationNotes(toStringValue(initialDocket.mobilisation_notes));

        setBcRepName(toStringValue(initialDocket.bc_rep_name));
        setClientRepName(toStringValue(initialDocket.client_rep_name));
        setSignedDate(toStringValue(initialDocket.signed_date));
        setExistingDocketFileUrl(toStringValue(initialDocket.docket_file_url));

        if (initialLabourRows?.length) {
          setLabourRows(initialLabourRows.map((r) => makeLabourRow(r)));
        }

        if (initialDelayRows?.length) {
          setDelayRows(initialDelayRows.map((r) => makeDelayRow(r)));
        }

        if (initialProgressRows?.length) {
          const mappedRows = initialProgressRows.map((r) => ({
            section_label: toStringValue(r.section_label),
            assembled_qty: toStringValue(r.assembled_qty),
            erected_qty: toStringValue(r.erected_qty),
          }));

          setProgressRows(mappedRows);
          setHasBodyExtension(
            mappedRows.some((row) => isBodyExtensionRow(row))
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

      setLunchBreakMinutes(toStringValue(data.lunch_break_minutes));
      setTravelInMinutes(toStringValue(data.travel_in_minutes));
      setTravelOutMinutes(toStringValue(data.travel_out_minutes));
      setMobilisationHours(toStringValue(data.mobilisation_hours));
      setMobilisationNotes(toStringValue(data.mobilisation_notes));

      setBcRepName(toStringValue(data.bc_rep_name));
      setClientRepName(toStringValue(data.client_rep_name));
      setSignedDate(toStringValue(data.signed_date));
      setExistingDocketFileUrl(toStringValue(data.docket_file_url));

      const { data: labour } = await supabase
        .from("tower_docket_labour")
        .select("*")
        .eq("docket_id", docketId);

      if (labour && labour.length > 0) {
        setLabourRows(labour.map((r) => makeLabourRow(r)));
      }

      const { data: delays } = await supabase
        .from("tower_docket_delays")
        .select("*")
        .eq("docket_id", docketId);

      if (delays && delays.length > 0) {
        setDelayRows((delays as DbDelayRow[]).map((r) => makeDelayRow(r)));
      } else if (labour && labour.length > 0) {
        const legacyDelayRows = (labour as any[])
          .filter((r) => Number(r.delay_hours || 0) > 0)
          .map((r) =>
            makeDelayRow({
              delay_type: "other",
              delay_reason: r.delay_reason || "Legacy labour delay",
              delay_hours: r.delay_hours,
              applies_to: "selected_workers",
              worker_names: [r.worker_name],
            }),
          );
        setDelayRows(legacyDelayRows);
      }

      const { data: progress } = await supabase
        .from("tower_docket_progress")
        .select("*")
        .eq("docket_id", docketId);


      if (progress && progress.length > 0) {
        const mappedRows = progress.map((r) => ({
          section_label: toStringValue(r.section_label),
          assembled_qty: toStringValue(r.assembled_qty),
          erected_qty: toStringValue(r.erected_qty),
        }));

        setProgressRows(mappedRows);
        setHasBodyExtension(
          mappedRows.some((row) => isBodyExtensionRow(row))
        );
      }
    }

    loadDocket();
  }, [
    docketId,
    initialDocket,
    initialLabourRows,
    initialProgressRows,
    initialDelayRows,
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

  const duplicateWorkerIndexes = useMemo(() => {
    return getDuplicateWorkerIndexes(labourRows);
  }, [labourRows]);

  const hasDuplicateWorkers = duplicateWorkerIndexes.size > 0;

  const visibleProgressRows = useMemo(() => {
    return progressRows.filter((row) => {
      if (!hasBodyExtension && isBodyExtensionRow(row)) return false;
      return true;
    });
  }, [progressRows, hasBodyExtension]);

  const totalAssemblyPercent = useMemo(() => {
    if (visibleProgressRows.length === 0) return 0;
    const weight = 100 / visibleProgressRows.length;

    const total = visibleProgressRows.reduce((sum, row) => {
      const rowPercent = Math.max(
        0,
        Math.min(100, Number(row.assembled_qty || 0))
      );
      return sum + (rowPercent / 100) * weight;
    }, 0);

    return Math.round(total);
  }, [visibleProgressRows]);

  const totalErectionPercent = useMemo(() => {
    if (visibleProgressRows.length === 0) return 0;
    const weight = 100 / visibleProgressRows.length;

    const total = visibleProgressRows.reduce((sum, row) => {
      const rowPercent = Math.max(
        0,
        Math.min(100, Number(row.erected_qty || 0))
      );
      return sum + (rowPercent / 100) * weight;
    }, 0);

    return Math.round(total);
  }, [visibleProgressRows]);

  const displayProgress = useMemo(() => {
    return Math.round(totalAssemblyPercent * 0.5 + totalErectionPercent * 0.5);
  }, [totalAssemblyPercent, totalErectionPercent]);

  const availableWorkerNames = useMemo(() => uniqueWorkerNames(labourRows), [labourRows]);

  function delayHoursForWorker(workerName: string) {
    if (!workerName.trim()) return 0;
    return delayRows.reduce((sum, delay) => {
      if (!delayAppliesToWorker(delay, workerName)) return sum;
      return sum + toNumber(delay.delay_hours);
    }, 0);
  }

  function delayReasonsForWorker(workerName: string) {
    if (!workerName.trim()) return "";
    return delayRows
      .filter((delay) => delayAppliesToWorker(delay, workerName) && toNumber(delay.delay_hours) > 0)
      .map((delay) => `${delayTypeLabel(delay.delay_type)}: ${delay.delay_reason || "Delay"}`)
      .join("; ");
  }

const labourRowsWithProduction = labourRows.map((row) => {
  const appliedDelayHours = delayHoursForWorker(row.worker_name);

  const next: LabourRow = {
    ...row,
    delay_hours: appliedDelayHours ? appliedDelayHours.toFixed(2) : "",
    delay_reason: delayReasonsForWorker(row.worker_name),
  };

  return {
    ...next,
    production_hours: calculateProductionHours(next, appliedDelayHours),
  };
});

  const totalLabourHours = useMemo(() => {
    return labourRowsWithProduction.reduce((sum, row) => {
      return sum + (Number(row.total_hours) || 0);
    }, 0);
  }, [labourRowsWithProduction]);

  const totalProductionHours = useMemo(() => {
    return labourRowsWithProduction.reduce((sum, row) => {
      return sum + (Number(row.production_hours) || 0);
    }, 0);
  }, [labourRowsWithProduction]);

  const totalLunchHours = useMemo(() => {
    return labourRowsWithProduction.reduce((sum, row) => {
      return sum + toNumber(row.lunch_minutes) / 60;
    }, 0);
  }, [labourRowsWithProduction]);

  const totalTravelHours = useMemo(() => {
    return labourRowsWithProduction.reduce((sum, row) => {
      return sum + (toNumber(row.travel_in_minutes) + toNumber(row.travel_out_minutes)) / 60;
    }, 0);
  }, [labourRowsWithProduction]);

  const totalMobilisationHours = useMemo(() => {
    return labourRowsWithProduction.reduce((sum, row) => {
      return sum + toNumber(row.mobilisation_hours);
    }, 0);
  }, [labourRowsWithProduction]);

  const totalDelayManhours = useMemo(() => {
    return labourRowsWithProduction.reduce((sum, row) => {
      return sum + toNumber(row.delay_hours);
    }, 0);
  }, [labourRowsWithProduction]);

  const totalDelayEvents = useMemo(() => {
    return delayRows.reduce((sum, row) => sum + toNumber(row.delay_hours), 0);
  }, [delayRows]);

  const delaySummaryByType = useMemo(() => {
    return delayRows.reduce(
      (acc, row) => {
        const value = toNumber(row.delay_hours);
        acc[row.delay_type] = (acc[row.delay_type] || 0) + value;
        return acc;
      },
      {} as Record<DelayType, number>,
    );
  }, [delayRows]);

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
      blankLabourRow({
        lunchBreakMinutes,
        travelInMinutes,
        travelOutMinutes,
        mobilisationHours,
      }),
    ]);
  }

  function removeLabourRow(index: number) {
    setLabourRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [blankLabourRow()];
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

      current.production_hours = calculateProductionHours(current);

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
        updated.push(
          blankLabourRow({
            lunchBreakMinutes,
            travelInMinutes,
            travelOutMinutes,
            mobilisationHours,
          })
        );
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

  function handleBodyExtensionToggle(checked: boolean) {
    if (isView || locked) return;

    setHasBodyExtension(checked);

    if (!checked) {
      setProgressRows((prev) =>
        prev.map((row) =>
          isBodyExtensionRow(row)
            ? { ...row, assembled_qty: "", erected_qty: "" }
            : row
        )
      );
    }
  }

  function applyProductionDefaultsToAll() {
    if (isView || locked) return;

    setLabourRows((prev) =>
      prev.map((row) => {
        if (!row.worker_name.trim() && !row.time_in && !row.time_out && !row.total_hours) {
          return row;
        }

        const next = {
          ...row,
          lunch_minutes: lunchBreakMinutes,
          travel_in_minutes: travelInMinutes,
          travel_out_minutes: travelOutMinutes,
          mobilisation_hours: mobilisationHours,
        };

        return {
          ...next,
          production_hours: calculateProductionHours(next, delayHoursForWorker(next.worker_name)),
        };
      })
    );
  }

  function addDelayRow() {
    if (isView || locked) return;
    setDelayRows((prev) => [...prev, blankDelayRow()]);
  }

  function removeDelayRow(index: number) {
    if (isView || locked) return;
    setDelayRows((prev) => prev.filter((_, i) => i !== index));
  }

  function updateDelayRow(index: number, key: keyof DelayRow, value: string | string[]) {
    if (isView || locked) return;

    setDelayRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;

        if (key === "delay_type") {
          return { ...row, delay_type: value as DelayType };
        }

        if (key === "delay_reason") {
          return { ...row, delay_reason: String(value) };
        }

        if (key === "delay_hours") {
          return { ...row, delay_hours: String(value) };
        }

        if (key === "applies_to") {
          const appliesTo = value as DelayScope;
          return {
            ...row,
            applies_to: appliesTo,
            worker_names: appliesTo === "entire_crew" ? [] : row.worker_names,
          };
        }

        if (key === "worker_names") {
          return { ...row, worker_names: Array.isArray(value) ? value : [] };
        }

        return row;
      }),
    );
  }

  function toggleDelayWorker(index: number, workerName: string) {
    if (isView || locked) return;

    setDelayRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const exists = row.worker_names.some(
          (name) => normalizeWorkerName(name) === normalizeWorkerName(workerName),
        );
        return {
          ...row,
          worker_names: exists
            ? row.worker_names.filter(
                (name) => normalizeWorkerName(name) !== normalizeWorkerName(workerName),
              )
            : [...row.worker_names, workerName],
        };
      }),
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

  function buildDocketPayload(docketFileUrl: string | null, existingSignedDate: string | null = null) {
    return {
      docket_date: docketDate,
      crew: crewName,
      leading_hand: leadingHand,
      weather,
      assembly_percent: totalAssemblyPercent,
      erection_percent: totalErectionPercent,
      weather_delay_hours: Number(weatherDelayHours || delaySummaryByType.weather || 0),
      lightning_delay_hours: Number(lightningDelayHours || delaySummaryByType.lightning || 0),
      toolbox_delay_hours: Number(toolboxDelayHours || delaySummaryByType.toolbox || 0),
      other_delay_hours: Number(otherDelayHours || delaySummaryByType.other || 0),
      other_delay_reason: otherDelayReason,
      delays_comments: delaysComments,
      missing_items_bolts: missingItemsBolts,
      lunch_break_minutes: Number(lunchBreakMinutes || 0),
      travel_in_minutes: Number(travelInMinutes || 0),
      travel_out_minutes: Number(travelOutMinutes || 0),
      mobilisation_hours: Number(mobilisationHours || 0),
      mobilisation_notes: mobilisationNotes,
      raw_manhours: totalLabourHours,
      production_manhours: totalProductionHours,
      bc_rep_name: bcRepName,
      client_rep_name: clientRepName,
      signed_date: existingSignedDate,
      docket_file_url: docketFileUrl,
    };
  }

  function buildLabourPayload(docketIdValue: string) {
    return labourRowsWithProduction
      .filter((row) => row.worker_name.trim())
      .map((row) => ({
        docket_id: docketIdValue,
        worker_name: row.worker_name.trim(),
        time_in: row.time_in || null,
        time_out: row.time_out || null,
        total_hours: Number(row.total_hours || 0),
        lunch_minutes: Number(row.lunch_minutes || 0),
        travel_in_minutes: Number(row.travel_in_minutes || 0),
        travel_out_minutes: Number(row.travel_out_minutes || 0),
        mobilisation_hours: Number(row.mobilisation_hours || 0),
        delay_hours: Number(row.delay_hours || 0),
        delay_reason: row.delay_reason || null,
        production_hours: Number(row.production_hours || 0),
      }));
  }

  function buildDelayPayload(docketIdValue: string) {
    return delayRows
      .filter((row) => toNumber(row.delay_hours) > 0 || row.delay_reason.trim())
      .map((row) => ({
        docket_id: docketIdValue,
        delay_type: row.delay_type,
        delay_reason: row.delay_reason || null,
        delay_hours: Number(row.delay_hours || 0),
        applies_to: row.applies_to,
        worker_names: row.applies_to === "selected_workers" ? row.worker_names : [],
      }));
  }

  function buildProgressPayload(docketIdValue: string) {
    return progressRows.map((row) => ({
      docket_id: docketIdValue,
      section: row.section_label,
      section_label: row.section_label,
      assembled_qty:
        !hasBodyExtension && isBodyExtensionRow(row)
          ? 0
          : Number(row.assembled_qty || 0),
      erected_qty:
        !hasBodyExtension && isBodyExtensionRow(row)
          ? 0
          : Number(row.erected_qty || 0),
    }));
  }

  async function handleCreate() {
    const docketFileUrl = await uploadFileIfNeeded();

    const { data: docket, error: docketError } = await supabase
      .from("tower_daily_dockets")
      .insert({
        project_id: projectId,
        tower_id: towerId,
        ...buildDocketPayload(docketFileUrl, null),
      })
      .select()
      .single();

    if (docketError || !docket) {
      throw new Error("Failed to save daily docket");
    }

    const labourPayload = buildLabourPayload(docket.id);

    if (labourPayload.length > 0) {
      const labourRes = await supabase.from("tower_docket_labour").insert(labourPayload);
      if (labourRes.error) {
        throw new Error("Daily docket saved, but labour rows failed. Check that the production hour columns exist on tower_docket_labour.");
      }
    }

    const delayPayload = buildDelayPayload(docket.id);

    if (delayPayload.length > 0) {
      const delayRes = await supabase.from("tower_docket_delays").insert(delayPayload);
      if (delayRes.error) {
        throw new Error("Daily docket saved, but delay rows failed. Check that tower_docket_delays exists.");
      }
    }

    const progressPayload = buildProgressPayload(docket.id);

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
      .update(buildDocketPayload(docketFileUrl, existing.signed_date))
      .eq("id", docketId);

    if (updateRes.error) {
      throw new Error("Failed to update docket. Check that the production manhour columns exist on tower_daily_dockets.");
    }

    const deleteLabourRes = await supabase
      .from("tower_docket_labour")
      .delete()
      .eq("docket_id", docketId);

    if (deleteLabourRes.error) {
      throw new Error("Failed to refresh labour rows.");
    }

    const deleteDelayRes = await supabase
      .from("tower_docket_delays")
      .delete()
      .eq("docket_id", docketId);

    if (deleteDelayRes.error) {
      throw new Error("Failed to refresh delay rows.");
    }

    const deleteProgressRes = await supabase
      .from("tower_docket_progress")
      .delete()
      .eq("docket_id", docketId);

    if (deleteProgressRes.error) {
      throw new Error("Failed to refresh progress rows.");
    }

    const labourPayload = buildLabourPayload(docketId);

    if (labourPayload.length > 0) {
      const labourInsertRes = await supabase
        .from("tower_docket_labour")
        .insert(labourPayload);

      if (labourInsertRes.error) {
        throw new Error("Failed to save labour rows. Check that the production hour columns exist on tower_docket_labour.");
      }
    }

    const delayPayload = buildDelayPayload(docketId);

    if (delayPayload.length > 0) {
      const delayInsertRes = await supabase
        .from("tower_docket_delays")
        .insert(delayPayload);

      if (delayInsertRes.error) {
        throw new Error("Failed to save delay rows. Check that tower_docket_delays exists.");
      }
    }

    const progressPayload = buildProgressPayload(docketId);

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

    if (hasDuplicateWorkers) {
      alert("Duplicate worker names found. Each worker can only appear once in a daily docket.");
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

      setLunchBreakMinutes(toStringValue(lastDocket.lunch_break_minutes));
      setTravelInMinutes(toStringValue(lastDocket.travel_in_minutes));
      setTravelOutMinutes(toStringValue(lastDocket.travel_out_minutes));
      setMobilisationHours(toStringValue(lastDocket.mobilisation_hours));
      setMobilisationNotes(toStringValue(lastDocket.mobilisation_notes));

      setBcRepName("");
      setClientRepName("");
      setSignedDate("");
      setDocketFile(null);
      setExistingDocketFileUrl("");

      if (labour && labour.length > 0) {
        const mappedLabour = labour.map((r) => makeLabourRow(r));

        const dedupedLabour: LabourRow[] = [];
        const seen = new Set<string>();

        mappedLabour.forEach((row) => {
          const key = normalizeWorkerName(row.worker_name);
          if (!key || seen.has(key)) return;
          seen.add(key);
          dedupedLabour.push(row);
        });

        setLabourRows([
          ...dedupedLabour,
          blankLabourRow({
            lunchBreakMinutes: toStringValue(lastDocket.lunch_break_minutes),
            travelInMinutes: toStringValue(lastDocket.travel_in_minutes),
            travelOutMinutes: toStringValue(lastDocket.travel_out_minutes),
            mobilisationHours: toStringValue(lastDocket.mobilisation_hours),
          }),
        ]);
      } else {
        setLabourRows([
          blankLabourRow({
            lunchBreakMinutes: toStringValue(lastDocket.lunch_break_minutes),
            travelInMinutes: toStringValue(lastDocket.travel_in_minutes),
            travelOutMinutes: toStringValue(lastDocket.travel_out_minutes),
            mobilisationHours: toStringValue(lastDocket.mobilisation_hours),
          }),
        ]);
      }

      // Do not carry previous day delay events by default. Delays should be entered for the actual day.
      setDelayRows([]);

      if (progress && progress.length > 0) {
        const mappedRows = progress.map((r) => ({
          section_label: toStringValue(r.section_label),
          assembled_qty: toStringValue(r.assembled_qty),
          erected_qty: toStringValue(r.erected_qty),
        }));

        setProgressRows(mappedRows);
        setHasBodyExtension(mappedRows.some((row) => isBodyExtensionRow(row)));
      } else {
        setProgressRows(DEFAULT_PROGRESS_ROWS);

        const { data: tower } = await supabase
          .from("towers")
          .select("*")
          .eq("id", towerId)
          .single();

        setHasBodyExtension(inferTowerHasBodyExtension((tower as TowerRecord | null) || null));
      }
    } catch (err) {
      console.error(err);
      alert("Failed to prefill docket");
    }
  }

  function applyBulkTimes() {
    setLabourRows((prev) =>
      prev.map((row) => {
        const time_in = bulkTimeIn || row.time_in;
        const time_out = bulkTimeOut || row.time_out;
        const total_hours = calculateHours(time_in, time_out) || row.total_hours;

        const next = {
          ...row,
          time_in,
          time_out,
          total_hours,
        };

        return {
          ...next,
          production_hours: calculateProductionHours(next, delayHoursForWorker(next.worker_name)),
        };
      })
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">
            {mode === "create"
              ? "Add Daily Docket"
              : mode === "edit"
              ? "Edit Daily Docket"
              : "View Daily Docket"}
          </h1>
          <p className="text-slate-500 mt-1">
            Enter labour, progress, production deductions, delays, and upload the scanned docket.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
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

      {hasDuplicateWorkers && !locked && !isView && (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded-2xl p-4">
          Duplicate worker names detected. Each worker can only appear once in this daily docket.
        </div>
      )}

      <section className="bg-white border rounded-2xl p-5 md:p-6 space-y-4">
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

      <section className="bg-white border rounded-2xl p-5 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold">Section Quantities</h2>
            <p className="text-sm text-slate-500 mt-1">
              Body extension is auto-detected from the tower CSV/extra data. You can still override it here if needed.
            </p>
          </div>

          <label className="inline-flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={hasBodyExtension}
              disabled={locked || isView}
              onChange={(e) => handleBodyExtensionToggle(e.target.checked)}
              className="h-4 w-4"
            />
            This tower has body extensions
          </label>
        </div>

        {!hasBodyExtension && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm">
            Body Extensions are excluded from the progress calculation for this docket.
          </div>
        )}

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
              {visibleProgressRows.map((row) => {
                const actualIndex = progressRows.findIndex(
                  (r) => r.section_label === row.section_label
                );

                return (
                  <tr key={row.section_label} className="border-t">
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
                          updateProgressRow(actualIndex, "assembled_qty", e.target.value)
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
                          updateProgressRow(actualIndex, "erected_qty", e.target.value)
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex justify-end gap-6 md:gap-10 p-4 bg-slate-50 border-t flex-wrap">
            <SummaryBlock label="Total Assembly" value={`${totalAssemblyPercent}%`} />
            <SummaryBlock label="Total Erection" value={`${totalErectionPercent}%`} />
            <SummaryBlock label="Tower Progress Used" value={`${displayProgress}%`} />
          </div>
        </div>
      </section>

      <section className="bg-white border rounded-2xl p-5 md:p-6 space-y-4">
        <h2 className="text-xl font-semibold">Docket Production Defaults</h2>
        <p className="text-sm text-slate-500">
          These are default non-productive deductions for the docket. Apply them to all workers, then use the Delays section below for whole-crew or selected-worker delays.
        </p>

        <div className="grid md:grid-cols-4 gap-4">
          <Input
            label="Lunch Break Minutes"
            type="number"
            value={lunchBreakMinutes}
            onChange={setLunchBreakMinutes}
            disabled={locked || isView}
          />
          <Input
            label="Travel In Minutes"
            type="number"
            value={travelInMinutes}
            onChange={setTravelInMinutes}
            disabled={locked || isView}
          />
          <Input
            label="Travel Out Minutes"
            type="number"
            value={travelOutMinutes}
            onChange={setTravelOutMinutes}
            disabled={locked || isView}
          />
          <Input
            label="Mobilisation Hours"
            type="number"
            value={mobilisationHours}
            onChange={setMobilisationHours}
            disabled={locked || isView}
          />
        </div>

        <div className="grid md:grid-cols-[1fr_auto] gap-4 items-end">
          <Input
            label="Mobilisation Notes"
            value={mobilisationNotes}
            onChange={setMobilisationNotes}
            disabled={locked || isView}
          />

          {!locked && !isView && (
            <button
              type="button"
              onClick={applyProductionDefaultsToAll}
              className="bg-slate-900 text-white px-4 py-3 rounded-xl text-sm font-medium"
            >
              Apply Defaults to Labour
            </button>
          )}
        </div>
      </section>

      <section className="bg-white border rounded-2xl p-5 md:p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold">Delays & Issues</h2>
            <p className="text-sm text-slate-500 mt-1">
              Add delay events separately from labour. Each delay can apply to the whole crew or selected people only.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-right">
            <MiniSummary label="Delay Events" value={totalDelayEvents.toFixed(2)} />
            <MiniSummary label="Delay MH" value={totalDelayManhours.toFixed(2)} />
            <MiniSummary label="Rows" value={String(delayRows.length)} />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Input
            label="Missing Items / Bolts"
            value={missingItemsBolts}
            onChange={setMissingItemsBolts}
            disabled={locked || isView}
          />
          <Input
            label="General Delay / Site Comment"
            value={delaysComments}
            onChange={setDelaysComments}
            disabled={locked || isView}
          />
        </div>

        <div className="space-y-3">
          {delayRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              No delay events added. Add one if weather, access, plant, materials, or selected workers were delayed.
            </div>
          ) : (
            delayRows.map((delay, index) => {
              const affectedCount =
                delay.applies_to === "entire_crew" ? availableWorkerNames.length : delay.worker_names.length;
              const delayManhours = toNumber(delay.delay_hours) * affectedCount;

              return (
                <div key={delay.ui_id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div className="grid md:grid-cols-[150px_120px_1fr_170px_auto] gap-3 items-end">
                    <div>
                      <label className="block text-sm font-medium mb-1">Delay Type</label>
                      <select
                        className="border rounded-lg p-2 w-full text-sm disabled:bg-slate-100"
                        value={delay.delay_type}
                        disabled={locked || isView}
                        onChange={(e) => updateDelayRow(index, "delay_type", e.target.value)}
                      >
                        <option value="weather">Weather</option>
                        <option value="lightning">Lightning</option>
                        <option value="toolbox">Toolbox</option>
                        <option value="mobilisation">Mobilisation</option>
                        <option value="access">Access / Bogged</option>
                        <option value="plant">Plant / Equipment</option>
                        <option value="materials">Materials</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <Input
                      label="Delay Hrs"
                      type="number"
                      value={delay.delay_hours}
                      onChange={(v) => updateDelayRow(index, "delay_hours", v)}
                      disabled={locked || isView}
                    />

                    <Input
                      label="Reason"
                      value={delay.delay_reason}
                      onChange={(v) => updateDelayRow(index, "delay_reason", v)}
                      disabled={locked || isView}
                    />

                    <div>
                      <label className="block text-sm font-medium mb-1">Applies To</label>
                      <select
                        className="border rounded-lg p-2 w-full text-sm disabled:bg-slate-100"
                        value={delay.applies_to}
                        disabled={locked || isView}
                        onChange={(e) => updateDelayRow(index, "applies_to", e.target.value)}
                      >
                        <option value="entire_crew">Entire Crew</option>
                        <option value="selected_workers">Selected Workers</option>
                      </select>
                    </div>

                    {!locked && !isView ? (
                      <button
                        type="button"
                        onClick={() => removeDelayRow(index)}
                        className="border px-4 py-2 rounded-lg h-10 bg-white"
                      >
                        Remove
                      </button>
                    ) : (
                      <div />
                    )}
                  </div>

                  {delay.applies_to === "selected_workers" && (
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="text-sm font-medium mb-2">Affected Workers</div>
                      {availableWorkerNames.length === 0 ? (
                        <div className="text-sm text-slate-500">Add workers in the labour section first.</div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {availableWorkerNames.map((name) => {
                            const checked = delay.worker_names.some(
                              (worker) => normalizeWorkerName(worker) === normalizeWorkerName(name),
                            );

                            return (
                              <label
                                key={`${delay.ui_id}-${name}`}
                                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm ${
                                  checked ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="hidden"
                                  checked={checked}
                                  disabled={locked || isView}
                                  onChange={() => toggleDelayWorker(index, name)}
                                />
                                {name}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-xs text-slate-500">
                    Production deduction: {toNumber(delay.delay_hours).toFixed(2)} hrs × {affectedCount} people = {delayManhours.toFixed(2)} delay manhours
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!locked && !isView && (
          <button
            type="button"
            onClick={addDelayRow}
            className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-medium"
          >
            Add Delay Event
          </button>
        )}
      </section>

      <section className="bg-white border rounded-2xl p-5 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-xl font-semibold">Labour</h2>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-right">
            <MiniSummary label="Raw" value={totalLabourHours.toFixed(2)} />
            <MiniSummary label="Production" value={totalProductionHours.toFixed(2)} />
            <MiniSummary label="Lunch" value={totalLunchHours.toFixed(2)} />
            <MiniSummary label="Travel" value={totalTravelHours.toFixed(2)} />
            <MiniSummary label="Mob" value={totalMobilisationHours.toFixed(2)} />
            <MiniSummary label="Delay" value={totalDelayManhours.toFixed(2)} />
          </div>
        </div>

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
              Apply Times to All
            </button>
          </div>
        )}

        <div className="space-y-3">
          {labourRowsWithProduction.map((row, index) => {
            const isDuplicate = duplicateWorkerIndexes.has(index);

            return (
              <div
                key={index}
                className={`border rounded-xl p-3 space-y-3 ${
                  isDuplicate ? "border-red-300 bg-red-50" : ""
                }`}
              >
                <div className="grid grid-cols-2 md:grid-cols-[1.4fr_110px_110px_100px_100px] gap-2 items-end">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Worker Name
                    </label>
                    <input
                      id={`labour-name-${index}`}
                      className={`border rounded-lg p-2 text-sm w-full disabled:bg-slate-100 ${
                        isDuplicate ? "border-red-500 bg-white" : ""
                      }`}
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
                    {isDuplicate && row.worker_name.trim() && (
                      <p className="text-xs text-red-600 mt-1">
                        This worker name is already entered in this docket.
                      </p>
                    )}
                  </div>

                  <LabourInput
                    label="Time In"
                    id={`labour-timein-${index}`}
                    type="time"
                    value={row.time_in}
                    disabled={locked || isView}
                    onKeyDown={(e) => handleLabourKeyDown(e, `labour-timeout-${index}`)}
                    onChange={(v) => updateLabourRow(index, "time_in", v)}
                  />

                  <LabourInput
                    label="Time Out"
                    id={`labour-timeout-${index}`}
                    type="time"
                    value={row.time_out}
                    disabled={locked || isView}
                    onKeyDown={(e) => handleLabourKeyDown(e, `labour-hours-${index}`)}
                    onChange={(v) => updateLabourRow(index, "time_out", v)}
                  />

                  <LabourInput
                    label="Raw Hrs"
                    id={`labour-hours-${index}`}
                    type="number"
                    value={row.total_hours}
                    disabled={locked || isView}
                    onKeyDown={(e) => handleLabourKeyDown(e, `labour-lunch-${index}`)}
                    onChange={(v) => updateLabourRow(index, "total_hours", v)}
                  />

                  <div>
                    <label className="block text-sm font-medium mb-1">Prod Hrs</label>
                    <div className="border rounded-lg p-2 text-sm w-full bg-emerald-50 text-emerald-800 font-semibold">
                      {row.production_hours || "0.00"}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-[110px_110px_110px_110px_110px_1fr_auto] gap-2 items-end">
                  <LabourInput
                    label="Lunch Min"
                    id={`labour-lunch-${index}`}
                    type="number"
                    value={row.lunch_minutes}
                    disabled={locked || isView}
                    onKeyDown={(e) => handleLabourKeyDown(e, `labour-travelin-${index}`)}
                    onChange={(v) => updateLabourRow(index, "lunch_minutes", v)}
                  />

                  <LabourInput
                    label="Travel In"
                    id={`labour-travelin-${index}`}
                    type="number"
                    value={row.travel_in_minutes}
                    disabled={locked || isView}
                    onKeyDown={(e) => handleLabourKeyDown(e, `labour-travelout-${index}`)}
                    onChange={(v) => updateLabourRow(index, "travel_in_minutes", v)}
                  />

                  <LabourInput
                    label="Travel Out"
                    id={`labour-travelout-${index}`}
                    type="number"
                    value={row.travel_out_minutes}
                    disabled={locked || isView}
                    onKeyDown={(e) => handleLabourKeyDown(e, `labour-mob-${index}`)}
                    onChange={(v) => updateLabourRow(index, "travel_out_minutes", v)}
                  />

                  <LabourInput
                    label="Mob Hrs"
                    id={`labour-mob-${index}`}
                    type="number"
                    value={row.mobilisation_hours}
                    disabled={locked || isView}
                    onKeyDown={(e) => handleLabourKeyDown(e, `labour-name-${index + 1}`)}
                    onChange={(v) => updateLabourRow(index, "mobilisation_hours", v)}
                  />

                  <div>
                    <label className="block text-sm font-medium mb-1">Delay Hrs</label>
                    <div className="border rounded-lg p-2 text-sm w-full bg-amber-50 text-amber-800 font-semibold">
                      {row.delay_hours || "0.00"}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Delay Reason</label>
                    <div className="border rounded-lg p-2 text-sm w-full bg-slate-50 text-slate-700 min-h-10 truncate">
                      {row.delay_reason || "—"}
                    </div>
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
              </div>
            );
          })}
        </div>

        {!locked && !isView && (
          <div className="pt-2">
            <button
              type="button"
              onClick={addLabourRow}
              className="bg-slate-900 text-white px-4 py-2 rounded-lg"
            >
              Add Worker
            </button>
          </div>
        )}
      </section>

      <section className="bg-white border rounded-2xl p-5 md:p-6 space-y-4">
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

function LabourInput({
  label,
  id,
  value,
  onChange,
  onKeyDown,
  type = "text",
  disabled = false,
}: {
  label: string;
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        id={id}
        className="border rounded-lg p-2 text-sm w-full disabled:bg-slate-100"
        type={type}
        step={type === "number" ? "0.01" : undefined}
        value={value}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function SummaryBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function MiniSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-100 px-3 py-2 min-w-[90px]">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
