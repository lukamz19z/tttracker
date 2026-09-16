"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Building2, Image as ImageIcon, Loader2, Save, Upload } from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase";

type BrandingRecord = {
  company_name: string;
  logo_file_name: string | null;
  logo_content_type: string | null;
  logo_sharepoint_item_id: string | null;
  logo_sharepoint_drive_id: string | null;
  logo_updated_at: string | null;
  abn: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
};

type BrandingResponse = { branding?: BrandingRecord; logo_url?: string | null; error?: string };

const EMPTY: BrandingRecord = {
  company_name: "BC Contracting",
  logo_file_name: null,
  logo_content_type: null,
  logo_sharepoint_item_id: null,
  logo_sharepoint_drive_id: null,
  logo_updated_at: null,
  abn: null,
  address_line_1: null,
  address_line_2: null,
  suburb: null,
  state: null,
  postcode: null,
  phone: null,
  email: null,
  website: null,
};

export function AdminBrandingPanel() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [branding, setBranding] = useState<BrandingRecord>(EMPTY);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const apiFetch = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your session has expired.");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${session.access_token}`);
    return fetch(input, { ...init, headers, cache: "no-store" });
  }, [supabase]);

  const load = useCallback(async () => {
    const response = await apiFetch("/api/admin/branding");
    const payload = (await response.json()) as BrandingResponse;
    if (!response.ok) throw new Error(payload.error ?? "Could not load branding.");
    if (payload.branding) setBranding(payload.branding);
    setLogoUrl(payload.logo_url ?? null);
    setFile(null);
  }, [apiFetch]);

  useEffect(() => {
    void load().catch((error) => setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not load branding." })).finally(() => setLoading(false));
  }, [load]);

  async function save() {
    if (!branding.company_name.trim()) { setMessage({ tone: "error", text: "Enter the company name." }); return; }
    if (file && !["image/png", "image/jpeg"].includes(file.type)) { setMessage({ tone: "error", text: "The logo must be PNG or JPEG." }); return; }
    if (file && file.size > 2 * 1024 * 1024) { setMessage({ tone: "error", text: "The logo must be smaller than 2 MB." }); return; }

    setSaving(true); setMessage(null);
    try {
      const form = new FormData();
      for (const [key, value] of Object.entries(branding)) {
        if (["logo_file_name", "logo_content_type", "logo_sharepoint_item_id", "logo_sharepoint_drive_id", "logo_updated_at"].includes(key)) continue;
        form.set(key, String(value ?? ""));
      }
      if (file) form.set("logo", file);

      const response = await apiFetch("/api/admin/branding", { method: "POST", body: form });
      const payload = (await response.json()) as BrandingResponse;
      if (!response.ok) throw new Error(payload.error ?? "Could not save branding.");
      if (payload.branding) setBranding(payload.branding);
      setLogoUrl(payload.logo_url ?? null);
      setFile(null);
      setMessage({ tone: "success", text: "Document branding updated." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not save branding." });
    } finally { setSaving(false); }
  }

  async function removeLogo() {
    if (!window.confirm("Remove the current document logo?")) return;
    setSaving(true);
    try {
      const response = await apiFetch("/api/admin/branding", { method: "DELETE" });
      const payload = (await response.json()) as BrandingResponse;
      if (!response.ok) throw new Error(payload.error ?? "Could not remove logo.");
      if (payload.branding) setBranding(payload.branding);
      setLogoUrl(null); setFile(null);
      setMessage({ tone: "success", text: "Document logo removed." });
    } catch (error) { setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not remove logo." }); }
    finally { setSaving(false); }
  }

  if (loading) return <section className="flex min-h-72 items-center justify-center rounded-3xl border border-slate-200 bg-white"><Loader2 size={28} className="animate-spin text-slate-400" /></section>;

  const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2";
  return <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-200 px-6 py-5"><div className="flex items-center gap-3"><div className="rounded-2xl bg-slate-100 p-3 text-slate-700"><Building2 size={22} /></div><div><h2 className="text-xl font-bold text-slate-950">Document Branding</h2><p className="mt-1 text-sm text-slate-500">Company branding used on TTTracker generated documents.</p></div></div></div>
    {message ? <div className={`m-6 mb-0 rounded-2xl border px-4 py-3 text-sm font-semibold ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{message.text}</div> : null}
    <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <Field label="Company name"><input value={branding.company_name} onChange={(e) => setBranding((c) => ({ ...c, company_name: e.target.value }))} className={inputClass} /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="ABN"><input value={branding.abn ?? ""} onChange={(e) => setBranding((c) => ({ ...c, abn: e.target.value }))} className={inputClass} /></Field><Field label="Phone"><input value={branding.phone ?? ""} onChange={(e) => setBranding((c) => ({ ...c, phone: e.target.value }))} className={inputClass} /></Field><Field label="Email"><input type="email" value={branding.email ?? ""} onChange={(e) => setBranding((c) => ({ ...c, email: e.target.value }))} className={inputClass} /></Field><Field label="Website"><input value={branding.website ?? ""} onChange={(e) => setBranding((c) => ({ ...c, website: e.target.value }))} className={inputClass} /></Field></div>
        <Field label="Address line 1"><input value={branding.address_line_1 ?? ""} onChange={(e) => setBranding((c) => ({ ...c, address_line_1: e.target.value }))} className={inputClass} /></Field>
        <Field label="Address line 2"><input value={branding.address_line_2 ?? ""} onChange={(e) => setBranding((c) => ({ ...c, address_line_2: e.target.value }))} className={inputClass} /></Field>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px_120px]"><Field label="Suburb"><input value={branding.suburb ?? ""} onChange={(e) => setBranding((c) => ({ ...c, suburb: e.target.value }))} className={inputClass} /></Field><Field label="State"><input value={branding.state ?? ""} onChange={(e) => setBranding((c) => ({ ...c, state: e.target.value }))} className={inputClass} /></Field><Field label="Postcode"><input value={branding.postcode ?? ""} onChange={(e) => setBranding((c) => ({ ...c, postcode: e.target.value }))} className={inputClass} /></Field></div>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-sm font-semibold text-slate-700"><Upload size={18} />{file ? file.name : "Choose logo"}<input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        <div className="flex gap-2 border-t border-slate-200 pt-5"><button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Branding</button>{branding.logo_sharepoint_item_id ? <button type="button" onClick={() => void removeLogo()} disabled={saving} className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700">Remove Logo</button> : null}</div>
      </div>
      <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Preview</div><div className="mt-3 rounded-2xl border border-slate-200 p-5"><div className="flex items-center gap-4"><div className="flex h-16 w-24 items-center justify-center overflow-hidden rounded-xl border border-slate-200 p-2">{logoUrl ? <Image src={logoUrl} alt="Company logo" width={96} height={64} unoptimized className="max-h-full max-w-full object-contain" /> : <ImageIcon size={25} className="text-slate-300" />}</div><div><div className="text-sm font-bold text-slate-950">{branding.company_name}</div>{branding.abn ? <div className="mt-1 text-xs text-slate-500">ABN {branding.abn}</div> : null}</div></div><div className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">{[branding.address_line_1, branding.address_line_2].filter(Boolean).join(", ")}<br />{[branding.suburb, branding.state, branding.postcode].filter(Boolean).join(" ")}<br />{branding.phone}<br />{branding.email}<br />{branding.website}</div></div></div>
    </div>
  </section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-sm font-bold text-slate-800">{label}</span>{children}</label>; }
