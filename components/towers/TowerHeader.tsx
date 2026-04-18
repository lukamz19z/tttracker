"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";

type Tower = {
  id: string;
  status?: string | null;
  line?: string | null;
  line_name?: string | null;
  name?: string | null;
  tower_number?: string | null;
  structure_number?: string | null;
  tower_no?: string | null;
  cover_photo_path?: string | null;
};

type TowerHeaderProps = {
  projectId: string;
  tower: Tower;
  latestDate?: string | null;
};

type DocketProgressRow = {
  assembly_percent: number | null;
  erection_percent: number | null;
};

type DocketIdRow = {
  id: string;
};

type LabourHourRow = {
  total_hours: number | null;
};

type DefectRow = {
  status: string | null;
};

type RequiredBundleRow = {
  bundle_no: string;
  qty_required: number | null;
};

type DeliveryRow = {
  id: string;
};

type DeliveryItemRow = {
  delivery_id: string;
  bundle_no: string;
  qty_delivered: number | null;
};

export default function TowerHeader({
  projectId,
  tower,
  latestDate,
}: TowerHeaderProps) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
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

  const derivedStatus = useMemo(() => {
    if (progress >= 100) return "Complete";
    if (progress > 0) return "In Progress";
    return "Not Started";
  }, [progress]);

  const coverUrl = tower?.cover_photo_path
    ? supabase.storage
        .from("tower-photos")
        .getPublicUrl(tower.cover_photo_path).data.publicUrl
    : null;

  useEffect(() => {
    if (!towerId) return;

    let cancelled = false;

    async function loadHeaderData() {
      try {
        const [
          docketProgressRowsRes,
          docketIdsRes,
          defectsRes,
          requiredBundlesRes,
          deliveriesRes,
        ] = await Promise.all([
          supabase
            .from("tower_daily_dockets")
            .select("assembly_percent, erection_percent")
            .eq("tower_id", towerId),

          supabase
            .from("tower_daily_dockets")
            .select("id")
            .eq("tower_id", towerId),

          supabase.from("tower_defects").select("status").eq("tower_id", towerId),

          supabase
            .from("tower_required_bundles")
            .select("bundle_no, qty_required")
            .eq("tower_id", towerId),

          supabase
            .from("tower_bundle_deliveries")
            .select("id")
            .eq("tower_id", towerId),
        ]);

        if (cancelled) return;

        let nextProgress = 0;

        if (!docketProgressRowsRes.error && docketProgressRowsRes.data) {
          const progressRows = docketProgressRowsRes.data as DocketProgressRow[];

          nextProgress = progressRows.reduce((max, row) => {
            const assembly = Number(row.assembly_percent || 0);
            const erection = Number(row.erection_percent || 0);
            const weighted = Math.round(assembly * 0.5 + erection * 0.5);
            return Math.max(max, weighted);
          }, 0);
        }

        let nextTotalHours = 0;

        if (!docketIdsRes.error && docketIdsRes.data && docketIdsRes.data.length > 0) {
          const docketIds = (docketIdsRes.data as DocketIdRow[]).map((d) => d.id);

          const labourRes = await supabase
            .from("tower_docket_labour")
            .select("total_hours")
            .in("docket_id", docketIds);

          if (!cancelled && !labourRes.error && labourRes.data) {
            nextTotalHours = (labourRes.data as LabourHourRow[]).reduce(
              (sum, row) => sum + Number(row.total_hours || 0),
              0
            );
          }
        }

        let nextOpenDefects = 0;

        if (!defectsRes.error && defectsRes.data) {
          nextOpenDefects = (defectsRes.data as DefectRow[]).filter((d) => {
            const status = (d.status || "").trim().toLowerCase();
            return (
              status !== "closed" &&
              status !== "complete" &&
              status !== "completed"
            );
          }).length;
        }

        let nextDeliveryProgress = 0;

        const requiredRows = (requiredBundlesRes.data || []) as RequiredBundleRow[];
        const deliveryRows = (deliveriesRes.data || []) as DeliveryRow[];

        if (!requiredBundlesRes.error && requiredRows.length > 0) {
          const totalRequired = requiredRows.reduce(
            (sum, row) => sum + Number(row.qty_required || 0),
            0
          );

          if (totalRequired > 0 && deliveryRows.length > 0) {
            const deliveryIds = deliveryRows.map((d) => d.id);

            const itemsRes = await supabase
              .from("tower_bundle_delivery_items")
              .select("delivery_id, bundle_no, qty_delivered")
              .in("delivery_id", deliveryIds);

            if (!cancelled && !itemsRes.error && itemsRes.data) {
              const deliveredByBundle: Record<string, number> = {};

              (itemsRes.data as DeliveryItemRow[]).forEach((item) => {
                deliveredByBundle[item.bundle_no] =
                  (deliveredByBundle[item.bundle_no] || 0) +
                  Number(item.qty_delivered || 0);
              });

              const cappedDelivered = requiredRows.reduce((sum, bundle) => {
                const required = Number(bundle.qty_required || 0);
                const delivered = deliveredByBundle[bundle.bundle_no] || 0;
                return sum + Math.min(required, delivered);
              }, 0);

              nextDeliveryProgress = Math.round(
                (cappedDelivered / totalRequired) * 100
              );
            }
          }
        }

        if (cancelled) return;

        setProgress(nextProgress);
        setTotalHours(Math.round(nextTotalHours * 100) / 100);
        setOpenDefects(nextOpenDefects);
        setDeliveryProgress(nextDeliveryProgress);
      } catch (error) {
        console.error("Failed to load tower header data:", error);
      }
    }

    loadHeaderData();

    return () => {
      cancelled = true;
    };
  }, [supabase, towerId]);

  return (
    <div className="bg-white border rounded-2xl p-6 space-y-6">
      <div className="flex justify-between gap-6 flex-wrap">
        <div>
          <div className="text-sm text-slate-500">Tower</div>
          <div className="text-3xl font-bold">{towerLabel}</div>
          <div className="text-slate-500 mt-1">
            Line: {tower?.line || tower?.line_name || "-"}
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <InfoCard label="Status" value={derivedStatus} />
          <InfoCard label="Progress" value={`${progress}%`} />
          <InfoCard label="Hours" value={`${totalHours}h`} />
          <InfoCard label="Defects" value={`${openDefects}`} />
          <InfoCard label="Steel" value={`${deliveryProgress}%`} />
          <InfoCard label="Last Docket" value={latestDate || "-"} />
        </div>
      </div>

      {coverUrl && (
  <div className="rounded-2xl overflow-hidden border bg-slate-100 w-full max-w-[420px]">
    <div className="relative w-full aspect-video">
      <img
        src={coverUrl}
        alt={`${towerLabel} cover`}
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
    </div>
  </div>
)}

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