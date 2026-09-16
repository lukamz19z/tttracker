"use client";

import {
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { createSupabaseBrowser } from "@/lib/supabase";

type ServiceRow = {
  id: string;
  service_number: string;
  asset_type: "vehicle" | "plant";
  vehicle_asset_id: string | null;
  plant_asset_id: string | null;
  record_type: string;
  status: string;
  service_date: string;
  odometer_km: number | string | null;
  engine_hours: number | string | null;
  provider_type: string;
  provider_name: string | null;
  mechanic_name: string | null;
  supplier: string | null;
  summary: string;
  invoice_number: string | null;
  amount_inc_gst: number | string | null;
  next_service_date: string | null;
  next_service_km: number | string | null;
  next_service_hours: number | string | null;
  report_document_id: string | null;
  created_at: string;
  asset_label: string;
  asset_href: string;
};

type ServicePayload = {
  records: ServiceRow[];
  error?: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function titleCase(value: unknown) {
  return clean(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function dateLabel(value: unknown) {
  const raw = clean(value);
  if (!raw) return "—";

  const parsed = new Date(`${raw.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;

  return parsed.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function money(value: unknown) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(Number(value ?? 0) || 0);
}

export default function AssetServiceRegisterPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [records, setRecords] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState("all");
  const [recordTypeFilter, setRecordTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

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

  const load = useCallback(async () => {
    const response = await apiFetch("/api/assets/services?limit=500");
    const payload = (await response.json()) as ServicePayload;

    if (!response.ok) {
      throw new Error(
        payload.error || "Service register could not be loaded.",
      );
    }

    setRecords(payload.records ?? []);
  }, [apiFetch]);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Service register could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    setError("");

    try {
      await load();
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Service register could not be refreshed.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return records.filter((record) => {
      if (
        assetTypeFilter !== "all" &&
        record.asset_type !== assetTypeFilter
      ) {
        return false;
      }

      if (
        recordTypeFilter !== "all" &&
        record.record_type !== recordTypeFilter
      ) {
        return false;
      }

      if (
        statusFilter !== "all" &&
        record.status !== statusFilter
      ) {
        return false;
      }

      if (!query) return true;

      return [
        record.service_number,
        record.asset_label,
        record.record_type,
        record.summary,
        record.provider_name,
        record.mechanic_name,
        record.supplier,
        record.invoice_number,
        record.status,
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [
    assetTypeFilter,
    recordTypeFilter,
    records,
    search,
    statusFilter,
  ]);

  const totalSpend = filtered.reduce(
    (sum, record) =>
      sum + (Number(record.amount_inc_gst ?? 0) || 0),
    0,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              Assets
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
              Service Register
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Search the actual service history without opening PDFs. Each
              completed internal service also generates a branded controlled PDF
              in the asset&apos;s SharePoint folder.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </button>

            <Link
              href="/assets/services/new"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white"
            >
              <Plus size={16} />
              New Service
            </Link>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Records Shown"
          value={String(filtered.length)}
          detail={`${records.length} total service records`}
        />
        <Metric
          label="Completed"
          value={String(
            filtered.filter((record) => record.status === "completed")
              .length,
          )}
          detail="Structured completed records"
        />
        <Metric
          label="Recorded Cost"
          value={money(totalSpend)}
          detail="Service record cost fields"
        />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-200 p-5 lg:grid-cols-[minmax(0,1fr)_180px_190px_170px]">
          <label className="relative">
            <Search
              size={17}
              className="absolute left-3 top-3.5 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search service #, asset, issue, mechanic, supplier or invoice..."
              className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <select
            value={assetTypeFilter}
            onChange={(event) => setAssetTypeFilter(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700"
          >
            <option value="all">Vehicle + Plant</option>
            <option value="vehicle">Vehicles</option>
            <option value="plant">Plant</option>
          </select>

          <select
            value={recordTypeFilter}
            onChange={(event) => setRecordTypeFilter(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700"
          >
            <option value="all">All record types</option>
            <option value="service">Service</option>
            <option value="repair">Repair</option>
            <option value="maintenance">Maintenance</option>
            <option value="inspection">Inspection</option>
            <option value="breakdown">Breakdown</option>
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700"
          >
            <option value="all">All statuses</option>
            <option value="completed">Completed</option>
            <option value="draft">Draft</option>
            <option value="void">Void</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Service</th>
                <th className="px-5 py-3">Asset</th>
                <th className="px-5 py-3">Work</th>
                <th className="px-5 py-3">Reading</th>
                <th className="px-5 py-3">Provider</th>
                <th className="px-5 py-3">Next Due</th>
                <th className="px-5 py-3 text-right">Cost</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <Loader2
                      size={26}
                      className="mx-auto animate-spin text-slate-400"
                    />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-16 text-center text-sm font-semibold text-slate-400"
                  >
                    No service records match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <div className="font-black text-slate-950">
                        {record.service_number}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {dateLabel(record.service_date)} ·{" "}
                        {titleCase(record.record_type)}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <Link
                        href={record.asset_href}
                        className="font-black text-blue-700 hover:underline"
                      >
                        {record.asset_label}
                      </Link>
                    </td>

                    <td className="max-w-md px-5 py-4">
                      <div className="font-bold text-slate-800">
                        {record.summary}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {titleCase(record.status)}
                      </div>
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {record.odometer_km !== null
                        ? `${Number(record.odometer_km).toLocaleString(
                            "en-AU",
                          )} km`
                        : record.engine_hours !== null
                          ? `${Number(record.engine_hours).toLocaleString(
                              "en-AU",
                            )} h`
                          : "—"}
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      <div>
                        {record.mechanic_name ||
                          record.provider_name ||
                          record.supplier ||
                          "—"}
                      </div>
                      {record.invoice_number ? (
                        <div className="mt-1 text-xs">
                          Invoice {record.invoice_number}
                        </div>
                      ) : null}
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {[
                        record.next_service_date
                          ? dateLabel(record.next_service_date)
                          : "",
                        record.next_service_km !== null
                          ? `${Number(
                              record.next_service_km,
                            ).toLocaleString("en-AU")} km`
                          : "",
                        record.next_service_hours !== null
                          ? `${Number(
                              record.next_service_hours,
                            ).toLocaleString("en-AU")} h`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>

                    <td className="px-5 py-4 text-right font-black text-slate-900">
                      {money(record.amount_inc_gst)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-xs font-black uppercase tracking-wide text-slate-400">
          {label}
        </div>
        <div className="rounded-xl bg-slate-100 p-2 text-slate-500">
          {label.includes("Cost") ? (
            <FileText size={17} />
          ) : (
            <Wrench size={17} />
          )}
        </div>
      </div>
      <div className="mt-3 text-2xl font-black text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
}
