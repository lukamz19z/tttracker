"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  FolderSync,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { createSupabaseBrowser } from "@/lib/supabase";
import type {
  EquipmentDocumentRow,
  EquipmentDocumentTypeRow,
  EquipmentType,
} from "@/lib/assets/equipment-sharepoint";

type Payload = {
  equipmentType: EquipmentType;
  equipmentId: string;
  item: Record<string, unknown>;
  label: string;
  documents: EquipmentDocumentRow[];
  documentTypes: EquipmentDocumentTypeRow[];
  sharePoint: {
    sharepoint_web_url?: string | null;
    sharepoint_folder_name?: string | null;
  } | null;
  canManage: boolean;
  error?: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function dateLabel(value: unknown) {
  const raw = clean(value);
  if (!raw) return "—";
  const parsed = new Date(`${raw.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function titleCase(value: unknown) {
  return clean(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function EquipmentDocumentDetail() {
  const params = useParams<{ equipmentType: string; equipmentId: string }>();
  const equipmentType = params.equipmentType;
  const equipmentId = params.equipmentId;
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);

  const apiFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session?.access_token) throw new Error("Your session has expired. Sign in again.");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${auth.session.access_token}`);
    return fetch(url, { ...init, headers, cache: "no-store" });
  }, [supabase]);

  const fetchData = useCallback(async () => {
    const response = await apiFetch(`/api/assets/equipment/${equipmentType}/${equipmentId}`);
    const payload = (await response.json()) as Payload;
    if (!response.ok) throw new Error(payload.error || "Equipment record could not be loaded.");
    return payload;
  }, [apiFetch, equipmentId, equipmentType]);

  useEffect(() => {
    let cancelled = false;
    void fetchData()
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Equipment record could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchData]);

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      setData(await fetchData());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Equipment record could not be refreshed.");
    } finally {
      setRefreshing(false);
    }
  }

  async function syncFolder() {
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(`/api/assets/equipment/${equipmentType}/${equipmentId}`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "SharePoint folder could not be created.");
      await refresh();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "SharePoint folder could not be created.");
    } finally {
      setSaving(false);
    }
  }

  async function openDocument(document: EquipmentDocumentRow) {
    const preview = window.open("", "_blank");
    try {
      const response = await apiFetch(`/api/assets/equipment/documents/${document.id}/content`);
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Document could not be opened.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (preview) preview.location.href = url;
      else window.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (openError) {
      preview?.close();
      setError(openError instanceof Error ? openError.message : "Document could not be opened.");
    }
  }

  if (loading) return <div className="flex min-h-[65vh] items-center justify-center"><Loader2 size={30} className="animate-spin text-slate-400" /></div>;
  if (!data) return <div className="p-8 text-sm font-semibold text-rose-700">{error || "Equipment record could not be loaded."}</div>;

  const current = data.documents.filter((row) => row.active);
  const superseded = data.documents.filter((row) => !row.active || Boolean(row.superseded_at));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <Link href="/assets/equipment" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900"><ArrowLeft size={16} /> Back to Equipment</Link>
        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{titleCase(data.equipmentType)}</div>
            <h1 className="mt-1 text-3xl font-black text-slate-950">{data.label}</h1>
            <p className="mt-2 text-sm text-slate-500">All equipment attachments are stored in SharePoint. TTTracker only stores the register metadata and SharePoint references.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void refresh()} disabled={refreshing} className="action-secondary"><RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> Refresh</button>
            {data.canManage ? <button type="button" onClick={() => setUploadOpen(true)} className="action-primary"><Upload size={16} /> Upload Document</button> : null}
            {data.canManage ? <button type="button" onClick={() => void syncFolder()} disabled={saving} className="action-secondary"><FolderSync size={16} /> Sync SharePoint</button> : null}
            {data.sharePoint?.sharepoint_web_url ? <a href={data.sharePoint.sharepoint_web_url} target="_blank" rel="noreferrer" className="action-secondary"><ExternalLink size={16} /> SharePoint</a> : null}
          </div>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</div> : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-black text-slate-950">Equipment Record</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(data.item)
            .filter(([key, value]) => !["id", "created_at", "updated_at"].includes(key) && value !== null && value !== "")
            .slice(0, 20)
            .map(([key, value]) => <Info key={key} label={titleCase(key)} value={typeof value === "boolean" ? (value ? "Yes" : "No") : clean(value)} />)}
        </div>
      </section>

      <DocumentSection title="Current / Historical SharePoint Documents" rows={current} onOpen={openDocument} empty="No SharePoint documents have been uploaded for this item." />
      <DocumentSection title="Superseded SharePoint Documents" rows={superseded} onOpen={openDocument} empty="No superseded equipment documents." />

      {uploadOpen ? <UploadModal equipmentType={data.equipmentType} equipmentId={data.equipmentId} documentTypes={data.documentTypes} apiFetch={apiFetch} onClose={() => setUploadOpen(false)} onSaved={async () => { setUploadOpen(false); await refresh(); }} /> : null}

      <style jsx global>{`
        .action-primary { display:inline-flex; align-items:center; gap:.5rem; border-radius:.75rem; background:rgb(15 23 42); padding:.625rem .875rem; font-size:.875rem; font-weight:900; color:white; }
        .action-secondary { display:inline-flex; align-items:center; gap:.5rem; border-radius:.75rem; border:1px solid rgb(226 232 240); background:white; padding:.625rem .875rem; font-size:.875rem; font-weight:900; color:rgb(51 65 85); }
        .input { width:100%; border-radius:.75rem; border:1px solid rgb(226 232 240); background:white; padding:.625rem .75rem; font-size:.875rem; outline:none; }
      `}</style>
    </div>
  );
}

function UploadModal({ equipmentType, equipmentId, documentTypes, apiFetch, onClose, onSaved }: { equipmentType: EquipmentType; equipmentId: string; documentTypes: EquipmentDocumentTypeRow[]; apiFetch: (url: string, init?: RequestInit) => Promise<Response>; onClose: () => void; onSaved: () => Promise<void> }) {
  const [documentTypeId, setDocumentTypeId] = useState(documentTypes[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [documentDate, setDocumentDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState("");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const type = documentTypes.find((row) => row.id === documentTypeId) ?? null;

  async function submit() {
    if (!file) return setError("Choose a document to upload.");
    if (!documentTypeId) return setError("Select the document type.");
    setSaving(true); setError("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("documentTypeId", documentTypeId);
      formData.set("title", title);
      formData.set("documentDate", documentDate);
      formData.set("expiryDate", expiryDate);
      formData.set("supplier", supplier);
      formData.set("notes", notes);
      const response = await apiFetch(`/api/assets/equipment/${equipmentType}/${equipmentId}/documents`, { method: "POST", body: formData });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Document upload failed.");
      await onSaved();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Document upload failed.");
    } finally { setSaving(false); }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4"><div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl"><div className="border-b border-slate-200 p-5"><h2 className="text-xl font-black">Upload Equipment Document</h2><p className="mt-1 text-sm text-slate-500">The file is uploaded directly to the configured Assets SharePoint library.</p></div><div className="space-y-4 p-5">{error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</div> : null}<div className="grid gap-4 sm:grid-cols-2"><Field label="Document Type"><select value={documentTypeId} onChange={(event) => setDocumentTypeId(event.target.value)} className="input">{documentTypes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field><Field label="File"><input type="file" className="input" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></Field><Field label="Title"><input value={title} onChange={(event) => setTitle(event.target.value)} className="input" /></Field>{type?.date_requirement === "document_date" || type?.date_requirement === "document_and_expiry" ? <Field label="Document / Completion Date"><input type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} className="input" /></Field> : null}{type?.date_requirement === "expiry_date" || type?.date_requirement === "document_and_expiry" ? <Field label="Expiry / Due Date"><input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} className="input" /></Field> : null}<Field label="Supplier"><input value={supplier} onChange={(event) => setSupplier(event.target.value)} className="input" /></Field></div><Field label="Notes"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="input min-h-24" /></Field><div className="flex justify-end gap-2 border-t pt-4"><button type="button" onClick={onClose} className="action-secondary">Cancel</button><button type="button" onClick={() => void submit()} disabled={saving} className="action-primary">{saving ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Upload to SharePoint</button></div></div></div></div>;
}

function DocumentSection({ title, rows, onOpen, empty }: { title: string; rows: EquipmentDocumentRow[]; onOpen: (row: EquipmentDocumentRow) => Promise<void>; empty: string }) {
  return <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-black text-slate-950">{title}</h2></div>{rows.length === 0 ? <div className="p-8 text-sm font-semibold text-slate-400">{empty}</div> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Document</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Date / Expiry</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Open</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id}><td className="px-4 py-4"><div className="font-black text-slate-900">{row.title}</div><div className="mt-1 text-xs text-slate-500">{row.file_name}</div></td><td className="px-4 py-4">{row.document_type_name || titleCase(row.document_category)}</td><td className="px-4 py-4">{dateLabel(row.document_date)}{row.expiry_date ? <div className="mt-1 text-xs text-slate-500">Exp {dateLabel(row.expiry_date)}</div> : null}</td><td className="px-4 py-4">{row.active ? row.is_current ? "Current" : "Historical" : "Superseded"}</td><td className="px-4 py-4 text-right"><button type="button" onClick={() => void onOpen(row)} className="action-secondary"><FileText size={14} /> Open</button></td></tr>)}</tbody></table></div>}</section>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</div><div className="mt-2 break-words text-sm font-bold text-slate-800">{value || "—"}</div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-black text-slate-800">{label}</span>{children}</label>;
}
