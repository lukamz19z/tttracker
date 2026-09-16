"use client";

import {
  CheckCircle2,
  FileCog,
  Loader2,
  Pencil,
  Plus,
  Save,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  ASSET_NAMING_TOKENS,
  exampleAssetDocumentFileName,
} from "@/lib/assets/document-naming";
import type {
  AssetDocumentAppliesTo,
  AssetDocumentCategory,
  AssetDocumentDateRequirement,
  AssetDocumentDateSource,
  AssetDocumentReplacementMode,
  AssetDocumentTypeRow,
} from "@/lib/assets/types";
import { createSupabaseBrowser } from "@/lib/supabase";

type Payload = {
  documentTypes?: AssetDocumentTypeRow[];
  canConfigure?: boolean;
  error?: string;
};

type Draft = {
  id: string | null;
  systemKey: string | null;
  name: string;
  code: string;
  category: AssetDocumentCategory;
  appliesTo: AssetDocumentAppliesTo;
  dateRequirement: AssetDocumentDateRequirement;
  namingDateSource: AssetDocumentDateSource;
  namingTemplate: string;
  replacementMode: AssetDocumentReplacementMode;
  assetFieldMapping: string;
  assetFieldSource: AssetDocumentDateSource;
  requiresSupplier: boolean;
  requiresInvoiceNumber: boolean;
  requiresCost: boolean;
  active: boolean;
  sortOrder: string;
};

const EMPTY_DRAFT: Draft = {
  id: null,
  systemKey: null,
  name: "",
  code: "",
  category: "other",
  appliesTo: "both",
  dateRequirement: "none",
  namingDateSource: "document_date",
  namingTemplate: "{ASSET}-{REGO}-{CODE}",
  replacementMode: "historical",
  assetFieldMapping: "",
  assetFieldSource: "expiry_date",
  requiresSupplier: false,
  requiresInvoiceNumber: false,
  requiresCost: false,
  active: true,
  sortOrder: "100",
};

const FIELD_MAPPINGS = [
  { value: "", label: "Do not update an Asset master field" },
  { value: "rego_expiry", label: "Rego Expiry" },
  { value: "insurance_expiry", label: "Insurance Expiry" },
  { value: "cranesafe_expiry", label: "CraneSafe Expiry (Plant)" },
  { value: "ten_year_inspection_due", label: "10 Year Inspection Due (Plant)" },
  { value: "next_inspection_due", label: "Next Inspection Due" },
  { value: "next_service_due", label: "Next Service Due" },
  { value: "risk_assessment_date", label: "Risk Assessment Date" },
];

function titleCase(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function toDraft(row: AssetDocumentTypeRow): Draft {
  return {
    id: row.id,
    systemKey: row.system_key,
    name: row.name,
    code: row.code,
    category: row.category,
    appliesTo: row.applies_to,
    dateRequirement: row.date_requirement,
    namingDateSource: row.naming_date_source,
    namingTemplate: row.naming_template,
    replacementMode: row.replacement_mode,
    assetFieldMapping: row.asset_field_mapping ?? "",
    assetFieldSource: row.asset_field_source ?? "expiry_date",
    requiresSupplier: row.requires_supplier,
    requiresInvoiceNumber: row.requires_invoice_number,
    requiresCost: row.requires_cost,
    active: row.active,
    sortOrder: String(row.sort_order),
  };
}

export default function AssetDocumentTypesPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [rows, setRows] = useState<AssetDocumentTypeRow[]>([]);
  const [canConfigure, setCanConfigure] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const apiFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) throw new Error("Your session has expired. Sign in again.");

      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${session.access_token}`);
      if (typeof init.body === "string" && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      return fetch(url, { ...init, headers, cache: "no-store" });
    },
    [supabase],
  );

  const load = useCallback(async () => {
    const response = await apiFetch("/api/assets/document-types");
    const payload = (await response.json()) as Payload;
    if (!response.ok) throw new Error(payload.error || "Document Types could not be loaded.");
    setRows(payload.documentTypes ?? []);
    setCanConfigure(Boolean(payload.canConfigure));
  }, [apiFetch]);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch (error) {
        setMessage({
          tone: "error",
          text: error instanceof Error ? error.message : "Document Types could not be loaded.",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const preview = useMemo(() => {
    if (!draft) return "";
    try {
      return exampleAssetDocumentFileName({
        code: draft.code || "DOC",
        naming_template: draft.namingTemplate,
        naming_date_source: draft.namingDateSource,
      });
    } catch (error) {
      return error instanceof Error ? error.message : "Invalid naming convention";
    }
  }, [draft]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setMessage(null);

    try {
      const body = JSON.stringify({
        name: draft.name,
        code: draft.code,
        category: draft.category,
        appliesTo: draft.appliesTo,
        dateRequirement: draft.dateRequirement,
        namingDateSource: draft.namingDateSource,
        namingTemplate: draft.namingTemplate,
        replacementMode: draft.replacementMode,
        assetFieldMapping: draft.assetFieldMapping,
        assetFieldSource: draft.assetFieldSource,
        requiresSupplier: draft.requiresSupplier,
        requiresInvoiceNumber: draft.requiresInvoiceNumber,
        requiresCost: draft.requiresCost,
        active: draft.active,
        sortOrder: Number(draft.sortOrder) || 100,
      });

      const response = await apiFetch(
        draft.id ? `/api/assets/document-types/${draft.id}` : "/api/assets/document-types",
        { method: draft.id ? "PATCH" : "POST", body },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Document Type could not be saved.");

      await load();
      setDraft(null);
      setMessage({ tone: "success", text: "Asset document type saved." });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Document Type could not be saved.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
              <FileCog size={23} />
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Assets · Configuration</div>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">Document Types & Naming</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Configure controlled Asset document types, automatic filenames, current-versus-historical behaviour and the Asset field that a current document updates.
              </p>
            </div>
          </div>

          {canConfigure ? (
            <button
              type="button"
              onClick={() => setDraft({ ...EMPTY_DRAFT })}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white"
            >
              <Plus size={16} />
              Add Document Type
            </button>
          ) : null}
        </div>
      </section>

      {message ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          {message.text}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Document Type</th>
                <th className="px-5 py-3">Code</th>
                <th className="px-5 py-3">Applies</th>
                <th className="px-5 py-3">Date Rule</th>
                <th className="px-5 py-3">Naming Convention</th>
                <th className="px-5 py-3">Behaviour</th>
                <th className="px-5 py-3">Active</th>
                <th className="px-5 py-3 text-right">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-16 text-center"><Loader2 size={26} className="mx-auto animate-spin text-slate-400" /></td></tr>
              ) : rows.map((row) => (
                <tr key={row.id} className="align-top hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <div className="font-black text-slate-950">{row.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{titleCase(row.category)}{row.system_key ? ` · System: ${row.system_key}` : " · Custom"}</div>
                  </td>
                  <td className="px-5 py-4 font-mono font-black text-slate-800">{row.code}</td>
                  <td className="px-5 py-4 text-slate-600">{titleCase(row.applies_to)}</td>
                  <td className="px-5 py-4 text-slate-600">{titleCase(row.date_requirement)}</td>
                  <td className="px-5 py-4">
                    <code className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{row.naming_template}</code>
                    <div className="mt-2 text-xs text-slate-400">{exampleAssetDocumentFileName(row)}</div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${row.replacement_mode === "current" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"}`}>
                      {row.replacement_mode === "current" ? "Current / supersedes" : "Historical"}
                    </span>
                    {row.asset_field_mapping ? <div className="mt-2 text-xs text-slate-500">Updates {row.asset_field_mapping}</div> : null}
                  </td>
                  <td className="px-5 py-4">
                    {row.active ? <CheckCircle2 size={18} className="text-emerald-600" /> : <span className="text-xs font-bold text-slate-400">Inactive</span>}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {canConfigure ? (
                      <button type="button" onClick={() => setDraft(toDraft(row))} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">
                        <Pencil size={14} /> Edit
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {draft ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 sm:p-8">
          <div className="my-auto w-full max-w-4xl rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <h2 className="text-xl font-black text-slate-950">{draft.id ? `Edit ${draft.name}` : "Add Asset Document Type"}</h2>
                <p className="mt-1 text-sm text-slate-500">System integrations use the stable system key; you can change the visible name, code and naming convention without breaking Service or Risk Assessment links.</p>
              </div>
              <button type="button" onClick={() => setDraft(null)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
            </div>

            <div className="space-y-5 p-6">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Field label="Document Type"><Input value={draft.name} onChange={(value) => setDraft((current) => current ? { ...current, name: value } : current)} /></Field>
                <Field label="Code"><Input value={draft.code} onChange={(value) => setDraft((current) => current ? { ...current, code: value.toUpperCase().replace(/[^A-Z0-9-]/g, "") } : current)} /></Field>
                <Field label="Category">
                  <Select value={draft.category} onChange={(value) => setDraft((current) => current ? { ...current, category: value as AssetDocumentCategory } : current)} options={["compliance", "service", "invoice", "inspection", "manual", "photo", "other"]} />
                </Field>
                <Field label="Applies To">
                  <Select value={draft.appliesTo} onChange={(value) => setDraft((current) => current ? { ...current, appliesTo: value as AssetDocumentAppliesTo } : current)} options={["both", "vehicle", "plant"]} />
                </Field>
                <Field label="Date Requirement">
                  <Select value={draft.dateRequirement} onChange={(value) => setDraft((current) => current ? { ...current, dateRequirement: value as AssetDocumentDateRequirement } : current)} options={["none", "document_date", "expiry_date", "document_and_expiry"]} />
                </Field>
                <Field label="{DATE} uses">
                  <Select value={draft.namingDateSource} onChange={(value) => setDraft((current) => current ? { ...current, namingDateSource: value as AssetDocumentDateSource } : current)} options={["document_date", "expiry_date"]} />
                </Field>
                <Field label="Replacement Behaviour">
                  <Select value={draft.replacementMode} onChange={(value) => setDraft((current) => current ? { ...current, replacementMode: value as AssetDocumentReplacementMode } : current)} options={["historical", "current"]} />
                </Field>
                <Field label="Update Asset Field">
                  <select value={draft.assetFieldMapping} onChange={(event) => setDraft((current) => current ? { ...current, assetFieldMapping: event.target.value } : current)} className="input">
                    {FIELD_MAPPINGS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </Field>
                <Field label="Field value comes from">
                  <Select value={draft.assetFieldSource} onChange={(value) => setDraft((current) => current ? { ...current, assetFieldSource: value as AssetDocumentDateSource } : current)} options={["document_date", "expiry_date"]} disabled={!draft.assetFieldMapping} />
                </Field>
                <Field label="Sort Order"><Input type="number" value={draft.sortOrder} onChange={(value) => setDraft((current) => current ? { ...current, sortOrder: value } : current)} /></Field>
              </div>

              <Field label="Naming Convention">
                <Input value={draft.namingTemplate} onChange={(value) => setDraft((current) => current ? { ...current, namingTemplate: value.toUpperCase() } : current)} />
              </Field>

              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <div className="text-xs font-black uppercase tracking-wide text-blue-700">Live filename preview</div>
                <div className="mt-2 break-all font-mono text-sm font-black text-blue-950">{preview}</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {ASSET_NAMING_TOKENS.map((token) => (
                    <button key={token} type="button" onClick={() => setDraft((current) => current ? { ...current, namingTemplate: `${current.namingTemplate}${token}` } : current)} className="rounded-lg border border-blue-200 bg-white px-2 py-1 font-mono text-[11px] font-bold text-blue-800">
                      {token}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <Check label="Current / Active" checked={draft.active} onChange={(value) => setDraft((current) => current ? { ...current, active: value } : current)} />
                <Check label="Require Supplier" checked={draft.requiresSupplier} onChange={(value) => setDraft((current) => current ? { ...current, requiresSupplier: value } : current)} />
                <Check label="Require Invoice Number" checked={draft.requiresInvoiceNumber} onChange={(value) => setDraft((current) => current ? { ...current, requiresInvoiceNumber: value } : current)} />
                <Check label="Require Cost" checked={draft.requiresCost} onChange={(value) => setDraft((current) => current ? { ...current, requiresCost: value } : current)} />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
                <button type="button" onClick={() => setDraft(null)} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700">Cancel</button>
                <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Document Type
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .input { width: 100%; border-radius: .75rem; border: 1px solid rgb(226 232 240); background: white; padding: .625rem .75rem; font-size: .875rem; outline: none; }
        .input:focus { box-shadow: 0 0 0 2px rgb(219 234 254); }
        .input:disabled { background: rgb(248 250 252); color: rgb(148 163 184); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-black text-slate-800">{label}</span>{children}</label>;
}

function Input({ value, onChange, type = "text" }: { value: string; onChange: (value: string) => void; type?: string }) {
  return <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="input" />;
}

function Select({ value, onChange, options, disabled }: { value: string; onChange: (value: string) => void; options: string[]; disabled?: boolean }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="input">
      {options.map((option) => <option key={option} value={option}>{titleCase(option)}</option>)}
    </select>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-700">
      {label}
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
