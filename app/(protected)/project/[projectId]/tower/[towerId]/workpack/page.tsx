"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

export default function WorkpackHome() {
  const params = useParams();

  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<any>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: towerData } = await supabase
      .from("towers")
      .select("*")
      .eq("id", towerId)
      .single();

    setTower(towerData);

    const { data: dockets } = await supabase
      .from("tower_daily_dockets")
      .select("docket_date")
      .eq("tower_id", towerId)
      .order("docket_date", { ascending: false })
      .limit(1);

    if (dockets && dockets.length > 0) {
      setLatestDate(dockets[0].docket_date);
    }
  }

  if (!tower) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 space-y-6">

      {/* HEADER */}
      <TowerHeader
        projectId={projectId}
        tower={tower}
        latestDate={latestDate}
      />

     
      {/* WORKPACK CONTENT */}
      <div className="text-2xl font-semibold">
        Workpack
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">

        <Link
          href={`/project/${projectId}/tower/${towerId}/workpack/safety`}
          className="border rounded-xl p-6 hover:bg-slate-50"
        >
          Safety Sign-On
        </Link>

        <Link
          href={`/project/${projectId}/tower/${towerId}/workpack/itc`}
          className="border rounded-xl p-6 hover:bg-slate-50"
        >
          ITC Checklists
        </Link>

        <Link
          href={`/project/${projectId}/tower/${towerId}/workpack/permits`}
          className="border rounded-xl p-6 hover:bg-slate-50"
        >
          Permits
        </Link>

        <Link
          href={`/project/${projectId}/tower/${towerId}/workpack/lift-study`}
          className="border rounded-xl p-6 hover:bg-slate-50"
        >
          Lift Studies
        </Link>

        <Link
          href={`/project/${projectId}/tower/${towerId}/workpack/docs`}
          className="border rounded-xl p-6 hover:bg-slate-50"
        >
          Documents
        </Link>

      </div>

    </div>
  );
}