"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useRouter } from "next/navigation";
import { getUserRole } from "@/lib/roles";

export default function AdminUsersPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("viewer");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // ⭐ ADMIN PROTECTION
  useEffect(() => {
    async function checkRole() {
      const userRole = await getUserRole();

      if (userRole !== "admin") {
        router.push("/");
      }
    }

    checkRole();
  }, [router]);

  async function createUser(e: any) {
    e.preventDefault();
    setLoading(true);
    setMsg("");

    const res = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, role }),
    });

    const result = await res.json();

    if (!res.ok) {
      setMsg(result.error);
      setLoading(false);
      return;
    }

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