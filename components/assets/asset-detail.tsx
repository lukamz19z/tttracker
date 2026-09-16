"use client";

import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Download,
  ExternalLink,
  FileClock,
  FileText,
  FolderSync,
  HardHat,
  History,
  Loader2,
  ReceiptText,
  RefreshCw,
  Settings2,
  Truck,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { buildAssetDocumentFileName } from "@/lib/assets/document-naming";
import type {
  AssetDocumentRow,
  AssetDocumentTypeRow,
  AssetEventRow,
  AssetRecord,
  AssetServiceRecordRow,
  AssetSpendRow,
  AssetType,
  LegacyAssetDocument,
} from "@/lib/assets/types";
import { createSupabaseBrowser } from "@/lib/supabase";

type ServiceItemRow = {
  id: string;
  service_record_id: string;
  sort_order: number;
  issue: string;
  diagnosis: string | null;
  rectification: string | null;
  parts_used: string | null;
  labour_hours: number | string | null;
  item_status: string;
};

type PrestartRow = {
  id: string;
  prestart_date?: string | null;
  created_at?: string | null;
  inspected_by_name?: string | null;
  kilometres?: number | string | null;
  hours?: number | string | null;
  project?: string | null;
  crew?: string | null;
  overall_condition?: string | null;
  comments?: string | null;
  severity?: string | null;
  result?: string | null;
  fleet_job_id?: string | null;
};

type FleetJobRow = {
  id: string;
  job_number?: string | null;
  status?: string | null;
  priority?: string | null;
  asset_label?: string | null;
  description?: string | null;
  title?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
};

type ProjectHistoryRow = {
  id?: string;
  project?: string | null;
  crew?: string | null;
  project_onboard_date?: string | null;
  project_offboard_date?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

type OverviewPayload = {
  asset: AssetRecord;
  assetType: AssetType;
  assetLabel: string;
  documents: AssetDocumentRow[];
  legacyDocuments: LegacyAssetDocument[];
  services: AssetServiceRecordRow[];
  serviceItems: ServiceItemRow[];
  prestarts: PrestartRow[];
  fleetJobs: FleetJobRow[];
  events: AssetEventRow[];
  documentTypes: AssetDocumentTypeRow[];
  projectHistory: ProjectHistoryRow[];
  spend: AssetSpendRow[];
  totalSpend: number;
  canManage: boolean;
  identity: { role: string; name: string };
  error?: string;
};

type TabId =
  | "overview"
  | "history"
  | "service"
  | "documents"
  | "spend"
  | "prestarts"
  | "fleet";

type Message = { tone: "success" | "error"; text: string };

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function titleCase(value: unknown) {
  return clean(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function money(value: unknown) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(Number(value ?? 0) || 0);
}

function dateLabel(value: unknown) {
  const raw = clean(value);
  if (!raw) return "—";
  const date = new Date(raw.length <= 10 ? `${raw.slice(0, 10)}T00:00:00` : raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}


function numberLabel(value: unknown, suffix: string) {
  if (value === null || value === undefined || clean(value) === "") return "—";
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? `${parsed.toLocaleString("en-AU")} ${suffix}`
    : `${clean(value)} ${suffix}`;
}

function statusTone(status: unknown) {
  const value = clean(status).toLowerCase();
  if (["active", "in service", "in_service", "completed", "closed", "resolved"].includes(value)) {
    return "emerald";
  }
  if (["inactive", "retired", "superseded", "cancelled", "void"].includes(value)) {
    return "slate";
  }
  if (["overdue", "critical", "failed", "open", "unresolved"].includes(value)) {
    return "rose";
  }
  return "amber";
}

export function AssetDetail({ assetType, assetId }: { assetType: AssetType; assetId: string }) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const apiFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your session has expired. Sign in again.");

      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${session.access_token}`);
      return fetch(url, { ...init, headers, cache: "no-store" });
    },
    [supabase],
  );

  const load = useCallback(async () => {
    const response = await apiFetch(`/api/assets/${assetType}/${assetId}/overview`);
    const payload = (await response.json()) as OverviewPayload;
    if (!response.ok) throw new Error(payload.error || "Asset could not be loaded.");
    setData(payload);
  }, [apiFetch, assetId, assetType]);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch (loadError) {
        setMessage({
          tone: "error",
          text: loadError instanceof Error ? loadError.message : "Asset could not be loaded.",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    setMessage(null);
    try {
      await load();
    } catch (refreshError) {
      setMessage({
        tone: "error",
        text: refreshError instanceof Error ? refreshError.message : "Asset could not be refreshed.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  async function syncFinance() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await apiFetch(`/api/assets/${assetType}/${assetId}/finance-sync`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Finance documents could not be synchronised.");
      await load();
      setMessage({ tone: "success", text: payload.message || "Finance documents synchronised." });
    } catch (syncError) {
      setMessage({
        tone: "error",
        text: syncError instanceof Error ? syncError.message : "Finance documents could not be synchronised.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function exportFolder() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await apiFetch(`/api/assets/${assetType}/${assetId}/export`);
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Asset folder could not be exported.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const fileName = disposition.match(/filename="([^"]+)"/i)?.[1] || `${data?.assetLabel || "Asset"} - Client Export.zip`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (exportError) {
      setMessage({
        tone: "error",
        text: exportError instanceof Error ? exportError.message : "Asset folder could not be exported.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function viewDocument(document: AssetDocumentRow) {
    const previewWindow = window.open("", "_blank");
    try {
      const response = await apiFetch(`/api/assets/documents/${document.id}/content`);
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Document could not be opened.");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (previewWindow) previewWindow.location.href = objectUrl;
      else window.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (viewError) {
      previewWindow?.close();
      setMessage({
        tone: "error",
        text: viewError instanceof Error ? viewError.message : "Document could not be opened.",
      });
    }
  }

  if (loading) {
    return <div className="flex min-h-[65vh] items-center justify-center"><Loader2 size={30} className="animate-spin text-slate-400" /></div>;
  }

  if (!data) {
    return <div className="p-8"><div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{message?.text || "Asset could not be loaded."}</div></div>;
  }

  const asset = data.asset;
  const status = assetType === "vehicle" ? clean(asset.status) || "Active" : clean(asset.asset_status) || "Active";
  const currentReading = assetType === "vehicle"
    ? numberLabel(asset.current_odometer_km, "km")
    : numberLabel(asset.current_engine_hours, "h");
  const nextService = [
    clean(asset.next_service_due) ? dateLabel(asset.next_service_due) : "",
    assetType === "vehicle" && clean(asset.next_service_km) ? numberLabel(asset.next_service_km, "km") : "",
    assetType === "plant" && clean(asset.next_service_hours) ? numberLabel(asset.next_service_hours, "h") : "",
  ].filter(Boolean).join(" · ") || "Not set";
  const openJobs = data.fleetJobs.filter((job) => !["completed", "closed", "cancelled"].includes(clean(job.status).toLowerCase()));

  const tabs: Array<{ id: TabId; label: string; count?: number }> = [
    { id: "overview", label: "Overview" },
    { id: "history", label: "History", count: data.events.length },
    { id: "service", label: "Service History", count: data.services.length },
    { id: "documents", label: "Documents", count: data.documents.length + data.legacyDocuments.length },
    { id: "spend", label: "Spend", count: data.spend.length },
    { id: "prestarts", label: "Prestarts", count: data.prestarts.length },
    { id: "fleet", label: "Fleet Jobs", count: data.fleetJobs.length },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <Link href={assetType === "vehicle" ? "/assets/vehicles" : "/assets/plant"} className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900">
              <ArrowLeft size={16} /> Back to {assetType === "vehicle" ? "Vehicles" : "Plant"}
            </Link>
            <div className="mt-5 flex items-center gap-3">
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                {assetType === "vehicle" ? <Truck size={24} /> : <HardHat size={24} />}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{assetType}</div>
                <h1 className="mt-1 truncate text-3xl font-black tracking-tight text-slate-950">{data.assetLabel}</h1>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge label={status} tone={statusTone(status)} />
              {asset.project ? <StatusBadge label={`Project: ${clean(asset.project)}`} tone="blue" /> : null}
              {asset.crew ? <StatusBadge label={`Crew: ${clean(asset.crew)}`} tone="slate" /> : null}
            </div>
          </div>

          <div className="flex max-w-2xl flex-wrap gap-2">
            <button type="button" onClick={() => void refresh()} disabled={refreshing} className="action-secondary">
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> Refresh
            </button>

            {data.canManage ? (
              <>
                <Link href={`/assets/update?assetType=${assetType}&assetId=${assetId}`} className="action-primary bg-blue-700 hover:bg-blue-800">
                  <Settings2 size={16} /> Update Asset
                </Link>
                <Link href={`/assets/services/new?assetType=${assetType}&assetId=${assetId}&recordType=service`} className="action-primary">
                  <Wrench size={16} /> BC Service
                </Link>
                <button type="button" onClick={() => setUploadOpen(true)} className="action-secondary">
                  <Upload size={16} /> Upload Document
                </button>
                <button type="button" onClick={() => setInvoiceOpen(true)} className="action-secondary border-emerald-200 bg-emerald-50 text-emerald-800">
                  <ReceiptText size={16} /> Add Cost / Invoice
                </button>
                <button type="button" onClick={() => void syncFinance()} disabled={busy} className="action-secondary">
                  <FolderSync size={16} /> Sync Finance Files
                </button>
                <Link href={assetType === "vehicle" ? `/assets/vehicles/${assetId}/edit` : `/assets/plant/${assetId}/edit`} className="action-secondary">
                  Edit Asset
                </Link>
              </>
            ) : null}

            <button type="button" onClick={() => void exportFolder()} disabled={busy} className="action-secondary">
              <Download size={16} /> Client Export
            </button>
            {asset.sharepoint_web_url ? (
              <a href={clean(asset.sharepoint_web_url)} target="_blank" rel="noreferrer" className="action-secondary">
                <ExternalLink size={16} /> SharePoint
              </a>
            ) : null}
          </div>
        </div>
      </section>

      {message ? <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{message.text}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Status" value={status} detail={assetType === "vehicle" ? clean(asset.vehicle_rego) || "No registration" : clean(asset.rego) || clean(asset.serial_number) || "No registration"} icon={<CheckCircle2 size={20} />} />
        <Metric label="Current Reading" value={currentReading} detail={assetType === "vehicle" ? "Odometer" : "Engine hours"} icon={<FileClock size={20} />} />
        <Metric label="Next Service" value={nextService} detail="Structured service schedule" icon={<CalendarClock size={20} />} />
        <Metric label="Open Fleet Jobs" value={String(openJobs.length)} detail={`${data.fleetJobs.length} linked jobs`} icon={<Wrench size={20} />} />
        <Metric label="Tracked Spend" value={money(data.totalSpend)} detail={`${data.spend.length} linked Finance items`} icon={<CircleDollarSign size={20} />} />
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 p-2">
          {tabs.map((item) => (
            <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-black ${tab === item.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              {item.label}{item.count !== undefined ? ` (${item.count})` : ""}
            </button>
          ))}
        </div>

        <div className="p-5 sm:p-6">
          {tab === "overview" ? <OverviewTab data={data} assetType={assetType} /> : null}
          {tab === "history" ? <HistoryTab events={data.events} projectHistory={data.projectHistory} /> : null}
          {tab === "service" ? <ServiceTab services={data.services} items={data.serviceItems} documents={data.documents} onViewDocument={viewDocument} /> : null}
          {tab === "documents" ? <DocumentsTab documents={data.documents} legacyDocuments={data.legacyDocuments} onViewDocument={viewDocument} /> : null}
          {tab === "spend" ? <SpendTab rows={data.spend} /> : null}
          {tab === "prestarts" ? <PrestartsTab rows={data.prestarts} /> : null}
          {tab === "fleet" ? <FleetJobsTab rows={data.fleetJobs} /> : null}
        </div>
      </section>

      {uploadOpen ? (
        <DocumentUploadModal
          assetType={assetType}
          assetId={assetId}
          asset={asset}
          documentTypes={data.documentTypes}
          onClose={() => setUploadOpen(false)}
          apiFetch={apiFetch}
          onSaved={async (savedMessage) => {
            setUploadOpen(false);
            await load();
            setMessage({ tone: "success", text: savedMessage });
          }}
        />
      ) : null}

      {invoiceOpen ? (
        <InvoiceModal
          assetType={assetType}
          assetId={assetId}
          onClose={() => setInvoiceOpen(false)}
          apiFetch={apiFetch}
          onSaved={async (savedMessage) => {
            setInvoiceOpen(false);
            await load();
            setMessage({ tone: "success", text: savedMessage });
          }}
        />
      ) : null}

      <style jsx global>{`
        .action-primary { display:inline-flex; align-items:center; gap:.5rem; border-radius:.75rem; background:rgb(15 23 42); padding:.625rem .875rem; font-size:.875rem; font-weight:900; color:white; }
        .action-secondary { display:inline-flex; align-items:center; gap:.5rem; border-radius:.75rem; border:1px solid rgb(226 232 240); background:white; padding:.625rem .875rem; font-size:.875rem; font-weight:900; color:rgb(51 65 85); }
        .input { width:100%; border-radius:.75rem; border:1px solid rgb(226 232 240); background:white; padding:.625rem .75rem; font-size:.875rem; outline:none; }
        .input:focus { box-shadow:0 0 0 2px rgb(219 234 254); }
      `}</style>
    </div>
  );
}

function OverviewTab({ data, assetType }: { data: OverviewPayload; assetType: AssetType }) {
  const asset = data.asset;
  const details: Array<[string, unknown]> = assetType === "vehicle"
    ? [
        ["Asset ID", asset.vehicle_id], ["Registration", asset.vehicle_rego], ["Make", asset.make], ["Model", asset.model],
        ["Category", asset.category], ["Year", asset.year], ["VIN", asset.vin_number], ["Owner", asset.owner],
        ["Project", asset.project], ["Crew", asset.crew], ["Current KM", asset.current_odometer_km], ["Last Service", asset.last_service],
        ["Next Service", asset.next_service_due], ["Rego Expiry", asset.rego_expiry], ["Insurance Expiry", asset.insurance_expiry],
        ["Risk Assessment", asset.risk_assessment_date],
      ]
    : [
        ["Asset ID", asset.asset_id], ["Registration", asset.rego], ["Make", asset.make], ["Model", asset.model],
        ["Plant Type", asset.plant_type], ["Serial Number", asset.serial_number], ["Project", asset.project], ["Crew", asset.crew],
        ["Current Hours", asset.current_engine_hours], ["Last Service", asset.last_service_date], ["Last Service Hours", asset.last_service_hours],
        ["Next Service", asset.next_service_due], ["Rego Expiry", asset.rego_expiry], ["Insurance Expiry", asset.insurance_expiry],
        ["CraneSafe Expiry", asset.cranesafe_expiry], ["10 Year Due", asset.ten_year_inspection_due], ["Risk Assessment", asset.risk_assessment_date],
      ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {details.map(([label, value]) => <Info key={label} label={label} value={dateOrText(label, value)} />)}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <SummaryList title="Latest Service" empty="No structured service records yet." rows={data.services.slice(0, 5).map((record) => ({ key: record.id, title: `${record.service_number} · ${record.summary}`, meta: `${dateLabel(record.service_date)} · ${titleCase(record.record_type)}`, right: money(record.amount_inc_gst) }))} />
        <SummaryList title="Current Controlled Documents" empty="No current controlled documents yet." rows={data.documents.filter((document) => document.active && (document.is_current || document.replacement_mode_snapshot === "historical")).slice(0, 6).map((document) => ({ key: document.id, title: document.file_name, meta: `${document.document_type_name || titleCase(document.document_category)}${document.expiry_date ? ` · Exp ${dateLabel(document.expiry_date)}` : ""}` }))} />
      </div>
      {asset.notes ? <Info label="Asset Notes" value={clean(asset.notes)} multiline /> : null}
    </div>
  );
}

function HistoryTab({ events, projectHistory }: { events: AssetEventRow[]; projectHistory: ProjectHistoryRow[] }) {
  const timeline = [
    ...events.map((event) => ({
      key: `event-${event.id}`,
      date: event.event_date,
      type: event.event_type,
      title: event.title,
      description: event.description,
      by: event.performed_by_name,
      cost: event.cost,
      createdAt: event.created_at,
    })),
    ...projectHistory.map((row, index) => ({
      key: `project-${row.id || index}`,
      date: row.project_onboard_date || row.created_at || "",
      type: "project_transfer",
      title: `Project allocation · ${clean(row.project) || "Unallocated"}`,
      description: [clean(row.crew) ? `Crew: ${clean(row.crew)}` : "", clean(row.notes)].filter(Boolean).join(" · ") || null,
      by: null,
      cost: null,
      createdAt: row.created_at || row.project_onboard_date || "",
    })),
  ].sort((a, b) => String(b.date || b.createdAt).localeCompare(String(a.date || a.createdAt)));

  if (timeline.length === 0) return <Empty text="No Asset history events yet." />;

  return (
    <div className="space-y-3">
      {timeline.map((event) => (
        <div key={event.key} className="grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-[130px_170px_minmax(0,1fr)_110px] sm:items-start">
          <div className="text-sm font-black text-slate-900">{dateLabel(event.date)}</div>
          <div><StatusBadge label={titleCase(event.type)} tone={statusTone(event.type)} /></div>
          <div className="min-w-0">
            <div className="font-black text-slate-950">{event.title}</div>
            {event.description ? <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{event.description}</div> : null}
            {event.by ? <div className="mt-2 text-xs font-semibold text-slate-400">Recorded by {event.by}</div> : null}
          </div>
          <div className="text-right text-sm font-black text-slate-700">{Number(event.cost ?? 0) > 0 ? money(event.cost) : ""}</div>
        </div>
      ))}
    </div>
  );
}

function ServiceTab({ services, items, documents, onViewDocument }: { services: AssetServiceRecordRow[]; items: ServiceItemRow[]; documents: AssetDocumentRow[]; onViewDocument: (document: AssetDocumentRow) => Promise<void> }) {
  if (services.length === 0) return <Empty text="No structured service records yet." />;
  return (
    <div className="space-y-4">
      {services.map((record) => {
        const recordItems = items.filter((item) => item.service_record_id === record.id).sort((a, b) => a.sort_order - b.sort_order);
        const report = record.report_document_id
          ? documents.find((document) => document.id === record.report_document_id)
          : documents.find((document) => document.service_record_id === record.id && document.document_category === "service");
        return (
          <article key={record.id} className="rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-black text-slate-950">{record.service_number}</h3>
                  <StatusBadge label={titleCase(record.record_type)} tone="blue" />
                  <StatusBadge label={titleCase(record.provider_type === "internal" ? "BC Service" : "External Service")} tone={record.provider_type === "internal" ? "emerald" : "slate"} />
                </div>
                <div className="mt-2 text-lg font-black text-slate-900">{record.summary}</div>
                <div className="mt-1 text-sm text-slate-500">{dateLabel(record.service_date)} · {record.mechanic_name || record.provider_name || "Service"}{record.odometer_km !== null ? ` · ${numberLabel(record.odometer_km, "km")}` : ""}{record.engine_hours !== null ? ` · ${numberLabel(record.engine_hours, "h")}` : ""}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-sm font-black text-slate-900">{money(record.amount_inc_gst)}</div>
                {report ? <button type="button" onClick={() => void onViewDocument(report)} className="action-secondary"><FileText size={14} /> Service PDF</button> : null}
              </div>
            </div>
            <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-slate-400">Issues / Rectification</div>
                {recordItems.length === 0 ? <p className="mt-3 text-sm text-slate-500">No separate issue lines recorded.</p> : (
                  <div className="mt-3 space-y-3">
                    {recordItems.map((item, index) => (
                      <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3"><div className="font-black text-slate-900">{index + 1}. {item.issue}</div><StatusBadge label={titleCase(item.item_status)} tone={statusTone(item.item_status)} /></div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2"><SmallText label="Diagnosis" value={item.diagnosis} /><SmallText label="Fix / Action" value={item.rectification} /><SmallText label="Parts Used" value={item.parts_used} /><SmallText label="Labour" value={item.labour_hours !== null ? `${Number(item.labour_hours).toFixed(2)} h` : null} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-3"><Info label="Work Completed" value={record.work_completed || "—"} multiline /><Info label="Recommendations" value={record.recommendations || "—"} multiline /><Info label="Follow-up" value={record.follow_up_actions || "—"} multiline /><Info label="Next Service" value={[dateLabel(record.next_service_date), record.next_service_km !== null ? numberLabel(record.next_service_km, "km") : "", record.next_service_hours !== null ? numberLabel(record.next_service_hours, "h") : ""].filter((value) => value && value !== "—").join(" · ") || "—"} /></div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function DocumentsTab({ documents, legacyDocuments, onViewDocument }: { documents: AssetDocumentRow[]; legacyDocuments: LegacyAssetDocument[]; onViewDocument: (document: AssetDocumentRow) => Promise<void> }) {
  const current = documents.filter((document) => document.active);
  const superseded = documents.filter((document) => !document.active || Boolean(document.superseded_at));

  if (documents.length === 0 && legacyDocuments.length === 0) return <Empty text="No controlled Asset documents yet." />;

  return (
    <div className="space-y-7">
      <DocumentTable title="Current / Historical Controlled Documents" documents={current} onViewDocument={onViewDocument} empty="No current controlled documents." />
      <DocumentTable title="Superseded Documents" documents={superseded} onViewDocument={onViewDocument} empty="No superseded documents." superseded />
      {legacyDocuments.length > 0 ? (
        <section>
          <div className="mb-3 flex items-center gap-2"><History size={17} className="text-slate-400" /><h3 className="font-black text-slate-900">Legacy Documents</h3></div>
          <div className="grid gap-3 md:grid-cols-2">
            {legacyDocuments.map((document) => (
              <div key={document.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="font-black text-slate-900">{document.file_name || document.document_type || "Legacy document"}</div>
                <div className="mt-1 text-xs text-slate-600">{titleCase(document.document_type)} · {dateLabel(document.created_at)}</div>
                {document.file_url ? <a href={document.file_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-xs font-black text-blue-700"><ExternalLink size={13} /> Open legacy file</a> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function DocumentTable({ title, documents, onViewDocument, empty, superseded = false }: { title: string; documents: AssetDocumentRow[]; onViewDocument: (document: AssetDocumentRow) => Promise<void>; empty: string; superseded?: boolean }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2"><FileText size={17} className="text-slate-400" /><h3 className="font-black text-slate-900">{title}</h3></div>
      {documents.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm font-semibold text-slate-400">{empty}</div> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Document</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Date / Expiry</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Open</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {documents.map((document) => (
                <tr key={document.id} className="hover:bg-slate-50">
                  <td className="px-4 py-4"><div className="font-black text-slate-900">{document.title}</div><div className="mt-1 max-w-xl break-all text-xs text-slate-500">{document.file_name}</div></td>
                  <td className="px-4 py-4"><div className="font-bold text-slate-700">{document.document_type_name || titleCase(document.document_category)}</div><div className="mt-1 text-xs text-slate-400">{document.document_type_code || titleCase(document.source)}</div></td>
                  <td className="px-4 py-4 text-slate-600"><div>{dateLabel(document.document_date)}</div>{document.expiry_date ? <div className="mt-1 text-xs">Exp {dateLabel(document.expiry_date)}</div> : null}</td>
                  <td className="px-4 py-4"><StatusBadge label={superseded ? "Superseded" : document.is_current ? "Current" : "Historical"} tone={superseded ? "slate" : document.is_current ? "emerald" : "blue"} /></td>
                  <td className="px-4 py-4 text-right"><button type="button" onClick={() => void onViewDocument(document)} className="action-secondary"><ExternalLink size={14} /> Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SpendTab({ rows }: { rows: AssetSpendRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.amountIncGst, 0);
  if (rows.length === 0) return <Empty text="No Finance items are linked to this asset yet." />;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3"><Info label="Total Linked Spend" value={money(total)} /><Info label="Transactions" value={String(rows.length)} /><Info label="Latest" value={dateLabel(rows[0]?.expenseDate || rows[0]?.createdAt)} /></div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Submission</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Links</th><th className="px-4 py-3 text-right">Amount</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.itemId}><td className="px-4 py-4"><div className="font-black text-slate-900">{row.submissionNumber}</div><div className="mt-1 text-xs text-slate-500">{titleCase(row.status)}{row.invoiceNumber ? ` · ${row.invoiceNumber}` : ""}</div></td><td className="px-4 py-4 text-slate-600">{dateLabel(row.expenseDate || row.createdAt)}</td><td className="px-4 py-4 text-slate-600">{row.supplier || "—"}</td><td className="max-w-md px-4 py-4 text-slate-700">{row.description}</td><td className="px-4 py-4 text-xs text-slate-500">{row.fleetJobId ? "Fleet Job" : ""}{row.fleetJobId && row.serviceRecordId ? " · " : ""}{row.serviceRecordId ? "Service" : ""}{!row.fleetJobId && !row.serviceRecordId ? "Direct Asset" : ""}</td><td className="px-4 py-4 text-right font-black text-slate-900">{money(row.amountIncGst)}</td></tr>)}</tbody></table></div>
    </div>
  );
}

function PrestartsTab({ rows }: { rows: PrestartRow[] }) {
  if (rows.length === 0) return <Empty text="No linked prestarts have been recorded." />;
  return (
    <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Inspector</th><th className="px-4 py-3">Reading</th><th className="px-4 py-3">Project / Crew</th><th className="px-4 py-3">Result</th><th className="px-4 py-3 text-right">Open</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id}><td className="px-4 py-4 font-bold text-slate-900">{dateLabel(row.prestart_date || row.created_at)}</td><td className="px-4 py-4 text-slate-600">{row.inspected_by_name || "—"}</td><td className="px-4 py-4 text-slate-600">{row.kilometres !== null && row.kilometres !== undefined ? numberLabel(row.kilometres, "km") : row.hours !== null && row.hours !== undefined ? numberLabel(row.hours, "h") : "—"}</td><td className="px-4 py-4 text-slate-600">{[row.project, row.crew].filter(Boolean).join(" · ") || "—"}</td><td className="px-4 py-4"><StatusBadge label={titleCase(row.result || row.overall_condition || "Recorded")} tone={statusTone(row.result || row.severity)} /></td><td className="px-4 py-4 text-right"><Link href={`/assets/prestarts/${row.id}`} className="action-secondary">Open <ExternalLink size={13} /></Link></td></tr>)}</tbody></table></div>
  );
}

function FleetJobsTab({ rows }: { rows: FleetJobRow[] }) {
  if (rows.length === 0) return <Empty text="No Fleet Jobs are linked to this asset." />;
  return <div className="grid gap-3 lg:grid-cols-2">{rows.map((job) => <Link key={job.id} href={`/assets/fleet-jobs/${job.id}`} className="rounded-2xl border border-slate-200 p-5 transition hover:bg-slate-50"><div className="flex items-start justify-between gap-3"><div><div className="font-black text-slate-950">{job.job_number || "Fleet Job"}</div><div className="mt-2 text-sm leading-6 text-slate-600">{job.description || job.title || job.asset_label || "Asset maintenance job"}</div></div><StatusBadge label={titleCase(job.status)} tone={statusTone(job.status)} /></div><div className="mt-3 text-xs font-semibold text-slate-500">{titleCase(job.priority)} · {dateLabel(job.created_at)}</div></Link>)}</div>;
}

function DocumentUploadModal({ assetType, assetId, asset, documentTypes, onClose, apiFetch, onSaved }: { assetType: AssetType; assetId: string; asset: AssetRecord; documentTypes: AssetDocumentTypeRow[]; onClose: () => void; apiFetch: (url: string, init?: RequestInit) => Promise<Response>; onSaved: (message: string) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [documentTypeId, setDocumentTypeId] = useState(documentTypes[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [documentDate, setDocumentDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState("");
  const [supplier, setSupplier] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [amountIncGst, setAmountIncGst] = useState("");
  const [createFinanceRecord, setCreateFinanceRecord] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const documentType = documentTypes.find((row) => row.id === documentTypeId) ?? null;
  const preview = useMemo(() => {
    if (!documentType || !file) return "";
    try {
      return buildAssetDocumentFileName({ documentType, assetType, asset, documentDate, expiryDate, supplier, invoiceNumber, originalFileName: file.name });
    } catch (previewError) {
      return previewError instanceof Error ? previewError.message : "Filename preview unavailable";
    }
  }, [asset, assetType, documentDate, documentType, expiryDate, file, invoiceNumber, supplier]);

  async function submit() {
    if (!documentTypeId) return setError("Select the Asset document type.");
    if (!file) return setError("Choose a document first.");
    setSaving(true); setError("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("documentTypeId", documentTypeId);
      formData.set("title", title.trim());
      formData.set("documentDate", documentDate);
      formData.set("expiryDate", expiryDate);
      formData.set("supplier", supplier.trim());
      formData.set("invoiceNumber", invoiceNumber.trim());
      formData.set("amountIncGst", amountIncGst);
      formData.set("createFinanceRecord", documentType?.category === "invoice" && createFinanceRecord ? "true" : "false");
      const response = await apiFetch(`/api/assets/${assetType}/${assetId}/documents`, { method: "POST", body: formData });
      const payload = (await response.json()) as { document?: AssetDocumentRow; warning?: string | null; error?: string };
      if (!response.ok) throw new Error(payload.error || "Document upload failed.");
      await onSaved(payload.warning || `${payload.document?.file_name || file.name} uploaded to the controlled Asset SharePoint folder.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Document upload failed.");
    } finally { setSaving(false); }
  }

  return (
    <Modal title="Upload Asset Document" description="The configured Document Type controls filename, SharePoint folder, current/superseded behaviour and any Asset master-field update." onClose={onClose}>
      <div className="space-y-4">
        {error ? <ErrorBox text={error} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Document type"><select value={documentTypeId} onChange={(event) => setDocumentTypeId(event.target.value)} className="input"><option value="">Select document type</option>{documentTypes.map((row) => <option key={row.id} value={row.id}>{row.name} ({row.code})</option>)}</select></Field>
          <Field label="File"><input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="input" /></Field>
          <Field label="Title"><Input value={title} onChange={setTitle} placeholder={documentType?.name || "Optional display title"} /></Field>
          {documentType?.date_requirement === "document_date" || documentType?.date_requirement === "document_and_expiry" ? <Field label="Completion / document date"><Input type="date" value={documentDate} onChange={setDocumentDate} /></Field> : null}
          {documentType?.date_requirement === "expiry_date" || documentType?.date_requirement === "document_and_expiry" ? <Field label="Expiry / due date"><Input type="date" value={expiryDate} onChange={setExpiryDate} /></Field> : null}
          {documentType?.requires_supplier || documentType?.category === "invoice" ? <Field label="Supplier"><Input value={supplier} onChange={setSupplier} /></Field> : null}
          {documentType?.requires_invoice_number || documentType?.category === "invoice" ? <Field label="Invoice number"><Input value={invoiceNumber} onChange={setInvoiceNumber} /></Field> : null}
          {documentType?.requires_cost || documentType?.category === "invoice" ? <Field label="Amount inc GST"><Input type="number" value={amountIncGst} onChange={setAmountIncGst} /></Field> : null}
        </div>
        {documentType ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600"><div><span className="font-black">Storage:</span> {titleCase(documentType.category)}</div><div className="mt-1"><span className="font-black">Behaviour:</span> {documentType.replacement_mode === "current" ? "New upload supersedes the previous current version" : "Historical — every upload is retained"}</div>{preview ? <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3"><div className="text-[10px] font-black uppercase tracking-wide text-blue-500">Controlled filename</div><div className="mt-1 break-all font-mono font-black text-blue-900">{preview}</div></div> : null}</div> : null}
        {documentType?.category === "invoice" ? <label className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><input type="checkbox" checked={createFinanceRecord} onChange={(event) => setCreateFinanceRecord(event.target.checked)} className="mt-1" /><span><span className="block text-sm font-black text-emerald-900">Create linked Finance invoice draft</span><span className="mt-1 block text-xs text-emerald-800">The same SharePoint file is referenced by Finance.</span></span></label> : null}
        <ModalActions saving={saving} saveLabel="Upload Document" onCancel={onClose} onSave={() => void submit()} />
      </div>
    </Modal>
  );
}

function InvoiceModal({ assetType, assetId, onClose, apiFetch, onSaved }: { assetType: AssetType; assetId: string; onClose: () => void; apiFetch: (url: string, init?: RequestInit) => Promise<Response>; onSaved: (message: string) => Promise<void> }) {
  const [supplier, setSupplier] = useState(""); const [invoiceNumber, setInvoiceNumber] = useState(""); const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10)); const [description, setDescription] = useState(""); const [amountExGst, setAmountExGst] = useState(""); const [gstAmount, setGstAmount] = useState(""); const [amountIncGst, setAmountIncGst] = useState(""); const [file, setFile] = useState<File | null>(null); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  async function submit() {
    const total = Number(amountIncGst || 0); if (!description.trim()) return setError("Enter what the cost is for."); if (!Number.isFinite(total) || total <= 0) return setError("Enter the invoice / cost amount."); setSaving(true); setError("");
    try { const formData = new FormData(); formData.set("supplier", supplier.trim()); formData.set("invoiceNumber", invoiceNumber.trim()); formData.set("invoiceDate", invoiceDate); formData.set("description", description.trim()); formData.set("amountExGst", amountExGst); formData.set("gstAmount", gstAmount); formData.set("amountIncGst", amountIncGst); if (file) formData.set("file", file); const response = await apiFetch(`/api/assets/${assetType}/${assetId}/invoice`, { method: "POST", body: formData }); const payload = (await response.json()) as { finance?: { submissionNumber?: string }; document?: AssetDocumentRow | null; error?: string }; if (!response.ok) throw new Error(payload.error || "Asset invoice could not be saved."); await onSaved(`${payload.finance?.submissionNumber || "Finance invoice"} created and linked to this asset${payload.document ? ` · ${payload.document.file_name}` : ""}.`); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Asset invoice could not be saved."); } finally { setSaving(false); }
  }
  return <Modal title="Add Asset Cost / Invoice" description="Creates a Finance invoice draft allocated to this Asset. If you attach the invoice, it is stored in the configured Asset SharePoint Invoices folder." onClose={onClose}><div className="space-y-4">{error ? <ErrorBox text={error} /> : null}<div className="grid gap-4 sm:grid-cols-2"><Field label="Supplier"><Input value={supplier} onChange={setSupplier} /></Field><Field label="Invoice number"><Input value={invoiceNumber} onChange={setInvoiceNumber} /></Field><Field label="Invoice / expense date"><Input type="date" value={invoiceDate} onChange={setInvoiceDate} /></Field><Field label="Description"><Input value={description} onChange={setDescription} placeholder="Service, tyres, parts, registration..." /></Field><Field label="Amount ex GST"><Input type="number" value={amountExGst} onChange={setAmountExGst} /></Field><Field label="GST"><Input type="number" value={gstAmount} onChange={setGstAmount} /></Field><Field label="Amount inc GST"><Input type="number" value={amountIncGst} onChange={setAmountIncGst} /></Field><Field label="Invoice / supporting PDF"><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="input" /></Field></div><ModalActions saving={saving} saveLabel="Create Linked Finance Invoice" onCancel={onClose} onSave={() => void submit()} /></div></Modal>;
}

function Metric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: ReactNode }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</div><div className="text-slate-400">{icon}</div></div><div className="mt-3 break-words text-2xl font-black tracking-tight text-slate-950">{value}</div><div className="mt-1 text-xs font-medium text-slate-500">{detail}</div></div>; }
function Info({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) { return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</div><div className={`mt-2 text-sm font-bold text-slate-800 ${multiline ? "whitespace-pre-wrap leading-6" : ""}`}>{value || "—"}</div></div>; }
function SmallText({ label, value }: { label: string; value: string | null }) { return <div><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">{value || "—"}</div></div>; }
function SummaryList({ title, empty, rows }: { title: string; empty: string; rows: Array<{ key: string; title: string; meta: string; right?: string }> }) { return <section className="overflow-hidden rounded-2xl border border-slate-200"><div className="border-b border-slate-200 bg-slate-50 px-4 py-3 font-black text-slate-900">{title}</div>{rows.length === 0 ? <div className="p-6 text-sm font-semibold text-slate-400">{empty}</div> : <div className="divide-y divide-slate-100">{rows.map((row) => <div key={row.key} className="flex items-start justify-between gap-3 px-4 py-3"><div className="min-w-0"><div className="truncate text-sm font-black text-slate-900">{row.title}</div><div className="mt-1 text-xs text-slate-500">{row.meta}</div></div>{row.right ? <div className="shrink-0 text-xs font-black text-slate-700">{row.right}</div> : null}</div>)}</div>}</section>; }
function StatusBadge({ label, tone }: { label: string; tone: string }) { const classes = tone === "emerald" ? "bg-emerald-100 text-emerald-800" : tone === "rose" ? "bg-rose-100 text-rose-800" : tone === "amber" ? "bg-amber-100 text-amber-800" : tone === "blue" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"; return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${classes}`}>{label || "—"}</span>; }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm font-semibold text-slate-400">{text}</div>; }
function ErrorBox({ text }: { text: string }) { return <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{text}</div>; }
function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) { return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 sm:p-8"><div className="my-auto w-full max-w-3xl rounded-3xl border border-slate-200 bg-white shadow-2xl"><div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5"><div><h2 className="text-xl font-black text-slate-950">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{description}</p></div><button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={20} /></button></div><div className="p-6">{children}</div></div></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-2 block text-sm font-black text-slate-800">{label}</span>{children}</label>; }
function Input({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) { return <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="input" />; }
function ModalActions({ saving, saveLabel, onCancel, onSave }: { saving: boolean; saveLabel: string; onCancel: () => void; onSave: () => void }) { return <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={onCancel} disabled={saving} className="action-secondary disabled:opacity-50">Cancel</button><button type="button" onClick={onSave} disabled={saving} className="action-primary disabled:opacity-50">{saving ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}{saveLabel}</button></div>; }
function dateOrText(label: string, value: unknown) { if (/(date|service|expiry|due|risk assessment)/i.test(label)) return dateLabel(value); if (/(km|hours)/i.test(label) && clean(value)) return numberLabel(value, /hours/i.test(label) ? "h" : "km"); return clean(value) || "—"; }
