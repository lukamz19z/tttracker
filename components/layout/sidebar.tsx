"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase";

type Tower = {
  id: string;
  name?: string | null;
};

export function Sidebar({
  projectId,
  towerId,
}: {
  projectId?: string;
  towerId?: string;
}) {
  const pathname = usePathname();
  const supabase = createSupabaseBrowser();

  const [projectName, setProjectName] = useState<string | null>(null);
  const [towers, setTowers] = useState<Tower[]>([]);

  useEffect(() => {
    if (!projectId) return;

    async function loadProject() {
      const { data } = await supabase
        .from("projects")
        .select("name")
        .eq("id", projectId)
        .single();

      if (data) setProjectName(data.name);

      const { data: towerData } = await supabase
        .from("towers")
        .select("id,name")
        .eq("project_id", projectId)
        .order("name");

      if (towerData) setTowers(towerData);
    }

    loadProject();
  }, [projectId, supabase]);

  const currentTowerIndex = useMemo(() => {
    return towers.findIndex((t) => t.id === towerId);
  }, [towers, towerId]);

  const previousTower =
    currentTowerIndex > 0 ? towers[currentTowerIndex - 1] : null;

  const nextTower =
    currentTowerIndex >= 0 &&
    currentTowerIndex < towers.length - 1
      ? towers[currentTowerIndex + 1]
      : null;

  function linkStyle(href: string) {
    let isActive = false;

    if (href === "/") {
      isActive = pathname === "/";
    } else if (projectId && href === `/project/${projectId}`) {
      isActive = pathname === href;
    } else {
      isActive =
        pathname === href ||
        pathname.startsWith(href + "/");
    }

    return `
      flex items-center gap-2 px-3 py-2 rounded-xl transition text-sm
      ${
        isActive
          ? "bg-slate-900 text-white font-semibold shadow-sm"
          : "hover:bg-slate-100 text-slate-700"
      }
    `;
  }

  return (
    <aside className="hidden md:flex flex-col w-64 border-r bg-white sticky top-0 h-screen overflow-y-auto">
      
      {/* LOGO / TITLE */}
      <div className="p-5 border-b">
        <h1 className="text-2xl font-bold tracking-tight">
          TTTracker
        </h1>
      </div>

      <div className="flex-1 p-4 space-y-6">

        {/* CURRENT PROJECT */}
        {projectId && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">
              Current Project
            </div>

            <div className="bg-slate-100 rounded-2xl px-4 py-3">
              <div className="font-semibold text-slate-800 truncate">
                {projectName || "Loading..."}
              </div>
            </div>
          </div>
        )}

        {/* MAIN NAV */}
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">
            Navigation
          </div>

          <nav className="space-y-1">
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
          </nav>
        </div>

        {/* TOWER NAVIGATION */}
        {towerId && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">
              Tower Navigation
            </div>

            <div className="space-y-2">

              {previousTower ? (
                <Link
                  href={`/project/${projectId}/tower/${previousTower.id}`}
                  className="flex items-center justify-between rounded-2xl border px-4 py-3 hover:bg-slate-50 transition"
                >
                  <div>
                    <div className="text-xs text-slate-400">
                      Previous
                    </div>

                    <div className="font-medium text-sm">
                      {previousTower.name}
                    </div>
                  </div>

                  <span className="text-slate-500 text-lg">
                    ←
                  </span>
                </Link>
              ) : null}

              {nextTower ? (
                <Link
                  href={`/project/${projectId}/tower/${nextTower.id}`}
                  className="flex items-center justify-between rounded-2xl border px-4 py-3 hover:bg-slate-50 transition"
                >
                  <div>
                    <div className="text-xs text-slate-400">
                      Next
                    </div>

                    <div className="font-medium text-sm">
                      {nextTower.name}
                    </div>
                  </div>

                  <span className="text-slate-500 text-lg">
                    →
                  </span>
                </Link>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}