"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ClipboardList,
  Filter,
  Plus,
  Search,
  Users,
} from "lucide-react";

import { createSupabaseBrowser } from "@/lib/supabase";

type TowerRow = {
  id: string;
  name: string | null;
  line: string | null;
  extra_data?: Record<string, unknown> | null;
};

type DocketRow = {
  id: string;
  project_id: string;
  tower_id: string;
  docket_date: string | null;
  crew: string | null;
  leading_hand: string | null;
  approval_status?: string | null;
  raw_manhours?: number | null;
  production_manhours?: number | null;
  bc_approved_name?: string | null;
  client_approved_name?: string | null;
};

function safe(value: unknown) {
  return value == null ? "" : String(value);
}

function towerLabel(tower: TowerRow | undefined) {
  if (!tower) return "Unknown tower";
  const extra = tower.extra_data || {};
  return (
    safe(extra["Tower Number"]) ||
    safe(extra["tower_number"]) ||
    safe(extra["Structure Number"]) ||
    safe(extra["structure_number"]) ||
    safe(tower.name) ||
    "Unnamed tower"
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case "submitted_bc":
      return "Internal Review";
    case "bc_changes_requested":
      return "Changes Required";
    case "client_pending":
      return "Client Review";
    case "client_changes_requested":
      return "Client Changes";
    case "final":
    case "legacy_final":
      return "Approved";
    case "draft":
      return "Draft";
    default:
      return status ? status.replaceAll("_", " ") : "Draft";
  }
}

function statusClasses(status: string | null | undefined) {
  if (status === "final" || status === "legacy_final") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "submitted_bc" || status === "client_pending") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (
    status === "bc_changes_requested" ||
    status === "client_changes_requested"
  ) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function ProjectDailyDocketsPage() {
  const params = useParams();
  const projectId = String(params.projectId || "");
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [towers, setTowers] = useState<TowerRow[]>([]);
  const [dockets, setDockets] = useState<DocketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [date, setDate] = useState("");
  const [towerId, setTowerId] = useState("");
  const [crew, setCrew] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      const [towerRes, docketRes] = await Promise.all([
        supabase
          .from("towers")
          .select("id,name,line,extra_data")
          .eq("project_id", projectId),
        supabase
          .from("tower_daily_dockets")
          .select("*")
          .eq("project_id", projectId)
          .order("docket_date", { ascending: false }),
      ]);

      if (cancelled) return;

      if (towerRes.error || docketRes.error) {
        setError(
          towerRes.error?.message ||
            docketRes.error?.message ||
            "Daily Dockets could not be loaded.",
        );
        setTowers([]);
        setDockets([]);
        setLoading(false);
        return;
      }

      setTowers(
        ((towerRes.data || []) as TowerRow[]).sort((a, b) =>
          towerLabel(a).localeCompare(towerLabel(b), undefined, {
            numeric: true,
            sensitivity: "base",
          }),
        ),
      );
      setDockets((docketRes.data || []) as DocketRow[]);
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [projectId, supabase]);

  const towerById = useMemo(
    () => new Map(towers.map((tower) => [tower.id, tower])),
    [towers],
  );

  const crewOptions = useMemo(
    () =>
      Array.from(
        new Set(
          dockets
            .map((docket) => safe(docket.crew).trim())
            .filter(Boolean),
        ),
      ).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
      ),
    [dockets],
  );

  const statusOptions = useMemo(
    () =>
      Array.from(
        new Set(
          dockets
            .map((docket) => safe(docket.approval_status).trim())
            .filter(Boolean),
        ),
      ),
    [dockets],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return dockets.filter((docket) => {
      if (date && safe(docket.docket_date).slice(0, 10) !== date) return false;
      if (towerId && docket.tower_id !== towerId) return false;
      if (crew && safe(docket.crew) !== crew) return false;
      if (status && safe(docket.approval_status) !== status) return false;

      if (!q) return true;

      const tower = towerById.get(docket.tower_id);
      return [
        towerLabel(tower),
        tower?.line,
        docket.crew,
        docket.leading_hand,
        statusLabel(docket.approval_status),
        docket.docket_date,
      ]
        .map(safe)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [crew, date, dockets, search, status, towerById, towerId]);

  const todayCount = useMemo(() => {
    const local = new Date();
    const key = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(local.getDate()).padStart(2, "0")}`;
    return dockets.filter(
      (docket) => safe(docket.docket_date).slice(0, 10) === key,
    ).length;
  }, [dockets]);

  const reviewCount = dockets.filter((docket) =>
    ["submitted_bc", "client_pending"].includes(
      safe(docket.approval_status),
    ),
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
            Project Operations
          </div>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
            Daily Dockets
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Project-wide Daily Docket register. Search an exact date, tower,
            crew, leading hand or review state without opening towers one by one.
          </p>
        </div>

        <Link
          href={`/project/${projectId}/daily-dockets/new`}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-700"
        >
          <Plus size={17} />
          New Daily Docket
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={ClipboardList}
          label="Project dockets"
          value={dockets.length}
        />
        <StatCard icon={CalendarDays} label="Today" value={todayCount} />
        <StatCard icon={Users} label="Crews represented" value={crewOptions.length} />
        <StatCard icon={Filter} label="Awaiting review" value={reviewCount} />
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            />
          </Field>

          <Field label="Tower">
            <select
              value={towerId}
              onChange={(event) => setTowerId(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">All towers</option>
              {towers.map((tower) => (
                <option key={tower.id} value={tower.id}>
                  {towerLabel(tower)}
                  {tower.line ? ` · ${tower.line}` : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Crew">
            <select
              value={crew}
              onChange={(event) => setCrew(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">All crews</option>
              {crewOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Review status">
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">All statuses</option>
              {statusOptions.map((item) => (
                <option key={item} value={item}>
                  {statusLabel(item)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Search">
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-3 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tower, leading hand..."
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm"
              />
            </div>
          </Field>
        </div>

        {(date || towerId || crew || status || search) && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm">
            <span className="font-semibold text-blue-900">
              {filtered.length} matching docket{filtered.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => {
                setDate("");
                setTowerId("");
                setCrew("");
                setStatus("");
                setSearch("");
              }}
              className="font-black text-blue-700 hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="font-black text-slate-950">Docket register</div>
          <div className="mt-1 text-xs text-slate-500">
            {loading ? "Loading..." : `${filtered.length} records shown`}
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-sm text-slate-500">Loading Daily Dockets…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-sm text-slate-500">
            No Daily Dockets match the selected filters.
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-black">Date</th>
                    <th className="px-5 py-3 font-black">Tower</th>
                    <th className="px-5 py-3 font-black">Crew</th>
                    <th className="px-5 py-3 font-black">Leading Hand</th>
                    <th className="px-5 py-3 font-black">Raw MH</th>
                    <th className="px-5 py-3 font-black">Production MH</th>
                    <th className="px-5 py-3 font-black">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((docket) => {
                    const tower = towerById.get(docket.tower_id);
                    return (
                      <tr
                        key={docket.id}
                        className="border-t border-slate-100 hover:bg-slate-50"
                      >
                        <td className="px-5 py-4 font-semibold text-slate-900">
                          {formatDate(docket.docket_date)}
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-black text-slate-900">
                            {towerLabel(tower)}
                          </div>
                          {tower?.line ? (
                            <div className="mt-0.5 text-xs text-slate-500">
                              {tower.line}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-5 py-4">{docket.crew || "—"}</td>
                        <td className="px-5 py-4">{docket.leading_hand || "—"}</td>
                        <td className="px-5 py-4">
                          {Number(docket.raw_manhours || 0).toFixed(1)}
                        </td>
                        <td className="px-5 py-4">
                          {Number(docket.production_manhours || 0).toFixed(1)}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${statusClasses(
                              docket.approval_status,
                            )}`}
                          >
                            {statusLabel(docket.approval_status)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Link
                            href={`/project/${projectId}/tower/${docket.tower_id}/dockets/${docket.id}`}
                            className="font-black text-blue-600 hover:underline"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 md:hidden">
              {filtered.map((docket) => {
                const tower = towerById.get(docket.tower_id);
                return (
                  <Link
                    key={docket.id}
                    href={`/project/${projectId}/tower/${docket.tower_id}/dockets/${docket.id}`}
                    className="block p-4 hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-black text-slate-950">
                          {towerLabel(tower)}
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          {formatDate(docket.docket_date)} · {docket.crew || "No crew"}
                        </div>
                      </div>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${statusClasses(
                          docket.approval_status,
                        )}`}
                      >
                        {statusLabel(docket.approval_status)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <Mini label="Leading Hand" value={docket.leading_hand || "—"} />
                      <Mini
                        label="Production MH"
                        value={Number(docket.production_manhours || 0).toFixed(1)}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
        <Icon size={16} />
        {label}
      </div>
      <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 font-bold text-slate-800">{value}</div>
    </div>
  );
}
