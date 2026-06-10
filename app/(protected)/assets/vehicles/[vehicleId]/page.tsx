

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import {
  ArrowLeft,
  Calendar,
  Car,
  ClipboardCheck,
  ExternalLink,
  FileText,
  KeyRound,
  Pencil,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";
import {
  ActionButton,
  DetailGrid,
  PageHeader,
  PageShell,
  StatusBadge,
} from "../../components";

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
  year: string | null;
  style: string | null;
  owner: string | null;
  vin_number: string | null;
  company_onboard_date: string | null;
  last_service: string | null;
  rego_expiry: string | null;
  insurance_expiry: string | null;
  next_service_due: string | null;
  next_service_km: number | null;
  service_interval_km: number | null;
  next_inspection_due: string | null;
  hired: boolean | null;
  hired_from: string | null;
  hire_term: string | null;
  spare_key_provided: boolean | null;
  spare_key_location: string | null;
  ehub: boolean | null;
  dashcam: boolean | null;
  alert_button: boolean | null;
  fuel_card: boolean | null;
  reverse_squawker: boolean | null;
  uhf_radio: boolean | null;
  fire_extinguisher: boolean | null;
  first_aid_kit: boolean | null;
  snake_bite_kit: boolean | null;
  wheel_nut_indicators: boolean | null;
  wheel_chocks: boolean | null;
  shovel: boolean | null;
  knapsack: boolean | null;
  notes: string | null;
  created_at: string | null;
};

type VehicleDocument = {
  id: string;
  document_type: string | null;
  file_name: string | null;
  file_url: string | null;
  storage_path: string | null;
  created_at: string | null;
};

type ServiceHistory = {
  id: string;
  record_type: string | null;
  service_date: string | null;
  inspection_date: string | null;
  modification_date: string | null;
  service_type: string | null;
  inspection_type: string | null;
  modification_type: string | null;
  modification_description: string | null;
  supplier: string | null;
  invoice_number: string | null;
  invoice_cost: number | null;
  work_completed: string | null;
  mechanic_recommendations: string | null;
  follow_up_actions: string | null;
  invoice_notes: string | null;
  service_km?: number | null;
  odometer_km?: number | null;
  kilometres?: number | null;
  km_at_service?: number | null;
  next_service_due: string | null;
  next_service_km?: number | null;
  next_inspection_due: string | null;
  document_url: string | null;
  document_name: string | null;
  storage_path: string | null;
  created_at: string | null;
};

type AssetHistory = {
  id: string;
  asset_type: string | null;
  vehicle_id: string | null;
  plant_id: string | null;
  fleet_job_id: string | null;
  history_type: "Repair" | "Modification" | "Service" | string | null;
  history_date: string | null;
  title: string | null;
  description: string | null;
  vendor: string | null;
  cost: number | null;
  odometer_km: number | null;
  engine_hours: number | null;
  next_service_due_date: string | null;
  next_service_due_km: number | null;
  next_service_due_hours: number | null;
  document_url: string | null;
  created_at: string | null;
};

type ProjectHistory = {
  id: string;
  project: string | null;
  crew: string | null;
  project_onboard_date: string | null;
  project_offboard_date: string | null;
  notes: string | null;
  created_at: string | null;
};

type PrestartRecord = {
  id: string;
  vehicle_asset_id: string | null;
  asset_label: string | null;
  vehicle_rego: string | null;
  kilometres: number | null;
  project: string | null;
  crew: string | null;
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
  created_at: string | null;
};

function clean(value: string | null | undefined) {
  return value?.trim() || "N/A";
}

function yesNo(value: boolean | null | undefined) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "N/A";
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

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";

  return value.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
  });
}

function getTone(status: string | null | undefined): Tone {
  const value = clean(status);

  if (value === "Available" || value === "Active") return "emerald";
  if (value === "In Use" || value === "On Hire") return "blue";

  if (
    value === "Off Hire" ||
    value === "Inactive" ||
    value === "Retired" ||
    value === "Superseded" ||
    value === "Not Hired"
  ) {
    return "rose";
  }

  return "amber";
}

function fleetJobTone(job: FleetJob): Tone {
  const priority = clean(job.priority).toLowerCase();
  const status = clean(job.status).toLowerCase();

  if (priority === "critical" || priority === "urgent" || priority === "high") {
    return "rose";
  }

  if (status.includes("progress") || status.includes("open")) return "amber";

  return "blue";
}

function historyTone(type: string | null | undefined): Tone {
  const value = clean(type).toLowerCase();

  if (value.includes("service")) return "blue";
  if (value.includes("repair")) return "rose";
  if (value.includes("modification")) return "violet";

  return "slate";
}

function makeModel(vehicle: VehicleAsset | null) {
  if (!vehicle) return "Vehicle Detail";

  return [vehicle.make, vehicle.model]
    .map(clean)
    .filter((value) => value !== "N/A")
    .join(" ");
}

function serviceHistoryTitle(record: ServiceHistory) {
  return clean(
    record.modification_type ||
      record.service_type ||
      record.inspection_type ||
      record.record_type,
  );
}

function serviceHistoryDate(record: ServiceHistory) {
  return formatDate(
    record.modification_date ||
      record.service_date ||
      record.inspection_date ||
      record.created_at,
  );
}

function findAddedDate(
  serviceHistory: ServiceHistory[],
  assetHistory: AssetHistory[],
  keywords: string[],
  fallbackDate: string | null | undefined,
  fitted: boolean | null | undefined,
) {
  if (!fitted) return "Not fitted";

  const serviceMatch = serviceHistory.find((record) => {
    const text = [
      record.modification_type,
      record.modification_description,
      record.work_completed,
      record.invoice_notes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
  });

  const assetMatch = assetHistory.find((record) => {
    const text = [record.history_type, record.title, record.description]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
  });

  return formatDate(
    serviceMatch?.modification_date ||
      serviceMatch?.created_at ||
      assetMatch?.history_date ||
      assetMatch?.created_at ||
      fallbackDate,
  );
}

function ImportantDateCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{helper}</p>
    </div>
  );
}

function EmptyCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
      <div className="mb-3 inline-flex rounded-xl bg-white p-2 text-slate-500 shadow-sm">
        {icon}
      </div>
      <p className="font-bold text-slate-800">{title}</p>
      <p className="mt-1">{description}</p>
    </div>
  );
}

function SetupItem({
  label,
  value,
  addedDate,
}: {
  label: string;
  value: boolean | null | undefined;
  addedDate: string;
}) {
  const isFitted = value === true;

  return (
    <div
      className={`rounded-xl border p-3 ${
        isFitted
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-rose-200 bg-rose-50 text-rose-800"
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-wide opacity-70">
        {label}
      </p>
      <p className="mt-1 text-sm font-black">
        {isFitted ? "Fitted" : "Missing"}
      </p>
      <p className="mt-1 text-xs font-semibold opacity-75">
        {isFitted ? `Added: ${addedDate}` : "Requires update if fitted later"}
      </p>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="rounded-xl bg-slate-100 p-2 text-slate-600">{icon}</div>
      <div>
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        <p className="text-sm text-slate-600">{description}</p>
      </div>
    </div>
  );
}

export default function VehicleDetailPage() {
  const params = useParams<{ vehicleId: string }>();
  const vehicleId = params.vehicleId;

  const supabase = useMemo(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment variables.");
    }

    return createClient(supabaseUrl, supabaseAnonKey);
  }, []);

  const [vehicle, setVehicle] = useState<VehicleAsset | null>(null);
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [serviceHistory, setServiceHistory] = useState<ServiceHistory[]>([]);
  const [assetHistory, setAssetHistory] = useState<AssetHistory[]>([]);
  const [projectHistory, setProjectHistory] = useState<ProjectHistory[]>([]);
  const [prestartHistory, setPrestartHistory] = useState<PrestartRecord[]>([]);
  const [fleetJobs, setFleetJobs] = useState<FleetJob[]>([]);
  const [showVehicleSetup, setShowVehicleSetup] = useState(false);
  const [expandedLegacyHistoryId, setExpandedLegacyHistoryId] = useState<
    string | null
  >(null);
  const [expandedAssetHistoryId, setExpandedAssetHistoryId] = useState<
    string | null
  >(null);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadVehicle() {
    setLoading(true);
    setErrorMessage("");

    const vehicleResult = await supabase
      .from("vehicle_assets")
      .select("*")
      .eq("id", vehicleId)
      .single<VehicleAsset>();

    if (vehicleResult.error || !vehicleResult.data) {
      setVehicle(null);
      setDocuments([]);
      setServiceHistory([]);
      setAssetHistory([]);
      setProjectHistory([]);
      setPrestartHistory([]);
      setFleetJobs([]);
      setErrorMessage(
        vehicleResult.error?.message || "Vehicle could not be loaded.",
      );
      setLoading(false);
      return;
    }

    const vehicleData = vehicleResult.data;
    setVehicle(vehicleData);

    const prestartMatchFilters = [
      `vehicle_asset_id.eq.${vehicleId}`,
      vehicleData.vehicle_rego
        ? `vehicle_rego.eq.${vehicleData.vehicle_rego}`
        : null,
    ]
      .filter(Boolean)
      .join(",");

    const [
      documentsResult,
      serviceHistoryResult,
      assetHistoryResult,
      projectHistoryResult,
      prestartResult,
    ] = await Promise.all([
      supabase
        .from("vehicle_documents")
        .select("*")
        .eq("vehicle_asset_id", vehicleId)
        .order("created_at", { ascending: false })
        .returns<VehicleDocument[]>(),

      supabase
        .from("vehicle_service_history")
        .select("*")
        .eq("vehicle_asset_id", vehicleId)
        .order("created_at", { ascending: false })
        .returns<ServiceHistory[]>(),

      supabase
        .from("asset_history")
        .select("*")
        .eq("vehicle_id", vehicleId)
        .order("history_date", { ascending: false })
        .order("created_at", { ascending: false })
        .returns<AssetHistory[]>(),

      supabase
        .from("vehicle_project_history")
        .select("*")
        .eq("vehicle_asset_id", vehicleId)
        .order("project_onboard_date", { ascending: false })
        .returns<ProjectHistory[]>(),

      supabase
        .from("vehicle_prestarts")
        .select(
          "id, vehicle_asset_id, asset_label, vehicle_rego, kilometres, project, crew, inspected_by_name, overall_condition, comments, severity, result, fleet_job_id, prestart_date, created_at",
        )
        .or(prestartMatchFilters)
        .order("prestart_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(3)
        .returns<PrestartRecord[]>(),
    ]);

    const loadedPrestarts = prestartResult.error
      ? []
      : (prestartResult.data ?? []);

    const linkedFleetJobIds = loadedPrestarts
      .map((prestart) => prestart.fleet_job_id)
      .filter((id): id is string => Boolean(id));

    const linkedPrestartIds = loadedPrestarts
      .map((prestart) => prestart.id)
      .filter((id): id is string => Boolean(id));

    const [
      vehicleAssetFleetJobsResult,
      vehicleFleetJobsResult,
      linkedFleetJobsResult,
      sourceFleetJobsResult,
    ] = await Promise.all([
      supabase
        .from("fleet_jobs")
        .select(
          "id, job_number, title, description, priority, status, project, crew, reported_by, assigned_to, due_date, created_at",
        )
        .eq("vehicle_asset_id", vehicleId)
        .order("created_at", { ascending: false })
        .returns<FleetJob[]>(),

      supabase
        .from("fleet_jobs")
        .select(
          "id, job_number, title, description, priority, status, project, crew, reported_by, assigned_to, due_date, created_at",
        )
        .eq("vehicle_id", vehicleId)
        .order("created_at", { ascending: false })
        .returns<FleetJob[]>(),

      linkedFleetJobIds.length > 0
        ? supabase
            .from("fleet_jobs")
            .select(
              "id, job_number, title, description, priority, status, project, crew, reported_by, assigned_to, due_date, created_at",
            )
            .in("id", linkedFleetJobIds)
            .order("created_at", { ascending: false })
            .returns<FleetJob[]>()
        : Promise.resolve({ data: [], error: null }),

      linkedPrestartIds.length > 0
        ? supabase
            .from("fleet_jobs")
            .select(
              "id, job_number, title, description, priority, status, project, crew, reported_by, assigned_to, due_date, created_at",
            )
            .in("source_id", linkedPrestartIds)
            .order("created_at", { ascending: false })
            .returns<FleetJob[]>()
        : Promise.resolve({ data: [], error: null }),
    ]);

    const allFleetJobs = [
      ...(vehicleAssetFleetJobsResult.data ?? []),
      ...(vehicleFleetJobsResult.data ?? []),
      ...(linkedFleetJobsResult.data ?? []),
      ...(sourceFleetJobsResult.data ?? []),
    ];

    const uniqueFleetJobs = Array.from(
      new Map(allFleetJobs.map((job) => [job.id, job])).values(),
    );

    setDocuments(documentsResult.error ? [] : (documentsResult.data ?? []));
    setServiceHistory(
      serviceHistoryResult.error ? [] : (serviceHistoryResult.data ?? []),
    );
    setAssetHistory(
      assetHistoryResult.error ? [] : (assetHistoryResult.data ?? []),
    );
    setProjectHistory(
      projectHistoryResult.error ? [] : (projectHistoryResult.data ?? []),
    );
    setPrestartHistory(loadedPrestarts);
    setFleetJobs(
      uniqueFleetJobs.filter((job) => {
        const status = clean(job.status).toLowerCase();
        return !["closed", "complete", "completed", "resolved"].includes(
          status,
        );
      }),
    );

    setLoading(false);
  }

  useEffect(() => {
    void loadVehicle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId]);

  const isTrailer = clean(vehicle?.category).toLowerCase() === "trailer";
  const [today] = useState(() => new Date());

  const latestPrestart = prestartHistory[0] ?? null;
  const currentKm = latestPrestart?.kilometres ?? null;
  const serviceIntervalKm = vehicle?.service_interval_km ?? 10000;

  const serviceRecords = serviceHistory.filter((record) => {
    const type = clean(record.record_type).toLowerCase();
    return type.includes("service") || Boolean(record.service_date);
  });

  const inspectionRecords = serviceHistory.filter((record) => {
    const type = clean(record.record_type).toLowerCase();
    return type.includes("inspection") || Boolean(record.inspection_date);
  });

  const legacyModificationRecords = serviceHistory.filter((record) => {
    const type = clean(record.record_type).toLowerCase();
    return (
      type.includes("modification") ||
      type.includes("addition") ||
      Boolean(record.modification_date)
    );
  });

  const assetServiceRecords = assetHistory.filter(
    (record) => clean(record.history_type).toLowerCase() === "service",
  );

  const assetRepairRecords = assetHistory.filter(
    (record) => clean(record.history_type).toLowerCase() === "repair",
  );

  const assetModificationRecords = assetHistory.filter(
    (record) => clean(record.history_type).toLowerCase() === "modification",
  );

  const latestServiceRecord = serviceRecords[0] ?? assetServiceRecords[0] ?? null;

const latestServiceKm: number | null =
  latestServiceRecord && "odometer_km" in latestServiceRecord
    ? latestServiceRecord.odometer_km ?? null
    : null;

  const remainingKm =
    currentKm !== null &&
    vehicle?.next_service_km !== null &&
    vehicle?.next_service_km !== undefined
      ? vehicle.next_service_km - currentKm
      : null;

  const daysUntilService = vehicle?.next_service_due
    ? Math.ceil(
        (new Date(vehicle.next_service_due).getTime() - today.getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : null;

  const hasServiceTrigger = Boolean(
    vehicle?.next_service_due ||
      (vehicle?.next_service_km !== null &&
        vehicle?.next_service_km !== undefined),
  );

  const serviceOverdue =
    hasServiceTrigger &&
    ((remainingKm !== null && remainingKm <= 0) ||
      (daysUntilService !== null && daysUntilService <= 0));

  const serviceDueSoon =
    hasServiceTrigger &&
    !serviceOverdue &&
    ((remainingKm !== null && remainingKm <= 1000) ||
      (daysUntilService !== null && daysUntilService <= 30));

  const serviceStatusLabel = !hasServiceTrigger
    ? "Not Set"
    : serviceOverdue
      ? "Overdue"
      : serviceDueSoon
        ? "Due Soon"
        : "Compliant";

  const serviceStatusTone: Tone = !hasServiceTrigger
    ? "slate"
    : serviceOverdue
      ? "rose"
      : serviceDueSoon
        ? "amber"
        : "emerald";

  const kmRemainingDisplay =
    remainingKm !== null ? `${remainingKm.toLocaleString()} km` : "N/A";

  const daysRemainingDisplay =
    daysUntilService !== null
      ? `${daysUntilService.toLocaleString()} days`
      : "N/A";

  const registerDocuments = documents.filter((document) => {
    const type = clean(document.document_type).toLowerCase();
    return !type.includes("service");
  });

  const vehicleTitle =
    vehicle && clean(vehicle.vehicle_id) !== "N/A"
      ? `${clean(vehicle.vehicle_id)} - ${
          makeModel(vehicle) || clean(vehicle.vehicle_rego)
        }`
      : vehicle
        ? makeModel(vehicle) || clean(vehicle.vehicle_rego)
        : "Vehicle Detail";

  const basicDetailItems = vehicle
    ? [
        { label: "Vehicle ID", value: clean(vehicle.vehicle_id) },
        { label: "Rego", value: clean(vehicle.vehicle_rego) },
        { label: "Category", value: clean(vehicle.category) },
        { label: "Make / Model", value: makeModel(vehicle) || "N/A" },
        { label: "Year", value: clean(vehicle.year) },
        ...(isTrailer ? [] : [{ label: "Style", value: clean(vehicle.style) }]),
        { label: "VIN / Chassis", value: clean(vehicle.vin_number) },
        {
          label: "Status",
          value: (
            <StatusBadge
              label={clean(vehicle.status)}
              tone={getTone(vehicle.status)}
            />
          ),
        },
      ]
    : [];

  const allocationItems = vehicle
    ? [
        { label: "Project", value: clean(vehicle.project) },
        { label: "Crew", value: clean(vehicle.crew) },
        {
          label: "Spare Key",
          value: vehicle.spare_key_provided
            ? `Yes - ${clean(vehicle.spare_key_location)}`
            : yesNo(vehicle.spare_key_provided),
        },
        { label: "Owner", value: clean(vehicle.owner) },
        { label: "Hired?", value: yesNo(vehicle.hired) },
        {
          label: "Hire Details",
          value: vehicle.hired
            ? `${clean(vehicle.hired_from)} / ${clean(vehicle.hire_term)}`
            : "N/A",
        },
      ]
    : [];

  function LegacyHistoryCard({ record }: { record: ServiceHistory }) {
    const isExpanded = expandedLegacyHistoryId === record.id;

    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-950">
              {serviceHistoryTitle(record)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {serviceHistoryDate(record)}
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setExpandedLegacyHistoryId(isExpanded ? null : record.id)
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            {isExpanded ? "Hide Details" : "View Details"}
          </button>
        </div>

        <p className="mt-3 line-clamp-2 text-sm text-slate-700">
          {clean(record.modification_description || record.work_completed)}
        </p>

        {isExpanded ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <p>
                <span className="font-bold">Record Type:</span>{" "}
                {clean(record.record_type)}
              </p>
              <p>
                <span className="font-bold">Supplier:</span>{" "}
                {clean(record.supplier)}
              </p>
              <p>
                <span className="font-bold">Invoice:</span>{" "}
                {clean(record.invoice_number)}
              </p>
              <p>
                <span className="font-bold">Cost:</span>{" "}
                {formatMoney(record.invoice_cost)}
              </p>
              <p>
                <span className="font-bold">Next Service:</span>{" "}
                {formatDate(record.next_service_due)}
              </p>
              <p>
                <span className="font-bold">Next Inspection:</span>{" "}
                {formatDate(record.next_inspection_due)}
              </p>
            </div>

            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <p>
                <span className="font-bold">Work Completed:</span>{" "}
                {clean(record.work_completed)}
              </p>
              <p>
                <span className="font-bold">Recommendations:</span>{" "}
                {clean(record.mechanic_recommendations)}
              </p>
              <p>
                <span className="font-bold">Follow Up:</span>{" "}
                {clean(record.follow_up_actions)}
              </p>
              <p>
                <span className="font-bold">Notes:</span>{" "}
                {clean(record.invoice_notes)}
              </p>
            </div>

            {record.document_url ? (
              <a
                href={record.document_url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <ExternalLink size={13} />
                Open {record.document_name || "Attachment"}
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  function AssetHistoryCard({ record }: { record: AssetHistory }) {
    const isExpanded = expandedAssetHistoryId === record.id;

    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-slate-950">
                {clean(record.title)}
              </p>
              <StatusBadge
                label={clean(record.history_type)}
                tone={historyTone(record.history_type)}
              />
            </div>

            <p className="mt-1 text-xs text-slate-500">
              {formatDate(record.history_date || record.created_at)}
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setExpandedAssetHistoryId(isExpanded ? null : record.id)
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            {isExpanded ? "Hide Details" : "View Details"}
          </button>
        </div>

        <p className="mt-3 line-clamp-2 text-sm text-slate-700">
          {clean(record.description)}
        </p>

        {isExpanded ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <p>
                <span className="font-bold">Type:</span>{" "}
                {clean(record.history_type)}
              </p>
              <p>
                <span className="font-bold">Date:</span>{" "}
                {formatDate(record.history_date)}
              </p>
              <p>
                <span className="font-bold">Vendor:</span>{" "}
                {clean(record.vendor)}
              </p>
              <p>
                <span className="font-bold">Cost:</span>{" "}
                {formatMoney(record.cost)}
              </p>
              <p>
                <span className="font-bold">Odometer:</span>{" "}
                {record.odometer_km !== null && record.odometer_km !== undefined
                  ? `${record.odometer_km.toLocaleString()} km`
                  : "N/A"}
              </p>
              <p>
                <span className="font-bold">Hours:</span>{" "}
                {record.engine_hours !== null &&
                record.engine_hours !== undefined
                  ? `${record.engine_hours.toLocaleString()} hrs`
                  : "N/A"}
              </p>
              <p>
                <span className="font-bold">Next Service Date:</span>{" "}
                {formatDate(record.next_service_due_date)}
              </p>
              <p>
                <span className="font-bold">Next Service KM:</span>{" "}
                {record.next_service_due_km !== null &&
                record.next_service_due_km !== undefined
                  ? `${record.next_service_due_km.toLocaleString()} km`
                  : "N/A"}
              </p>
            </div>

            <p className="mt-4 text-sm text-slate-700">
              <span className="font-bold">Description:</span>{" "}
              {clean(record.description)}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {record.fleet_job_id ? (
                <Link
                  href={`/assets/fleet-jobs/${record.fleet_job_id}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <ExternalLink size={13} />
                  Open Fleet Job
                </Link>
              ) : null}

              {record.document_url ? (
                <a
                  href={record.document_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <ExternalLink size={13} />
                  Open Attachment
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (loading) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Vehicle Record"
          title="Loading vehicle..."
          description="Please wait while the vehicle record loads."
          actions={
            <ActionButton
              href="/assets/vehicles"
              variant="secondary"
              icon={<ArrowLeft size={16} />}
            >
              Back to Vehicles
            </ActionButton>
          }
        />
      </PageShell>
    );
  }

  if (!vehicle) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Vehicle Record"
          title="Vehicle not found"
          description="This vehicle could not be found in the register."
          actions={
            <ActionButton
              href="/assets/vehicles"
              variant="secondary"
              icon={<ArrowLeft size={16} />}
            >
              Back to Vehicles
            </ActionButton>
          }
        />

        {errorMessage ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {errorMessage}
          </div>
        ) : null}
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Vehicle Record"
        title={vehicleTitle}
        description="A clean asset profile showing key dates, current setup, documents, fleet jobs and asset history."
        actions={
          <>
            <ActionButton
              href="/assets/vehicles"
              variant="secondary"
              icon={<ArrowLeft size={16} />}
            >
              Back
            </ActionButton>

            <ActionButton
              href={`/assets/vehicles/${vehicleId}/edit`}
              variant="secondary"
              icon={<Pencil size={16} />}
            >
              Edit Details
            </ActionButton>

            <ActionButton
              href={`/assets/vehicles/${vehicleId}/update`}
              icon={<Wrench size={16} />}
            >
              Update Asset
            </ActionButton>
          </>
        }
      />

      {errorMessage ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {errorMessage}
        </div>
      ) : null}

      <section className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <SectionHeader
            icon={<Calendar size={18} />}
            title="Asset Snapshot"
            description="Key dates and the main information needed at a glance."
          />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ImportantDateCard
              label="Rego Expiry"
              value={formatDate(vehicle.rego_expiry)}
              helper="Registration renewal"
            />

            {!isTrailer && (
              <ImportantDateCard
                label="Insurance Expiry"
                value={formatDate(vehicle.insurance_expiry)}
                helper="Insurance renewal"
              />
            )}

            <ImportantDateCard
              label={isTrailer ? "Next Inspection" : "Last Service"}
              value={
                isTrailer
                  ? formatDate(vehicle.next_inspection_due)
                  : formatDate(vehicle.last_service)
              }
              helper={isTrailer ? "Inspection due" : "Most recent service"}
            />

            <ImportantDateCard
              label="Company Onboard"
              value={formatDate(vehicle.company_onboard_date)}
              helper="Insurance / ownership reference"
            />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-4 text-sm font-black uppercase tracking-wide text-slate-500">
                Basic Details
              </h3>
              <DetailGrid items={basicDetailItems} />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-4 text-sm font-black uppercase tracking-wide text-slate-500">
                Allocation / Keys / Ownership
              </h3>
              <DetailGrid items={allocationItems} />
            </div>
          </div>
        </section>

        {!isTrailer && (
          <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader
                icon={<Wrench size={18} />}
                title="Service Status"
                description="Whichever service trigger is reached first: time or kilometres."
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <ImportantDateCard
                  label="Current KM"
                  value={
                    currentKm !== null
                      ? `${currentKm.toLocaleString()} km`
                      : "N/A"
                  }
                  helper={
                    latestPrestart
                      ? `Latest prestart: ${formatDate(
                          latestPrestart.prestart_date ||
                            latestPrestart.created_at,
                        )}`
                      : "No prestart KM recorded"
                  }
                />

                <ImportantDateCard
                  label="Next Service KM"
                  value={
                    vehicle.next_service_km !== null &&
                    vehicle.next_service_km !== undefined
                      ? `${vehicle.next_service_km.toLocaleString()} km`
                      : "N/A"
                  }
                  helper={
                    latestServiceKm !== null
                      ? `Based on last service at ${latestServiceKm.toLocaleString()} km`
                      : `Based on ${serviceIntervalKm.toLocaleString()} km interval`
                  }
                />

                <ImportantDateCard
                  label="KM Remaining"
                  value={kmRemainingDisplay}
                  helper="Based on latest prestart"
                />

                <ImportantDateCard
                  label="Date Trigger"
                  value={formatDate(vehicle.next_service_due)}
                  helper={`Time remaining: ${daysRemainingDisplay}`}
                />

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Service Status
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        Triggered by KM or date, whichever comes first.
                      </p>
                    </div>

                    <StatusBadge
                      label={serviceStatusLabel}
                      tone={serviceStatusTone}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <button
                type="button"
                onClick={() => setShowVehicleSetup((current) => !current)}
                className="flex w-full items-start justify-between gap-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                    <ShieldCheck size={18} />
                  </div>

                  <div>
                    <h2 className="text-lg font-bold text-slate-950">
                      Vehicle Setup & Compliance Equipment
                    </h2>
                    <p className="text-sm text-slate-600">
                      Required onboard systems and safety equipment for LVs and
                      HVs.
                    </p>
                  </div>
                </div>

                <span className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
                  {showVehicleSetup ? "Hide" : "Show"}
                </span>
              </button>

              {showVehicleSetup ? (
                <div className="mt-5 space-y-5">
                  <div>
                    <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                      Electronic Systems
                    </p>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                      <SetupItem
                        label="eHub"
                        value={vehicle.ehub}
                        addedDate={findAddedDate(
                          serviceHistory,
                          assetHistory,
                          ["ehub"],
                          vehicle.company_onboard_date,
                          vehicle.ehub,
                        )}
                      />
                      <SetupItem
                        label="Dashcam"
                        value={vehicle.dashcam}
                        addedDate={findAddedDate(
                          serviceHistory,
                          assetHistory,
                          ["dashcam"],
                          vehicle.company_onboard_date,
                          vehicle.dashcam,
                        )}
                      />
                      <SetupItem
                        label="Alert Button"
                        value={vehicle.alert_button}
                        addedDate={findAddedDate(
                          serviceHistory,
                          assetHistory,
                          ["alert button"],
                          vehicle.company_onboard_date,
                          vehicle.alert_button,
                        )}
                      />
                      <SetupItem
                        label="UHF Radio"
                        value={vehicle.uhf_radio}
                        addedDate={findAddedDate(
                          serviceHistory,
                          assetHistory,
                          ["uhf"],
                          vehicle.company_onboard_date,
                          vehicle.uhf_radio,
                        )}
                      />
                      <SetupItem
                        label="Reverse Squawker"
                        value={vehicle.reverse_squawker}
                        addedDate={findAddedDate(
                          serviceHistory,
                          assetHistory,
                          ["reverse squawker"],
                          vehicle.company_onboard_date,
                          vehicle.reverse_squawker,
                        )}
                      />
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                      Safety Equipment
                    </p>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <SetupItem
                        label="Fire Extinguisher"
                        value={vehicle.fire_extinguisher}
                        addedDate={findAddedDate(
                          serviceHistory,
                          assetHistory,
                          ["fire extinguisher"],
                          vehicle.company_onboard_date,
                          vehicle.fire_extinguisher,
                        )}
                      />
                      <SetupItem
                        label="First Aid Kit"
                        value={vehicle.first_aid_kit}
                        addedDate={findAddedDate(
                          serviceHistory,
                          assetHistory,
                          ["first aid"],
                          vehicle.company_onboard_date,
                          vehicle.first_aid_kit,
                        )}
                      />
                      <SetupItem
                        label="Snake Bite Kit"
                        value={vehicle.snake_bite_kit}
                        addedDate={findAddedDate(
                          serviceHistory,
                          assetHistory,
                          ["snake bite"],
                          vehicle.company_onboard_date,
                          vehicle.snake_bite_kit,
                        )}
                      />
                      <SetupItem
                        label="Wheel Nut Indicators"
                        value={vehicle.wheel_nut_indicators}
                        addedDate={findAddedDate(
                          serviceHistory,
                          assetHistory,
                          ["wheel nut"],
                          vehicle.company_onboard_date,
                          vehicle.wheel_nut_indicators,
                        )}
                      />
                      <SetupItem
                        label="Wheel Chocks"
                        value={vehicle.wheel_chocks}
                        addedDate={findAddedDate(
                          serviceHistory,
                          assetHistory,
                          ["wheel chocks"],
                          vehicle.company_onboard_date,
                          vehicle.wheel_chocks,
                        )}
                      />
                      <SetupItem
                        label="Shovel"
                        value={vehicle.shovel}
                        addedDate={findAddedDate(
                          serviceHistory,
                          assetHistory,
                          ["shovel"],
                          vehicle.company_onboard_date,
                          vehicle.shovel,
                        )}
                      />
                      <SetupItem
                        label="Knapsack"
                        value={vehicle.knapsack}
                        addedDate={findAddedDate(
                          serviceHistory,
                          assetHistory,
                          ["knapsack"],
                          vehicle.company_onboard_date,
                          vehicle.knapsack,
                        )}
                      />
                      <SetupItem
                        label="Fuel Card"
                        value={vehicle.fuel_card}
                        addedDate={findAddedDate(
                          serviceHistory,
                          assetHistory,
                          ["fuel card"],
                          vehicle.company_onboard_date,
                          vehicle.fuel_card,
                        )}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-bold text-slate-800">
                    Equipment checklist collapsed
                  </p>
                  <p className="mt-1">
                    Click Show to review fitted and missing setup items without
                    pushing the history sections down the page.
                  </p>
                </div>
              )}
            </section>
          </section>
        )}

        <section className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              icon={<Wrench size={18} />}
              title={isTrailer ? "Inspection History" : "Service History"}
              description="Legacy service records and Fleet Job close-out service records."
            />

            {(isTrailer ? inspectionRecords : serviceRecords).length > 0 ||
            assetServiceRecords.length > 0 ? (
              <div className="space-y-3">
                {(isTrailer ? inspectionRecords : serviceRecords).map(
                  (record) => (
                    <LegacyHistoryCard key={record.id} record={record} />
                  ),
                )}

                {assetServiceRecords.map((record) => (
                  <AssetHistoryCard key={record.id} record={record} />
                ))}
              </div>
            ) : (
              <EmptyCard
                icon={<Wrench size={18} />}
                title={isTrailer ? "No inspections yet" : "No services yet"}
                description={
                  isTrailer
                    ? "Trailer inspection records will appear here."
                    : "Vehicle service records will appear here."
                }
              />
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              icon={<Truck size={18} />}
              title="Repair History"
              description="Repairs recorded from Fleet Job close-outs."
            />

            {assetRepairRecords.length > 0 ? (
              <div className="space-y-3">
                {assetRepairRecords.map((record) => (
                  <AssetHistoryCard key={record.id} record={record} />
                ))}
              </div>
            ) : (
              <EmptyCard
                icon={<Truck size={18} />}
                title="No repairs yet"
                description="Repairs closed out from Fleet Jobs will appear here."
              />
            )}
          </section>

          {!isTrailer && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader
                icon={<ShieldCheck size={18} />}
                title="Modification / Addition History"
                description="Equipment added, replacements, upgrades and Fleet Job modification close-outs."
              />

              {legacyModificationRecords.length > 0 ||
              assetModificationRecords.length > 0 ? (
                <div className="space-y-3">
                  {legacyModificationRecords.map((record) => (
                    <LegacyHistoryCard key={record.id} record={record} />
                  ))}

                  {assetModificationRecords.map((record) => (
                    <AssetHistoryCard key={record.id} record={record} />
                  ))}
                </div>
              ) : (
                <EmptyCard
                  icon={<ShieldCheck size={18} />}
                  title="No modifications yet"
                  description="Added equipment, spare keys and replacement items will appear here."
                />
              )}
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              icon={<Car size={18} />}
              title="Project History"
              description="Project onboarding, offboarding and movement history."
            />

            {projectHistory.length > 0 ? (
              <div className="space-y-3">
                {projectHistory.map((record) => {
                  const isExpanded = expandedProjectId === record.id;

                  return (
                    <div
                      key={record.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-950">
                            {clean(record.project)}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            Onboarded:{" "}
                            {formatDate(record.project_onboard_date)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedProjectId(isExpanded ? null : record.id)
                          }
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                        >
                          {isExpanded ? "Hide Details" : "View Details"}
                        </button>
                      </div>

                      {isExpanded ? (
                        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <p>
                              <span className="font-bold">Project:</span>{" "}
                              {clean(record.project)}
                            </p>
                            <p>
                              <span className="font-bold">Crew:</span>{" "}
                              {clean(record.crew)}
                            </p>
                            <p>
                              <span className="font-bold">Onboarded:</span>{" "}
                              {formatDate(record.project_onboard_date)}
                            </p>
                            <p>
                              <span className="font-bold">Offboarded:</span>{" "}
                              {record.project_offboard_date
                                ? formatDate(record.project_offboard_date)
                                : "Current / Not recorded"}
                            </p>
                          </div>

                          <p className="mt-4">
                            <span className="font-bold">Notes:</span>{" "}
                            {clean(record.notes)}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyCard
                icon={<Car size={18} />}
                title="No project history yet"
                description="Project transfer and onboarding history will appear here once recorded."
              />
            )}
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader
                icon={<Wrench size={18} />}
                title="Active Fleet Jobs"
                description="Open maintenance, defect or fleet jobs linked to this vehicle."
              />

              {fleetJobs.length > 0 ? (
                <div className="space-y-3">
                  {fleetJobs.map((job) => (
                    <Link
                      key={job.id}
                      href={`/assets/fleet-jobs/${job.id}`}
                      className="block rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-amber-300 hover:bg-amber-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-950">
                            {clean(job.job_number)} · {clean(job.title)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Created {formatDate(job.created_at)}
                          </p>
                        </div>

                        <StatusBadge
                          label={clean(job.status)}
                          tone={fleetJobTone(job)}
                        />
                      </div>

                      <p className="mt-3 text-sm text-slate-700">
                        {clean(job.description)}
                      </p>

                      <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                        <p>
                          <span className="font-bold">Priority:</span>{" "}
                          {clean(job.priority)}
                        </p>
                        <p>
                          <span className="font-bold">Due:</span>{" "}
                          {formatDate(job.due_date)}
                        </p>
                        <p>
                          <span className="font-bold">Assigned:</span>{" "}
                          {clean(job.assigned_to)}
                        </p>
                        <p>
                          <span className="font-bold">Reported By:</span>{" "}
                          {clean(job.reported_by)}
                        </p>
                      </div>

                      <div className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-amber-700">
                        Open Fleet Job
                        <ExternalLink size={13} />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyCard
                  icon={<Wrench size={18} />}
                  title="No active fleet jobs"
                  description="Open fleet jobs, defects or maintenance requests linked to this vehicle will appear here."
                />
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader
                icon={<ClipboardCheck size={18} />}
                title="Recent Prestarts"
                description="Showing the 3 most recent prestarts for this vehicle."
              />

              {prestartHistory.length > 0 ? (
                <div className="space-y-3">
                  {prestartHistory.map((record) => (
                    <Link
                      key={record.id}
                      href={`/assets/prestarts/${record.id}`}
                      className="block rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-sky-300 hover:bg-sky-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-950">
                            {formatDate(
                              record.prestart_date || record.created_at,
                            )}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Inspected by {clean(record.inspected_by_name)}
                          </p>
                        </div>

                        <StatusBadge
                          label={clean(record.result)}
                          tone={
                            clean(record.severity).toLowerCase() ===
                              "critical" ||
                            clean(record.severity).toLowerCase() === "major"
                              ? "rose"
                              : clean(record.severity).toLowerCase() === "minor"
                                ? "amber"
                                : "emerald"
                          }
                        />
                      </div>

                      <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                        <p>
                          <span className="font-bold">KM:</span>{" "}
                          {record.kilometres !== null &&
                          record.kilometres !== undefined
                            ? `${record.kilometres.toLocaleString()} km`
                            : "N/A"}
                        </p>
                        <p>
                          <span className="font-bold">Severity:</span>{" "}
                          {clean(record.severity)}
                        </p>
                        <p>
                          <span className="font-bold">Project:</span>{" "}
                          {clean(record.project)}
                        </p>
                        <p>
                          <span className="font-bold">Crew:</span>{" "}
                          {clean(record.crew)}
                        </p>
                      </div>

                      {record.comments ? (
                        <p className="mt-3 text-sm text-slate-600">
                          {record.comments}
                        </p>
                      ) : null}

                      <div className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-sky-700">
                        Open Prestart
                        <ExternalLink size={13} />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyCard
                  icon={<ClipboardCheck size={18} />}
                  title="No prestarts yet"
                  description="The 3 most recent prestarts will appear here once vehicle prestarts are added."
                />
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader
                icon={<FileText size={18} />}
                title="Documents"
                description="Risk assessment, rego, insurance, project documents, pictures and other non-service files."
              />

              {registerDocuments.length > 0 ? (
                <div className="space-y-3">
                  {registerDocuments.map((document) => (
                    <a
                      key={document.id}
                      href={document.file_url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-xl border border-slate-200 bg-slate-50 p-3 hover:bg-white"
                    >
                      <p className="text-sm font-bold text-slate-900">
                        {clean(document.document_type)}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {clean(document.file_name)}
                      </p>
                      <p className="mt-2 text-xs text-slate-400">
                        Uploaded {formatDate(document.created_at)}
                      </p>
                    </a>
                  ))}
                </div>
              ) : (
                <EmptyCard
                  icon={<FileText size={18} />}
                  title="No documents uploaded"
                  description="Non-service documents will appear here once attached."
                />
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader
                icon={<KeyRound size={18} />}
                title="Notes"
                description="General asset notes."
              />

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                {clean(vehicle.notes)}
              </div>
            </section>
          </div>
        </section>
      </section>
    </PageShell>
  );
}