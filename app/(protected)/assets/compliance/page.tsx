"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  RefreshCw,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";

import { createSupabaseBrowser } from "@/lib/supabase";
import { PageHeader, PageShell } from "../components";

type Severity = "Critical" | "Upcoming" | "Monitor";

type ComplianceItem = {
  id: string;
  area: string;
  title: string;
  detail: string;
  severity: Severity;
  href: string;
  dueDate?: string | null;
};

type Vehicle = {
  id: string;
  vehicle_id: string | null;
  vehicle_rego: string | null;
  make: string | null;
  model: string | null;
  category: string | null;
  status: string | null;
  rego_expiry: string | null;
  insurance_expiry: string | null;
  next_service_due: string | null;
  next_inspection_due: string | null;
  risk_assessment_date: string | null;
};

type Plant = {
  id: string;
  asset_id: string | null;
  rego: string | null;
  make: string | null;
  model: string | null;
  plant_type: string | null;
  asset_status: string | null;
  rego_expiry: string | null;
  insurance_expiry: string | null;
  cranesafe_expiry: string | null;
  ten_year_inspection_due: string | null;
  next_service_due: string | null;
  next_inspection_due: string | null;
  risk_assessment_date: string | null;
};

type AssetDocument = {
  id: string;
  asset_type: "vehicle" | "plant";
  vehicle_asset_id: string | null;
  plant_asset_id: string | null;
  document_type_code: string | null;
  document_type_name: string | null;
  system_key: string | null;
  is_current: boolean | null;
  active: boolean | null;
  expiry_date: string | null;
};

type FleetJob = {
  id: string;
  job_number: string | null;
  status: string | null;
  priority: string | null;
  asset_label: string | null;
};

type LiftingGear = {
  id: string;
  serial_id: string | null;
  equipment_type: string | null;
  status: string | null;
  next_inspection_due: string | null;
};

type TorqueWrench = {
  id: string;
  torque_wrench_number: string | null;
  serial_number: string | null;
  expiry_date: string | null;
  status: string | null;
};

type Ladder = {
  id: string;
  ladder_number: string | null;
  status: string | null;
  last_internal_inspection: string | null;
};

type Generator = {
  id: string;
  generator_number: string | null;
  status: string | null;
  last_service_date: string | null;
};

type PpeStock = {
  id: string;
  item_name: string | null;
  variant: string | null;
  current_stock: number | null;
  minimum_stock: number | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function dateLabel(value: unknown) {
  const raw = clean(value);
  if (!raw) return "No date";

  const parsed = new Date(`${raw.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;

  return parsed.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(value: unknown) {
  const raw = clean(value);
  if (!raw) return null;

  const due = new Date(`${raw.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
}

function daysSince(value: unknown) {
  const raw = clean(value);
  if (!raw) return null;

  const date = new Date(`${raw.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.floor((today.getTime() - date.getTime()) / 86_400_000);
}

function activeStatus(value: unknown) {
  return ![
    "inactive",
    "retired",
    "sold",
    "superseded",
    "decommissioned",
    "off hire",
  ].includes(clean(value).toLowerCase());
}

function isOpenJob(value: unknown) {
  return !["completed", "closed", "cancelled", "canceled", "resolved"].includes(
    clean(value).toLowerCase(),
  );
}

function hasCurrentDocument(
  documents: AssetDocument[],
  assetType: "vehicle" | "plant",
  assetId: string,
  systemKey: string,
) {
  return documents.some((document) => {
    const linkedId =
      assetType === "vehicle"
        ? document.vehicle_asset_id
        : document.plant_asset_id;

    return (
      document.asset_type === assetType &&
      linkedId === assetId &&
      document.active !== false &&
      document.is_current !== false &&
      clean(document.system_key).toLowerCase() === systemKey
    );
  });
}

function vehicleLabel(vehicle: Vehicle) {
  return [
    clean(vehicle.vehicle_id),
    clean(vehicle.vehicle_rego),
    [clean(vehicle.make), clean(vehicle.model)].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" · ");
}

function plantLabel(plant: Plant) {
  return [
    clean(plant.asset_id),
    clean(plant.rego),
    [clean(plant.make), clean(plant.model)].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" · ");
}

function pushDateIssue(
  items: ComplianceItem[],
  input: {
    id: string;
    area: string;
    title: string;
    label: string;
    date: string | null;
    href: string;
    missingIsCritical?: boolean;
    dueWindow?: number;
  },
) {
  const days = daysUntil(input.date);

  if (days === null) {
    if (input.missingIsCritical) {
      items.push({
        id: `${input.id}-missing`,
        area: input.area,
        title: `${input.title} missing`,
        detail: `No ${input.label.toLowerCase()} date is recorded.`,
        severity: "Critical",
        href: input.href,
      });
    }
    return;
  }

  if (days < 0) {
    items.push({
      id: `${input.id}-expired`,
      area: input.area,
      title: `${input.title} overdue`,
      detail: `${input.label} was due ${Math.abs(days)} day${
        Math.abs(days) === 1 ? "" : "s"
      } ago.`,
      severity: "Critical",
      href: input.href,
      dueDate: input.date,
    });
    return;
  }

  if (days <= (input.dueWindow ?? 30)) {
    items.push({
      id: `${input.id}-soon`,
      area: input.area,
      title: `${input.title} due soon`,
      detail: `${input.label} is due in ${days} day${days === 1 ? "" : "s"}.`,
      severity: "Upcoming",
      href: input.href,
      dueDate: input.date,
    });
  }
}

export default function CompliancePage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [plant, setPlant] = useState<Plant[]>([]);
  const [documents, setDocuments] = useState<AssetDocument[]>([]);
  const [fleetJobs, setFleetJobs] = useState<FleetJob[]>([]);
  const [liftingGear, setLiftingGear] = useState<LiftingGear[]>([]);
  const [torqueWrenches, setTorqueWrenches] = useState<TorqueWrench[]>([]);
  const [ladders, setLadders] = useState<Ladder[]>([]);
  const [generators, setGenerators] = useState<Generator[]>([]);
  const [ppe, setPpe] = useState<PpeStock[]>([]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [filter, setFilter] = useState<"All" | Severity>("All");

  const fetchComplianceData = useCallback(async () => {
    const [
      vehicleResult,
      plantResult,
      documentResult,
      fleetResult,
      liftingResult,
      torqueResult,
      ladderResult,
      generatorResult,
      ppeResult,
    ] = await Promise.all([
      supabase.from("vehicle_assets").select("*"),
      supabase.from("plant_assets").select("*"),
      supabase
        .from("asset_documents")
        .select(
          "id,asset_type,vehicle_asset_id,plant_asset_id,document_type_code,document_type_name,system_key,is_current,active,expiry_date",
        )
        .eq("active", true),
      supabase
        .from("fleet_jobs")
        .select("id,job_number,status,priority,asset_label"),
      supabase
        .from("equipment_lifting_gear")
        .select("id,serial_id,equipment_type,status,next_inspection_due"),
      supabase
        .from("equipment_torque_wrenches")
        .select("id,torque_wrench_number,serial_number,expiry_date,status"),
      supabase
        .from("equipment_ladders")
        .select("id,ladder_number,status,last_internal_inspection"),
      supabase
        .from("equipment_generators")
        .select("id,generator_number,status,last_service_date"),
      supabase
        .from("inventory_ppe_stock")
        .select("id,item_name,variant,current_stock,minimum_stock"),
    ]);

    const errors = [
      vehicleResult.error?.message,
      plantResult.error?.message,
      documentResult.error?.message,
      fleetResult.error?.message,
      liftingResult.error?.message,
      torqueResult.error?.message,
      ladderResult.error?.message,
      generatorResult.error?.message,
      ppeResult.error?.message,
    ].filter(Boolean);

    return {
      errorMessage: errors.join(" · "),
      vehicles: (vehicleResult.data ?? []) as Vehicle[],
      plant: (plantResult.data ?? []) as Plant[],
      documents: (documentResult.data ?? []) as AssetDocument[],
      fleetJobs: (fleetResult.data ?? []) as FleetJob[],
      liftingGear: (liftingResult.data ?? []) as LiftingGear[],
      torqueWrenches: (torqueResult.data ?? []) as TorqueWrench[],
      ladders: (ladderResult.data ?? []) as Ladder[],
      generators: (generatorResult.data ?? []) as Generator[],
      ppe: (ppeResult.data ?? []) as PpeStock[],
    };
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    void fetchComplianceData()
      .then((result) => {
        if (cancelled) return;

        setErrorMessage(result.errorMessage);
        setVehicles(result.vehicles);
        setPlant(result.plant);
        setDocuments(result.documents);
        setFleetJobs(result.fleetJobs);
        setLiftingGear(result.liftingGear);
        setTorqueWrenches(result.torqueWrenches);
        setLadders(result.ladders);
        setGenerators(result.generators);
        setPpe(result.ppe);
      })
      .catch((error: unknown) => {
        if (cancelled) return;

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not load the Assets compliance registers.",
        );
        setVehicles([]);
        setPlant([]);
        setDocuments([]);
        setFleetJobs([]);
        setLiftingGear([]);
        setTorqueWrenches([]);
        setLadders([]);
        setGenerators([]);
        setPpe([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchComplianceData]);

  const refreshData = useCallback(() => {
    setLoading(true);
    setErrorMessage("");

    void fetchComplianceData()
      .then((result) => {
        setErrorMessage(result.errorMessage);
        setVehicles(result.vehicles);
        setPlant(result.plant);
        setDocuments(result.documents);
        setFleetJobs(result.fleetJobs);
        setLiftingGear(result.liftingGear);
        setTorqueWrenches(result.torqueWrenches);
        setLadders(result.ladders);
        setGenerators(result.generators);
        setPpe(result.ppe);
      })
      .catch((error: unknown) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not refresh the Assets compliance registers.",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [fetchComplianceData]);

  const issues = useMemo(() => {
    const items: ComplianceItem[] = [];

    for (const vehicle of vehicles.filter((row) => activeStatus(row.status))) {
      const label = vehicleLabel(vehicle) || "Vehicle";
      const href = `/assets/update?assetType=vehicle&assetId=${vehicle.id}`;
      const isTrailer = clean(vehicle.category).toLowerCase().includes("trailer");

      pushDateIssue(items, {
        id: `vehicle-${vehicle.id}-rego`,
        area: "Vehicles",
        title: `${label} registration`,
        label: "Registration",
        date: vehicle.rego_expiry,
        href,
        missingIsCritical: true,
      });

      if (!isTrailer) {
        pushDateIssue(items, {
          id: `vehicle-${vehicle.id}-insurance`,
          area: "Vehicles",
          title: `${label} insurance`,
          label: "Insurance",
          date: vehicle.insurance_expiry,
          href,
          missingIsCritical: true,
        });
      }

      pushDateIssue(items, {
        id: `vehicle-${vehicle.id}-service`,
        area: "Vehicles",
        title: `${label} service`,
        label: "Service",
        date: vehicle.next_service_due,
        href,
      });

      pushDateIssue(items, {
        id: `vehicle-${vehicle.id}-inspection`,
        area: "Vehicles",
        title: `${label} inspection`,
        label: "Inspection",
        date: vehicle.next_inspection_due,
        href,
      });

      if (!hasCurrentDocument(documents, "vehicle", vehicle.id, "risk_assessment")) {
        items.push({
          id: `vehicle-${vehicle.id}-ra`,
          area: "Vehicles",
          title: `${label} missing current risk assessment`,
          detail:
            "No current Risk Assessment document is linked through the Asset document register.",
          severity: "Monitor",
          href: `/assets/vehicles/${vehicle.id}`,
        });
      }

      if (!hasCurrentDocument(documents, "vehicle", vehicle.id, "user_manual")) {
        items.push({
          id: `vehicle-${vehicle.id}-manual`,
          area: "Vehicles",
          title: `${label} missing current user manual`,
          detail:
            "No current User Manual document is linked through the Asset document register.",
          severity: "Monitor",
          href: `/assets/vehicles/${vehicle.id}`,
        });
      }
    }

    for (const asset of plant.filter((row) => activeStatus(row.asset_status))) {
      const label = plantLabel(asset) || "Plant";
      const href = `/assets/update?assetType=plant&assetId=${asset.id}`;
      const isCrane = clean(asset.plant_type).toLowerCase() === "crane";

      pushDateIssue(items, {
        id: `plant-${asset.id}-insurance`,
        area: "Plant",
        title: `${label} insurance`,
        label: "Insurance",
        date: asset.insurance_expiry,
        href,
        missingIsCritical: true,
      });

      pushDateIssue(items, {
        id: `plant-${asset.id}-service`,
        area: "Plant",
        title: `${label} service`,
        label: "Service",
        date: asset.next_service_due,
        href,
      });

      pushDateIssue(items, {
        id: `plant-${asset.id}-inspection`,
        area: "Plant",
        title: `${label} inspection`,
        label: "Inspection",
        date: asset.next_inspection_due,
        href,
      });

      if (clean(asset.rego)) {
        pushDateIssue(items, {
          id: `plant-${asset.id}-rego`,
          area: "Plant",
          title: `${label} registration`,
          label: "Registration",
          date: asset.rego_expiry,
          href,
        });
      }

      if (isCrane) {
        pushDateIssue(items, {
          id: `plant-${asset.id}-cranesafe`,
          area: "Cranes",
          title: `${label} CraneSafe`,
          label: "CraneSafe",
          date: asset.cranesafe_expiry,
          href,
          missingIsCritical: true,
          dueWindow: 45,
        });

        pushDateIssue(items, {
          id: `plant-${asset.id}-10yr`,
          area: "Cranes",
          title: `${label} 10 Year Inspection`,
          label: "10 Year Inspection",
          date: asset.ten_year_inspection_due,
          href,
          dueWindow: 90,
        });
      }

      if (!hasCurrentDocument(documents, "plant", asset.id, "risk_assessment")) {
        items.push({
          id: `plant-${asset.id}-ra`,
          area: "Plant",
          title: `${label} missing current risk assessment`,
          detail:
            "No current Risk Assessment document is linked through the Asset document register.",
          severity: "Monitor",
          href: `/assets/plant/${asset.id}`,
        });
      }

      if (!hasCurrentDocument(documents, "plant", asset.id, "user_manual")) {
        items.push({
          id: `plant-${asset.id}-manual`,
          area: "Plant",
          title: `${label} missing current user manual`,
          detail:
            "No current User Manual document is linked through the Asset document register.",
          severity: "Monitor",
          href: `/assets/plant/${asset.id}`,
        });
      }
    }

    for (const job of fleetJobs.filter((job) => isOpenJob(job.status))) {
      const priority = clean(job.priority).toLowerCase();

      items.push({
        id: `fleet-${job.id}`,
        area: "Fleet Jobs",
        title: `${clean(job.job_number) || "Fleet Job"} is open`,
        detail: clean(job.asset_label) || "Maintenance action requires close-out.",
        severity:
          priority === "critical" || priority === "high"
            ? "Critical"
            : "Monitor",
        href: `/assets/fleet-jobs/${job.id}`,
      });
    }

    for (const item of liftingGear) {
      const days = daysUntil(item.next_inspection_due);
      const label = [clean(item.serial_id), clean(item.equipment_type)]
        .filter(Boolean)
        .join(" · ");

      if (days !== null && days < 0) {
        items.push({
          id: `lifting-${item.id}`,
          area: "Lifting Gear",
          title: `${label || "Lifting gear"} inspection overdue`,
          detail: `Inspection was due ${Math.abs(days)} day${
            Math.abs(days) === 1 ? "" : "s"
          } ago.`,
          severity: "Critical",
          href: "/assets/equipment/lifting-gear",
          dueDate: item.next_inspection_due,
        });
      } else if (days !== null && days <= 30) {
        items.push({
          id: `lifting-${item.id}`,
          area: "Lifting Gear",
          title: `${label || "Lifting gear"} inspection due soon`,
          detail: `Inspection is due in ${days} day${days === 1 ? "" : "s"}.`,
          severity: "Upcoming",
          href: "/assets/equipment/lifting-gear",
          dueDate: item.next_inspection_due,
        });
      }
    }

    for (const item of torqueWrenches) {
      const days = daysUntil(item.expiry_date);
      const label =
        clean(item.torque_wrench_number) ||
        clean(item.serial_number) ||
        "Torque wrench";

      if (days !== null && days < 0) {
        items.push({
          id: `torque-${item.id}`,
          area: "Torque Wrenches",
          title: `${label} calibration expired`,
          detail: `Calibration expired ${Math.abs(days)} day${
            Math.abs(days) === 1 ? "" : "s"
          } ago.`,
          severity: "Critical",
          href: "/assets/equipment/torque-wrenches",
          dueDate: item.expiry_date,
        });
      } else if (days !== null && days <= 30) {
        items.push({
          id: `torque-${item.id}`,
          area: "Torque Wrenches",
          title: `${label} calibration due soon`,
          detail: `Calibration expires in ${days} day${days === 1 ? "" : "s"}.`,
          severity: "Upcoming",
          href: "/assets/equipment/torque-wrenches",
          dueDate: item.expiry_date,
        });
      }
    }

    for (const item of ladders) {
      const age = daysSince(item.last_internal_inspection);
      if (age !== null && age > 90) {
        items.push({
          id: `ladder-${item.id}`,
          area: "Ladders",
          title: `${clean(item.ladder_number) || "Ladder"} inspection ageing`,
          detail: `Last internal inspection was ${age} days ago.`,
          severity: "Critical",
          href: "/assets/equipment/ladders",
        });
      } else if (age !== null && age > 60) {
        items.push({
          id: `ladder-${item.id}`,
          area: "Ladders",
          title: `${clean(item.ladder_number) || "Ladder"} inspection review`,
          detail: `Last internal inspection was ${age} days ago.`,
          severity: "Upcoming",
          href: "/assets/equipment/ladders",
        });
      }
    }

    for (const item of generators) {
      const age = daysSince(item.last_service_date);
      if (age !== null && age > 180) {
        items.push({
          id: `generator-${item.id}`,
          area: "Generators",
          title: `${clean(item.generator_number) || "Generator"} service review`,
          detail: `Last recorded service was ${age} days ago.`,
          severity: "Critical",
          href: "/assets/equipment/generators",
        });
      } else if (age !== null && age > 90) {
        items.push({
          id: `generator-${item.id}`,
          area: "Generators",
          title: `${clean(item.generator_number) || "Generator"} service ageing`,
          detail: `Last recorded service was ${age} days ago.`,
          severity: "Upcoming",
          href: "/assets/equipment/generators",
        });
      }
    }

    for (const item of ppe) {
      const current = Number(item.current_stock ?? 0);
      const minimum = Number(item.minimum_stock ?? 0);

      if (current < minimum) {
        items.push({
          id: `ppe-${item.id}`,
          area: "Inventory",
          title: `${clean(item.item_name) || "PPE"} stock below minimum`,
          detail: `${clean(item.variant) || "Standard"}: ${current} on hand, minimum ${minimum}.`,
          severity: "Monitor",
          href: "/assets/equipment/inventory",
        });
      }
    }

    const rank: Record<Severity, number> = {
      Critical: 0,
      Upcoming: 1,
      Monitor: 2,
    };

    return items.sort((a, b) => {
      const severity = rank[a.severity] - rank[b.severity];
      if (severity !== 0) return severity;

      return clean(a.dueDate).localeCompare(clean(b.dueDate));
    });
  }, [
    documents,
    fleetJobs,
    generators,
    ladders,
    liftingGear,
    plant,
    ppe,
    torqueWrenches,
    vehicles,
  ]);

  const filtered = useMemo(
    () =>
      filter === "All"
        ? issues
        : issues.filter((item) => item.severity === filter),
    [filter, issues],
  );

  const counts = useMemo(
    () => ({
      critical: issues.filter((item) => item.severity === "Critical").length,
      upcoming: issues.filter((item) => item.severity === "Upcoming").length,
      monitor: issues.filter((item) => item.severity === "Monitor").length,
      currentAssets:
        vehicles.filter((row) => activeStatus(row.status)).length +
        plant.filter((row) => activeStatus(row.asset_status)).length,
    }),
    [issues, plant, vehicles],
  );

  return (
    <PageShell>
      <PageHeader
        eyebrow="Assets"
        title="Compliance Centre"
        description="Exception-based view across the current Vehicle, Plant, Fleet Job and Equipment registers. Update the source register once and this page follows it."
        actions={
          <button
            type="button"
            onClick={refreshData}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        }
      />

      {errorMessage ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {errorMessage}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          title="Critical"
          value={loading ? "…" : String(counts.critical)}
          icon={<CircleAlert size={20} />}
          tone="rose"
        />
        <Kpi
          title="Upcoming"
          value={loading ? "…" : String(counts.upcoming)}
          icon={<CalendarClock size={20} />}
          tone="amber"
        />
        <Kpi
          title="Monitor"
          value={loading ? "…" : String(counts.monitor)}
          icon={<AlertTriangle size={20} />}
          tone="blue"
        />
        <Kpi
          title="Active Vehicle + Plant"
          value={loading ? "…" : String(counts.currentAssets)}
          icon={<CheckCircle2 size={20} />}
          tone="emerald"
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {(["All", "Critical", "Upcoming", "Monitor"] as const).map(
            (option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={`rounded-xl px-4 py-2 text-sm font-black ${
                  filter === option
                    ? "bg-slate-950 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {option}
              </button>
            ),
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-black text-slate-950">Compliance Issues</h2>
          <p className="mt-1 text-sm text-slate-500">
            {loading
              ? "Loading registers..."
              : `${filtered.length} issue${filtered.length === 1 ? "" : "s"} shown`}
          </p>
        </div>

        {filtered.length === 0 && !loading ? (
          <div className="p-10 text-center">
            <ShieldCheck size={30} className="mx-auto text-emerald-500" />
            <div className="mt-3 font-black text-slate-900">
              No issues in this filter
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="flex flex-col gap-3 px-5 py-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={item.severity} />
                    <span className="text-xs font-black uppercase tracking-wide text-slate-400">
                      {item.area}
                    </span>
                  </div>
                  <div className="mt-2 font-black text-slate-950">
                    {item.title}
                  </div>
                  <div className="mt-1 text-sm leading-6 text-slate-500">
                    {item.detail}
                    {item.dueDate ? ` Due: ${dateLabel(item.dueDate)}.` : ""}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-black text-slate-700">
                  Open →
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <QuickLink
          href="/assets/vehicles"
          icon={<Truck size={20} />}
          title="Vehicle Register"
        />
        <QuickLink
          href="/assets/plant"
          icon={<Wrench size={20} />}
          title="Plant Register"
        />
        <QuickLink
          href="/assets/equipment"
          icon={<ShieldCheck size={20} />}
          title="Equipment Registers"
        />
      </section>
    </PageShell>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const classes =
    severity === "Critical"
      ? "bg-rose-100 text-rose-800"
      : severity === "Upcoming"
        ? "bg-amber-100 text-amber-800"
        : "bg-blue-100 text-blue-800";

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${classes}`}>
      {severity}
    </span>
  );
}

function Kpi({
  title,
  value,
  icon,
  tone,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  tone: "rose" | "amber" | "blue" | "emerald";
}) {
  const classes =
    tone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "emerald"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-blue-200 bg-blue-50 text-blue-800";

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${classes}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-black uppercase tracking-wide opacity-75">
          {title}
        </div>
        {icon}
      </div>
      <div className="mt-3 text-3xl font-black">{value}</div>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  title,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 font-black text-slate-900 shadow-sm hover:bg-slate-50"
    >
      <div className="rounded-xl bg-slate-100 p-2 text-slate-600">{icon}</div>
      {title}
    </Link>
  );
}
