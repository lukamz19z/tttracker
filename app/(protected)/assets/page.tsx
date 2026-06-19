"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  CalendarClock,
  ClipboardCheck,
  FileWarning,
  PackageCheck,
  Plus,
  RefreshCw,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import {
  ActionButton,
  DetailGrid,
  KpiCard,
  PageHeader,
  PageShell,
  StatusBadge,
} from "./components";

type Tone = "slate" | "blue" | "emerald" | "amber" | "rose" | "violet";

type VehicleAsset = {
  id: string;
  vehicle_id: string | null;
  vehicle_rego: string | null;
  make: string | null;
  model: string | null;
  category: string | null;
  project: string | null;
  crew: string | null;
  status: string | null;
  rego_expiry: string | null;
  insurance_expiry: string | null;
  next_service_due: string | null;
  next_service_km: number | null;
  next_inspection_due: string | null;
  created_at: string | null;
};

type PlantAsset = {
  id: string;
  asset_id: string | null;
  plant_id?: string | null;
  make: string | null;
  model: string | null;
  plant_type: string | null;
  category?: string | null;
  project: string | null;
  crew: string | null;
  asset_status: string | null;
  status?: string | null;
  rego_expiry: string | null;
  insurance_expiry: string | null;
  cranesafe_expiry: string | null;
  created_at: string | null;
};

type FleetJob = {
  id: string;
  job_number: string | null;
  title: string | null;
  description: string | null;
  asset_label: string | null;
  asset_type: string | null;
  vehicle_asset_id: string | null;
  vehicle_id: string | null;
  plant_id: string | null;
  source_type: string | null;
  source: string | null;
  priority: string | null;
  status: string | null;
  project: string | null;
  crew: string | null;
  reported_by: string | null;
  assigned_to: string | null;
  vendor: string | null;
  due_date: string | null;
  completed_date: string | null;
  closed_at?: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type FleetJobUpdate = {
  id: string;
  fleet_job_id: string;
  update_type: string | null;
  status: string | null;
  comment: string | null;
  created_at: string | null;
};

type AssetHistory = {
  id: string;
  fleet_job_id: string | null;
  history_type: string | null;
  history_date: string | null;
  title: string | null;
  created_at: string | null;
};

type PrestartRecord = {
  id: string;
  vehicle_asset_id: string | null;
  asset_label: string | null;
  vehicle_rego: string | null;
  kilometres?: number | null;
  inspected_by_name: string | null;
  employee_name?: string | null;
  overall_condition: string | null;
  result: string | null;
  severity: string | null;
  comments: string | null;
  fleet_job_id: string | null;
  prestart_date: string | null;
  created_at: string | null;
};

type LiftingGear = {
  id: string;
  serial_id: string | null;
  equipment_type: string | null;
  description: string | null;
  status: string | null;
  next_inspection_due: string | null;
  crew_label?: string | null;
  crew?: string | null;
};

type TorqueWrench = {
  id: string;
  tool_id?: string | null;
  serial_number: string | null;
  status: string | null;
  expiry_date?: string | null;
  calibration_due?: string | null;
  crew?: string | null;
};

type Ladder = {
  id: string;
  ladder_id?: string | null;
  type?: string | null;
  size?: string | null;
  status: string | null;
  next_inspection_due?: string | null;
  crew?: string | null;
};

type Generator = {
  id: string;
  generator_id?: string | null;
  make?: string | null;
  model?: string | null;
  serial_number?: string | null;
  status: string | null;
  next_service_due?: string | null;
  crew?: string | null;
};

type PpeStock = {
  id: string;
  item_name?: string | null;
  name?: string | null;
  stock_on_hand?: number | null;
  quantity?: number | null;
  minimum_stock?: number | null;
  min_stock?: number | null;
};

type InventoryKit = {
  id: string;
  kit_type?: string | null;
  name?: string | null;
  asset_label?: string | null;
  expiry_date?: string | null;
  next_inspection_due?: string | null;
  status?: string | null;
};

type Reminder = {
  id: string;
  title: string;
  detail: string;
  dueDate: string | null;
  href: string;
  tone: Tone;
};

type ActionItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  badge: string;
  tone: Tone;
  date?: string | null;
};

type DataState = {
  vehicles: VehicleAsset[];
  plant: PlantAsset[];
  fleetJobs: FleetJob[];
  fleetJobUpdates: FleetJobUpdate[];
  assetHistory: AssetHistory[];
  prestarts: PrestartRecord[];
  liftingGear: LiftingGear[];
  torqueWrenches: TorqueWrench[];
  ladders: Ladder[];
  generators: Generator[];
  ppeStock: PpeStock[];
  kits: InventoryKit[];
};

const blankData: DataState = {
  vehicles: [],
  plant: [],
  fleetJobs: [],
  fleetJobUpdates: [],
  assetHistory: [],
  prestarts: [],
  liftingGear: [],
  torqueWrenches: [],
  ladders: [],
  generators: [],
  ppeStock: [],
  kits: [],
};

function clean(value: string | null | undefined) {
  return value?.trim() || "N/A";
}

function optional(value: string | null | undefined) {
  return value?.trim() || "";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  return Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
}

function assetStatusIsActive(status: string | null | undefined) {
  const value = clean(status).toLowerCase();

  return ![
    "inactive",
    "retired",
    "superseded",
    "off hire",
    "no longer hired",
    "not hired",
    "disposed",
  ].includes(value);
}

function assetStatusIsUnavailable(status: string | null | undefined) {
  const value = clean(status).toLowerCase();

  return [
    "out of service",
    "under maintenance",
    "maintenance",
    "off hire",
    "inactive",
    "retired",
    "superseded",
    "no longer hired",
    "not hired",
    "failed",
  ].includes(value);
}

function isClosedStatus(status: string | null | undefined) {
  return ["closed", "complete", "completed", "resolved", "cancelled", "canceled", "actioned"].includes(
    clean(status).toLowerCase(),
  );
}

function latestUpdateForJob(
  updates: FleetJobUpdate[],
  jobId: string,
  types: string[],
) {
  return updates.find(
    (update) =>
      update.fleet_job_id === jobId &&
      types.includes(clean(update.update_type)),
  );
}

function isFleetJobActive(
  job: FleetJob,
  assetHistory: AssetHistory[],
  updates: FleetJobUpdate[],
) {
  const latestCloseOut = latestUpdateForJob(updates, job.id, [
    "Close Out",
    "Close Out Edited",
  ]);
  const latestReopen = latestUpdateForJob(updates, job.id, ["Reopened"]);
  const hasAssetHistoryCloseOut = assetHistory.some(
    (record) => record.fleet_job_id === job.id,
  );

  const reopenedAfterCloseOut = Boolean(
    latestReopen?.created_at &&
      latestCloseOut?.created_at &&
      new Date(latestReopen.created_at).getTime() >
        new Date(latestCloseOut.created_at).getTime(),
  );

  if (reopenedAfterCloseOut) return true;
  if (latestReopen && !isClosedStatus(job.status)) return true;
  if (isClosedStatus(job.status)) return false;
  if (job.completed_date || job.closed_at) return false;
  if (latestCloseOut || hasAssetHistoryCloseOut) return false;

  return true;
}

function statusTone(status: string | null | undefined): Tone {
  const value = clean(status).toLowerCase();

  if (["completed", "closed", "resolved", "compliant", "available", "active"].includes(value)) {
    return "emerald";
  }

  if (["in progress", "booked", "in use", "on hire"].includes(value)) return "blue";
  if (value.includes("waiting") || value.includes("due soon") || value.includes("review")) return "amber";
  if (value.includes("open") || value.includes("failed") || value.includes("expired") || value.includes("critical")) return "rose";

  return "slate";
}

function priorityTone(priority: string | null | undefined): Tone {
  const value = clean(priority).toLowerCase();
  if (["critical", "urgent", "high"].includes(value)) return "rose";
  if (["medium", "moderate"].includes(value)) return "amber";
  if (["low"].includes(value)) return "blue";
  return "slate";
}

function dueTone(value: string | null | undefined): Tone {
  const days = daysUntil(value);
  if (days === null) return "slate";
  if (days < 0) return "rose";
  if (days <= 30) return "amber";
  return "emerald";
}

function vehicleLabel(vehicle: VehicleAsset) {
  const id = optional(vehicle.vehicle_id);
  const rego = optional(vehicle.vehicle_rego);
  const makeModel = [vehicle.make, vehicle.model]
    .map(optional)
    .filter(Boolean)
    .join(" ");

  if (id && makeModel) return `${id} - ${makeModel}`;
  if (id) return id;
  if (rego) return rego;
  if (makeModel) return makeModel;
  return "Vehicle";
}

function plantLabel(asset: PlantAsset) {
  const id = optional(asset.asset_id || asset.plant_id);
  const makeModel = [asset.make, asset.model]
    .map(optional)
    .filter(Boolean)
    .join(" ");

  if (id && makeModel) return `${id} - ${makeModel}`;
  if (id) return id;
  if (makeModel) return makeModel;
  return "Plant";
}

function equipmentStatusCount(items: Array<{ status: string | null | undefined }>, status: string) {
  return items.filter((item) => clean(item.status).toLowerCase() === status.toLowerCase()).length;
}

async function safeSelect<T>(query: PromiseLike<{ data: unknown; error: unknown }>) {
  const result = await query;
  if (result.error) return [] as T[];
  return ((result.data as T[] | null) ?? []) as T[];
}

function Panel({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-950">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
        {count !== undefined ? <StatusBadge label={String(count)} tone="slate" /> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
      {text}
    </div>
  );
}

function ActionRow({ item }: { item: ActionItem }) {
  return (
    <Link
      href={item.href}
      className="block border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={item.badge} tone={item.tone} />
            {item.date ? (
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {formatDate(item.date)}
              </span>
            ) : null}
          </div>
          <p className="mt-2 font-bold text-slate-950">{item.title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
        </div>
        <ArrowRight size={16} className="mt-1 shrink-0 text-slate-400" />
      </div>
    </Link>
  );
}

function ReminderRow({ reminder }: { reminder: Reminder }) {
  const days = daysUntil(reminder.dueDate);
  const label = days === null ? "Review" : days < 0 ? "Expired" : days <= 30 ? "Due Soon" : "Upcoming";

  return (
    <Link
      href={reminder.href}
      className="block border border-slate-200 bg-slate-50 p-4 transition hover:bg-white"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-slate-950">{reminder.title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{reminder.detail}</p>
          <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">
            {formatDate(reminder.dueDate)}
          </p>
        </div>
        <StatusBadge label={label} tone={reminder.tone} />
      </div>
    </Link>
  );
}

export default function AssetsDashboardPage() {
  const supabase = useMemo(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment variables.");
    }

    return createClient(supabaseUrl, supabaseAnonKey);
  }, []);

  const [data, setData] = useState<DataState>(blankData);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const [
        vehicles,
        plant,
        fleetJobs,
        assetHistory,
        fleetJobUpdates,
        prestarts,
        liftingGear,
        torqueWrenches,
        ladders,
        generators,
        ppeStock,
        kits,
      ] = await Promise.all([
        safeSelect<VehicleAsset>(supabase.from("vehicle_assets").select("*")),
        safeSelect<PlantAsset>(supabase.from("plant_assets").select("*")),
        safeSelect<FleetJob>(supabase.from("fleet_jobs").select("*")),
        safeSelect<AssetHistory>(
          supabase
            .from("asset_history")
            .select("id, fleet_job_id, history_type, history_date, title, created_at")
            .not("fleet_job_id", "is", null),
        ),
        safeSelect<FleetJobUpdate>(
          supabase
            .from("fleet_job_updates")
            .select("id, fleet_job_id, update_type, status, comment, created_at")
            .order("created_at", { ascending: false }),
        ),
        safeSelect<PrestartRecord>(
          supabase
            .from("vehicle_prestarts")
            .select("*")
            .order("prestart_date", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(20),
        ),
        safeSelect<LiftingGear>(supabase.from("equipment_lifting_gear").select("*")),
        safeSelect<TorqueWrench>(supabase.from("equipment_torque_wrenches").select("*")),
        safeSelect<Ladder>(supabase.from("equipment_ladders").select("*")),
        safeSelect<Generator>(supabase.from("equipment_generators").select("*")),
        safeSelect<PpeStock>(supabase.from("inventory_ppe_stock").select("*")),
        safeSelect<InventoryKit>(supabase.from("inventory_kits").select("*")),
      ]);

      setData({
        vehicles,
        plant,
        fleetJobs,
        assetHistory,
        fleetJobUpdates,
        prestarts,
        liftingGear,
        torqueWrenches,
        ladders,
        generators,
        ppeStock,
        kits,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The asset dashboard could not be loaded.",
      );
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  const dashboard = useMemo(() => {
    const activeVehicles = data.vehicles.filter((vehicle) => assetStatusIsActive(vehicle.status));
    const activePlant = data.plant.filter((asset) => assetStatusIsActive(asset.asset_status || asset.status));
    const activeFleetJobs = data.fleetJobs.filter((job) =>
      isFleetJobActive(job, data.assetHistory, data.fleetJobUpdates),
    );

    const waitingParts = activeFleetJobs.filter((job) =>
      clean(job.status).toLowerCase().includes("waiting"),
    );

    const highPriorityJobs = activeFleetJobs.filter((job) =>
      ["critical", "urgent", "high"].includes(clean(job.priority).toLowerCase()),
    );

    const prestartFlags = data.prestarts.filter((record) => {
      const text = [record.result, record.severity, record.overall_condition, record.comments]
        .map(clean)
        .join(" ")
        .toLowerCase();

      return ["fail", "failed", "fault", "defect", "minor", "major", "critical", "no"].some((word) =>
        text.includes(word),
      );
    });

    const unavailableAssets =
      data.vehicles.filter((vehicle) => assetStatusIsUnavailable(vehicle.status)).length +
      data.plant.filter((asset) => assetStatusIsUnavailable(asset.asset_status || asset.status)).length +
      data.liftingGear.filter((item) => assetStatusIsUnavailable(item.status)).length +
      data.torqueWrenches.filter((item) => assetStatusIsUnavailable(item.status)).length +
      data.ladders.filter((item) => assetStatusIsUnavailable(item.status)).length +
      data.generators.filter((item) => assetStatusIsUnavailable(item.status)).length;

    const reminders: Reminder[] = [];

    for (const vehicle of activeVehicles) {
      const label = vehicleLabel(vehicle);
      const href = `/assets/vehicles/${vehicle.id}`;
      const updateHref = `/assets/vehicles/${vehicle.id}/update`;

      [
        { key: "rego", title: `${label} rego`, date: vehicle.rego_expiry, detail: "Registration needs renewal", href: updateHref },
        { key: "insurance", title: `${label} insurance`, date: vehicle.insurance_expiry, detail: "Insurance expiry needs review", href: updateHref },
        { key: "service", title: `${label} service`, date: vehicle.next_service_due, detail: "Vehicle service date trigger", href },
        { key: "inspection", title: `${label} inspection`, date: vehicle.next_inspection_due, detail: "Vehicle inspection due", href: updateHref },
      ].forEach((item) => {
        const days = daysUntil(item.date);
        if (days !== null && days <= 45) {
          reminders.push({
            id: `vehicle-${item.key}-${vehicle.id}`,
            title: item.title,
            detail: item.detail,
            dueDate: item.date,
            href: item.href,
            tone: dueTone(item.date),
          });
        }
      });
    }

    for (const asset of activePlant) {
      const label = plantLabel(asset);
      const href = `/assets/plant/${asset.id}`;
      const updateHref = `/assets/plant/${asset.id}/update`;

      [
        { key: "rego", title: `${label} rego`, date: asset.rego_expiry, detail: "Plant registration needs renewal", href: updateHref },
        { key: "insurance", title: `${label} insurance`, date: asset.insurance_expiry, detail: "Plant insurance expiry needs review", href: updateHref },
        { key: "cranesafe", title: `${label} CraneSafe`, date: asset.cranesafe_expiry, detail: "CraneSafe certificate due", href },
      ].forEach((item) => {
        const days = daysUntil(item.date);
        if (days !== null && days <= 45) {
          reminders.push({
            id: `plant-${item.key}-${asset.id}`,
            title: item.title,
            detail: item.detail,
            dueDate: item.date,
            href: item.href,
            tone: dueTone(item.date),
          });
        }
      });
    }

    for (const item of data.liftingGear) {
      const days = daysUntil(item.next_inspection_due);
      if (days !== null && days <= 45) {
        reminders.push({
          id: `lifting-${item.id}`,
          title: `${clean(item.serial_id)} ${clean(item.equipment_type)}`,
          detail: "Lifting gear inspection due",
          dueDate: item.next_inspection_due,
          href: "/assets/equipment/lifting-gear",
          tone: dueTone(item.next_inspection_due),
        });
      }
    }

    for (const kit of data.kits) {
      const dueDate = kit.expiry_date || kit.next_inspection_due || null;
      const days = daysUntil(dueDate);
      if (days !== null && days <= 45) {
        reminders.push({
          id: `kit-${kit.id}`,
          title: clean(kit.asset_label || kit.name || kit.kit_type),
          detail: "First aid / snake bite kit expiry or inspection due",
          dueDate,
          href: "/assets/equipment/inventory",
          tone: dueTone(dueDate),
        });
      }
    }

    const lowStock = data.ppeStock.filter((item) => {
      const stock = item.stock_on_hand ?? item.quantity ?? 0;
      const min = item.minimum_stock ?? item.min_stock ?? 0;
      return stock <= min;
    });

    const actionItems: ActionItem[] = [
      ...highPriorityJobs.map((job) => ({
        id: `job-${job.id}`,
        title: `${clean(job.job_number)} · ${clean(job.title)}`,
        detail: `${clean(job.asset_label)} — ${clean(job.description)}`,
        href: `/assets/fleet-jobs/${job.id}`,
        badge: clean(job.priority),
        tone: priorityTone(job.priority),
        date: job.created_at,
      })),
      ...waitingParts.map((job) => ({
        id: `parts-${job.id}`,
        title: `${clean(job.job_number)} waiting for parts`,
        detail: `${clean(job.asset_label)} — follow up supplier / mechanic status.`,
        href: `/assets/fleet-jobs/${job.id}`,
        badge: "Waiting Parts",
        tone: "amber" as Tone,
        date: job.updated_at || job.created_at,
      })),
      ...reminders
        .filter((item) => item.tone === "rose" || item.tone === "amber")
        .map((item) => ({
          id: `reminder-${item.id}`,
          title: item.title,
          detail: item.detail,
          href: item.href,
          badge: item.tone === "rose" ? "Expired" : "Due Soon",
          tone: item.tone,
          date: item.dueDate,
        })),
      ...lowStock.map((item) => ({
        id: `stock-${item.id}`,
        title: `${clean(item.item_name || item.name)} stock low`,
        detail: `Current stock: ${item.stock_on_hand ?? item.quantity ?? 0}. Minimum: ${item.minimum_stock ?? item.min_stock ?? 0}.`,
        href: "/assets/equipment/inventory",
        badge: "Low Stock",
        tone: "amber" as Tone,
      })),
    ];

    const recentActivity = [
      ...data.prestarts.slice(0, 6).map((record) => ({
        id: `prestart-${record.id}`,
        title: `Prestart · ${clean(record.asset_label || record.vehicle_rego)}`,
        detail: `${clean(record.result)} ${record.comments ? `— ${record.comments}` : ""}`,
        href: `/assets/prestarts/${record.id}`,
        date: record.prestart_date || record.created_at,
        tone: statusTone(record.severity || record.result),
      })),
      ...data.assetHistory.slice(0, 6).map((record) => ({
        id: `history-${record.id}`,
        title: `${clean(record.history_type)} · ${clean(record.title)}`,
        detail: record.fleet_job_id ? "Fleet Job close-out recorded against asset history" : "Asset history updated",
        href: record.fleet_job_id ? `/assets/fleet-jobs/${record.fleet_job_id}` : "/assets",
        date: record.history_date || record.created_at,
        tone: "emerald" as Tone,
      })),
    ]
      .sort((a, b) => new Date(b.date || "").getTime() - new Date(a.date || "").getTime())
      .slice(0, 6);

    const totalAssets =
      data.vehicles.length +
      data.plant.length +
      data.liftingGear.length +
      data.torqueWrenches.length +
      data.ladders.length +
      data.generators.length;

    const availableAssets =
      data.vehicles.filter((vehicle) => clean(vehicle.status).toLowerCase() === "available").length +
      data.plant.filter((asset) => clean(asset.asset_status || asset.status).toLowerCase() === "available").length;

    return {
      activeFleetJobs,
      prestartFlags,
      reminders: reminders
        .sort((a, b) => (daysUntil(a.dueDate) ?? 9999) - (daysUntil(b.dueDate) ?? 9999))
        .slice(0, 8),
      actionItems: actionItems
        .sort((a, b) => {
          const order: Record<Tone, number> = { rose: 0, amber: 1, blue: 2, violet: 3, slate: 4, emerald: 5 };
          return order[a.tone] - order[b.tone];
        })
        .slice(0, 8),
      recentActivity,
      totalAssets,
      availableAssets,
      unavailableAssets,
      lowStock,
      failedEquipment:
        equipmentStatusCount(data.liftingGear, "Failed") +
        equipmentStatusCount(data.torqueWrenches, "Failed") +
        equipmentStatusCount(data.ladders, "Failed") +
        equipmentStatusCount(data.generators, "Failed"),
    };
  }, [data]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Fleet Assets"
        title="Asset Dashboard"
        description="A live summary dashboard showing what needs attention, where to action it, and the current state of the fleet. Closed Fleet Jobs are excluded unless they have been reopened."
        actions={
          <>
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="inline-flex min-h-10 items-center gap-2 border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            <ActionButton href="/assets/fleet-jobs" icon={<Wrench size={16} />}>
              Fleet Jobs
            </ActionButton>
            <ActionButton href="/assets/prestarts" variant="secondary" icon={<ClipboardCheck size={16} />}>
              Prestarts
            </ActionButton>
          </>
        }
      />

      {errorMessage ? (
        <div className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {errorMessage}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard
          label="Total Assets"
          value={loading ? "..." : String(dashboard.totalAssets)}
          detail="vehicles, plant and equipment"
          tone="blue"
        />
        <KpiCard
          label="Action Items"
          value={loading ? "..." : String(dashboard.actionItems.length)}
          detail="things needing review"
          tone={dashboard.actionItems.length > 0 ? "rose" : "emerald"}
        />
        <KpiCard
          label="Open Fleet Jobs"
          value={loading ? "..." : String(dashboard.activeFleetJobs.length)}
          detail="not closed or reopened"
          tone={dashboard.activeFleetJobs.length > 0 ? "amber" : "emerald"}
        />
        <KpiCard
          label="Prestart Flags"
          value={loading ? "..." : String(dashboard.prestartFlags.length)}
          detail="recent flagged checks"
          tone={dashboard.prestartFlags.length > 0 ? "amber" : "emerald"}
        />
        <KpiCard
          label="Unavailable"
          value={loading ? "..." : String(dashboard.unavailableAssets)}
          detail="failed / maintenance / inactive"
          tone={dashboard.unavailableAssets > 0 ? "rose" : "emerald"}
        />
        <KpiCard
          label="Upcoming"
          value={loading ? "..." : String(dashboard.reminders.length)}
          detail="expiries and inspections"
          tone={dashboard.reminders.length > 0 ? "amber" : "emerald"}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel
          title="Needs Attention"
          description="The highest priority items from Fleet Jobs, expiries, failed equipment and low stock. Click through to action at the source."
          count={dashboard.actionItems.length}
        >
          {loading ? (
            <EmptyState text="Loading action items..." />
          ) : dashboard.actionItems.length > 0 ? (
            <div className="space-y-3">
              {dashboard.actionItems.map((item) => (
                <ActionRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <EmptyState text="No urgent action items. The dashboard is clear for now." />
          )}
        </Panel>

        <Panel
          title="Quick Actions"
          description="Common actions for the fleet and asset workflow."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <ActionButton href="/assets/vehicles/new" variant="secondary" icon={<Plus size={16} />}>
              Add Vehicle
            </ActionButton>
            <ActionButton href="/assets/plant/new" variant="secondary" icon={<Plus size={16} />}>
              Add Plant
            </ActionButton>
            <ActionButton href="/assets/fleet-jobs/new" variant="secondary" icon={<Wrench size={16} />}>
              Log Fleet Job
            </ActionButton>
            <ActionButton href="/assets/prestarts/new" variant="secondary" icon={<ClipboardCheck size={16} />}>
              Submit Prestart
            </ActionButton>
            <ActionButton href="/assets/compliance" variant="secondary" icon={<ShieldCheck size={16} />}>
              Compliance Centre
            </ActionButton>
            <ActionButton href="/assets/equipment/inventory" variant="secondary" icon={<PackageCheck size={16} />}>
              Inventory
            </ActionButton>
          </div>

          <div className="mt-5 border border-slate-200 bg-slate-50 p-4">
            <DetailGrid
              items={[
                { label: "Vehicles", value: String(data.vehicles.length) },
                { label: "Plant", value: String(data.plant.length) },
                { label: "Gear", value: String(data.liftingGear.length) },
                { label: "Available", value: String(dashboard.availableAssets) },
              ]}
            />
          </div>
        </Panel>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel
          title="Open Fleet Jobs"
          description="Only jobs still active. Completed close-outs are hidden unless the job was reopened."
          count={dashboard.activeFleetJobs.length}
        >
          {loading ? (
            <EmptyState text="Loading Fleet Jobs..." />
          ) : dashboard.activeFleetJobs.length > 0 ? (
            <div className="space-y-3">
              {dashboard.activeFleetJobs.slice(0, 6).map((job) => (
                <Link
                  key={job.id}
                  href={`/assets/fleet-jobs/${job.id}`}
                  className="block border border-slate-200 bg-slate-50 p-4 transition hover:border-amber-300 hover:bg-amber-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-slate-950">
                          {clean(job.job_number)} · {clean(job.title)}
                        </p>
                        <StatusBadge label={clean(job.status)} tone={statusTone(job.status)} />
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">
                        {clean(job.description)}
                      </p>
                      <p className="mt-2 text-xs font-semibold text-slate-500">
                        {clean(job.asset_label)} · Assigned {clean(job.assigned_to)} · Created {formatDate(job.created_at)}
                      </p>
                    </div>
                    <StatusBadge label={clean(job.priority)} tone={priorityTone(job.priority)} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState text="No open Fleet Jobs. Closed jobs are no longer shown here." />
          )}
        </Panel>

        <Panel
          title="Upcoming Renewals & Inspections"
          description="Expiries, service dates, inspections and kit checks due within 45 days."
          count={dashboard.reminders.length}
        >
          {loading ? (
            <EmptyState text="Loading reminders..." />
          ) : dashboard.reminders.length > 0 ? (
            <div className="space-y-3">
              {dashboard.reminders.map((reminder) => (
                <ReminderRow key={reminder.id} reminder={reminder} />
              ))}
            </div>
          ) : (
            <EmptyState text="No renewals or inspections due within 45 days." />
          )}
        </Panel>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Panel
          title="Prestart Flags"
          description="Recent prestarts that contain failed, defect, minor, major or critical results."
          count={dashboard.prestartFlags.length}
        >
          {loading ? (
            <EmptyState text="Loading prestarts..." />
          ) : dashboard.prestartFlags.length > 0 ? (
            <div className="space-y-3">
              {dashboard.prestartFlags.slice(0, 6).map((record) => (
                <Link
                  key={record.id}
                  href={`/assets/prestarts/${record.id}`}
                  className="block border border-slate-200 bg-slate-50 p-4 transition hover:border-sky-300 hover:bg-sky-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-950">
                        {clean(record.asset_label || record.vehicle_rego)}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {clean(record.comments || record.result || record.overall_condition)}
                      </p>
                      <p className="mt-2 text-xs font-semibold text-slate-500">
                        {formatDate(record.prestart_date || record.created_at)} · {clean(record.inspected_by_name || record.employee_name)}
                      </p>
                    </div>
                    <StatusBadge label={clean(record.severity || record.result)} tone={statusTone(record.severity || record.result)} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState text="No recent prestart flags." />
          )}
        </Panel>

        <Panel
          title="Recent Activity"
          description="Latest prestarts and asset history close-outs."
          count={dashboard.recentActivity.length}
        >
          {loading ? (
            <EmptyState text="Loading recent activity..." />
          ) : dashboard.recentActivity.length > 0 ? (
            <div className="space-y-3">
              {dashboard.recentActivity.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="block border border-slate-200 bg-slate-50 p-4 transition hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-950">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
                      <p className="mt-2 text-xs font-semibold text-slate-500">{formatDate(item.date)}</p>
                    </div>
                    <StatusBadge label="Activity" tone={item.tone} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState text="No recent asset activity found." />
          )}
        </Panel>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Panel
          title="Asset Register Overview"
          description="A simple split of what is currently being managed inside Assets."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="border border-slate-200 bg-slate-50 p-4">
              <Truck size={18} className="text-slate-500" />
              <p className="mt-3 text-sm font-bold text-slate-950">Vehicles</p>
              <p className="mt-1 text-2xl font-black text-slate-950">{data.vehicles.length}</p>
            </div>
            <div className="border border-slate-200 bg-slate-50 p-4">
              <Wrench size={18} className="text-slate-500" />
              <p className="mt-3 text-sm font-bold text-slate-950">Plant</p>
              <p className="mt-1 text-2xl font-black text-slate-950">{data.plant.length}</p>
            </div>
            <div className="border border-slate-200 bg-slate-50 p-4">
              <ShieldCheck size={18} className="text-slate-500" />
              <p className="mt-3 text-sm font-bold text-slate-950">Lifting Gear</p>
              <p className="mt-1 text-2xl font-black text-slate-950">{data.liftingGear.length}</p>
            </div>
            <div className="border border-slate-200 bg-slate-50 p-4">
              <CalendarClock size={18} className="text-slate-500" />
              <p className="mt-3 text-sm font-bold text-slate-950">Failed Equipment</p>
              <p className="mt-1 text-2xl font-black text-slate-950">{dashboard.failedEquipment}</p>
            </div>
          </div>
        </Panel>

        <Panel
          title="How To Action Items"
          description="This dashboard tells you where the problem is. The source page is where you update it."
        >
          <div className="space-y-3">
            <div className="border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <FileWarning size={18} className="mt-0.5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-bold text-slate-950">Fleet Job issue?</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Open the Fleet Job to assign it, add corrections, or close it out. The asset history updates from the close-out workflow.
                  </p>
                </div>
              </div>
            </div>
            <div className="border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <CalendarClock size={18} className="mt-0.5 shrink-0 text-blue-600" />
                <div>
                  <p className="font-bold text-slate-950">Expiry or service due?</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Use the asset update page to record the renewed date, service details, document or inspection history.
                  </p>
                </div>
              </div>
            </div>
            <div className="border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <PackageCheck size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                <div>
                  <p className="font-bold text-slate-950">Stock or equipment issue?</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Go to Equipment or Inventory to update counts, failed items, inspections and replacement status.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </section>
    </PageShell>
  );
}
