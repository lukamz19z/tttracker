"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

export default function CreateProjectPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowser();

  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("ongoing");
  const [totalTowers, setTotalTowers] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMsg("You must be logged in.");
      setLoading(false);
      return;
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert([
        {
          name,
          client,
          location,
          status,
          total_towers: totalTowers ? Number(totalTowers) : null,
        },
      ])
      .select()
      .single();

    if (projectError) {
      setMsg(projectError.message);
      setLoading(false);
      return;
    }

    const { error: accessError } = await supabase.from("project_access").insert([
      {
        user_id: user.id,
        project_id: project.id,
      },
    ]);

    if (accessError) {
      setMsg(accessError.message);
      setLoading(false);
      return;
    }

    router.push(`/project/${project.id}`);
  }

  return (
    <AppShell title="Create Project">
      <div className="bg-white p-6 rounded-2xl shadow-sm max-w-xl">
        <h2 className="text-xl font-semibold mb-4">New Project</h2>

        <form onSubmit={createProject} className="space-y-4">
          <input
            className="w-full border p-2 rounded"
            placeholder="Project Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <input
            className="w-full border p-2 rounded"
            placeholder="Client"
            value={client}
            onChange={(e) => setClient(e.target.value)}
          />

          <input
            className="w-full border p-2 rounded"
            placeholder="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />

          <input
            className="w-full border p-2 rounded"
            placeholder="Total Towers"
            type="number"
            value={totalTowers}
            onChange={(e) => setTotalTowers(e.target.value)}
          />

          <select
            className="w-full border p-2 rounded"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="tendering">Tendering</option>
            <option value="mobilising">Mobilising</option>
            <option value="ongoing">Ongoing</option>
            <option value="demobilising">Demobilising</option>
            <option value="completed">Completed</option>
          </select>

          <button
            disabled={loading}
            className="bg-slate-900 text-white px-4 py-2 rounded-lg"
          >
            {loading ? "Creating..." : "Create Project"}
          </button>
        </form>

        {msg && <p className="mt-4 text-red-600">{msg}</p>}
      </div>
    </AppShell>
  );
}