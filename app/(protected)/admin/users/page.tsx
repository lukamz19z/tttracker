"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

export default function AdminUsersPage() {
  const supabase = createSupabaseBrowser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("viewer");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function createUser(e: any) {
    e.preventDefault();
    setLoading(true);
    setMsg("");

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      setMsg(error.message);
      setLoading(false);
      return;
    }

    const userId = data.user?.id;

    await supabase.from("user_roles").insert({
      user_id: userId,
      role,
    });

    setMsg("User created successfully");
    setEmail("");
    setPassword("");
    setRole("viewer");
    setLoading(false);
  }

  return (
    <AppShell title="User Management">
      <div className="bg-white p-6 rounded-2xl shadow-sm max-w-xl">
        <h2 className="text-xl font-semibold mb-4">Create New User</h2>

        <form onSubmit={createUser} className="space-y-4">
          <input
            className="w-full border p-2 rounded"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            className="w-full border p-2 rounded"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <select
            className="w-full border p-2 rounded"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>

          <button
            disabled={loading}
            className="bg-slate-900 text-white px-4 py-2 rounded-lg"
          >
            {loading ? "Creating..." : "Create User"}
          </button>
        </form>

        {msg && <p className="mt-4 text-blue-600">{msg}</p>}
      </div>
    </AppShell>
  );
}