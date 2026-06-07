/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import {
  ArrowLeft,
  Calendar,
  Car,
  ClipboardCheck,
  FileText,
  FileUp,
  KeyRound,
  Pencil,
  Save,
  ShieldCheck,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ActionButton,
  DetailGrid,
  PageHeader,
  PageShell,
  StatusBadge,
} from "../../components";

type Tone = "emerald" | "amber" | "rose" | "blue" | "slate";

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
  next_inspection_due: string | null;
  hired: boolean | null;
  hired_from: string | null;
  hire_term: string | null;
  off_hire_date: string | null;
  superseded_by: string | null;
  inactive_reason: string | null;
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
  next_service_due: string | null;
  next_inspection_due: string | null;
  document_url: string | null;
  document_name: string | null;
  storage_path: string | null;
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

type EditHistoryForm = {
  record_type: string;
  service_date: string;
  inspection_date: string;
  modification_date: string;
  service_type: string;
  inspection_type: string;
  modification_type: string;
  modification_description: string;
  supplier: string;
  invoice_number: string;
  invoice_cost: string;
  work_completed: string;
  mechanic_recommendations: string;
  follow_up_actions: string;
  invoice_notes: string;
  next_service_due: string;
  next_inspection_due: string;
};

function clean(value: string | null | undefined) {
  return value?.trim() || "N/A";
}

function optional(value: string | null | undefined) {
  return value?.trim() || "";
}

function yesNo(value: boolean | null | undefined) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "N/A";
}

function dateInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
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

function toNumber(value: string) {
  const cleaned = value.trim();
  if (!cleaned) return null;

  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
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

function makeModel(vehicle: VehicleAsset | null) {
  if (!vehicle) return "Vehicle Detail";

  return [vehicle.make, vehicle.model]
    .map(clean)
    .filter((value) => value !== "N/A")
    .join(" ");
}

function findAddedDate(
  serviceHistory: ServiceHistory[],
  keywords: string[],
  fallbackDate: string | null | undefined,
  fitted: boolean | null | undefined,
) {
  if (!fitted) return "Not fitted";

  const match = serviceHistory.find((record) => {
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

  return formatDate(match?.modification_date || match?.created_at || fallbackDate);
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

function TextField({
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
    <label className="space-y-1">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
      />
    </label>
  );
}

export default function VehicleDetailPage() {
  const router = useRouter();
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
  const [projectHistory, setProjectHistory] = useState<ProjectHistory[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<ServiceHistory | null>(null);
  const [editForm, setEditForm] = useState<EditHistoryForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingHistory, setSavingHistory] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const loadVehicle = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const [vehicleResult, documentsResult, serviceHistoryResult, projectHistoryResult] =
      await Promise.all([
        supabase
          .from("vehicle_assets")
          .select("*")
          .eq("id", vehicleId)
          .single<VehicleAsset>(),
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
          .from("vehicle_project_history")
          .select("*")
          .eq("vehicle_asset_id", vehicleId)
          .order("project_onboard_date", { ascending: false })
          .returns<ProjectHistory[]>(),
      ]);

    if (vehicleResult.error || !vehicleResult.data) {
      setVehicle(null);
      setErrorMessage(vehicleResult.error?.message || "Vehicle could not be loaded.");
    } else {
      setVehicle(vehicleResult.data);
    }

    setDocuments(documentsResult.error ? [] : documentsResult.data ?? []);
    setServiceHistory(
      serviceHistoryResult.error ? [] : serviceHistoryResult.data ?? [],
    );
    setProjectHistory(
      projectHistoryResult.error ? [] : projectHistoryResult.data ?? [],
    );

    setLoading(false);
  }, [supabase, vehicleId]);

  useEffect(() => {
    void loadVehicle();
  }, [loadVehicle]);

  const isTrailer = clean(vehicle?.category).toLowerCase() === "trailer";

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
        { label: "Make", value: clean(vehicle.make) },
        { label: "Model", value: clean(vehicle.model) },
        { label: "Year", value: clean(vehicle.year) },
        ...(isTrailer ? [] : [{ label: "Style", value: clean(vehicle.style) }]),
        { label: "VIN / Chassis Number", value: clean(vehicle.vin_number) },
        {
          label: "Company Onboard Date",
          value: formatDate(vehicle.company_onboard_date),
        },
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

  function openEditRecord(record: ServiceHistory) {
    setReplacementFile(null);
    setEditingRecord(record);
    setEditForm({
      record_type: optional(record.record_type),
      service_date: dateInput(record.service_date),
      inspection_date: dateInput(record.inspection_date),
      modification_date: dateInput(record.modification_date),
      service_type: optional(record.service_type),
      inspection_type: optional(record.inspection_type),
      modification_type: optional(record.modification_type),
      modification_description: optional(record.modification_description),
      supplier: optional(record.supplier),
      invoice_number: optional(record.invoice_number),
      invoice_cost:
        record.invoice_cost === null || record.invoice_cost === undefined
          ? ""
          : String(record.invoice_cost),
      work_completed: optional(record.work_completed),
      mechanic_recommendations: optional(record.mechanic_recommendations),
      follow_up_actions: optional(record.follow_up_actions),
      invoice_notes: optional(record.invoice_notes),
      next_service_due: dateInput(record.next_service_due),
      next_inspection_due: dateInput(record.next_inspection_due),
    });
  }
async function uploadReplacementAttachment(historyId: string) {
  if (!replacementFile) {
    return null;
  }

  const safeFileName = replacementFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${vehicleId}/${historyId}/${Date.now()}-${safeFileName}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("vehicle_service_documents")
    .upload(filePath, replacementFile, {
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const {
    data: { publicUrl },
  } = supabase.storage
    .from("vehicle_service_documents")
    .getPublicUrl(uploadData.path);

  return {
    document_name: replacementFile.name,
    document_url: publicUrl,
    storage_path: uploadData.path,
  };
}
 async function saveHistoryRecord() {
  if (!editingRecord || !editForm) return;

  setSavingHistory(true);
  setErrorMessage("");

  let replacementAttachment: {
    document_name: string;
    document_url: string;
    storage_path: string;
  } | null = null;

  try {
    replacementAttachment = await uploadReplacementAttachment(editingRecord.id);

    if (replacementAttachment && editingRecord.storage_path) {
      await supabase.storage
        .from("vehicle_service_documents")
        .remove([editingRecord.storage_path]);
    }
  } catch (uploadError) {
    setErrorMessage(
      uploadError instanceof Error
        ? uploadError.message
        : "Failed to upload replacement attachment.",
    );
    setSavingHistory(false);
    return;
  }

  const { error } = await supabase
    .from("vehicle_service_history")
    .update({
      record_type: editForm.record_type.trim() || null,
      service_date: editForm.service_date || null,
      inspection_date: editForm.inspection_date || null,
      modification_date: editForm.modification_date || null,
      service_type: editForm.service_type.trim() || null,
      inspection_type: editForm.inspection_type.trim() || null,
      modification_type: editForm.modification_type.trim() || null,
      modification_description:
        editForm.modification_description.trim() || null,
      supplier: editForm.supplier.trim() || null,
      invoice_number: editForm.invoice_number.trim() || null,
      invoice_cost: toNumber(editForm.invoice_cost),
      work_completed: editForm.work_completed.trim() || null,
      mechanic_recommendations:
        editForm.mechanic_recommendations.trim() || null,
      follow_up_actions: editForm.follow_up_actions.trim() || null,
      invoice_notes: editForm.invoice_notes.trim() || null,
      next_service_due: editForm.next_service_due || null,
      next_inspection_due: editForm.next_inspection_due || null,

      ...(replacementAttachment
        ? {
            document_name: replacementAttachment.document_name,
            document_url: replacementAttachment.document_url,
            storage_path: replacementAttachment.storage_path,
          }
        : {}),
    })
    .eq("id", editingRecord.id);

  if (error) {
    setErrorMessage(error.message);
    setSavingHistory(false);
    return;
  }

  setEditingRecord(null);
  setEditForm(null);
  setReplacementFile(null);
  setSavingHistory(false);

  await loadVehicle();
  router.refresh();
}
async function deleteHistoryRecord(record: ServiceHistory) {
  const confirmed = window.confirm(
    "Delete this history record? This should only be used for incorrect duplicate entries.",
  );

  if (!confirmed) return;

  setErrorMessage("");

  if (record.storage_path) {
    await supabase.storage
      .from("vehicle_service_documents")
      .remove([record.storage_path]);
  }

  const { error } = await supabase
    .from("vehicle_service_history")
    .delete()
    .eq("id", record.id);

  if (error) {
    setErrorMessage(error.message);
    return;
  }

  await loadVehicle();
  router.refresh();
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
        description="Full asset profile with registration, allocation, setup, documents, service history, modification history and project history."
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
              icon={<Pencil size={16} />}
            >
              Edit
            </ActionButton>
          </>
        }
      />

      {errorMessage ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {errorMessage}
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                <Calendar size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">Key Dates</h2>
                <p className="text-sm text-slate-600">
                  Important expiry, service and onboarding information.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <ImportantDateCard
                label="Rego Expiry"
                value={formatDate(vehicle.rego_expiry)}
                helper="Registration renewal date"
              />

              {!isTrailer && (
                <ImportantDateCard
                  label="Insurance Expiry"
                  value={formatDate(vehicle.insurance_expiry)}
                  helper="Insurance renewal date"
                />
              )}

              <ImportantDateCard
                label={isTrailer ? "Next Inspection" : "Last Service"}
                value={
                  isTrailer
                    ? formatDate(vehicle.next_inspection_due)
                    : formatDate(vehicle.last_service)
                }
                helper={
                  isTrailer
                    ? "Trailer inspection due"
                    : "Most recent recorded service"
                }
              />

              <ImportantDateCard
                label="Company Onboard"
                value={formatDate(vehicle.company_onboard_date)}
                helper="Business ownership / insurance reference date"
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                <Car size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Basic Asset Details
                </h2>
                <p className="text-sm text-slate-600">
                  Main register and fleet identification details.
                </p>
              </div>
            </div>

            <DetailGrid items={basicDetailItems} />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">
              Current Allocation
            </h2>

            <div className="mt-5">
              <DetailGrid
                items={[
                  { label: "Project Allocation", value: clean(vehicle.project) },
                  { label: "Crew Allocation", value: clean(vehicle.crew) },
                ]}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Spare Key</h2>

            <div className="mt-5">
              <DetailGrid
                items={[
                  {
                    label: "Spare Key Provided",
                    value: yesNo(vehicle.spare_key_provided),
                  },
                  {
                    label: "Spare Key Location",
                    value: vehicle.spare_key_provided
                      ? clean(vehicle.spare_key_location)
                      : "N/A",
                  },
                ]}
              />
            </div>
          </section>

          {!isTrailer && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-950">
                    Vehicle Setup & Compliance Equipment
                  </h2>
                  <p className="text-sm text-slate-600">
                    Required onboard systems and safety equipment for LVs and HVs.
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                    Electronic Systems
                  </p>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <SetupItem label="eHub" value={vehicle.ehub} addedDate={findAddedDate(serviceHistory, ["ehub"], vehicle.company_onboard_date, vehicle.ehub)} />
                    <SetupItem label="Dashcam" value={vehicle.dashcam} addedDate={findAddedDate(serviceHistory, ["dashcam"], vehicle.company_onboard_date, vehicle.dashcam)} />
                    <SetupItem label="Alert Button" value={vehicle.alert_button} addedDate={findAddedDate(serviceHistory, ["alert button"], vehicle.company_onboard_date, vehicle.alert_button)} />
                    <SetupItem label="UHF Radio" value={vehicle.uhf_radio} addedDate={findAddedDate(serviceHistory, ["uhf"], vehicle.company_onboard_date, vehicle.uhf_radio)} />
                    <SetupItem label="Reverse Squawker" value={vehicle.reverse_squawker} addedDate={findAddedDate(serviceHistory, ["reverse squawker"], vehicle.company_onboard_date, vehicle.reverse_squawker)} />
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                    Safety Equipment
                  </p>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <SetupItem label="Fire Extinguisher" value={vehicle.fire_extinguisher} addedDate={findAddedDate(serviceHistory, ["fire extinguisher"], vehicle.company_onboard_date, vehicle.fire_extinguisher)} />
                    <SetupItem label="First Aid Kit" value={vehicle.first_aid_kit} addedDate={findAddedDate(serviceHistory, ["first aid"], vehicle.company_onboard_date, vehicle.first_aid_kit)} />
                    <SetupItem label="Snake Bite Kit" value={vehicle.snake_bite_kit} addedDate={findAddedDate(serviceHistory, ["snake bite"], vehicle.company_onboard_date, vehicle.snake_bite_kit)} />
                    <SetupItem label="Wheel Nut Indicators" value={vehicle.wheel_nut_indicators} addedDate={findAddedDate(serviceHistory, ["wheel nut"], vehicle.company_onboard_date, vehicle.wheel_nut_indicators)} />
                    <SetupItem label="Wheel Chocks" value={vehicle.wheel_chocks} addedDate={findAddedDate(serviceHistory, ["wheel chocks"], vehicle.company_onboard_date, vehicle.wheel_chocks)} />
                    <SetupItem label="Shovel" value={vehicle.shovel} addedDate={findAddedDate(serviceHistory, ["shovel"], vehicle.company_onboard_date, vehicle.shovel)} />
                    <SetupItem label="Knapsack" value={vehicle.knapsack} addedDate={findAddedDate(serviceHistory, ["knapsack"], vehicle.company_onboard_date, vehicle.knapsack)} />
                    <SetupItem label="Fuel Card" value={vehicle.fuel_card} addedDate={findAddedDate(serviceHistory, ["fuel card"], vehicle.company_onboard_date, vehicle.fuel_card)} />
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>

        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                <FileText size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">Documents</h2>
                <p className="text-sm text-slate-600">
                  Risk Assessment, Rego, Insurance, Service, Project Documents,
                  Pictures and Other.
                </p>
              </div>
            </div>

            {documents.length > 0 ? (
              <div className="space-y-3">
                {documents.map((document) => (
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
                description="Documents will appear here once attached."
              />
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                <Wrench size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  {isTrailer
                    ? "Inspection / Update History"
                    : "Service / Update History"}
                </h2>
                <p className="text-sm text-slate-600">
                  Click View Details to expand the full record.
                </p>
              </div>
            </div>

            {serviceHistory.length > 0 ? (
              <div className="space-y-3">
                {serviceHistory.map((record) => {
                  const isExpanded = expandedHistoryId === record.id;

                  return (
                    <div
                      key={record.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-950">
                            {clean(
                              record.modification_type ||
                                record.service_type ||
                                record.inspection_type ||
                                record.record_type,
                            )}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatDate(
                              record.modification_date ||
                                record.service_date ||
                                record.inspection_date ||
                                record.created_at,
                            )}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedHistoryId(isExpanded ? null : record.id)
                          }
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                        >
                          {isExpanded ? "Hide Details" : "View Details"}
                        </button>
                      </div>

                      <p className="mt-3 text-sm text-slate-700">
                        {clean(record.modification_description || record.work_completed)}
                      </p>

                      {isExpanded ? (
                        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                          <div className="grid gap-3 text-sm sm:grid-cols-2">
                            <p><span className="font-bold">Record Type:</span> {clean(record.record_type)}</p>
                            <p><span className="font-bold">Supplier:</span> {clean(record.supplier)}</p>
                            <p><span className="font-bold">Invoice:</span> {clean(record.invoice_number)}</p>
                            <p><span className="font-bold">Cost:</span> {formatMoney(record.invoice_cost)}</p>
                            <p><span className="font-bold">Next Service:</span> {formatDate(record.next_service_due)}</p>
                            <p><span className="font-bold">Next Inspection:</span> {formatDate(record.next_inspection_due)}</p>
                          </div>

                          <div className="mt-4 space-y-3 text-sm text-slate-700">
                            <p><span className="font-bold">Work Completed:</span> {clean(record.work_completed)}</p>
                            <p><span className="font-bold">Recommendations:</span> {clean(record.mechanic_recommendations)}</p>
                            <p><span className="font-bold">Follow Up:</span> {clean(record.follow_up_actions)}</p>
                            <p><span className="font-bold">Notes:</span> {clean(record.invoice_notes)}</p>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {record.document_url ? (
  <a
    href={record.document_url}
    target="_blank"
    rel="noreferrer"
    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
  >
    Open {record.document_name || "Attachment"}
  </a>
) : (
  <span className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-400">
    No attachment
  </span>
)}

                            <button
                              type="button"
                              onClick={() => openEditRecord(record)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                            >
                              <Pencil size={13} />
                              Edit Record
                            </button>

                            <button
                              type="button"
                              onClick={() => void deleteHistoryRecord(record)}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50"
                            >
                              <Trash2 size={13} />
                              Delete Record
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyCard
                icon={<Wrench size={18} />}
                title="No update history yet"
                description="Services, inspections, modifications and additions will appear here once submitted."
              />
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                <Car size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Project History
                </h2>
                <p className="text-sm text-slate-600">
                  Click View Details to expand movement history.
                </p>
              </div>
            </div>

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
                            Onboarded: {formatDate(record.project_onboard_date)}
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
                            <p><span className="font-bold">Project:</span> {clean(record.project)}</p>
                            <p><span className="font-bold">Crew:</span> {clean(record.crew)}</p>
                            <p><span className="font-bold">Onboarded:</span> {formatDate(record.project_onboard_date)}</p>
                            <p><span className="font-bold">Offboarded:</span> {record.project_offboard_date ? formatDate(record.project_offboard_date) : "Current / Not recorded"}</p>
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

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                <ClipboardCheck size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Prestart History
                </h2>
                <p className="text-sm text-slate-600">
                  Future vehicle prestart records.
                </p>
              </div>
            </div>

            <EmptyCard
              icon={<ClipboardCheck size={18} />}
              title="Prestart history coming later"
              description="Daily checks, reported defects, driver comments and sign-offs will appear here once prestarts are added."
            />
          </section>
        </div>
      </section>

      {editingRecord && editForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                  Edit History Record
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  {clean(
                    editingRecord.modification_type ||
                      editingRecord.service_type ||
                      editingRecord.inspection_type ||
                      editingRecord.record_type,
                  )}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingRecord(null);
                  setEditForm(null);
                }}
                className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <TextField label="Record Type" value={editForm.record_type} onChange={(value) => setEditForm((current) => current ? { ...current, record_type: value } : current)} />
              <TextField label="Supplier / Mechanic" value={editForm.supplier} onChange={(value) => setEditForm((current) => current ? { ...current, supplier: value } : current)} />
              <TextField label="Service Date" type="date" value={editForm.service_date} onChange={(value) => setEditForm((current) => current ? { ...current, service_date: value } : current)} />
              <TextField label="Inspection Date" type="date" value={editForm.inspection_date} onChange={(value) => setEditForm((current) => current ? { ...current, inspection_date: value } : current)} />
              <TextField label="Modification Date" type="date" value={editForm.modification_date} onChange={(value) => setEditForm((current) => current ? { ...current, modification_date: value } : current)} />
              <TextField label="Service Type" value={editForm.service_type} onChange={(value) => setEditForm((current) => current ? { ...current, service_type: value } : current)} />
              <TextField label="Inspection Type" value={editForm.inspection_type} onChange={(value) => setEditForm((current) => current ? { ...current, inspection_type: value } : current)} />
              <TextField label="Modification Type" value={editForm.modification_type} onChange={(value) => setEditForm((current) => current ? { ...current, modification_type: value } : current)} />
              <TextField label="Invoice Number" value={editForm.invoice_number} onChange={(value) => setEditForm((current) => current ? { ...current, invoice_number: value } : current)} />
              <TextField label="Invoice Cost" type="number" value={editForm.invoice_cost} onChange={(value) => setEditForm((current) => current ? { ...current, invoice_cost: value } : current)} />
              <TextField label="Next Service Due" type="date" value={editForm.next_service_due} onChange={(value) => setEditForm((current) => current ? { ...current, next_service_due: value } : current)} />
              <TextField label="Next Inspection Due" type="date" value={editForm.next_inspection_due} onChange={(value) => setEditForm((current) => current ? { ...current, next_inspection_due: value } : current)} />
            </div>

            <div className="mt-4 space-y-4">
              <TextAreaField label="Modification Description" value={editForm.modification_description} onChange={(value) => setEditForm((current) => current ? { ...current, modification_description: value } : current)} />
              <TextAreaField label="Work Completed" value={editForm.work_completed} onChange={(value) => setEditForm((current) => current ? { ...current, work_completed: value } : current)} />

              <div className="grid gap-4 md:grid-cols-2">
                <TextAreaField label="Mechanic Recommendations" value={editForm.mechanic_recommendations} onChange={(value) => setEditForm((current) => current ? { ...current, mechanic_recommendations: value } : current)} />
                <TextAreaField label="Follow Up Actions" value={editForm.follow_up_actions} onChange={(value) => setEditForm((current) => current ? { ...current, follow_up_actions: value } : current)} />
              </div>

              <TextAreaField label="Invoice / Update Notes" value={editForm.invoice_notes} onChange={(value) => setEditForm((current) => current ? { ...current, invoice_notes: value } : current)} />
            </div>

            <div className="mt-5 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setEditingRecord(null);
                  setEditForm(null);
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={savingHistory}
                onClick={() => void saveHistoryRecord()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <Save size={16} />
                {savingHistory ? "Saving..." : "Save Record"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}