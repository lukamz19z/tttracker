"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

  const loadAll = useCallback(async () => {
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
  }, [selectedUserId, supabase]);

  const checkRoleAndLoad = useCallback(async () => {
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
  }, [loadAll, router, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkRoleAndLoad();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [checkRoleAndLoad]);

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
      prev.map((user) =>
        user.user_id === userId ? { ...user, role: nextRole } : user,
      ),
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

const selectedUserAccess = selectedUser
  ? accessRows.filter((row) => row.user_id === selectedUser.user_id)
  : [];

  function getProjectAccess(projectId: string) {
    if (!selectedUser) return null;

    return accessRows.find(
      (row) => row.project_id === projectId && row.user_id === selectedUser.user_id,
    );
  }

  if (checkingRole) {
    return (
      <AppShell>
        <div className="p-6">Checking permissions...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
            <div>
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-slate-50 transition mb-4"
              >
                ← Back to Admin Centre
              </Link>

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
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Role
                  </label>
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

<div className="mt-4 space-y-2 max-h-140 overflow-auto">
                {loading ? (
                  <div className="text-sm text-slate-500 p-4">Loading users...</div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-sm text-slate-500 p-4">No users found.</div>
                ) : (
                  filteredUsers.map((user) => {
                    const accessCount = accessRows.filter(
                      (row) => row.user_id === user.user_id,
                    ).length;

                    return (
                      <button
                        key={user.user_id}
                        onClick={() => setSelectedUserId(user.user_id)}
                        className={`w-full text-left rounded-2xl border p-4 transition ${
                          selectedUserId === user.user_id
                            ? "border-slate-900 bg-slate-50"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <div className="font-semibold text-slate-900 truncate">
                          {user.email}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                          <RolePill role={user.role} />
                          <span>{accessCount} project access rows</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {!selectedUser ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm text-slate-500">
                Select a user to manage their access.
              </div>
            ) : (
              <>
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <h2 className="text-xl font-bold">{selectedUser.email}</h2>
                      <p className="text-sm text-slate-500 mt-1">
                        User ID: {selectedUser.user_id}
                      </p>
                      <p className="text-sm text-slate-500 mt-1">
                        Created: {formatDate(selectedUser.created_at)}
                      </p>
                      <p className="text-sm text-slate-500 mt-1">
                        Last sign in: {formatDate(selectedUser.last_sign_in_at)}
                      </p>
                    </div>

                    <RolePill role={selectedUser.role} />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4 mt-5">
                    <div>
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

                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Reset Password
                      </label>
                      <div className="flex gap-2">
                        <input
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="New password"
                          type="password"
                          className="flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                        />
                        <button
                          onClick={() => void updatePassword()}
                          disabled={saving}
                          className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                        >
                          Update
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-xl font-bold">Project Access</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Assign this user to projects and choose their project-level access.
                  </p>

                  <div className="mt-5 space-y-3">
                    {projects.map((project) => {
                      const access = getProjectAccess(project.id);

                      return (
                        <div
                          key={project.id}
                          className="rounded-2xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                        >
                          <div>
                            <div className="font-semibold">{project.name}</div>
                            <div className="text-xs text-slate-500 mt-1">
                              {project.location || "Location not set"} ·{" "}
                              {project.status || "Status not set"}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <select
                              value={access?.role || ""}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (!value) return;
                                void assignProject(project.id, value as Role);
                              }}
                              className="rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
                            >
                              <option value="">No access</option>
                              <option value="viewer">Viewer</option>
                              <option value="editor">Editor</option>
                              <option value="admin">Admin</option>
                            </select>

                            {access && (
                              <button
                                onClick={() => void removeProjectAccess(project.id)}
                                className="rounded-xl border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {projects.length === 0 && (
                      <div className="text-sm text-slate-500">
                        No projects available.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-xl font-bold">Current Access Summary</h2>

                  {selectedUserAccess.length === 0 ? (
                    <p className="text-sm text-slate-500 mt-3">
                      This user does not currently have project access.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {selectedUserAccess.map((row) => {
                        const project = projects.find((p) => p.id === row.project_id);

                        return (
                          <div
                            key={`${row.project_id}-${row.user_id}`}
                            className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3 flex justify-between gap-3"
                          >
                            <span className="font-medium">
                              {project?.name || row.project_id}
                            </span>
                            <RolePill role={row.role} />
                          </div>
                        );
                      })}
                    </div>
                  )}
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
      <label className="block text-xs font-medium text-slate-500 mb-1">
        {label}
      </label>
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
  const classes =
    role === "admin"
      ? "bg-red-100 text-red-700"
      : role === "editor"
      ? "bg-blue-100 text-blue-700"
      : "bg-slate-100 text-slate-700";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${classes}`}>
      {role}
    </span>
  );
}