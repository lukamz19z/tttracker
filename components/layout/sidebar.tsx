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

type TowerIdentity = {
  number: string;
  group: string;
};

function safeString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normaliseGroup(value: string): string {
  return value.trim().replaceAll("/", "-").replace(/\s+/g, " ");
}

function parseComparableTowerName(name?: string | null): TowerIdentity | null {
  const clean = safeString(name);
  if (!clean) return null;

  // Handles: "1R/2R-10", "3R/4R-10", "North-10", "Circuit A-10"
  const endingNumber = clean.match(/^(.*?)[\s_-]*(\d+)$/);
  if (endingNumber?.[1] && endingNumber?.[2]) {
    return {
      group: normaliseGroup(endingNumber[1]),
      number: endingNumber[2],
    };
  }

  // Handles: "10 1R-2R", "10 North", "10 Circuit A"
  const startingNumber = clean.match(/^(\d+)[\s_-]+(.+)$/);
  if (startingNumber?.[1] && startingNumber?.[2]) {
    return {
      number: startingNumber[1],
      group: normaliseGroup(startingNumber[2]),
    };
  }

  return null;
}

function getTowerIdentity(tower: Tower): TowerIdentity | null {
  const extra = tower.extra_data || {};

  const number =
    safeString(extra["Navigation Number"]) ||
    safeString(extra["navigation_number"]) ||
    safeString(extra["Tower Number"]) ||
    safeString(extra["tower_number"]) ||
    safeString(extra["Tower No"]) ||
    safeString(extra["tower_no"]) ||
    safeString(extra["Structure Number"]) ||
    safeString(extra["structure_number"]);

  const group =
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
    safeString(tower.line);

  if (number && group) {
    return {
      number,
      group: normaliseGroup(group),
    };
  }

  return parseComparableTowerName(tower.name);
}

export function Sidebar({
  projectId,
  towerId,
}: {
  projectId?: string;
  towerId?: string;
}) {
  const pathname = usePathname();
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [projectInfo, setProjectInfo] = useState<{
  name: string | null;
  project_number: string | null;
} | null>(null);
  const [towers, setTowers] = useState<Tower[]>([]);

  const towerMatch = pathname.match(/\/tower\/([^/]+)/);
  const activeTowerId = towerId || towerMatch?.[1] || null;

  useEffect(() => {
if (!projectId) return;

async function loadProject() {
  const { data: projectData } = await supabase
    .from("projects")
    .select("name, project_number")
    .eq("id", projectId)
    .single();

  if (projectData) {
    setProjectInfo({
      name: projectData.name,
      project_number: projectData.project_number,
    });
  }

  const { data: towerData } = await supabase
    .from("towers")
    .select("id,name,line,extra_data")
    .eq("project_id", projectId)
    .order("name");

  if (towerData) setTowers(towerData as Tower[]);
}

    void loadProject();
  }, [projectId, supabase]);

  const currentTower = useMemo(() => {
    if (!activeTowerId) return null;
    return towers.find((tower) => tower.id === activeTowerId) || null;
  }, [towers, activeTowerId]);

  const currentTowerIndex = useMemo(() => {
    if (!activeTowerId) return -1;
    return towers.findIndex((t) => t.id === activeTowerId);
  }, [towers, activeTowerId]);

  const previousTower = currentTowerIndex > 0 ? towers[currentTowerIndex - 1] : null;

  const nextTower =
    currentTowerIndex >= 0 && currentTowerIndex < towers.length - 1
      ? towers[currentTowerIndex + 1]
      : null;

  const matchingTowers = useMemo(() => {
    if (!currentTower) return [];

    const currentIdentity = getTowerIdentity(currentTower);
    if (!currentIdentity) return [];

    return towers
      .map((tower) => {
        const identity = getTowerIdentity(tower);

        if (!identity) return null;
        if (tower.id === currentTower.id) return null;
        if (identity.number !== currentIdentity.number) return null;

        return {
          id: tower.id,
          name: tower.name || "Unnamed Tower",
          number: identity.number,
          group: identity.group,
        };
      })
      .filter(
        (
          item,
        ): item is {
          id: string;
          name: string;
          number: string;
          group: string;
        } => item !== null,
      )
      .sort((a, b) => a.group.localeCompare(b.group, undefined, { numeric: true }));
  }, [towers, currentTower]);

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
            {projectInfo?.name || "Loading..."}
          </div>

          {projectInfo?.project_number && (
            <div className="mt-1 text-xs font-medium text-slate-500">
              {projectInfo.project_number}
            </div>
          )}
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
    className={linkStyle(`/project/${projectId}/dayworks`)}
    href={`/project/${projectId}/dayworks`}
  >
    Dayworks
  </Link>

  <Link
    className={linkStyle(`/project/${projectId}/map`)}
    href={`/project/${projectId}/map`}
  >
    Map
  </Link>
</nav>
        </div>

        {activeTowerId && matchingTowers.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">
              Matching Towers
            </div>

            <div className="space-y-1">
              {matchingTowers.map((tower) => (
                <Link
                  key={tower.id}
                  href={`/project/${projectId}/tower/${tower.id}`}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm hover:bg-slate-100 text-slate-700 transition"
                >
                  <span className="truncate">{tower.name}</span>

                  <span className="shrink-0 text-[11px] rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
                    {tower.group}
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