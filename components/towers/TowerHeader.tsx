"use client";

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

  const towerLabel =
    tower?.tower_number ||
    tower?.structure_number ||
    tower?.tower_no ||
    tower?.name ||
    "Tower";

  const status = tower?.status || "-";
  const progress = tower?.progress ?? "100%";

  function getCoverUrl() {
    if (!tower?.cover_photo_path) return null;

    return supabase.storage
      .from("tower-photos")
      .getPublicUrl(tower.cover_photo_path).data.publicUrl;
  }

  const coverUrl = getCoverUrl();

  return (
    <div className="bg-white border rounded-2xl p-6 space-y-6">
      {/* TOP ROW */}
      <div className="flex justify-between gap-6 flex-wrap">
        <div>
          <div className="text-sm text-slate-500">Tower</div>
          <div className="text-3xl font-bold">{towerLabel}</div>
          <div className="text-slate-500 mt-1">
            Line: {tower?.line || tower?.line_name || "-"}
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <InfoCard label="Status" value={status} />
          <InfoCard label="Progress" value={String(progress)} />
          <InfoCard label="Last Docket" value={latestDate || "-"} />
        </div>
      </div>

      {/* ⭐ COVER PHOTO */}
      {coverUrl && (
        <div className="rounded-2xl overflow-hidden border bg-slate-100">
          <img
            src={coverUrl}
            className="w-full h-[260px] object-cover"
          />
        </div>
      )}

      {/* ACTION BUTTONS */}
      <div className="flex gap-3 flex-wrap">
        <Link
          href={`/project/${projectId}/tower/${towerId}/daily-dockets/new`}
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

        <TabLink
          href={`/project/${projectId}/tower/${towerId}/daily-dockets`}
        >
          Daily Dockets
        </TabLink>

        <TabLink
          href={`/project/${projectId}/tower/${towerId}/workpack`}
        >
          Workpack
        </TabLink>

        <TabLink
          href={`/project/${projectId}/tower/${towerId}/modifications`}
        >
          Modifications
        </TabLink>

        <TabLink
          href={`/project/${projectId}/tower/${towerId}/defects`}
        >
          Defects
        </TabLink>

        <TabLink
          href={`/project/${projectId}/tower/${towerId}/materials`}
        >
          Materials
        </TabLink>

        <TabLink
          href={`/project/${projectId}/tower/${towerId}/deliveries`}
        >
          Deliveries
        </TabLink>

        <TabLink
          href={`/project/${projectId}/tower/${towerId}/photos`}
        >
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