"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase";
import {
  Building2,
  DollarSign,
  TrendingUp,
  FileWarning,
  BarChart3,
  ArrowRight,
} from "lucide-react";

type Project = {
  id: string;
  name: string;
  client: string | null;
  location: string | null;
  status: string | null;
  total_towers: number | null;
};

export default function CommercialLandingPage() {
const supabase = createSupabaseBrowser();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadProjects() {
      setLoading(true);

      const { data, error } = await supabase
        .from("projects")
        .select("id, name, client, location, status, total_towers")
        .order("name", { ascending: true });

      if (!error && data) {
        setProjects(data);
      }

      setLoading(false);
    }

    loadProjects();
  }, [supabase]);

  const filteredProjects = useMemo(() => {
    const q = search.toLowerCase().trim();

    if (!q) return projects;

    return projects.filter((project) =>
      [
        project.name,
        project.client,
        project.location,
        project.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [projects, search]);

  const totalProjects = projects.length;
  const activeProjects = projects.filter(
    (p) => p.status?.toLowerCase() !== "complete"
  ).length;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-red-600">
                Commercial
              </p>
              <h1 className="mt-1 text-3xl font-bold text-slate-900">
                Company Commercial Dashboard
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Company-wide commercial overview across all projects. This will
                eventually pull in project revenue, dayworks, claims, variations,
                delays, commercial risk and production performance.
              </p>
            </div>

            <div className="rounded-2xl bg-slate-900 px-5 py-4 text-white">
              <p className="text-xs uppercase tracking-wide text-slate-300">
                Total Projects
              </p>
              <p className="text-3xl font-bold">{totalProjects}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <CommercialStatCard
            title="Active Projects"
            value={activeProjects}
            subtitle="Currently in progress"
            icon={<Building2 className="h-5 w-5" />}
          />

          <CommercialStatCard
            title="Revenue"
            value="Coming Soon"
            subtitle="Contract + approved claims"
            icon={<DollarSign className="h-5 w-5" />}
          />

          <CommercialStatCard
            title="Variations"
            value="Coming Soon"
            subtitle="Pending / approved / rejected"
            icon={<FileWarning className="h-5 w-5" />}
          />

          <CommercialStatCard
            title="Production"
            value="Coming Soon"
            subtitle="MH/t commercial performance"
            icon={<TrendingUp className="h-5 w-5" />}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Select Project
              </h2>
              <p className="text-sm text-slate-500">
                Open a project-specific commercial dashboard.
              </p>
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-red-400 md:w-80"
            />
          </div>

          {loading ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Loading projects...
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              No projects found.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/commercial/${project.id}`}
                  className="group rounded-3xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:border-red-300 hover:bg-white hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">
                        {project.name}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {project.client || "No client listed"}
                      </p>
                    </div>

                    <ArrowRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-1 group-hover:text-red-600" />
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <MiniInfo label="Location" value={project.location || "—"} />
                    <MiniInfo label="Status" value={project.status || "—"} />
                    <MiniInfo
                      label="Towers"
                      value={project.total_towers?.toString() || "—"}
                    />
                    <MiniInfo label="Commercial" value="Setup" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function CommercialStatCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="rounded-2xl bg-red-50 p-3 text-red-600">{icon}</div>
        <BarChart3 className="h-5 w-5 text-slate-300" />
      </div>

      <p className="mt-5 text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-3 py-2">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="truncate text-sm font-semibold text-slate-700">{value}</p>
    </div>
  );
}