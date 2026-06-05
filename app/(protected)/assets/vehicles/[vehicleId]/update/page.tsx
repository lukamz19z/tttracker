"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileUp, Save, Wrench } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { PageHeader, PageShell, StatusBadge } from "../../../components";

type Tone = "emerald" | "amber" | "rose" | "blue" | "slate";
type UpdateType = "Service" | "Modification" | "Project Transfer";

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
  last_service: string | null;
  rego_expiry: string | null;
  insurance_expiry: string | null;
  next_service_due: string | null;
  next_service_km: number | null;
  next_inspection_due: string | null;
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
};

type CrewOption = {
  id: string;
  crew_number: string | null;
  crew_name: string | null;
  leading_hand: string | null;
  active: boolean | null;
};

type ProjectOption = {
  id: string;
  name: string;
};

type UpdateForm = {
  update_type: UpdateType;

  rego_expiry: string;
  insurance_expiry: string;
  last_service: string;
  next_service_due: string;
  next_service_km: string;
  next_inspection_due: string;

  service_date: string;
  inspection_date: string;
  odometer_km: string;
  service_type: string;
  inspection_type: string;

  modification_date: string;
  modification_type: string;
  modification_description: string;

  supplier: string;
  invoice_number: string;
  invoice_cost: string;
  work_completed: string;
  mechanic_recommendations: string;
  follow_up_actions: string;
  invoice_notes: string;
  status_after_update: string;

  trailer_registration_checked: boolean;
  trailer_tyres_checked: boolean;
  trailer_brakes_checked: boolean;
  trailer_lights_checked: boolean;
  trailer_coupling_checked: boolean;
  trailer_chains_checked: boolean;
  trailer_defects_found: boolean;
  trailer_defect_notes: string;

  ehub: boolean;
  dashcam: boolean;
  alert_button: boolean;
  fuel_card: boolean;
  reverse_squawker: boolean;
  uhf_radio: boolean;
  fire_extinguisher: boolean;
  first_aid_kit: boolean;
  snake_bite_kit: boolean;
  wheel_nut_indicators: boolean;
  wheel_chocks: boolean;
  shovel: boolean;
  knapsack: boolean;

  spare_key_provided: boolean;
  spare_key_location: string;

  new_project: string;
  new_crew: string;
  project_onboard_date: string;
  project_offboard_date: string;
  project_transfer_notes: string;
};

const emptyForm: UpdateForm = {
  update_type: "Service",

  rego_expiry: "",
  insurance_expiry: "",
  last_service: "",
  next_service_due: "",
  next_service_km: "",
  next_inspection_due: "",

  service_date: "",
  inspection_date: "",
  odometer_km: "",
  service_type: "",
  inspection_type: "",

  modification_date: "",
  modification_type: "",
  modification_description: "",

  supplier: "",
  invoice_number: "",
  invoice_cost: "",
  work_completed: "",
  mechanic_recommendations: "",
  follow_up_actions: "",
  invoice_notes: "",
  status_after_update: "Available",

  trailer_registration_checked: false,
  trailer_tyres_checked: false,
  trailer_brakes_checked: false,
  trailer_lights_checked: false,
  trailer_coupling_checked: false,
  trailer_chains_checked: false,
  trailer_defects_found: false,
  trailer_defect_notes: "",

  ehub: false,
  dashcam: false,
  alert_button: false,
  fuel_card: false,
  reverse_squawker: false,
  uhf_radio: false,
  fire_extinguisher: false,
  first_aid_kit: false,
  snake_bite_kit: false,
  wheel_nut_indicators: false,
  wheel_chocks: false,
  shovel: false,
  knapsack: false,

  spare_key_provided: false,
  spare_key_location: "",

  new_project: "",
  new_crew: "",
  project_onboard_date: "",
  project_offboard_date: "",
  project_transfer_notes: "",
};

const vehicleServiceTypes = [
  "Scheduled Service",
  "Repair",
  "Inspection",
  "Tyres",
  "Breakdown",
  "Defect Rectification",
  "Other",
];

const trailerInspectionTypes = [
  "Trailer Inspection",
  "Registration Check",
  "Tyres / Wheels",
  "Brakes",
  "Lights / Electrical",
  "Coupling / Chains",
  "Defect Rectification",
  "Other",
];

const modificationTypes = [
  "Added Fire Extinguisher",
  "Added First Aid Kit",
  "Added Snake Bite Kit",
  "Added Wheel Chocks",
  "Added Wheel Nut Indicators",
  "Added UHF Radio",
  "Added Reverse Squawker",
  "Added Shovel",
  "Added Knapsack",
  "Added Spare Key",
  "Removed Spare Key",
  "Replaced Battery",
  "Installed Dashcam",
  "Installed eHub",
  "Other Modification",
];

const statusOptions = [
  "Available",
  "In Use",
  "Under Maintenance",
  "Off Site",
  "Off Hire",
  "Inactive",
];

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function display(value: string | null | undefined) {
  return clean(value) || "N/A";
}

function dateInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

function makeModel(vehicle: VehicleAsset | null) {
  if (!vehicle) return "N/A";
  return [vehicle.make, vehicle.model].map(clean).filter(Boolean).join(" ") || "N/A";
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
        {required ? <span className="text-rose-600"> *</span> : null}
      </span>
      <input
        type={type}
        value={value}
        required={required}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 disabled:bg-slate-100"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  required = false,
  placeholder = "Select option",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
        {required ? <span className="text-rose-600"> *</span> : null}
      </span>
      <select
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={`${label}-${option}`} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
        {required ? <span className="text-rose-600"> *</span> : null}
      </span>
      <textarea
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={4}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
      />
    </label>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-bold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      {children}
    </section>
  );
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <div className="mt-1 text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

export default function UpdateVehiclePage() {
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
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [crews, setCrews] = useState<CrewOption[]>([]);
  const [form, setForm] = useState<UpdateForm>(emptyForm);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isTrailer = clean(vehicle?.category).toLowerCase() === "trailer";

  useEffect(() => {
    let cancelled = false;

    async function loadPageData() {
      setLoading(true);

      const [vehicleResult, projectResult, crewResult] = await Promise.all([
        supabase.from("vehicle_assets").select("*").eq("id", vehicleId).single<VehicleAsset>(),
        supabase.from("projects").select("id, name").order("name", { ascending: true }),
        supabase
          .from("crews")
          .select("id, crew_number, crew_name, leading_hand, active")
          .order("crew_number", { ascending: true }),
      ]);

      if (cancelled) return;

      if (vehicleResult.error || !vehicleResult.data) {
        setErrorMessage(vehicleResult.error?.message || "Vehicle could not be loaded.");
        setVehicle(null);
      } else {
        const data = vehicleResult.data;
        setVehicle(data);

        setForm((current) => ({
          ...current,
          rego_expiry: dateInput(data.rego_expiry),
          insurance_expiry: dateInput(data.insurance_expiry),
          last_service: dateInput(data.last_service),
          next_service_due: dateInput(data.next_service_due),
          next_service_km:
            data.next_service_km === null || data.next_service_km === undefined
              ? ""
              : String(data.next_service_km),
          next_inspection_due: dateInput(data.next_inspection_due),
          status_after_update: clean(data.status) || "Available",

          ehub: Boolean(data.ehub),
          dashcam: Boolean(data.dashcam),
          alert_button: Boolean(data.alert_button),
          fuel_card: Boolean(data.fuel_card),
          reverse_squawker: Boolean(data.reverse_squawker),
          uhf_radio: Boolean(data.uhf_radio),
          fire_extinguisher: Boolean(data.fire_extinguisher),
          first_aid_kit: Boolean(data.first_aid_kit),
          snake_bite_kit: Boolean(data.snake_bite_kit),
          wheel_nut_indicators: Boolean(data.wheel_nut_indicators),
          wheel_chocks: Boolean(data.wheel_chocks),
          shovel: Boolean(data.shovel),
          knapsack: Boolean(data.knapsack),

          spare_key_provided: Boolean(data.spare_key_provided),
          spare_key_location: clean(data.spare_key_location),

          new_project: clean(data.project),
          new_crew: clean(data.crew),
        }));
      }

      setProjects(projectResult.error ? [] : ((projectResult.data ?? []) as ProjectOption[]));
      setCrews(crewResult.error ? [] : ((crewResult.data ?? []) as CrewOption[]));
      setLoading(false);
    }

    void loadPageData();

    return () => {
      cancelled = true;
    };
  }, [supabase, vehicleId]);

  const projectOptions = useMemo(() => {
    return projects.map((project) => clean(project.name)).filter(Boolean);
  }, [projects]);

  const crewOptions = useMemo(() => {
    return crews
      .filter((crew) => crew.active !== false)
      .map((crew) =>
        [crew.crew_number, crew.crew_name, crew.leading_hand]
          .map(clean)
          .filter(Boolean)
          .join(" - "),
      )
      .filter(Boolean);
  }, [crews]);

  const kmUntilNextService = useMemo(() => {
    const currentKm = toNumber(form.odometer_km);
    const nextKm = toNumber(form.next_service_km);

    if (currentKm === null || nextKm === null) return "N/A";

    return `${(nextKm - currentKm).toLocaleString()} km`;
  }, [form.odometer_km, form.next_service_km]);

  function updateField<K extends keyof UpdateForm>(
    key: K,
    value: UpdateForm[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function uploadInvoiceDocument(historyId: string) {
    if (!invoiceFile) {
      return {
        document_name: null,
        document_url: null,
        storage_path: null,
      };
    }

    const safeFileName = invoiceFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${vehicleId}/${historyId}/${Date.now()}-${safeFileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("vehicle_service_documents")
      .upload(filePath, invoiceFile, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) throw new Error(uploadError.message);

    const {
      data: { publicUrl },
    } = supabase.storage
      .from("vehicle_service_documents")
      .getPublicUrl(uploadData.path);

    return {
      document_name: invoiceFile.name,
      document_url: publicUrl,
      storage_path: uploadData.path,
    };
  }

  async function saveServiceOrModificationHistory() {
    const isModification = form.update_type === "Modification";

    const historyPayload = isModification
      ? {
          vehicle_asset_id: vehicleId,
          record_type: "Modification / Addition",
          modification_date: form.modification_date || null,
          modification_type: form.modification_type || null,
          modification_description: form.modification_description.trim() || null,
          supplier: form.supplier.trim() || null,
          invoice_number: form.invoice_number.trim() || null,
          invoice_cost: toNumber(form.invoice_cost),
          work_completed: form.modification_description.trim() || form.work_completed.trim() || null,
          mechanic_recommendations: form.mechanic_recommendations.trim() || null,
          follow_up_actions: form.follow_up_actions.trim() || null,
          invoice_notes: form.invoice_notes.trim() || null,
          status_after_update: form.status_after_update || null,
        }
      : {
          vehicle_asset_id: vehicleId,
          record_type: isTrailer ? "Trailer Inspection" : "Vehicle Service",
          service_date: isTrailer ? null : form.service_date || null,
          inspection_date: isTrailer ? form.inspection_date || null : null,
          odometer_km: isTrailer ? null : toNumber(form.odometer_km),
          next_service_km: isTrailer ? null : toNumber(form.next_service_km),
          service_type: isTrailer ? null : form.service_type || null,
          inspection_type: isTrailer ? form.inspection_type || null : null,
          supplier: form.supplier.trim() || null,
          invoice_number: form.invoice_number.trim() || null,
          invoice_cost: toNumber(form.invoice_cost),
          work_completed: form.work_completed.trim() || null,
          mechanic_recommendations: form.mechanic_recommendations.trim() || null,
          follow_up_actions: form.follow_up_actions.trim() || null,
          invoice_notes: form.invoice_notes.trim() || null,
          next_service_due: isTrailer ? null : form.next_service_due || null,
          next_inspection_due: isTrailer ? form.next_inspection_due || null : null,
          status_after_update: form.status_after_update || null,
          trailer_registration_checked: isTrailer ? form.trailer_registration_checked : false,
          trailer_tyres_checked: isTrailer ? form.trailer_tyres_checked : false,
          trailer_brakes_checked: isTrailer ? form.trailer_brakes_checked : false,
          trailer_lights_checked: isTrailer ? form.trailer_lights_checked : false,
          trailer_coupling_checked: isTrailer ? form.trailer_coupling_checked : false,
          trailer_chains_checked: isTrailer ? form.trailer_chains_checked : false,
          trailer_defects_found: isTrailer ? form.trailer_defects_found : false,
          trailer_defect_notes: isTrailer ? form.trailer_defect_notes.trim() || null : null,
        };

    const { data: historyData, error: historyError } = await supabase
      .from("vehicle_service_history")
      .insert(historyPayload)
      .select("id")
      .single();

    if (historyError || !historyData) {
      throw new Error(historyError?.message || "Failed to save update record.");
    }

    const documentData = await uploadInvoiceDocument(historyData.id);

    if (documentData.document_url) {
      const { error } = await supabase
        .from("vehicle_service_history")
        .update(documentData)
        .eq("id", historyData.id);

      if (error) throw new Error(error.message);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!vehicle) {
      setErrorMessage("Vehicle could not be loaded.");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      if (form.update_type === "Project Transfer") {
        await supabase.from("vehicle_project_history").insert({
          vehicle_asset_id: vehicleId,
          project: form.new_project.trim() || null,
          crew: form.new_crew.trim() || null,
          project_onboard_date: form.project_onboard_date || null,
          project_offboard_date: form.project_offboard_date || null,
          notes: form.project_transfer_notes.trim() || null,
        });
      } else {
        await saveServiceOrModificationHistory();
      }

      const vehicleUpdatePayload = {
        status: form.status_after_update || null,
        rego_expiry: form.rego_expiry || null,
        insurance_expiry: isTrailer ? null : form.insurance_expiry || null,
        last_service: isTrailer
          ? null
          : form.service_date || form.last_service || null,
        next_service_due: isTrailer ? null : form.next_service_due || null,
        next_service_km: isTrailer ? null : toNumber(form.next_service_km),
        next_inspection_due: isTrailer ? form.next_inspection_due || null : null,

        project:
          form.update_type === "Project Transfer"
            ? form.new_project.trim() || null
            : vehicle.project,
        crew:
          form.update_type === "Project Transfer"
            ? form.new_crew.trim() || null
            : vehicle.crew,

        spare_key_provided: form.spare_key_provided,
        spare_key_location: form.spare_key_provided
          ? form.spare_key_location.trim() || "Site Office"
          : null,

        ehub: isTrailer ? false : form.ehub,
        dashcam: isTrailer ? false : form.dashcam,
        alert_button: isTrailer ? false : form.alert_button,
        fuel_card: isTrailer ? false : form.fuel_card,
        reverse_squawker: isTrailer ? false : form.reverse_squawker,
        uhf_radio: isTrailer ? false : form.uhf_radio,
        fire_extinguisher: isTrailer ? false : form.fire_extinguisher,
        first_aid_kit: isTrailer ? false : form.first_aid_kit,
        snake_bite_kit: isTrailer ? false : form.snake_bite_kit,
        wheel_nut_indicators: isTrailer ? false : form.wheel_nut_indicators,
        wheel_chocks: isTrailer ? false : form.wheel_chocks,
        shovel: isTrailer ? false : form.shovel,
        knapsack: isTrailer ? false : form.knapsack,
      };

      const { error } = await supabase
        .from("vehicle_assets")
        .update(vehicleUpdatePayload)
        .eq("id", vehicleId);

      if (error) throw new Error(error.message);

      router.push("/assets/vehicles");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save asset update.",
      );
      setSaving(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow={isTrailer ? "Trailer Update" : "Vehicle Update"}
        title={loading ? "Update Asset" : `Update ${display(vehicle?.vehicle_id)}`}
        description="Update asset dates, record service history, modifications, spare key changes or project transfers."
        actions={
          <Link
            href="/assets/vehicles"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Back to Vehicles
          </Link>
        }
      />

      {errorMessage ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {errorMessage}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
            <Wrench size={18} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-950">
              Asset Summary
            </h2>
            <p className="text-sm text-slate-600">
              Current information before recording the update.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryItem label="Vehicle ID" value={display(vehicle?.vehicle_id)} />
          <SummaryItem label="Rego" value={display(vehicle?.vehicle_rego)} />
          <SummaryItem label="Make & Model" value={makeModel(vehicle)} />
          <SummaryItem label="Category" value={display(vehicle?.category)} />
          <SummaryItem label="Project" value={display(vehicle?.project)} />
          <SummaryItem label="Crew" value={display(vehicle?.crew)} />
          <SummaryItem
            label="Current Status"
            value={
              <StatusBadge
                label={display(vehicle?.status)}
                tone={getTone(vehicle?.status)}
              />
            }
          />
          <SummaryItem
            label="Spare Key"
            value={form.spare_key_provided ? "Provided" : "Not Provided"}
          />
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Section
          title="Update Type"
          description="Choose the type of update you want to record."
        >
          <div className="grid gap-3 md:grid-cols-3">
            {(["Service", "Modification", "Project Transfer"] as UpdateType[]).map(
              (type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => updateField("update_type", type)}
                  className={`rounded-2xl border p-4 text-left ${
                    form.update_type === type
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-white text-slate-800"
                  }`}
                >
                  <p className="font-bold">{type}</p>
                  <p className="mt-1 text-sm opacity-80">
                    {type === "Service"
                      ? "Service, inspection and next due dates."
                      : type === "Modification"
                        ? "Added equipment, spare keys or asset changes."
                        : "Project movement and crew allocation history."}
                  </p>
                </button>
              ),
            )}
          </div>
        </Section>

        <Section
          title="Current Expiry / Compliance Dates"
          description="Update important dates directly from this page."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field
              label="Rego Expiry"
              type="date"
              value={form.rego_expiry}
              onChange={(value) => updateField("rego_expiry", value)}
            />

            {!isTrailer && (
              <>
                <Field
                  label="Insurance Expiry"
                  type="date"
                  value={form.insurance_expiry}
                  onChange={(value) => updateField("insurance_expiry", value)}
                />

                <Field
                  label="Last Service"
                  type="date"
                  value={form.last_service}
                  onChange={(value) => updateField("last_service", value)}
                />

                <Field
                  label="Next Service Due"
                  type="date"
                  value={form.next_service_due}
                  onChange={(value) => updateField("next_service_due", value)}
                />
              </>
            )}

            {isTrailer && (
              <Field
                label="Next Inspection Due"
                type="date"
                value={form.next_inspection_due}
                onChange={(value) => updateField("next_inspection_due", value)}
              />
            )}
          </div>
        </Section>

        {form.update_type === "Project Transfer" && (
          <Section
            title="Project Transfer / Onboarding"
            description="Record project movement history and update the current project and crew allocation."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <SelectField
                label="New Project"
                value={form.new_project}
                onChange={(value) => updateField("new_project", value)}
                options={projectOptions}
                placeholder="Select project"
              />

              <SelectField
                label="New Crew"
                value={form.new_crew}
                onChange={(value) => updateField("new_crew", value)}
                options={crewOptions}
                placeholder="Select crew"
              />

              <Field
                label="Project Onboard Date"
                type="date"
                value={form.project_onboard_date}
                onChange={(value) => updateField("project_onboard_date", value)}
              />

              <Field
                label="Project Offboard Date"
                type="date"
                value={form.project_offboard_date}
                onChange={(value) => updateField("project_offboard_date", value)}
              />
            </div>

            <div className="mt-4">
              <TextAreaField
                label="Project Transfer Notes"
                value={form.project_transfer_notes}
                onChange={(value) => updateField("project_transfer_notes", value)}
                placeholder="Reason for transfer, site office notes, handover notes..."
              />
            </div>
          </Section>
        )}

        {form.update_type === "Service" && (
          <>
            {isTrailer ? (
              <>
                <Section
                  title="Trailer Inspection"
                  description="Record the inspection details and checks completed."
                >
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <Field
                      label="Inspection Date"
                      type="date"
                      value={form.inspection_date}
                      onChange={(value) => updateField("inspection_date", value)}
                      required
                    />

                    <SelectField
                      label="Inspection Type"
                      value={form.inspection_type}
                      onChange={(value) => updateField("inspection_type", value)}
                      options={trailerInspectionTypes}
                      required
                    />

                    <Field
                      label="Supplier / Mechanic"
                      value={form.supplier}
                      onChange={(value) => updateField("supplier", value)}
                      placeholder="Workshop, mechanic or supplier"
                    />

                    <Field
                      label="Invoice Number"
                      value={form.invoice_number}
                      onChange={(value) => updateField("invoice_number", value)}
                      placeholder="Invoice or job number"
                    />

                    <Field
                      label="Invoice Cost"
                      type="number"
                      value={form.invoice_cost}
                      onChange={(value) => updateField("invoice_cost", value)}
                      placeholder="0.00"
                    />

                    <SelectField
                      label="Asset Availability"
                      value={form.status_after_update}
                      onChange={(value) =>
                        updateField("status_after_update", value)
                      }
                      options={statusOptions}
                    />
                  </div>
                </Section>

                <Section
                  title="Trailer Checks"
                  description="Tick the checks completed as part of this inspection."
                >
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <CheckField
                      label="Registration checked"
                      checked={form.trailer_registration_checked}
                      onChange={(value) =>
                        updateField("trailer_registration_checked", value)
                      }
                    />

                    <CheckField
                      label="Tyres / wheels checked"
                      checked={form.trailer_tyres_checked}
                      onChange={(value) =>
                        updateField("trailer_tyres_checked", value)
                      }
                    />

                    <CheckField
                      label="Brakes checked"
                      checked={form.trailer_brakes_checked}
                      onChange={(value) =>
                        updateField("trailer_brakes_checked", value)
                      }
                    />

                    <CheckField
                      label="Lights / electrical checked"
                      checked={form.trailer_lights_checked}
                      onChange={(value) =>
                        updateField("trailer_lights_checked", value)
                      }
                    />

                    <CheckField
                      label="Coupling checked"
                      checked={form.trailer_coupling_checked}
                      onChange={(value) =>
                        updateField("trailer_coupling_checked", value)
                      }
                    />

                    <CheckField
                      label="Chains checked"
                      checked={form.trailer_chains_checked}
                      onChange={(value) =>
                        updateField("trailer_chains_checked", value)
                      }
                    />

                    <CheckField
                      label="Defects found"
                      checked={form.trailer_defects_found}
                      onChange={(value) =>
                        updateField("trailer_defects_found", value)
                      }
                    />
                  </div>

                  {form.trailer_defects_found && (
                    <div className="mt-4">
                      <TextAreaField
                        label="Trailer Defect Notes"
                        value={form.trailer_defect_notes}
                        onChange={(value) =>
                          updateField("trailer_defect_notes", value)
                        }
                        placeholder="Describe defects found, repairs required or restrictions..."
                      />
                    </div>
                  )}
                </Section>
              </>
            ) : (
              <Section
                title="Vehicle Service"
                description="Record service details from the invoice or service report."
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <Field
                    label="Service Date"
                    type="date"
                    value={form.service_date}
                    onChange={(value) => updateField("service_date", value)}
                    required
                  />

                  <SelectField
                    label="Service Type"
                    value={form.service_type}
                    onChange={(value) => updateField("service_type", value)}
                    options={vehicleServiceTypes}
                    required
                  />

                  <Field
                    label="Odometer KM"
                    type="number"
                    value={form.odometer_km}
                    onChange={(value) => updateField("odometer_km", value)}
                    placeholder="Current km"
                  />

                  <Field
                    label="Supplier / Mechanic"
                    value={form.supplier}
                    onChange={(value) => updateField("supplier", value)}
                    placeholder="Workshop, mechanic or supplier"
                  />

                  <Field
                    label="Invoice Number"
                    value={form.invoice_number}
                    onChange={(value) => updateField("invoice_number", value)}
                    placeholder="Invoice or job number"
                  />

                  <Field
                    label="Invoice Cost"
                    type="number"
                    value={form.invoice_cost}
                    onChange={(value) => updateField("invoice_cost", value)}
                    placeholder="0.00"
                  />

                  <Field
                    label="Next Service KM"
                    type="number"
                    value={form.next_service_km}
                    onChange={(value) => updateField("next_service_km", value)}
                    placeholder="Next service km"
                  />

                  <Field
                    label="KM Until Next Service"
                    value={kmUntilNextService}
                    onChange={() => undefined}
                    disabled
                  />

                  <SelectField
                    label="Asset Availability"
                    value={form.status_after_update}
                    onChange={(value) =>
                      updateField("status_after_update", value)
                    }
                    options={statusOptions}
                  />
                </div>
              </Section>
            )}
          </>
        )}

        {form.update_type === "Modification" && (
          <>
            <Section
              title="Modification / Addition"
              description="Record equipment added, replacement parts, upgrades, spare key changes or asset changes."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field
                  label="Modification Date"
                  type="date"
                  value={form.modification_date}
                  onChange={(value) => updateField("modification_date", value)}
                  required
                />

                <SelectField
                  label="Modification Type"
                  value={form.modification_type}
                  onChange={(value) => updateField("modification_type", value)}
                  options={modificationTypes}
                  required
                />

                <Field
                  label="Supplier / Mechanic"
                  value={form.supplier}
                  onChange={(value) => updateField("supplier", value)}
                  placeholder="Workshop, mechanic or supplier"
                />

                <Field
                  label="Invoice Number"
                  value={form.invoice_number}
                  onChange={(value) => updateField("invoice_number", value)}
                  placeholder="Invoice or job number"
                />

                <Field
                  label="Cost"
                  type="number"
                  value={form.invoice_cost}
                  onChange={(value) => updateField("invoice_cost", value)}
                  placeholder="0.00"
                />

                <SelectField
                  label="Asset Availability"
                  value={form.status_after_update}
                  onChange={(value) =>
                    updateField("status_after_update", value)
                  }
                  options={statusOptions}
                />
              </div>

              <div className="mt-4">
                <TextAreaField
                  label="Modification Description"
                  value={form.modification_description}
                  onChange={(value) =>
                    updateField("modification_description", value)
                  }
                  placeholder="Example: Added new fire extinguisher, replaced battery, installed UHF radio..."
                  required
                />
              </div>
            </Section>

            <Section
              title="Spare Key"
              description="Track if a spare key has been provided and where it is held."
            >
              <div className="space-y-4">
                <CheckField
                  label="Spare key provided"
                  checked={form.spare_key_provided}
                  onChange={(value) =>
                    updateField("spare_key_provided", value)
                  }
                />

                {form.spare_key_provided && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                    Spare key must be handed into the site office.
                  </div>
                )}

                {form.spare_key_provided && (
                  <Field
                    label="Spare Key Location"
                    value={form.spare_key_location}
                    onChange={(value) =>
                      updateField("spare_key_location", value)
                    }
                    placeholder="Site office, depot, project office..."
                  />
                )}
              </div>
            </Section>

            {!isTrailer && (
              <Section
                title="Update Fitted Equipment"
                description="Tick any equipment now fitted to this vehicle after the modification."
              >
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <CheckField
                    label="eHub fitted"
                    checked={form.ehub}
                    onChange={(value) => updateField("ehub", value)}
                  />

                  <CheckField
                    label="Dashcam fitted"
                    checked={form.dashcam}
                    onChange={(value) => updateField("dashcam", value)}
                  />

                  <CheckField
                    label="Alert button fitted"
                    checked={form.alert_button}
                    onChange={(value) => updateField("alert_button", value)}
                  />

                  <CheckField
                    label="UHF radio fitted"
                    checked={form.uhf_radio}
                    onChange={(value) => updateField("uhf_radio", value)}
                  />

                  <CheckField
                    label="Reverse squawker fitted"
                    checked={form.reverse_squawker}
                    onChange={(value) => updateField("reverse_squawker", value)}
                  />

                  <CheckField
                    label="Fire extinguisher"
                    checked={form.fire_extinguisher}
                    onChange={(value) => updateField("fire_extinguisher", value)}
                  />

                  <CheckField
                    label="First aid kit"
                    checked={form.first_aid_kit}
                    onChange={(value) => updateField("first_aid_kit", value)}
                  />

                  <CheckField
                    label="Snake bite kit"
                    checked={form.snake_bite_kit}
                    onChange={(value) => updateField("snake_bite_kit", value)}
                  />

                  <CheckField
                    label="Wheel nut indicators"
                    checked={form.wheel_nut_indicators}
                    onChange={(value) =>
                      updateField("wheel_nut_indicators", value)
                    }
                  />

                  <CheckField
                    label="Wheel chocks"
                    checked={form.wheel_chocks}
                    onChange={(value) => updateField("wheel_chocks", value)}
                  />

                  <CheckField
                    label="Shovel"
                    checked={form.shovel}
                    onChange={(value) => updateField("shovel", value)}
                  />

                  <CheckField
                    label="Knapsack"
                    checked={form.knapsack}
                    onChange={(value) => updateField("knapsack", value)}
                  />

                  <CheckField
                    label="Fuel card issued"
                    checked={form.fuel_card}
                    onChange={(value) => updateField("fuel_card", value)}
                  />
                </div>
              </Section>
            )}
          </>
        )}

        {form.update_type !== "Project Transfer" && (
          <>
            <Section
              title="Work Completed"
              description="Summarise what was completed for this update."
            >
              <TextAreaField
                label="Work Completed"
                value={form.work_completed}
                onChange={(value) => updateField("work_completed", value)}
                placeholder="Summarise the work completed..."
                required={form.update_type === "Service"}
              />
            </Section>

            <Section
              title="Recommendations / Follow Up"
              description="Capture recommendations, issues to monitor or follow-up actions."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <TextAreaField
                  label="Mechanic Recommendations"
                  value={form.mechanic_recommendations}
                  onChange={(value) =>
                    updateField("mechanic_recommendations", value)
                  }
                  placeholder="Recommendations from mechanic or supplier..."
                />

                <TextAreaField
                  label="Follow Up Actions"
                  value={form.follow_up_actions}
                  onChange={(value) => updateField("follow_up_actions", value)}
                  placeholder="Who needs to action what and by when..."
                />
              </div>
            </Section>

            <Section
              title="Notes"
              description="Digitise important invoice notes or update notes."
            >
              <TextAreaField
                label="Invoice / Update Notes"
                value={form.invoice_notes}
                onChange={(value) => updateField("invoice_notes", value)}
                placeholder="Invoice notes, parts replaced, restrictions, warranty notes..."
              />
            </Section>

            <Section
              title="Attach Invoice / Report"
              description="Attach the invoice, service report, modification record or supporting photo."
            >
              <label className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    {invoiceFile ? invoiceFile.name : "No file selected"}
                  </p>
                  <p className="text-xs text-slate-500">
                    PDF, image or document upload
                  </p>
                </div>

                <span className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                  <FileUp size={14} />
                  Attach file
                  <input
                    type="file"
                    className="hidden"
                    onChange={(event) => {
                      setInvoiceFile(event.target.files?.[0] ?? null);
                      event.target.value = "";
                    }}
                  />
                </span>
              </label>
            </Section>
          </>
        )}

        <div className="sticky bottom-4 z-10 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-end">
          <Link
            href="/assets/vehicles"
            className="inline-flex justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={saving || loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={16} />
            {saving ? "Saving Update..." : "Save Asset Update"}
          </button>
        </div>
      </form>
    </PageShell>
  );
}