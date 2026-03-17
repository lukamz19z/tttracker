"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import Link from "next/link";
import { getUserRole } from "@/lib/roles";

type Project = {
  id: string;
  name: string;
  status: string;
  location?: string;
};

export default function ProjectsPage() {
  const supabase = createSupabaseBrowser();
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
    loadRole();
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

    const { data: accessRows } = await supabase
      .from("project_access")
      .select("project_id")
      .eq("user_id", user.id);

    const ids = accessRows?.map((r: any) => r.project_id) || [];

    if (ids.length === 0) {
      setProjects([]);
      setLoading(false);
      return;
    }

    const { data: projectsData } = await supabase
      .from("projects")
      .select("*")
      .in("id", ids);

    setProjects(projectsData || []);
    setLoading(false);
  }

  return (
    <div>

      <h1 className="text-3xl font-bold mb-6">Projects</h1>

      {/* ADMIN PANEL */}
      {role === "admin" && (
        <div
          onClick={() => router.push("/projects/create")}
          className="cursor-pointer bg-slate-900 text-white p-6 rounded-2xl mb-6 hover:opacity-90"
        >
          <h2 className="text-xl font-semibold">＋ Create New Project</h2>
          <p className="text-slate-300 text-sm mt-1">
            Setup towers, access permissions and dashboard
          </p>
        </div>
      )}

      {loading && <p>Loading projects...</p>}

      {!loading && projects.length === 0 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm">
          <h2 className="text-lg font-semibold">No projects available</h2>
          <p className="text-slate-500 text-sm mt-1">
            You have not been assigned to any projects yet.
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => (
          <Link key={project.id} href={`/project/${project.id}`}>
            <div className="bg-white rounded-2xl shadow-sm hover:shadow-md transition p-6 h-40 flex flex-col justify-between">
              <div>
                <h2 className="text-xl font-semibold">{project.name}</h2>

                <span
                  className={`inline-block mt-2 text-xs px-3 py-1 rounded-full ${
                    project.status === "ongoing"
                      ? "bg-green-100 text-green-700"
                      : project.status === "tendering"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {project.status}
                </span>
              </div>

              <div className="text-sm text-slate-500">
                {project.location || "Location not set"}
              </div>
            </div>
          </Link>
        ))}
      </div>

    </div>
  );
}