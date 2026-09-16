"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, Plus, RefreshCw, Search, Users, X } from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase";

type Role = { id: string; code: string; name: string; description?: string | null };
type Project = { id: string; name: string; project_number?: string | null };
type UserRow = {
  user_id: string;
  email: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  is_active?: boolean;
  employee?: { id: string; full_name: string; role?: string | null } | null;
  role_ids: string[];
  project_ids: string[];
};

type Payload = { users?: UserRow[]; roles?: Role[]; projects?: Project[]; error?: string };

function formatDate(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function AdminAccountsPanel({ onOpenAccess }: { onOpenAccess?: () => void }) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState<UserRow | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const apiFetch = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your session has expired.");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${session.access_token}`);
    return fetch(input, { ...init, headers, cache: "no-store" });
  }, [supabase]);

  const load = useCallback(async () => {
    const response = await apiFetch("/api/admin/access/users");
    const payload = (await response.json()) as Payload;
    if (!response.ok) throw new Error(payload.error ?? "Could not load accounts.");
    setUsers((payload.users ?? []).sort((a, b) => (a.email ?? "").localeCompare(b.email ?? "")));
    setRoles(payload.roles ?? []);
    setProjects(payload.projects ?? []);
  }, [apiFetch]);

  useEffect(() => {
    void load().catch((error) => setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not load accounts." })).finally(() => setLoading(false));
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    try { await load(); } catch (error) { setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not refresh." }); }
    finally { setRefreshing(false); }
  }

  const filtered = users.filter((user) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    const roleNames = user.role_ids.map((id) => roles.find((role) => role.id === id)?.name).filter(Boolean).join(" ");
    return [user.email, user.employee?.full_name, user.employee?.role, roleNames].filter(Boolean).join(" ").toLowerCase().includes(query);
  });

  return (
    <div className="space-y-5">
      {message ? <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{message.text}</div> : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="text-lg font-bold text-slate-950">Login Accounts</h2><p className="mt-1 text-sm text-slate-500">Create logins and reset passwords here. Role and permission changes are managed in Roles & Permissions.</p></div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void refresh()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"><RefreshCw size={15} className={refreshing ? "animate-spin" : ""} /> Refresh</button>
            {onOpenAccess ? <button type="button" onClick={onOpenAccess} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">Manage Access</button> : null}
            <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white"><Plus size={15} /> Create User</button>
          </div>
        </div>
        <label className="relative mt-4 block"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search email, employee or assigned role..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2" /></label>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {loading ? <div className="flex min-h-64 items-center justify-center"><Loader2 size={26} className="animate-spin text-slate-400" /></div> : filtered.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No accounts found.</div> : <div className="divide-y divide-slate-100">{filtered.map((user) => (
          <div key={user.user_id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><div className="truncate font-bold text-slate-950">{user.employee?.full_name || user.email}</div><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">{user.is_active === false ? "Inactive" : "Active"}</span></div><div className="mt-1 truncate text-sm text-slate-500">{user.email}</div><div className="mt-1 text-xs text-slate-400">Last sign-in: {formatDate(user.last_sign_in_at)}</div></div>
            <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Assigned roles</div><div className="mt-2 flex flex-wrap gap-1.5">{user.role_ids.length ? user.role_ids.map((id) => { const role = roles.find((item) => item.id === id); return role ? <span key={id} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{role.name}</span> : null; }) : <span className="text-sm text-slate-400">No roles</span>}</div></div>
            <button type="button" onClick={() => setPasswordUser(user)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"><KeyRound size={15} /> Password</button>
          </div>
        ))}</div>}
      </section>

      {createOpen ? <CreateUserModal roles={roles} projects={projects} apiFetch={apiFetch} onClose={() => setCreateOpen(false)} onCreated={async () => { setCreateOpen(false); await load(); setMessage({ tone: "success", text: "Login account created." }); }} /> : null}
      {passwordUser ? <PasswordModal user={passwordUser} apiFetch={apiFetch} onClose={() => setPasswordUser(null)} onSaved={() => { setPasswordUser(null); setMessage({ tone: "success", text: `Password updated for ${passwordUser.email}.` }); }} /> : null}
    </div>
  );
}

function CreateUserModal({ roles, projects, apiFetch, onClose, onCreated }: { roles: Role[]; projects: Project[]; apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; onClose: () => void; onCreated: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setSaving(true); setError(null);
    try {
      const response = await apiFetch("/api/admin/create-user", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, role_ids: roleIds, project_ids: projectIds, microsoft_email: email, sharepoint_enabled: true }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not create user.");
      await onCreated();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create user."); }
    finally { setSaving(false); }
  }

  return <Modal title="Create Login Account" onClose={onClose}><form onSubmit={submit} className="space-y-4">{error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}<Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" required /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="Temporary password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" required /></Field><Field label="Confirm password"><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" required /></Field></div><Field label="Initial roles"><div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">{roles.map((role) => <label key={role.id} className="flex items-center gap-2 rounded-lg p-2 hover:bg-slate-50"><input type="checkbox" checked={roleIds.includes(role.id)} onChange={() => setRoleIds((current) => current.includes(role.id) ? current.filter((id) => id !== role.id) : [...current, role.id])} /><span className="text-sm font-semibold text-slate-700">{role.name}</span></label>)}</div></Field><Field label="Initial project access"><div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">{projects.map((project) => <label key={project.id} className="flex items-center gap-2 rounded-lg p-2 hover:bg-slate-50"><input type="checkbox" checked={projectIds.includes(project.id)} onChange={() => setProjectIds((current) => current.includes(project.id) ? current.filter((id) => id !== project.id) : [...current, project.id])} /><span className="text-sm text-slate-700">{project.name}{project.project_number ? ` · ${project.project_number}` : ""}</span></label>)}</div></Field><Actions saving={saving} onCancel={onClose} label="Create User" /></form></Modal>;
}

function PasswordModal({ user, apiFetch, onClose, onSaved }: { user: UserRow; apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setSaving(true); setError(null);
    try {
      const response = await apiFetch("/api/admin/update-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: user.user_id, password }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not update password.");
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update password."); }
    finally { setSaving(false); }
  }

  return <Modal title={`Reset Password · ${user.email}`} onClose={onClose}><form onSubmit={submit} className="space-y-4">{error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}<Field label="New password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" required /></Field><Field label="Confirm password"><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" required /></Field><Actions saving={saving} onCancel={onClose} label="Update Password" /></form></Modal>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4"><div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-200 px-6 py-5"><h3 className="text-xl font-bold text-slate-950">{title}</h3><button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div><div className="p-6">{children}</div></div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-sm font-bold text-slate-800">{label}</span>{children}</label>; }
function Actions({ saving, onCancel, label }: { saving: boolean; onCancel: () => void; label: string }) { return <div className="flex justify-end gap-2 border-t border-slate-200 pt-5"><button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}{label}</button></div>; }
