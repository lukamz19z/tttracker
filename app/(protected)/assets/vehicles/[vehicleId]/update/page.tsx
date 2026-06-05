"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileUp, Save, Wrench } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { PageHeader, PageShell, StatusBadge } from "../../../components";

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
  last_service: string | null;
  rego_expiry: string | null;
  insurance_expiry: string | null;
  next_service_due: string | null;
  next_service_km: number | null;
  next_inspection_due: string | null;
};

type UpdateForm = {
  service_date: string;
  inspection_date: string;
  odometer_km: string;
  next_service_km: string;
  service_type: string;
  inspection_type: string;
  supplier: string;
  invoice_number: string;
  invoice_cost: string;
  work_completed: string;
  mechanic_recommendations: string;
  follow_up_actions: string;
  invoice_notes: string;
  next_service_due: string;
  next_inspection_due: string;
  status_after_update: string;
  inspection_outcome: string;
  trailer_registration_checked: boolean;
  trailer_tyres_checked: boolean;
  trailer_brakes_checked: boolean;
  trailer_lights_checked: boolean;
  trailer_coupling_checked: boolean;
  trailer_chains_checked: boolean;
  trailer_roadworthy: boolean;
  trailer_safe_for_use: boolean;
  trailer_defects_found: boolean;
  trailer_defect_notes: string;
};

const emptyForm: UpdateForm = {
  service_date: "",
  inspection_date: "",
  odometer_km: "",
  next_service_km: "",
  service_type: "",
  inspection_type: "",
  supplier: "",
  invoice_number: "",
  invoice_cost: "",
  work_completed: "",
  mechanic_recommendations: "",
  follow_up_actions: "",
  invoice_notes: "",
  next_service_due: "",
  next_inspection_due: "",
  status_after_update: "Available",
  inspection_outcome: "",
  trailer_registration_checked: false,
  trailer_tyres_checked: false,
  trailer_brakes_checked: false,
  trailer_lights_checked: false,
  trailer_coupling_checked: false,
  trailer_chains_checked: false,
  trailer_roadworthy: false,
  trailer_safe_for_use: false,
  trailer_defects_found: false,
  trailer_defect_notes: "",
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

const inspectionOutcomes = ["Passed", "Passed With Defects", "Failed"];

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

function makeModel(vehicle: VehicleAsset | null) {
  if (!vehicle) return "N/A";

  return (
    [vehicle.make, vehicle.model].map(clean).filter(Boolean).join(" ") || "N/A"
  );
}

function toNumber(value: string) {
  const cleaned = value.trim();
  if (!cleaned) return null;

  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
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
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  required?: boolean;
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
        <option value="">Select option</option>
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
  const [form, setForm] = useState<UpdateForm>(emptyForm);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadVehicle() {
      setLoading(true);

      const { data, error } = await supabase
        .from("vehicle_assets")
        .select(
          "id, vehicle_id, vehicle_rego, make, model, category, project, crew, status, last_service, rego_expiry, insurance_expiry, next_service_due, next_service_km, next_inspection_due",
        )
        .eq("id", vehicleId)
        .single<VehicleAsset>();

      if (cancelled) return;

      if (error || !data) {
        setErrorMessage(error?.message || "Vehicle could not be loaded.");
        setVehicle(null);
      } else {
        setVehicle(data);
        setForm((current) => ({
          ...current,
          status_after_update: clean(data.status) || "Available",
          next_service_due: data.next_service_due?.slice(0, 10) || "",
          next_service_km:
            data.next_service_km === null || data.next_service_km === undefined
              ? ""
              : String(data.next_service_km),
          next_inspection_due: data.next_inspection_due?.slice(0, 10) || "",
        }));
      }

      setLoading(false);
    }

    void loadVehicle();

    return () => {
      cancelled = true;
    };
  }, [supabase, vehicleId]);

  const isTrailer = clean(vehicle?.category).toLowerCase() === "trailer";

  const kmUntilNextService = useMemo(() => {
    const currentKm = toNumber(form.odometer_km);
    const nextKm = toNumber(form.next_service_km);

    if (currentKm === null || nextKm === null) return "N/A";

    const remaining = nextKm - currentKm;

    return `${remaining.toLocaleString()} km`;
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

    if (uploadError) {
      throw new Error(uploadError.message);
    }

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!vehicle) {
      setErrorMessage("Vehicle could not be loaded.");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    const recordType = isTrailer ? "Trailer Inspection" : "Vehicle Service";

    const historyPayload = {
      vehicle_asset_id: vehicleId,
      record_type: recordType,

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

      inspection_outcome: isTrailer ? form.inspection_outcome || null : null,

      trailer_registration_checked: isTrailer
        ? form.trailer_registration_checked
        : false,
      trailer_tyres_checked: isTrailer ? form.trailer_tyres_checked : false,
      trailer_brakes_checked: isTrailer ? form.trailer_brakes_checked : false,
      trailer_lights_checked: isTrailer ? form.trailer_lights_checked : false,
      trailer_coupling_checked: isTrailer ? form.trailer_coupling_checked : false,
      trailer_chains_checked: isTrailer ? form.trailer_chains_checked : false,
      trailer_roadworthy: isTrailer ? form.trailer_roadworthy : false,
      trailer_safe_for_use: isTrailer ? form.trailer_safe_for_use : false,
      trailer_defects_found: isTrailer ? form.trailer_defects_found : false,
      trailer_defect_notes: isTrailer
        ? form.trailer_defect_notes.trim() || null
        : null,
    };

    const { data: historyData, error: historyError } = await supabase
      .from("vehicle_service_history")
      .insert(historyPayload)
      .select("id")
      .single();

    if (historyError || !historyData) {
      setErrorMessage(historyError?.message || "Failed to save update record.");
      setSaving(false);
      return;
    }

    try {
      const documentData = await uploadInvoiceDocument(historyData.id);

      if (documentData.document_url) {
        const { error: documentUpdateError } = await supabase
          .from("vehicle_service_history")
          .update(documentData)
          .eq("id", historyData.id);

        if (documentUpdateError) {
          throw new Error(documentUpdateError.message);
        }
      }

      const vehicleUpdatePayload = isTrailer
        ? {
            status: form.status_after_update || null,
            next_inspection_due: form.next_inspection_due || null,
          }
        : {
            status: form.status_after_update || null,
            last_service: form.service_date || null,
            next_service_due: form.next_service_due || null,
            next_service_km: toNumber(form.next_service_km),
          };

      const { error: vehicleUpdateError } = await supabase
        .from("vehicle_assets")
        .update(vehicleUpdatePayload)
        .eq("id", vehicleId);

      if (vehicleUpdateError) {
        throw new Error(vehicleUpdateError.message);
      }

      router.push("/assets/vehicles");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The update was saved, but something failed after saving.",
      );
      setSaving(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow={isTrailer ? "Trailer Update" : "Vehicle Update"}
        title={loading ? "Update Asset" : `Update ${display(vehicle?.vehicle_id)}`}
        description={
          isTrailer
            ? "Record trailer inspections, defects, repairs and next inspection requirements."
            : "Record vehicle services, invoice notes, odometer readings and next service requirements."
        }
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
            label={isTrailer ? "Next Inspection" : "Next Service"}
            value={
              isTrailer
                ? formatDate(vehicle?.next_inspection_due)
                : formatDate(vehicle?.next_service_due)
            }
          />
          {!isTrailer && (
            <>
              <SummaryItem
                label="Last Service"
                value={formatDate(vehicle?.last_service)}
              />
              <SummaryItem
                label="Next Service KM"
                value={
                  vehicle?.next_service_km === null ||
                  vehicle?.next_service_km === undefined
                    ? "N/A"
                    : `${vehicle.next_service_km.toLocaleString()} km`
                }
              />
            </>
          )}
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-4">
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

                <SelectField
                  label="Inspection Outcome"
                  value={form.inspection_outcome}
                  onChange={(value) => updateField("inspection_outcome", value)}
                  options={inspectionOutcomes}
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
                  label="Next Inspection Due"
                  type="date"
                  value={form.next_inspection_due}
                  onChange={(value) => updateField("next_inspection_due", value)}
                />

                <SelectField
                  label="Asset Availability"
                  value={form.status_after_update}
                  onChange={(value) => updateField("status_after_update", value)}
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
                  label="Roadworthy"
                  checked={form.trailer_roadworthy}
                  onChange={(value) => updateField("trailer_roadworthy", value)}
                />

                <CheckField
                  label="Safe for use"
                  checked={form.trailer_safe_for_use}
                  onChange={(value) => updateField("trailer_safe_for_use", value)}
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
                label="Next Service Due"
                type="date"
                value={form.next_service_due}
                onChange={(value) => updateField("next_service_due", value)}
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
              />

              <SelectField
                label="Asset Availability"
                value={form.status_after_update}
                onChange={(value) => updateField("status_after_update", value)}
                options={statusOptions}
              />
            </div>
          </Section>
        )}

        <Section
          title="Work Completed"
          description={
            isTrailer
              ? "Summarise trailer inspection findings, repairs or maintenance completed."
              : "Summarise the vehicle service, repairs or maintenance completed."
          }
        >
          <TextAreaField
            label="Work Completed"
            value={form.work_completed}
            onChange={(value) => updateField("work_completed", value)}
            placeholder="Summarise the work completed..."
            required
          />
        </Section>

        <Section
          title="Recommendations & Follow Up"
          description="Capture what still needs attention after this update."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <TextAreaField
              label="Mechanic Recommendations"
              value={form.mechanic_recommendations}
              onChange={(value) =>
                updateField("mechanic_recommendations", value)
              }
              placeholder="Recommendations, monitoring items, parts to order..."
            />

            <TextAreaField
              label="Follow Up Actions"
              value={form.follow_up_actions}
              onChange={(value) => updateField("follow_up_actions", value)}
              placeholder="Actions required, responsible person, due date..."
            />
          </div>
        </Section>

        <Section
          title="Invoice / Service Notes"
          description="Digitise important notes from the invoice, report or mechanic."
        >
          <TextAreaField
            label="Invoice Notes"
            value={form.invoice_notes}
            onChange={(value) => updateField("invoice_notes", value)}
            placeholder="Invoice notes, parts replaced, restrictions, warranty notes..."
          />
        </Section>

        <Section
          title="Attach Invoice / Report"
          description="Attach the invoice, service report, inspection sheet or supporting photo."
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