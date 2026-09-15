"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FolderCog,
  GraduationCap,
  Loader2,
  RefreshCw,
  SearchCheck,
  UploadCloud,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type TrainingRecordRow = {
  id: string;
  employee_id: string;
  workflow_status: string | null;
  record_status: string | null;
  expiry_date: string | null;
  does_not_expire: boolean | null;
  current_version: boolean | null;
  superseded_at: string | null;
  revoked_at: string | null;
};

type EmployeeRow = {
  id: string;
  active: boolean | null;
  sharepoint_folder_id: string | null;
};

type UserRoleRow = {
  role: string | null;
};

type DashboardStats = {
  activeEmployees: number;
  currentRecords: number;
  awaitingReview: number;
  expiringSoon: number;
  expired: number;
  sharePointLinked: number;
};

type Message = {
  tone: "error";
  text: string;
};

type ModuleCardProps = {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  badge?: string;
  emphasis?: "blue" | "amber" | "emerald" | "slate";
};

const EMPTY_STATS: DashboardStats = {
  activeEmployees: 0,
  currentRecords: 0,
  awaitingReview: 0,
  expiringSoon: 0,
  expired: 0,
  sharePointLinked: 0,
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normaliseRole(value: unknown) {
  return clean(value).toLowerCase().replace(/\s+/g, "_");
}

function canManageTraining(role: string) {
  return [
    "admin",
    "administrator",
    "site_admin",
    "hseq",
    "safety",
    "safety_officer",
  ].includes(normaliseRole(role));
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function ModuleCard({
  href,
  title,
  description,
  icon,
  badge,
  emphasis = "slate",
}: ModuleCardProps) {
  const classes = {
    blue: {
      icon: "bg-blue-50 text-blue-700 ring-blue-100",
      badge: "bg-blue-50 text-blue-700",
    },
    amber: {
      icon: "bg-amber-50 text-amber-700 ring-amber-100",
      badge: "bg-amber-50 text-amber-700",
    },
    emerald: {
      icon: "bg-emerald-50 text-emerald-700 ring-emerald-100",
      badge: "bg-emerald-50 text-emerald-700",
    },
    slate: {
      icon: "bg-slate-100 text-slate-700 ring-slate-200",
      badge: "bg-slate-100 text-slate-700",
    },
  }[emphasis];

  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div
          className={`flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 ${classes.icon}`}
        >
          {icon}
        </div>

        <div className="flex items-center gap-2">
          {badge ? (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-black ${classes.badge}`}
            >
              {badge}
            </span>
          ) : null}
          <ChevronRight
            size={18}
            className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500"
          />
        </div>
      </div>

      <h3 className="mt-4 text-base font-black text-slate-950">
        {title}
      </h3>
      <p className="mt-1.5 text-sm leading-6 text-slate-600">
        {description}
      </p>
    </Link>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
  href,
}: {
  label: string;
  value: number;
  hint: string;
  icon: ReactNode;
  href?: string;
}) {
  const content = (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">
            {value}
          </p>
        </div>
        <div className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          {icon}
        </div>
      </div>
      <p className="mt-3 text-xs font-semibold text-slate-500">
        {hint}
      </p>
    </div>
  );

  if (!href) return content;

  return (
    <Link
      href={href}
      className="block transition hover:-translate-y-0.5"
    >
      {content}
    </Link>
  );
}

export default function TrainingPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [stats, setStats] =
    useState<DashboardStats>(EMPTY_STATS);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const isTrainingAdmin = canManageTraining(role);

  const loadPage = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setMessage(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw new Error(userError.message);
        }

        if (!user) {
          throw new Error(
            "You must be logged in to view Training.",
          );
        }

        const [
          roleResult,
          employeeResult,
          recordResult,
        ] = await Promise.all([
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .limit(1)
            .maybeSingle(),
          supabase
            .from("employees")
            .select("id,active,sharepoint_folder_id"),
          supabase
            .from("employee_training_records")
            .select(
              "id,employee_id,workflow_status,record_status,expiry_date,does_not_expire,current_version,superseded_at,revoked_at",
            ),
        ]);

        if (roleResult.error) {
          throw new Error(roleResult.error.message);
        }

        if (employeeResult.error) {
          throw new Error(employeeResult.error.message);
        }

        if (recordResult.error) {
          throw new Error(recordResult.error.message);
        }

        const roleRow =
          (roleResult.data ?? null) as UserRoleRow | null;

        const employees =
          (employeeResult.data ?? []) as EmployeeRow[];

        const records =
          (recordResult.data ?? []) as TrainingRecordRow[];

        setRole(normaliseRole(roleRow?.role));

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const inThirtyDays = new Date(today);
        inThirtyDays.setDate(inThirtyDays.getDate() + 30);

        const todayText = dateOnly(today);
        const thirtyDayText = dateOnly(inThirtyDays);

        const currentRecords = records.filter(
          (record) =>
            record.workflow_status === "approved" &&
            record.current_version !== false &&
            !record.superseded_at &&
            !record.revoked_at,
        );

        const awaitingReview = records.filter(
          (record) =>
            record.workflow_status === "pending_review" ||
            record.workflow_status === "changes_required",
        ).length;

        const expiringSoon = currentRecords.filter(
          (record) =>
            !record.does_not_expire &&
            Boolean(record.expiry_date) &&
            clean(record.expiry_date) >= todayText &&
            clean(record.expiry_date) <= thirtyDayText,
        ).length;

        const expired = currentRecords.filter(
          (record) =>
            !record.does_not_expire &&
            Boolean(record.expiry_date) &&
            clean(record.expiry_date) < todayText,
        ).length;

        const activeEmployees = employees.filter(
          (employee) => employee.active !== false,
        );

        setStats({
          activeEmployees: activeEmployees.length,
          currentRecords: currentRecords.length,
          awaitingReview,
          expiringSoon,
          expired,
          sharePointLinked: activeEmployees.filter((employee) =>
            Boolean(clean(employee.sharepoint_folder_id)),
          ).length,
        });
      } catch (error) {
        setMessage({
          tone: "error",
          text:
            error instanceof Error
              ? error.message
              : "Training could not be loaded.",
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [supabase],
  );

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-screen items-center justify-center">
          <div className="flex items-center gap-3 text-sm font-bold text-slate-500">
            <Loader2 size={22} className="animate-spin" />
            Loading Training...
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div>
          <Link
            href="/people"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Back to People
          </Link>
        </div>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="p-6 sm:p-7">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-blue-700">
                  <GraduationCap size={18} />
                  People & Training
                </div>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                  Training
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  Manage employee training evidence, verification,
                  SharePoint publishing and bulk VOC or course uploads.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href="/people/training/new"
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-blue-800"
                >
                  <UploadCloud size={17} />
                  Add Training Record
                </Link>

                {isTrainingAdmin ? (
                  <Link
                    href="/people/training/bulk-upload"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                  >
                    <Users size={17} />
                    Bulk Upload
                  </Link>
                ) : null}

                <button
                  type="button"
                  onClick={() => void loadPage(true)}
                  disabled={refreshing}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw
                    size={17}
                    className={refreshing ? "animate-spin" : ""}
                  />
                  Refresh
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-px border-t border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-4">
            <div className="bg-slate-50 px-5 py-4">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
                <Users size={15} />
                Employees
              </div>
              <div className="mt-1 text-xl font-black text-slate-950">
                {stats.activeEmployees}
              </div>
            </div>

            <div className="bg-slate-50 px-5 py-4">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
                <BadgeCheck size={15} />
                Current Records
              </div>
              <div className="mt-1 text-xl font-black text-slate-950">
                {stats.currentRecords}
              </div>
            </div>

            <div className="bg-slate-50 px-5 py-4">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
                <SearchCheck size={15} />
                Awaiting Review
              </div>
              <div className="mt-1 text-xl font-black text-slate-950">
                {stats.awaitingReview}
              </div>
            </div>

            <div className="bg-slate-50 px-5 py-4">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
                <FolderCog size={15} />
                SharePoint Linked
              </div>
              <div className="mt-1 text-xl font-black text-slate-950">
                {stats.sharePointLinked}
                <span className="ml-1 text-sm font-bold text-slate-400">
                  / {stats.activeEmployees}
                </span>
              </div>
            </div>
          </div>
        </section>

        {message ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            <div className="flex items-start gap-2">
              <AlertTriangle
                size={18}
                className="mt-0.5 shrink-0"
              />
              {message.text}
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Current"
            value={stats.currentRecords}
            hint="Approved current employee records"
            icon={<CheckCircle2 size={19} />}
          />
          <StatCard
            label="Verification"
            value={stats.awaitingReview}
            hint="Pending review or changes required"
            icon={<ClipboardCheck size={19} />}
            href="/people/training/verification"
          />
          <StatCard
            label="Expiring in 30 days"
            value={stats.expiringSoon}
            hint="Records requiring renewal soon"
            icon={<Clock3 size={19} />}
          />
          <StatCard
            label="Expired"
            value={stats.expired}
            hint="Current records past expiry"
            icon={<AlertTriangle size={19} />}
          />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">
              Training actions
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Only modules that currently exist in TTTracker are shown here.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ModuleCard
              href="/people/training/new"
              title="Add Training Record"
              description="Upload a licence, VOC, ticket, induction or another configured training record."
              icon={<UploadCloud size={20} />}
              badge="Upload"
              emphasis="blue"
            />

            <ModuleCard
              href="/people/training/verification"
              title="Verification Queue"
              description="Review submitted evidence, request changes, reject it or approve it for SharePoint."
              icon={<SearchCheck size={20} />}
              badge={
                stats.awaitingReview > 0
                  ? String(stats.awaitingReview)
                  : undefined
              }
              emphasis={
                stats.awaitingReview > 0 ? "amber" : "slate"
              }
            />

            {isTrainingAdmin ? (
              <ModuleCard
                href="/people/training/bulk-upload"
                title="Bulk Training / VOC Upload"
                description="Submit the same course or VOC for multiple employees while keeping certificate evidence employee-specific."
                icon={<Users size={20} />}
                badge="Admin"
                emphasis="blue"
              />
            ) : null}

            {isTrainingAdmin ? (
              <ModuleCard
                href="/people/training/configuration/workflow"
                title="Workflow & SharePoint"
                description="Configure SharePoint storage, reviewer rules, metadata, expiry warnings and employee folder provisioning."
                icon={<FolderCog size={20} />}
                badge="Admin"
                emphasis="emerald"
              />
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm leading-6 text-slate-600">
            Role requirements, project requirements, renewals,
            history, courses, calendar and other unfinished modules
            are intentionally hidden from this landing page until
            those pages are actually built.
          </p>
        </section>
      </main>
    </AppShell>
  );
}
