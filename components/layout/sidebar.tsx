"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase";

export function Sidebar({ projectId }: { projectId?: string }) {
  const pathname = usePathname();
  const supabase = createSupabaseBrowser();

  const [projectName, setProjectName] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    async function loadProject() {
      const { data } = await supabase
        .from("projects")
        .select("name")
        .eq("id", projectId)
        .single();

      if (data) setProjectName(data.name);
    }

    loadProject();
  }, [projectId, supabase]);

  function linkStyle(href: string) {
    let isActive = false;

    if (href === "/") {
      isActive = pathname === "/";
    } else if (
      projectId &&
      href === `/project/${projectId}`
    ) {
      isActive = pathname === href;
    } else {
      isActive =
        pathname === href ||
        pathname.startsWith(href + "/");
    }

    return `
      block p-2 rounded-lg transition
      ${isActive ? "bg-slate-200 font-semibold" : "hover:bg-slate-100"}
    `;
  }

  return (
    <aside className="w-64 bg-white border-r min-h-screen p-4 hidden md:block">

      {/* PROJECTS ROOT */}
      <nav className="space-y-2">

        <Link className={linkStyle("/")} href="/">
          Projects
        </Link>

        {/* PROJECT SECTION */}
        {projectId && (
          <>
            <div className="mt-6 mb-2 px-2">
              <div className="text-xs text-slate-400 uppercase">
                Project
              </div>

              <div className="font-semibold text-slate-800 truncate">
                {projectName || "Loading..."}
              </div>
            </div>

            <Link
              className={linkStyle(`/project/${projectId}`)}
              href={`/project/${projectId}`}
            >
              Dashboard
            </Link>

            <Link
              className={linkStyle(`/project/${projectId}/towers`)}
              href={`/project/${projectId}/towers`}
            >
              Towers
            </Link>

            <Link
              className={linkStyle(`/project/${projectId}/map`)}
              href={`/project/${projectId}/map`}
            >
              Map
            </Link>

            <Link
              className={linkStyle("/admin/users")}
              href="/admin/users"
            >
              Admin
            </Link>
          </>
        )}
      </nav>
    </aside>
  );
}