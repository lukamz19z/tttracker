"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

type Tower = {
  id: string;
  name: string;
  line?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status?: string | null;
  progress?: number | null;
  extra_data?: any;
};

type Docket = {
  id: string;
  docket_date: string;
  assembly_percent: number | null;
  erection_percent: number | null;
  leading_hand: string | null;
};

export default function TowerDetailPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const [tower, setTower] = useState<Tower | null>(null);
  const [dockets, setDockets] = useState<Docket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const supabase = createSupabaseBrowser();

    const towerRes = await supabase
      .from("towers")
      .select("*")
      .eq("id", towerId)
      .single();

    const docketRes = await supabase
      .from("tower_daily_dockets")
      .select("*")
      .eq("tower_id", towerId)
      .order("docket_date", { ascending: false });

    setTower(towerRes.data);
    setDockets(docketRes.data || []);
    setLoading(false);
  }

  const latest = useMemo(() => dockets[0], [dockets]);

  if (loading) return <div className="p-8">Loading...</div>;
  if (!tower) return <div className="p-8">Tower not found</div>;

  const extra = tower.extra_data || {};
  const keys = Object.keys(extra);

  return (
    <div className="p-8 space-y-6">

      {/* HEADER */}
      <div className="bg-white border rounded-2xl p-6">
        <div className="flex justify-between">
          <div>
            <div className="text-sm text-slate-500">Tower</div>
            <div className="text-3xl font-bold">{tower.name}</div>
            <div className="text-slate-600 mt-1">
              Line: {tower.line || "-"}
            </div>
          </div>

          <div className="flex gap-3">
            <InfoCard label="Status" value={tower.status} />
            <InfoCard label="Progress" value={`${tower.progress || 0}%`} />
            <InfoCard
              label="Last Docket"
              value={latest?.docket_date || "-"}
            />
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <Link
            href={`/project/${projectId}/tower/${towerId}/dockets/new`}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg"
          >
            Add Daily Docket
          </Link>

          <button className="bg-slate-900 text-white px-4 py-2 rounded-lg">
            Open Workpack
          </button>

          <button className="border px-4 py-2 rounded-lg">
            Upload Photo Later
          </button>
        </div>
      </div>

      {/* TABS */}
      <div className="border-b flex gap-2">
        <button className="px-4 py-2 bg-white border rounded-t-lg font-semibold">
          Overview
        </button>

        <Link
          href={`/project/${projectId}/tower/${towerId}/dockets`}
          className="px-4 py-2 bg-slate-100 border rounded-t-lg"
        >
          Daily Dockets
        </Link>
      </div>
      <Link
        href={`/project/${projectId}/tower/${towerId}/workpack`}
        className="px-4 py-2 bg-slate-100 border rounded-t-lg"
        >
             Workpack
            </Link>

      {/* ⭐ ADAPTIVE OVERVIEW */}
      <div className="bg-white border rounded-2xl p-6">
        <div className="text-xl font-semibold mb-4">
          Tower Information
        </div>

        {keys.length === 0 ? (
          <div className="text-slate-500">
            No additional tower data uploaded
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {keys.map((k) => (
              <SpecCard
                key={k}
                label={formatLabel(k)}
                value={extra[k]}
              />
            ))}
          </div>
        )}
      </div>

      {/* ⭐ QUICK ACTIVITY SNAPSHOT */}
      <div className="bg-white border rounded-2xl p-6">
        <div className="text-xl font-semibold mb-4">
          Latest Activity Snapshot
        </div>

        <div className="grid grid-cols-3 gap-4">
          <SpecCard
            label="Assembly %"
            value={`${latest?.assembly_percent || 0}%`}
          />
          <SpecCard
            label="Erection %"
            value={`${latest?.erection_percent || 0}%`}
          />
          <SpecCard
            label="Leading Hand"
            value={latest?.leading_hand || "-"}
          />
        </div>
      </div>

    </div>
  );
}

function InfoCard({ label, value }: any) {
  return (
    <div className="bg-slate-100 rounded-xl px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-semibold">{value || "-"}</div>
    </div>
  );
}

function SpecCard({ label, value }: any) {
  return (
    <div className="border rounded-xl p-4 bg-slate-50">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-semibold">{value || "-"}</div>
    </div>
  );
}

function formatLabel(label: string) {
  return label
    .replaceAll("_", " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}