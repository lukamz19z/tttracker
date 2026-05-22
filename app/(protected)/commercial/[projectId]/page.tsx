// app/(protected)/commercial/[projectId]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import {
  ArrowLeft,
  DollarSign,
  FileWarning,
  Clock,
  TrendingUp,
} from "lucide-react";

type Project = {
  id: string;
  name: string;
  client: string | null;
  location: string | null;
  status: string | null;
};

export default function ProjectCommercialDashboard() {
  const params = useParams();
  const projectId = params.projectId as string;
const supabase = createSupabaseBrowser();

  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    async function loadProject() {
      const { data } = await supabase
        .from("projects")
        .select("id, name, client, location, status")
        .eq("id", projectId)
        .single();

      setProject(data);
    }

    if (projectId) loadProject();
  }, [projectId, supabase]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link
          href="/commercial"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-red-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Commercial
        </Link>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-red-600">
            Project Commercial Dashboard
          </p>

          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            {project?.name || "Loading project..."}
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            {project?.client || "No client listed"} ·{" "}
            {project?.location || "No location listed"}
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Contract Value"
            value="Coming Soon"
            subtitle="Base contract / agreed scope"
            icon={<DollarSign className="h-5 w-5" />}
          />

          <MetricCard
            title="Variations"
            value="Coming Soon"
            subtitle="Submitted, pending, approved"
            icon={<FileWarning className="h-5 w-5" />}
          />

          <MetricCard
            title="Dayworks"
            value="Coming Soon"
            subtitle="Commercially claimable works"
            icon={<Clock className="h-5 w-5" />}
          />

          <MetricCard
            title="MH/t"
            value="Coming Soon"
            subtitle="Commercial production metric"
            icon={<TrendingUp className="h-5 w-5" />}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <PlaceholderPanel title="Commercial Summary">
            This section will show contract value, approved claims, pending
            claims, dayworks, variations and forecast final position.
          </PlaceholderPanel>

          <PlaceholderPanel title="Commercial Risk Register">
            This section will track delays, access issues, wet weather,
            standing time, missing materials, client-caused impacts and claim
            status.
          </PlaceholderPanel>

          <PlaceholderPanel title="Dayworks / SoR Tracking">
            This section will eventually pull from your dayworks module and
            summarise claimable labour, plant, delay hours and descriptions.
          </PlaceholderPanel>

          <PlaceholderPanel title="Production vs Commercial">
            This section will compare actual MH/t, production MH/t, tower
            progress, earned value and forecast commercial performance.
          </PlaceholderPanel>
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="rounded-2xl bg-red-50 p-3 text-red-600 w-fit">
        {icon}
      </div>
      <p className="mt-5 text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
    </div>
  );
}

function PlaceholderPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">{children}</p>
    </div>
  );
}