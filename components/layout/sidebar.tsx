"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase";

type Tower = {
  id: string;
  name?: string | null;
  line?: string | null;
  extra_data?: Record<string, unknown> | null;
};

type TowerRun = {
  label: string;
  count: number;
};

function safeString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function extractGroupFromTowerName(name?: string | null): string {
  const clean = safeString(name);
  if (!clean) return "";

  // Handles: "1R/2R-10" -> "1R-2R"
  const slashRunMatch = clean.match(/^([A-Za-z0-9]+R)\s*\/\s*([A-Za-z0-9]+R)\s*-\s*\d+$/i);
  if (slashRunMatch?.[1] && slashRunMatch?.[2]) {
    return `${slashRunMatch[1].toUpperCase()}-${slashRunMatch[2].toUpperCase()}`;
  }

  // Handles: "1R-2R-10" -> "1R-2R"
  const dashRunMatch = clean.match(/^([A-Za-z0-9]+R)\s*-\s*([A-Za-z0-9]+R)\s*-\s*\d+$/i);
  if (dashRunMatch?.[1] && dashRunMatch?.[2]) {
    return `${dashRunMatch[1].toUpperCase()}-${dashRunMatch[2].toUpperCase()}`;
  }

  // Handles: "10 1R-2R" -> "1R-2R"
  const numberThenGroup = clean.match(/^\s*\S+\s+(.+)$/);
  if (numberThenGroup?.[1]) return numberThenGroup[1].trim().replace("/", "-").toUpperCase();

  return "";
}

function getTowerRun(tower: Tower): string {
  const extra = tower.extra_data || {};

  return (
    safeString(extra["Navigation Group"]) ||
    safeString(extra["navigation_group"]) ||
    safeString(extra["Tower Group"]) ||
    safeString(extra["tower_group"]) ||
    safeString(extra["Tower Run"]) ||
    safeString(extra["tower_run"]) ||
    safeString(extra["Run"]) ||
    safeString(extra["run"]) ||
    safeString(extra["Section"]) ||
    safeString(extra["section"]) ||
    safeString(tower.line) ||
    extractGroupFromTowerName(tower.name)
  );
}

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

  const towerMatch = pathname.match(/\/tower\/([^/]+)/);
  const activeTowerId = towerId || towerMatch?.[1] || null;

  useEffect(() => {
    if (!projectId) return;

    async function loadProject() {
      const { data: projectData } = await supabase
        .from("projects")
        .select("name")
        .eq("id", projectId)
        .single();

      if (projectData) setProjectName(projectData.name);

      const { data: towerData } = await supabase
        .from("towers")
        .select("id,name,line,extra_data")
        .eq("project_id", projectId)
        .order("name");

      if (towerData) setTowers(towerData as Tower[]);
    }

    void loadProject();
  }, [projectId, supabase]);

  const towerRuns = useMemo<TowerRun[]>(() => {
    const map = new Map<string, number>();

    towers.forEach((tower) => {
      const group = getTowerRun(tower);

      if (!group) return;
      map.set(group, (map.get(group) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [towers]);

  const currentTowerIndex = useMemo(() => {
    if (!activeTowerId) return -1;
    return towers.findIndex((t) => t.id === activeTowerId);
  }, [towers, activeTowerId]);

  const previousTower =
    currentTowerIndex > 0 ? towers[currentTowerIndex - 1] : null;

  const nextTower =
    currentTowerIndex >= 0 && currentTowerIndex < towers.length - 1
      ? towers[currentTowerIndex + 1]
      : null;

  function linkStyle(href: string) {
    let isActive = false;

    if (projectId && href === `/project/${projectId}`) {
      isActive = pathname === href;
    } else {
      isActive = pathname === href || pathname.startsWith(href + "/");
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

  function runLinkStyle(group: string) {
    const encoded = encodeURIComponent(group);
    const href = `/project/${projectId}/towers?group=${encoded}`;
    const isActive =
      pathname === `/project/${projectId}/towers` &&
      typeof window !== "undefined" &&
      window.location.search.includes(`group=${encoded}`);

    return `
      flex items-center justify-between gap-2 px-3 py-2 rounded-xl transition text-sm
      ${
        isActive
          ? "bg-slate-900 text-white font-semibold shadow-sm"
          : "hover:bg-slate-100 text-slate-700"
      }
    `;
  }

  return (
    <aside className="hidden md:flex flex-col w-64 border-r bg-white sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
      <div className="flex-1 p-4 space-y-6">
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

        {projectId && towerRuns.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">
                Tower Runs
              </div>

              <div className="text-[10px] text-slate-400">
                {towerRuns.length}
              </div>
            </div>

            <div className="space-y-1">
              {towerRuns.map((run) => (
                <Link
                  key={run.label}
                  href={`/project/${projectId}/towers?group=${encodeURIComponent(
                    run.label,
                  )}`}
                  className={runLinkStyle(run.label)}
                >
                  <span className="truncate">{run.label}</span>

                  <span className="shrink-0 text-[11px] rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
                    {run.count}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {activeTowerId && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">
              Tower Navigation
            </div>

            <div className="space-y-2">
              {previousTower && (
                <Link
                  href={`/project/${projectId}/tower/${previousTower.id}`}
                  className="flex items-center justify-between rounded-2xl border px-4 py-3 hover:bg-slate-50 transition"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-slate-400">Previous</div>
                    <div className="font-medium text-sm truncate">
                      {previousTower.name}
                    </div>
                  </div>

                  <span className="text-slate-500 text-lg">←</span>
                </Link>
              )}

              {nextTower && (
                <Link
                  href={`/project/${projectId}/tower/${nextTower.id}`}
                  className="flex items-center justify-between rounded-2xl border px-4 py-3 hover:bg-slate-50 transition"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-slate-400">Next</div>
                    <div className="font-medium text-sm truncate">
                      {nextTower.name}
                    </div>
                  </div>

                  <span className="text-slate-500 text-lg">→</span>
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}