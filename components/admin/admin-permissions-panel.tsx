"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Check,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
  X,
} from "lucide-react";

import { createSupabaseBrowser } from "@/lib/supabase";
import { AdminRouteRulesPanel } from "@/components/admin/admin-route-rules-panel";

type RoleRecord = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  is_system: boolean;
  grants_all: boolean;
  sort_order: number;
};

type MatrixRow = {
  role_id: string;
  role_code: string;
  role_name: string;
  role_description?: string | null;
  role_is_system?: boolean;
  role_grants_all?: boolean;
  group_id?: string | null;
  group_name?: string | null;
  group_sort_order?: number | null;
  access_area_id: string;
  access_code: string;
  access_name: string;
  access_description?: string | null;
  access_type: "tttracker" | "mobile" | "sharepoint" | string;
  permission_level?: string | null;
  route?: string | null;
  sharepoint_library?: string | null;
  source?: string | null;
  access_sort_order?: number | null;
  allowed: boolean;
};

type Project = {
  id: string;
  name: string;
  project_number?: string | null;
  status?: string | null;
};

type AdminUser = {
  user_id: string;
  email: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  is_active?: boolean;
  employee?: {
    id: string;
    full_name: string;
    role?: string | null;
    active?: boolean | null;
  } | null;
  role_ids: string[];
  project_ids: string[];
  sharepoint?: {
    microsoft_email?: string | null;
    is_enabled?: boolean | null;
  } | null;
};

type UserDetail = {
  user: { id: string; email: string | null };
  role_ids: string[];
  roles: RoleRecord[];
  overrides: Array<{ access_area_id: string; allowed: boolean }>;
  project_access: Array<{ project_id: string; role?: string | null }>;
  sharepoint: { microsoft_email?: string | null; is_enabled?: boolean | null };
  employee?: AdminUser["employee"];
  effective: Array<{
    access_area_id: string;
    code: string;
    name: string;
    type: string;
    permission_level?: string | null;
    allowed: boolean;
    source: string;
  }>;
};

type AccessResponse = {
  roles?: RoleRecord[];
  matrix?: MatrixRow[];
  error?: string;
};

type UsersResponse = {
  users?: AdminUser[];
  roles?: RoleRecord[];
  projects?: Project[];
  error?: string;
};

type PermissionMode = "inherit" | "allow" | "deny";
type Platform = "tttracker" | "mobile" | "sharepoint";

const PLATFORM_TABS: Array<{ value: Platform; label: string }> = [
  { value: "tttracker", label: "TTTracker Website" },
  { value: "mobile", label: "Mobile App" },
  { value: "sharepoint", label: "SharePoint" },
];

function pretty(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function AdminPermissionsPanel() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [mode, setMode] = useState<"roles" | "users" | "routes">("roles");
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const apiFetch = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your session has expired.");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${session.access_token}`);
    return fetch(input, { ...init, headers, cache: "no-store" });
  }, [supabase]);

  const loadAll = useCallback(async () => {
    const [accessResponse, usersResponse] = await Promise.all([
      apiFetch("/api/admin/access"),
      apiFetch("/api/admin/access/users"),
    ]);

    const accessPayload = (await accessResponse.json()) as AccessResponse;
    const usersPayload = (await usersResponse.json()) as UsersResponse;

    if (!accessResponse.ok) throw new Error(accessPayload.error ?? "Failed to load roles and permissions.");
    if (!usersResponse.ok) throw new Error(usersPayload.error ?? "Failed to load users.");

    setRoles(accessPayload.roles ?? usersPayload.roles ?? []);
    setMatrix(accessPayload.matrix ?? []);
    setUsers((usersPayload.users ?? []).sort((a, b) => (a.email ?? "").localeCompare(b.email ?? "")));
    setProjects(usersPayload.projects ?? []);
  }, [apiFetch]);

  useEffect(() => {
    void (async () => {
      try {
        await loadAll();
      } catch (error) {
        setMessage({ tone: "error", text: error instanceof Error ? error.message : "Failed to load access control." });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadAll]);

  async function refresh() {
    setRefreshing(true);
    setMessage(null);
    try {
      await loadAll();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Failed to refresh." });
    } finally {
      setRefreshing(false);
    }
  }

  async function syncAccessAreas() {
    setRefreshing(true);
    setMessage(null);
    try {
      const response = await apiFetch("/api/admin/access/sync", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Access discovery failed.");
      await loadAll();
      setMessage({ tone: "success", text: "Website and SharePoint access areas have been refreshed." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Access discovery failed." });
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <section className="flex min-h-72 items-center justify-center rounded-3xl border border-slate-200 bg-white shadow-sm">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-slate-400">
              <ShieldCheck size={17} />
              <span className="text-xs font-bold uppercase tracking-wider">Access Control</span>
            </div>
            <h2 className="mt-2 text-xl font-bold text-slate-950">Roles, users and effective permissions</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              Roles are database records. Users can hold multiple roles. Role grants are additive and individual user overrides can Allow or Deny access across the website, mobile app and SharePoint.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void syncAccessAreas()} disabled={refreshing} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              Discover Access Areas
            </button>
            <button type="button" onClick={() => void refresh()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        </div>

        <div className="mt-5 flex gap-1 rounded-2xl bg-slate-100 p-1">
          <button type="button" onClick={() => setMode("roles")} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold ${mode === "roles" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>
            Roles & Role Permissions
          </button>
          <button type="button" onClick={() => setMode("users")} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold ${mode === "users" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>
            User Access & Overrides
          </button>
          <button type="button" onClick={() => setMode("routes")} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold ${mode === "routes" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>
            Website Route Rules
          </button>
        </div>
      </section>

      {message ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          {message.text}
        </div>
      ) : null}

      {mode === "roles" ? (
        <RolesEditor
          roles={roles}
          matrix={matrix}
          apiFetch={apiFetch}
          reload={loadAll}
          setMessage={setMessage}
        />
      ) : mode === "users" ? (
        <UsersEditor
          roles={roles}
          matrix={matrix}
          users={users}
          projects={projects}
          apiFetch={apiFetch}
          reload={loadAll}
          setMessage={setMessage}
        />
      ) : (
        <AdminRouteRulesPanel />
      )}
    </div>
  );
}

function RolesEditor({ roles, matrix, apiFetch, reload, setMessage }: {
  roles: RoleRecord[];
  matrix: MatrixRow[];
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  reload: () => Promise<void>;
  setMessage: React.Dispatch<React.SetStateAction<{ tone: "success" | "error"; text: string } | null>>;
}) {
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id ?? "");
  const [platform, setPlatform] = useState<Platform>("tttracker");
  const [draftAllowed, setDraftAllowed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [roleModal, setRoleModal] = useState<null | { mode: "new" | "edit" | "clone"; role?: RoleRecord }>(null);

  useEffect(() => {
    if (!roles.some((role) => role.id === selectedRoleId)) setSelectedRoleId(roles[0]?.id ?? "");
  }, [roles, selectedRoleId]);

  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null;
  const selectedRows = useMemo(
    () => matrix.filter((row) => row.role_id === selectedRoleId),
    [matrix, selectedRoleId],
  );

  useEffect(() => {
    setDraftAllowed(new Set(selectedRows.filter((row) => row.allowed).map((row) => row.access_area_id)));
  }, [selectedRoleId, matrix]); // eslint-disable-line react-hooks/exhaustive-deps

  const platformRows = selectedRows.filter((row) => row.access_type === platform);
  const groups = useMemo(() => {
    const map = new Map<string, MatrixRow[]>();
    for (const row of platformRows) {
      const key = row.group_name || row.access_type || "Other";
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()];
  }, [platformRows]);

  function toggle(areaId: string) {
    if (selectedRole?.grants_all) return;
    setDraftAllowed((current) => {
      const next = new Set(current);
      next.has(areaId) ? next.delete(areaId) : next.add(areaId);
      return next;
    });
  }

  async function savePermissions() {
    if (!selectedRole) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await apiFetch(`/api/admin/access/roles/${selectedRole.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissions: selectedRows.map((row) => ({
            access_area_id: row.access_area_id,
            allowed: draftAllowed.has(row.access_area_id),
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not save role permissions.");
      await reload();
      setMessage({ tone: "success", text: `${selectedRole.name} permissions updated.` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not save role permissions." });
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole(role: RoleRecord) {
    if (!window.confirm(`Delete role "${role.name}"?\n\nThe role must have no assigned users.`)) return;
    try {
      const response = await apiFetch(`/api/admin/access/roles/${role.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not delete role.");
      await reload();
      setMessage({ tone: "success", text: `${role.name} deleted.` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not delete role." });
    }
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-950">Roles</h3>
            <p className="mt-1 text-xs text-slate-500">Create, clone, edit or delete access roles.</p>
          </div>
          <button type="button" onClick={() => setRoleModal({ mode: "new" })} className="rounded-xl bg-slate-950 p-2 text-white hover:bg-slate-800" aria-label="Create role"><Plus size={16} /></button>
        </div>

        <div className="mt-4 space-y-2">
          {roles.map((role) => (
            <button key={role.id} type="button" onClick={() => setSelectedRoleId(role.id)} className={`w-full rounded-2xl border p-3 text-left ${selectedRoleId === role.id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{role.name}</div>
                  <div className={`mt-1 truncate text-xs ${selectedRoleId === role.id ? "text-slate-300" : "text-slate-400"}`}>{role.code}</div>
                </div>
                {role.grants_all ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">ALL</span> : null}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        {!selectedRole ? (
          <div className="p-10 text-center text-sm text-slate-500">Create a role to begin.</div>
        ) : (
          <>
            <div className="border-b border-slate-200 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-bold text-slate-950">{selectedRole.name}</h3>
                    {selectedRole.is_system ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">Protected system role</span> : null}
                  </div>
                  <p className="mt-1 max-w-2xl text-sm text-slate-500">{selectedRole.description || "No description."}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setRoleModal({ mode: "edit", role: selectedRole })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
                  <button type="button" onClick={() => setRoleModal({ mode: "clone", role: selectedRole })} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Copy size={14} /> Clone</button>
                  {!selectedRole.is_system ? <button type="button" onClick={() => void deleteRole(selectedRole)} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"><Trash2 size={14} /> Delete</button> : null}
                </div>
              </div>

              {selectedRole.grants_all ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  This protected role automatically receives every active Website, Mobile and SharePoint permission, including newly discovered access areas.
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-2">
                {PLATFORM_TABS.map((tab) => (
                  <button key={tab.value} type="button" onClick={() => setPlatform(tab.value)} className={`rounded-xl px-3 py-2 text-sm font-bold ${platform === tab.value ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{tab.label}</button>
                ))}
              </div>
            </div>

            <div className="space-y-5 p-5">
              {groups.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No {PLATFORM_TABS.find((tab) => tab.value === platform)?.label} access areas have been discovered yet.</div>
              ) : groups.map(([groupName, rows]) => (
                <div key={groupName} className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800">{groupName}</div>
                  <div className="divide-y divide-slate-100">
                    {rows.map((row) => {
                      const checked = selectedRole.grants_all || draftAllowed.has(row.access_area_id);
                      return (
                        <label key={row.access_area_id} className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-slate-50">
                          <input type="checkbox" checked={checked} disabled={selectedRole.grants_all} onChange={() => toggle(row.access_area_id)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-slate-900">{row.access_name}</span>
                            <span className="mt-0.5 block text-xs text-slate-400">{row.access_code}{row.permission_level ? ` · ${pretty(row.permission_level)}` : ""}{row.route ? ` · ${row.route}` : ""}</span>
                            {row.access_description ? <span className="mt-1 block text-xs text-slate-500">{row.access_description}</span> : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end border-t border-slate-200 p-5">
              <button type="button" onClick={() => void savePermissions()} disabled={saving || selectedRole.grants_all} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Role Permissions
              </button>
            </div>
          </>
        )}
      </div>

      {roleModal ? (
        <RoleModal
          mode={roleModal.mode}
          role={roleModal.role}
          roles={roles}
          apiFetch={apiFetch}
          onClose={() => setRoleModal(null)}
          onSaved={async (text) => {
            setRoleModal(null);
            await reload();
            setMessage({ tone: "success", text });
          }}
        />
      ) : null}
    </section>
  );
}

function RoleModal({ mode, role, roles, apiFetch, onClose, onSaved }: {
  mode: "new" | "edit" | "clone";
  role?: RoleRecord;
  roles: RoleRecord[];
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [name, setName] = useState(mode === "clone" ? `${role?.name ?? "Role"} Copy` : role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [cloneFrom, setCloneFrom] = useState(mode === "clone" ? role?.id ?? "" : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = mode === "edit" && role
        ? await apiFetch(`/api/admin/access/roles/${role.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, description }),
          })
        : await apiFetch("/api/admin/access/roles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, description, clone_from_role_id: cloneFrom || undefined }),
          });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not save role.");
      await onSaved(mode === "edit" ? `${name} updated.` : `${name} created.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save role.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={mode === "edit" ? "Edit Role" : mode === "clone" ? "Clone Role" : "Create Role"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}
        <Field label="Role name"><input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2" required /></Field>
        <Field label="Description"><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2" /></Field>
        {mode === "new" ? (
          <Field label="Copy permissions from (optional)">
            <select value={cloneFrom} onChange={(event) => setCloneFrom(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
              <option value="">Start with no permissions</option>
              {roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
        ) : null}
        <ModalActions saving={saving} onCancel={onClose} label="Save Role" />
      </form>
    </Modal>
  );
}

function UsersEditor({ roles, matrix, users, projects, apiFetch, reload, setMessage }: {
  roles: RoleRecord[];
  matrix: MatrixRow[];
  users: AdminUser[];
  projects: Project[];
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  reload: () => Promise<void>;
  setMessage: React.Dispatch<React.SetStateAction<{ tone: "success" | "error"; text: string } | null>>;
}) {
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.user_id ?? "");
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, PermissionMode>>({});
  const [microsoftEmail, setMicrosoftEmail] = useState("");
  const [sharepointEnabled, setSharepointEnabled] = useState(true);
  const [platform, setPlatform] = useState<Platform>("tttracker");

  const filteredUsers = users.filter((user) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    const roleNames = roleIdsForUser(user, roles).join(" ");
    return [user.email, user.employee?.full_name, user.employee?.role, roleNames]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  useEffect(() => {
    if (!users.some((user) => user.user_id === selectedUserId)) setSelectedUserId(users[0]?.user_id ?? "");
  }, [users, selectedUserId]);

  const loadDetail = useCallback(async (userId: string) => {
    if (!userId) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    try {
      const response = await apiFetch(`/api/admin/access/users/${userId}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not load user access.");
      const next = payload as UserDetail;
      setDetail(next);
      setRoleIds(next.role_ids ?? []);
      setProjectIds((next.project_access ?? []).map((row) => row.project_id));
      setMicrosoftEmail(next.sharepoint?.microsoft_email ?? next.user.email ?? "");
      setSharepointEnabled(next.sharepoint?.is_enabled !== false);
      const nextOverrides: Record<string, PermissionMode> = {};
      for (const row of next.overrides ?? []) nextOverrides[row.access_area_id] = row.allowed ? "allow" : "deny";
      setOverrides(nextOverrides);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not load user access." });
    } finally {
      setLoadingDetail(false);
    }
  }, [apiFetch, setMessage]);

  useEffect(() => { void loadDetail(selectedUserId); }, [selectedUserId, loadDetail]);

  const uniqueAreas = useMemo(() => {
    const map = new Map<string, MatrixRow>();
    for (const row of matrix) if (!map.has(row.access_area_id)) map.set(row.access_area_id, row);
    return [...map.values()]
      .filter((row) => row.access_type === platform)
      .sort((a, b) => (a.group_name ?? "").localeCompare(b.group_name ?? "") || Number(a.access_sort_order ?? 999) - Number(b.access_sort_order ?? 999));
  }, [matrix, platform]);

  const groupedAreas = useMemo(() => {
    const map = new Map<string, MatrixRow[]>();
    for (const row of uniqueAreas) {
      const key = row.group_name || "Other";
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()];
  }, [uniqueAreas]);

  const roleGranted = useMemo(() => {
    const set = new Set<string>();
    for (const row of matrix) {
      if (roleIds.includes(row.role_id) && row.allowed) set.add(row.access_area_id);
    }
    return set;
  }, [matrix, roleIds]);

  function toggleRole(roleId: string) {
    setRoleIds((current) => current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId]);
  }

  function toggleProject(projectId: string) {
    setProjectIds((current) => current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId]);
  }

  function setOverride(areaId: string, mode: PermissionMode) {
    setOverrides((current) => ({ ...current, [areaId]: mode }));
  }

  async function saveUser() {
    if (!selectedUserId || !detail) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await apiFetch(`/api/admin/access/users/${selectedUserId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role_ids: roleIds,
          project_ids: projectIds,
          microsoft_email: microsoftEmail,
          sharepoint_enabled: sharepointEnabled,
          overrides: Object.entries(overrides)
            .filter(([, mode]) => mode !== "inherit")
            .map(([access_area_id, mode]) => ({ access_area_id, allowed: mode === "allow" })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not save user access.");
      await Promise.all([reload(), loadDetail(selectedUserId)]);
      setMessage({ tone: "success", text: `Access updated for ${detail.user.email ?? "user"}. SharePoint permissions will follow the reconciler.` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not save user access." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="relative block">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2" />
        </label>
        <div className="mt-3 max-h-[70vh] space-y-2 overflow-y-auto">
          {filteredUsers.map((user) => (
            <button key={user.user_id} type="button" onClick={() => setSelectedUserId(user.user_id)} className={`w-full rounded-2xl border p-3 text-left ${selectedUserId === user.user_id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 hover:bg-slate-50"}`}>
              <div className="truncate text-sm font-bold">{user.employee?.full_name || user.email || "Unnamed user"}</div>
              <div className={`mt-1 truncate text-xs ${selectedUserId === user.user_id ? "text-slate-300" : "text-slate-400"}`}>{user.email}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {user.role_ids.slice(0, 3).map((roleId) => {
                  const role = roles.find((item) => item.id === roleId);
                  return role ? <span key={roleId} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${selectedUserId === user.user_id ? "bg-white/10 text-white" : "bg-slate-100 text-slate-600"}`}>{role.name}</span> : null;
                })}
                {user.role_ids.length > 3 ? <span className="text-[10px] font-bold">+{user.role_ids.length - 3}</span> : null}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        {loadingDetail ? (
          <div className="flex min-h-72 items-center justify-center"><Loader2 size={25} className="animate-spin text-slate-400" /></div>
        ) : !detail ? (
          <div className="p-10 text-center text-sm text-slate-500">Select a user.</div>
        ) : (
          <>
            <div className="border-b border-slate-200 p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-slate-100 p-3 text-slate-700"><UserCog size={20} /></div>
                <div>
                  <h3 className="text-xl font-bold text-slate-950">{detail.employee?.full_name || detail.user.email}</h3>
                  <p className="mt-1 text-sm text-slate-500">{detail.user.email}{detail.employee?.role ? ` · Employee position: ${detail.employee.role}` : ""}</p>
                </div>
              </div>
            </div>

            <div className="space-y-6 p-5">
              <div>
                <div className="flex items-center gap-2"><Users size={16} className="text-slate-400" /><h4 className="text-sm font-bold text-slate-900">Assigned access roles</h4></div>
                <p className="mt-1 text-xs text-slate-500">A user can hold as many roles as required. Grants from all roles are combined.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {roles.map((role) => (
                    <label key={role.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 ${roleIds.includes(role.id) ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}>
                      <input type="checkbox" checked={roleIds.includes(role.id)} onChange={() => toggleRole(role.id)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
                      <span><span className="block text-sm font-bold text-slate-900">{role.name}</span><span className="mt-0.5 block text-xs text-slate-400">{role.code}</span></span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900">Project access</h4>
                <p className="mt-1 text-xs text-slate-500">Project assignments remain independent of global roles.</p>
                <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto rounded-2xl border border-slate-200 p-3 sm:grid-cols-2">
                  {projects.map((project) => (
                    <label key={project.id} className="flex cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-slate-50">
                      <input type="checkbox" checked={projectIds.includes(project.id)} onChange={() => toggleProject(project.id)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
                      <span><span className="block text-sm font-semibold text-slate-800">{project.name}</span>{project.project_number ? <span className="text-xs text-slate-400">{project.project_number}</span> : null}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h4 className="text-sm font-bold text-slate-900">SharePoint identity</h4>
                <p className="mt-1 text-xs text-slate-500">SharePoint permission rows below control what the user receives. This email is the Microsoft account TTTracker grants access to.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <Field label="Microsoft / SharePoint email"><input type="email" value={microsoftEmail} onChange={(event) => setMicrosoftEmail(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2" /></Field>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700"><input type="checkbox" checked={sharepointEnabled} onChange={(event) => setSharepointEnabled(event.target.checked)} /> SharePoint enabled</label>
                </div>
              </div>

              <div>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Individual permission overrides</h4>
                    <p className="mt-1 text-xs text-slate-500">Inherit uses the combined roles. Allow grants an exception. Deny removes access even if a role grants it.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORM_TABS.map((tab) => <button key={tab.value} type="button" onClick={() => setPlatform(tab.value)} className={`rounded-xl px-3 py-2 text-xs font-bold ${platform === tab.value ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>{tab.label}</button>)}
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  {groupedAreas.map(([groupName, rows]) => (
                    <div key={groupName} className="overflow-hidden rounded-2xl border border-slate-200">
                      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800">{groupName}</div>
                      <div className="divide-y divide-slate-100">
                        {rows.map((row) => {
                          const mode = overrides[row.access_area_id] ?? "inherit";
                          const inherited = roleGranted.has(row.access_area_id);
                          const effective = mode === "allow" ? true : mode === "deny" ? false : inherited;
                          return (
                            <div key={row.access_area_id} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                              <div>
                                <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-slate-900">{row.access_name}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${effective ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{effective ? "Effective: Allow" : "Effective: Deny"}</span></div>
                                <div className="mt-1 text-xs text-slate-400">{row.access_code}{inherited ? " · granted by assigned role(s)" : " · not granted by assigned roles"}</div>
                              </div>
                              <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white">
                                {(["inherit", "allow", "deny"] as PermissionMode[]).map((choice) => (
                                  <button key={choice} type="button" onClick={() => setOverride(row.access_area_id, choice)} className={`px-3 py-2 text-xs font-bold ${mode === choice ? choice === "allow" ? "bg-emerald-600 text-white" : choice === "deny" ? "bg-rose-600 text-white" : "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50"}`}>{pretty(choice)}</button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-200 p-5">
              <button type="button" onClick={() => void saveUser()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save User Access</button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function roleIdsForUser(user: AdminUser, roles: RoleRecord[]) {
  return user.role_ids.map((id) => roles.find((role) => role.id === id)?.name).filter(Boolean) as string[];
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5"><h3 className="text-xl font-bold text-slate-950">{title}</h3><button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-bold text-slate-800">{label}</span>{children}</label>;
}

function ModalActions({ saving, onCancel, label }: { saving: boolean; onCancel: () => void; label: string }) {
  return (
    <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
      <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
      <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}{label}</button>
    </div>
  );
}
