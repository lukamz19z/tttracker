"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileWarning,
  PackageCheck,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Truck,
  Wrench,
  XCircle,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";

type Tone = "rose" | "amber" | "emerald" | "slate" | "blue";
type Severity = "Critical" | "Upcoming" | "Monitor" | "Compliant";

type ComplianceItem = {
  id: string;
  area: string;
  title: string;
  detail: string;
  severity: Severity;
  dueDate?: string | null;
  href: string;
  actionLabel: string;
};

type Vehicle = {
  id: string;
  vehicle_id?: string | null;
  asset_id?: string | null;
  rego?: string | null;
  registration?: string | null;
  make?: string | null;
  model?: string | null;
  status?: string | null;
  category?: string | null;
  vehicle_type?: string | null;
  rego_expiry?: string | null;
  registration_expiry?: string | null;
  insurance_expiry?: string | null;
  risk_assessment_url?: string | null;
  risk_assessment_file_url?: string | null;
  user_manual_url?: string | null;
  owners_manual_url?: string | null;
  manual_url?: string | null;
  spare_key?: boolean | null;
  spare_key_location?: string | null;
};

type Plant = {
  id: string;
  plant_id?: string | null;
  asset_id?: string | null;
  name?: string | null;
  make?: string | null;
  model?: string | null;
  category?: string | null;
  plant_type?: string | null;
  status?: string | null;
  rego_expiry?: string | null;
  registration_expiry?: string | null;
  insurance_expiry?: string | null;
  cranesafe_expiry?: string | null;
  risk_assessment_url?: string | null;
  risk_assessment_file_url?: string | null;
  user_manual_url?: string | null;
  owners_manual_url?: string | null;
  manual_url?: string | null;
  spare_key?: boolean | null;
  spare_key_location?: string | null;
};

type FleetJob = {
  id: string;
  job_number?: string | null;
  title?: string | null;
  description?: string | null;
  asset_label?: string | null;
  asset_id?: string | null;
  status?: string | null;
  priority?: string | null;
  created_at?: string | null;
  completed_date?: string | null;
  closed_at?: string | null;
};

type Prestart = {
  id: string;
  asset_id?: string | null;
  vehicle_id?: string | null;
  plant_id?: string | null;
  asset_label?: string | null;
  prestart_date?: string | null;
  inspection_date?: string | null;
  created_at?: string | null;
};

type LiftingGear = {
  id: string;
  serial_id?: string | null;
  equipment_type?: string | null;
  description?: string | null;
  status?: string | null;
  inspected_on?: string | null;
  next_inspection_due?: string | null;
  tag?: string | null;
  crew_label?: string | null;
};

type TorqueWrench = {
  id: string;
  torque_wrench_number?: string | null;
  serial_number?: string | null;
  expiry_date?: string | null;
  status?: string | null;
};

type Ladder = {
  id: string;
  ladder_number?: string | null;
  make?: string | null;
  ladder_type?: string | null;
  status?: string | null;
  last_internal_inspection?: string | null;
};

type Generator = {
  id: string;
  generator_number?: string | null;
  status?: string | null;
  last_service_date?: string | null;
  prestart_frequency?: string | null;
};

type PpeStock = {
  id: string;
  item_name?: string | null;
  variant?: string | null;
  current_stock?: number | null;
  minimum_stock?: number | null;
  location?: string | null;
};

type InventoryKit = {
  id: string;
  kit_number?: string | null;
  kit_category?: string | null;
  kit_type?: string | null;
  assigned_asset_id?: string | null;
  assigned_location?: string | null;
  last_inspection_date?: string | null;
  status?: string | null;
};

type KitInspectionItem = {
  id: string;
  kit_id?: string | null;
  item_name?: string | null;
  required_qty?: number | null;
  actual_qty?: number | null;
  status?: string | null;
  expiry_date?: string | null;
};

type AssetHistory = {
  id: string;
  fleet_job_id?: string | null;
  history_type?: string | null;
  history_date?: string | null;
  title?: string | null;
  created_at?: string | null;
};

type FleetJobUpdate = {
  id: string;
  fleet_job_id: string;
  update_type?: string | null;
  status?: string | null;
  comment?: string | null;
  created_at?: string | null;
};

type DataState = {
  vehicles: Vehicle[];
  plant: Plant[];
  fleetJobs: FleetJob[];
  assetHistory: AssetHistory[];
  fleetJobUpdates: FleetJobUpdate[];
  prestarts: Prestart[];
  liftingGear: LiftingGear[];
  torqueWrenches: TorqueWrench[];
  ladders: Ladder[];
  generators: Generator[];
  ppeStock: PpeStock[];
  kits: InventoryKit[];
  kitItems: KitInspectionItem[];
};

const blankData: DataState = {
  vehicles: [],
  plant: [],
  fleetJobs: [],
  assetHistory: [],
  fleetJobUpdates: [],
  prestarts: [],
  liftingGear: [],
  torqueWrenches: [],
  ladders: [],
  generators: [],
  ppeStock: [],
  kits: [],
  kitItems: [],
};

const fallArrestTypes = [
  "Harness",
  "Pole Strap",
  "Cobra",
  "Descender",
  "Lanyard",
  "Rope Grab",
  "Anchor Strap",
  "Rescue Kit",
  "Fall Protection Other",
  "Other",
];

function clean(value: string | number | boolean | null | undefined) {
  return String(value ?? "").trim();
}

function isActiveStatus(status: string | null | undefined) {
  const value = clean(status).toLowerCase();
  return !["retired", "sold", "inactive", "no longer hired", "superseded", "decommissioned"].includes(value);
}

function latestCloseOutForJob(
  updates: FleetJobUpdate[],
  fleetJobId: string | null | undefined,
) {
  if (!fleetJobId) return null;

  return (
    updates.find(
      (update) =>
        update.fleet_job_id === fleetJobId &&
        (update.update_type === "Close Out" ||
          update.update_type === "Close Out Edited"),
    ) || null
  );
}

function latestReopenForJob(
  updates: FleetJobUpdate[],
  fleetJobId: string | null | undefined,
) {
  if (!fleetJobId) return null;

  return (
    updates.find(
      (update) =>
        update.fleet_job_id === fleetJobId && update.update_type === "Reopened",
    ) || null
  );
}

function isClosedJob(
  job: FleetJob,
  assetHistory: AssetHistory[] = [],
  updates: FleetJobUpdate[] = [],
) {
  const status = clean(job.status).toLowerCase();

  const statusClosed = [
    "closed",
    "complete",
    "completed",
    "resolved",
    "cancelled",
    "canceled",
    "actioned",
  ].includes(status);

  const hasAssetHistoryCloseOut = assetHistory.some(
    (record) => record.fleet_job_id === job.id,
  );

  const closeOutUpdate = latestCloseOutForJob(updates, job.id);
  const reopenUpdate = latestReopenForJob(updates, job.id);

  const reopenedAfterCloseOut = Boolean(
    reopenUpdate?.created_at &&
      closeOutUpdate?.created_at &&
      new Date(reopenUpdate.created_at).getTime() >
        new Date(closeOutUpdate.created_at).getTime(),
  );

  if (reopenedAfterCloseOut && !statusClosed) return false;
  if (reopenUpdate && !closeOutUpdate && !statusClosed) return false;
  if (statusClosed) return true;
  if (clean(job.closed_at) || clean(job.completed_date)) return true;
  if (closeOutUpdate || hasAssetHistoryCloseOut) return true;

  return false;
}

function isBadStatus(status: string | null | undefined) {
  const value = clean(status).toLowerCase();
  return ["failed", "out of service", "missing", "expired", "retired"].includes(value);
}

function formatDate(date: string | null | undefined) {
  if (!date) return "No date";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return clean(date);
  return parsed.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(date: string | null | undefined, todayIso: string) {
  if (!date) return null;
  const today = new Date(`${todayIso}T00:00:00`);
  const due = new Date(`${date}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function daysSince(date: string | null | undefined, todayIso: string) {
  if (!date) return null;
  const today = new Date(`${todayIso}T00:00:00`);
  const past = new Date(`${date}T00:00:00`);
  if (Number.isNaN(past.getTime())) return null;
  return Math.floor((today.getTime() - past.getTime()) / (1000 * 60 * 60 * 24));
}

function assetLabel(asset: Vehicle | Plant) {
  const v = asset as Vehicle;
  const p = asset as Plant;
  return (
    clean(v.vehicle_id) ||
    clean(v.asset_id) ||
    clean(v.rego) ||
    clean(v.registration) ||
    clean(p.plant_id) ||
    clean(p.asset_id) ||
    clean(p.name) ||
    "Unknown asset"
  );
}

function vehicleLabel(vehicle: Vehicle) {
  return [assetLabel(vehicle), clean(vehicle.rego || vehicle.registration), clean(vehicle.make), clean(vehicle.model)]
    .filter(Boolean)
    .join(" · ");
}

function plantLabel(plant: Plant) {
  return [assetLabel(plant), clean(plant.make), clean(plant.model)].filter(Boolean).join(" · ");
}

function hasDocument(row: Record<string, unknown>, fields: string[]) {
  return fields.some((field) => Boolean(clean(row[field] as string | null | undefined)));
}

function getTone(severity: Severity): Tone {
  if (severity === "Critical") return "rose";
  if (severity === "Upcoming") return "amber";
  if (severity === "Compliant") return "emerald";
  return "slate";
}

function toneClasses(tone: Tone) {
  const classes = {
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
  };

  return classes[tone];
}

function Pill({ children, tone }: { children: React.ReactNode; tone: Tone }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${toneClasses(tone)}`}>
      {children}
    </span>
  );
}

function SectionHeader({ title, description, href }: { title: string; description: string; href?: string }) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      {href ? (
        <Link href={href} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
          Open register <ArrowRight size={14} />
        </Link>
      ) : null}
    </div>
  );
}

function IssueList({ items, emptyText }: { items: ComplianceItem[]; emptyText: string }) {
  if (items.length === 0) {
    return <div className="p-5 text-sm font-semibold text-slate-500">{emptyText}</div>;
  }

  return (
    <div className="divide-y divide-slate-100">
      {items.map((item) => (
        <div key={item.id} className="flex flex-col gap-3 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={getTone(item.severity)}>{item.severity}</Pill>
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{item.area}</span>
            </div>
            <p className="mt-2 font-black text-slate-950">{item.title}</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
            {item.dueDate ? <p className="mt-1 text-xs font-bold text-slate-500">Date: {formatDate(item.dueDate)}</p> : null}
          </div>
          <Link href={item.href} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800">
            {item.actionLabel} <ArrowRight size={14} />
          </Link>
        </div>
      ))}
    </div>
  );
}

async function safeSelect<T>(query: PromiseLike<{ data: unknown[] | null; error: unknown }>) {
  const result = await query;
  if (result.error) return [] as T[];
  return (result.data ?? []) as T[];
}

export default function CompliancePage() {
 const supabase = useMemo(() => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}, []);
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DataState>(blankData);
  const [activeTab, setActiveTab] = useState("Priority");

  const loadData = useCallback(async () => {
    setLoading(true);

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
      kitItems,
    ] = await Promise.all([
      safeSelect<Vehicle>(supabase.from("vehicles").select("*")),
      safeSelect<Plant>(supabase.from("plant_assets").select("*")),
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
      safeSelect<Prestart>(supabase.from("asset_prestarts").select("*")),
      safeSelect<LiftingGear>(supabase.from("equipment_lifting_gear").select("*")),
      safeSelect<TorqueWrench>(supabase.from("equipment_torque_wrenches").select("*")),
      safeSelect<Ladder>(supabase.from("equipment_ladders").select("*")),
      safeSelect<Generator>(supabase.from("equipment_generators").select("*")),
      safeSelect<PpeStock>(supabase.from("inventory_ppe_stock").select("*")),
      safeSelect<InventoryKit>(supabase.from("inventory_kits").select("*")),
      safeSelect<KitInspectionItem>(supabase.from("inventory_kit_inspection_items").select("*")),
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
      kitItems,
    });

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  const compliance = useMemo(() => {
    const items: ComplianceItem[] = [];

    const activeVehicles = data.vehicles.filter((vehicle) => isActiveStatus(vehicle.status));
    const activePlant = data.plant.filter((plant) => isActiveStatus(plant.status));

    for (const vehicle of activeVehicles) {
      const label = vehicleLabel(vehicle);
      const href = `/assets/vehicles/${vehicle.id}`;
      const updateHref = `/assets/vehicles/${vehicle.id}/update`;
      const isTrailer = clean(vehicle.category || vehicle.vehicle_type).toLowerCase().includes("trailer");

      if (!hasDocument(vehicle as unknown as Record<string, unknown>, ["risk_assessment_url", "risk_assessment_file_url"])) {
        items.push({ id: `vehicle-risk-${vehicle.id}`, area: "Vehicles", title: `${label} missing risk assessment`, detail: "Every active vehicle should have a risk assessment attached before use on project.", severity: "Critical", href, actionLabel: "View vehicle" });
      }

      if (!hasDocument(vehicle as unknown as Record<string, unknown>, ["user_manual_url", "owners_manual_url", "manual_url"])) {
        items.push({ id: `vehicle-manual-${vehicle.id}`, area: "Vehicles", title: `${label} missing user manual`, detail: "Attach a user manual or owner manual for compliance and operator reference.", severity: "Monitor", href, actionLabel: "View vehicle" });
      }

      const regoDate = vehicle.rego_expiry || vehicle.registration_expiry;
      const regoDays = daysUntil(regoDate, todayIso);
      if (regoDays === null) {
        items.push({ id: `vehicle-rego-missing-${vehicle.id}`, area: "Vehicles", title: `${label} missing rego expiry`, detail: "No registration expiry date recorded.", severity: "Critical", href: updateHref, actionLabel: "Update asset" });
      } else if (regoDays < 0) {
        items.push({ id: `vehicle-rego-expired-${vehicle.id}`, area: "Vehicles", title: `${label} registration expired`, detail: `Registration expired ${Math.abs(regoDays)} day(s) ago.`, severity: "Critical", dueDate: regoDate, href: updateHref, actionLabel: "Update asset" });
      } else if (regoDays <= 30) {
        items.push({ id: `vehicle-rego-soon-${vehicle.id}`, area: "Vehicles", title: `${label} registration due soon`, detail: `Registration expires in ${regoDays} day(s).`, severity: "Upcoming", dueDate: regoDate, href: updateHref, actionLabel: "Update asset" });
      }

      if (!isTrailer) {
        const insuranceDays = daysUntil(vehicle.insurance_expiry, todayIso);
        if (insuranceDays === null) {
          items.push({ id: `vehicle-insurance-missing-${vehicle.id}`, area: "Vehicles", title: `${label} missing insurance expiry`, detail: "No insurance expiry date recorded.", severity: "Critical", href: updateHref, actionLabel: "Update asset" });
        } else if (insuranceDays < 0) {
          items.push({ id: `vehicle-insurance-expired-${vehicle.id}`, area: "Vehicles", title: `${label} insurance expired`, detail: `Insurance expired ${Math.abs(insuranceDays)} day(s) ago.`, severity: "Critical", dueDate: vehicle.insurance_expiry, href: updateHref, actionLabel: "Update asset" });
        } else if (insuranceDays <= 30) {
          items.push({ id: `vehicle-insurance-soon-${vehicle.id}`, area: "Vehicles", title: `${label} insurance due soon`, detail: `Insurance expires in ${insuranceDays} day(s).`, severity: "Upcoming", dueDate: vehicle.insurance_expiry, href: updateHref, actionLabel: "Update asset" });
        }
      }
    }

    for (const plant of activePlant) {
      const label = plantLabel(plant);
      const href = `/assets/plant/${plant.id}`;
      const updateHref = `/assets/plant/${plant.id}/update`;
      const plantType = clean(plant.category || plant.plant_type).toLowerCase();
      const isCrane = plantType.includes("crane");

      if (!hasDocument(plant as unknown as Record<string, unknown>, ["risk_assessment_url", "risk_assessment_file_url"])) {
        items.push({ id: `plant-risk-${plant.id}`, area: "Plant", title: `${label} missing risk assessment`, detail: "All active plant should have a risk assessment attached.", severity: "Critical", href, actionLabel: "View plant" });
      }

      if (!hasDocument(plant as unknown as Record<string, unknown>, ["user_manual_url", "owners_manual_url", "manual_url"])) {
        items.push({ id: `plant-manual-${plant.id}`, area: "Plant", title: `${label} missing user manual`, detail: "Attach user manual or operator manual for the asset.", severity: "Monitor", href, actionLabel: "View plant" });
      }

      const insuranceDays = daysUntil(plant.insurance_expiry, todayIso);
      if (insuranceDays !== null && insuranceDays < 0) {
        items.push({ id: `plant-insurance-expired-${plant.id}`, area: "Plant", title: `${label} insurance expired`, detail: `Insurance expired ${Math.abs(insuranceDays)} day(s) ago.`, severity: "Critical", dueDate: plant.insurance_expiry, href: updateHref, actionLabel: "Update plant" });
      } else if (insuranceDays !== null && insuranceDays <= 30) {
        items.push({ id: `plant-insurance-soon-${plant.id}`, area: "Plant", title: `${label} insurance due soon`, detail: `Insurance expires in ${insuranceDays} day(s).`, severity: "Upcoming", dueDate: plant.insurance_expiry, href: updateHref, actionLabel: "Update plant" });
      }

      if (isCrane) {
        const cranesafeDays = daysUntil(plant.cranesafe_expiry, todayIso);
        if (cranesafeDays === null) {
          items.push({ id: `crane-cranesafe-missing-${plant.id}`, area: "Cranes", title: `${label} missing CraneSafe expiry`, detail: "CraneSafe expiry date is required for crane compliance tracking.", severity: "Critical", href: updateHref, actionLabel: "Update crane" });
        } else if (cranesafeDays < 0) {
          items.push({ id: `crane-cranesafe-expired-${plant.id}`, area: "Cranes", title: `${label} CraneSafe expired`, detail: `CraneSafe expired ${Math.abs(cranesafeDays)} day(s) ago.`, severity: "Critical", dueDate: plant.cranesafe_expiry, href: updateHref, actionLabel: "Update crane" });
        } else if (cranesafeDays <= 45) {
          items.push({ id: `crane-cranesafe-soon-${plant.id}`, area: "Cranes", title: `${label} CraneSafe due soon`, detail: `CraneSafe expires in ${cranesafeDays} day(s).`, severity: "Upcoming", dueDate: plant.cranesafe_expiry, href: updateHref, actionLabel: "Update crane" });
        }
      }
    }

    for (const job of data.fleetJobs) {
      if (!isClosedJob(job, data.assetHistory, data.fleetJobUpdates)) {
        const priority = clean(job.priority).toLowerCase();
        items.push({
          id: `fleet-job-${job.id}`,
          area: "Fleet Jobs",
          title: `${clean(job.job_number) || "Fleet job"} is open`,
          detail: `${clean(job.title || job.description || job.asset_label || job.asset_id) || "Open fleet defect / maintenance job requires close-out."}${priority ? ` Priority: ${job.priority}.` : ""}`,
          severity: priority.includes("high") || priority.includes("critical") ? "Critical" : "Monitor",
          href: `/assets/fleet-jobs/${job.id}`,
          actionLabel: "View job",
        });
      }
    }

    const prestartsByAsset = new Map<string, Prestart[]>();
    for (const prestart of data.prestarts) {
      const key = clean(prestart.vehicle_id || prestart.plant_id || prestart.asset_id || prestart.asset_label);
      if (!key) continue;
      const existing = prestartsByAsset.get(key) ?? [];
      existing.push(prestart);
      prestartsByAsset.set(key, existing);
    }

    for (const vehicle of activeVehicles) {
      const isTrailer = clean(vehicle.category || vehicle.vehicle_type).toLowerCase().includes("trailer");
      if (isTrailer) continue;
      const keys = [vehicle.id, clean(vehicle.vehicle_id), clean(vehicle.asset_id), clean(vehicle.rego), clean(vehicle.registration)].filter(Boolean);
      const related = keys.flatMap((key) => prestartsByAsset.get(key) ?? []);
      const latest = related
        .map((item) => item.prestart_date || item.inspection_date || item.created_at?.slice(0, 10) || null)
        .filter(Boolean)
        .sort()
        .at(-1);
      const age = daysSince(latest, todayIso);
      if (age === null) {
        items.push({ id: `vehicle-prestart-none-${vehicle.id}`, area: "Prestarts", title: `${vehicleLabel(vehicle)} has no recent prestart`, detail: "No prestart record found for this active vehicle.", severity: "Critical", href: "/assets/prestarts", actionLabel: "View prestarts" });
      } else if (age > 30) {
        items.push({ id: `vehicle-prestart-old-${vehicle.id}`, area: "Prestarts", title: `${vehicleLabel(vehicle)} not prestarted in a month`, detail: `Last prestart was ${age} day(s) ago.`, severity: "Critical", dueDate: latest, href: "/assets/prestarts", actionLabel: "View prestarts" });
      } else if (age > 21) {
        items.push({ id: `vehicle-prestart-aging-${vehicle.id}`, area: "Prestarts", title: `${vehicleLabel(vehicle)} prestart ageing`, detail: `Last prestart was ${age} day(s) ago.`, severity: "Upcoming", dueDate: latest, href: "/assets/prestarts", actionLabel: "View prestarts" });
      }
    }

    for (const gear of data.liftingGear) {
      const label = `${clean(gear.serial_id) || "Gear item"} · ${clean(gear.equipment_type) || "Equipment"}`;
      const isFall = fallArrestTypes.includes(clean(gear.equipment_type));
      const href = isFall ? "/assets/equipment/fall-arrest" : "/assets/equipment/lifting-gear";

      if (isBadStatus(gear.status)) {
        items.push({ id: `gear-status-${gear.id}`, area: isFall ? "Fall Arrest" : "Lifting Gear", title: `${label} is ${clean(gear.status)}`, detail: clean(gear.description) || "Item has a non-compliant status.", severity: "Critical", href, actionLabel: "Open register" });
      }

      const dueDays = daysUntil(gear.next_inspection_due, todayIso);
      if (dueDays === null) {
        items.push({ id: `gear-due-missing-${gear.id}`, area: isFall ? "Fall Arrest" : "Lifting Gear", title: `${label} missing next inspection date`, detail: "Inspection due date is not recorded.", severity: "Critical", href, actionLabel: "Open register" });
      } else if (dueDays < 0) {
        items.push({ id: `gear-overdue-${gear.id}`, area: isFall ? "Fall Arrest" : "Lifting Gear", title: `${label} inspection overdue`, detail: `Inspection overdue by ${Math.abs(dueDays)} day(s).`, severity: "Critical", dueDate: gear.next_inspection_due, href, actionLabel: "Open register" });
      } else if (dueDays <= 30) {
        items.push({ id: `gear-due-soon-${gear.id}`, area: isFall ? "Fall Arrest" : "Lifting Gear", title: `${label} inspection due soon`, detail: `Inspection due in ${dueDays} day(s).`, severity: "Upcoming", dueDate: gear.next_inspection_due, href, actionLabel: "Open register" });
      }
    }

    for (const wrench of data.torqueWrenches) {
      const label = clean(wrench.torque_wrench_number) || clean(wrench.serial_number) || "Torque wrench";
      const expiryDays = daysUntil(wrench.expiry_date, todayIso);
      if (isBadStatus(wrench.status)) {
        items.push({ id: `tw-status-${wrench.id}`, area: "Torque Wrenches", title: `${label} is ${clean(wrench.status)}`, detail: "Torque wrench status requires review.", severity: "Critical", href: "/assets/equipment/torque-wrenches", actionLabel: "Open register" });
      }
      if (expiryDays === null) {
        items.push({ id: `tw-expiry-missing-${wrench.id}`, area: "Torque Wrenches", title: `${label} missing expiry date`, detail: "Calibration / expiry date is not recorded.", severity: "Critical", href: "/assets/equipment/torque-wrenches", actionLabel: "Open register" });
      } else if (expiryDays < 0) {
        items.push({ id: `tw-expired-${wrench.id}`, area: "Torque Wrenches", title: `${label} expired`, detail: `Expiry date passed ${Math.abs(expiryDays)} day(s) ago.`, severity: "Critical", dueDate: wrench.expiry_date, href: "/assets/equipment/torque-wrenches", actionLabel: "Open register" });
      } else if (expiryDays <= 30) {
        items.push({ id: `tw-due-${wrench.id}`, area: "Torque Wrenches", title: `${label} due soon`, detail: `Expiry due in ${expiryDays} day(s).`, severity: "Upcoming", dueDate: wrench.expiry_date, href: "/assets/equipment/torque-wrenches", actionLabel: "Open register" });
      }
    }

    for (const ladder of data.ladders) {
      const label = clean(ladder.ladder_number) || clean(ladder.make) || "Ladder";
      const age = daysSince(ladder.last_internal_inspection, todayIso);
      if (isBadStatus(ladder.status)) {
        items.push({ id: `ladder-status-${ladder.id}`, area: "Ladders", title: `${label} is ${clean(ladder.status)}`, detail: "Ladder status requires review.", severity: "Critical", href: "/assets/equipment/ladders", actionLabel: "Open register" });
      }
      if (age === null) {
        items.push({ id: `ladder-missing-${ladder.id}`, area: "Ladders", title: `${label} missing internal inspection`, detail: "No internal inspection date recorded.", severity: "Critical", href: "/assets/equipment/ladders", actionLabel: "Open register" });
      } else if (age > 90) {
        items.push({ id: `ladder-old-${ladder.id}`, area: "Ladders", title: `${label} inspection review required`, detail: `Last internal inspection was ${age} day(s) ago.`, severity: "Critical", dueDate: ladder.last_internal_inspection, href: "/assets/equipment/ladders", actionLabel: "Open register" });
      } else if (age > 60) {
        items.push({ id: `ladder-soon-${ladder.id}`, area: "Ladders", title: `${label} inspection ageing`, detail: `Last internal inspection was ${age} day(s) ago.`, severity: "Upcoming", dueDate: ladder.last_internal_inspection, href: "/assets/equipment/ladders", actionLabel: "Open register" });
      }
    }

    for (const generator of data.generators) {
      const label = clean(generator.generator_number) || "Generator";
      const age = daysSince(generator.last_service_date, todayIso);
      if (isBadStatus(generator.status)) {
        items.push({ id: `generator-status-${generator.id}`, area: "Generators", title: `${label} is ${clean(generator.status)}`, detail: "Generator status requires review.", severity: "Critical", href: "/assets/equipment/generators", actionLabel: "Open register" });
      }
      if (age === null) {
        items.push({ id: `generator-service-missing-${generator.id}`, area: "Generators", title: `${label} missing last service date`, detail: "No last service date recorded.", severity: "Monitor", href: "/assets/equipment/generators", actionLabel: "Open register" });
      } else if (age > 180) {
        items.push({ id: `generator-service-old-${generator.id}`, area: "Generators", title: `${label} service review required`, detail: `Last service was ${age} day(s) ago.`, severity: "Critical", dueDate: generator.last_service_date, href: "/assets/equipment/generators", actionLabel: "Open register" });
      } else if (age > 90) {
        items.push({ id: `generator-service-soon-${generator.id}`, area: "Generators", title: `${label} service ageing`, detail: `Last service was ${age} day(s) ago.`, severity: "Upcoming", dueDate: generator.last_service_date, href: "/assets/equipment/generators", actionLabel: "Open register" });
      }
    }

    for (const stock of data.ppeStock) {
      const current = Number(stock.current_stock ?? 0);
      const minimum = Number(stock.minimum_stock ?? 0);
      if (minimum > 0 && current < minimum) {
        items.push({ id: `ppe-low-${stock.id}`, area: "PPE Stock", title: `${clean(stock.item_name) || "PPE item"} below minimum`, detail: `${clean(stock.variant) ? `${stock.variant} · ` : ""}${current} in stock, minimum is ${minimum}. Location: ${clean(stock.location) || "Not recorded"}.`, severity: "Critical", href: "/assets/equipment/inventory", actionLabel: "Open inventory" });
      }
    }

    const kitItemByKit = new Map<string, KitInspectionItem[]>();
    for (const item of data.kitItems) {
      const key = clean(item.kit_id);
      if (!key) continue;
      const existing = kitItemByKit.get(key) ?? [];
      existing.push(item);
      kitItemByKit.set(key, existing);
    }

    for (const kit of data.kits) {
      const label = `${clean(kit.kit_number) || "Kit"} · ${clean(kit.kit_type || kit.kit_category) || "Inventory kit"}`;
      const category = clean(kit.kit_category).toLowerCase().includes("snake") ? "Snake Bite Kits" : "First Aid Kits";
      const age = daysSince(kit.last_inspection_date, todayIso);
      const kitItems = kitItemByKit.get(kit.id) ?? [];
      const missing = kitItems.filter((item) => {
        const required = Number(item.required_qty ?? 0);
        const actual = Number(item.actual_qty ?? 0);
        return clean(item.status).toLowerCase() === "missing" || actual < required;
      });
      const expired = kitItems.filter((item) => {
        const expiryDays = daysUntil(item.expiry_date, todayIso);
        return expiryDays !== null && expiryDays < 0;
      });
      const expiring = kitItems.filter((item) => {
        const expiryDays = daysUntil(item.expiry_date, todayIso);
        return expiryDays !== null && expiryDays >= 0 && expiryDays <= 30;
      });

      if (missing.length > 0) {
        items.push({ id: `kit-missing-${kit.id}`, area: category, title: `${label} missing contents`, detail: `${missing.length} expected content item(s) missing or under quantity.`, severity: "Critical", href: "/assets/equipment/inventory", actionLabel: "Open inventory" });
      }
      if (expired.length > 0) {
        items.push({ id: `kit-expired-${kit.id}`, area: category, title: `${label} has expired contents`, detail: `${expired.length} content item(s) expired.`, severity: "Critical", href: "/assets/equipment/inventory", actionLabel: "Open inventory" });
      }
      if (expiring.length > 0) {
        items.push({ id: `kit-expiring-${kit.id}`, area: category, title: `${label} contents expiring soon`, detail: `${expiring.length} content item(s) expire within 30 days.`, severity: "Upcoming", href: "/assets/equipment/inventory", actionLabel: "Open inventory" });
      }
      if (age === null) {
        items.push({ id: `kit-not-inspected-${kit.id}`, area: category, title: `${label} not inspected`, detail: "No inspection date recorded for this kit.", severity: "Monitor", href: "/assets/equipment/inventory", actionLabel: "Open inventory" });
      } else if (age > 90) {
        items.push({ id: `kit-old-${kit.id}`, area: category, title: `${label} inspection overdue`, detail: `Last kit inspection was ${age} day(s) ago.`, severity: "Critical", dueDate: kit.last_inspection_date, href: "/assets/equipment/inventory", actionLabel: "Open inventory" });
      } else if (age > 60) {
        items.push({ id: `kit-soon-${kit.id}`, area: category, title: `${label} inspection ageing`, detail: `Last kit inspection was ${age} day(s) ago.`, severity: "Upcoming", dueDate: kit.last_inspection_date, href: "/assets/equipment/inventory", actionLabel: "Open inventory" });
      }
    }

    const priority = items.sort((a, b) => {
      const rank: Record<Severity, number> = { Critical: 0, Upcoming: 1, Monitor: 2, Compliant: 3 };
      return rank[a.severity] - rank[b.severity];
    });

    const byArea = (area: string) => priority.filter((item) => item.area === area || item.area.includes(area));

    return {
      all: priority,
      critical: priority.filter((item) => item.severity === "Critical"),
      upcoming: priority.filter((item) => item.severity === "Upcoming"),
      monitor: priority.filter((item) => item.severity === "Monitor"),
      vehicles: priority.filter((item) => ["Vehicles", "Prestarts"].includes(item.area)),
      plant: priority.filter((item) => ["Plant", "Cranes"].includes(item.area)),
      fleetJobs: byArea("Fleet Jobs"),
      equipment: priority.filter((item) => ["Lifting Gear", "Fall Arrest", "Torque Wrenches", "Ladders", "Generators"].includes(item.area)),
      inventory: priority.filter((item) => ["PPE Stock", "First Aid Kits", "Snake Bite Kits"].includes(item.area)),
    };
  }, [data, todayIso]);

  const kpis = [
    { label: "Critical", value: compliance.critical.length, icon: ShieldAlert, tone: "rose" as Tone, detail: "Expired, missing, failed, open or overdue" },
    { label: "Upcoming", value: compliance.upcoming.length, icon: CalendarClock, tone: "amber" as Tone, detail: "Due soon or ageing toward review" },
    { label: "Monitor", value: compliance.monitor.length, icon: FileWarning, tone: "slate" as Tone, detail: "Incomplete or worth checking" },
{ label: "Open Fleet Jobs", value: data.fleetJobs.filter((job) => !isClosedJob(job, data.assetHistory, data.fleetJobUpdates)).length, icon: Wrench, tone: "blue" as Tone, detail: "Fleet defects and maintenance still open or reopened" },
  ];

  const tabs = [
    { label: "Priority", items: compliance.all },
    { label: "Vehicles", items: compliance.vehicles },
    { label: "Plant", items: compliance.plant },
    { label: "Fleet Jobs", items: compliance.fleetJobs },
    { label: "Equipment", items: compliance.equipment },
    { label: "Inventory", items: compliance.inventory },
  ];

  const activeItems = tabs.find((tab) => tab.label === activeTab)?.items ?? compliance.all;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">Asset Manager</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Compliance Centre</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              Read-only compliance dashboard across vehicles, plant, cranes, fleet jobs, prestarts, lifting gear, fall arrest, torque wrenches, ladders, generators, PPE stock and first aid / snake bite kits.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadData()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
              <RefreshCw size={16} />
              Refresh
            </button>
            <Link href="/assets/fleet-jobs" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-800">
              <Wrench size={16} />
              Fleet Jobs
            </Link>
          </div>
        </div>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div key={kpi.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{kpi.label}</p>
                    <p className="mt-2 text-3xl font-black text-slate-950">{loading ? "…" : kpi.value}</p>
                  </div>
                  <div className={`rounded-2xl border p-3 ${toneClasses(kpi.tone)}`}>
                    <Icon size={20} />
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-500">{kpi.detail}</p>
              </div>
            );
          })}
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-4">
          <Link href="/assets/vehicles" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:bg-slate-50">
            <Truck className="h-5 w-5 text-slate-700" />
            <p className="mt-3 font-black text-slate-950">Vehicles</p>
            <p className="mt-1 text-sm text-slate-500">Docs, expiry dates and prestarts.</p>
          </Link>
          <Link href="/assets/plant" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:bg-slate-50">
            <ClipboardCheck className="h-5 w-5 text-slate-700" />
            <p className="mt-3 font-black text-slate-950">Plant / Cranes</p>
            <p className="mt-1 text-sm text-slate-500">Risk assessments, manuals and CraneSafe.</p>
          </Link>
          <Link href="/assets/equipment/lifting-gear" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:bg-slate-50">
            <ShieldCheck className="h-5 w-5 text-slate-700" />
            <p className="mt-3 font-black text-slate-950">Lifting / Fall Arrest</p>
            <p className="mt-1 text-sm text-slate-500">Inspection, tag and failed status checks.</p>
          </Link>
          <Link href="/assets/equipment/inventory" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:bg-slate-50">
            <PackageCheck className="h-5 w-5 text-slate-700" />
            <p className="mt-3 font-black text-slate-950">Inventory</p>
            <p className="mt-1 text-sm text-slate-500">PPE, first aid, snake bite and spare keys.</p>
          </Link>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader title="Compliance Issues" description="Prioritised list of items pulled from other registers. No editing occurs here; use the links to update the source page." />

          <div className="flex flex-wrap gap-2 border-b border-slate-200 p-4">
            {tabs.map((tab) => (
              <button
                key={tab.label}
                type="button"
                onClick={() => setActiveTab(tab.label)}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                  activeTab === tab.label ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tab.label} ({loading ? "…" : tab.items.length})
              </button>
            ))}
          </div>

          <IssueList items={activeItems} emptyText={loading ? "Loading compliance checks..." : "No issues found for this section."} />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <SectionHeader title="Upcoming Renewals" description="Renewals and inspections due soon across all registers." />
            <IssueList items={compliance.upcoming.slice(0, 10)} emptyText="No upcoming renewals found." />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <SectionHeader title="Critical Close-Out" description="Expired, failed, missing, open or overdue items that need attention first." />
            <IssueList items={compliance.critical.slice(0, 10)} emptyText="No critical compliance items found." />
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader title="Register Health Snapshot" description="Quick source counts to confirm the compliance centre is reading the connected registers." />
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <Snapshot label="Vehicles" value={data.vehicles.length} href="/assets/vehicles" />
            <Snapshot label="Plant" value={data.plant.length} href="/assets/plant" />
            <Snapshot label="Fleet Jobs" value={data.fleetJobs.length} href="/assets/fleet-jobs" />
            <Snapshot label="Prestarts" value={data.prestarts.length} href="/assets/prestarts" />
            <Snapshot label="Lifting Gear" value={data.liftingGear.filter((item) => !fallArrestTypes.includes(clean(item.equipment_type))).length} href="/assets/equipment/lifting-gear" />
            <Snapshot label="Fall Arrest" value={data.liftingGear.filter((item) => fallArrestTypes.includes(clean(item.equipment_type))).length} href="/assets/equipment/fall-arrest" />
            <Snapshot label="Torque Wrenches" value={data.torqueWrenches.length} href="/assets/equipment/torque-wrenches" />
            <Snapshot label="Inventory Kits" value={data.kits.length} href="/assets/equipment/inventory" />
          </div>
        </section>
      </div>
    </div>
  );
}

function Snapshot({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:bg-white hover:shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-slate-600">
        Open source <ArrowRight size={12} />
      </p>
    </Link>
  );
}
