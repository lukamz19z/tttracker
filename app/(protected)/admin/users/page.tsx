"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type Role = "admin" | "editor" | "viewer";

type AdminUser = {
  user_id: string;
  email: string;
  role: Role;
  created_at?: string | null;
  last_sign_in_at?: string | null;
};

type Project = {
  id: string;
  name: string;
  location?: string | null;
  status?: string | null;
};

type ProjectAccess = {
  id?: string;
  project_id: string;
  user_id: string;
  role: Role;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function AdminUsersPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowser();

  const [checkingRole, setCheckingRole] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [accessRows, setAccessRows] = useState<ProjectAccess[]>([]);

  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("viewer");

  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState("");

  const selectedUser = users.find((u) => u.user_id === selectedUserId) || null;

  useEffect(() => {
    void checkRoleAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkRoleAndLoad() {
    setCheckingRole(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!data || String(data.role).toLowerCase() !== "admin") {
      router.push("/");
      return;
    }

    setCheckingRole(false);
    await loadAll();
  }

  async function loadAll() {
    setLoading(true);
    setMsg("");

    const [usersRes, projectsRes, accessRes] = await Promise.all([
      fetch("/api/admin/users"),
      supabase.from("projects").select("id,name,location,status").order("name"),
      supabase.from("project_access").select("*"),
    ]);

    if (!usersRes.ok) {
      setMsg("Failed to load users. Check /api/admin/users route.");
    } else {
      const json = (await usersRes.json()) as { users?: AdminUser[] };
      setUsers(json.users || []);
      if (!selectedUserId && json.users?.[0]) {
        setSelectedUserId(json.users[0].user_id);
      }
    }

    if (projectsRes.error) {
      console.error(projectsRes.error);
      setMsg("Failed to load projects.");
    } else {
      setProjects((projectsRes.data || []) as Project[]);
    }

    if (accessRes.error) {
      console.error(accessRes.error);
      setMsg("Failed to load project access.");
    } else {
      setAccessRows((accessRes.data || []) as ProjectAccess[]);
    }

    setLoading(false);
  }

  async function createUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMsg("");

    const res = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, role }),
    });

    const result = (await res.json()) as { error?: string };

    if (!res.ok) {
      setMsg(result.error || "Failed to create user.");
      setSaving(false);
      return;
    }

    setEmail("");
    setPassword("");
    setRole("viewer");
    setMsg("User created successfully.");
    setSaving(false);
    await loadAll();
  }

  async function updateGlobalRole(userId: string, nextRole: Role) {
    setSaving(true);
    setMsg("");

    const res = await fetch("/api/admin/update-user-role", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: userId, role: nextRole }),
    });

    const result = (await res.json()) as { error?: string };

    if (!res.ok) {
      setMsg(result.error || "Failed to update role.");
      setSaving(false);
      return;
    }

    setUsers((prev) =>
      prev.map((user) => (user.user_id === userId ? { ...user, role: nextRole } : user)),
    );

    setMsg("Role updated.");
    setSaving(false);
  }

  async function updatePassword() {
    if (!selectedUser || !newPassword.trim()) {
      setMsg("Select a user and enter a new password.");
      return;
    }

    setSaving(true);
    setMsg("");

    const res = await fetch("/api/admin/update-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: selectedUser.user_id,
        password: newPassword,
      }),
    });

    const result = (await res.json()) as { error?: string };

    if (!res.ok) {
      setMsg(result.error || "Failed to update password.");
      setSaving(false);
      return;
    }

    setNewPassword("");
    setMsg("Password updated.");
    setSaving(false);
  }

  async function assignProject(projectId: string, accessRole: Role) {
    if (!selectedUser) return;

    setSaving(true);
    setMsg("");

    const payload = {
      project_id: projectId,
      user_id: selectedUser.user_id,
      role: accessRole,
    };

    const { error } = await supabase.from("project_access").upsert(payload, {
      onConflict: "project_id,user_id",
    });

    if (error) {
      console.error(error);
      setMsg("Failed to assign project.");
      setSaving(false);
      return;
    }

    setMsg("Project access updated.");
    setSaving(false);
    await loadAll();
  }

  async function removeProjectAccess(projectId: string) {
    if (!selectedUser) return;

    const confirmed = window.confirm("Remove this user's access to this project?");
    if (!confirmed) return;

    setSaving(true);
    setMsg("");

    const { error } = await supabase
      .from("project_access")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", selectedUser.user_id);

    if (error) {
      console.error(error);
      setMsg("Failed to remove project access.");
      setSaving(false);
      return;
    }

    setMsg("Project access removed.");
    setSaving(false);
    await loadAll();
  }

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return users;

    return users.filter((user) =>
      [user.email, user.role, user.user_id].join(" ").toLowerCase().includes(q),
    );
  }, [users, search]);

  const selectedUserAccess = useMemo(() => {
    if (!selectedUser) return [];

    return accessRows.filter((row) => row.user_id === selectedUser.user_id);
  }, [accessRows, selectedUser]);

  function getProjectAccess(projectId: string) {
    if (!selectedUser) return null;

    return accessRows.find(
      (row) => row.project_id === projectId && row.user_id === selectedUser.user_id,
    );
  }

  if (checkingRole) {
    return (
      <AppShell title="User Management">
        <div className="p-6">Checking permissions...</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="User Management">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
              <p className="text-slate-500 mt-1">
                Create users, update roles, reset passwords and assign project access.
              </p>
            </div>

            <button
              onClick={() => void loadAll()}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-medium"
            >
              Refresh
            </button>
          </div>

          {msg && (
            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              {msg}
            </div>
          )}
        </div>

        <div className="grid xl:grid-cols-[420px_1fr] gap-6">
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold">Create User</h2>

              <form onSubmit={createUser} className="mt-4 space-y-3">
                <Field
                  label="Email"
                  value={email}
                  onChange={setEmail}
                  placeholder="name@company.com"
                  type="email"
                />

                <Field
                  label="Temporary Password"
                  value={password}
                  onChange={setPassword}
                  placeholder="Temporary password"
                  type="password"
                />

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <button
                  disabled={saving}
                  className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Create User"}
                </button>
              </form>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold">Users</h2>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users..."
                className="mt-4 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              />

              <div className="mt-4 space-y-2 max-h-[560px] overflow-auto">
                {loading ? (
                  <div className="text-sm text-slate-500 p-4">Loading users...</div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-sm text-slate-500 p-4">No users found.</div>
                ) : (
                  filteredUsers.map((user) => (
                    <button
                      key={user.user_id}
                      onClick={() => setSelectedUserId(user.user_id)}
                      className={`w-full text-left rounded-2xl border p-4 transition ${
                        selectedUserId === user.user_id
                          ? "border-slate-900 bg-slate-50"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="font-semibold text-slate-900 truncate">{user.email}</div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <RolePill role={user.role} />
                        <span>{selectedUserAccess.length} project access rows</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {!selectedUser ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
                Select a user to manage permissions.
              </div>
            ) : (
              <>
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold">{selectedUser.email}</h2>
                      <p className="text-sm text-slate-500 mt-1">
                        Created {formatDate(selectedUser.created_at)} • Last sign in{" "}
                        {formatDate(selectedUser.last_sign_in_at)}
                      </p>
                    </div>

                    <RolePill role={selectedUser.role} />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4 mt-5">
                    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Global Role
                      </label>
                      <select
                        value={selectedUser.role}
                        onChange={(e) =>
                          void updateGlobalRole(selectedUser.user_id, e.target.value as Role)
                        }
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>

                    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Reset Password
                      </label>
                      <div className="flex gap-2">
                        <input
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="New password"
                          type="password"
                          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                        />
                        <button
                          onClick={() => void updatePassword()}
                          disabled={saving}
                          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <h2 className="text-xl font-bold">Project Access</h2>
                      <p className="text-sm text-slate-500 mt-1">
                        Assign this user to projects and control their project-level role.
                      </p>
                    </div>

                    <div className="text-sm text-slate-500">
                      {selectedUserAccess.length} assigned
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="hidden md:grid grid-cols-[1.5fr_1fr_150px_120px] bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-600">
                      <div>Project</div>
                      <div>Status / Location</div>
                      <div>Access Role</div>
                      <div className="text-right">Action</div>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {projects.map((project) => {
                        const access = getProjectAccess(project.id);
                        const accessRole = access?.role || "viewer";

                        return (
                          <div
                            key={project.id}
                            className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_150px_120px] gap-3 px-4 py-3 items-center"
                          >
                            <div>
                              <div className="font-semibold text-slate-900">{project.name}</div>
                              <div className="md:hidden text-xs text-slate-500 mt-1">
                                {project.status || "No status"} • {project.location || "No location"}
                              </div>
                            </div>

                            <div className="hidden md:block text-sm text-slate-500">
                              {project.status || "No status"} • {project.location || "No location"}
                            </div>

                            <select
                              value={accessRole}
                              onChange={(e) => void assignProject(project.id, e.target.value as Role)}
                              className={`rounded-xl border px-3 py-2 text-sm bg-white ${
                                access ? "border-slate-300" : "border-dashed border-slate-300"
                              }`}
                            >
                              <option value="viewer">Viewer</option>
                              <option value="editor">Editor</option>
                              <option value="admin">Admin</option>
                            </select>

                            <div className="flex md:justify-end">
                              {access ? (
                                <button
                                  onClick={() => void removeProjectAccess(project.id)}
                                  className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-medium text-white"
                                >
                                  Remove
                                </button>
                              ) : (
                                <button
                                  onClick={() => void assignProject(project.id, "viewer")}
                                  className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white"
                                >
                                  Assign
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
      />
    </div>
  );
}

function RolePill({ role }: { role: Role }) {
  const classes: Record<Role, string> = {
    admin: "bg-rose-100 text-rose-700 border-rose-200",
    editor: "bg-blue-100 text-blue-700 border-blue-200",
    viewer: "bg-emerald-100 text-emerald-700 border-emerald-200",
  };

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${classes[role]}`}>
      {role}
    </span>
  );
}