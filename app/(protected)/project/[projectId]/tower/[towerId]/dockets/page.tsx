"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type TowerRecord = {
  id: string;
  name?: string | null;
  project_id?: string | null;
  line?: string | null;
  status?: string | null;
  progress?: number | null;
  extra_data?: Record<string, unknown> | null;
};

type DocketRecord = {
  id: string;
  project_id: string;
  tower_id: string;
  docket_date: string | null;
  crew: string | null;
  leading_hand: string | null;
  weather: string | null;
  assembly_percent?: number | null;
  erection_percent?: number | null;
  weather_delay_hours?: number | null;
  lightning_delay_hours?: number | null;
  toolbox_delay_hours?: number | null;
  other_delay_hours?: number | null;
  lunch_break_minutes?: number | null;
  travel_in_minutes?: number | null;
  travel_out_minutes?: number | null;
  mobilisation_hours?: number | null;
  raw_manhours?: number | null;
  production_manhours?: number | null;
  bc_rep_name?: string | null;
  client_rep_name?: string | null;
  signed_date?: string | null;
  docket_file_url?: string | null;
  created_at?: string | null;
};

type LabourRow = {
  docket_id: string;
  total_hours: number | null;
  production_hours?: number | null;
  lunch_minutes?: number | null;
  travel_in_minutes?: number | null;
  travel_out_minutes?: number | null;
  mobilisation_hours?: number | null;
  delay_hours?: number | null;
};

type DelayRow = {
  docket_id: string;
  delay_type: string | null;
  delay_hours: number | null;
  applies_to: string | null;
  worker_names: string[] | null;
};

type DocketTotals = {
  raw: number;
  production: number;
  lunch: number;
  travel: number;
  mobilisation: number;
  delay: number;
  delayEvents: number;
};

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatNumber(value: number): string {
  return value.toFixed(2);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "No date";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getProgress(docket: DocketRecord): number {
  const assembly = safeNumber(docket.assembly_percent, 0);
  const erection = safeNumber(docket.erection_percent, 0);
  return Math.round(assembly * 0.5 + erection * 0.5);
}

function getProgressColour(progress: number): string {
  if (progress >= 100) return "bg-emerald-500";
  if (progress >= 60) return "bg-blue-500";
  if (progress >= 30) return "bg-amber-500";
  return "bg-slate-400";
}

function getStatus(docket: DocketRecord): "closed" | "bc_signed" | "open" {
  if (docket.client_rep_name?.trim() && docket.signed_date?.trim()) return "closed";
  if (docket.bc_rep_name?.trim()) return "bc_signed";
  return "open";
}

function getStatusLabel(status: "closed" | "bc_signed" | "open") {
  if (status === "closed") return "Closed";
  if (status === "bc_signed") return "BC Signed";
  return "Open";
}

function getStatusClasses(status: "closed" | "bc_signed" | "open") {
  if (status === "closed") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status === "bc_signed") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-amber-100 text-amber-700 border-amber-200";
}

export default function TowerDocketsPage() {
  const supabase = createSupabaseBrowser();
  const params = useParams();

  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const [tower, setTower] = useState<TowerRecord | null>(null);
  const [dockets, setDockets] = useState<DocketRecord[]>([]);
  const [labourRows, setLabourRows] = useState<LabourRow[]>([]);
  const [delayRows, setDelayRows] = useState<DelayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDocketId, setOpenDocketId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      setLoading(true);

      const { data: towerData } = await supabase
        .from("towers")
        .select("*")
        .eq("id", towerId)
        .single();

      const { data: docketData } = await supabase
        .from("tower_daily_dockets")
        .select("*")
        .eq("tower_id", towerId)
        .order("docket_date", { ascending: false });

      if (!isMounted) return;

      const loadedDockets = (docketData || []) as DocketRecord[];
      setTower((towerData as TowerRecord | null) || null);
      setDockets(loadedDockets);

      const docketIds = loadedDockets.map((docket) => docket.id);

      if (docketIds.length > 0) {
        const [{ data: labourData }, { data: delayData }] = await Promise.all([
          supabase
            .from("tower_docket_labour")
            .select(
              "docket_id,total_hours,production_hours,lunch_minutes,travel_in_minutes,travel_out_minutes,mobilisation_hours,delay_hours",
            )
            .in("docket_id", docketIds),
          supabase
            .from("tower_docket_delays")
            .select("docket_id,delay_type,delay_hours,applies_to,worker_names")
            .in("docket_id", docketIds),
        ]);

        if (!isMounted) return;

        setLabourRows((labourData || []) as LabourRow[]);
        setDelayRows((delayData || []) as DelayRow[]);
      } else {
        setLabourRows([]);
        setDelayRows([]);
      }

      setLoading(false);
    }

    void fetchData();

    return () => {
      isMounted = false;
    };
  }, [towerId, supabase]);

  const docketTotals = useMemo(() => {
    const totals: Record<string, DocketTotals> = {};

    dockets.forEach((docket) => {
      totals[docket.id] = {
        raw: safeNumber(docket.raw_manhours, 0),
        production: safeNumber(docket.production_manhours, 0),
        lunch: 0,
        travel: 0,
        mobilisation: 0,
        delay: 0,
        delayEvents: 0,
      };
    });

    labourRows.forEach((row) => {
      if (!totals[row.docket_id]) return;

      totals[row.docket_id].raw += totals[row.docket_id].raw > 0 ? 0 : safeNumber(row.total_hours, 0);
      totals[row.docket_id].production +=
        totals[row.docket_id].production > 0 ? 0 : safeNumber(row.production_hours, 0);
      totals[row.docket_id].lunch += safeNumber(row.lunch_minutes, 0) / 60;
      totals[row.docket_id].travel +=
        (safeNumber(row.travel_in_minutes, 0) + safeNumber(row.travel_out_minutes, 0)) / 60;
      totals[row.docket_id].mobilisation += safeNumber(row.mobilisation_hours, 0);
      totals[row.docket_id].delay += safeNumber(row.delay_hours, 0);
    });

    delayRows.forEach((row) => {
      if (!totals[row.docket_id]) return;

      const delayHours = safeNumber(row.delay_hours, 0);
      const people =
        row.applies_to === "selected_workers" ? row.worker_names?.length || 0 : 1;

      totals[row.docket_id].delayEvents += delayHours;
      if (totals[row.docket_id].delay === 0) {
        totals[row.docket_id].delay += delayHours * Math.max(people, 1);
      }
    });

    return totals;
  }, [dockets, labourRows, delayRows]);

  const summary = useMemo(() => {
    return dockets.reduce(
      (acc, docket) => {
        const totals = docketTotals[docket.id];
        const progress = getProgress(docket);
        const status = getStatus(docket);

        acc.raw += totals?.raw || 0;
        acc.production += totals?.production || 0;
        acc.delay += totals?.delay || 0;
        acc.lunch += totals?.lunch || 0;
        acc.travel += totals?.travel || 0;
        acc.mobilisation += totals?.mobilisation || 0;
        acc.avgProgress += progress;

        if (status === "closed") acc.closed += 1;
        if (status === "open") acc.open += 1;

        return acc;
      },
      {
        raw: 0,
        production: 0,
        delay: 0,
        lunch: 0,
        travel: 0,
        mobilisation: 0,
        avgProgress: 0,
        closed: 0,
        open: 0,
      },
    );
  }, [dockets, docketTotals]);

  const filteredDockets = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return dockets;

    return dockets.filter((docket) => {
      const totals = docketTotals[docket.id];

      return [
        docket.docket_date,
        docket.crew,
        docket.leading_hand,
        docket.weather,
        getStatusLabel(getStatus(docket)),
        totals?.raw,
        totals?.production,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [dockets, search, docketTotals]);

  async function deleteDocket(id: string) {
    const confirmed = window.confirm("Delete this daily docket?");
    if (!confirmed) return;

    const { error } = await supabase.from("tower_daily_dockets").delete().eq("id", id);

    if (error) {
      alert(error.message || "Failed to delete docket.");
      return;
    }

    setDockets((prev) => prev.filter((docket) => docket.id !== id));
    setLabourRows((prev) => prev.filter((row) => row.docket_id !== id));
    setDelayRows((prev) => prev.filter((row) => row.docket_id !== id));
  }

  if (loading) {
    return <div className="p-8">Loading Daily Dockets...</div>;
  }

  return (
    <div className="p-3 md:p-8 space-y-4 bg-slate-50 min-h-screen">
      {tower && <TowerHeader projectId={projectId} tower={tower} />}

      <div className="bg-white border border-slate-200 rounded-2xl md:rounded-3xl shadow-sm overflow-hidden">
        <div className="p-4 md:p-6 border-b border-slate-200">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                Daily Dockets
              </h1>
              <p className="text-sm md:text-base text-slate-500 mt-1">
                Review raw hours, production hours, delays and progress for this tower.
              </p>
            </div>

            <Link
              href={`/project/${projectId}/tower/${towerId}/dockets/new`}
              className="w-full md:w-auto text-center bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl text-sm font-semibold"
            >
              + Add Daily Docket
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2 md:gap-3 mt-5">
            <KpiCard label="Dockets" value={dockets.length} />
            <KpiCard label="Raw Hrs" value={formatNumber(summary.raw)} />
            <KpiCard label="Prod Hrs" value={formatNumber(summary.production)} tone="green" />
            <KpiCard label="Delay MH" value={formatNumber(summary.delay)} tone="amber" />
            <KpiCard label="Travel" value={formatNumber(summary.travel)} />
            <KpiCard label="Mob" value={formatNumber(summary.mobilisation)} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mt-3">
            <SmallCard label="Lunch Hrs" value={formatNumber(summary.lunch)} />
            <SmallCard
              label="Avg Progress"
              value={
                dockets.length > 0
                  ? `${Math.round(summary.avgProgress / dockets.length)}%`
                  : "0%"
              }
            />
            <SmallCard label="Open" value={summary.open} />
            <SmallCard label="Closed" value={summary.closed} />
          </div>

          <div className="mt-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search date, crew, leading hand, weather or status..."
              className="w-full border border-slate-300 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="p-3 md:p-5">
          {filteredDockets.length === 0 ? (
            <div className="border border-dashed border-slate-300 rounded-2xl p-10 text-center text-slate-500 bg-slate-50">
              No daily dockets found.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDockets.map((docket) => {
                const progress = getProgress(docket);
                const status = getStatus(docket);
                const totals = docketTotals[docket.id] || {
                  raw: 0,
                  production: 0,
                  lunch: 0,
                  travel: 0,
                  mobilisation: 0,
                  delay: 0,
                  delayEvents: 0,
                };

                const isOpen = openDocketId === docket.id;

                return (
                  <div
                    key={docket.id}
                    className="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenDocketId(isOpen ? null : docket.id)}
                      className="w-full text-left p-3 md:p-4 hover:bg-slate-50 transition"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-bold text-base md:text-lg text-slate-900">
                              {formatDate(docket.docket_date)}
                            </div>

                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClasses(
                                status,
                              )}`}
                            >
                              {getStatusLabel(status)}
                            </span>
                          </div>

                          <div className="text-sm text-slate-500 mt-1">
                            {docket.leading_hand || "No leading hand"} • Crew{" "}
                            {docket.crew || "—"} • {docket.weather || "No weather"}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-lg font-bold text-slate-900">{progress}%</div>
                          <div className="text-[11px] text-slate-500">Progress</div>
                        </div>
                      </div>

                      <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${getProgressColour(progress)}`}
                          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                        />
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-3">
                        <MiniMetric label="Raw" value={formatNumber(totals.raw)} />
                        <MiniMetric label="Prod" value={formatNumber(totals.production)} />
                        <MiniMetric label="Delay" value={formatNumber(totals.delay)} />
                        <MiniMetric label="Lunch" value={formatNumber(totals.lunch)} />
                        <MiniMetric label="Travel" value={formatNumber(totals.travel)} />
                        <MiniMetric label="Mob" value={formatNumber(totals.mobilisation)} />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-slate-200 bg-slate-50 p-3 md:p-4 space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <DetailCard label="Assembly" value={`${safeNumber(docket.assembly_percent)}%`} />
                          <DetailCard label="Erection" value={`${safeNumber(docket.erection_percent)}%`} />
                          <DetailCard label="Delay Events" value={formatNumber(totals.delayEvents)} />
                          <DetailCard
                            label="Uploaded"
                            value={docket.docket_file_url ? "Yes" : "No"}
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <Link
                            href={`/project/${projectId}/tower/${towerId}/dockets/${docket.id}?mode=view`}
                            className="text-center bg-slate-800 text-white px-4 py-3 rounded-xl text-sm font-semibold"
                          >
                            View
                          </Link>

                          {status !== "closed" && (
                            <Link
                              href={`/project/${projectId}/tower/${towerId}/dockets/${docket.id}/edit`}
                              className="text-center bg-blue-600 text-white px-4 py-3 rounded-xl text-sm font-semibold"
                            >
                              Edit
                            </Link>
                          )}

                          <button
                            type="button"
                            onClick={() => void deleteDocket(docket.id)}
                            className="bg-rose-600 text-white px-4 py-3 rounded-xl text-sm font-semibold"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  tone?: "slate" | "green" | "amber";
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-900",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
  };

  return (
    <div className={`rounded-xl px-3 py-3 min-w-0 ${tones[tone]}`}>
      <div className="text-[11px] opacity-75 truncate">{label}</div>
      <div className="font-bold text-base md:text-lg mt-1 truncate">{value}</div>
    </div>
  );
}

function SmallCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 px-3 py-2 min-w-0">
      <div className="text-[11px] text-slate-500 truncate">{label}</div>
      <div className="font-bold text-sm md:text-base mt-1 truncate">{value}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-100 px-3 py-2 min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 truncate">
        {label}
      </div>
      <div className="font-semibold text-sm mt-1 truncate">{value}</div>
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 px-3 py-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="font-bold text-sm md:text-base mt-1">{value}</div>
    </div>
  );
}