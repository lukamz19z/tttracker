"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";
import Link from "next/link";

export default function ProjectsHome() {
  const supabase = createSupabaseBrowser();

  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProjects() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // check role
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      let projectQuery;

      if (roleRow?.role === "admin") {
        // admin sees all
        projectQuery = await supabase.from("projects").select("*");
      } else {
        // others see assigned
        const { data: accessRows } = await supabase
          .from("project_access")
          .select("project_id")
          .eq("user_id", user.id);

        const ids = accessRows?.map((a: any) => a.project_id) || [];

        projectQuery = await supabase
          .from("projects")
          .select("*")
          .in("id", ids);
      }

      setProjects(projectQuery.data || []);
      setLoading(false);
    }

    loadProjects();
  }, []);

  return (
    <AppShell title="Projects">
      {loading && <p>Loading projects...</p>}

      <div className="grid md:grid-cols-2 gap-6">
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/project/${project.id}`}
            className="bg-white p-6 rounded-2xl shadow hover:shadow-md"
          >
            <h2 className="text-2xl font-bold">{project.name}</h2>

            <p className="text-slate-600 mt-1">
              {project.location} — {project.client}
            </p>

            <div className="mt-4 flex justify-between text-sm">
              <span>Status: {project.status}</span>
              <span>Towers: {project.total_towers}</span>
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}