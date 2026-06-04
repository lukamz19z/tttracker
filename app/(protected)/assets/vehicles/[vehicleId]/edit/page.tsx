/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileText, FileUp, Save, Trash2, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { PageHeader, PageShell } from "../../../components";

type VehicleCategory = "Light Vehicle" | "Heavy Vehicle" | "Trailer" | "";

type VehicleStatus =
  | "Available"
  | "In Use"
  | "Off Hire"
  | "Superseded"
  | "Inactive"
  | "";

type VehicleForm = {
  vehicle_id: string;
  vehicle_rego: string;
  make: string;
  model: string;
  category: VehicleCategory;
  project: string;
  crew: string;
  status: VehicleStatus;
  year: string;
  style: string;
  owner: string;
  vin_number: string;
  last_service: string;
  rego_expiry: string;
  insurance_expiry: string;
  hired: boolean;
  hired_from: string;
  hire_term: string;
  off_hire_date: string;
  superseded_by: string;
  inactive_reason: string;
  ehub: boolean;
  dashcam: boolean;
  alert_button: boolean;
  fuel_card: boolean;
  notes: string;
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

type VehicleDocument = {
  id: string;
  vehicle_asset_id: string | null;
  document_type: string | null;
  file_name: string | null;
  file_url: string | null;
  storage_path: string | null;
  created_at: string | null;
};

type PendingDocument = {
  documentType: string;
  file: File;
};

const vehicleCategories: VehicleCategory[] = [
  "Light Vehicle",
  "Heavy Vehicle",
  "Trailer",
];

const vehicleStatuses: VehicleStatus[] = [
  "Available",
  "In Use",
  "Off Hire",
  "Superseded",
  "Inactive",
];

const baseDocumentTypes = [
  "Risk Assessment",
  "Registration Document",
  "Insurance Document",
  "Service History",
];

const emptyVehicle: VehicleForm = {
  vehicle_id: "",
  vehicle_rego: "",
  make: "",
  model: "",
  category: "",
  project: "",
  crew: "",
  status: "Available",
  year: "",
  style: "",
  owner: "",
  vin_number: "",
  last_service: "",
  rego_expiry: "",
  insurance_expiry: "",
  hired: false,
  hired_from: "",
  hire_term: "",
  off_hire_date: "",
  superseded_by: "",
  inactive_reason: "",
  ehub: false,
  dashcam: false,
  alert_button: false,
  fuel_card: false,
  notes: "",
};

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function toDateInput(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function getDocumentTypesForVehicle(category: string) {
  const type = clean(category).toLowerCase();

  if (type === "light vehicle") {
    return [
      ...baseDocumentTypes,
      "eHub Document",
      "Dashcam Document",
      "Fuel Card Document",
      "Other Documents",
    ];
  }

  if (type === "heavy vehicle") {
    return [
      ...baseDocumentTypes,
      "NHVR / Heavy Vehicle Document",
      "Maintenance Document",
      "eHub Document",
      "Dashcam Document",
      "Fuel Card Document",
      "Other Documents",
    ];
  }

  if (type === "trailer") {
    return [
      ...baseDocumentTypes,
      "Trailer Inspection Document",
      "Maintenance Document",
      "Other Documents",
    ];
  }

  return [...baseDocumentTypes, "Other Documents"];
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
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
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
        {placeholder ? <option value="">{placeholder}</option> : null}
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

export default function EditVehiclePage() {
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

  const [form, setForm] = useState<VehicleForm>(emptyVehicle);
  const [crews, setCrews] = useState<CrewOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [pendingDocuments, setPendingDocuments] = useState<PendingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPageData() {
      setLoading(true);
      setLoadingOptions(true);

      const [vehicleResult, documentResult, crewResult, projectResult] =
        await Promise.all([
          supabase.from("vehicle_assets").select("*").eq("id", vehicleId).single(),
          supabase
            .from("vehicle_documents")
            .select("*")
            .eq("vehicle_asset_id", vehicleId)
            .order("created_at", { ascending: false }),
          supabase
            .from("crews")
            .select("id, crew_number, crew_name, leading_hand, active")
            .order("crew_number", { ascending: true }),
          supabase
            .from("projects")
            .select("id, name")
            .order("name", { ascending: true }),
        ]);

      if (cancelled) return;

      if (vehicleResult.error || !vehicleResult.data) {
        setErrorMessage(
          vehicleResult.error?.message || "Vehicle could not be loaded.",
        );
      } else {
        const vehicle = vehicleResult.data;

        setForm({
          vehicle_id: clean(vehicle.vehicle_id),
          vehicle_rego: clean(vehicle.vehicle_rego),
          make: clean(vehicle.make),
          model: clean(vehicle.model),
          category: clean(vehicle.category) as VehicleCategory,
          project: clean(vehicle.project),
          crew: clean(vehicle.crew),
          status: (clean(vehicle.status) || "Available") as VehicleStatus,
          year: clean(vehicle.year),
          style: clean(vehicle.style),
          owner: clean(vehicle.owner),
          vin_number: clean(vehicle.vin_number),
          last_service: toDateInput(vehicle.last_service),
          rego_expiry: toDateInput(vehicle.rego_expiry),
          insurance_expiry: toDateInput(vehicle.insurance_expiry),
          hired: Boolean(vehicle.hired),
          hired_from: clean(vehicle.hired_from),
          hire_term: clean(vehicle.hire_term),
          off_hire_date: toDateInput(vehicle.off_hire_date),
          superseded_by: clean(vehicle.superseded_by),
          inactive_reason: clean(vehicle.inactive_reason),
          ehub: Boolean(vehicle.ehub),
          dashcam: Boolean(vehicle.dashcam),
          alert_button: Boolean(vehicle.alert_button),
          fuel_card: Boolean(vehicle.fuel_card),
          notes: clean(vehicle.notes),
        });
      }

      setDocuments(
        documentResult.error
          ? []
          : ((documentResult.data ?? []) as VehicleDocument[]),
      );

      setCrews(crewResult.error ? [] : ((crewResult.data ?? []) as CrewOption[]));

      setProjects(
        projectResult.error ? [] : ((projectResult.data ?? []) as ProjectOption[]),
      );

      setLoading(false);
      setLoadingOptions(false);
    }

    void loadPageData();

    return () => {
      cancelled = true;
    };
  }, [supabase, vehicleId]);

  const crewOptions = useMemo(() => {
    const options = crews
      .filter((crew) => crew.active !== false)
      .map((crew) =>
        [crew.crew_number, crew.crew_name, crew.leading_hand]
          .map(clean)
          .filter(Boolean)
          .join(" - "),
      )
      .filter(Boolean);

    if (form.crew && !options.includes(form.crew)) {
      return [form.crew, ...options];
    }

    return options;
  }, [crews, form.crew]);

  const projectOptions = useMemo(() => {
    const options = projects.map((project) => clean(project.name)).filter(Boolean);

    if (form.project && !options.includes(form.project)) {
      return [form.project, ...options];
    }

    return options;
  }, [projects, form.project]);

  const documentTypes = useMemo(() => {
    return getDocumentTypesForVehicle(form.category);
  }, [form.category]);

  const isTrailer = clean(form.category).toLowerCase() === "trailer";

  function updateField<K extends keyof VehicleForm>(
    key: K,
    value: VehicleForm[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function addPendingDocument(documentType: string, file: File | null) {
    if (!file) return;

    setPendingDocuments((current) => [
      ...current,
      {
        documentType,
        file,
      },
    ]);
  }

  function removePendingDocument(index: number) {
    setPendingDocuments((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  async function uploadPendingDocuments() {
    for (const document of pendingDocuments) {
      const safeFileName = document.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${vehicleId}/${Date.now()}-${safeFileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("vehicle_documents")
        .upload(filePath, document.file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("vehicle_documents").getPublicUrl(uploadData.path);

      const { error: documentError } = await supabase.from("vehicle_documents").insert({
        vehicle_asset_id: vehicleId,
        document_type: document.documentType,
        file_name: document.file.name,
        file_url: publicUrl,
        storage_path: uploadData.path,
      });

      if (documentError) {
        throw new Error(documentError.message);
      }
    }
  }

  async function deleteDocument(document: VehicleDocument) {
    const confirmed = window.confirm(
      `Delete ${document.file_name || "this document"}?`,
    );

    if (!confirmed) return;

    if (document.storage_path) {
      await supabase.storage
        .from("vehicle_documents")
        .remove([document.storage_path]);
    }

    const { error } = await supabase
      .from("vehicle_documents")
      .delete()
      .eq("id", document.id);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setDocuments((current) => current.filter((item) => item.id !== document.id));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");

    const payload = {
      vehicle_id: form.vehicle_id.trim() || null,
      vehicle_rego: form.vehicle_rego.trim() || null,
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      category: form.category || null,
      project: form.project.trim() || null,
      crew: form.crew.trim() || null,
      status: form.status || null,
      year: form.year.trim() || null,
      style: form.style.trim() || null,
      owner: form.owner.trim() || null,
      vin_number: form.vin_number.trim() || null,
      last_service: form.last_service || null,
      rego_expiry: form.rego_expiry || null,
      insurance_expiry: form.insurance_expiry || null,
      hired: form.hired,
      hired_from: form.hired ? form.hired_from.trim() || null : null,
      hire_term: form.hired ? form.hire_term.trim() || null : null,
      off_hire_date: form.status === "Off Hire" ? form.off_hire_date || null : null,
      superseded_by:
        form.status === "Superseded" ? form.superseded_by.trim() || null : null,
      inactive_reason:
        form.status === "Inactive" ? form.inactive_reason.trim() || null : null,
      ehub: form.category === "Trailer" ? false : form.ehub,
      dashcam: form.category === "Trailer" ? false : form.dashcam,
      alert_button: form.category === "Trailer" ? false : form.alert_button,
      fuel_card: form.category === "Trailer" ? false : form.fuel_card,
      notes: form.notes.trim() || null,
    };

    const { error } = await supabase
      .from("vehicle_assets")
      .update(payload)
      .eq("id", vehicleId);

    if (error) {
      setErrorMessage(error.message);
      setSaving(false);
      return;
    }

    try {
      if (pendingDocuments.length > 0) {
        await uploadPendingDocuments();
      }

      router.push("/assets/vehicles");
      router.refresh();
    } catch (documentError) {
      setErrorMessage(
        documentError instanceof Error
          ? documentError.message
          : "Vehicle updated, but one or more documents failed to upload.",
      );
      setSaving(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Edit Vehicle"
        title={
          loading
            ? "Edit Vehicle"
            : `Edit Vehicle: ${form.vehicle_id || form.vehicle_rego || vehicleId}`
        }
        description="Update vehicle details, allocation, hire status, onboard setup, documents and notes."
actions={
  <Link
    href="/assets/vehicles"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Back to View
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMessage ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {errorMessage}
          </div>
        ) : null}

        <Section
          title="Basic Vehicle Details"
          description="Main vehicle identification and register information."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field
              label="Vehicle ID"
              value={form.vehicle_id}
              onChange={(value) => updateField("vehicle_id", value)}
              placeholder="LV001, HV003, TR002"
              required
            />

            <Field
              label="Rego"
              value={form.vehicle_rego}
              onChange={(value) => updateField("vehicle_rego", value.toUpperCase())}
              placeholder="ABC123"
              required
            />

            <SelectField
              label="Category"
              value={form.category}
              onChange={(value) => updateField("category", value as VehicleCategory)}
              options={vehicleCategories}
              placeholder="Select category"
              required
            />

            <Field
              label="Make"
              value={form.make}
              onChange={(value) => updateField("make", value)}
              placeholder="Toyota"
            />

            <Field
              label="Model"
              value={form.model}
              onChange={(value) => updateField("model", value)}
              placeholder="Hilux"
            />

            <Field
              label="Year"
              value={form.year}
              onChange={(value) => updateField("year", value)}
              placeholder="2023"
            />

            <Field
              label="Style"
              value={form.style}
              onChange={(value) => updateField("style", value)}
              placeholder="Dual cab, prime mover, trailer"
            />

            <Field
              label="VIN / Chassis Number"
              value={form.vin_number}
              onChange={(value) => updateField("vin_number", value.toUpperCase())}
              placeholder="VIN / chassis number"
            />

            <SelectField
              label="Project Allocation"
              value={form.project}
              onChange={(value) => updateField("project", value)}
              options={projectOptions}
              placeholder={loadingOptions ? "Loading projects..." : "Unallocated"}
            />

            <SelectField
              label="Crew Allocation"
              value={form.crew}
              onChange={(value) => updateField("crew", value)}
              options={crewOptions}
              placeholder={loadingOptions ? "Loading crews..." : "Unallocated"}
            />

            <SelectField
              label="Vehicle Status"
              value={form.status}
              onChange={(value) => updateField("status", value as VehicleStatus)}
              options={vehicleStatuses}
              placeholder="Select status"
            />
          </div>
        </Section>

        {(form.status === "Off Hire" ||
          form.status === "Superseded" ||
          form.status === "Inactive") && (
          <Section
            title="Status Details"
            description="Only complete the fields that apply to the selected status."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {form.status === "Off Hire" && (
                <Field
                  label="Off Hire Date"
                  type="date"
                  value={form.off_hire_date}
                  onChange={(value) => updateField("off_hire_date", value)}
                />
              )}

              {form.status === "Superseded" && (
                <Field
                  label="Superseded By"
                  value={form.superseded_by}
                  onChange={(value) => updateField("superseded_by", value)}
                  placeholder="Replacement vehicle ID or rego"
                />
              )}

              {form.status === "Inactive" && (
                <Field
                  label="Inactive Reason"
                  value={form.inactive_reason}
                  onChange={(value) => updateField("inactive_reason", value)}
                  placeholder="Sold, retired, damaged, not required"
                />
              )}
            </div>
          </Section>
        )}

        <Section
          title="Hire Details"
          description="Only complete this section if the vehicle or trailer is hired."
        >
          <div className="space-y-4">
            <CheckField
              label="This vehicle is hired"
              checked={form.hired}
              onChange={(value) => updateField("hired", value)}
            />

            {form.hired && (
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Hired From"
                  value={form.hired_from}
                  onChange={(value) => updateField("hired_from", value)}
                  placeholder="Hire company / supplier"
                />

                <Field
                  label="Hire Term"
                  value={form.hire_term}
                  onChange={(value) => updateField("hire_term", value)}
                  placeholder="Short term, project hire, monthly"
                />
              </div>
            )}
          </div>
        </Section>

        <Section
          title="Registration & Ownership"
          description="Registration, insurance, service and ownership details."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field
              label="Owner"
              value={form.owner}
              onChange={(value) => updateField("owner", value)}
              placeholder="BC Contracting, hire company, supplier"
            />

            <Field
              label="Rego Expiry"
              type="date"
              value={form.rego_expiry}
              onChange={(value) => updateField("rego_expiry", value)}
            />

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
          </div>
        </Section>

        {!isTrailer && (
          <Section
            title="Vehicle Setup"
            description="These fields are mainly for light vehicles and heavy vehicles."
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
                label="Fuel card issued"
                checked={form.fuel_card}
                onChange={(value) => updateField("fuel_card", value)}
              />
            </div>
          </Section>
        )}

        <Section
          title="Documents"
          description="View existing documents, remove incorrect files or attach new ones."
        >
          <div className="space-y-4">
            {documents.length > 0 ? (
              <div className="space-y-2">
                {documents.map((document) => (
                  <div
                    key={document.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <a
                      href={document.file_url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0"
                    >
                      <p className="text-sm font-bold text-slate-800">
                        {clean(document.document_type) || "Document"}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {clean(document.file_name) || "Unnamed file"}
                      </p>
                    </a>

                    <button
                      type="button"
                      onClick={() => void deleteDocument(document)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No documents uploaded yet.
              </div>
            )}

            <div className="space-y-3">
              {documentTypes.map((documentType) => (
                <label
                  key={documentType}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      {documentType}
                    </p>
                    <p className="text-xs text-slate-500">
                      Attach an updated PDF, image or document
                    </p>
                  </div>

                  <span className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-white">
                    <FileUp size={14} />
                    Attach file
                    <input
                      type="file"
                      className="hidden"
                      onChange={(event) => {
                        addPendingDocument(
                          documentType,
                          event.target.files?.[0] ?? null,
                        );
                        event.target.value = "";
                      }}
                    />
                  </span>
                </label>
              ))}
            </div>

            {pendingDocuments.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Pending uploads
                </p>

                <div className="space-y-2">
                  {pendingDocuments.map((document, index) => (
                    <div
                      key={`${document.documentType}-${document.file.name}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-semibold text-slate-800">
                          {document.documentType}
                        </p>
                        <p className="text-xs text-slate-500">
                          {document.file.name}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => removePendingDocument(index)}
                        className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-rose-600"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>

        <Section title="Notes" description="General internal vehicle notes.">
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Notes
            </span>
            <textarea
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              placeholder="Client visibility, restrictions, internal fleet notes..."
              rows={4}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
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
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </PageShell>
  );
}