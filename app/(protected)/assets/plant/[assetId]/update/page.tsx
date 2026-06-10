"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { ArrowLeft, FileUp, Save } from "lucide-react";
import { PageHeader, PageShell } from "../../../components";

type PlantAsset = {
  id: string;
  asset_id: string | null;
  make: string | null;
  model: string | null;
  plant_type: string | null;
  insurance_expiry: string | null;
  rego_expiry: string | null;
  cranesafe_expiry: string | null;
};

type PlantDocument = {
  id: string;
  document_type: string;
  file_name: string;
  file_url: string;
  created_at: string | null;
};

type ServiceHistory = {
  id: string;
  service_date: string | null;
  hour_meter: number | null;
  service_provider: string | null;
  service_type: string | null;
  next_service_interval_hours: number | null;
  document_name: string | null;
  document_url: string | null;
  created_at: string | null;
};

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function isCrane(asset: PlantAsset) {
  return clean(asset.plant_type).toLowerCase() === "crane";
}

function isTelehandler(asset: PlantAsset) {
  return clean(asset.plant_type).toLowerCase() === "telehandler";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function PlantCompliancePage() {
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
  const [documents, setDocuments] = useState<PlantDocument[]>([]);
  const [services, setServices] = useState<ServiceHistory[]>([]);
  const [saving, setSaving] = useState(false);

  const [riskAssessmentFile, setRiskAssessmentFile] = useState<File | null>(null);

  const [insuranceExpiry, setInsuranceExpiry] = useState("");
  const [regoExpiry, setRegoExpiry] = useState("");
  const [cranesafeExpiry, setCranesafeExpiry] = useState("");

  const [insuranceFile, setInsuranceFile] = useState<File | null>(null);
  const [regoFile, setRegoFile] = useState<File | null>(null);
  const [cranesafeFile, setCranesafeFile] = useState<File | null>(null);
  const [plantSpecificFile, setPlantSpecificFile] = useState<File | null>(null);

  const [serviceDate, setServiceDate] = useState("");
  const [serviceHours, setServiceHours] = useState("");
  const [serviceProvider, setServiceProvider] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [serviceInterval, setServiceInterval] = useState("");
  const [workCompleted, setWorkCompleted] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceCost, setInvoiceCost] = useState("");
  const [serviceFile, setServiceFile] = useState<File | null>(null);

  const loadData = useCallback(async () => {
    const [assetResult, docsResult, serviceResult] = await Promise.all([
      supabase.from("plant_assets").select("*").eq("id", assetId).single(),
      supabase
        .from("plant_asset_documents")
        .select("*")
        .eq("plant_asset_id", assetId)
        .order("created_at", { ascending: false }),
      supabase
        .from("plant_service_history")
        .select("*")
        .eq("plant_asset_id", assetId)
        .order("service_date", { ascending: false }),
    ]);

    if (!assetResult.error) {
      const loadedAsset = assetResult.data as PlantAsset;

      setAsset(loadedAsset);
      setInsuranceExpiry(clean(loadedAsset.insurance_expiry));
      setRegoExpiry(clean(loadedAsset.rego_expiry));
      setCranesafeExpiry(clean(loadedAsset.cranesafe_expiry));
    }

    if (!docsResult.error) setDocuments((docsResult.data ?? []) as PlantDocument[]);
    if (!serviceResult.error) setServices((serviceResult.data ?? []) as ServiceHistory[]);
  }, [assetId, supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function uploadDocument(documentType: string, file: File) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const folder = documentType.replace(/\s+/g, "_").toLowerCase();
    const path = `${assetId}/${folder}/${crypto.randomUUID()}-${safeName}`;

    const upload = await supabase.storage.from("plant_docs").upload(path, file, {
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
      fileName: file.name,
      fileUrl: data.publicUrl,
    };
  }

  async function saveCompliance() {
    if (!asset) return;

    setSaving(true);

    try {
      if (riskAssessmentFile) await uploadDocument("Risk Assessment", riskAssessmentFile);
      if (insuranceFile) await uploadDocument("Insurance Document", insuranceFile);

      if (isCrane(asset)) {
        if (regoFile) await uploadDocument("Registration Document", regoFile);
        if (cranesafeFile) await uploadDocument("CraneSafe Certificate", cranesafeFile);
        if (plantSpecificFile) await uploadDocument("Crane Documents", plantSpecificFile);
      } else if (isTelehandler(asset)) {
        if (plantSpecificFile) await uploadDocument("Telehandler Documents", plantSpecificFile);
      } else if (plantSpecificFile) {
        await uploadDocument("Plant Documents", plantSpecificFile);
      }

      const assetUpdate = await supabase
        .from("plant_assets")
        .update({
          insurance_expiry: clean(insuranceExpiry) || null,
          rego_expiry: isCrane(asset) ? clean(regoExpiry) || null : null,
          cranesafe_expiry: isCrane(asset) ? clean(cranesafeExpiry) || null : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", assetId);

      if (assetUpdate.error) throw new Error(assetUpdate.error.message);

      setRiskAssessmentFile(null);
      setInsuranceFile(null);
      setRegoFile(null);
      setCranesafeFile(null);
      setPlantSpecificFile(null);

      alert("Compliance updated.");
      await loadData();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save compliance.");
    }

    setSaving(false);
  }

  async function saveServiceHistory() {
    if (!serviceDate && !serviceHours && !serviceFile) {
      alert("Add at least a service date, hour reading or file.");
      return;
    }

    setSaving(true);

    try {
      let uploaded: { fileName: string; fileUrl: string } | null = null;

      if (serviceFile) {
        uploaded = await uploadDocument("Service History", serviceFile);
      }

      const insert = await supabase.from("plant_service_history").insert({
        plant_asset_id: assetId,
        service_date: clean(serviceDate) || null,
        hour_meter: serviceHours ? Number(serviceHours) : null,
        service_provider: clean(serviceProvider),
        service_type: clean(serviceType),
        next_service_interval_hours: serviceInterval ? Number(serviceInterval) : null,
        work_completed: clean(workCompleted),
        defects_or_recommendations: clean(recommendations),
        invoice_number: clean(invoiceNumber),
        invoice_cost: invoiceCost ? Number(invoiceCost) : null,
        document_url: uploaded?.fileUrl ?? null,
        document_name: uploaded?.fileName ?? null,
      });

      if (insert.error) throw new Error(insert.error.message);

      const assetUpdate = await supabase
        .from("plant_assets")
        .update({
          last_service_date: clean(serviceDate) || null,
          last_service_hours: serviceHours ? Number(serviceHours) : null,
          service_interval_hours: serviceInterval ? Number(serviceInterval) : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", assetId);

      if (assetUpdate.error) throw new Error(assetUpdate.error.message);

      setServiceDate("");
      setServiceHours("");
      setServiceProvider("");
      setServiceType("");
      setServiceInterval("");
      setWorkCompleted("");
      setRecommendations("");
      setInvoiceNumber("");
      setInvoiceCost("");
      setServiceFile(null);

      alert("Service history saved.");
      await loadData();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save service history.");
    }

    setSaving(false);
  }

  if (!asset) {
    return (
      <PageShell>
        <p className="text-sm text-slate-500">Loading compliance...</p>
      </PageShell>
    );
  }

  const plantSpecificTitle = isCrane(asset)
    ? "Crane Documents"
    : isTelehandler(asset)
      ? "Telehandler Documents"
      : "Plant Documents";

  const plantSpecificDescription = isCrane(asset)
    ? "Upload crane documents such as load charts, manuals, lift information or additional compliance records."
    : isTelehandler(asset)
      ? "Upload telehandler documents such as manuals, load charts, inspection records or compliance documents."
      : "Upload plant-specific manuals, inspection records or compliance documents.";

  return (
    <PageShell>
      <PageHeader
        eyebrow="Plant Compliance"
        title={`${clean(asset.asset_id)} — ${
          [clean(asset.make), clean(asset.model)].filter(Boolean).join(" ") || "Plant Asset"
        }`}
        description="Update risk assessment, insurance, plant-specific documents and service history."
        actions={
          <Link
            href="/assets/plant"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Back to Plant
          </Link>
        }
      />

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <UploadOnlyCard
          title="Risk Assessment"
          description="Required for every plant item and vehicle."
          file={riskAssessmentFile}
          setFile={setRiskAssessmentFile}
        />

        <ComplianceCard
          title="Insurance"
          description="Upload current insurance document and expiry."
          expiry={insuranceExpiry}
          setExpiry={setInsuranceExpiry}
          file={insuranceFile}
          setFile={setInsuranceFile}
        />

        {isCrane(asset) && (
          <>
            <ComplianceCard
              title="Registration"
              description="Upload registration document and expiry."
              expiry={regoExpiry}
              setExpiry={setRegoExpiry}
              file={regoFile}
              setFile={setRegoFile}
            />

            <ComplianceCard
              title="CraneSafe"
              description="Upload CraneSafe certificate and expiry."
              expiry={cranesafeExpiry}
              setExpiry={setCranesafeExpiry}
              file={cranesafeFile}
              setFile={setCranesafeFile}
            />
          </>
        )}

        <UploadOnlyCard
          title={plantSpecificTitle}
          description={plantSpecificDescription}
          file={plantSpecificFile}
          setFile={setPlantSpecificFile}
        />
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void saveCompliance()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          <Save size={16} />
          {saving ? "Saving..." : "Save Compliance"}
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">Add Service History</h2>
        <p className="mt-1 text-sm text-slate-500">
          Optional for now. Add service details when available.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Input label="Service Date" type="date" value={serviceDate} onChange={setServiceDate} />
          <Input label="Hour Meter" value={serviceHours} onChange={setServiceHours} />
          <Input label="Service Provider" value={serviceProvider} onChange={setServiceProvider} />
          <Input label="Service Type" value={serviceType} onChange={setServiceType} />
          <Input label="Next Interval Hours" value={serviceInterval} onChange={setServiceInterval} />
          <Input label="Invoice Number" value={invoiceNumber} onChange={setInvoiceNumber} />
          <Input label="Invoice Cost" value={invoiceCost} onChange={setInvoiceCost} />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TextArea label="Work Completed" value={workCompleted} onChange={setWorkCompleted} />
          <TextArea
            label="Defects / Recommendations"
            value={recommendations}
            onChange={setRecommendations}
          />
        </div>

        <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">
          <FileUp size={16} />
          {serviceFile ? serviceFile.name : "Upload service invoice / report"}
          <input
            type="file"
            className="hidden"
            onChange={(event) => setServiceFile(event.target.files?.[0] ?? null)}
          />
        </label>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => void saveServiceHistory()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Save size={16} />
            Save Service
          </button>
        </div>
      </section>

      <HistorySection title="Service History">
        {services.length === 0 ? (
          <p className="text-sm text-slate-500">No service history recorded.</p>
        ) : (
          <div className="space-y-3">
            {services.map((service) => (
              <div key={service.id} className="rounded-xl border border-slate-200 p-4">
                <p className="font-bold text-slate-950">
                  {formatDate(service.service_date)} — {clean(service.service_type) || "Service"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {service.hour_meter ?? "No hours"} hrs ·{" "}
                  {clean(service.service_provider) || "No provider"}
                </p>
                {service.document_url && (
                  <a
                    href={service.document_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-sm font-semibold text-blue-700 hover:underline"
                  >
                    Open document
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </HistorySection>

      <HistorySection title="Document History">
        {documents.length === 0 ? (
          <p className="text-sm text-slate-500">No documents uploaded.</p>
        ) : (
          <div className="space-y-3">
            {documents.map((document) => (
              <div
                key={document.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4"
              >
                <div>
                  <p className="font-bold text-slate-950">{document.document_type}</p>
                  <p className="text-sm text-slate-500">{document.file_name}</p>
                  <p className="text-xs text-slate-400">
                    Uploaded {formatDate(document.created_at)}
                  </p>
                </div>

                <a
                  href={document.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-blue-700 hover:underline"
                >
                  Open
                </a>
              </div>
            ))}
          </div>
        )}
      </HistorySection>
    </PageShell>
  );
}

function ComplianceCard({
  title,
  description,
  expiry,
  setExpiry,
  file,
  setFile,
}: {
  title: string;
  description: string;
  expiry: string;
  setExpiry: (value: string) => void;
  file: File | null;
  setFile: (file: File | null) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-bold text-slate-950">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <p className="mt-3 text-sm text-slate-500">Current expiry: {formatDate(expiry)}</p>

      <label className="mt-4 block space-y-1 text-sm">
        <span className="font-semibold text-slate-600">New Expiry</span>
        <input
          type="date"
          value={expiry}
          onChange={(event) => setExpiry(event.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
        />
      </label>

      <UploadInput file={file} setFile={setFile} label="Upload document" />
    </div>
  );
}

function UploadOnlyCard({
  title,
  description,
  file,
  setFile,
}: {
  title: string;
  description: string;
  file: File | null;
  setFile: (file: File | null) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-bold text-slate-950">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <UploadInput file={file} setFile={setFile} label={`Upload ${title.toLowerCase()}`} />
    </div>
  );
}

function UploadInput({
  file,
  setFile,
  label,
}: {
  file: File | null;
  setFile: (file: File | null) => void;
  label: string;
}) {
  return (
    <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">
      <FileUp size={16} />
      {file ? file.name : label}
      <input
        type="file"
        className="hidden"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}

function HistorySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Input({
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
    <label className="space-y-1 text-sm">
      <span className="font-semibold text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-semibold text-slate-600">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
      />
    </label>
  );
}