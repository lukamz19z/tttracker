"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  ClipboardCheck,
  FolderKanban,
  Gauge,
  HardHat,
  LayoutDashboard,
  PackageSearch,
  Plus,
  RefreshCw,
  ShieldCheck,
  Truck,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";
import { getUserRole } from "@/lib/roles";

type Project = {
  id: string;
  name: string;
  status: string | null;
  location?: string | null;
  project_number?: string | null;
};

type ProjectAccessRow = {
  project_id: string;
};

type ModuleCard = {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  accent: "blue" | "emerald" | "amber" | "violet" | "rose" | "slate";
  badge?: string;
};

function normaliseRole(role: string | null): string {
  if (!role) return "viewer";

  const value = role.trim().toLowerCase();

  if (["admin", "administrator"].includes(value)) return "admin";

  if (
    ["site_admin", "site admin", "site-administrator"].includes(
      value,
    )
  ) {
    return "site_admin";
  }

  if (
    ["safety_manager", "safety manager", "safety"].includes(
      value,
    )
  ) {
    return "safety_manager";
  }

  if (
    ["asset_manager", "asset manager", "assets"].includes(
      value,
    )
  ) {
    return "asset_manager";
  }

  if (
    [
      "commercial",
      "commercial_manager",
      "commercial manager",
    ].includes(value)
  ) {
    return "commercial";
  }

  if (
    [
      "crew",
      "leading_hand",
      "leading hand",
      "field",
      "editor",
    ].includes(value)
  ) {
    return "crew";
  }

  if (
    [
      "viewer",
      "client",
      "read_only",
      "read only",
    ].includes(value)
  ) {
    return "viewer";
  }

  return value;
}

function roleLabel(role: string): string {
  return role
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function getStatusClasses(status: string | null) {
  const value = String(status ?? "")
    .trim()
    .toLowerCase();

  if (
    ["ongoing", "active", "in progress"].includes(value)
  ) {
    return "bg-emerald-100 text-emerald-700";
  }

  if (
    ["tendering", "planning"].includes(value)
  ) {
    return "bg-amber-100 text-amber-700";
  }

  if (
    ["complete", "completed"].includes(value)
  ) {
    return "bg-blue-100 text-blue-700";
  }

  if (
    ["on hold", "paused"].includes(value)
  ) {
    return "bg-rose-100 text-rose-700";
  }

  return "bg-slate-100 text-slate-600";
}

function getAccentClasses(
  accent: ModuleCard["accent"],
) {
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

function getModulesForRole(
  role: string,
): ModuleCard[] {
  switch (role) {
    case "admin":
      return [
        {
          title: "Projects",
          description:
            "Open project dashboards, towers, progress, dockets and delivery tracking.",
          href: "/",
          icon: <FolderKanban size={21} />,
          accent: "blue",
        },
        {
          title: "People",
          description:
            "Manage operational employee profiles, crews, PPE sizing and workforce records.",
          href: "/people",
          icon: <Users size={21} />,
          accent: "violet",
        },
        {
          title: "Admin",
          description:
            "Create login accounts, manage website and mobile roles, permissions and passwords.",
          href: "/admin",
          icon: <UserCog size={21} />,
          accent: "slate",
          badge: "Admin",
        },
        {
          title: "Assets",
          description:
            "Review plant, vehicles, equipment, prestarts, fleet jobs and compliance.",
          href: "/assets",
          icon: <Truck size={21} />,
          accent: "emerald",
        },
        {
          title: "Commercial",
          description:
            "Open commercial reporting, delivery performance and project summaries.",
          href: "/commercial",
          icon: <BriefcaseBusiness size={21} />,
          accent: "amber",
        },
        {
          title: "Safety",
          description:
            "Access safety systems, workpacks, compliance documents and field controls.",
          href: "/safety",
          icon: <ShieldCheck size={21} />,
          accent: "rose",
        },
        {
          title: "Create Project",
          description:
            "Set up a new project and prepare its dashboard, towers and permissions.",
          href: "/projects/create",
          icon: <Plus size={21} />,
          accent: "slate",
        },
      ];

    case "site_admin":
      return [
        {
          title: "People",
          description:
            "Manage employee profiles, crew allocation, PPE sizing and operational workforce records.",
          href: "/people",
          icon: <Users size={21} />,
          accent: "violet",
        },
        {
          title: "Crews",
          description:
            "Create crews and allocate active workers to operational crew structures.",
          href: "/people/crews",
          icon: <Users size={21} />,
          accent: "blue",
        },
        {
          title: "My Projects",
          description:
            "Open assigned projects, towers, daily dockets and delivery information.",
          href: "/",
          icon: <FolderKanban size={21} />,
          accent: "emerald",
        },
        {
          title: "Safety",
          description:
            "Open safety systems, training compliance and site controls.",
          href: "/safety",
          icon: <ShieldCheck size={21} />,
          accent: "amber",
        },
      ];

    case "safety_manager":
      return [
        {
          title: "Safety Dashboard",
          description:
            "Open safety management, workpacks, permits and compliance controls.",
          href: "/safety",
          icon: <ShieldCheck size={21} />,
          accent: "emerald",
        },
        {
          title: "Workpacks",
          description:
            "Review workpack documents, ITCs, lift studies and site records.",
          href: "/safety/workpacks",
          icon: <ClipboardCheck size={21} />,
          accent: "blue",
        },
        {
          title: "Lessons Learnt",
          description:
            "Review field feedback and lessons recorded across active projects.",
          href: "/lessons-learnt",
          icon: <Gauge size={21} />,
          accent: "amber",
        },
        {
          title: "People",
          description:
            "Review operational personnel, crews, PPE and training records.",
          href: "/people",
          icon: <Users size={21} />,
          accent: "violet",
        },
        {
          title: "My Projects",
          description:
            "Open your assigned projects and review project safety information.",
          href: "/",
          icon: <FolderKanban size={21} />,
          accent: "slate",
        },
      ];

    case "asset_manager":
      return [
        {
          title: "Assets Dashboard",
          description:
            "Review fleet status, maintenance, prestarts, documents and compliance.",
          href: "/assets",
          icon: <Truck size={21} />,
          accent: "blue",
        },
        {
          title: "Vehicles",
          description:
            "Manage vehicles, registration, insurance, service history and inspections.",
          href: "/assets/vehicles",
          icon: <Truck size={21} />,
          accent: "emerald",
        },
        {
          title: "Fleet Jobs",
          description:
            "Review open defects, maintenance work and completed fleet jobs.",
          href: "/assets/fleet-jobs",
          icon: <Wrench size={21} />,
          accent: "amber",
        },
        {
          title: "My Projects",
          description:
            "Open assigned projects where fleet and plant support is required.",
          href: "/",
          icon: <FolderKanban size={21} />,
          accent: "slate",
        },
      ];

    case "commercial":
      return [
        {
          title: "Commercial Dashboard",
          description:
            "Open commercial summaries, project delivery and performance reporting.",
          href: "/commercial",
          icon: <BriefcaseBusiness size={21} />,
          accent: "amber",
        },
        {
          title: "Project Reporting",
          description:
            "Review project-level summaries, production trends and forecasting.",
          href: "/commercial/reports",
          icon: <Gauge size={21} />,
          accent: "blue",
        },
        {
          title: "Variations & Claims",
          description:
            "Track variation and claim workflows across live projects.",
          href: "/commercial/claims",
          icon: <ClipboardCheck size={21} />,
          accent: "rose",
        },
        {
          title: "My Projects",
          description:
            "Open assigned projects and detailed operational dashboards.",
          href: "/",
          icon: <FolderKanban size={21} />,
          accent: "slate",
        },
      ];

    case "crew":
      return [
        {
          title: "My Projects",
          description:
            "Open assigned projects and tower dashboards for current field work.",
          href: "/",
          icon: <FolderKanban size={21} />,
          accent: "blue",
        },
        {
          title: "Daily Dockets",
          description:
            "Open daily reporting, labour hours and progress capture.",
          href: "/crew/dockets",
          icon: <ClipboardCheck size={21} />,
          accent: "emerald",
        },
        {
          title: "Deliveries",
          description:
            "Review truck deliveries, bundles and outstanding delivery items.",
          href: "/crew/deliveries",
          icon: <Truck size={21} />,
          accent: "amber",
        },
        {
          title: "Materials",
          description:
            "Search bundles, drawing marks and material availability.",
          href: "/crew/materials",
          icon: <PackageSearch size={21} />,
          accent: "violet",
        },
      ];

    default:
      return [
        {
          title: "My Projects",
          description:
            "Browse projects you have permission to view and open their dashboards.",
          href: "/",
          icon: <FolderKanban size={21} />,
          accent: "blue",
        },
      ];
  }
}

export default function ProjectsPage() {
  const supabase = useMemo(
    () => createSupabaseBrowser(),
    [],
  );

  const router = useRouter();

  const [projects, setProjects] =
    useState<Project[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [role, setRole] =
    useState<string | null>(null);

  const [refreshing, setRefreshing] =
    useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const [
      loadedRole,
      accessResult,
    ] = await Promise.all([
      getUserRole(),

      supabase
        .from("project_access")
        .select("project_id")
        .eq("user_id", user.id),
    ]);

    setRole(loadedRole);

    if (accessResult.error) {
      console.error(
        "project_access load error",
        accessResult.error,
      );

      setProjects([]);
      setLoading(false);
      return;
    }

    const projectIds =
      (
        accessResult.data as
          | ProjectAccessRow[]
          | null
      )?.map(
        (row) => row.project_id,
      ) ?? [];

    if (projectIds.length === 0) {
      setProjects([]);
      setLoading(false);
      return;
    }

    const {
      data: projectData,
      error: projectError,
    } = await supabase
      .from("projects")
      .select(
        "id, name, project_number, status, location",
      )
      .in("id", projectIds)
      .order("name");

    if (projectError) {
      console.error(
        "projects load error",
        projectError,
      );

      setProjects([]);
      setLoading(false);
      return;
    }

    setProjects(
      (projectData as Project[] | null) ??
        [],
    );

    setLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    const timer =
      window.setTimeout(() => {
        void loadData();
      }, 0);

    return () =>
      window.clearTimeout(timer);
  }, [loadData]);

  async function refreshPage() {
    setRefreshing(true);

    await loadData();

    setRefreshing(false);
  }

  const normalisedRole = useMemo(
    () => normaliseRole(role),
    [role],
  );

  const modules = useMemo(
    () =>
      getModulesForRole(
        normalisedRole,
      ),
    [normalisedRole],
  );

  const activeProjects =
    projects.filter((project) =>
      [
        "ongoing",
        "active",
        "in progress",
      ].includes(
        String(
          project.status ?? "",
        )
          .trim()
          .toLowerCase(),
      ),
    ).length;

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
                Open your projects, access the tools
                relevant to your role and review the
                areas that need attention.
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
                  onClick={() =>
                    void refreshPage()
                  }
                  disabled={refreshing}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                >
                  <RefreshCw
                    size={16}
                    className={
                      refreshing
                        ? "animate-spin"
                        : ""
                    }
                  />
                  Refresh
                </button>
              </div>
            </div>

            <div className="grid min-w-[260px] grid-cols-2 gap-3">
              <HeroMetric
                label="Access level"
                value={
                  role
                    ? roleLabel(
                        normalisedRole,
                      )
                    : "Loading"
                }
              />

              <HeroMetric
                label="Projects"
                value={String(
                  projects.length,
                )}
              />

              <HeroMetric
                label="Active"
                value={String(
                  activeProjects,
                )}
              />

              <HeroMetric
                label="Modules"
                value={String(
                  modules.length,
                )}
              />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-slate-500">
                <LayoutDashboard size={18} />

                <span className="text-sm font-semibold">
                  Workspace
                </span>
              </div>

              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                Quick Access
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Shortcuts based on your assigned
                system role.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {modules.map((module) => (
              <ModuleCardItem
                key={`${module.title}-${module.href}`}
                module={module}
              />
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-slate-500">
                <Building2 size={18} />

                <span className="text-sm font-semibold">
                  Assigned Projects
                </span>
              </div>

              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                My Projects
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Open a project to view progress,
                towers, dockets and supporting
                information.
              </p>
            </div>

            <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600">
              {projects.length} assigned
            </div>
          </div>

          <div className="mt-6">
            {loading ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map(
                  (item) => (
                    <div
                      key={item}
                      className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-slate-100"
                    />
                  ),
                )}
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <FolderKanban
                  size={28}
                  className="mx-auto text-slate-400"
                />

                <h3 className="mt-4 text-lg font-bold text-slate-900">
                  No projects assigned
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  An administrator needs to assign
                  project access to your account.
                </p>

                {normalisedRole ===
                "admin" ? (
                  <Link
                    href="/admin"
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    Manage User Access
                    <ArrowRight
                      size={16}
                    />
                  </Link>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {projects.map(
                  (project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                    />
                  ),
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function ModuleCardItem({
  module,
}: {
  module: ModuleCard;
}) {
  const styles =
    getAccentClasses(
      module.accent,
    );

  return (
    <Link
      href={module.href}
      className={`group rounded-2xl border p-5 transition hover:-translate-y-0.5 hover:shadow-md ${styles.border} ${styles.background}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div
          className={`rounded-xl p-2.5 ${styles.icon}`}
        >
          {module.icon}
        </div>

        {module.badge ? (
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm">
            {module.badge}
          </span>
        ) : null}
      </div>

      <h3 className="mt-5 text-lg font-bold text-slate-900">
        {module.title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-slate-600">
        {module.description}
      </p>

      <div
        className={`mt-5 inline-flex items-center gap-2 text-sm font-semibold ${styles.text}`}
      >
        Open

        <ArrowRight
          size={15}
          className="transition-transform group-hover:translate-x-1"
        />
      </div>
    </Link>
  );
}

function ProjectCard({
  project,
}: {
  project: Project;
}) {
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
          {project.status ||
            "Unknown"}
        </span>
      </div>

      <div className="mt-5">
        {project.project_number ? (
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {
              project.project_number
            }
          </div>
        ) : null}

        <h3 className="mt-1 text-xl font-bold text-slate-900">
          {project.name}
        </h3>

        <p className="mt-2 text-sm text-slate-500">
          {project.location ||
            "Location not set"}
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
        <span className="text-sm font-semibold text-slate-700">
          Open dashboard
        </span>

        <ArrowRight
          size={16}
          className="text-slate-400 transition-transform group-hover:translate-x-1"
        />
      </div>
    </Link>
  );
}

function HeroMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div className="mt-2 text-xl font-bold text-white">
        {value}
      </div>
    </div>
  );
}