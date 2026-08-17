"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  FolderKanban,
  Hash,
  MapPin,
  Plus,
  RadioTower,
  ShieldCheck,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type CreateProjectResponse = {
  success?: boolean;
  projectId?: string;
  projectNumber?: string;
  error?: string;
  sharePoint?: {
    siteId?: string;
    driveId?: string;
    folderId?: string;
    url?: string | null;
  };
};

function buildProjectNumber(
  clientCode: string,
  year: string,
  sequence: string,
) {
  const cleanClient = clientCode.trim().toUpperCase();
  const cleanYear = year.trim().slice(-2);
  const sequenceNumber = Number(sequence || 1);

  if (
    !cleanClient ||
    !cleanYear ||
    !Number.isFinite(sequenceNumber) ||
    sequenceNumber < 1
  ) {
    return "";
  }

  const cleanSequence = String(sequenceNumber).padStart(3, "0");

  return `P-${cleanClient}-${cleanYear}-${cleanSequence}`;
}

function statusLabel(value: string) {
  switch (value) {
    case "tendering":
      return "Tendering";
    case "mobilising":
      return "Mobilising";
    case "ongoing":
      return "Ongoing";
    case "demobilising":
      return "Demobilising";
    case "completed":
      return "Completed";
    default:
      return value;
  }
}

export default function CreateProjectPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);

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
    return buildProjectNumber(
      clientCode,
      projectYear,
      projectSequence,
    );
  }, [clientCode, projectYear, projectSequence]);

  const sharePointFolderName = useMemo(() => {
    if (!projectNumber) return "";

    if (!name.trim()) {
      return projectNumber;
    }

    return `${projectNumber} ${name.trim()}`;
  }, [projectNumber, name]);

  async function createProject(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setLoading(true);
    setMsg("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setMsg("You must be logged in to create a project.");
        return;
      }

      const cleanName = name.trim();
      const cleanClient = client.trim();
      const cleanClientCode = clientCode.trim().toUpperCase();
      const cleanLocation = location.trim();

      const numericYear = Number(projectYear);
      const numericSequence = Number(projectSequence);

      const numericTotalTowers =
        totalTowers.trim() === ""
          ? null
          : Number(totalTowers);

      if (!cleanName) {
        setMsg("Project name is required.");
        return;
      }

      if (!cleanClientCode) {
        setMsg("Client code is required.");
        return;
      }

      if (
        !Number.isInteger(numericYear) ||
        numericYear < 2000 ||
        numericYear > 2100
      ) {
        setMsg("Enter a valid project year.");
        return;
      }

      if (
        !Number.isInteger(numericSequence) ||
        numericSequence < 1
      ) {
        setMsg("Enter a valid project sequence.");
        return;
      }

      if (
        numericTotalTowers !== null &&
        (!Number.isFinite(numericTotalTowers) ||
          numericTotalTowers < 0)
      ) {
        setMsg("Total towers must be a valid number.");
        return;
      }

      const response = await fetch("/api/projects/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: cleanName,
          client: cleanClient,
          clientCode: cleanClientCode,
          projectYear: numericYear,
          projectSequence: numericSequence,
          location: cleanLocation,
          status,
          totalTowers: numericTotalTowers,
        }),
      });

      let result: CreateProjectResponse;

      try {
        result =
          (await response.json()) as CreateProjectResponse;
      } catch {
        setMsg(
          "The project creation service returned an invalid response.",
        );
        return;
      }

      if (!response.ok) {
        setMsg(
          result.error ||
            "The project could not be created.",
        );
        return;
      }

      if (!result.projectId) {
        setMsg(
          "The project was created but no project ID was returned.",
        );
        return;
      }

      router.push(`/project/${result.projectId}`);
      router.refresh();
    } catch (error) {
      console.error("CREATE PROJECT CLIENT ERROR:", error);

      setMsg(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while creating the project.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 text-white shadow-sm">
          <div className="grid gap-8 p-7 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 transition hover:text-white"
              >
                <ArrowLeft size={16} />
                Back to Projects
              </Link>

              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300">
                <FolderKanban size={14} />
                Project Setup
              </div>

              <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Create New Project
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Set up a new TTTracker project and automatically
                provision its Project Delivery structure in
                SharePoint.
              </p>
            </div>

            <div className="hidden rounded-2xl border border-white/10 bg-white/5 p-5 lg:block">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-white/10 p-3">
                  <ShieldCheck size={24} />
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    SharePoint Integration
                  </p>
                  <p className="mt-1 font-semibold text-white">
                    Project Delivery
                  </p>
                </div>
              </div>

              <p className="mt-4 max-w-[250px] text-xs leading-5 text-slate-400">
                The standard BC Contracting folder structure will
                be created automatically after submission.
              </p>
            </div>
          </div>
        </section>

        <form
          onSubmit={createProject}
          className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"
        >
          {/* Main form */}
          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
                  <Building2 size={21} />
                </div>

                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    Project Details
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Enter the primary details used across
                    TTTracker and SharePoint.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <Field
                  label="Project Name"
                  required
                  className="md:col-span-2"
                >
                  <input
                    type="text"
                    value={name}
                    onChange={(event) =>
                      setName(event.target.value)
                    }
                    placeholder="e.g. Maragle Transmission Line"
                    disabled={loading}
                    required
                    className={inputClasses}
                  />
                </Field>

                <Field label="Client">
                  <input
                    type="text"
                    value={client}
                    onChange={(event) =>
                      setClient(event.target.value)
                    }
                    placeholder="e.g. UGL"
                    disabled={loading}
                    className={inputClasses}
                  />
                </Field>

                <Field label="Location">
                  <div className="relative">
                    <MapPin
                      size={17}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />

                    <input
                      type="text"
                      value={location}
                      onChange={(event) =>
                        setLocation(event.target.value)
                      }
                      placeholder="e.g. Tumbarumba, NSW"
                      disabled={loading}
                      className={`${inputClasses} pl-10`}
                    />
                  </div>
                </Field>
              </div>
            </section>

            {/* Numbering */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-violet-50 p-3 text-violet-700">
                  <Hash size={21} />
                </div>

                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    Project Number
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    TTTracker will generate the project number from
                    the client, year and sequence.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-5 md:grid-cols-3">
                <Field label="Client Code" required>
                  <input
                    type="text"
                    value={clientCode}
                    onChange={(event) =>
                      setClientCode(
                        event.target.value.toUpperCase(),
                      )
                    }
                    placeholder="UGL"
                    disabled={loading}
                    required
                    className={`${inputClasses} uppercase`}
                  />
                </Field>

                <Field label="Project Year" required>
                  <div className="relative">
                    <CalendarDays
                      size={17}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />

                    <input
                      type="number"
                      min="2000"
                      max="2100"
                      value={projectYear}
                      onChange={(event) =>
                        setProjectYear(event.target.value)
                      }
                      disabled={loading}
                      required
                      className={`${inputClasses} pl-10`}
                    />
                  </div>
                </Field>

                <Field label="Sequence" required>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={projectSequence}
                    onChange={(event) =>
                      setProjectSequence(event.target.value)
                    }
                    placeholder="1"
                    disabled={loading}
                    required
                    className={inputClasses}
                  />
                </Field>
              </div>

              <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                      Generated Project Number
                    </p>

                    <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
                      {projectNumber || "P-CLIENT-YY-001"}
                    </p>
                  </div>

                  {projectNumber ? (
                    <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm">
                      <CheckCircle2 size={14} />
                      Ready
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            {/* Delivery setup */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
                  <RadioTower size={21} />
                </div>

                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    Delivery Setup
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Set the initial project status and tower count.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <Field label="Total Towers">
                  <div className="relative">
                    <RadioTower
                      size={17}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />

                    <input
                      type="number"
                      min="0"
                      value={totalTowers}
                      onChange={(event) =>
                        setTotalTowers(event.target.value)
                      }
                      placeholder="e.g. 75"
                      disabled={loading}
                      className={`${inputClasses} pl-10`}
                    />
                  </div>
                </Field>

                <Field label="Project Status" required>
                  <select
                    value={status}
                    onChange={(event) =>
                      setStatus(event.target.value)
                    }
                    disabled={loading}
                    className={inputClasses}
                  >
                    <option value="tendering">
                      Tendering
                    </option>
                    <option value="mobilising">
                      Mobilising
                    </option>
                    <option value="ongoing">
                      Ongoing
                    </option>
                    <option value="demobilising">
                      Demobilising
                    </option>
                    <option value="completed">
                      Completed
                    </option>
                  </select>
                </Field>
              </div>
            </section>

            {msg ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-medium text-red-700">
                  {msg}
                </p>
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </Link>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus size={17} />

                {loading
                  ? "Creating Project & SharePoint..."
                  : "Create Project"}
              </button>
            </div>
          </div>

          {/* Summary */}
          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                Project Preview
              </p>

              <h2 className="mt-3 text-xl font-bold text-slate-900">
                {name.trim() || "New Project"}
              </h2>

              <p className="mt-1 text-sm font-semibold text-blue-700">
                {projectNumber || "Project number pending"}
              </p>

              <div className="mt-6 space-y-4">
                <SummaryRow
                  label="Client"
                  value={client.trim() || "Not set"}
                />

                <SummaryRow
                  label="Location"
                  value={location.trim() || "Not set"}
                />

                <SummaryRow
                  label="Status"
                  value={statusLabel(status)}
                />

                <SummaryRow
                  label="Towers"
                  value={
                    totalTowers.trim()
                      ? totalTowers
                      : "Not set"
                  }
                />
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-white p-2.5 text-slate-700 shadow-sm">
                  <FolderKanban size={19} />
                </div>

                <div>
                  <p className="text-sm font-bold text-slate-900">
                    SharePoint Folder
                  </p>
                  <p className="text-xs text-slate-500">
                    Project Delivery
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
                <p className="break-words text-sm font-semibold text-slate-800">
                  {sharePointFolderName ||
                    "Project folder name will appear here"}
                </p>
              </div>

              <div className="mt-5 space-y-2.5 text-sm text-slate-600">
                <FolderLine name="01 Programme & Scheduling" />
                <FolderLine name="02 Commercial" />
                <FolderLine name="03 Quality" />
                <FolderLine name="04 HSEQ" />
                <FolderLine name="05 Drawings" />
                <FolderLine name="06 Onboarding" />
                <FolderLine name="100 Incoming" />
                <FolderLine name="200 Outgoing" />
                <FolderLine name="999 Project Completion" />
              </div>
            </section>
          </aside>
        </form>
      </div>
    </AppShell>
  );
}

const inputClasses =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

function Field({
  label,
  required = false,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
        {required ? (
          <span className="ml-1 text-red-500">*</span>
        ) : null}
      </span>

      {children}
    </label>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <span className="text-sm text-slate-500">
        {label}
      </span>

      <span className="max-w-[190px] text-right text-sm font-semibold text-slate-900">
        {value}
      </span>
    </div>
  );
}

function FolderLine({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2">
      <FolderKanban
        size={14}
        className="shrink-0 text-slate-400"
      />
      <span>{name}</span>
    </div>
  );
}