"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Bell, Check, LoaderCircle, Plus, Save, Search, Trash2 } from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase";

type Recipient = { id: string; name: string; role: string };
type Rule = Record<string, boolean | string | null> & { user_id: string; available_for_selection?: boolean };
const events = [
  ["notify_raised", "New Missing / Excess Material"], ["notify_assignment", "Assignment"], ["notify_urgent", "Urgent / Critical"], ["notify_update", "Update / Action"],
  ["notify_partial_receipt", "Partial Receipt / Collection"], ["notify_full_receipt", "Received / Collected"], ["notify_resolved", "Resolved"], ["notify_cancel", "Cancelled"],
] as const;
const channels = [["receives_in_app", "In-app"], ["receives_push", "Push"], ["receives_email", "Email"]] as const;
const base = (id: string): Rule => ({ user_id: id, available_for_selection: true, notify_raised: false, notify_urgent: false, notify_assignment: false, notify_update: false, notify_partial_receipt: false, notify_full_receipt: false, notify_resolved: false, notify_cancel: false, receives_in_app: true, receives_push: true, receives_email: false, active: false });

export default function MaterialsNotificationSettingsPage() {
  const params = useParams<{ projectId: string }>(), projectId = String(params.projectId || "");
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [projectUsers, setProjectUsers] = useState<Recipient[]>([]), [rules, setRules] = useState<Record<string, Rule>>({});
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState<string | null>(null), [error, setError] = useState(""), [saved, setSaved] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false), [userSearch, setUserSearch] = useState("");
  const [evidenceStorage, setEvidenceStorage] = useState({ evidence_sharepoint_drive_id: "", evidence_sharepoint_folder_id: "" }), [storageSaving, setStorageSaving] = useState(false), [storageSaved, setStorageSaved] = useState(false);
  const api = useCallback(async (url: string, init: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your session has expired.");
    const headers = new Headers(init.headers); headers.set("Authorization", `Bearer ${session.access_token}`);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(url, { ...init, headers, cache: "no-store" }), body = await response.json();
    if (!response.ok) throw new Error(body.error || "Materials settings could not be saved.");
    return body;
  }, [supabase]);
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [result, storage] = await Promise.all([
        api(`/api/materials/missing/notification-settings?projectId=${encodeURIComponent(projectId)}`),
        api(`/api/materials/missing/storage-settings?projectId=${encodeURIComponent(projectId)}`),
      ]);
      setProjectUsers(result.projectUsers || []);
      setRules(Object.fromEntries((result.rules || []).map((row: Rule) => [row.user_id, row])));
      setEvidenceStorage({ evidence_sharepoint_drive_id: storage.settings.evidence_sharepoint_drive_id || "", evidence_sharepoint_folder_id: storage.settings.evidence_sharepoint_folder_id || "" });
    } catch (e) { setError(e instanceof Error ? e.message : "Settings could not be loaded."); }
    finally { setLoading(false); }
  }, [api, projectId]);
  useEffect(() => { if (projectId) void refresh(); }, [projectId, refresh]);

  async function save(id: string, next: Rule) {
    setSaving(id); setError(""); setSaved(null);
    try {
      const result = await api("/api/materials/missing/notification-settings", { method: "PUT", body: JSON.stringify({ projectId, ...next, userId: id }) });
      setRules(current => ({ ...current, [id]: result.rule })); setSaved(id); setTimeout(() => setSaved(current => current === id ? null : current), 1800);
    } catch (e) { setError(e instanceof Error ? e.message : "Settings could not be saved."); }
    finally { setSaving(null); }
  }
  async function addUser(person: Recipient) {
    setSaving(person.id); setError("");
    try {
      const result = await api("/api/materials/missing/notification-settings", { method: "PUT", body: JSON.stringify({ projectId, userId: person.id, availableForSelection: true }) });
      setRules(current => ({ ...current, [person.id]: result.rule })); setAddOpen(false); setUserSearch("");
    } catch (e) { setError(e instanceof Error ? e.message : "Recipient could not be added."); }
    finally { setSaving(null); }
  }
  async function removeUser(id: string) {
    setSaving(id); setError("");
    try {
      await api("/api/materials/missing/notification-settings", { method: "DELETE", body: JSON.stringify({ projectId, userId: id }) });
      setRules(current => ({ ...current, [id]: { ...(current[id] || base(id)), available_for_selection: false } }));
    } catch (e) { setError(e instanceof Error ? e.message : "Recipient could not be removed."); }
    finally { setSaving(null); }
  }
  async function saveEvidenceStorage() {
    setStorageSaving(true); setError(""); setStorageSaved(false);
    try {
      const result = await api("/api/materials/missing/storage-settings", { method: "PUT", body: JSON.stringify({ projectId, evidenceSharepointDriveId: evidenceStorage.evidence_sharepoint_drive_id, evidenceSharepointFolderId: evidenceStorage.evidence_sharepoint_folder_id }) });
      setEvidenceStorage({ evidence_sharepoint_drive_id: result.settings.evidence_sharepoint_drive_id || "", evidence_sharepoint_folder_id: result.settings.evidence_sharepoint_folder_id || "" }); setStorageSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Storage settings could not be saved."); }
    finally { setStorageSaving(false); }
  }
  function update(id: string, key: string, value: boolean) { const next = { ...(rules[id] || base(id)), [key]: value } as Rule; setRules(current => ({ ...current, [id]: next })); }

  const configured = projectUsers.filter(person => rules[person.id]?.available_for_selection === true);
  const addOptions = projectUsers.filter(person => rules[person.id]?.available_for_selection !== true && `${person.name} ${person.role}`.toLowerCase().includes(userSearch.trim().toLowerCase()));

  return <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-7">
    <header className="flex items-start gap-3"><div className="rounded-xl bg-amber-100 p-2 text-amber-800"><Bell size={20} /></div><div><h1 className="text-2xl font-black text-slate-950">Missing / Excess Materials Notifications</h1><p className="mt-1 text-sm text-slate-600">Choose who can be selected for an individual issue. Being on this list does not subscribe someone to automatic notifications.</p></div></header>
    {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}<button type="button" onClick={() => void refresh()} className="ml-3 underline">Retry</button></div> : null}
    {loading ? <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={17} />Loading Materials settings and project users…</div> : <>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black text-slate-950">Notification Users</h2><p className="mt-1 text-xs text-slate-500">Only these project users appear in the Missing / Excess “Also Notify” picker.</p></div><button type="button" onClick={() => setAddOpen(value => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white"><Plus size={16} />Add User</button></div>
        {addOpen ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3"><label className="relative block"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input autoFocus value={userSearch} onChange={event => setUserSearch(event.target.value)} placeholder="Search project users by name or role" className="min-h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm" /></label><div className="mt-2 max-h-56 overflow-y-auto">{addOptions.length ? addOptions.map(person => <button key={person.id} type="button" disabled={saving === person.id} onClick={() => void addUser(person)} className="flex min-h-12 w-full items-center justify-between border-b border-slate-200 px-2 text-left hover:bg-white disabled:opacity-50"><span><span className="block text-sm font-bold text-slate-800">{person.name}</span><span className="text-xs text-slate-500">{person.role.replaceAll("_", " ")}</span></span>{saving === person.id ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />}</button>) : <p className="p-3 text-sm text-slate-500">No matching project users are available to add.</p>}</div></div> : null}
        <div className="mt-4 space-y-2">{configured.length ? configured.map(person => {
          const rule = rules[person.id] || base(person.id);
          return <article key={person.id} className="rounded-xl border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-slate-900">{person.name}</h3><p className="text-xs capitalize text-slate-500">{person.role.replaceAll("_", " ")}</p></div><div className="flex items-center gap-3"><button type="button" disabled={saving === person.id} onClick={() => void removeUser(person.id)} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-3 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 size={14} />Remove</button></div></div>
            <details className="mt-3 rounded-lg bg-slate-50 p-3"><summary className="cursor-pointer text-xs font-bold text-slate-700">Optional automatic notifications</summary><p className="mt-2 text-xs text-slate-500">These event preferences are separate from being available in the “Also Notify” picker.</p><label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={rule.active === true} onChange={event => update(person.id, "active", event.target.checked)} />Enable automatic notifications for selected events</label><div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto]"><div><div className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-400">Events</div><div className="grid gap-2 sm:grid-cols-2">{events.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={rule[key] === true} onChange={event => update(person.id, key, event.target.checked)} />{label}</label>)}</div></div><div><div className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-400">Channels</div><div className="flex flex-wrap gap-3 lg:flex-col">{channels.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={rule[key] === true} onChange={event => update(person.id, key, event.target.checked)} />{label}</label>)}</div></div></div><div className="mt-3 flex justify-end"><button type="button" disabled={saving === person.id} onClick={() => void save(person.id, rule)} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-black text-white disabled:opacity-50">{saving === person.id ? <LoaderCircle className="animate-spin" size={14} /> : saved === person.id ? <Check size={14} /> : <Save size={14} />}{saved === person.id ? "Saved" : "Save automatic settings"}</button></div></details>
          </article>;
        }) : <div className="rounded-xl border border-dashed p-5 text-sm text-slate-500">No notification users configured. Add project users to make them available in mobile and website issue forms.</div>}</div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-black text-slate-950">Receipt evidence storage</h2><p className="mt-1 text-xs text-slate-500">Files remain in private controlled storage. Add a project SharePoint drive and folder ID to publish receipt evidence there as well.</p><div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-xs font-bold text-slate-600">SharePoint drive ID<input value={evidenceStorage.evidence_sharepoint_drive_id} onChange={event => setEvidenceStorage(value => ({ ...value, evidence_sharepoint_drive_id: event.target.value }))} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" placeholder="Optional" /></label><label className="text-xs font-bold text-slate-600">Destination folder ID<input value={evidenceStorage.evidence_sharepoint_folder_id} onChange={event => setEvidenceStorage(value => ({ ...value, evidence_sharepoint_folder_id: event.target.value }))} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" placeholder="Optional" /></label></div><button type="button" onClick={() => void saveEvidenceStorage()} disabled={storageSaving} className="mt-3 min-h-10 rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-50">{storageSaving ? "Saving…" : storageSaved ? "Saved" : "Save storage"}</button></section>
    </>}
  </main>;
}
