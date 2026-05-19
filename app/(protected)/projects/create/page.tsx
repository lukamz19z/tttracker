"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

function buildProjectNumber(clientCode: string, year: string, sequence: string) {
  const cleanClient = clientCode.trim().toUpperCase();
  const cleanYear = year.trim().slice(-2);
  const cleanSequence = String(Number(sequence || 1)).padStart(3, "0");

  if (!cleanClient || !cleanYear || !cleanSequence) return "";

  return `P-${cleanClient}-${cleanYear}-${cleanSequence}`;
}

export default function CreateProjectPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowser();

  const currentYear = new Date().getFullYear();

  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [clientCode, setClientCode] = useState("");
  const [projectYear, setProjectYear] = useState(String(currentYear));
  const [projectSequence, setProjectSequence] = useState("1");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("ongoing");
  const [totalTowers, setTotalTowers] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const projectNumber = useMemo(() => {
    return buildProjectNumber(clientCode, projectYear, projectSequence);
  }, [clientCode, projectYear, projectSequence]);

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

    if (!clientCode.trim()) {
      setMsg("Client code is required.");
      setLoading(false);
      return;
    }

    if (!projectYear || Number.isNaN(Number(projectYear))) {
      setMsg("Project year is required.");
      setLoading(false);
      return;
    }

    if (!projectSequence || Number.isNaN(Number(projectSequence))) {
      setMsg("Project sequence is required.");
      setLoading(false);
      return;
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert([
        {
          name,
          client,
          client_code: clientCode.trim().toUpperCase(),
          project_year: Number(projectYear),
          project_sequence: Number(projectSequence),
          project_number: projectNumber,
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
    <AppShell>
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              className="w-full border p-2 rounded uppercase"
              placeholder="Client Code e.g. UGL"
              value={clientCode}
              onChange={(e) => setClientCode(e.target.value.toUpperCase())}
              required
            />

            <input
              className="w-full border p-2 rounded"
              placeholder="Year e.g. 2026"
              type="number"
              value={projectYear}
              onChange={(e) => setProjectYear(e.target.value)}
              required
            />

            <input
              className="w-full border p-2 rounded"
              placeholder="Project No. e.g. 1"
              type="number"
              value={projectSequence}
              onChange={(e) => setProjectSequence(e.target.value)}
              required
            />
          </div>

          <div className="rounded-xl border bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-500">Project Number</p>
            <p className="mt-1 font-semibold text-slate-900">
              {projectNumber || "P-CLIENT-YY-001"}
            </p>
          </div>

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
            className="bg-slate-900 text-white px-4 py-2 rounded-lg disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create Project"}
          </button>
        </form>

        {msg && <p className="mt-4 text-red-600">{msg}</p>}
      </div>
    </AppShell>
  );
}