"use client";

import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  FileCheck2,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  Truck,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { createSupabaseBrowser } from "@/lib/supabase";

type DueRow = {
  type: "Vehicle" | "Plant" | "Document";
  label: string;
  date: string;
  days: number;
  href: string;
};

type ServiceRow = {
  id: string;
  service_number: string;
  asset_type: "vehicle" | "plant";
  vehicle_asset_id: string | null;
  plant_asset_id: string | null;
  record_type: string;
  service_date: string;
  summary: string;
  provider_type: "internal" | "external";
  provider_name: string | null;
  mechanic_name: string | null;
  supplier: string | null;
  amount_inc_gst: number | string | null;
  status: string;
};

type FleetJobRow = {
  id: string;
  job_number: string | null;
  status: string | null;
  priority: string | null;
  asset_label: string | null;
  asset_type: string | null;
  created_at: string | null;
};

type DashboardPayload = {
  counts: {
    vehicles: number;
    plant: number;
    openFleetJobs: number;
    expiringDocuments: number;
  };
  totalSpend: number;
  due: DueRow[];
  recentServices: ServiceRow[];
  recentFleetJobs: FleetJobRow[];
  canManage: boolean;
  error?: string;
};

function money(value: unknown) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0) || 0);
}

function dateLabel(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";

  const date = new Date(`${raw.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function titleCase(value: unknown) {
  return String(value ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function AssetsDashboardPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const apiFetch = useCallback(
    async (url: string) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Your session has expired. Sign in again.");
      }

      return fetch(url, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });
    },
    [supabase],
  );

  const fetchDashboard = useCallback(async () => {
    const response = await apiFetch("/api/assets/dashboard");
    const payload = (await response.json()) as DashboardPayload;

    if (!response.ok) {
      throw new Error(payload.error || "Assets dashboard could not be loaded.");
    }

    return payload;
  }, [apiFetch]);

  const load = useCallback(async () => {
    const payload = await fetchDashboard();
    setData(payload);
  }, [fetchDashboard]);

  useEffect(() => {
    let cancelled = false;

    void fetchDashboard()
      .then((payload) => {
        if (!cancelled) {
          setData(payload);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Assets dashboard could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchDashboard]);

  async function refresh() {
    setRefreshing(true);
    setError("");

    try {
      await load();
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Assets dashboard could not be refreshed.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <Loader2 size={30} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              Assets & Fleet
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
              Asset Management
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              One lifecycle for vehicles and plant: Fleet Jobs, prestarts,
              servicing, controlled documents, SharePoint folders and linked
              financial spend.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </button>

            {data?.canManage ? (
              <>
                <Link
                  href="/assets/update"
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white"
                >
                  <Settings2 size={16} />
                  Update Asset
                </Link>

                <Link
                  href="/assets/services/new"
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white"
                >
                  <Wrench size={16} />
                  Record Service
                </Link>

                <Link
                  href="/assets/vehicles/new"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700"
                >
                  <Plus size={16} />
                  New Vehicle
                </Link>

                <Link
                  href="/assets/plant/new"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700"
                >
                  <Plus size={16} />
                  New Plant
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          label="Vehicles"
          value={String(data?.counts.vehicles ?? 0)}
          detail="Vehicle register"
          icon={<Truck size={20} />}
          href="/assets/vehicles"
        />
        <Metric
          label="Plant"
          value={String(data?.counts.plant ?? 0)}
          detail="Plant register"
          icon={<Wrench size={20} />}
          href="/assets/plant"
        />
        <Metric
          label="Open Fleet Jobs"
          value={String(data?.counts.openFleetJobs ?? 0)}
          detail="Requires action"
          icon={<AlertTriangle size={20} />}
          href="/assets/fleet-jobs"
        />
        <Metric
          label="Due / Expiring"
          value={String(data?.due.length ?? 0)}
          detail={`${data?.counts.expiringDocuments ?? 0} tracked document expiries`}
          icon={<CalendarClock size={20} />}
          href="/assets/compliance"
        />
        <Metric
          label="Linked Spend"
          value={money(data?.totalSpend ?? 0)}
          detail="Finance items linked to assets"
          icon={<CircleDollarSign size={20} />}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-black text-slate-950">
                Service & Compliance Due
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Due or overdue within the next 60 days.
              </p>
            </div>
            <CalendarClock size={20} className="text-slate-400" />
          </div>

          <div className="divide-y divide-slate-100">
            {(data?.due ?? []).length === 0 ? (
              <div className="p-8 text-center text-sm font-semibold text-slate-400">
                No service or compliance dates are due within 60 days.
              </div>
            ) : (
              data?.due.map((row, index) => (
                <Link
                  key={`${row.href}-${row.label}-${index}`}
                  href={row.href}
                  className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-slate-900">
                      {row.label}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {dateLabel(row.date)}
                    </div>
                  </div>

                  <DueBadge days={row.days} />
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-black text-slate-950">
                Recent Service Records
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Searchable records, not just PDFs.
              </p>
            </div>
            <FileCheck2 size={20} className="text-slate-400" />
          </div>

          <div className="divide-y divide-slate-100">
            {(data?.recentServices ?? []).length === 0 ? (
              <div className="p-8 text-center text-sm font-semibold text-slate-400">
                No structured service records yet.
              </div>
            ) : (
              data?.recentServices.slice(0, 8).map((service) => (
                <Link
                  key={service.id}
                  href={
                    service.asset_type === "vehicle"
                      ? `/assets/vehicles/${service.vehicle_asset_id}`
                      : `/assets/plant/${service.plant_asset_id}`
                  }
                  className="block px-5 py-4 hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-900">
                        {service.service_number} · {service.summary}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {dateLabel(service.service_date)} ·{" "}
                        {titleCase(service.record_type)} ·{" "}
                        {service.provider_type === "external"
                          ? service.provider_name ||
                            service.supplier ||
                            "External workshop"
                          : service.mechanic_name ||
                            service.provider_name ||
                            "BC Contracting"}
                      </div>
                    </div>
                    <div className="shrink-0 text-xs font-black text-slate-700">
                      {money(service.amount_inc_gst)}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>

          <Link
            href="/assets/services"
            className="flex items-center justify-center gap-2 border-t border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
          >
            Open Service Register
            <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-black text-slate-950">Recent Fleet Jobs</h2>
          <p className="mt-1 text-xs text-slate-500">
            Existing Fleet Job workflow remains the maintenance action system.
          </p>
        </div>

        <div className="grid divide-y divide-slate-100 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          {(data?.recentFleetJobs ?? []).length === 0 ? (
            <div className="p-8 text-sm font-semibold text-slate-400">
              No Fleet Jobs.
            </div>
          ) : (
            data?.recentFleetJobs.slice(0, 8).map((job) => (
              <Link
                key={job.id}
                href={`/assets/fleet-jobs/${job.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-slate-900">
                    {job.job_number || "Fleet Job"} ·{" "}
                    {job.asset_label || "Asset"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {titleCase(job.status)} · {titleCase(job.priority)}
                  </div>
                </div>
                <ArrowRight size={16} className="shrink-0 text-slate-300" />
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  icon,
  href,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-black uppercase tracking-wide text-slate-400">
          {label}
        </div>
        <div className="text-slate-400">{icon}</div>
      </div>
      <div className="mt-3 text-2xl font-black tracking-tight text-slate-950">
        {value}
      </div>
      <div className="mt-1 text-xs font-medium text-slate-500">{detail}</div>
    </>
  );

  return href ? (
    <Link
      href={href}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      {content}
    </Link>
  ) : (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {content}
    </div>
  );
}

function DueBadge({ days }: { days: number }) {
  const classes =
    days < 0
      ? "bg-rose-100 text-rose-700"
      : days <= 14
        ? "bg-amber-100 text-amber-800"
        : "bg-blue-50 text-blue-700";

  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${classes}`}>
      {days < 0
        ? `${Math.abs(days)}d overdue`
        : days === 0
          ? "Due today"
          : `${days}d`}
    </span>
  );
}
