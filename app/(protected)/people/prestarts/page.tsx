"use client";

import {
  CalendarDays,
  Download,
  ExternalLink,
  FileSignature,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type RegisterRow = {
  id: string;
  prestart_number: string;
  project_id: string;
  project_name: string | null;
  project_number: string | null;
  prestart_date: string;
  location: string;
  conducted_by_name: string;
  current_revision: number;
  admin_notes: string | null;
  status: "draft" | "completed" | "void";
  completed_at: string | null;
  completed_by_name: string | null;
  pdf_file_name: string | null;
  sharepoint_web_url: string | null;
  sharepoint_sync_status: string | null;
  sharepoint_sync_error: string | null;
  attendee_count: number;
  attendee_names: string[];
  created_at: string;
};

type Revision = {
  id: string;
  revision_no: number;
  discussion_points: string;
  revision_note: string | null;
  created_by_name: string;
  created_at: string;
};

type SignaturePoint = { x: number; y: number };
type SignatureStroke = SignaturePoint[];

type Attendee = {
  id: string;
  employee_id: string;
  employee_name: string;
  payroll_id: string | null;
  discussion_revision_no: number;
  breathalyser_reading: number | string | null;
  declaration_text: string;
  declaration_accepted: boolean;
  signature_strokes: SignatureStroke[];
  signature_width: number | null;
  signature_height: number | null;
  signed_at: string;
};

type DetailPayload = {
  prestart: RegisterRow;
  revisions: Revision[];
  attendees: Attendee[];
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function formatDate(value: unknown) {
  const raw = clean(value);
  if (!raw) return "—";

  const date = new Date(
    raw.length <= 10 ? `${raw.slice(0, 10)}T00:00:00` : raw,
  );

  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: unknown) {
  const raw = clean(value);
  if (!raw) return "—";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function projectLabel(row: RegisterRow) {
  return [clean(row.project_number), clean(row.project_name)]
    .filter(Boolean)
    .join(" — ") || "Project";
}

function breathalyser(value: unknown) {
  if (value === null || value === undefined || clean(value) === "") {
    return "N/A";
  }

  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(3) : clean(value);
}

function csv(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function SitePrestartRegisterPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [rows, setRows] = useState<RegisterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const apiFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${session.access_token}`);

      return fetch(url, {
        ...init,
        headers,
        cache: "no-store",
      });
    },
    [supabase],
  );

  const load = useCallback(async () => {
    const response = await apiFetch("/api/site-prestarts");
    const payload = (await response.json()) as {
      prestarts?: RegisterRow[];
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error || "Site Prestart register could not be loaded.");
    }

    setRows(payload.prestarts ?? []);
  }, [apiFetch]);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Site Prestart register could not be loaded.",
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

      if (selectedId) {
        await openDetail(selectedId, false);
      }
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to refresh Site Prestarts.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function openDetail(id: string, showLoading = true) {
    setSelectedId(id);
    if (showLoading) setDetailLoading(true);
    setError("");

    try {
      const response = await apiFetch(
        `/api/site-prestarts/${encodeURIComponent(id)}`,
      );
      const payload = (await response.json()) as DetailPayload & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Site Prestart could not be opened.");
      }

      setDetail(payload);
    } catch (detailError) {
      setDetail(null);
      setError(
        detailError instanceof Error
          ? detailError.message
          : "Site Prestart could not be opened.",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function deletePrestart(row: RegisterRow) {
    const completedNote =
      row.status === "completed"
        ? "\n\nThe final SharePoint PDF will also be removed when TTTracker can reach it."
        : "";

    const confirmed = window.confirm(
      `Delete ${row.prestart_number}?\n\nThis permanently removes the Site Prestart, all discussion revisions and all employee signatures.${completedNote}\n\nThis cannot be undone.`,
    );

    if (!confirmed) return;

    setDeletingId(row.id);
    setError("");

    try {
      const response = await apiFetch(
        `/api/site-prestarts/${encodeURIComponent(row.id)}`,
        { method: "DELETE" },
      );

      const payload = (await response.json()) as {
        success?: boolean;
        warning?: string | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Site Prestart could not be deleted.");
      }

      setRows((current) => current.filter((item) => item.id !== row.id));

      if (selectedId === row.id) {
        setSelectedId(null);
        setDetail(null);
      }

      if (payload.warning) {
        window.alert(
          `${row.prestart_number} was deleted from TTTracker.\n\n${payload.warning}`,
        );
      }
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Site Prestart could not be deleted.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  const projects = useMemo(() => {
    const map = new Map<string, string>();

    for (const row of rows) {
      map.set(row.project_id, projectLabel(row));
    }

    return Array.from(map.entries()).sort((a, b) =>
      a[1].localeCompare(b[1]),
    );
  }, [rows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (projectFilter !== "all" && row.project_id !== projectFilter) {
        return false;
      }

      if (statusFilter !== "all" && row.status !== statusFilter) {
        return false;
      }

      if (!query) return true;

      return [
        row.prestart_number,
        row.project_name,
        row.project_number,
        row.prestart_date,
        row.location,
        row.conducted_by_name,
        row.completed_by_name,
        row.admin_notes,
        row.attendee_names?.join(" "),
        row.status,
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [projectFilter, rows, search, statusFilter]);

  const summary = useMemo(
    () => ({
      total: filtered.length,
      completed: filtered.filter((row) => row.status === "completed").length,
      draft: filtered.filter((row) => row.status === "draft").length,
      signed: filtered.reduce(
        (total, row) => total + Number(row.attendee_count || 0),
        0,
      ),
    }),
    [filtered],
  );

  function exportCsv() {
    const headers = [
      "Prestart",
      "Date",
      "Project",
      "Location",
      "Conducted By",
      "Revision",
      "Signed Employees",
      "Status",
      "Completed",
      "PDF",
      "Notes",
    ];

    const body = filtered.map((row) => [
      row.prestart_number,
      row.prestart_date,
      projectLabel(row),
      row.location,
      row.conducted_by_name,
      row.current_revision,
      row.attendee_count,
      row.status,
      row.completed_at,
      row.sharepoint_web_url,
      row.admin_notes,
    ]);

    const blob = new Blob(
      [
        [
          headers.map(csv).join(","),
          ...body.map((row) => row.map(csv).join(",")),
        ].join("\n"),
      ],
      { type: "text/csv;charset=utf-8;" },
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `site-prestart-register-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <Link
                href="/people"
                className="inline-flex items-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back to People
              </Link>

              <div className="mt-5 flex items-center gap-2 text-slate-400">
                <ShieldCheck size={18} />
                <span className="text-sm font-semibold uppercase tracking-wider">
                  Workforce / HSEQ
                </span>
              </div>

              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                Site Prestart Register
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Website register of site prestarts completed through TTTracker Mobile.
                Open a record to review discussion revisions or remove accidental duplicates,
                notes, signed employees, breathalyser readings and signatures.
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

              <button
                type="button"
                onClick={exportCsv}
                disabled={filtered.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
              >
                <Download size={16} />
                Export CSV
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Shown" value={summary.total} icon={<FileSignature size={20} />} />
          <Metric label="Completed" value={summary.completed} icon={<ShieldCheck size={20} />} />
          <Metric label="Draft" value={summary.draft} icon={<CalendarDays size={20} />} />
          <Metric label="Current Signatures" value={summary.signed} icon={<Users size={20} />} />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-3 border-b border-slate-200 p-5 lg:grid-cols-[minmax(0,1fr)_260px_180px]">
            <label className="relative">
              <Search
                size={17}
                className="absolute left-3 top-3.5 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search prestart, project, location or conductor..."
                className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <select
              value={projectFilter}
              onChange={(event) => setProjectFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700"
            >
              <option value="all">All projects</option>
              {projects.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
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
                  <th className="px-5 py-3">Prestart</th>
                  <th className="px-5 py-3">Project / Site</th>
                  <th className="px-5 py-3">Conducted By</th>
                  <th className="px-5 py-3">Signed</th>
                  <th className="px-5 py-3">Revision</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
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
                      className="px-5 py-16 text-center text-sm font-semibold text-slate-500"
                    >
                      No Site Prestarts match the current filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <div className="font-black text-slate-950">
                          {row.prestart_number}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatDate(row.prestart_date)}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-bold text-slate-800">
                          {projectLabel(row)}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {row.location}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-slate-700">
                        {row.conducted_by_name}
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-black text-slate-800">
                          {row.attendee_count}
                        </div>
                        {row.attendee_names?.length ? (
                          <div className="mt-1 max-w-52 truncate text-xs text-slate-500">
                            {row.attendee_names.join(", ")}
                          </div>
                        ) : null}
                      </td>

                      <td className="px-5 py-4 font-bold text-slate-700">
                        R{row.current_revision}
                      </td>

                      <td className="px-5 py-4">
                        <Status status={row.status} />
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void openDetail(row.id)}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-white"
                          >
                            View
                          </button>

                          <button
                            type="button"
                            onClick={() => void deletePrestart(row)}
                            disabled={deletingId === row.id}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                            title={`Delete ${row.prestart_number}`}
                          >
                            {deletingId === row.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                            Delete
                          </button>

                          {row.sharepoint_web_url ? (
                            <a
                              href={row.sharepoint_web_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-3 py-2 text-xs font-black text-white"
                            >
                              <ExternalLink size={14} />
                              PDF
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {selectedId ? (
        <div className="fixed inset-0 z-50 bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-slate-400">
                  Site Prestart
                </div>
                <div className="mt-1 text-xl font-black text-slate-950">
                  {detail?.prestart.prestart_number || "Loading..."}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {detail?.prestart ? (
                  <button
                    type="button"
                    onClick={() => void deletePrestart(detail.prestart)}
                    disabled={deletingId === detail.prestart.id}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-black text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  >
                    {deletingId === detail.prestart.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                    Delete
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(null);
                    setDetail(null);
                  }}
                  className="rounded-xl border border-slate-200 p-2 text-slate-600"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {detailLoading || !detail ? (
                <div className="flex min-h-80 items-center justify-center">
                  <Loader2 size={28} className="animate-spin text-slate-400" />
                </div>
              ) : (
                <DetailView detail={detail} />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function DetailView({ detail }: { detail: DetailPayload }) {
  const { prestart, revisions, attendees } = detail;

  const currentRevision = revisions.find(
    (revision) =>
      Number(revision.revision_no) === Number(prestart.current_revision),
  );

  const currentAttendees = attendees.filter(
    (attendee) =>
      Number(attendee.discussion_revision_no) ===
      Number(prestart.current_revision),
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        <Info label="Project" value={projectLabel(prestart)} />
        <Info label="Date" value={formatDate(prestart.prestart_date)} />
        <Info label="Location" value={prestart.location} />
        <Info label="Conducted By" value={prestart.conducted_by_name} />
        <Info label="Current Revision" value={`R${prestart.current_revision}`} />
        <Info
          label="Completed"
          value={prestart.completed_at ? formatDateTime(prestart.completed_at) : "Draft"}
        />
      </div>

      <section className="rounded-2xl border border-slate-200 p-5">
        <h3 className="font-black text-slate-950">
          Discussion Points — Revision {prestart.current_revision}
        </h3>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
          {currentRevision?.discussion_points || "No discussion points found."}
        </p>
      </section>

      {prestart.admin_notes ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h3 className="font-black text-amber-950">Site / Admin Notes</h3>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-amber-900">
            {prestart.admin_notes}
          </p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 p-5">
        <h3 className="font-black text-slate-950">
          Signed Employees ({currentAttendees.length})
        </h3>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Breatho</th>
                <th className="px-3 py-2">Signed</th>
                <th className="px-3 py-2">Signature</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentAttendees.map((attendee) => (
                <tr key={attendee.id}>
                  <td className="px-3 py-3">
                    <div className="font-black text-slate-900">
                      {attendee.employee_name}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {attendee.payroll_id || "No payroll ID"} · R
                      {attendee.discussion_revision_no}
                    </div>
                  </td>
                  <td className="px-3 py-3 font-mono text-slate-700">
                    {breathalyser(attendee.breathalyser_reading)}
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {formatDateTime(attendee.signed_at)}
                  </td>
                  <td className="px-3 py-3">
                    <Signature strokes={attendee.signature_strokes} />
                  </td>
                </tr>
              ))}

              {currentAttendees.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-8 text-center text-slate-400"
                  >
                    No signatures on the current revision.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 p-5">
        <h3 className="font-black text-slate-950">Revision History</h3>

        <div className="mt-4 space-y-3">
          {[...revisions]
            .sort((a, b) => b.revision_no - a.revision_no)
            .map((revision) => (
              <div
                key={revision.id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-black text-slate-900">
                    Revision {revision.revision_no}
                  </div>
                  <div className="text-xs font-semibold text-slate-500">
                    {formatDateTime(revision.created_at)} ·{" "}
                    {revision.created_by_name}
                  </div>
                </div>

                {revision.revision_note ? (
                  <div className="mt-2 text-xs font-bold text-blue-700">
                    {revision.revision_note}
                  </div>
                ) : null}

                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {revision.discussion_points}
                </p>
              </div>
            ))}
        </div>
      </section>

      {prestart.sharepoint_web_url ? (
        <a
          href={prestart.sharepoint_web_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white"
        >
          <ExternalLink size={16} />
          Open Final PDF in SharePoint
        </a>
      ) : null}
    </div>
  );
}

function Signature({ strokes }: { strokes: SignatureStroke[] }) {
  return (
    <svg
      viewBox="0 0 320 140"
      className="h-16 w-44 rounded-lg border border-slate-200 bg-white"
      aria-label="Employee signature"
    >
      {(Array.isArray(strokes) ? strokes : []).map((stroke, index) => (
        <polyline
          key={index}
          points={(Array.isArray(stroke) ? stroke : [])
            .map((point) => `${point.x},${point.y}`)
            .join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-slate-900"
        />
      ))}
    </svg>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-xs font-black uppercase tracking-wide text-slate-400">
          {label}
        </div>
        <div className="text-slate-400">{icon}</div>
      </div>
      <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-sm font-bold text-slate-800">{value || "—"}</div>
    </div>
  );
}

function Status({ status }: { status: RegisterRow["status"] }) {
  const classes =
    status === "completed"
      ? "bg-emerald-50 text-emerald-700"
      : status === "void"
        ? "bg-rose-50 text-rose-700"
        : "bg-amber-50 text-amber-700";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black capitalize ${classes}`}
    >
      {status}
    </span>
  );
}
