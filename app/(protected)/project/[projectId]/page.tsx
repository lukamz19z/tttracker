"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";
import { getUserRole } from "@/lib/roles";

type Project = {
  id: string;
  name: string;
  status?: string | null;
  client?: string | null;
  location?: string | null;
};

type Tower = {
  id: string;
  project_id: string;
  name?: string | null;
  line?: string | null;
  status?: string | null;
  progress?: number | null;
  tower_number?: string | null;
  structure_number?: string | null;
  tower_no?: string | null;
  extra_data?: Record<string, unknown> | null;
};

type DocketRow = {
  id: string;
  tower_id?: string | null;
  project_id?: string | null;
  docket_date?: string | null;
  assembly_percent?: number | null;
  erection_percent?: number | null;
  crew?: string | null;
  leading_hand?: string | null;
};

type LabourRow = {
  docket_id: string;
  total_hours?: number | null;
};

type DefectRow = {
  id: string;
  tower_id?: string | null;
  status?: string | null;
};

type DeliveryRow = {
  id: string;
  tower_id?: string | null;
  [key: string]: unknown;
};

type DeliveryItemRow = {
  delivery_id?: string | null;
  bundle_no?: string | null;
  qty_delivered?: number | null;
  quantity_delivered?: number | null;
  delivered_qty?: number | null;
  qty?: number | null;
  [key: string]: unknown;
};

type MaterialBundleRow = {
  id?: string;
  tower_id?: string | null;
  bundle_no?: string | null;
  qty_required?: number | null;
  required_qty?: number | null;
  total_weight?: number | null;
  [key: string]: unknown;
};

type TowerDeliverySummary = Tower & {
  requiredQty: number;
  deliveredQty: number;
  outstandingQty: number;
  deliveryPercent: number;
};

type TowerProductionSummary = Tower & {
  computedProgress: number;
  computedWeight: number | null;
  completedTonnes: number | null;
  manhours: number;
  productionMhPerTonne: number | null;
};

type CrewProductionSummary = {
  crewName: string;
  docketCount: number;
  totalHours: number;
  productionTonnes: number;
  mhPerTonne: number | null;
  tonnesPerHour: number | null;
  lastDocketDate: string | null;
};

type QuickActionType = "docket" | "delivery" | "materials" | "delivery-progress" | null;
type UserRole = "admin" | "editor" | "viewer" | string | null;

type ProjectStats = {
  totalTowers: number;
  towersComplete: number;
  towersInProgress: number;
  towersNotStarted: number;
  deliveryTowersInProgress: number;
  totalDockets: number;
  totalManhours: number;
  totalTowerWeight: number | null;
  completedTonnes: number | null;
  manhoursPerTonne: number | null;
  openDefects: number;
  totalDefects: number;
  totalDeliveries: number;
  totalRequiredQty: number;
  deliveredQty: number;
  outstandingQty: number;
  deliveryPercent: number;
  latestDocketDate: string | null;
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeString(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function formatDecimal(value: number | null, decimals = 2) {
  if (value === null || Number.isNaN(value)) return "-";
  return value.toFixed(decimals);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

function extractNumericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const str = String(value).trim();
  if (!str) return null;

  const cleaned = str.replace(/,/g, "");
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getTowerWeightFromExtraData(extraData?: Record<string, unknown> | null) {
  if (!extraData) return null;

  const entries = Object.entries(extraData);

  const exactTowerWeightEntry = entries.find(([key]) => {
    const k = key.trim().toLowerCase();
    return (
      k === "tower weight" ||
      k === "tower weight (t)" ||
      k === "tower_weight" ||
      k === "towerweight" ||
      k === "structure total weights" ||
      k === "structure total weight"
    );
  });

  if (exactTowerWeightEntry) return extractNumericValue(exactTowerWeightEntry[1]);

  const towerWeightLikeEntry = entries.find(([key]) => {
    const k = key.trim().toLowerCase();
    return (k.includes("tower") || k.includes("structure")) && k.includes("weight");
  });

  if (towerWeightLikeEntry) return extractNumericValue(towerWeightLikeEntry[1]);

  const genericWeightEntry = entries.find(([key]) => key.trim().toLowerCase().includes("weight"));
  if (genericWeightEntry) return extractNumericValue(genericWeightEntry[1]);

  return null;
}

function getTowerDisplayName(tower: Tower) {
  return tower.tower_number || tower.structure_number || tower.tower_no || tower.name || "Unnamed Tower";
}

function getTowerComputedProgress(tower: Tower, dockets: DocketRow[]) {
  const related = dockets.filter((d) => d.tower_id === tower.id);

  if (related.length > 0) {
    return related.reduce((max, docket) => {
      const assembly = Number(docket.assembly_percent || 0);
      const erection = Number(docket.erection_percent || 0);
      const weighted = Math.round(assembly * 0.5 + erection * 0.5);
      return Math.max(max, weighted);
    }, 0);
  }

  return safeNumber(tower.progress, 0);
}

function getDocketProgress(docket: DocketRow) {
  const assembly = safeNumber(docket.assembly_percent, 0);
  const erection = safeNumber(docket.erection_percent, 0);
  return clampPercent(Math.round(assembly * 0.5 + erection * 0.5));
}

function getDeliveredQty(row: DeliveryItemRow) {
  return safeNumber(row.qty_delivered ?? row.quantity_delivered ?? row.delivered_qty ?? row.qty, 0);
}

function getRequiredQty(row: MaterialBundleRow) {
  return safeNumber(row.qty_required ?? row.required_qty, 0);
}

function getStatusBadgeClasses(status: string) {
  const s = status.trim().toLowerCase();

  if (s === "ongoing" || s === "active" || s === "in progress") return "bg-green-100 text-green-700";
  if (s === "tendering" || s === "planning") return "bg-yellow-100 text-yellow-700";
  if (s === "complete" || s === "completed") return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-700";
}

function sectionCardClasses(tint: "blue" | "purple" | "emerald" | "amber" | "rose" | "slate") {
  switch (tint) {
    case "blue":
      return "bg-gradient-to-br from-blue-50 to-white border-blue-100";
    case "purple":
      return "bg-gradient-to-br from-violet-50 to-white border-violet-100";
    case "emerald":
      return "bg-gradient-to-br from-emerald-50 to-white border-emerald-100";
    case "amber":
      return "bg-gradient-to-br from-amber-50 to-white border-amber-100";
    case "rose":
      return "bg-gradient-to-br from-rose-50 to-white border-rose-100";
    default:
      return "bg-gradient-to-br from-slate-50 to-white border-slate-200";
  }
}

function MetricTile({
  title,
  value,
  subtitle,
  accent,
}: {
  title: string;
  value: string;
  subtitle?: string;
  accent: "blue" | "purple" | "emerald" | "amber" | "rose" | "slate";
}) {
  const accentBar =
    accent === "blue"
      ? "bg-blue-500"
      : accent === "purple"
      ? "bg-violet-500"
      : accent === "emerald"
      ? "bg-emerald-500"
      : accent === "amber"
      ? "bg-amber-500"
      : accent === "rose"
      ? "bg-rose-500"
      : "bg-slate-500";

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${sectionCardClasses(accent)}`}>
      <div className={`mb-4 h-1.5 w-14 rounded-full ${accentBar}`} />
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</div>
      {subtitle ? <div className="mt-2 text-sm text-slate-600">{subtitle}</div> : null}
    </div>
  );
}

function QuickActionCard({
  title,
  description,
  accent,
  onClick,
}: {
  title: string;
  description: string;
  accent: "blue" | "purple" | "emerald" | "amber";
  onClick: () => void;
}) {
  const styles =
    accent === "blue"
      ? { card: "from-blue-50 to-white border-blue-100", bar: "bg-blue-500" }
      : accent === "purple"
      ? { card: "from-violet-50 to-white border-violet-100", bar: "bg-violet-500" }
      : accent === "amber"
      ? { card: "from-amber-50 to-white border-amber-100", bar: "bg-amber-500" }
      : { card: "from-emerald-50 to-white border-emerald-100", bar: "bg-emerald-500" };

  return (
    <button
      onClick={onClick}
      className={`text-left rounded-2xl border bg-gradient-to-br p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all ${styles.card}`}
    >
      <div className={`mb-4 h-1.5 w-14 rounded-full ${styles.bar}`} />
      <div className="text-lg font-semibold text-slate-900">{title}</div>
      <div className="mt-2 text-sm leading-6 text-slate-600">{description}</div>
    </button>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
      <p className="text-slate-500 text-sm">{title}</p>
      <p className="text-3xl font-bold mt-2 text-slate-900">{value}</p>
      {subtitle ? <p className="text-sm text-slate-500 mt-2">{subtitle}</p> : null}
    </div>
  );
}

function SectionHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

export default function ProjectDashboard() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const supabase = createSupabaseBrowser();

  const [project, setProject] = useState<Project | null>(null);
  const [towers, setTowers] = useState<Tower[]>([]);
  const [dockets, setDockets] = useState<DocketRow[]>([]);
  const [labourRows, setLabourRows] = useState<LabourRow[]>([]);
  const [defects, setDefects] = useState<DefectRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [deliveryItems, setDeliveryItems] = useState<DeliveryItemRow[]>([]);
  const [materialBundles, setMaterialBundles] = useState<MaterialBundleRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [actionType, setActionType] = useState<QuickActionType>(null);
  const [towerSearch, setTowerSearch] = useState("");
  const [role, setRole] = useState<UserRole>(null);

  const [editingProject, setEditingProject] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: "", location: "", status: "", client: "" });

  const isAdmin = role === "admin";

  useEffect(() => {
    void load();
    void loadRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function loadRole() {
    const userRole = await getUserRole();
    setRole(userRole);
  }

  async function load() {
    setLoading(true);

    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select("id, name, status, client, location")
      .eq("id", projectId)
      .single();

    if (projectError) console.error("project load error", projectError);

    const { data: towersData, error: towersError } = await supabase
      .from("towers")
      .select("*")
      .eq("project_id", projectId)
      .order("name", { ascending: true });

    if (towersError) console.error("towers load error", towersError);

    const loadedTowers = (towersData as Tower[] | null) || [];
    const towerIds = loadedTowers.map((t) => t.id);

    const { data: docketsData, error: docketsError } = await supabase
      .from("tower_daily_dockets")
      .select("id, tower_id, project_id, docket_date, assembly_percent, erection_percent, crew, leading_hand")
      .eq("project_id", projectId);

    if (docketsError) console.error("dockets load error", docketsError);

    const loadedDockets = (docketsData as DocketRow[] | null) || [];
    const docketIds = loadedDockets.map((d) => d.id);

    let loadedLabourRows: LabourRow[] = [];
    if (docketIds.length > 0) {
      const labourTableCandidates = [
        "tower_docket_labour",
        "tower_daily_docket_labour",
        "tower_daily_docket_labour_rows",
      ];

      for (const table of labourTableCandidates) {
        const { data, error } = await supabase.from(table).select("docket_id, total_hours");
        if (!error && data) {
          loadedLabourRows = (data as LabourRow[]).filter((row) => docketIds.includes(row.docket_id));
          break;
        }
      }
    }

    let loadedDefects: DefectRow[] = [];
    if (towerIds.length > 0) {
      const { data, error } = await supabase
        .from("tower_defects")
        .select("id, tower_id, status")
        .in("tower_id", towerIds);

      if (!error && data) loadedDefects = data as DefectRow[];
      else if (error) console.error("defects load error", error);
    }

    let loadedMaterialBundles: MaterialBundleRow[] = [];
    if (towerIds.length > 0) {
      const { data, error } = await supabase
        .from("tower_required_bundles")
        .select("*")
        .in("tower_id", towerIds);

      if (!error && data) loadedMaterialBundles = data as MaterialBundleRow[];
      else if (error) console.error("materials load error", error);
    }

    let loadedDeliveries: DeliveryRow[] = [];
    if (towerIds.length > 0) {
      const deliveryTableCandidates = ["tower_bundle_deliveries", "tower_deliveries"];

      for (const table of deliveryTableCandidates) {
        const { data, error } = await supabase.from(table).select("*").in("tower_id", towerIds);
        if (!error && data) {
          loadedDeliveries = data as DeliveryRow[];
          break;
        }
        if (error) console.warn(`${table} load skipped`, error.message);
      }
    }

    const deliveryIds = loadedDeliveries.map((d) => d.id);

    let loadedDeliveryItems: DeliveryItemRow[] = [];
    if (deliveryIds.length > 0) {
      const deliveryItemCandidates = [
        "tower_bundle_delivery_items",
        "tower_delivery_items",
        "tower_delivered_items",
      ];

      for (const table of deliveryItemCandidates) {
        const { data, error } = await supabase.from(table).select("*").in("delivery_id", deliveryIds);
        if (!error && data) {
          loadedDeliveryItems = data as DeliveryItemRow[];
          break;
        }
        if (error) console.warn(`${table} load skipped`, error.message);
      }
    }

    const loadedProject = (projectData as Project | null) || null;

    setProject(loadedProject);
    setProjectForm({
      name: loadedProject?.name || "",
      location: loadedProject?.location || "",
      status: loadedProject?.status || "",
      client: loadedProject?.client || "",
    });
    setTowers(loadedTowers);
    setDockets(loadedDockets);
    setLabourRows(loadedLabourRows);
    setDefects(loadedDefects);
    setDeliveries(loadedDeliveries);
    setDeliveryItems(loadedDeliveryItems);
    setMaterialBundles(loadedMaterialBundles);
    setLoading(false);
  }

  const docketHoursById = useMemo(() => {
    const map = new Map<string, number>();
    labourRows.forEach((row) => {
      map.set(row.docket_id, (map.get(row.docket_id) || 0) + safeNumber(row.total_hours, 0));
    });
    return map;
  }, [labourRows]);

  const deliverySummaryByTowerId = useMemo(() => {
    const map = new Map<string, { requiredQty: number; deliveredQty: number; outstandingQty: number; deliveryPercent: number }>();

    towers.forEach((tower) => {
      const towerDeliveries = deliveries.filter((delivery) => delivery.tower_id === tower.id);
      const towerDeliveryIds = new Set(towerDeliveries.map((delivery) => delivery.id));

      const requiredQty = materialBundles
        .filter((bundle) => bundle.tower_id === tower.id)
        .reduce((sum, bundle) => sum + getRequiredQty(bundle), 0);

      const deliveredQty = deliveryItems
        .filter((item) => item.delivery_id && towerDeliveryIds.has(item.delivery_id))
        .reduce((sum, item) => sum + getDeliveredQty(item), 0);

      const outstandingQty = Math.max(0, requiredQty - deliveredQty);
      const deliveryPercent = requiredQty > 0 ? clampPercent((deliveredQty / requiredQty) * 100) : 0;

      map.set(tower.id, { requiredQty, deliveredQty, outstandingQty, deliveryPercent });
    });

    return map;
  }, [towers, deliveries, deliveryItems, materialBundles]);

  const towerProductionSummaries = useMemo<TowerProductionSummary[]>(() => {
    return towers.map((tower) => {
      const computedProgress = getTowerComputedProgress(tower, dockets);
      const computedWeight = getTowerWeightFromExtraData(tower.extra_data);
      const completedTonnes = computedWeight ? computedWeight * (computedProgress / 100) : null;

      const towerDocketIds = dockets.filter((d) => d.tower_id === tower.id).map((d) => d.id);
      const manhours = towerDocketIds.reduce((sum, docketId) => sum + (docketHoursById.get(docketId) || 0), 0);
      const productionMhPerTonne = completedTonnes && completedTonnes > 0 ? manhours / completedTonnes : null;

      return {
        ...tower,
        computedProgress,
        computedWeight,
        completedTonnes,
        manhours,
        productionMhPerTonne,
      };
    });
  }, [towers, dockets, docketHoursById]);

  const stats = useMemo<ProjectStats>(() => {
    const totalTowers = towers.length;

    const towersComplete = towerProductionSummaries.filter((tower) => tower.computedProgress >= 100).length;
    const towersInProgress = towerProductionSummaries.filter(
      (tower) => tower.computedProgress > 0 && tower.computedProgress < 100,
    ).length;
    const towersNotStarted = towerProductionSummaries.filter((tower) => tower.computedProgress <= 0).length;

    const deliveryTowersInProgress = towers.filter((tower) => {
      const summary = deliverySummaryByTowerId.get(tower.id);
      return summary && summary.deliveryPercent > 0 && summary.deliveryPercent < 100;
    }).length;

    const totalDockets = dockets.length;
    const totalManhours = labourRows.reduce((sum, row) => sum + safeNumber(row.total_hours, 0), 0);

    const totalTowerWeightRaw = towerProductionSummaries.reduce((sum, tower) => sum + safeNumber(tower.computedWeight, 0), 0);
    const totalTowerWeight = totalTowerWeightRaw > 0 ? totalTowerWeightRaw : null;

    const completedTonnesRaw = towerProductionSummaries.reduce((sum, tower) => sum + safeNumber(tower.completedTonnes, 0), 0);
    const completedTonnes = completedTonnesRaw > 0 ? completedTonnesRaw : null;

    const manhoursPerTonne = completedTonnes && completedTonnes > 0 ? totalManhours / completedTonnes : null;

    const totalDefects = defects.length;
    const openDefects = defects.filter((defect) => {
      const s = safeString(defect.status).trim().toLowerCase();
      return s !== "closed" && s !== "complete" && s !== "completed";
    }).length;

    const totalDeliveries = deliveries.length;

    const totalRequiredQty = towers.reduce((sum, tower) => sum + safeNumber(deliverySummaryByTowerId.get(tower.id)?.requiredQty, 0), 0);
    const deliveredQty = towers.reduce((sum, tower) => sum + safeNumber(deliverySummaryByTowerId.get(tower.id)?.deliveredQty, 0), 0);
    const outstandingQty = Math.max(0, totalRequiredQty - deliveredQty);
    const deliveryPercent = totalRequiredQty > 0 ? clampPercent((deliveredQty / totalRequiredQty) * 100) : 0;

    const latestDocketDate =
      dockets
        .map((d) => d.docket_date)
        .filter((d): d is string => !!d)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

    return {
      totalTowers,
      towersComplete,
      towersInProgress,
      towersNotStarted,
      deliveryTowersInProgress,
      totalDockets,
      totalManhours,
      totalTowerWeight,
      completedTonnes,
      manhoursPerTonne,
      openDefects,
      totalDefects,
      totalDeliveries,
      totalRequiredQty,
      deliveredQty,
      outstandingQty,
      deliveryPercent,
      latestDocketDate,
    };
  }, [towers, towerProductionSummaries, dockets, labourRows, defects, deliveries, deliverySummaryByTowerId]);

  const inProgressTowers = useMemo(() => {
    return towerProductionSummaries
      .filter((tower) => tower.computedProgress > 0 && tower.computedProgress < 100)
      .sort((a, b) => b.computedProgress - a.computedProgress)
      .slice(0, 8);
  }, [towerProductionSummaries]);

  const deliveryTowersInProgress = useMemo<TowerDeliverySummary[]>(() => {
    return towers
      .map((tower) => {
        const summary = deliverySummaryByTowerId.get(tower.id) || {
          requiredQty: 0,
          deliveredQty: 0,
          outstandingQty: 0,
          deliveryPercent: 0,
        };
        return { ...tower, ...summary };
      })
      .filter((tower) => tower.deliveryPercent > 0 && tower.deliveryPercent < 100)
      .sort((a, b) => b.deliveryPercent - a.deliveryPercent)
      .slice(0, 8);
  }, [towers, deliverySummaryByTowerId]);

  const crewProduction = useMemo<CrewProductionSummary[]>(() => {
    const towerWeightById = new Map<string, number>();
    towers.forEach((tower) => {
      towerWeightById.set(tower.id, safeNumber(getTowerWeightFromExtraData(tower.extra_data), 0));
    });

    const sortedDocketsByTower = new Map<string, DocketRow[]>();
    dockets.forEach((docket) => {
      if (!docket.tower_id) return;
      const arr = sortedDocketsByTower.get(docket.tower_id) || [];
      arr.push(docket);
      sortedDocketsByTower.set(docket.tower_id, arr);
    });

    sortedDocketsByTower.forEach((arr, towerId) => {
      arr.sort((a, b) => {
        const ad = a.docket_date ? new Date(a.docket_date).getTime() : 0;
        const bd = b.docket_date ? new Date(b.docket_date).getTime() : 0;
        return ad - bd;
      });
      sortedDocketsByTower.set(towerId, arr);
    });

    const rows = new Map<string, CrewProductionSummary>();

    sortedDocketsByTower.forEach((towerDockets, towerId) => {
      const towerWeight = towerWeightById.get(towerId) || 0;
      let previousProgress = 0;

      towerDockets.forEach((docket) => {
        const crewName = safeString(docket.crew || docket.leading_hand || "Unassigned Crew", "Unassigned Crew").trim() || "Unassigned Crew";
        const currentProgress = getDocketProgress(docket);
        const progressDelta = Math.max(0, currentProgress - previousProgress);
        const productionTonnes = towerWeight > 0 ? towerWeight * (progressDelta / 100) : 0;
        const hours = docketHoursById.get(docket.id) || 0;

        const existing = rows.get(crewName) || {
          crewName,
          docketCount: 0,
          totalHours: 0,
          productionTonnes: 0,
          mhPerTonne: null,
          tonnesPerHour: null,
          lastDocketDate: null,
        };

        existing.docketCount += 1;
        existing.totalHours += hours;
        existing.productionTonnes += productionTonnes;
        if (
          docket.docket_date &&
          (!existing.lastDocketDate || new Date(docket.docket_date).getTime() > new Date(existing.lastDocketDate).getTime())
        ) {
          existing.lastDocketDate = docket.docket_date;
        }

        rows.set(crewName, existing);
        previousProgress = Math.max(previousProgress, currentProgress);
      });
    });

    return Array.from(rows.values())
      .map((row) => ({
        ...row,
        mhPerTonne: row.productionTonnes > 0 ? row.totalHours / row.productionTonnes : null,
        tonnesPerHour: row.totalHours > 0 ? row.productionTonnes / row.totalHours : null,
      }))
      .sort((a, b) => {
        if (a.mhPerTonne === null && b.mhPerTonne === null) return b.totalHours - a.totalHours;
        if (a.mhPerTonne === null) return 1;
        if (b.mhPerTonne === null) return -1;
        return a.mhPerTonne - b.mhPerTonne;
      })
      .slice(0, 6);
  }, [towers, dockets, docketHoursById]);

  const filteredTowers = useMemo(() => {
    const q = towerSearch.trim().toLowerCase();
    const sorted = [...towers].sort((a, b) => getTowerDisplayName(a).localeCompare(getTowerDisplayName(b)));
    if (!q) return sorted;

    return sorted.filter((tower) => {
      const text = [getTowerDisplayName(tower), safeString(tower.line), safeString(tower.status)].join(" ").toLowerCase();
      return text.includes(q);
    });
  }, [towers, towerSearch]);

  function openAction(type: QuickActionType) {
    setActionType(type);
    setTowerSearch("");
  }

  function closeAction() {
    setActionType(null);
    setTowerSearch("");
  }

  function startEditingProject() {
    if (!project) return;
    setProjectForm({
      name: project.name || "",
      location: project.location || "",
      status: project.status || "",
      client: project.client || "",
    });
    setEditingProject(true);
  }

  function cancelEditingProject() {
    if (project) {
      setProjectForm({
        name: project.name || "",
        location: project.location || "",
        status: project.status || "",
        client: project.client || "",
      });
    }
    setEditingProject(false);
  }

  async function saveProjectDetails() {
    if (!project) return;
    setSavingProject(true);

    const payload = {
      name: projectForm.name.trim(),
      location: projectForm.location.trim(),
      status: projectForm.status.trim(),
      client: projectForm.client.trim(),
    };

    const { data, error } = await supabase
      .from("projects")
      .update(payload)
      .eq("id", project.id)
      .select("id, name, status, client, location")
      .single();

    setSavingProject(false);

    if (error) {
      console.error("project update error", error);
      alert("Failed to update project details.");
      return;
    }

    setProject((data as Project) || null);
    setEditingProject(false);
  }

  function goToTowerAction(towerId: string) {
    if (!actionType) return;
    if (actionType === "docket") router.push(`/project/${projectId}/tower/${towerId}/dockets`);
    if (actionType === "delivery" || actionType === "delivery-progress") router.push(`/project/${projectId}/tower/${towerId}/deliveries`);
    if (actionType === "materials") router.push(`/project/${projectId}/tower/${towerId}/materials`);
  }

  function getActionTitle(type: QuickActionType) {
    if (type === "docket") return "Select tower for Daily Docket";
    if (type === "delivery") return "Select tower for Delivery";
    if (type === "delivery-progress") return "Select delivery tower in progress";
    if (type === "materials") return "Select tower for Materials";
    return "Select Tower";
  }

  function getActionSubtitle(type: QuickActionType) {
    if (type === "docket") return "Choose a tower, then open its Daily Dockets page.";
    if (type === "delivery") return "Choose a tower, then open its Deliveries page.";
    if (type === "delivery-progress") return "Choose a tower with delivery underway, then open its Deliveries page.";
    if (type === "materials") return "Choose a tower, then open its Materials page.";
    return "";
  }

  if (loading) return <div className="p-8">Loading project dashboard...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-8 space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {!editingProject ? (
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">{project?.name || `Project ${projectId}`}</h1>
              <p className="mt-2 text-slate-600">Project-wide overview across all assigned towers.</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Status</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{project?.status || "-"}</div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Location</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{project?.location || "-"}</div>
              </div>

              {isAdmin && (
                <button onClick={startEditingProject} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium hover:bg-slate-50">
                  Edit Project
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Edit Project Details</h1>
                <p className="mt-2 text-slate-600">Update project name, location and other high-level details.</p>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button onClick={cancelEditingProject} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">
                  Cancel
                </button>
                <button onClick={saveProjectDetails} disabled={savingProject} className="rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
                  {savingProject ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Project Name</label>
                <input className="w-full border border-slate-300 rounded-xl px-3 py-2.5" value={projectForm.name} onChange={(e) => setProjectForm((prev) => ({ ...prev, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Location</label>
                <input className="w-full border border-slate-300 rounded-xl px-3 py-2.5" value={projectForm.location} onChange={(e) => setProjectForm((prev) => ({ ...prev, location: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Status</label>
                <input className="w-full border border-slate-300 rounded-xl px-3 py-2.5" value={projectForm.status} onChange={(e) => setProjectForm((prev) => ({ ...prev, status: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Client</label>
                <input className="w-full border border-slate-300 rounded-xl px-3 py-2.5" value={projectForm.client} onChange={(e) => setProjectForm((prev) => ({ ...prev, client: e.target.value }))} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-7 gap-4">
        <StatCard title="Total Towers" value={String(stats.totalTowers)} subtitle={`${stats.towersInProgress} tower progress in progress`} />
        <StatCard title="Towers Complete" value={String(stats.towersComplete)} subtitle={`${stats.towersNotStarted} not started`} />
        <StatCard title="Delivery Towers In Progress" value={String(stats.deliveryTowersInProgress)} subtitle={`${formatDecimal(stats.deliveryPercent, 0)}% project delivery`} />
        <StatCard title="Open Defects" value={String(stats.openDefects)} subtitle={`${stats.totalDefects} total defects`} />
        <StatCard title="Daily Dockets" value={String(stats.totalDockets)} subtitle={`Latest: ${formatDate(stats.latestDocketDate)}`} />
        <StatCard title="Total Manhours" value={formatDecimal(stats.totalManhours, 1)} subtitle={stats.completedTonnes !== null ? `${formatDecimal(stats.completedTonnes, 2)} completed tonnes` : "No completed tonnes yet"} />
        <StatCard title="Project MH/t" value={formatDecimal(stats.manhoursPerTonne, 2)} subtitle={stats.totalTowerWeight !== null ? `${formatDecimal(stats.totalTowerWeight, 2)} total tower weight` : "Tower weights not found"} />
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader title="Quick Actions" subtitle="Jump straight into common project tasks by selecting a tower." />

        <div className="mt-6 grid md:grid-cols-2 xl:grid-cols-4 gap-6">
          <QuickActionCard title="Add Daily Docket" description="Choose a tower and jump into its Daily Dockets page." accent="blue" onClick={() => openAction("docket")} />
          <QuickActionCard title="Add Delivery" description="Choose a tower and jump into its Deliveries page." accent="emerald" onClick={() => openAction("delivery")} />
          <QuickActionCard title="Delivery Towers In Progress" description="Open a tower where delivery has started but is not complete." accent="amber" onClick={() => openAction("delivery-progress")} />
          <QuickActionCard title="Search Materials" description="Choose a tower and jump into its Materials page." accent="purple" onClick={() => openAction("materials")} />
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader title="Current Towers In Progress" subtitle="Key live towers currently moving in this project." />

          {inProgressTowers.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">No towers currently in progress.</div>
          ) : (
            <div className="mt-6 space-y-3">
              {inProgressTowers.map((tower) => (
                <Link key={tower.id} href={`/project/${projectId}/tower/${tower.id}`} className="block">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:bg-slate-100 transition">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-base font-semibold text-slate-900">{getTowerDisplayName(tower)}</div>
                        <div className="text-sm text-slate-500 mt-1">
                          {tower.line || "Line not set"} • MH/t {formatDecimal(tower.productionMhPerTonne, 2)}
                        </div>
                      </div>

                      <div className="min-w-[120px] text-right">
                        <div className="text-sm font-semibold text-slate-900">{tower.computedProgress}%</div>
                        <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${clampPercent(tower.computedProgress)}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader title="Delivery Towers In Progress" subtitle="Towers where deliveries have started but still have outstanding material." />

          {deliveryTowersInProgress.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">No delivery towers currently in progress.</div>
          ) : (
            <div className="mt-6 space-y-3">
              {deliveryTowersInProgress.map((tower) => (
                <Link key={tower.id} href={`/project/${projectId}/tower/${tower.id}/deliveries`} className="block">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:bg-slate-100 transition">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-base font-semibold text-slate-900">{getTowerDisplayName(tower)}</div>
                        <div className="text-sm text-slate-500 mt-1">
                          Delivered {formatDecimal(tower.deliveredQty, 0)} / {formatDecimal(tower.requiredQty, 0)} • Outstanding {formatDecimal(tower.outstandingQty, 0)}
                        </div>
                      </div>

                      <div className="min-w-[120px] text-right">
                        <div className="text-sm font-semibold text-slate-900">{formatDecimal(tower.deliveryPercent, 0)}%</div>
                        <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${clampPercent(tower.deliveryPercent)}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader title="Crew Production Comparison" subtitle="Compares crew production using docket progress gain, tower weight and docket manhours." />

          {crewProduction.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">No crew production data yet.</div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-3 pr-4 font-medium">Crew</th>
                    <th className="py-3 pr-4 font-medium">Dockets</th>
                    <th className="py-3 pr-4 font-medium">Hours</th>
                    <th className="py-3 pr-4 font-medium">Prod. Tonnes</th>
                    <th className="py-3 pr-4 font-medium">MH/t</th>
                    <th className="py-3 pr-4 font-medium">t/hr</th>
                  </tr>
                </thead>
                <tbody>
                  {crewProduction.map((crew) => (
                    <tr key={crew.crewName} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 pr-4 font-semibold text-slate-900">{crew.crewName}</td>
                      <td className="py-3 pr-4 text-slate-600">{crew.docketCount}</td>
                      <td className="py-3 pr-4 text-slate-600">{formatDecimal(crew.totalHours, 1)}</td>
                      <td className="py-3 pr-4 text-slate-600">{formatDecimal(crew.productionTonnes, 2)}</td>
                      <td className="py-3 pr-4 font-semibold text-slate-900">{formatDecimal(crew.mhPerTonne, 2)}</td>
                      <td className="py-3 pr-4 text-slate-600">{formatDecimal(crew.tonnesPerHour, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader title="Project Logistics" subtitle="High-level delivery and material movement across the project." />

          <div className="mt-6 grid grid-cols-2 gap-4">
            <MetricTile title="Delivery Records" value={String(stats.totalDeliveries)} subtitle="logged delivery events" accent="blue" />
            <MetricTile title="Delivered Qty" value={formatDecimal(stats.deliveredQty, 0)} subtitle={`of ${formatDecimal(stats.totalRequiredQty, 0)} required`} accent="emerald" />
            <MetricTile title="Outstanding Qty" value={formatDecimal(stats.outstandingQty, 0)} subtitle="still to arrive" accent="rose" />
            <MetricTile title="Delivery Progress" value={`${formatDecimal(stats.deliveryPercent, 0)}%`} subtitle="delivered vs required" accent="amber" />
          </div>

          <div className="mt-6 h-4 rounded-full overflow-hidden bg-slate-100">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600" style={{ width: `${stats.deliveryPercent}%` }} />
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader title="Project Towers" subtitle="Open any tower dashboard in this project. Production rate is shown as MH/t where tower weight and docket hours are available." />

        {towers.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">No towers found in this project yet.</div>
        ) : (
          <div className="mt-6 grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {towerProductionSummaries.map((tower) => {
              const deliverySummary = deliverySummaryByTowerId.get(tower.id) || { deliveryPercent: 0 };

              return (
                <Link key={tower.id} href={`/project/${projectId}/tower/${tower.id}`}>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-slate-900">{getTowerDisplayName(tower)}</div>
                        <div className="text-sm text-slate-500 mt-1">{tower.line || "Line not set"}</div>
                      </div>

                      <span className={`inline-block text-xs px-3 py-1 rounded-full ${getStatusBadgeClasses(safeString(tower.status, ""))}`}>{tower.status || "unknown"}</span>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                      <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                        <div className="text-slate-500 text-xs">Progress</div>
                        <div className="mt-1 font-bold text-slate-900">{tower.computedProgress}%</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                        <div className="text-slate-500 text-xs">MH/t</div>
                        <div className="mt-1 font-bold text-slate-900">{formatDecimal(tower.productionMhPerTonne, 2)}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                        <div className="text-slate-500 text-xs">Delivery</div>
                        <div className="mt-1 font-bold text-slate-900">{formatDecimal(deliverySummary.deliveryPercent, 0)}%</div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between text-sm text-slate-600">
                        <span>Tower Progress</span>
                        <span className="font-semibold text-slate-900">{tower.computedProgress}%</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${clampPercent(tower.computedProgress)}%` }} />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {actionType && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-3xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900">{getActionTitle(actionType)}</h2>
                  <p className="mt-2 text-sm text-slate-600">{getActionSubtitle(actionType)}</p>
                </div>

                <button onClick={closeAction} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50">
                  Close
                </button>
              </div>

              <div className="mt-4">
                <input value={towerSearch} onChange={(e) => setTowerSearch(e.target.value)} placeholder="Search tower name, line or status..." className="w-full border border-slate-300 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="p-6 max-h-[60vh] overflow-auto">
              {filteredTowers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">No towers match your search.</div>
              ) : (
                <div className="space-y-3">
                  {filteredTowers.map((tower) => {
                    const computedProgress = getTowerComputedProgress(tower, dockets);
                    const deliverySummary = deliverySummaryByTowerId.get(tower.id) || { deliveryPercent: 0 };

                    if (actionType === "delivery-progress" && !(deliverySummary.deliveryPercent > 0 && deliverySummary.deliveryPercent < 100)) {
                      return null;
                    }

                    return (
                      <button key={tower.id} onClick={() => goToTowerAction(tower.id)} className="w-full text-left rounded-2xl border border-slate-200 bg-white p-4 hover:bg-slate-50 transition">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="font-semibold text-slate-900">{getTowerDisplayName(tower)}</div>
                            <div className="text-sm text-slate-500 mt-1">
                              {tower.line || "Line not set"} • {tower.status || "Status not set"}
                            </div>
                          </div>

                          <div className="min-w-[120px] text-right">
                            <div className="text-sm font-semibold text-slate-900">
                              {actionType === "delivery-progress" ? `${formatDecimal(deliverySummary.deliveryPercent, 0)}% delivery` : `${computedProgress}%`}
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
                              <div className={`h-full rounded-full ${actionType === "delivery-progress" ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${clampPercent(actionType === "delivery-progress" ? deliverySummary.deliveryPercent : computedProgress)}%` }} />
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
