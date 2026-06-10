/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import {
  AlertTriangle,
  CalendarClock,
  ClipboardCheck,
  FileText,
  Plus,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ActionButton,
  DetailGrid,
  KpiCard,
  PageHeader,
  PageShell,
  StatusBadge,
} from "./components";

type Tone = "emerald" | "amber" | "rose" | "blue" | "slate" | "violet";

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
  next_inspection_due: string | null;
  next_service_km: number | null;
  created_at: string | null;
};

type PlantAsset = {
  id: string;
  asset_id: string | null;
  plant_id: string | null;
  name: string | null;
  make: string | null;
  model: string | null;
  category: string | null;
  project: string | null;
  crew: string | null;
  status: string | null;
  rego_expiry: string | null;
  insurance_expiry: string | null;
  service_due: string | null;
  next_service_due: string | null;
  cranesafe_expiry: string | null;
  risk_assessment_expiry: string | null;
  created_at: string | null;
};

type EquipmentAsset = {
  id: string;
  equipment_id: string | null;
  asset_id: string | null;
  name: string | null;
  category: string | null;
  project: string | null;
  crew: string | null;
  status: string | null;
  inspection_due: string | null;
  next_inspection_due: string | null;
  risk_assessment_expiry: string | null;
  created_at: string | null;
};

type PrestartRecord = {
  id: string;
  vehicle_asset_id: string | null;
  asset_label: string | null;
  vehicle_rego: string | null;
  inspected_by_name: string | null;
  overall_condition: string | null;
  comments: string | null;
  severity: string | null;
  result: string | null;
  fleet_job_id: string | null;
  prestart_date: string | null;
  created_at: string | null;
};

type FleetJob = {
  id: string;
  job_number: string | null;
  title: string | null;
  description: string | null;
  priority: string | null;
  status: string | null;
  project: string | null;
  crew: string | null;
  reported_by: string | null;
  assigned_to: string | null;
  due_date: string | null;
  vehicle_asset_id: string | null;
  created_at: string | null;
};

type VehicleDocument = {
  id: string;
  vehicle_asset_id: string | null;
  document_type: string | null;
  file_name: string | null;
  created_at: string | null;
};

type VehicleServiceHistory = {
  id: string;
  vehicle_asset_id: string | null;
  record_type: string | null;
  service_date: string | null;
  inspection_date: string | null;
  modification_date: string | null;
  next_service_due: string | null;
  next_inspection_due: string | null;
  created_at: string | null;
};

type Reminder = {
  id: string;
  asset: string;
  assetType: string;
  label: string;
  dueDate: string | null;
  href: string;
  tone: Tone;
};

function clean(value: string | null | undefined) {
  return value?.trim() || "N/A";
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

  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function isOpenStatus(status: string | null | undefined) {
  const value = clean(status).toLowerCase();

  return !["closed", "complete", "completed", "resolved", "cancelled"].includes(
    value,
  );
}

function isUnavailableStatus(status: string | null | undefined) {
  const value = clean(status).toLowerCase();

  return [
    "out of service",
    "under maintenance",
    "off hire",
    "inactive",
    "retired",
    "superseded",
    "not hired",
    "no longer hired",
  ].includes(value);
}

function statusTone(status: string | null | undefined): Tone {
  const value = clean(status).toLowerCase();

  if (["available", "active", "complete", "completed", "resolved"].includes(value)) {
    return "emerald";
  }

  if (["in use", "on hire", "open", "in progress"].includes(value)) {
    return "blue";
  }

  if (["high", "urgent", "critical", "out of service", "expired"].includes(value)) {
    return "rose";
  }

  if (["minor", "medium", "due soon", "review", "under maintenance"].includes(value)) {
    return "amber";
  }

  return "slate";
}

function priorityTone(priority: string | null | undefined): Tone {
  const value = clean(priority).toLowerCase();

  if (["urgent", "high", "critical"].includes(value)) return "rose";
  if (["medium", "moderate"].includes(value)) return "amber";
  if (["low"].includes(value)) return "blue";

  return "slate";
}

function dueTone(dateValue: string | null | undefined): Tone {
  const days = daysUntil(dateValue);

  if (days === null) return "slate";
  if (days < 0) return "rose";
  if (days <= 30) return "amber";

  return "emerald";
}

function vehicleLabel(vehicle: VehicleAsset) {
  const id = clean(vehicle.vehicle_id);
  const rego = clean(vehicle.vehicle_rego);
  const makeModel = [vehicle.make, vehicle.model]
    .map(clean)
    .filter((item) => item !== "N/A")
    .join(" ");

  if (id !== "N/A" && makeModel) return `${id} - ${makeModel}`;
  if (id !== "N/A") return id;
  if (rego !== "N/A") return rego;

  return "Vehicle";
}

function plantLabel(asset: PlantAsset) {
  return (
    clean(asset.asset_id) !== "N/A"
      ? clean(asset.asset_id)
      : clean(asset.plant_id) !== "N/A"
        ? clean(asset.plant_id)
        : clean(asset.name) !== "N/A"
          ? clean(asset.name)
          : [asset.make, asset.model]
              .map(clean)
              .filter((item) => item !== "N/A")
              .join(" ") || "Plant"
  );
}

function equipmentLabel(asset: EquipmentAsset) {
  return clean(asset.equipment_id) !== "N/A"
    ? clean(asset.equipment_id)
    : clean(asset.asset_id) !== "N/A"
      ? clean(asset.asset_id)
      : clean(asset.name) !== "N/A"
        ? clean(asset.name)
        : "Equipment";
}

function DashboardPanel({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-950">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>
        </div>
        {count !== undefined ? <StatusBadge label={String(count)} /> : null}
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

export default function AssetsDashboardPage() {
  const supabase = useMemo(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment variables.");
    }

    return createClient(supabaseUrl, supabaseAnonKey);
  }, []);

  const [vehicles, setVehicles] = useState<VehicleAsset[]>([]);
  const [plant, setPlant] = useState<PlantAsset[]>([]);
  const [equipment, setEquipment] = useState<EquipmentAsset[]>([]);
  const [prestarts, setPrestarts] = useState<PrestartRecord[]>([]);
  const [fleetJobs, setFleetJobs] = useState<FleetJob[]>([]);
  const [vehicleDocuments, setVehicleDocuments] = useState<VehicleDocument[]>([]);
  const [vehicleHistory, setVehicleHistory] = useState<VehicleServiceHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadDashboard() {
    setLoading(true);
    setErrorMessage("");

    const [
      vehiclesResult,
      plantResult,
      equipmentResult,
      prestartsResult,
      fleetJobsResult,
      vehicleDocumentsResult,
      vehicleHistoryResult,
    ] = await Promise.all([
      supabase
        .from("vehicle_assets")
        .select("*")
        .order("created_at", { ascending: false })
        .returns<VehicleAsset[]>(),

      supabase
        .from("plant_assets")
        .select("*")
        .order("created_at", { ascending: false })
        .returns<PlantAsset[]>(),

      supabase
        .from("equipment_assets")
        .select("*")
        .order("created_at", { ascending: false })
        .returns<EquipmentAsset[]>(),

      supabase
        .from("vehicle_prestarts")
        .select(
          "id, vehicle_asset_id, asset_label, vehicle_rego, inspected_by_name, overall_condition, comments, severity, result, fleet_job_id, prestart_date, created_at",
        )
        .order("prestart_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(8)
        .returns<PrestartRecord[]>(),

      supabase
        .from("fleet_jobs")
        .select(
          "id, job_number, title, description, priority, status, project, crew, reported_by, assigned_to, due_date, vehicle_asset_id, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(12)
        .returns<FleetJob[]>(),

      supabase
        .from("vehicle_documents")
        .select("id, vehicle_asset_id, document_type, file_name, created_at")
        .order("created_at", { ascending: false })
        .returns<VehicleDocument[]>(),

      supabase
        .from("vehicle_service_history")
        .select(
          "id, vehicle_asset_id, record_type, service_date, inspection_date, modification_date, next_service_due, next_inspection_due, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(8)
        .returns<VehicleServiceHistory[]>(),
    ]);

    if (vehiclesResult.error) {
      setErrorMessage(vehiclesResult.error.message);
    }

    setVehicles(vehiclesResult.error ? [] : (vehiclesResult.data ?? []));
    setPlant(plantResult.error ? [] : (plantResult.data ?? []));
    setEquipment(equipmentResult.error ? [] : (equipmentResult.data ?? []));
    setPrestarts(prestartsResult.error ? [] : (prestartsResult.data ?? []));
    setFleetJobs(fleetJobsResult.error ? [] : (fleetJobsResult.data ?? []));
    setVehicleDocuments(
      vehicleDocumentsResult.error ? [] : (vehicleDocumentsResult.data ?? []),
    );
    setVehicleHistory(
      vehicleHistoryResult.error ? [] : (vehicleHistoryResult.data ?? []),
    );

    setLoading(false);
  }

  useEffect(() => {
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openFleetJobs = fleetJobs.filter((job) => isOpenStatus(job.status));

  const prestartFlags = prestarts.filter((record) => {
    const severity = clean(record.severity).toLowerCase();
    const result = clean(record.result).toLowerCase();
    const condition = clean(record.overall_condition).toLowerCase();

    return (
      severity === "critical" ||
      severity === "major" ||
      severity === "minor" ||
      result.includes("fail") ||
      result.includes("issue") ||
      condition.includes("poor") ||
      condition.includes("defect")
    );
  });

  const unavailableAssets =
    vehicles.filter((asset) => isUnavailableStatus(asset.status)).length +
    plant.filter((asset) => isUnavailableStatus(asset.status)).length +
    equipment.filter((asset) => isUnavailableStatus(asset.status)).length;

  const availableAssets =
    vehicles.filter((asset) => clean(asset.status).toLowerCase() === "available")
      .length +
    plant.filter((asset) => clean(asset.status).toLowerCase() === "available")
      .length +
    equipment.filter((asset) => clean(asset.status).toLowerCase() === "available")
      .length;

  const complianceReminders = useMemo(() => {
    const reminders: Reminder[] = [];

    vehicles.forEach((vehicle) => {
      const label = vehicleLabel(vehicle);

      [
        { label: "Rego", value: vehicle.rego_expiry },
        { label: "Insurance", value: vehicle.insurance_expiry },
        { label: "Service", value: vehicle.next_service_due },
        { label: "Inspection", value: vehicle.next_inspection_due },
      ].forEach((item) => {
        const days = daysUntil(item.value);
        if (days !== null && days <= 45) {
          reminders.push({
            id: `vehicle-${vehicle.id}-${item.label}`,
            asset: label,
            assetType: clean(vehicle.category),
            label: item.label,
            dueDate: item.value,
            href: `/assets/vehicles/${vehicle.id}`,
            tone: dueTone(item.value),
          });
        }
      });
    });

    plant.forEach((asset) => {
      const label = plantLabel(asset);

      [
        { label: "Rego", value: asset.rego_expiry },
        { label: "Insurance", value: asset.insurance_expiry },
        { label: "Service", value: asset.next_service_due || asset.service_due },
        { label: "CraneSafe", value: asset.cranesafe_expiry },
        { label: "Risk Assessment", value: asset.risk_assessment_expiry },
      ].forEach((item) => {
        const days = daysUntil(item.value);
        if (days !== null && days <= 45) {
          reminders.push({
            id: `plant-${asset.id}-${item.label}`,
            asset: label,
            assetType: clean(asset.category),
            label: item.label,
            dueDate: item.value,
            href: `/assets/plant/${asset.id}`,
            tone: dueTone(item.value),
          });
        }
      });
    });

    equipment.forEach((asset) => {
      const label = equipmentLabel(asset);

      [
        {
          label: "Inspection",
          value: asset.next_inspection_due || asset.inspection_due,
        },
        { label: "Risk Assessment", value: asset.risk_assessment_expiry },
      ].forEach((item) => {
        const days = daysUntil(item.value);
        if (days !== null && days <= 45) {
          reminders.push({
            id: `equipment-${asset.id}-${item.label}`,
            asset: label,
            assetType: clean(asset.category),
            label: item.label,
            dueDate: item.value,
            href: `/assets/equipment/${asset.id}`,
            tone: dueTone(item.value),
          });
        }
      });
    });

    return reminders
      .sort((a, b) => (daysUntil(a.dueDate) ?? 9999) - (daysUntil(b.dueDate) ?? 9999))
      .slice(0, 8);
  }, [vehicles, plant, equipment]);

  const totalAssets = vehicles.length + plant.length + equipment.length;

  const recentActivity = [
    ...vehicleHistory.map((item) => ({
      id: `history-${item.id}`,
      title: clean(item.record_type),
      detail: `Vehicle service / update record`,
      date: item.service_date || item.inspection_date || item.modification_date || item.created_at,
      href: item.vehicle_asset_id
        ? `/assets/vehicles/${item.vehicle_asset_id}`
        : "/assets/vehicles",
      tone: "blue" as Tone,
    })),
    ...prestarts.map((item) => ({
      id: `prestart-${item.id}`,
      title: `Prestart - ${clean(item.asset_label || item.vehicle_rego)}`,
      detail: clean(item.comments || item.result),
      date: item.prestart_date || item.created_at,
      href: `/assets/prestarts/${item.id}`,
      tone: statusTone(item.severity),
    })),
  ]
    .sort(
      (a, b) =>
        new Date(b.date || "").getTime() - new Date(a.date || "").getTime(),
    )
    .slice(0, 6);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Fleet Assets"
        title="Fleet Dashboard"
        description="High-level live dashboard for plant, vehicles, equipment, Fleet Jobs, prestart flags, service reminders and compliance actions."
        actions={
          <>
            <ActionButton href="/assets/fleet-jobs" icon={<Wrench size={16} />}>
              Fleet Jobs
            </ActionButton>
            <ActionButton
              href="/assets/prestarts"
              variant="secondary"
              icon={<ClipboardCheck size={16} />}
            >
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
          value={loading ? "..." : String(totalAssets)}
          detail="plant, vehicles, equipment"
          tone="blue"
        />
        <KpiCard
          label="Open Jobs"
          value={loading ? "..." : String(openFleetJobs.length)}
          detail="awaiting action"
          tone={openFleetJobs.length > 0 ? "rose" : "emerald"}
        />
        <KpiCard
          label="Prestart Flags"
          value={loading ? "..." : String(prestartFlags.length)}
          detail="recent issues raised"
          tone={prestartFlags.length > 0 ? "amber" : "emerald"}
        />
        <KpiCard
          label="Unavailable"
          value={loading ? "..." : String(unavailableAssets)}
          detail="out of service / inactive"
          tone={unavailableAssets > 0 ? "rose" : "emerald"}
        />
        <KpiCard
          label="Available"
          value={loading ? "..." : String(availableAssets)}
          detail="ready for allocation"
          tone="emerald"
        />
        <KpiCard
          label="Due Soon"
          value={loading ? "..." : String(complianceReminders.length)}
          detail="next 45 days"
          tone={complianceReminders.length > 0 ? "amber" : "emerald"}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <DashboardPanel
          title="Fleet Jobs Needing Attention"
          description="Open maintenance, defect and fleet jobs requiring follow-up."
          count={openFleetJobs.length}
        >
          {loading ? (
            <EmptyState text="Loading Fleet Jobs..." />
          ) : openFleetJobs.length > 0 ? (
            <div className="space-y-3">
              {openFleetJobs.slice(0, 5).map((job) => (
                <Link
                  key={job.id}
                  href={`/assets/fleet-jobs/${job.id}`}
                  className="block border border-slate-200 bg-slate-50 p-4 transition hover:border-amber-300 hover:bg-amber-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {clean(job.job_number)} · {clean(job.title)}
                      </p>
                      <p className="mt-1 text-sm leading-5 text-slate-600">
                        {clean(job.description)}
                      </p>
                      <p className="mt-2 text-xs font-semibold text-slate-500">
                        Due {formatDate(job.due_date)} · Assigned{" "}
                        {clean(job.assigned_to)}
                      </p>
                    </div>
                    <StatusBadge
                      label={clean(job.priority)}
                      tone={priorityTone(job.priority)}
                    />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState text="No open Fleet Jobs." />
          )}
        </DashboardPanel>

        <DashboardPanel
          title="Prestart Flags"
          description="Recent prestarts with failed, minor, major or critical findings."
          count={prestartFlags.length}
        >
          {loading ? (
            <EmptyState text="Loading prestarts..." />
          ) : prestartFlags.length > 0 ? (
            <div className="space-y-3">
              {prestartFlags.slice(0, 5).map((record) => (
                <Link
                  key={record.id}
                  href={`/assets/prestarts/${record.id}`}
                  className="block border border-slate-200 bg-slate-50 p-4 transition hover:border-sky-300 hover:bg-sky-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {clean(record.asset_label || record.vehicle_rego)}
                      </p>
                      <p className="mt-1 text-sm leading-5 text-slate-600">
                        {clean(record.comments || record.result)}
                      </p>
                      <p className="mt-2 text-xs font-semibold text-slate-500">
                        {formatDate(record.prestart_date || record.created_at)} ·{" "}
                        {clean(record.inspected_by_name)}
                      </p>
                    </div>
                    <StatusBadge
                      label={clean(record.severity)}
                      tone={statusTone(record.severity)}
                    />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState text="No recent prestart flags." />
          )}
        </DashboardPanel>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <DashboardPanel
          title="Compliance & Service Reminders"
          description="Items expired or due within the next 45 days."
          count={complianceReminders.length}
        >
          {loading ? (
            <EmptyState text="Loading reminders..." />
          ) : complianceReminders.length > 0 ? (
            <div className="space-y-3">
              {complianceReminders.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="block border border-slate-200 bg-slate-50 p-4 transition hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {item.asset}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {item.label} due {formatDate(item.dueDate)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {item.assetType}
                      </p>
                    </div>
                    <StatusBadge
                      label={
                        (daysUntil(item.dueDate) ?? 999) < 0
                          ? "Expired"
                          : "Due Soon"
                      }
                      tone={item.tone}
                    />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState text="No upcoming reminders in the next 45 days." />
          )}
        </DashboardPanel>

        <DashboardPanel
          title="Quick Actions"
          description="Common asset actions for fleet managers, supervisors and admin."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <ActionButton href="/assets/plant/new" variant="secondary" icon={<Plus size={16} />}>
              Add Plant
            </ActionButton>
            <ActionButton href="/assets/vehicles/new" variant="secondary" icon={<Plus size={16} />}>
              Add Vehicle
            </ActionButton>
            <ActionButton href="/assets/equipment/new" variant="secondary" icon={<Plus size={16} />}>
              Add Equipment
            </ActionButton>
            <ActionButton href="/assets/fleet-jobs/new" variant="secondary" icon={<Plus size={16} />}>
              Log Fleet Job
            </ActionButton>
            <ActionButton href="/assets/prestarts/new" variant="secondary" icon={<ClipboardCheck size={16} />}>
              Submit Prestart
            </ActionButton>
            <ActionButton href="/assets/compliance" variant="secondary" icon={<ShieldCheck size={16} />}>
              Compliance
            </ActionButton>
          </div>

          <div className="mt-5 border border-slate-200 bg-slate-50 p-4">
            <DetailGrid
              items={[
                { label: "Vehicles", value: String(vehicles.length) },
                { label: "Plant", value: String(plant.length) },
                { label: "Equipment", value: String(equipment.length) },
                { label: "Documents", value: String(vehicleDocuments.length) },
              ]}
            />
          </div>
        </DashboardPanel>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <DashboardPanel
          title="Recent Activity"
          description="Latest prestarts and vehicle service / update records."
          count={recentActivity.length}
        >
          {loading ? (
            <EmptyState text="Loading recent activity..." />
          ) : recentActivity.length > 0 ? (
            <div className="space-y-3">
              {recentActivity.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="block border border-slate-200 bg-slate-50 p-4 transition hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{item.title}</p>
                      <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {formatDate(item.date)}
                      </p>
                    </div>
                    <StatusBadge label="Activity" tone={item.tone} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState text="No recent activity found." />
          )}
        </DashboardPanel>

        <DashboardPanel
          title="Asset Register Overview"
          description="High-level split of the asset register."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="border border-slate-200 bg-slate-50 p-4">
              <Truck size={18} className="text-slate-500" />
              <p className="mt-3 text-sm font-bold text-slate-950">Vehicles</p>
              <p className="mt-1 text-2xl font-black text-slate-950">
                {vehicles.length}
              </p>
            </div>

            <div className="border border-slate-200 bg-slate-50 p-4">
              <Wrench size={18} className="text-slate-500" />
              <p className="mt-3 text-sm font-bold text-slate-950">Plant</p>
              <p className="mt-1 text-2xl font-black text-slate-950">
                {plant.length}
              </p>
            </div>

            <div className="border border-slate-200 bg-slate-50 p-4">
              <ShieldCheck size={18} className="text-slate-500" />
              <p className="mt-3 text-sm font-bold text-slate-950">Equipment</p>
              <p className="mt-1 text-2xl font-black text-slate-950">
                {equipment.length}
              </p>
            </div>

            <div className="border border-slate-200 bg-slate-50 p-4">
              <CalendarClock size={18} className="text-slate-500" />
              <p className="mt-3 text-sm font-bold text-slate-950">Reminders</p>
              <p className="mt-1 text-2xl font-black text-slate-950">
                {complianceReminders.length}
              </p>
            </div>
          </div>

          <div className="mt-5 border border-slate-200 bg-slate-50 p-4">
            <DetailGrid
              items={[
                { label: "Workflow", value: "Prestart → Fleet Job → Progress Updates → Asset Update" },
                { label: "Fleet Jobs", value: "Tracks issue status and close-out comments" },
                { label: "Asset Update", value: "Records actual service, repair or modification history" },
                { label: "Compliance", value: "Shows expiring rego, insurance, service and inspection items" },
              ]}
            />
          </div>
        </DashboardPanel>
      </section>
    </PageShell>
  );
}