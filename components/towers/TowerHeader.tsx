"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";

type TowerHeaderProps = {
  projectId: string;
  tower: any;
  latestDate?: string | null;
};

export default function TowerHeader({
  projectId,
  tower,
  latestDate,
}: TowerHeaderProps) {
  const supabase = createSupabaseBrowser();

  const towerId = tower?.id;

  const [progress, setProgress] = useState<number>(0);
  const [totalHours, setTotalHours] = useState<number>(0);
  const [openDefects, setOpenDefects] = useState<number>(0);
  const [deliveryProgress, setDeliveryProgress] = useState<number>(0);

  const towerLabel =
    tower?.tower_number ||
    tower?.structure_number ||
    tower?.tower_no ||
    tower?.name ||
    "Tower";

  const status = tower?.status || "-";

  useEffect(() => {
    if (!towerId) return;

    loadHeaderData();
  }, [towerId]);

  async function loadHeaderData() {
    await Promise.all([
      loadProgress(),
      loadHours(),
      loadDefects(),
      loadDeliveries(),
    ]);
  }

  // 🔥 PROGRESS (50/50 from dockets)
  async function loadProgress() {
    const { data } = await supabase
      .from("tower_daily_dockets")
      .select("assembly_percent, erection_percent")
      .eq("tower_id", towerId);

    if (!data) return;

    const maxProgress = data.reduce((max, d) => {
      const a = Number(d.assembly_percent || 0);
      const e = Number(d.erection_percent || 0);

      const weighted = Math.round(a * 0.5 + e * 0.5);
      return Math.max(max, weighted);
    }, 0);

    setProgress(maxProgress);
  }

  // 🔥 TOTAL HOURS
  async function loadHours() {
    const { data } = await supabase
      .from("tower_docket_labour")
      .select("total_hours")
      .eq("tower_id", towerId);

    const sum =
      data?.reduce((acc, row) => acc + Number(row.total_hours || 0), 0) || 0;

    setTotalHours(Math.round(sum));
  }

  // 🔥 DEFECTS
  async function loadDefects() {
    const { data } = await supabase
      .from("tower_defects")
      .select("status")
      .eq("tower_id", towerId);

    const open = data?.filter((d) => d.status !== "Closed").length || 0;
    setOpenDefects(open);
  }

  // 🔥 DELIVERY PROGRESS (simple %)
  async function loadDeliveries() {
    const { data } = await supabase
      .from("tower_deliveries")
      .select("delivered");

    if (!data || data.length === 0) return;

    const delivered = data.filter((d) => d.delivered === true).length;
    const percent = Math.round((delivered / data.length) * 100);

    setDeliveryProgress(percent);
  }

  function getCoverUrl() {
    if (!tower?.cover_photo_path) return null;

    return supabase.storage
      .from("tower-photos")
      .getPublicUrl(tower.cover_photo_path).data.publicUrl;
  }

  const coverUrl = getCoverUrl();

  return (
    <div className="bg-white border rounded-2xl p-6 space-y-6">

      {/* TOP */}
      <div className="flex justify-between gap-6 flex-wrap">
        <div>
          <div className="text-sm text-slate-500">Tower</div>
          <div className="text-3xl font-bold">{towerLabel}</div>
          <div className="text-slate-500 mt-1">
            Line: {tower?.line || tower?.line_name || "-"}
          </div>
        </div>

        {/* KPI CARDS */}
        <div className="flex gap-3 flex-wrap">
          <InfoCard label="Status" value={status} />
          <InfoCard label="Progress" value={`${progress}%`} />
          <InfoCard label="Hours" value={`${totalHours}h`} />
          <InfoCard label="Defects" value={`${openDefects}`} />
          <InfoCard label="Steel" value={`${deliveryProgress}%`} />
          <InfoCard label="Last Docket" value={latestDate || "-"} />
        </div>
      </div>

      {/* COVER */}
      {coverUrl && (
        <div className="rounded-2xl overflow-hidden border bg-slate-100">
          <img src={coverUrl} className="w-full h-[260px] object-cover" />
        </div>
      )}

      {/* ACTIONS */}
      <div className="flex gap-3 flex-wrap">
        <Link
          href={`/project/${projectId}/tower/${towerId}/dockets/new`}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg"
        >
          Add Daily Docket
        </Link>

        <Link
          href={`/project/${projectId}/tower/${towerId}/workpack`}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg"
        >
          Open Workpack
        </Link>

        <Link
          href={`/project/${projectId}/tower/${towerId}/photos`}
          className="border px-4 py-2 rounded-lg"
        >
          Upload Photo
        </Link>
      </div>

      {/* TABS */}
      <div className="flex gap-2 flex-wrap border-t pt-4">
        <TabLink href={`/project/${projectId}/tower/${towerId}`}>
          Overview
        </TabLink>

        <TabLink href={`/project/${projectId}/tower/${towerId}/dockets`}>
          Daily Dockets
        </TabLink>

        <TabLink href={`/project/${projectId}/tower/${towerId}/workpack`}>
          Workpack
        </TabLink>

        <TabLink href={`/project/${projectId}/tower/${towerId}/modifications`}>
          Modifications
        </TabLink>

        <TabLink href={`/project/${projectId}/tower/${towerId}/defects`}>
          Defects
        </TabLink>

        <TabLink href={`/project/${projectId}/tower/${towerId}/materials`}>
          Materials
        </TabLink>

        <TabLink href={`/project/${projectId}/tower/${towerId}/deliveries`}>
          Deliveries
        </TabLink>

        <TabLink href={`/project/${projectId}/tower/${towerId}/photos`}>
          Photos
        </TabLink>
      </div>

    </div>
  );
}

function TabLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="border px-4 py-2 rounded-lg hover:bg-slate-50"
    >
      {children}
    </Link>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-100 rounded-xl px-4 py-3 min-w-[90px]">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}