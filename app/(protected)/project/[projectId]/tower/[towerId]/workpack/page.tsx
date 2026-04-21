"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type TowerRecord = {
  id: string;
  name?: string | null;
  line?: string | null;
  status?: string | null;
  progress?: number | null;
  [key: string]: unknown;
};

type WorkpackCard = {
  title: string;
  description: string;
  href: string;
};

export default function WorkpackHome() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<TowerRecord | null>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [towerId]);

  async function load() {
    setLoading(true);

    const [towerRes, docketRes] = await Promise.all([
      supabase.from("towers").select("*").eq("id", towerId).single(),
      supabase
        .from("tower_daily_dockets")
        .select("docket_date")
        .eq("tower_id", towerId)
        .order("docket_date", { ascending: false })
        .limit(1),
    ]);

    setTower((towerRes.data as TowerRecord | null) ?? null);
    setLatestDate(docketRes.data?.[0]?.docket_date ?? null);

    setLoading(false);
  }

  const cards = useMemo<WorkpackCard[]>(
    () => [
      {
        title: "Safety Sign-On",
        description:
          "Upload and manage safety sign-ons, inductions, and current safety records for this tower.",
        href: `/project/${projectId}/tower/${towerId}/workpack/safety`,
      },
      {
        title: "ITC Checklists",
        description:
          "Complete BC or client ITCs, review readiness, manage torque sheets, and export the final record.",
        href: `/project/${projectId}/tower/${towerId}/workpack/itc`,
      },
      {
        title: "Permits",
        description:
          "Store permits, access approvals, environmental paperwork, and other tower-specific permit records.",
        href: `/project/${projectId}/tower/${towerId}/workpack/permits`,
      },
      {
        title: "Lift Studies",
        description:
          "Upload and review lift studies, crane studies, and supporting lifting documentation.",
        href: `/project/${projectId}/tower/${towerId}/workpack/lifts`,
      },
      {
        title: "Documents",
        description:
          "Manage extra client or project documents linked to this tower workpack.",
        href: `/project/${projectId}/tower/${towerId}/workpack/documents`,
      },
      {
        title: "Drawings",
        description:
          "View and manage issued IFC drawings, tower drawing files, and related drawing register items.",
        href: `/project/${projectId}/tower/${towerId}/workpack/drawings`,
      },
    ],
    [projectId, towerId],
  );

  if (loading || !tower) {
    return <div className="p-8">Loading workpack...</div>;
  }

  return (
    <div className="p-8 space-y-6">
      <TowerHeader
        projectId={projectId}
        tower={tower}
        latestDate={latestDate}
      />

      <div className="bg-white border rounded-2xl p-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">Workpack</h1>
          <p className="text-sm text-slate-600 max-w-3xl">
            Open the module you want to work on for this tower. Each section
            holds the key field and document controls tied to assembly,
            erection, and close out.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="group border rounded-2xl p-6 bg-white hover:bg-slate-50 transition"
          >
            <div className="space-y-2">
              <div className="text-lg font-semibold group-hover:text-blue-700">
                {card.title}
              </div>
              <div className="text-sm text-slate-600 leading-6">
                {card.description}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}