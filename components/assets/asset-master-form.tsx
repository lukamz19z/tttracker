"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  FilePlus2,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { createSupabaseBrowser } from "@/lib/supabase";
import type {
  AssetDocumentTypeRow,
  AssetRecord,
  AssetType,
} from "@/lib/assets/types";

type BootstrapPayload = {
  vehicles: AssetRecord[];
  plant: AssetRecord[];
  projects: Array<{ id: string; name: string; project_number?: string | null; status?: string | null }>;
  crews: Array<{
    id: string;
    crew_number: string | null;
    crew_name: string | null;
    leading_hand: string | null;
    active: boolean | null;
  }>;
  documentTypes: AssetDocumentTypeRow[];
  canManage: boolean;
  error?: string;
};

type PendingDocument = {
  id: string;
  documentTypeId: string;
  file: File | null;
  documentDate: string;
  expiryDate: string;
  supplier: string;
  invoiceNumber: string;
  amountIncGst: string;
};

type FormState = Record<string, string | boolean>;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function dateInput(value: unknown) {
  return clean(value).slice(0, 10);
}

function bool(value: unknown) {
  return Boolean(value);
}

function numberInput(value: unknown) {
  if (value === null || value === undefined || clean(value) === "") return "";
  return String(value);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const VEHICLE_EMPTY: FormState = {
  vehicle_id: "",
  vehicle_rego: "",
  make: "",
  model: "",
  category: "Light Vehicle",
  crew: "",
  project: "",
  project_onboard_date: "",
  company_onboard_date: "",
  status: "Available",
  year: "",
  style: "",
  owner: "",
  vin_number: "",
  current_odometer_km: "",
  last_service: "",
  service_interval_km: "",
  next_service_due: "",
  next_service_km: "",
  next_inspection_due: "",
  rego_expiry: "",
  insurance_expiry: "",
  risk_assessment_date: "",
  hired: false,
  hired_from: "",
  hire_term: "",
  off_hire_date: "",
  superseded_by: "",
  inactive_reason: "",
  spare_key_provided: false,
  spare_key_location: "",
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
  notes: "",
};

const PLANT_EMPTY: FormState = {
  asset_id: "",
  make: "",
  model: "",
  plant_type: "Crane",
  serial_number: "",
  rego: "",
  crew: "",
  project: "",
  project_onboard_date: "",
  asset_status: "Available",
  current_engine_hours: "",
  last_service_date: "",
  last_service_hours: "",
  service_interval_hours: "",
  next_service_due: "",
  next_service_hours: "",
  next_inspection_due: "",
  insurance_expiry: "",
  rego_expiry: "",
  cranesafe_expiry: "",
  ten_year_inspection_due: "",
  risk_assessment_date: "",
  hired: false,
  hired_from: "",
  hire_term: "",
  off_hire_date: "",
  superseded_by: "",
  inactive_reason: "",
  risk_assessment: false,
  operators_manual: false,
  load_charts: false,
  logbook: false,
  fire_extinguisher: false,
  first_aid_kit: false,
  spill_kit: false,
  notes: "",
};

function assetToForm(assetType: AssetType, asset: AssetRecord): FormState {
  if (assetType === "vehicle") {
    return {
      ...VEHICLE_EMPTY,
      vehicle_id: clean(asset.vehicle_id),
      vehicle_rego: clean(asset.vehicle_rego),
      make: clean(asset.make),
      model: clean(asset.model),
      category: clean(asset.category) || "Light Vehicle",
      crew: clean(asset.crew),
      project: clean(asset.project),
      company_onboard_date: dateInput(asset.company_onboard_date),
      status: clean(asset.status) || "Available",
      year: numberInput(asset.year),
      style: clean(asset.style),
      owner: clean(asset.owner),
      vin_number: clean(asset.vin_number),
      current_odometer_km: numberInput(asset.current_odometer_km),
      last_service: dateInput(asset.last_service),
      service_interval_km: numberInput(asset.service_interval_km),
      next_service_due: dateInput(asset.next_service_due),
      next_service_km: numberInput(asset.next_service_km),
      next_inspection_due: dateInput(asset.next_inspection_due),
      rego_expiry: dateInput(asset.rego_expiry),
      insurance_expiry: dateInput(asset.insurance_expiry),
      risk_assessment_date: dateInput(asset.risk_assessment_date),
      hired: bool(asset.hired),
      hired_from: clean(asset.hired_from),
      hire_term: clean(asset.hire_term),
      off_hire_date: dateInput(asset.off_hire_date),
      superseded_by: clean(asset.superseded_by),
      inactive_reason: clean(asset.inactive_reason),
      spare_key_provided: bool(asset.spare_key_provided),
      spare_key_location: clean(asset.spare_key_location),
      ehub: bool(asset.ehub),
      dashcam: bool(asset.dashcam),
      alert_button: bool(asset.alert_button),
      fuel_card: bool(asset.fuel_card),
      reverse_squawker: bool(asset.reverse_squawker),
      uhf_radio: bool(asset.uhf_radio),
      fire_extinguisher: bool(asset.fire_extinguisher),
      first_aid_kit: bool(asset.first_aid_kit),
      snake_bite_kit: bool(asset.snake_bite_kit),
      wheel_nut_indicators: bool(asset.wheel_nut_indicators),
      wheel_chocks: bool(asset.wheel_chocks),
      shovel: bool(asset.shovel),
      knapsack: bool(asset.knapsack),
      notes: clean(asset.notes),
    };
  }

  return {
    ...PLANT_EMPTY,
    asset_id: clean(asset.asset_id),
    make: clean(asset.make),
    model: clean(asset.model),
    plant_type: clean(asset.plant_type) || "Crane",
    serial_number: clean(asset.serial_number),
    rego: clean(asset.rego),
    crew: clean(asset.crew),
    project: clean(asset.project),
    asset_status: clean(asset.asset_status) || "Available",
    current_engine_hours: numberInput(asset.current_engine_hours),
    last_service_date: dateInput(asset.last_service_date),
    last_service_hours: numberInput(asset.last_service_hours),
    service_interval_hours: numberInput(asset.service_interval_hours),
    next_service_due: dateInput(asset.next_service_due),
    next_service_hours: numberInput(asset.next_service_hours),
    next_inspection_due: dateInput(asset.next_inspection_due),
    insurance_expiry: dateInput(asset.insurance_expiry),
    rego_expiry: dateInput(asset.rego_expiry),
    cranesafe_expiry: dateInput(asset.cranesafe_expiry),
    ten_year_inspection_due: dateInput(asset.ten_year_inspection_due),
    risk_assessment_date: dateInput(asset.risk_assessment_date),
    hired: bool(asset.hired),
    hired_from: clean(asset.hired_from),
    hire_term: clean(asset.hire_term),
    off_hire_date: dateInput(asset.off_hire_date),
    superseded_by: clean(asset.superseded_by),
    inactive_reason: clean(asset.inactive_reason),
    risk_assessment: bool(asset.risk_assessment),
    operators_manual: bool(asset.operators_manual),
    load_charts: bool(asset.load_charts),
    logbook: bool(asset.logbook),
    fire_extinguisher: bool(asset.fire_extinguisher),
    first_aid_kit: bool(asset.first_aid_kit),
    spill_kit: bool(asset.spill_kit),
    notes: clean(asset.notes),
  };
}

function nullableString(value: unknown) {
  const result = clean(value);
  return result || null;
}

function nullableNumber(value: unknown) {
  const raw = clean(value);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function formToPayload(assetType: AssetType, form: FormState) {
  if (assetType === "vehicle") {
    const trailer = clean(form.category).toLowerCase() === "trailer";
    const status = clean(form.status) || "Available";

    return {
      vehicle_id: nullableString(form.vehicle_id),
      vehicle_rego: nullableString(form.vehicle_rego)?.toUpperCase() ?? null,
      make: nullableString(form.make),
      model: nullableString(form.model),
      category: nullableString(form.category),
      crew: nullableString(form.crew),
      project: nullableString(form.project),
      company_onboard_date: nullableString(form.company_onboard_date),
      status,
      year: nullableNumber(form.year),
      style: trailer ? null : nullableString(form.style),
      owner: nullableString(form.owner),
      vin_number: nullableString(form.vin_number)?.toUpperCase() ?? null,
      current_odometer_km: trailer ? null : nullableNumber(form.current_odometer_km),
      last_service: trailer ? null : nullableString(form.last_service),
      service_interval_km: trailer ? null : nullableNumber(form.service_interval_km),
      next_service_due: trailer ? null : nullableString(form.next_service_due),
      next_service_km: trailer ? null : nullableNumber(form.next_service_km),
      next_inspection_due: nullableString(form.next_inspection_due),
      rego_expiry: nullableString(form.rego_expiry),
      insurance_expiry: trailer ? null : nullableString(form.insurance_expiry),
      risk_assessment_date: nullableString(form.risk_assessment_date),
      hired: Boolean(form.hired),
      hired_from: form.hired ? nullableString(form.hired_from) : null,
      hire_term: form.hired ? nullableString(form.hire_term) : null,
      off_hire_date: status === "Off Hire" ? nullableString(form.off_hire_date) : null,
      superseded_by: status === "Superseded" ? nullableString(form.superseded_by) : null,
      inactive_reason: status === "Inactive" ? nullableString(form.inactive_reason) : null,
      spare_key_provided: Boolean(form.spare_key_provided),
      spare_key_location: form.spare_key_provided
        ? nullableString(form.spare_key_location) || "Site Office"
        : null,
      ehub: trailer ? false : Boolean(form.ehub),
      dashcam: trailer ? false : Boolean(form.dashcam),
      alert_button: trailer ? false : Boolean(form.alert_button),
      fuel_card: trailer ? false : Boolean(form.fuel_card),
      reverse_squawker: trailer ? false : Boolean(form.reverse_squawker),
      uhf_radio: trailer ? false : Boolean(form.uhf_radio),
      fire_extinguisher: trailer ? false : Boolean(form.fire_extinguisher),
      first_aid_kit: trailer ? false : Boolean(form.first_aid_kit),
      snake_bite_kit: trailer ? false : Boolean(form.snake_bite_kit),
      wheel_nut_indicators: trailer ? false : Boolean(form.wheel_nut_indicators),
      wheel_chocks: trailer ? false : Boolean(form.wheel_chocks),
      shovel: trailer ? false : Boolean(form.shovel),
      knapsack: trailer ? false : Boolean(form.knapsack),
      notes: nullableString(form.notes),
    };
  }

  const status = clean(form.asset_status) || "Available";
  const plantType = clean(form.plant_type);
  const crane = plantType.toLowerCase() === "crane";

  return {
    asset_id: nullableString(form.asset_id),
    make: nullableString(form.make),
    model: nullableString(form.model),
    plant_type: nullableString(form.plant_type),
    serial_number: nullableString(form.serial_number),
    rego: nullableString(form.rego)?.toUpperCase() ?? null,
    crew: nullableString(form.crew),
    project: nullableString(form.project),
    insurance_expiry: nullableString(form.insurance_expiry),
    rego_expiry: nullableString(form.rego_expiry),
    cranesafe_expiry: crane ? nullableString(form.cranesafe_expiry) : null,
    ten_year_inspection_due: crane ? nullableString(form.ten_year_inspection_due) : null,
    risk_assessment_date: nullableString(form.risk_assessment_date),
    last_service_date: nullableString(form.last_service_date),
    last_service_hours: nullableNumber(form.last_service_hours),
    service_interval_hours: nullableNumber(form.service_interval_hours),
    next_service_due: nullableString(form.next_service_due),
    next_service_hours: nullableNumber(form.next_service_hours),
    next_inspection_due: nullableString(form.next_inspection_due),
    current_engine_hours: nullableNumber(form.current_engine_hours),
    hired: Boolean(form.hired),
    hired_from: form.hired ? nullableString(form.hired_from) : null,
    hire_term: form.hired ? nullableString(form.hire_term) : null,
    asset_status: status,
    off_hire_date: status === "Off Hire" ? nullableString(form.off_hire_date) : null,
    superseded_by: status === "Superseded" ? nullableString(form.superseded_by) : null,
    inactive_reason:
      ["Off Hire", "Superseded", "Inactive"].includes(status)
        ? nullableString(form.inactive_reason)
        : null,
    risk_assessment: Boolean(form.risk_assessment),
    operators_manual: Boolean(form.operators_manual),
    load_charts: crane ? Boolean(form.load_charts) : false,
    logbook: Boolean(form.logbook),
    fire_extinguisher: Boolean(form.fire_extinguisher),
    first_aid_kit: Boolean(form.first_aid_kit),
    spill_kit: Boolean(form.spill_kit),
    notes: nullableString(form.notes),
  };
}

export function AssetMasterForm({
  assetType,
  mode,
  assetId,
}: {
  assetType: AssetType;
  mode: "create" | "edit";
  assetId?: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [form, setForm] = useState<FormState>(
    assetType === "vehicle" ? VEHICLE_EMPTY : PLANT_EMPTY,
  );
  const [documents, setDocuments] = useState<PendingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createdHref, setCreatedHref] = useState("");

  const apiFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) throw new Error("Your session has expired. Sign in again.");

      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${session.access_token}`);
      if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      return fetch(url, { ...init, headers, cache: "no-store" });
    },
    [supabase],
  );

  const fetchBootstrap = useCallback(async () => {
    const response = await apiFetch("/api/assets/bootstrap");
    const payload = (await response.json()) as BootstrapPayload;
    if (!response.ok) throw new Error(payload.error || "Asset setup could not be loaded.");
    if (!payload.canManage) throw new Error("Administrator or Asset Manager access is required.");
    return payload;
  }, [apiFetch]);

  useEffect(() => {
    let cancelled = false;

    void fetchBootstrap()
      .then((payload) => {
        if (cancelled) return;
        setBootstrap(payload);

        if (mode === "edit") {
          const rows = assetType === "vehicle" ? payload.vehicles : payload.plant;
          const asset = rows.find((row) => row.id === assetId);
          if (!asset) throw new Error("Asset could not be found.");
          setForm(assetToForm(assetType, asset));
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Asset setup could not be loaded.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [assetId, assetType, fetchBootstrap, mode]);

  const projects = useMemo(
    () => (bootstrap?.projects ?? []).map((project) => clean(project.name)).filter(Boolean),
    [bootstrap],
  );

  const crews = useMemo(
    () =>
      (bootstrap?.crews ?? [])
        .filter((crew) => crew.active !== false)
        .map((crew) => [crew.crew_number, crew.crew_name, crew.leading_hand].map(clean).filter(Boolean).join(" - "))
        .filter(Boolean),
    [bootstrap],
  );

  const documentTypes = useMemo(
    () =>
      (bootstrap?.documentTypes ?? []).filter(
        (row) => row.applies_to === "both" || row.applies_to === assetType,
      ),
    [assetType, bootstrap],
  );

  const isTrailer = assetType === "vehicle" && clean(form.category).toLowerCase() === "trailer";
  const isCrane = assetType === "plant" && clean(form.plant_type).toLowerCase() === "crane";

  function update(key: string, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function addDocument() {
    setDocuments((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        documentTypeId: documentTypes[0]?.id ?? "",
        file: null,
        documentDate: today(),
        expiryDate: "",
        supplier: "",
        invoiceNumber: "",
        amountIncGst: "",
      },
    ]);
  }

  function updateDocument(id: string, patch: Partial<PendingDocument>) {
    setDocuments((current) =>
      current.map((document) => (document.id === id ? { ...document, ...patch } : document)),
    );
  }

  async function uploadInitialDocuments(createdAssetId: string) {
    const failures: string[] = [];

    for (const document of documents) {
      if (!document.file || !document.documentTypeId) continue;

      const formData = new FormData();
      formData.set("file", document.file);
      formData.set("documentTypeId", document.documentTypeId);
      formData.set("documentDate", document.documentDate);
      formData.set("expiryDate", document.expiryDate);
      formData.set("supplier", document.supplier);
      formData.set("invoiceNumber", document.invoiceNumber);
      formData.set("amountIncGst", document.amountIncGst);
      formData.set("createFinanceRecord", "false");

      try {
        const response = await apiFetch(
          `/api/assets/${assetType}/${createdAssetId}/documents`,
          { method: "POST", body: formData },
        );
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(payload.error || "Document upload failed.");
      } catch (uploadError) {
        failures.push(
          `${document.file.name}: ${uploadError instanceof Error ? uploadError.message : "upload failed"}`,
        );
      }
    }

    return failures;
  }

  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    setCreatedHref("");

    try {
      const assetPayload = formToPayload(assetType, form);
      const endpoint =
        mode === "create"
          ? `/api/assets/${assetType}`
          : `/api/assets/${assetType}/${assetId}`;

      const response = await apiFetch(endpoint, {
        method: mode === "create" ? "POST" : "PATCH",
        body: JSON.stringify({
          asset: assetPayload,
          projectOnboardDate: clean(form.project_onboard_date) || null,
        }),
      });

      const payload = (await response.json()) as {
        asset?: AssetRecord;
        href?: string;
        sharePointWarning?: string | null;
        error?: string;
      };

      if (!response.ok || !payload.asset) {
        throw new Error(payload.error || "Asset could not be saved.");
      }

      const href =
        payload.href ||
        (assetType === "vehicle"
          ? `/assets/vehicles/${payload.asset.id}`
          : `/assets/plant/${payload.asset.id}`);

      if (mode === "create") {
        const uploadFailures = await uploadInitialDocuments(payload.asset.id);
        const messages = [payload.sharePointWarning, ...uploadFailures].filter(Boolean);

        if (messages.length > 0) {
          setNotice(
            `The asset was created. Some SharePoint work still needs attention: ${messages.join(" · ")}`,
          );
          setCreatedHref(href);
          return;
        }
      }

      if (payload.sharePointWarning) {
        setNotice(payload.sharePointWarning);
        setCreatedHref(href);
        return;
      }

      router.push(href);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Asset could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-[65vh] items-center justify-center"><Loader2 className="animate-spin text-slate-400" size={30} /></div>;
  }

  const registerHref = assetType === "vehicle" ? "/assets/vehicles" : "/assets/plant";
  const title = `${mode === "create" ? "Add" : "Edit"} ${assetType === "vehicle" ? "Vehicle" : "Plant"}`;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link href={registerHref} className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900">
              <ArrowLeft size={16} /> Back to {assetType === "vehicle" ? "Vehicles" : "Plant"}
            </Link>
            <div className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-slate-400">Asset Master Record</div>
            <h1 className="mt-1 text-3xl font-black text-slate-950">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Asset metadata stays in TTTracker. Every uploaded file is stored in the configured SharePoint Assets library; Supabase Storage is not used by this workflow.
            </p>
          </div>
          {mode === "edit" && assetId ? (
            <Link href={assetType === "vehicle" ? `/assets/vehicles/${assetId}` : `/assets/plant/${assetId}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700">
              <ExternalLink size={16} /> View Asset & Attachments
            </Link>
          ) : null}
        </div>
      </section>

      {error ? <Message tone="error">{error}</Message> : null}
      {notice ? (
        <Message tone="warning">
          <div>{notice}</div>
          {createdHref ? <Link href={createdHref} className="mt-2 inline-flex font-black underline">Open created asset</Link> : null}
        </Message>
      ) : null}

      {assetType === "vehicle" ? (
        <VehicleFields form={form} update={update} projects={projects} crews={crews} isTrailer={isTrailer} />
      ) : (
        <PlantFields form={form} update={update} projects={projects} crews={crews} isCrane={isCrane} />
      )}

      {mode === "create" ? (
        <Section title="Initial Documents" description="Optional. Add the documents you already have. They are uploaded through the controlled SharePoint document service after the Asset record is created.">
          <div className="space-y-4">
            {documents.map((document) => {
              const type = documentTypes.find((row) => row.id === document.documentTypeId) ?? null;
              return (
                <div key={document.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="grid gap-4 lg:grid-cols-3">
                    <Field label="Document Type">
                      <select value={document.documentTypeId} onChange={(event) => updateDocument(document.id, { documentTypeId: event.target.value })} className="input">
                        <option value="">Select type</option>
                        {documentTypes.map((row) => <option key={row.id} value={row.id}>{row.name} ({row.code})</option>)}
                      </select>
                    </Field>
                    <Field label="File">
                      <input type="file" className="input" onChange={(event) => updateDocument(document.id, { file: event.target.files?.[0] ?? null })} />
                    </Field>
                    <div className="flex items-end">
                      <button type="button" onClick={() => setDocuments((current) => current.filter((row) => row.id !== document.id))} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-sm font-black text-rose-700">
                        <Trash2 size={15} /> Remove
                      </button>
                    </div>
                    {type?.date_requirement === "document_date" || type?.date_requirement === "document_and_expiry" ? (
                      <TextInput label="Document / Completion Date" type="date" value={document.documentDate} onChange={(value) => updateDocument(document.id, { documentDate: value })} />
                    ) : null}
                    {type?.date_requirement === "expiry_date" || type?.date_requirement === "document_and_expiry" ? (
                      <TextInput label="Expiry / Due Date" type="date" value={document.expiryDate} onChange={(value) => updateDocument(document.id, { expiryDate: value })} />
                    ) : null}
                    {type?.requires_supplier || type?.category === "invoice" ? <TextInput label="Supplier" value={document.supplier} onChange={(value) => updateDocument(document.id, { supplier: value })} /> : null}
                    {type?.requires_invoice_number || type?.category === "invoice" ? <TextInput label="Invoice Number" value={document.invoiceNumber} onChange={(value) => updateDocument(document.id, { invoiceNumber: value })} /> : null}
                    {type?.requires_cost || type?.category === "invoice" ? <TextInput label="Amount Inc GST" type="number" value={document.amountIncGst} onChange={(value) => updateDocument(document.id, { amountIncGst: value })} /> : null}
                  </div>
                </div>
              );
            })}
            <button type="button" onClick={addDocument} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700">
              <FilePlus2 size={16} /> Add Initial Document
            </button>
          </div>
        </Section>
      ) : (
        <Section title="Attachments" description="Attachments are managed on the Asset detail page so every file uses the same SharePoint naming, current/superseded and history rules.">
          <Link href={assetType === "vehicle" ? `/assets/vehicles/${assetId}` : `/assets/plant/${assetId}`} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">
            <ExternalLink size={16} /> Open Asset Documents
          </Link>
        </Section>
      )}

      <div className="sticky bottom-4 z-20 flex justify-end rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur">
        <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? "Saving..." : mode === "create" ? `Save ${assetType === "vehicle" ? "Vehicle" : "Plant"}` : "Save Changes"}
        </button>
      </div>

      <style jsx global>{`
        .input { width:100%; border-radius:.75rem; border:1px solid rgb(226 232 240); background:white; padding:.625rem .75rem; font-size:.875rem; outline:none; }
        .input:focus { box-shadow:0 0 0 2px rgb(219 234 254); }
      `}</style>
    </div>
  );
}

function VehicleFields({ form, update, projects, crews, isTrailer }: { form: FormState; update: (key: string, value: string | boolean) => void; projects: string[]; crews: string[]; isTrailer: boolean }) {
  return <>
    <Section title="Vehicle Details" description="Permanent register information and current allocation.">
      <Grid>
        <TextInput label="Vehicle ID" required value={clean(form.vehicle_id)} onChange={(v) => update("vehicle_id", v)} />
        <TextInput label="Registration" required value={clean(form.vehicle_rego)} onChange={(v) => update("vehicle_rego", v.toUpperCase())} />
        <SelectInput label="Category" value={clean(form.category)} onChange={(v) => update("category", v)} options={["Light Vehicle", "Heavy Vehicle", "Trailer"]} />
        <TextInput label="Make" value={clean(form.make)} onChange={(v) => update("make", v)} />
        <TextInput label="Model" value={clean(form.model)} onChange={(v) => update("model", v)} />
        <TextInput label="Year" type="number" value={clean(form.year)} onChange={(v) => update("year", v)} />
        {!isTrailer ? <TextInput label="Style" value={clean(form.style)} onChange={(v) => update("style", v)} /> : null}
        <TextInput label="VIN / Chassis" value={clean(form.vin_number)} onChange={(v) => update("vin_number", v.toUpperCase())} />
        <TextInput label="Owner" value={clean(form.owner)} onChange={(v) => update("owner", v)} />
        <TextInput label="Company Onboard Date" type="date" value={clean(form.company_onboard_date)} onChange={(v) => update("company_onboard_date", v)} />
        <SelectInput label="Status" value={clean(form.status)} onChange={(v) => update("status", v)} options={["Available", "In Use", "Off Hire", "Superseded", "Inactive", "Retired"]} />
        <SelectInput label="Project" value={clean(form.project)} onChange={(v) => update("project", v)} options={projects} allowBlank />
        <SelectInput label="Crew" value={clean(form.crew)} onChange={(v) => update("crew", v)} options={crews} allowBlank />
        <TextInput label="Project Onboard Date" type="date" value={clean(form.project_onboard_date)} onChange={(v) => update("project_onboard_date", v)} />
      </Grid>
    </Section>

    {!isTrailer ? <Section title="Service & Inspection" description="Structured due fields used by the Asset dashboard and service workflow.">
      <Grid>
        <TextInput label="Current Odometer (km)" type="number" value={clean(form.current_odometer_km)} onChange={(v) => update("current_odometer_km", v)} />
        <TextInput label="Last Service" type="date" value={clean(form.last_service)} onChange={(v) => update("last_service", v)} />
        <TextInput label="Service Interval (km)" type="number" value={clean(form.service_interval_km)} onChange={(v) => update("service_interval_km", v)} />
        <TextInput label="Next Service Date" type="date" value={clean(form.next_service_due)} onChange={(v) => update("next_service_due", v)} />
        <TextInput label="Next Service KM" type="number" value={clean(form.next_service_km)} onChange={(v) => update("next_service_km", v)} />
        <TextInput label="Next Inspection" type="date" value={clean(form.next_inspection_due)} onChange={(v) => update("next_inspection_due", v)} />
      </Grid>
    </Section> : null}

    <Section title="Compliance" description="Dates are mirrored by controlled SharePoint documents when those document types are uploaded.">
      <Grid>
        <TextInput label="Rego Expiry" type="date" value={clean(form.rego_expiry)} onChange={(v) => update("rego_expiry", v)} />
        {!isTrailer ? <TextInput label="Insurance Expiry" type="date" value={clean(form.insurance_expiry)} onChange={(v) => update("insurance_expiry", v)} /> : null}
        <TextInput label="Risk Assessment Date" type="date" value={clean(form.risk_assessment_date)} onChange={(v) => update("risk_assessment_date", v)} />
      </Grid>
    </Section>

    <Section title="Hire, Keys & Setup" description="Operational setup fields retained on the Vehicle register.">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CheckInput label="Hired Asset" checked={Boolean(form.hired)} onChange={(v) => update("hired", v)} />
          <CheckInput label="Spare Key Provided" checked={Boolean(form.spare_key_provided)} onChange={(v) => update("spare_key_provided", v)} />
          {!isTrailer ? <><CheckInput label="eHub" checked={Boolean(form.ehub)} onChange={(v) => update("ehub", v)} /><CheckInput label="Dashcam" checked={Boolean(form.dashcam)} onChange={(v) => update("dashcam", v)} /><CheckInput label="Alert Button" checked={Boolean(form.alert_button)} onChange={(v) => update("alert_button", v)} /><CheckInput label="Fuel Card" checked={Boolean(form.fuel_card)} onChange={(v) => update("fuel_card", v)} /><CheckInput label="Reverse Squawker" checked={Boolean(form.reverse_squawker)} onChange={(v) => update("reverse_squawker", v)} /><CheckInput label="UHF Radio" checked={Boolean(form.uhf_radio)} onChange={(v) => update("uhf_radio", v)} /><CheckInput label="Fire Extinguisher" checked={Boolean(form.fire_extinguisher)} onChange={(v) => update("fire_extinguisher", v)} /><CheckInput label="First Aid Kit" checked={Boolean(form.first_aid_kit)} onChange={(v) => update("first_aid_kit", v)} /><CheckInput label="Snake Bite Kit" checked={Boolean(form.snake_bite_kit)} onChange={(v) => update("snake_bite_kit", v)} /><CheckInput label="Wheel Nut Indicators" checked={Boolean(form.wheel_nut_indicators)} onChange={(v) => update("wheel_nut_indicators", v)} /><CheckInput label="Wheel Chocks" checked={Boolean(form.wheel_chocks)} onChange={(v) => update("wheel_chocks", v)} /><CheckInput label="Shovel" checked={Boolean(form.shovel)} onChange={(v) => update("shovel", v)} /><CheckInput label="Knapsack" checked={Boolean(form.knapsack)} onChange={(v) => update("knapsack", v)} /></> : null}
        </div>
        <Grid>
          {form.hired ? <><TextInput label="Hired From" value={clean(form.hired_from)} onChange={(v) => update("hired_from", v)} /><TextInput label="Hire Term" value={clean(form.hire_term)} onChange={(v) => update("hire_term", v)} /></> : null}
          {form.spare_key_provided ? <TextInput label="Spare Key Location" value={clean(form.spare_key_location)} onChange={(v) => update("spare_key_location", v)} /> : null}
          {clean(form.status) === "Off Hire" ? <TextInput label="Off Hire Date" type="date" value={clean(form.off_hire_date)} onChange={(v) => update("off_hire_date", v)} /> : null}
          {clean(form.status) === "Superseded" ? <TextInput label="Superseded By" value={clean(form.superseded_by)} onChange={(v) => update("superseded_by", v)} /> : null}
          {clean(form.status) === "Inactive" ? <TextInput label="Inactive Reason" value={clean(form.inactive_reason)} onChange={(v) => update("inactive_reason", v)} /> : null}
        </Grid>
      </div>
    </Section>

    <Notes value={clean(form.notes)} onChange={(v) => update("notes", v)} />
  </>;
}

function PlantFields({ form, update, projects, crews, isCrane }: { form: FormState; update: (key: string, value: string | boolean) => void; projects: string[]; crews: string[]; isCrane: boolean }) {
  return <>
    <Section title="Plant Details" description="Permanent register information and current allocation.">
      <Grid>
        <TextInput label="Asset ID" required value={clean(form.asset_id)} onChange={(v) => update("asset_id", v)} />
        <SelectInput label="Plant Type" value={clean(form.plant_type)} onChange={(v) => update("plant_type", v)} options={["Crane", "Telehandler", "Generator", "EWP", "Rigid Truck", "Tilt Tray", "Semi", "Trailer", "Other"]} />
        <TextInput label="Make" value={clean(form.make)} onChange={(v) => update("make", v)} />
        <TextInput label="Model" value={clean(form.model)} onChange={(v) => update("model", v)} />
        <TextInput label="Serial Number" value={clean(form.serial_number)} onChange={(v) => update("serial_number", v)} />
        <TextInput label="Registration" value={clean(form.rego)} onChange={(v) => update("rego", v.toUpperCase())} />
        <SelectInput label="Status" value={clean(form.asset_status)} onChange={(v) => update("asset_status", v)} options={["Available", "In Use", "Off Hire", "Superseded", "Inactive", "Retired"]} />
        <SelectInput label="Project" value={clean(form.project)} onChange={(v) => update("project", v)} options={projects} allowBlank />
        <SelectInput label="Crew" value={clean(form.crew)} onChange={(v) => update("crew", v)} options={crews} allowBlank />
        <TextInput label="Project Onboard Date" type="date" value={clean(form.project_onboard_date)} onChange={(v) => update("project_onboard_date", v)} />
      </Grid>
    </Section>

    <Section title="Service & Inspection" description="Structured hours and due fields used by servicing and compliance.">
      <Grid>
        <TextInput label="Current Engine Hours" type="number" value={clean(form.current_engine_hours)} onChange={(v) => update("current_engine_hours", v)} />
        <TextInput label="Last Service Date" type="date" value={clean(form.last_service_date)} onChange={(v) => update("last_service_date", v)} />
        <TextInput label="Last Service Hours" type="number" value={clean(form.last_service_hours)} onChange={(v) => update("last_service_hours", v)} />
        <TextInput label="Service Interval Hours" type="number" value={clean(form.service_interval_hours)} onChange={(v) => update("service_interval_hours", v)} />
        <TextInput label="Next Service Date" type="date" value={clean(form.next_service_due)} onChange={(v) => update("next_service_due", v)} />
        <TextInput label="Next Service Hours" type="number" value={clean(form.next_service_hours)} onChange={(v) => update("next_service_hours", v)} />
        <TextInput label="Next Inspection" type="date" value={clean(form.next_inspection_due)} onChange={(v) => update("next_inspection_due", v)} />
      </Grid>
    </Section>

    <Section title="Compliance" description="Controlled certificates are uploaded to SharePoint from the Asset detail page or during creation.">
      <Grid>
        <TextInput label="Rego Expiry" type="date" value={clean(form.rego_expiry)} onChange={(v) => update("rego_expiry", v)} />
        <TextInput label="Insurance Expiry" type="date" value={clean(form.insurance_expiry)} onChange={(v) => update("insurance_expiry", v)} />
        {isCrane ? <><TextInput label="CraneSafe Expiry" type="date" value={clean(form.cranesafe_expiry)} onChange={(v) => update("cranesafe_expiry", v)} /><TextInput label="10 Year Inspection Due" type="date" value={clean(form.ten_year_inspection_due)} onChange={(v) => update("ten_year_inspection_due", v)} /></> : null}
        <TextInput label="Risk Assessment Date" type="date" value={clean(form.risk_assessment_date)} onChange={(v) => update("risk_assessment_date", v)} />
      </Grid>
    </Section>

    <Section title="Hire & Setup" description="Operational equipment retained on the Plant register.">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CheckInput label="Hired Asset" checked={Boolean(form.hired)} onChange={(v) => update("hired", v)} />
          <CheckInput label="Risk Assessment Available" checked={Boolean(form.risk_assessment)} onChange={(v) => update("risk_assessment", v)} />
          <CheckInput label="Operators Manual" checked={Boolean(form.operators_manual)} onChange={(v) => update("operators_manual", v)} />
          {isCrane ? <CheckInput label="Load Charts" checked={Boolean(form.load_charts)} onChange={(v) => update("load_charts", v)} /> : null}
          <CheckInput label="Logbook" checked={Boolean(form.logbook)} onChange={(v) => update("logbook", v)} />
          <CheckInput label="Fire Extinguisher" checked={Boolean(form.fire_extinguisher)} onChange={(v) => update("fire_extinguisher", v)} />
          <CheckInput label="First Aid Kit" checked={Boolean(form.first_aid_kit)} onChange={(v) => update("first_aid_kit", v)} />
          <CheckInput label="Spill Kit" checked={Boolean(form.spill_kit)} onChange={(v) => update("spill_kit", v)} />
        </div>
        <Grid>
          {form.hired ? <><TextInput label="Hired From" value={clean(form.hired_from)} onChange={(v) => update("hired_from", v)} /><TextInput label="Hire Term" value={clean(form.hire_term)} onChange={(v) => update("hire_term", v)} /></> : null}
          {clean(form.asset_status) === "Off Hire" ? <TextInput label="Off Hire Date" type="date" value={clean(form.off_hire_date)} onChange={(v) => update("off_hire_date", v)} /> : null}
          {clean(form.asset_status) === "Superseded" ? <TextInput label="Superseded By" value={clean(form.superseded_by)} onChange={(v) => update("superseded_by", v)} /> : null}
          {["Off Hire", "Superseded", "Inactive"].includes(clean(form.asset_status)) ? <TextInput label="Inactive / Status Reason" value={clean(form.inactive_reason)} onChange={(v) => update("inactive_reason", v)} /> : null}
        </Grid>
      </div>
    </Section>

    <Notes value={clean(form.notes)} onChange={(v) => update("notes", v)} />
  </>;
}

function Notes({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Section title="Notes" description="General internal Asset notes."><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={5} className="input resize-y" placeholder="Restrictions, setup notes, hire details, operational comments..." /></Section>;
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-lg font-black text-slate-950">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{description}</p><div className="mt-5">{children}</div></section>;
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>{children}</label>;
}

function TextInput({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <Field label={`${label}${required ? " *" : ""}`}><input type={type} value={value} required={required} onChange={(event) => onChange(event.target.value)} className="input" /></Field>;
}

function SelectInput({ label, value, onChange, options, allowBlank = false }: { label: string; value: string; onChange: (value: string) => void; options: string[]; allowBlank?: boolean }) {
  const merged = value && !options.includes(value) ? [value, ...options] : options;
  return <Field label={label}><select value={value} onChange={(event) => onChange(event.target.value)} className="input">{allowBlank ? <option value="">Unallocated</option> : null}{merged.map((option) => <option key={`${label}-${option}`} value={option}>{option}</option>)}</select></Field>;
}

function CheckInput({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function Message({ tone, children }: { tone: "error" | "warning"; children: ReactNode }) {
  return <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${tone === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{children}</div>;
}
