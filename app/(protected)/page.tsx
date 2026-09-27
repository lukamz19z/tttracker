"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  FolderKanban,
  HardHat,
  LayoutDashboard,
  Plus,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Truck,
  UserCog,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type Project = {
  id: string;
  name: string;
  status: string | null;
  location?: string | null;
  project_number?: string | null;
};

type AccessRole = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  grants_all?: boolean;
  is_system?: boolean;
};

type AccessMePayload = {
  error?: string;
  roles?: AccessRole[];
  projects?: Array<{ project_id?: string; id?: string }>;
  project_ids?: string[];
  permissions?: {
    all?: string[];
    web?: string[];
    mobile?: string[];
    sharepoint?: string[];
  };
};

type ModuleCard = {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  accent: "blue" | "emerald" | "amber" | "violet" | "rose" | "slate";
  badge?: string;
  permissionPrefixes: string[];
  showWithProjectAccess?: boolean;
};

const MODULES: ModuleCard[] = [
  {
    title: "Projects",
    description:
      "Open project dashboards, towers, progress, dockets and delivery tracking.",
    href: "/",
    icon: <FolderKanban size={21} />,
    accent: "blue",
    permissionPrefixes: ["tt.project", "tt.projects"],
    showWithProjectAccess: true,
  },
  {
    title: "People",
    description:
      "Manage operational employee profiles, crews, PPE sizing and workforce records.",
    href: "/people",
    icon: <Users size={21} />,
    accent: "violet",
    permissionPrefixes: ["tt.people"],
  },
  {
    title: "Admin",
    description:
      "Create login accounts, manage roles, permissions, project access and passwords.",
    href: "/admin",
    icon: <UserCog size={21} />,
    accent: "slate",
    badge: "Admin",
    permissionPrefixes: ["tt.admin"],
  },
  {
    title: "Assets",
    description:
      "Review plant, vehicles, equipment, prestarts, fleet jobs and compliance.",
    href: "/assets",
    icon: <Truck size={21} />,
    accent: "emerald",
    permissionPrefixes: ["tt.assets", "tt.asset"],
  },
  {
    title: "Commercial",
    description:
      "Open commercial reporting, delivery performance and project summaries.",
    href: "/commercial",
    icon: <BriefcaseBusiness size={21} />,
    accent: "amber",
    permissionPrefixes: ["tt.commercial"],
  },
  {
    title: "Expenses & Invoices",
    description:
      "Submit, review and manage company expense claims, invoices and approvals.",
    href: "/expenses",
    icon: <ReceiptText size={21} />,
    accent: "violet",
    permissionPrefixes: ["tt.expense", "tt.expenses", "tt.invoice", "tt.invoices", "tt.finance"],
  },
  {
    title: "Safety",
    description:
      "Access safety systems, workpacks, compliance documents and field controls.",
    href: "/safety",
    icon: <ShieldCheck size={21} />,
    accent: "rose",
    permissionPrefixes: ["tt.hseq", "tt.safety"],
  },
  {
    title: "Create Project",
    description:
      "Set up a new project and prepare its dashboard, towers and permissions.",
    href: "/projects/create",
    icon: <Plus size={21} />,
    accent: "slate",
    permissionPrefixes: [
      "tt.projects.create",
      "tt.project.create",
      "tt.projects.manage",
      "tt.project.manage",
    ],
  },
];

function getStatusClasses(status: string | null) {
  const value = String(status ?? "").trim().toLowerCase();

  if (["ongoing", "active", "in progress"].includes(value)) {
    return "bg-emerald-100 text-emerald-700";
  }

  if (["tendering", "planning"].includes(value)) {
    return "bg-amber-100 text-amber-700";
  }

  if (["complete", "completed"].includes(value)) {
    return "bg-blue-100 text-blue-700";
  }

  if (["on hold", "paused"].includes(value)) {
    return "bg-rose-100 text-rose-700";
  }

  return "bg-slate-100 text-slate-600";
}

function getAccentClasses(accent: ModuleCard["accent"]) {
  switch (accent) {
    case "blue":
      return {
        border: "border-blue-100",
        background: "bg-blue-50",
        icon: "bg-blue-100 text-blue-700",
        text: "text-blue-700",
      };
    case "emerald":
      return {
        border: "border-emerald-100",
        background: "bg-emerald-50",
        icon: "bg-emerald-100 text-emerald-700",
        text: "text-emerald-700",
      };
    case "amber":
      return {
        border: "border-amber-100",
        background: "bg-amber-50",
        icon: "bg-amber-100 text-amber-700",
        text: "text-amber-700",
      };
    case "violet":
      return {
        border: "border-violet-100",
        background: "bg-violet-50",
        icon: "bg-violet-100 text-violet-700",
        text: "text-violet-700",
      };
    case "rose":
      return {
        border: "border-rose-100",
        background: "bg-rose-50",
        icon: "bg-rose-100 text-rose-700",
        text: "text-rose-700",
      };
    default:
      return {
        border: "border-slate-200",
        background: "bg-slate-50",
        icon: "bg-slate-100 text-slate-700",
        text: "text-slate-700",
      };
  }
}

function permissionMatchesPrefix(permission: string, prefix: string): boolean {
  const code = permission.trim().toLowerCase();
  const wanted = prefix.trim().toLowerCase();

  return (
    code === wanted ||
    code.startsWith(`${wanted}.`) ||
    code.startsWith(`${wanted}:`)
  );
}

function moduleIsAllowed({
  module,
  permissions,
  grantsAll,
  hasProjectAccess,
}: {
  module: ModuleCard;
  permissions: Set<string>;
  grantsAll: boolean;
  hasProjectAccess: boolean;
}): boolean {
  if (grantsAll) return true;
  if (module.showWithProjectAccess && hasProjectAccess) return true;

  for (const permission of permissions) {
    if (
      module.permissionPrefixes.some((prefix) =>
        permissionMatchesPrefix(permission, prefix),
      )
    ) {
      return true;
    }
  }

  return false;
}

function accessRoleLabel(roles: AccessRole[]): string {
  if (!roles.length) return "No role assigned";

  const names = Array.from(
    new Set(
      roles
        .map((role) => role.name?.trim() || role.code?.trim())
        .filter(Boolean),
    ),
  );

  return names.join(" + ");
}

export default function ProjectsPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setAccessError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.push("/login");
        return;
      }

      const response = await fetch("/api/access/me", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const payload = (await response.json()) as AccessMePayload;

      if (!response.ok) {
        throw new Error(payload.error || "Could not load your TTTracker access.");
      }

      const nextRoles = Array.isArray(payload.roles) ? payload.roles : [];
      const allPermissions = Array.isArray(payload.permissions?.all)
        ? payload.permissions?.all ?? []
        : [];
      const webPermissions = Array.isArray(payload.permissions?.web)
        ? payload.permissions?.web ?? []
        : allPermissions.filter(
            (code) =>
              !String(code).startsWith("mobile.") &&
              !String(code).startsWith("sharepoint."),
          );

      const nextProjectIds = Array.from(
        new Set(
          (
            payload.project_ids ??
            payload.projects?.map(
              (project) => project.project_id ?? project.id ?? "",
            ) ??
            []
          )
            .map(String)
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      );

      setRoles(nextRoles);
      setPermissions(new Set(webPermissions.map(String)));
      setProjectIds(nextProjectIds);

      if (nextProjectIds.length === 0) {
        setProjects([]);
        return;
      }

      const { data: projectData, error: projectError } = await supabase
        .from("projects")
        .select("id, name, project_number, status, location")
        .in("id", nextProjectIds)
        .order("name");

      if (projectError) {
        throw new Error(projectError.message);
      }

      setProjects((projectData as Project[] | null) ?? []);
    } catch (error) {
      console.error("landing access load error", error);
      setProjects([]);
      setRoles([]);
      setPermissions(new Set());
      setProjectIds([]);
      setAccessError(
        error instanceof Error
          ? error.message
          : "Could not load your TTTracker access.",
      );
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  async function refreshPage() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  const grantsAll = useMemo(
    () => roles.some((role) => role.grants_all === true),
    [roles],
  );

  const modules = useMemo(
    () =>
      MODULES.filter((module) =>
        moduleIsAllowed({
          module,
          permissions,
          grantsAll,
          hasProjectAccess: projectIds.length > 0,
        }),
      ),
    [grantsAll, permissions, projectIds.length],
  );

  const activeProjects = projects.filter((project) =>
    ["ongoing", "active", "in progress"].includes(
      String(project.status ?? "").trim().toLowerCase(),
    ),
  ).length;

  const roleDisplay = accessRoleLabel(roles);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 text-white shadow-sm">
          <div className="grid gap-8 p-7 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300">
                <HardHat size={14} />
                TTTracker Operations
              </div>

              <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
                Welcome back
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Open your projects and the TTTracker modules granted to your
                account through Roles &amp; Permissions.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                {projects[0] ? (
                  <Link
                    href={`/project/${projects[0].id}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-slate-100"
                  >
                    Open first project
                    <ArrowRight size={16} />
                  </Link>
                ) : null}

                <button
                  type="button"
                  onClick={() => void refreshPage()}
                  disabled={refreshing}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                >
                  <RefreshCw
                    size={16}
                    className={refreshing ? "animate-spin" : ""}
                  />
                  Refresh
                </button>
              </div>
            </div>

            <div className="grid min-w-[260px] grid-cols-2 gap-3">
              <HeroMetric label="Access level" value={loading ? "Loading" : roleDisplay} />
              <HeroMetric label="Projects" value={String(projects.length)} />
              <HeroMetric label="Active" value={String(activeProjects)} />
              <HeroMetric label="Modules" value={String(modules.length)} />
            </div>
          </div>
        </section>

        {accessError ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {accessError}
          </section>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-slate-500">
                <LayoutDashboard size={18} />
                <span className="text-sm font-semibold">Workspace</span>
              </div>

              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                Quick Access
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Shortcuts are driven by your effective TTTracker permissions,
                not a hard-coded website role.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((item) => (
                <div
                  key={item}
                  className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-slate-100"
                />
              ))}
            </div>
          ) : modules.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <ShieldCheck size={28} className="mx-auto text-slate-400" />
              <h3 className="mt-4 text-lg font-bold text-slate-900">
                No website modules assigned
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                An administrator needs to grant this account website permissions
                in Admin → Roles &amp; Permissions.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {modules.map((module) => (
                <ModuleCardItem
                  key={`${module.title}-${module.href}`}
                  module={module}
                />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-slate-500">
                <Building2 size={18} />
                <span className="text-sm font-semibold">Assigned Projects</span>
              </div>

              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                My Projects
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Project membership is kept separate from system roles and module
                permissions.
              </p>
            </div>

            <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600">
              {projects.length} assigned
            </div>
          </div>

          <div className="mt-6">
            {loading ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-slate-100"
                  />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <FolderKanban size={28} className="mx-auto text-slate-400" />
                <h3 className="mt-4 text-lg font-bold text-slate-900">
                  No projects assigned
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Project access is assigned separately from Administrator or
                  other system roles.
                </p>

                {permissions.has("tt.admin.access") || grantsAll ? (
                  <Link
                    href="/admin"
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    Manage User Access
                    <ArrowRight size={16} />
                  </Link>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {projects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function ModuleCardItem({ module }: { module: ModuleCard }) {
  const styles = getAccentClasses(module.accent);

  return (
    <Link
      href={module.href}
      className={`group rounded-2xl border p-5 transition hover:-translate-y-0.5 hover:shadow-md ${styles.border} ${styles.background}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className={`rounded-xl p-2.5 ${styles.icon}`}>{module.icon}</div>

        {module.badge ? (
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm">
            {module.badge}
          </span>
        ) : null}
      </div>

      <h3 className="mt-5 text-lg font-bold text-slate-900">{module.title}</h3>

      <p className="mt-2 text-sm leading-6 text-slate-600">
        {module.description}
      </p>

      <div className={`mt-5 inline-flex items-center gap-2 text-sm font-semibold ${styles.text}`}>
        Open
        <ArrowRight
          size={15}
          className="transition-transform group-hover:translate-x-1"
        />
      </div>
    </Link>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/project/${project.id}`}
      className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
          <Building2 size={20} />
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
            project.status,
          )}`}
        >
          {project.status || "Unknown"}
        </span>
      </div>

      <div className="mt-5">
        {project.project_number ? (
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {project.project_number}
          </div>
        ) : null}

        <h3 className="mt-1 text-xl font-bold text-slate-900">{project.name}</h3>

        <p className="mt-2 text-sm text-slate-500">
          {project.location || "Location not set"}
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
        <span className="text-sm font-semibold text-slate-700">Open dashboard</span>
        <ArrowRight
          size={16}
          className="text-slate-400 transition-transform group-hover:translate-x-1"
        />
      </div>
    </Link>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-2 break-words text-xl font-bold text-white">{value}</div>
    </div>
  );
}
