"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";
import { getUserRole } from "@/lib/roles";

type Project = {
  id: string;
  name: string;
  status: string;
  location?: string | null;
};

type ProjectAccessRow = {
  project_id: string;
};

type ModuleCard = {
  title: string;
  description: string;
  href: string;
  accent: "blue" | "emerald" | "amber" | "violet" | "rose" | "slate";
};

function normaliseRole(role: string | null): string {
  if (!role) return "viewer";

  const r = role.trim().toLowerCase();

  if (["admin", "administrator"].includes(r)) return "admin";
  if (["safety_manager", "safety manager", "safety"].includes(r)) return "safety_manager";
  if (["asset_manager", "asset manager", "assets"].includes(r)) return "asset_manager";
  if (["commercial", "commercial_manager", "commercial manager"].includes(r)) return "commercial";
  if (["crew", "leading_hand", "leading hand", "field", "editor"].includes(r)) return "crew";
  if (["viewer", "client", "read_only", "read only"].includes(r)) return "viewer";

  return r;
}

function getStatusClasses(status: string) {
  const s = status.trim().toLowerCase();

  if (s === "ongoing" || s === "active" || s === "in progress") {
    return "bg-green-100 text-green-700";
  }

  if (s === "tendering" || s === "planning") {
    return "bg-yellow-100 text-yellow-700";
  }

  if (s === "complete" || s === "completed") {
    return "bg-blue-100 text-blue-700";
  }

  return "bg-slate-100 text-slate-700";
}

function getAccentClasses(accent: ModuleCard["accent"]) {
  switch (accent) {
    case "blue":
      return {
        card: "from-blue-50 to-white border-blue-100",
        bar: "bg-blue-500",
        iconBg: "bg-blue-100 text-blue-700",
      };
    case "emerald":
      return {
        card: "from-emerald-50 to-white border-emerald-100",
        bar: "bg-emerald-500",
        iconBg: "bg-emerald-100 text-emerald-700",
      };
    case "amber":
      return {
        card: "from-amber-50 to-white border-amber-100",
        bar: "bg-amber-500",
        iconBg: "bg-amber-100 text-amber-700",
      };
    case "violet":
      return {
        card: "from-violet-50 to-white border-violet-100",
        bar: "bg-violet-500",
        iconBg: "bg-violet-100 text-violet-700",
      };
    case "rose":
      return {
        card: "from-rose-50 to-white border-rose-100",
        bar: "bg-rose-500",
        iconBg: "bg-rose-100 text-rose-700",
      };
    default:
      return {
        card: "from-slate-50 to-white border-slate-200",
        bar: "bg-slate-500",
        iconBg: "bg-slate-100 text-slate-700",
      };
  }
}

function getModulesForRole(role: string): ModuleCard[] {
  switch (role) {
    case "admin":
      return [
        {
          title: "Create Project",
          description: "Setup a new project, towers, permissions and dashboard structure.",
          href: "/projects/create",
          accent: "slate",
        },
        {
          title: "User Management",
          description: "Manage user access, roles and company permissions.",
          href: "/admin/users",
          accent: "violet",
        },
        {
          title: "Safety",
          description: "Open safety-focused workflows, workpacks and document controls.",
          href: "/safety",
          accent: "emerald",
        },
        {
          title: "Commercial",
          description: "View commercial tools, reporting and project cost workflows.",
          href: "/commercial",
          accent: "amber",
        },
        {
          title: "Assets",
          description: "Access plant, equipment, vehicles and supporting asset systems.",
          href: "/assets",
          accent: "blue",
        },
        {
          title: "All Projects",
          description: "Browse the projects you can access and open dashboards.",
          href: "/",
          accent: "rose",
        },
      ];

    case "safety_manager":
      return [
        {
          title: "Safety Dashboard",
          description: "Open safety management tools, documents and site compliance views.",
          href: "/safety",
          accent: "emerald",
        },
        {
          title: "Workpacks",
          description: "Review workpack content, safety docs, permits and ITC items.",
          href: "/safety/workpacks",
          accent: "blue",
        },
        {
          title: "Lessons Learnt",
          description: "Track lessons learnt and field feedback across projects.",
          href: "/lessons-learnt",
          accent: "amber",
        },
        {
          title: "My Projects",
          description: "Open assigned projects and review field-ready tower data.",
          href: "/",
          accent: "slate",
        },
      ];

    case "asset_manager":
      return [
        {
          title: "Plant & Equipment",
          description: "Manage plant registers, servicing, inspections and records.",
          href: "/assets",
          accent: "blue",
        },
        {
          title: "Vehicles",
          description: "Review vehicle registers, compliance dates and supporting docs.",
          href: "/assets/vehicles",
          accent: "emerald",
        },
        {
          title: "Documents",
          description: "Access equipment documents, manuals and maintenance files.",
          href: "/assets/documents",
          accent: "amber",
        },
        {
          title: "My Projects",
          description: "Open assigned projects where asset support is required.",
          href: "/",
          accent: "slate",
        },
      ];

    case "commercial":
      return [
        {
          title: "Commercial Dashboard",
          description: "Open commercial reporting, claims and delivery tracking views.",
          href: "/commercial",
          accent: "amber",
        },
        {
          title: "Project Reporting",
          description: "Review project-level summaries and commercial status signals.",
          href: "/commercial/reports",
          accent: "blue",
        },
        {
          title: "Variations / Claims",
          description: "Track variation and claim-related workflows.",
          href: "/commercial/claims",
          accent: "rose",
        },
        {
          title: "My Projects",
          description: "Open assigned projects and jump into detailed project dashboards.",
          href: "/",
          accent: "slate",
        },
      ];

    case "crew":
      return [
        {
          title: "My Projects",
          description: "Open your assigned projects and tower dashboards.",
          href: "/",
          accent: "blue",
        },
        {
          title: "Daily Dockets",
          description: "Go straight into field reporting and daily progress capture.",
          href: "/crew/dockets",
          accent: "emerald",
        },
        {
          title: "Deliveries",
          description: "Review delivery progress and bundle arrival status.",
          href: "/crew/deliveries",
          accent: "amber",
        },
        {
          title: "Materials",
          description: "Search bundle numbers, member marks and site material checks.",
          href: "/crew/materials",
          accent: "violet",
        },
      ];

    case "viewer":
    default:
      return [
        {
          title: "My Projects",
          description: "Browse projects you have been granted access to.",
          href: "/",
          accent: "blue",
        },
      ];
  }
}

function ModuleCardItem({ module }: { module: ModuleCard }) {
  const styles = getAccentClasses(module.accent);

  return (
    <Link href={module.href}>
      <div
        className={`h-full rounded-2xl border bg-gradient-to-br p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all ${styles.card}`}
      >
        <div className={`mb-4 h-1.5 w-14 rounded-full ${styles.bar}`} />
        <h3 className="text-lg font-semibold text-slate-900">{module.title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{module.description}</p>
      </div>
    </Link>
  );
}

export default function ProjectsPage() {
  const supabase = createSupabaseBrowser();
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    void loadRole();
    void loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRole() {
    const r = await getUserRole();
    setRole(r);
  }

  async function loadProjects() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { data: accessRows, error: accessError } = await supabase
      .from("project_access")
      .select("project_id")
      .eq("user_id", user.id);

    if (accessError) {
      console.error("project_access load error", accessError);
      setProjects([]);
      setLoading(false);
      return;
    }

    const ids = (accessRows as ProjectAccessRow[] | null)?.map((r) => r.project_id) || [];

    if (ids.length === 0) {
      setProjects([]);
      setLoading(false);
      return;
    }

    const { data: projectsData, error: projectsError } = await supabase
      .from("projects")
      .select("id, name, status, location")
      .in("id", ids);

    if (projectsError) {
      console.error("projects load error", projectsError);
      setProjects([]);
      setLoading(false);
      return;
    }

    const sortedProjects = ((projectsData as Project[] | null) || []).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    setProjects(sortedProjects);
    setLoading(false);
  }

  const normalisedRole = useMemo(() => normaliseRole(role), [role]);
  const modules = useMemo(() => getModulesForRole(normalisedRole), [normalisedRole]);

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Welcome</h1>
              <p className="mt-2 text-slate-600">
                Open the tools and projects relevant to your role.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Access Level</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {role ? role : "Loading role..."}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Quick Access</h2>
            <p className="mt-1 text-sm text-slate-600">
              Shortcuts tailored to your role and day-to-day workflow.
            </p>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {modules.map((module) => (
              <ModuleCardItem key={`${module.title}-${module.href}`} module={module} />
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">My Projects</h2>
            <p className="mt-1 text-sm text-slate-600">
              Projects you have been assigned to.
            </p>
          </div>

          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-slate-600">
              Loading projects...
            </div>
          )}

          {!loading && projects.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <h3 className="text-lg font-semibold text-slate-900">No projects available</h3>
              <p className="mt-1 text-sm text-slate-500">
                You have not been assigned to any projects yet.
              </p>
            </div>
          )}

          {!loading && projects.length > 0 && (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
              {projects.map((project) => (
                <Link key={project.id} href={`/project/${project.id}`}>
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all p-6 h-44 flex flex-col justify-between">
                    <div>
                      <h3 className="text-xl font-semibold text-slate-900">{project.name}</h3>

                      <span
                        className={`inline-block mt-3 text-xs px-3 py-1 rounded-full ${getStatusClasses(
                          project.status || "",
                        )}`}
                      >
                        {project.status || "unknown"}
                      </span>
                    </div>

                    <div className="text-sm text-slate-500">
                      {project.location || "Location not set"}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}