"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

export default function TowerOverviewPage() {
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

     

      {/* TOWER INFORMATION */}
      <div className="bg-white border rounded-2xl p-6">
        <div className="text-xl font-semibold mb-4">
          Tower Information
        </div>

        <div className="grid grid-cols-3 gap-4">
          {tower.extra_data &&
            Object.entries(tower.extra_data).map(([key, value]) => (
              <div
                key={key}
                className="border rounded-xl p-4 bg-slate-50"
              >
                <div className="text-xs text-slate-500 uppercase">
                  {key}
                </div>
                <div className="font-semibold">{String(value)}</div>
              </div>
            ))}
        </div>
      </div>

      {/* LATEST ACTIVITY */}
      <div className="bg-white border rounded-2xl p-6">
        <div className="text-xl font-semibold mb-4">
          Latest Activity Snapshot
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="border rounded-xl p-4 bg-slate-50">
            <div className="text-xs text-slate-500">
              Progress
            </div>
            <div className="font-semibold">
              {tower.progress || 0}%
            </div>
          </div>

          <div className="border rounded-xl p-4 bg-slate-50">
            <div className="text-xs text-slate-500">
              Status
            </div>
            <div className="font-semibold">
              {tower.status}
            </div>
          </div>

          <div className="border rounded-xl p-4 bg-slate-50">
            <div className="text-xs text-slate-500">
              Last Docket
            </div>
            <div className="font-semibold">
              {latestDate || "-"}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}