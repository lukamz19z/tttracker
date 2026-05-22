// app/(protected)/commercial/[projectId]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import {
  ArrowLeft,
  DollarSign,
  FileWarning,
  Clock,
  TrendingUp,
  PieChart,
} from "lucide-react";

type Project = {
  id: string;
  name: string;
  client: string | null;
  location: string | null;
  status: string | null;
};

type Docket = {
  id: string;
  crew: string | null;
  weather_delay_hours: number | null;
  lightning_delay_hours: number | null;
  toolbox_delay_hours: number | null;
  other_delay_hours: number | null;
};

type Breakdown = {
  productive: number;
  claimable: number;
  nonClaimable: number;
};

export default function ProjectCommercialDashboard() {
  const params = useParams();
  const projectId = params.projectId as string;
  const supabase = createSupabaseBrowser();

  const [project, setProject] = useState<Project | null>(null);
  const [dockets, setDockets] = useState<Docket[]>([]);

  useEffect(() => {
    async function loadData() {
      const { data: projectData } = await supabase
        .from("projects")
        .select("id, name, client, location, status")
        .eq("id", projectId)
        .single();

      const { data: docketData } = await supabase
        .from("tower_daily_dockets")
        .select(
          "id, crew, weather_delay_hours, lightning_delay_hours, toolbox_delay_hours, other_delay_hours"
        )
        .eq("project_id", projectId);

      setProject(projectData);
      setDockets(docketData || []);
    }

    if (projectId) loadData();
  }, [projectId, supabase]);

  const projectBreakdown = useMemo<Breakdown>(() => {
    let claimable = 0;
    let nonClaimable = 0;

    dockets.forEach((docket) => {
      claimable += safeNumber(docket.weather_delay_hours);
      claimable += safeNumber(docket.lightning_delay_hours);

      nonClaimable += safeNumber(docket.toolbox_delay_hours);
      nonClaimable += safeNumber(docket.other_delay_hours);
    });

    // Placeholder until we wire this to actual labour/productive hours
    const productive = Math.max(claimable + nonClaimable, 1) * 2.5;

    return {
      productive,
      claimable,
      nonClaimable,
    };
  }, [dockets]);

  const crewBreakdowns = useMemo(() => {
    const map = new Map<string, Breakdown>();

    dockets.forEach((docket) => {
      const crew = docket.crew || "Unassigned Crew";

      const existing = map.get(crew) || {
        productive: 0,
        claimable: 0,
        nonClaimable: 0,
      };

      existing.claimable +=
        safeNumber(docket.weather_delay_hours) +
        safeNumber(docket.lightning_delay_hours);

      existing.nonClaimable +=
        safeNumber(docket.toolbox_delay_hours) +
        safeNumber(docket.other_delay_hours);

      map.set(crew, existing);
    });

    return Array.from(map.entries()).map(([crew, breakdown]) => {
      const productive =
        breakdown.productive ||
        Math.max(breakdown.claimable + breakdown.nonClaimable, 1) * 2.5;

      return {
        crew,
        breakdown: {
          ...breakdown,
          productive,
        },
      };
    });
  }, [dockets]);

  return (
    <div className="px-6 py-6">
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
            title="Cost MH/t"
            value="Coming Soon"
            subtitle="Raw commercial manhours per tonne"
            icon={<TrendingUp className="h-5 w-5" />}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Raw / Cost MH Breakdown
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Breakdown of productive, claimable and non-claimable hours.
              </p>
            </div>

            <PieChart className="h-6 w-6 text-slate-400" />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <CommercialPieCard
              title="Project Wide"
              subtitle="All crews combined"
              breakdown={projectBreakdown}
            />

            {crewBreakdowns.map((item) => (
              <CommercialPieCard
                key={item.crew}
                title={item.crew}
                subtitle="Crew comparison"
                breakdown={item.breakdown}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function CommercialPieCard({
  title,
  subtitle,
  breakdown,
}: {
  title: string;
  subtitle: string;
  breakdown: Breakdown;
}) {
  const total =
    breakdown.productive + breakdown.claimable + breakdown.nonClaimable;

  const productivePercent = percentage(breakdown.productive, total);
  const claimablePercent = percentage(breakdown.claimable, total);
  const nonClaimablePercent = percentage(breakdown.nonClaimable, total);

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <div>
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>

      <div className="mt-5 flex items-center gap-5">
        <div
          className="h-32 w-32 shrink-0 rounded-full"
          style={{
            background: `conic-gradient(
              #16a34a 0% ${productivePercent}%,
              #f59e0b ${productivePercent}% ${
                productivePercent + claimablePercent
              }%,
              #dc2626 ${productivePercent + claimablePercent}% 100%
            )`,
          }}
        />

        <div className="space-y-3 text-sm">
          <LegendRow
            label="Productive"
            value={breakdown.productive}
            percent={productivePercent}
            dotClass="bg-green-600"
          />
          <LegendRow
            label="Claimable"
            value={breakdown.claimable}
            percent={claimablePercent}
            dotClass="bg-amber-500"
          />
          <LegendRow
            label="Non-claimable"
            value={breakdown.nonClaimable}
            percent={nonClaimablePercent}
            dotClass="bg-red-600"
          />
        </div>
      </div>
    </div>
  );
}

function LegendRow({
  label,
  value,
  percent,
  dotClass,
}: {
  label: string;
  value: number;
  percent: number;
  dotClass: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3 w-3 rounded-full ${dotClass}`} />
      <div>
        <p className="font-semibold text-slate-800">
          {label}: {value.toFixed(1)}h
        </p>
        <p className="text-xs text-slate-500">{percent.toFixed(1)}%</p>
      </div>
    </div>
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
      <div className="w-fit rounded-2xl bg-red-50 p-3 text-red-600">
        {icon}
      </div>
      <p className="mt-5 text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
    </div>
  );
}

function safeNumber(value: number | string | null | undefined) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function percentage(value: number, total: number) {
  if (!total || total <= 0) return 0;
  return (value / total) * 100;
}