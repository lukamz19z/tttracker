"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type TowerRecord = {
  id: string;
  name?: string | null;
  project_id?: string | null;
  line?: string | null;
  status?: string | null;
  progress?: number | null;
  extra_data?: Record<string, unknown> | null;
};

type ProjectTowerOption = {
  id: string;
  name: string;
};

type DocketRecord = {
  id: string;
  project_id: string;
  tower_id: string;
  docket_date: string | null;
  crew: string | null;
  leading_hand: string | null;
  weather: string | null;
  rate_type?: string | null;
  assembly_percent?: number | null;
  erection_percent?: number | null;
  raw_manhours?: number | null;
  production_manhours?: number | null;
  bc_rep_name?: string | null;
  client_rep_name?: string | null;
  signed_date?: string | null;
  docket_file_url?: string | null;
  delays_comments?: string | null;
  sharepoint_sync_status?: string | null;
  sharepoint_web_url?: string | null;
  pdf_file_name?: string | null;
  progress_model?: string | null;
  approval_status?: string | null;
  draft_sharepoint_web_url?: string | null;
  final_sharepoint_web_url?: string | null;
  bc_approved_name?: string | null;
  client_approved_name?: string | null;
};

type LabourRow = {
  docket_id: string;
  worker_name?: string | null;
  total_hours: number | null;
  production_hours?: number | null;
  lunch_minutes?: number | null;
  travel_in_minutes?: number | null;
  travel_out_minutes?: number | null;
  mobilisation_hours?: number | null;
  delay_hours?: number | null;
};

type DelayRow = {
  docket_id: string;
  delay_type: string | null;
  delay_hours: number | null;
  applies_to: string | null;
  worker_names: string[] | null;
};

type PlantRow = {
  docket_id: string;
  total_hours: number | null;
  plant_name?: string | null;
  plant_type?: string | null;
  asset_number?: string | null;
};

type MaterialEventItem = {
  id: string;
  event_id: string;
  item_reference?: string | null;
  item_description?: string | null;
  quantity?: number | null;
  unit?: string | null;
};

type MaterialEvent = {
  id: string;
  docket_id: string | null;
  tower_id: string;
  event_type: string;
  source_tower_id?: string | null;
  destination_tower_id?: string | null;
  affected_work?: boolean | null;
  work_outcome?: string | null;
  affected_activity?: string | null;
  affected_section?: string | null;
  impact_ongoing?: boolean | null;
  current_effect?: string | null;
  notes?: string | null;
  items?: MaterialEventItem[] | null;
};

type DocketTotals = {
  raw: number;
  production: number;
  lunch: number;
  travel: number;
  prestartHours: number;
  delay: number;
  delayEvents: number;
  plant: number;
  workers: number;
};

type MobilisationSummary = {
  enabled: boolean;
  fromTowerId: string;
  toTowerId: string;
  status: string;
  progress: number;
  startedDate: string;
  targetDate: string;
  completedDate: string;
  notes: string;
};

type MaterialSummary = {
  issues: number;
  excess: number;
  affectedWork: number;
  ongoing: number;
  issueItems: MaterialEventItem[];
  excessItems: MaterialEventItem[];
};

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatNumber(value: number): string {
  return value.toFixed(2);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "No date";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short" });
}

function getAssembly(docket: DocketRecord): number {
  return Math.round(safeNumber(docket.assembly_percent, 0));
}

function getErection(docket: DocketRecord): number {
  return Math.round(safeNumber(docket.erection_percent, 0));
}

function getProgress(docket: DocketRecord): number {
  return Math.round(getAssembly(docket) * 0.5 + getErection(docket) * 0.5);
}

type WorkflowStatus = "legacy"|"legacy_final"|"draft"|"submitted_bc"|"bc_changes_requested"|"client_pending"|"client_changes_requested"|"final";

function getStatus(docket: DocketRecord): WorkflowStatus {
  const value = String(docket.approval_status || "");
  if (["legacy","legacy_final","draft","submitted_bc","bc_changes_requested","client_pending","client_changes_requested","final"].includes(value)) {
    return value as WorkflowStatus;
  }
  if (docket.client_rep_name?.trim() && docket.signed_date?.trim()) return "legacy_final";
  return "legacy";
}
function getStatusLabel(status: WorkflowStatus) {
  const labels: Record<WorkflowStatus, string> = {
    legacy: "In Progress",
    legacy_final: "Approved",
    draft: "In Progress",
    submitted_bc: "Pending BC Approval",
    bc_changes_requested: "Changes Required",
    client_pending: "Pending Client Approval",
    client_changes_requested: "Changes Required",
    final: "Approved",
  };

  return labels[status];
}
function getStatusClasses(status: WorkflowStatus) {
  if (status === "final" || status === "legacy_final") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  if (status === "submitted_bc" || status === "client_pending") {
    return "bg-blue-50 text-blue-700 border-blue-200";
  }

  if (status === "bc_changes_requested" || status === "client_changes_requested") {
    return "bg-amber-50 text-amber-800 border-amber-200";
  }

  return "bg-slate-100 text-slate-700 border-slate-200";
}

function getSharePointClasses(status: string | null | undefined) {
  if (status === "published") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "publishing") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "failed") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function getSharePointLabel(status: string | null | undefined) {
  if (status === "published") return "Final PDF";
  if (status === "publishing") return "Preparing PDF";
  if (status === "failed") return "PDF Error";
  return "PDF Pending";
}

function buildTowerStatus(progress: number) {
  if (progress >= 100) return "Complete";
  if (progress > 0) return "In Progress";
  return "Not Started";
}

function parseMobilisation(delaysComments: string | null | undefined): MobilisationSummary {
  const line = String(delaysComments || "")
    .split("\n")
    .find((entry) => entry.startsWith("MOBILISATION|"));

  if (!line) {
    return {
      enabled: false,
      fromTowerId: "",
      toTowerId: "",
      status: "",
      progress: 0,
      startedDate: "",
      targetDate: "",
      completedDate: "",
      notes: "",
    };
  }

  const values = Object.fromEntries(
    line
      .split("|")
      .slice(1)
      .map((part) => {
        const [key, ...rest] = part.split("=");
        return [key, rest.join("=")];
      }),
  );

  return {
    enabled: true,
    fromTowerId: values.from || "",
    toTowerId: values.to || "",
    status: values.status || "",
    progress: Math.max(0, Math.min(100, safeNumber(values.progress, 0))),
    startedDate: values.started || "",
    targetDate: values.target || "",
    completedDate: values.completed || "",
    notes: values.notes || "",
  };
}

function mobilisationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    planning: "Planning",
    packing: "Packing",
    demobilising: "Demobilising",
    in_transit: "In Transit",
    mobilising: "Mobilising",
    setup: "Setting Up",
    complete: "Complete",
  };
  return labels[status] || status || "Mobilising";
}

function materialEventLabel(type: string) {
  const labels: Record<string, string> = {
    missing: "Missing",
    found_received: "Found / Received",
    taken_from_another_tower: "Taken from Tower",
    sent_to_another_tower: "Sent to Tower",
    damaged_incorrect: "Damaged / Incorrect",
    excess: "Excess",
  };
  return labels[type] || type;
}

function workOutcomeLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    stopped_work: "Couldn’t continue",
    slowed_down: "Slowed down",
    changed_sequence: "Resequenced",
    minor_impact: "Minor impact",
  };
  return value ? labels[value] || value : "—";
}

function itemLabel(item: MaterialEventItem) {
  const qty = safeNumber(item.quantity, 1);
  const qtyPrefix = qty !== 1 || item.unit ? `${qty}${item.unit ? ` ${item.unit}` : ""} × ` : "";
  return `${qtyPrefix}${item.item_reference || "Unlisted item"}`;
}

export default function TowerDocketsPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const params = useParams();

  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const [tower, setTower] = useState<TowerRecord | null>(null);
  const [projectTowers, setProjectTowers] = useState<ProjectTowerOption[]>([]);
  const [dockets, setDockets] = useState<DocketRecord[]>([]);
  const [labourRows, setLabourRows] = useState<LabourRow[]>([]);
  const [delayRows, setDelayRows] = useState<DelayRow[]>([]);
  const [plantRows, setPlantRows] = useState<PlantRow[]>([]);
  const [materialEvents, setMaterialEvents] = useState<MaterialEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDocketId, setOpenDocketId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deletingDocketId, setDeletingDocketId] = useState<string | null>(null);
  const [workflowBusyId, setWorkflowBusyId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);

    try {
      const [{ data: towerData }, { data: projectTowerData }, { data: docketData }] =
        await Promise.all([
          supabase.from("towers").select("*").eq("id", towerId).single(),
          supabase
            .from("towers")
            .select("id,name,extra_data")
            .eq("project_id", projectId)
            .order("name"),
          supabase
            .from("tower_daily_dockets")
            .select("*")
            .eq("tower_id", towerId)
            .order("docket_date", { ascending: false }),
        ]);

      const loadedDockets = (docketData || []) as DocketRecord[];
      setTower((towerData as TowerRecord | null) || null);
      setProjectTowers(
        ((projectTowerData || []) as Array<{
          id: string;
          name?: string | null;
          extra_data?: Record<string, unknown> | null;
        }>).map((row) => ({
          id: row.id,
          name: String(
            row.name ||
              row.extra_data?.tower_number ||
              row.extra_data?.structure_number ||
              row.extra_data?.tower_no ||
              "Tower",
          ),
        })),
      );
      setDockets(loadedDockets);

      const docketIds = loadedDockets.map((docket) => docket.id);

      if (docketIds.length === 0) {
        setLabourRows([]);
        setDelayRows([]);
        setPlantRows([]);
        setMaterialEvents([]);
        return;
      }

      const [
        { data: labourData },
        { data: delayData },
        { data: plantData },
        { data: materialData },
      ] = await Promise.all([
        supabase
          .from("tower_docket_labour")
          .select(
            "docket_id,worker_name,total_hours,production_hours,lunch_minutes,travel_in_minutes,travel_out_minutes,mobilisation_hours,delay_hours",
          )
          .in("docket_id", docketIds),
        supabase
          .from("tower_docket_delays")
          .select("docket_id,delay_type,delay_hours,applies_to,worker_names")
          .in("docket_id", docketIds),
        supabase
          .from("tower_docket_plant")
          .select("docket_id,total_hours,plant_name,plant_type,asset_number")
          .in("docket_id", docketIds),
        supabase
          .from("tower_material_events")
          .select(
            `
              id,
              docket_id,
              tower_id,
              event_type,
              source_tower_id,
              destination_tower_id,
              affected_work,
              work_outcome,
              affected_activity,
              affected_section,
              impact_ongoing,
              current_effect,
              notes,
              items:tower_material_event_items(
                id,
                event_id,
                item_reference,
                item_description,
                quantity,
                unit
              )
            `,
          )
          .in("docket_id", docketIds)
          .order("created_at", { ascending: true }),
      ]);

      setLabourRows((labourData || []) as LabourRow[]);
      setDelayRows((delayData || []) as DelayRow[]);
      setPlantRows((plantData || []) as PlantRow[]);
      setMaterialEvents((materialData || []) as MaterialEvent[]);
    } finally {
      setLoading(false);
    }
  }, [projectId, supabase, towerId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
        setCurrentRole(String(data?.role || "").toLowerCase());
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchData(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchData]);

  async function recalcTowerProgressAndStatus() {
    const { data, error } = await supabase
      .from("tower_daily_dockets")
      .select("assembly_percent, erection_percent")
      .eq("tower_id", towerId);

    if (error) {
      throw new Error("Docket deleted, but tower progress failed to recalculate.");
    }

    const maxProgress =
      data?.reduce((max, docket) => {
        const assembly = safeNumber(docket.assembly_percent, 0);
        const erection = safeNumber(docket.erection_percent, 0);
        const progress = Math.round(assembly * 0.5 + erection * 0.5);
        return Math.max(max, progress);
      }, 0) ?? 0;

    const { error: updateError } = await supabase
      .from("towers")
      .update({
        progress: Math.round(maxProgress),
        status: buildTowerStatus(maxProgress),
        updated_at: new Date().toISOString(),
      })
      .eq("id", towerId);

    if (updateError) {
      throw new Error("Docket deleted, but tower status failed to update.");
    }
  }

  const towerNameById = useMemo(
    () => Object.fromEntries(projectTowers.map((row) => [row.id, row.name])),
    [projectTowers],
  );

  const eventsByDocket = useMemo(() => {
    const grouped: Record<string, MaterialEvent[]> = {};
    materialEvents.forEach((event) => {
      if (!event.docket_id) return;
      if (!grouped[event.docket_id]) grouped[event.docket_id] = [];
      grouped[event.docket_id].push(event);
    });
    return grouped;
  }, [materialEvents]);

  const materialSummaryByDocket = useMemo(() => {
    const summaries: Record<string, MaterialSummary> = {};

    dockets.forEach((docket) => {
      const events = eventsByDocket[docket.id] || [];
      const issues = events.filter((event) => event.event_type !== "excess");
      const excess = events.filter((event) => event.event_type === "excess");

      summaries[docket.id] = {
        issues: issues.length,
        excess: excess.length,
        affectedWork: issues.filter((event) => event.affected_work).length,
        ongoing: issues.filter(
          (event) => event.impact_ongoing || event.current_effect === "Waiting for material",
        ).length,
        issueItems: issues.flatMap((event) => event.items || []),
        excessItems: excess.flatMap((event) => event.items || []),
      };
    });

    return summaries;
  }, [dockets, eventsByDocket]);

  const mobilisationByDocket = useMemo(
    () =>
      Object.fromEntries(
        dockets.map((docket) => [docket.id, parseMobilisation(docket.delays_comments)]),
      ),
    [dockets],
  );

  const docketTotals = useMemo(() => {
    const totals: Record<string, DocketTotals> = {};

    dockets.forEach((docket) => {
      totals[docket.id] = {
        raw: safeNumber(docket.raw_manhours, 0),
        production: safeNumber(docket.production_manhours, 0),
        lunch: 0,
        travel: 0,
        prestartHours: 0,
        delay: 0,
        delayEvents: 0,
        plant: 0,
        workers: 0,
      };
    });

    labourRows.forEach((row) => {
      if (!totals[row.docket_id]) return;

      totals[row.docket_id].raw +=
        totals[row.docket_id].raw > 0 ? 0 : safeNumber(row.total_hours, 0);
      totals[row.docket_id].production +=
        totals[row.docket_id].production > 0 ? 0 : safeNumber(row.production_hours, 0);
      totals[row.docket_id].lunch += safeNumber(row.lunch_minutes, 0) / 60;
      totals[row.docket_id].travel +=
        (safeNumber(row.travel_in_minutes, 0) + safeNumber(row.travel_out_minutes, 0)) / 60;
      totals[row.docket_id].prestartHours += safeNumber(row.mobilisation_hours, 0);
      totals[row.docket_id].delay += safeNumber(row.delay_hours, 0);
      if (row.worker_name?.trim()) totals[row.docket_id].workers += 1;
    });

    delayRows.forEach((row) => {
      if (!totals[row.docket_id]) return;

      const delayHours = safeNumber(row.delay_hours, 0);
      const people =
        row.applies_to === "selected_workers" ? row.worker_names?.length || 0 : 1;

      totals[row.docket_id].delayEvents += delayHours;

      if (totals[row.docket_id].delay === 0) {
        totals[row.docket_id].delay += delayHours * Math.max(people, 1);
      }
    });

    plantRows.forEach((row) => {
      if (!totals[row.docket_id]) return;
      totals[row.docket_id].plant += safeNumber(row.total_hours, 0);
    });

    return totals;
  }, [dockets, labourRows, delayRows, plantRows]);

  const summary = useMemo(
    () =>
      dockets.reduce(
        (acc, docket) => {
          const totals = docketTotals[docket.id];
          const material = materialSummaryByDocket[docket.id];

          acc.raw += totals?.raw || 0;
          acc.production += totals?.production || 0;
          acc.delay += totals?.delay || 0;
          acc.materialIssues += material?.issues || 0;
          acc.excessRecords += material?.excess || 0;
          return acc;
        },
        {
          raw: 0,
          production: 0,
          delay: 0,
          materialIssues: 0,
          excessRecords: 0,
        },
      ),
    [dockets, docketTotals, materialSummaryByDocket],
  );

  const filteredDockets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dockets;

    return dockets.filter((docket) => {
      const totals = docketTotals[docket.id];
      const material = materialSummaryByDocket[docket.id];
      const mobilisation = mobilisationByDocket[docket.id];
      const events = eventsByDocket[docket.id] || [];

      const materialText = events
        .flatMap((event) => [
          materialEventLabel(event.event_type),
          event.affected_activity,
          event.affected_section,
          event.current_effect,
          event.notes,
          ...(event.items || []).flatMap((item) => [
            item.item_reference,
            item.item_description,
          ]),
        ])
        .filter(Boolean)
        .join(" ");

      return [
        docket.docket_date,
        docket.crew,
        docket.leading_hand,
        docket.weather,
        getStatusLabel(getStatus(docket)),
        getAssembly(docket),
        getErection(docket),
        totals?.raw,
        totals?.production,
        totals?.workers,
        material?.issues,
        material?.excess,
        materialText,
        mobilisation.enabled ? mobilisationStatusLabel(mobilisation.status) : "",
        towerNameById[mobilisation.fromTowerId],
        towerNameById[mobilisation.toTowerId],
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [
    dockets,
    search,
    docketTotals,
    materialSummaryByDocket,
    mobilisationByDocket,
    eventsByDocket,
    towerNameById,
  ]);

  const canReviewBc = ["admin","commercial","commercial_manager","supervisor"].includes(currentRole);

  async function submitForBcApproval(id: string) {
    setWorkflowBusyId(id);
    try {
      const response = await fetch(`/api/daily-dockets/${id}/submit-bc`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit docket.");
      await fetchData();
    } catch (e) { alert(e instanceof Error ? e.message : "Could not submit docket."); }
    finally { setWorkflowBusyId(null); }
  }

  async function bcReview(id: string, decision: "approve"|"request_changes") {
    const comments = decision === "request_changes" ? (window.prompt("What needs to be changed?") || "") : "";
    if (decision === "request_changes" && !comments.trim()) return;
    if (decision === "approve" && !window.confirm("Approve this docket internally and send it to the configured client approval contacts?")) return;
    setWorkflowBusyId(id);
    try {
      const response = await fetch(`/api/daily-dockets/${id}/bc-review`, {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({decision,comments})
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "BC review failed.");
      await fetchData();
    } catch (e) { alert(e instanceof Error ? e.message : "BC review failed."); }
    finally { setWorkflowBusyId(null); }
  }

  async function deleteDocket(id: string) {
    const target = dockets.find((d) => d.id === id);
    const workflowStatus = target ? getStatus(target) : "legacy";
    if (!["legacy","draft","bc_changes_requested","client_changes_requested"].includes(workflowStatus)) {
      alert("Submitted, client-pending and final Daily Dockets cannot be deleted from the normal register.");
      return;
    }
    const confirmed = window.confirm(
      "Delete this Daily Docket? This will permanently remove the docket and its linked records.",
    );
    if (!confirmed) return;

    setDeletingDocketId(id);

    try {
      const [labourRes, delayRes, plantRes, progressRes] = await Promise.all([
        supabase.from("tower_docket_labour").delete().eq("docket_id", id),
        supabase.from("tower_docket_delays").delete().eq("docket_id", id),
        supabase.from("tower_docket_plant").delete().eq("docket_id", id),
        supabase.from("tower_docket_progress").delete().eq("docket_id", id),
      ]);

      const childError =
        labourRes.error || delayRes.error || plantRes.error || progressRes.error;

      if (childError) {
        throw new Error(childError.message || "Failed to delete one or more docket detail rows.");
      }

      const { error } = await supabase.from("tower_daily_dockets").delete().eq("id", id);

      if (error) throw new Error(error.message || "Failed to delete docket.");

      await recalcTowerProgressAndStatus();
      await fetchData();
      setOpenDocketId((current) => (current === id ? null : current));
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to delete docket.");
    } finally {
      setDeletingDocketId(null);
    }
  }

  if (loading) return <div className="p-8">Loading Daily Dockets...</div>;

  return (
    <div className="p-3 md:p-8 space-y-4 bg-slate-50 min-h-screen">
      {tower && <TowerHeader projectId={projectId} tower={tower} />}

      <div className="bg-white border border-slate-200 rounded-2xl md:rounded-3xl shadow-sm overflow-hidden">
        <div className="p-4 md:p-6 border-b border-slate-200">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Daily Dockets</h1>
              <p className="text-sm md:text-base text-slate-500 mt-1">
                Daily records for this tower, including progress, labour, delays,
                materials and approval status.
              </p>
            </div>

            <div className="flex flex-col md:flex-row gap-2">
              <Link href={`/project/${projectId}/docket-settings`} className="w-full md:w-auto text-center border border-slate-300 bg-white px-5 py-3 rounded-xl text-sm font-semibold">Approval Settings</Link>
              <Link href={`/project/${projectId}/tower/${towerId}/dockets/new`} className="w-full md:w-auto text-center bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl text-sm font-semibold">+ Add Daily Docket</Link>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 md:gap-3 mt-5">
            <KpiCard label="Dockets" value={dockets.length} />
            <KpiCard label="Raw Hrs" value={formatNumber(summary.raw)} />
            <KpiCard label="Prod Hrs" value={formatNumber(summary.production)} tone="green" />
            <KpiCard label="Delay MH" value={formatNumber(summary.delay)} tone="amber" />
            <KpiCard
              label="Material Issues"
              value={summary.materialIssues}
              tone={summary.materialIssues > 0 ? "amber" : "slate"}
            />
            <KpiCard
              label="Excess Records"
              value={summary.excessRecords}
              tone={summary.excessRecords > 0 ? "green" : "slate"}
            />
          </div>

          <div className="mt-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search date, crew, material, weather or approval status..."
              className="w-full border border-slate-300 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="p-3 md:p-5">
          {filteredDockets.length === 0 ? (
            <div className="border border-dashed border-slate-300 rounded-2xl p-10 text-center text-slate-500 bg-slate-50">
              No daily dockets found.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDockets.map((docket) => {
                const progress = getProgress(docket);
                const assembly = getAssembly(docket);
                const erection = getErection(docket);
                const status = getStatus(docket);
                const totals = docketTotals[docket.id] || {
                  raw: 0,
                  production: 0,
                  lunch: 0,
                  travel: 0,
                  prestartHours: 0,
                  delay: 0,
                  delayEvents: 0,
                  plant: 0,
                  workers: 0,
                };
                const material = materialSummaryByDocket[docket.id] || {
                  issues: 0,
                  excess: 0,
                  affectedWork: 0,
                  ongoing: 0,
                  issueItems: [],
                  excessItems: [],
                };
                const mobilisation = mobilisationByDocket[docket.id];
                const docketMaterialEvents = eventsByDocket[docket.id] || [];
                const isOpen = openDocketId === docket.id;

                return (
                  <div
                    key={docket.id}
                    className="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenDocketId(isOpen ? null : docket.id)}
                      className="w-full text-left p-3 md:p-4 hover:bg-slate-50 transition"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-bold text-base md:text-lg text-slate-900">
                              {formatDate(docket.docket_date)}
                            </div>

                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClasses(status)}`}
                            >
                              {getStatusLabel(status)}
                            </span>

                            {material.issues > 0 && (
                              <span className="inline-flex rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                                {material.issues} Material Issue{material.issues === 1 ? "" : "s"}
                              </span>
                            )}

                            {material.excess > 0 && (
                              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                                {material.excess} Excess Record{material.excess === 1 ? "" : "s"}
                              </span>
                            )}

                            {mobilisation?.enabled && (
                              <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                                {mobilisationStatusLabel(mobilisation.status)} {Math.round(mobilisation.progress)}%
                              </span>
                            )}

                            {material.ongoing > 0 && (
                              <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                                Ongoing Material Impact
                              </span>
                            )}
                          </div>

                          <div className="text-sm text-slate-500 mt-1">
                            {docket.leading_hand || "No leading hand"} • Crew {docket.crew || "—"} •{" "}
                            {docket.weather || "No weather"}
                          </div>

                          <div className="flex flex-wrap gap-2 mt-2">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                docket.rate_type === "schedule_of_rates"
                                  ? "bg-purple-100 text-purple-700 border-purple-200"
                                  : "bg-slate-100 text-slate-700 border-slate-200"
                              }`}
                            >
                              {docket.rate_type === "schedule_of_rates"
                                ? "Schedule of Rates"
                                : "Tonnage Rate"}
                            </span>

                            <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                              {totals.workers} workers
                            </span>

                            {docket.sharepoint_sync_status && (
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getSharePointClasses(docket.sharepoint_sync_status)}`}
                              >
                                {getSharePointLabel(docket.sharepoint_sync_status)}
                              </span>
                            )}
                          </div>

                          {material.issueItems.length > 0 && (
                            <div className="mt-2 text-xs text-slate-600 line-clamp-1">
                              <span className="font-semibold text-amber-800">Material:</span>{" "}
                              {material.issueItems.slice(0, 3).map(itemLabel).join(" • ")}
                              {material.issueItems.length > 3
                                ? ` • +${material.issueItems.length - 3} more`
                                : ""}
                            </div>
                          )}

                          {mobilisation?.enabled && (
                            <div className="mt-2 text-xs text-blue-700">
                              <span className="font-semibold">Move:</span>{" "}
                              {towerNameById[mobilisation.fromTowerId] || "Other / Project"} →{" "}
                              {towerNameById[mobilisation.toTowerId] || "Destination not set"}
                            </div>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-2xl font-black text-slate-900">{progress}%</div>
                          <div className="text-[11px] text-slate-500">Tower Progress</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2 mt-3">
                        <MiniMetric label="Workers" value={totals.workers} />
                        <MiniMetric label="Raw" value={formatNumber(totals.raw)} />
                        <MiniMetric label="Prod" value={formatNumber(totals.production)} />
                        <MiniMetric
                          label="Delay MH"
                          value={formatNumber(totals.delay)}
                          tone={totals.delay > 0 ? "amber" : "slate"}
                        />
                        <MiniMetric
                          label="Material"
                          value={material.issues}
                          tone={material.issues > 0 ? "amber" : "slate"}
                        />
                        <MiniMetric
                          label="Excess"
                          value={material.excess}
                          tone={material.excess > 0 ? "green" : "slate"}
                        />
                        <MiniMetric label="Plant Hrs" value={formatNumber(totals.plant)} />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-slate-200 bg-slate-50 p-3 md:p-4 space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="mb-2">
                            <div className="text-sm font-bold text-slate-800">Progress</div>
                          </div>

                          <div className="space-y-2">
                            <ProgressLine label="Assembly" value={assembly} tone="blue" />
                            <ProgressLine label="Erection" value={erection} tone="emerald" />
                            <ProgressLine label="Total Progress" value={progress} tone="slate" strong />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <DetailCard label="General Delay Events" value={formatNumber(totals.delayEvents)} />
                          <DetailCard label="Workers" value={totals.workers} />
                          <DetailCard label="Material Issues" value={material.issues} />
                          <DetailCard label="Excess Records" value={material.excess} />
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-3 md:p-4">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div>
                              <div className="text-sm font-bold text-slate-800">Approval</div>
                              <div className="text-sm text-slate-500 mt-1">
                                {status === "draft" || status === "legacy"
                                  ? "Ready to be reviewed and submitted when complete."
                                  : status === "submitted_bc"
                                  ? "Awaiting review by BC Commercial or Supervisor."
                                  : status === "bc_changes_requested"
                                  ? "BC has requested changes before the docket can proceed."
                                  : status === "client_pending"
                                  ? "BC review is complete and the docket is awaiting client approval."
                                  : status === "client_changes_requested"
                                  ? "The client has requested changes before approval."
                                  : "Approval complete."}
                              </div>
                            </div>

                            <span
                              className={`inline-flex w-fit rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusClasses(status)}`}
                            >
                              {getStatusLabel(status)}
                            </span>
                          </div>
                        </div>

                        {docketMaterialEvents.filter((event) => event.event_type !== "excess").length > 0 && (
                          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 md:p-4">
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <div>
                                <div className="text-sm font-bold text-amber-900">
                                  Steel / Material Issues & Movements
                                </div>
                                <div className="text-xs text-amber-700 mt-1">
                                  Key material information recorded on this docket.
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-xl font-black text-amber-900">{material.issues}</div>
                                <div className="text-[11px] text-amber-700">Records</div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              {docketMaterialEvents
                                .filter((event) => event.event_type !== "excess")
                                .map((event) => (
                                  <div key={event.id} className="rounded-xl border border-amber-200 bg-white p-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="font-semibold text-sm text-slate-900">
                                          {materialEventLabel(event.event_type)}
                                          {event.affected_section ? ` • ${event.affected_section}` : ""}
                                        </div>

                                        {(event.items || []).length > 0 && (
                                          <div className="text-sm text-slate-700 mt-1">
                                            {(event.items || []).slice(0, 4).map(itemLabel).join(" • ")}
                                            {(event.items || []).length > 4
                                              ? ` • +${(event.items || []).length - 4} more`
                                              : ""}
                                          </div>
                                        )}

                                        {event.affected_work && (
                                          <div className="text-xs text-slate-500 mt-1">
                                            Work impact:{" "}
                                            <span className="font-semibold text-slate-700">
                                              {workOutcomeLabel(event.work_outcome)}
                                            </span>
                                            {event.affected_activity ? ` • ${event.affected_activity}` : ""}
                                            {event.current_effect ? ` • ${event.current_effect}` : ""}
                                          </div>
                                        )}
                                      </div>

                                      {event.affected_work && (
                                        <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
                                          Affected Work
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                        {material.excess > 0 && (
                          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 md:p-4">
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <div>
                                <div className="text-sm font-bold text-emerald-900">
                                  Excess Steel / Materials
                                </div>
                                <div className="text-xs text-emerald-700 mt-1">
                                  Excess items remain separate from delays and missing-material issues.
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-xl font-black text-emerald-900">{material.excess}</div>
                                <div className="text-[11px] text-emerald-700">Records</div>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {material.excessItems.map((item) => (
                                <span
                                  key={item.id}
                                  className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800"
                                >
                                  {itemLabel(item)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {mobilisation?.enabled && (
                          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 md:p-4">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                              <div>
                                <div className="text-sm font-bold text-blue-900">Mobilisation Progress</div>
                                <div className="text-sm text-blue-800 mt-1">
                                  {towerNameById[mobilisation.fromTowerId] || "Other / Project"} →{" "}
                                  {towerNameById[mobilisation.toTowerId] || "Destination not set"}
                                </div>
                                <div className="text-xs text-blue-700 mt-1">
                                  {mobilisationStatusLabel(mobilisation.status)}
                                  {mobilisation.startedDate
                                    ? ` • Started ${formatShortDate(mobilisation.startedDate)}`
                                    : ""}
                                  {mobilisation.targetDate
                                    ? ` • Target ${formatShortDate(mobilisation.targetDate)}`
                                    : ""}
                                  {mobilisation.completedDate
                                    ? ` • Completed ${formatShortDate(mobilisation.completedDate)}`
                                    : ""}
                                </div>
                              </div>

                              <div className="md:w-64">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-semibold text-blue-800">Progress</span>
                                  <span className="text-sm font-black text-blue-900">
                                    {Math.round(mobilisation.progress)}%
                                  </span>
                                </div>
                                <div className="h-3 rounded-full bg-white border border-blue-200 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-blue-600"
                                    style={{ width: `${mobilisation.progress}%` }}
                                  />
                                </div>
                              </div>
                            </div>

                            {mobilisation.notes && (
                              <div className="mt-3 text-xs text-blue-800">{mobilisation.notes}</div>
                            )}
                          </div>
                        )}

                        {docket.rate_type === "schedule_of_rates" && (
                          <div className="rounded-2xl border border-purple-200 bg-purple-50 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-bold text-purple-900">
                                  Schedule of Rates Plant
                                </div>

                              </div>
                              <div className="text-right">
                                <div className="text-xl font-black text-purple-900">
                                  {formatNumber(totals.plant)}
                                </div>
                                <div className="text-[11px] text-purple-700">Plant Hrs</div>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <Link href={`/project/${projectId}/tower/${towerId}/dockets/${docket.id}?mode=view`} className="text-center bg-slate-800 text-white px-4 py-3 rounded-xl text-sm font-semibold">View</Link>

                          {["legacy","draft","bc_changes_requested","client_changes_requested"].includes(status) && (
                            <Link href={`/project/${projectId}/tower/${towerId}/dockets/${docket.id}/edit`} className="text-center bg-blue-600 text-white px-4 py-3 rounded-xl text-sm font-semibold">Edit</Link>
                          )}

                          {["draft","bc_changes_requested","client_changes_requested"].includes(status) && (
                            <button type="button" disabled={workflowBusyId===docket.id} onClick={()=>void submitForBcApproval(docket.id)} className="bg-indigo-600 text-white px-4 py-3 rounded-xl text-sm font-semibold disabled:opacity-60">
                              {workflowBusyId===docket.id?"Submitting…":"Submit for Approval"}
                            </button>
                          )}

                          {status==="submitted_bc" && canReviewBc && (<>
                            <button type="button" disabled={workflowBusyId===docket.id} onClick={()=>void bcReview(docket.id,"approve")} className="bg-emerald-600 text-white px-4 py-3 rounded-xl text-sm font-semibold disabled:opacity-60">Approve & Send to Client</button>
                            <button type="button" disabled={workflowBusyId===docket.id} onClick={()=>void bcReview(docket.id,"request_changes")} className="bg-amber-500 text-slate-950 px-4 py-3 rounded-xl text-sm font-semibold disabled:opacity-60">Request Changes</button>
                          </>)}

                          {["legacy","draft","bc_changes_requested","client_changes_requested"].includes(status) && (
                            <button type="button" onClick={()=>void deleteDocket(docket.id)} disabled={deletingDocketId===docket.id} className="bg-rose-600 text-white px-4 py-3 rounded-xl text-sm font-semibold disabled:opacity-60">
                              {deletingDocketId===docket.id?"Deleting…":"Delete"}
                            </button>
                          )}
                        </div>

                        {(docket.final_sharepoint_web_url || docket.draft_sharepoint_web_url || docket.sharepoint_web_url) && (
                          <a
                            href={docket.final_sharepoint_web_url || docket.draft_sharepoint_web_url || docket.sharepoint_web_url || "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-center border border-slate-300 bg-white text-slate-800 px-4 py-3 rounded-xl text-sm font-semibold hover:bg-slate-50"
                          >
                            {status === "final" || status === "legacy_final"
                              ? "View Final PDF"
                              : status === "client_pending"
                              ? "View Draft PDF"
                              : "View Docket PDF"}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressLine({
  label,
  value,
  tone,
  strong = false,
}: {
  label: string;
  value: number;
  tone: "blue" | "emerald" | "slate";
  strong?: boolean;
}) {
  const barColour: Record<string, string> = {
    blue: "bg-blue-500",
    emerald: "bg-emerald-500",
    slate: "bg-slate-900",
  };

  const labelColour: Record<string, string> = {
    blue: "text-blue-700",
    emerald: "text-emerald-700",
    slate: "text-slate-900",
  };

  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div
          className={`text-xs font-bold uppercase tracking-wide ${
            strong ? "text-slate-900" : "text-slate-500"
          }`}
        >
          {label}
        </div>
        <div className={`text-sm font-black ${labelColour[tone]}`}>{clamped}%</div>
      </div>

      <div
        className={`${
          strong ? "h-4" : "h-3"
        } rounded-full bg-white border border-slate-200 overflow-hidden`}
      >
        <div
          className={`h-full rounded-full ${barColour[tone]}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  tone?: "slate" | "green" | "amber";
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-900",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
  };

  return (
    <div className={`rounded-xl px-3 py-3 min-w-0 ${tones[tone]}`}>
      <div className="text-[11px] opacity-75 truncate">{label}</div>
      <div className="font-bold text-base md:text-lg mt-1 truncate">{value}</div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  tone?: "slate" | "amber" | "green";
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-900",
    amber: "bg-amber-100 text-amber-900",
    green: "bg-emerald-100 text-emerald-900",
  };

  return (
    <div className={`rounded-xl px-3 py-2 min-w-0 ${tones[tone]}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-65 truncate">{label}</div>
      <div className="font-semibold text-sm mt-1 truncate">{value}</div>
    </div>
  );
}

function DetailCard({
  label,
  value,
}: {
  label: string | number;
  value: string | number;
}) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 px-3 py-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="font-bold text-sm md:text-base mt-1">{value}</div>
    </div>
  );
}
