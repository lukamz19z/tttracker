"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileUp, Save, Wrench } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { PageHeader, PageShell, StatusBadge } from "../../../components";

type Tone = "emerald" | "amber" | "rose" | "blue" | "slate";
type UpdateType = "Service" | "Modification" | "Project Transfer";
type ComplianceFileKey =
  | "risk_assessment"
  | "insurance"
  | "rego"
  | "cranesafe"
  | "plant_specific";

type PlantAsset = {
  id: string;
  asset_id: string | null;
  make: string | null;
  model: string | null;
  plant_type: string | null;
  serial_number: string | null;
  rego: string | null;
  project: string | null;
  crew: string | null;
  asset_status: string | null;
  insurance_expiry: string | null;
  rego_expiry: string | null;
  cranesafe_expiry: string | null;
  last_service_date: string | null;
  last_service_hours: number | null;
  service_interval_hours: number | null;
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

  insurance_expiry: string;
  rego_expiry: string;
  cranesafe_expiry: string;

  service_date: string;
  service_hours: string;
  service_provider: string;
  service_type: string;
  service_interval_hours: string;

  modification_date: string;
  modification_type: string;
  modification_description: string;

  invoice_number: string;
  invoice_cost: string;
  work_completed: string;
  mechanic_recommendations: string;
  follow_up_actions: string;
  invoice_notes: string;
  status_after_update: string;

  new_project: string;
  new_crew: string;
  project_transfer_notes: string;
};

const emptyForm: UpdateForm = {
  update_type: "Service",

  insurance_expiry: "",
  rego_expiry: "",
  cranesafe_expiry: "",

  service_date: "",
  service_hours: "",
  service_provider: "",
  service_type: "",
  service_interval_hours: "",

  modification_date: "",
  modification_type: "",
  modification_description: "",

  invoice_number: "",
  invoice_cost: "",
  work_completed: "",
  mechanic_recommendations: "",
  follow_up_actions: "",
  invoice_notes: "",
  status_after_update: "Available",

  new_project: "",
  new_crew: "",
  project_transfer_notes: "",
};

const serviceTypes = [
  "Scheduled Service",
  "Inspection",
  "Repair",
  "Breakdown",
  "Defect Rectification",
  "CraneSafe / Compliance",
  "Other",
];

const modificationTypes = [
  "Addition",
  "Removal",
  "Replacement",
  "Repair",
  "Upgrade",
  "Compliance Item",
  "Safety Equipment",
  "Other",
];

const statusOptions = [
  "Available",
  "In Use",
  "Under Maintenance",
  "Off Site",
  "Off Hire",
  "Superseded",
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

function toNumber(value: string) {
  const cleaned = value.trim();
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function makeModel(asset: PlantAsset | null) {
  if (!asset) return "N/A";
  return [asset.make, asset.model].map(clean).filter(Boolean).join(" ") || "N/A";
}

function isCrane(asset: PlantAsset | null) {
  return clean(asset?.plant_type).toLowerCase() === "crane";
}

function isTelehandler(asset: PlantAsset | null) {
  return clean(asset?.plant_type).toLowerCase() === "telehandler";
}

function getTone(status: string | null | undefined): Tone {
  const value = clean(status);

  if (value === "Available" || value === "Active") return "emerald";
  if (value === "In Use" || value === "On Hire") return "blue";

  if (
    value === "Off Hire" ||
    value === "Inactive" ||
    value === "Superseded" ||
    value === "Retired"
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

function DocumentUploadField({
  label,
  helper,
  file,
  onChange,
}: {
  label: string;
  helper: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-bold text-slate-800">{label}</p>
        <p className="text-xs text-slate-500">{file ? file.name : helper}</p>
      </div>

      <span className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
        <FileUp size={14} />
        Attach file
        <input
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          onChange={(event) => {
            onChange(event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
        />
      </span>
    </label>
  );
}

export default function UpdatePlantPage() {
  const router = useRouter();
  const params = useParams<{ assetId: string }>();
  const assetId = params.assetId;

  const supabase = useMemo(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment variables.");
    }

    return createClient(supabaseUrl, supabaseAnonKey);
  }, []);

  const [asset, setAsset] = useState<PlantAsset | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [crews, setCrews] = useState<CrewOption[]>([]);
  const [form, setForm] = useState<UpdateForm>(emptyForm);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [complianceFiles, setComplianceFiles] = useState<
    Record<ComplianceFileKey, File | null>
  >({
    risk_assessment: null,
    insurance: null,
    rego: null,
    cranesafe: null,
    plant_specific: null,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const crane = isCrane(asset);
  const telehandler = isTelehandler(asset);

  const loadPageData = useCallback(async () => {
    setLoading(true);

    const [assetResult, projectResult, crewResult] = await Promise.all([
      supabase
        .from("plant_assets")
        .select("*")
        .eq("id", assetId)
        .single<PlantAsset>(),
      supabase.from("projects").select("id, name").order("name", {
        ascending: true,
      }),
      supabase
        .from("crews")
        .select("id, crew_number, crew_name, leading_hand, active")
        .order("crew_number", { ascending: true }),
    ]);

    if (assetResult.error || !assetResult.data) {
      setErrorMessage(assetResult.error?.message || "Plant asset could not be loaded.");
      setAsset(null);
    } else {
      const data = assetResult.data;
      setAsset(data);

      setForm((current) => ({
        ...current,
        insurance_expiry: dateInput(data.insurance_expiry),
        rego_expiry: dateInput(data.rego_expiry),
        cranesafe_expiry: dateInput(data.cranesafe_expiry),
        service_interval_hours:
          data.service_interval_hours === null || data.service_interval_hours === undefined
            ? ""
            : String(data.service_interval_hours),
        status_after_update: clean(data.asset_status) || "Available",
        new_project: clean(data.project),
        new_crew: clean(data.crew),
      }));
    }

    setProjects(projectResult.error ? [] : ((projectResult.data ?? []) as ProjectOption[]));
    setCrews(crewResult.error ? [] : ((crewResult.data ?? []) as CrewOption[]));
    setLoading(false);
  }, [assetId, supabase]);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

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

  function updateField<K extends keyof UpdateForm>(key: K, value: UpdateForm[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateComplianceFile(key: ComplianceFileKey, file: File | null) {
    setComplianceFiles((current) => ({
      ...current,
      [key]: file,
    }));
  }

  async function uploadPlantDocument(documentType: string, file: File | null) {
    if (!file) return null;

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const folder = documentType.replace(/\s+/g, "_").toLowerCase();
    const path = `${assetId}/${folder}/${Date.now()}-${safeName}`;

    const upload = await supabase.storage.from("plant_docs").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (upload.error) throw new Error(upload.error.message);

    const { data } = supabase.storage.from("plant_docs").getPublicUrl(path);

    const insert = await supabase.from("plant_asset_documents").insert({
      plant_asset_id: assetId,
      document_type: documentType,
      file_name: file.name,
      file_url: data.publicUrl,
    });

    if (insert.error) throw new Error(insert.error.message);

    return {
      document_name: file.name,
      document_url: data.publicUrl,
    };
  }

  async function uploadComplianceDocuments() {
    await uploadPlantDocument("Risk Assessment", complianceFiles.risk_assessment);
    await uploadPlantDocument("Insurance Document", complianceFiles.insurance);

    if (crane) {
      await uploadPlantDocument("Registration Document", complianceFiles.rego);
      await uploadPlantDocument("CraneSafe Certificate", complianceFiles.cranesafe);
      await uploadPlantDocument("Crane Documents", complianceFiles.plant_specific);
      return;
    }

    if (telehandler) {
      await uploadPlantDocument("Telehandler Documents", complianceFiles.plant_specific);
      return;
    }

    await uploadPlantDocument("Plant Documents", complianceFiles.plant_specific);
  }

  async function uploadInvoiceDocument() {
    const uploaded = await uploadPlantDocument("Service History", invoiceFile);

    return {
      document_name: uploaded?.document_name ?? null,
      document_url: uploaded?.document_url ?? null,
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!asset) return;

    setSaving(true);
    setErrorMessage("");

    try {
      let serviceDocument: {
        document_name: string | null;
        document_url: string | null;
      } = {
        document_name: null,
        document_url: null,
      };

      if (invoiceFile) {
        serviceDocument = await uploadInvoiceDocument();
      }

      const serviceDate =
        form.update_type === "Modification"
          ? form.modification_date
          : form.service_date;

      const serviceType =
        form.update_type === "Modification"
          ? `Modification - ${clean(form.modification_type) || "General"}`
          : form.update_type === "Project Transfer"
            ? "Project Transfer"
            : clean(form.service_type);

      const workCompleted =
        form.update_type === "Modification"
          ? clean(form.modification_description)
          : form.update_type === "Project Transfer"
            ? clean(form.project_transfer_notes)
            : clean(form.work_completed);

      if (form.update_type !== "Project Transfer") {
        const { error: historyError } = await supabase
          .from("plant_service_history")
          .insert({
            plant_asset_id: assetId,
            service_date: clean(serviceDate) || null,
            hour_meter: form.service_hours ? Number(form.service_hours) : null,
            service_provider: clean(form.service_provider),
            service_type: serviceType,
            next_service_interval_hours: form.service_interval_hours
              ? Number(form.service_interval_hours)
              : null,
            work_completed: workCompleted,
            defects_or_recommendations: clean(form.mechanic_recommendations),
            invoice_number: clean(form.invoice_number),
            invoice_cost: form.invoice_cost ? Number(form.invoice_cost) : null,
            document_url: serviceDocument.document_url,
            document_name: serviceDocument.document_name,
          });

        if (historyError) throw new Error(historyError.message);
      }

      if (form.update_type === "Project Transfer") {
        const { error: transferHistoryError } = await supabase
          .from("plant_service_history")
          .insert({
            plant_asset_id: assetId,
            service_date: new Date().toISOString().slice(0, 10),
            service_type: "Project Transfer",
            work_completed: clean(form.project_transfer_notes),
            defects_or_recommendations: `Transferred to ${clean(form.new_project) || "No project"} / ${
              clean(form.new_crew) || "No crew"
            }`,
          });

        if (transferHistoryError) throw new Error(transferHistoryError.message);
      }

      const assetUpdatePayload = {
        insurance_expiry: clean(form.insurance_expiry) || null,
        rego_expiry: crane ? clean(form.rego_expiry) || null : null,
        cranesafe_expiry: crane ? clean(form.cranesafe_expiry) || null : null,

        last_service_date:
          form.update_type === "Service" && form.service_date
            ? form.service_date
            : asset.last_service_date,
        last_service_hours:
          form.update_type === "Service" && form.service_hours
            ? Number(form.service_hours)
            : asset.last_service_hours,
        service_interval_hours:
          form.update_type === "Service" && form.service_interval_hours
            ? Number(form.service_interval_hours)
            : asset.service_interval_hours,

        asset_status: clean(form.status_after_update) || asset.asset_status,

        project:
          form.update_type === "Project Transfer"
            ? clean(form.new_project) || null
            : asset.project,
        crew:
          form.update_type === "Project Transfer"
            ? clean(form.new_crew) || null
            : asset.crew,

        updated_at: new Date().toISOString(),
      };

      const { error: assetError } = await supabase
        .from("plant_assets")
        .update(assetUpdatePayload)
        .eq("id", assetId);

      if (assetError) throw new Error(assetError.message);

      await uploadComplianceDocuments();

      router.push("/assets/plant");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save plant asset update.",
      );
      setSaving(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Plant Update"
        title={loading ? "Update Asset" : `Update ${display(asset?.asset_id)}`}
        description="Record services, modifications, compliance proof or project transfers for cranes and telehandlers."
        actions={
          <Link
            href="/assets/plant"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Back to Plant
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
            <h2 className="text-base font-bold text-slate-950">Asset Summary</h2>
            <p className="text-sm text-slate-600">
              Current plant information before recording the update.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryItem label="Asset ID" value={display(asset?.asset_id)} />
          <SummaryItem label="Plant Type" value={display(asset?.plant_type)} />
          <SummaryItem label="Make & Model" value={makeModel(asset)} />
          <SummaryItem label="Serial Number" value={display(asset?.serial_number)} />
          {!telehandler ? <SummaryItem label="Rego" value={display(asset?.rego)} /> : null}
          <SummaryItem label="Project" value={display(asset?.project)} />
          <SummaryItem label="Crew" value={display(asset?.crew)} />
          <SummaryItem
            label="Current Status"
            value={
              <StatusBadge
                label={display(asset?.asset_status)}
                tone={getTone(asset?.asset_status)}
              />
            }
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
                      ? "Service, inspection, hours and invoice details."
                      : type === "Modification"
                        ? "Changes, additions, repairs or fitted items."
                        : "Project movement and crew allocation history."}
                  </p>
                </button>
              ),
            )}
          </div>
        </Section>

        <Section
          title="Current Expiry / Compliance Dates"
          description="Update expiry dates and attach proof. Telehandlers do not show rego. Cranes show CraneSafe."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field
              label="Insurance Expiry"
              type="date"
              value={form.insurance_expiry}
              onChange={(value) => updateField("insurance_expiry", value)}
            />

            {crane ? (
              <>
                <Field
                  label="Registration Expiry"
                  type="date"
                  value={form.rego_expiry}
                  onChange={(value) => updateField("rego_expiry", value)}
                />

                <Field
                  label="CraneSafe Expiry"
                  type="date"
                  value={form.cranesafe_expiry}
                  onChange={(value) => updateField("cranesafe_expiry", value)}
                />
              </>
            ) : null}

            <SelectField
              label="Status After Update"
              value={form.status_after_update}
              onChange={(value) => updateField("status_after_update", value)}
              options={statusOptions}
            />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <DocumentUploadField
              label="Risk Assessment"
              helper="Attach current plant risk assessment."
              file={complianceFiles.risk_assessment}
              onChange={(file) => updateComplianceFile("risk_assessment", file)}
            />

            <DocumentUploadField
              label="Insurance Document"
              helper="Attach current insurance document."
              file={complianceFiles.insurance}
              onChange={(file) => updateComplianceFile("insurance", file)}
            />

            {crane ? (
              <>
                <DocumentUploadField
                  label="Registration Document"
                  helper="Attach current registration document."
                  file={complianceFiles.rego}
                  onChange={(file) => updateComplianceFile("rego", file)}
                />

                <DocumentUploadField
                  label="CraneSafe Certificate"
                  helper="Attach current CraneSafe certificate."
                  file={complianceFiles.cranesafe}
                  onChange={(file) => updateComplianceFile("cranesafe", file)}
                />
              </>
            ) : null}

            <DocumentUploadField
              label={crane ? "Crane Documents" : telehandler ? "Telehandler Documents" : "Plant Documents"}
              helper="Attach load charts, manuals, inspection records or supporting documents."
              file={complianceFiles.plant_specific}
              onChange={(file) => updateComplianceFile("plant_specific", file)}
            />
          </div>
        </Section>

        {form.update_type === "Service" ? (
          <Section
            title="Service / Inspection Details"
            description="Record the work completed, hours, invoice and recommendations."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field
                label="Service Date"
                type="date"
                value={form.service_date}
                onChange={(value) => updateField("service_date", value)}
                required
              />

              <Field
                label="Hour Meter"
                value={form.service_hours}
                onChange={(value) => updateField("service_hours", value)}
                placeholder="Example: 1250"
              />

              <SelectField
                label="Service Type"
                value={form.service_type}
                onChange={(value) => updateField("service_type", value)}
                options={serviceTypes}
                required
              />

              <Field
                label="Service Provider"
                value={form.service_provider}
                onChange={(value) => updateField("service_provider", value)}
                placeholder="Supplier / mechanic"
              />

              <Field
                label="Next Service Interval Hours"
                value={form.service_interval_hours}
                onChange={(value) => updateField("service_interval_hours", value)}
                placeholder="Example: 250"
              />

              <Field
                label="Invoice Number"
                value={form.invoice_number}
                onChange={(value) => updateField("invoice_number", value)}
              />

              <Field
                label="Invoice Cost"
                value={form.invoice_cost}
                onChange={(value) => updateField("invoice_cost", value)}
                placeholder="Example: 1250.00"
              />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <TextAreaField
                label="Work Completed"
                value={form.work_completed}
                onChange={(value) => updateField("work_completed", value)}
                required
              />

              <TextAreaField
                label="Mechanic Recommendations / Defects"
                value={form.mechanic_recommendations}
                onChange={(value) => updateField("mechanic_recommendations", value)}
              />

              <TextAreaField
                label="Follow Up Actions"
                value={form.follow_up_actions}
                onChange={(value) => updateField("follow_up_actions", value)}
              />

              <TextAreaField
                label="Invoice Notes"
                value={form.invoice_notes}
                onChange={(value) => updateField("invoice_notes", value)}
              />
            </div>

            <div className="mt-4">
              <DocumentUploadField
                label="Invoice / Service Document"
                helper="Attach invoice, service report or inspection document."
                file={invoiceFile}
                onChange={setInvoiceFile}
              />
            </div>
          </Section>
        ) : null}

        {form.update_type === "Modification" ? (
          <Section
            title="Modification Details"
            description="Record modifications, repairs, fitted equipment or changes made to the plant."
          >
            <div className="grid gap-4 md:grid-cols-3">
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
                label="Supplier / Completed By"
                value={form.service_provider}
                onChange={(value) => updateField("service_provider", value)}
              />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <TextAreaField
                label="Modification Description"
                value={form.modification_description}
                onChange={(value) => updateField("modification_description", value)}
                required
              />

              <TextAreaField
                label="Follow Up Actions"
                value={form.follow_up_actions}
                onChange={(value) => updateField("follow_up_actions", value)}
              />
            </div>

            <div className="mt-4">
              <DocumentUploadField
                label="Modification / Supporting Document"
                helper="Attach invoice, report, photo or supporting document."
                file={invoiceFile}
                onChange={setInvoiceFile}
              />
            </div>
          </Section>
        ) : null}

        {form.update_type === "Project Transfer" ? (
          <Section
            title="Project Transfer"
            description="Move this plant item to a project or crew and record the reason."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="New Project"
                value={form.new_project}
                onChange={(value) => updateField("new_project", value)}
                options={projectOptions}
              />

              <SelectField
                label="New Crew"
                value={form.new_crew}
                onChange={(value) => updateField("new_crew", value)}
                options={crewOptions}
              />
            </div>

            <div className="mt-4">
              <TextAreaField
                label="Transfer Notes"
                value={form.project_transfer_notes}
                onChange={(value) => updateField("project_transfer_notes", value)}
                placeholder="Example: moved from Lobs Hole to Maragle for next work front."
                required
              />
            </div>
          </Section>
        ) : null}

        <div className="flex justify-end gap-3">
          <Link
            href="/assets/plant"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? "Saving..." : "Save Update"}
          </button>
        </div>
      </form>
    </PageShell>
  );
}