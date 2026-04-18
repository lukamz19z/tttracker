"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type Tower = {
  id: string;
  name?: string | null;
  line?: string | null;
  status?: string | null;
  progress?: number | null;
  tower_number?: string | null;
  structure_number?: string | null;
  tower_no?: string | null;
  extra_data?: Record<string, unknown> | null;
  cover_photo_path?: string | null;
};

type DocketRow = {
  id: string;
  docket_date: string | null;
  assembly_percent?: number | null;
  erection_percent?: number | null;
  weather_delay_hours?: number | null;
  lightning_delay_hours?: number | null;
  toolbox_delay_hours?: number | null;
  other_delay_hours?: number | null;
};

type LabourRow = {
  docket_id: string;
  total_hours?: number | null;
};

type DefectRow = {
  id: string;
  status?: string | null;
};

type ModificationRow = {
  id: string;
};

type BundleRow = {
  bundle_no: string;
  qty_required?: number | null;
};

type DeliveryRow = {
  id: string;
};

type DeliveryItemRow = {
  delivery_id: string;
  bundle_no: string;
  qty_delivered?: number | null;
};

type OverviewStats = {
  latestDate: string | null;
  docketCount: number;
  totalHours: number;
  totalWeatherDelay: number;
  totalLightningDelay: number;
  totalToolboxDelay: number;
  totalOtherDelay: number;
  totalDelayHours: number;
  defectCount: number;
  openDefectCount: number;
  modificationCount: number;
  totalRequiredBundles: number;
  totalRequiredQty: number;
  deliveryPercent: number;
  computedProgress: number;
  computedStatus: string;
};

function formatLabel(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isWeightKey(key: string) {
  const normalized = key.trim().toLowerCase();
  return (
    normalized === "weight" ||
    normalized === "tower weight" ||
    normalized === "tower_weight" ||
    normalized === "mass" ||
    normalized === "steel weight" ||
    normalized === "total weight" ||
    normalized === "total_weight"
  );
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function getOpenDefectCount(defects: DefectRow[]) {
  return defects.filter((d) => {
    const status = (d.status || "").trim().toLowerCase();
    return status !== "closed" && status !== "complete" && status !== "completed";
  }).length;
}

function getProgressFromDockets(dockets: DocketRow[]) {
  return dockets.reduce((max, docket) => {
    const assembly = Number(docket.assembly_percent || 0);
    const erection = Number(docket.erection_percent || 0);
    const weighted = Math.round(assembly * 0.5 + erection * 0.5);
    return Math.max(max, weighted);
  }, 0);
}

function getStatusFromProgress(progress: number) {
  if (progress >= 100) return "Complete";
  if (progress > 0) return "In Progress";
  return "Not Started";
}

export default function TowerOverviewPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [tower, setTower] = useState<Tower | null>(null);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!towerId) return;

    let cancelled = false;

    async function run() {
      setLoading(true);

      const [
        towerRes,
        docketsRes,
        defectsRes,
        modsRes,
        requiredBundlesRes,
        deliveriesRes,
      ] = await Promise.all([
        supabase.from("towers").select("*").eq("id", towerId).single(),
        supabase
          .from("tower_daily_dockets")
          .select(
            "id, docket_date, assembly_percent, erection_percent, weather_delay_hours, lightning_delay_hours, toolbox_delay_hours, other_delay_hours"
          )
          .eq("tower_id", towerId)
          .order("docket_date", { ascending: false }),
        supabase.from("tower_defects").select("id, status").eq("tower_id", towerId),
        supabase.from("tower_modifications").select("id").eq("tower_id", towerId),
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

      const nextTower = (towerRes.data as Tower | null) ?? null;
      setTower(nextTower);

      const dockets = (docketsRes.data as DocketRow[] | null) ?? [];
      const defects = (defectsRes.data as DefectRow[] | null) ?? [];
      const modifications = (modsRes.data as ModificationRow[] | null) ?? [];
      const requiredBundles =
        (requiredBundlesRes.data as BundleRow[] | null) ?? [];
      const deliveries = (deliveriesRes.data as DeliveryRow[] | null) ?? [];

      let labourRows: LabourRow[] = [];
      if (dockets.length > 0) {
        const docketIds = dockets.map((d) => d.id);

        const labourRes = await supabase
          .from("tower_docket_labour")
          .select("docket_id, total_hours")
          .in("docket_id", docketIds);

        if (!cancelled && labourRes.data) {
          labourRows = labourRes.data as LabourRow[];
        }
      }

      let deliveryItems: DeliveryItemRow[] = [];
      if (deliveries.length > 0) {
        const deliveryIds = deliveries.map((d) => d.id);

        const itemsRes = await supabase
          .from("tower_bundle_delivery_items")
          .select("delivery_id, bundle_no, qty_delivered")
          .in("delivery_id", deliveryIds);

        if (!cancelled && itemsRes.data) {
          deliveryItems = itemsRes.data as DeliveryItemRow[];
        }
      }

      const latestDate = dockets.length > 0 ? dockets[0].docket_date ?? null : null;

      const totalHours = labourRows.reduce(
        (sum, row) => sum + Number(row.total_hours || 0),
        0
      );

      const totalWeatherDelay = dockets.reduce(
        (sum, d) => sum + Number(d.weather_delay_hours || 0),
        0
      );
      const totalLightningDelay = dockets.reduce(
        (sum, d) => sum + Number(d.lightning_delay_hours || 0),
        0
      );
      const totalToolboxDelay = dockets.reduce(
        (sum, d) => sum + Number(d.toolbox_delay_hours || 0),
        0
      );
      const totalOtherDelay = dockets.reduce(
        (sum, d) => sum + Number(d.other_delay_hours || 0),
        0
      );

      const totalDelayHours =
        totalWeatherDelay +
        totalLightningDelay +
        totalToolboxDelay +
        totalOtherDelay;

      const computedProgress = getProgressFromDockets(dockets);
      const computedStatus = getStatusFromProgress(computedProgress);

      const totalRequiredBundles = requiredBundles.length;
      const totalRequiredQty = requiredBundles.reduce(
        (sum, row) => sum + Number(row.qty_required || 0),
        0
      );

      const deliveredByBundle: Record<string, number> = {};
      deliveryItems.forEach((item) => {
        deliveredByBundle[item.bundle_no] =
          (deliveredByBundle[item.bundle_no] || 0) +
          Number(item.qty_delivered || 0);
      });

      const cappedDelivered = requiredBundles.reduce((sum, bundle) => {
        const required = Number(bundle.qty_required || 0);
        const delivered = deliveredByBundle[bundle.bundle_no] || 0;
        return sum + Math.min(required, delivered);
      }, 0);

      const deliveryPercent =
        totalRequiredQty > 0
          ? Math.round((cappedDelivered / totalRequiredQty) * 100)
          : 0;

      const nextStats: OverviewStats = {
        latestDate,
        docketCount: dockets.length,
        totalHours: Math.round(totalHours * 100) / 100,
        totalWeatherDelay: Math.round(totalWeatherDelay * 100) / 100,
        totalLightningDelay: Math.round(totalLightningDelay * 100) / 100,
        totalToolboxDelay: Math.round(totalToolboxDelay * 100) / 100,
        totalOtherDelay: Math.round(totalOtherDelay * 100) / 100,
        totalDelayHours: Math.round(totalDelayHours * 100) / 100,
        defectCount: defects.length,
        openDefectCount: getOpenDefectCount(defects),
        modificationCount: modifications.length,
        totalRequiredBundles,
        totalRequiredQty,
        deliveryPercent,
        computedProgress,
        computedStatus,
      };

      if (!cancelled) {
        setStats(nextStats);
        setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [towerId, supabase]);

  const extraDataEntries = useMemo(() => {
    if (!tower?.extra_data) return [];

    return Object.entries(tower.extra_data).sort(([a], [b]) =>
      a.localeCompare(b)
    );
  }, [tower]);

  const weightValue = useMemo(() => {
    if (!tower?.extra_data) return null;

    const entry = Object.entries(tower.extra_data).find(([key]) =>
      isWeightKey(key)
    );

    return entry ? entry[1] : null;
  }, [tower]);

  if (loading || !tower || !stats) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="p-8 space-y-6">
      <TowerHeader
        projectId={projectId}
        tower={tower}
        latestDate={stats.latestDate}
      />

      {/* QUICK SUMMARY */}
      <div className="bg-white border rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div>
            <div className="text-xl font-semibold">Tower Overview Summary</div>
            <div className="text-sm text-slate-500 mt-1">
              Complete snapshot of this tower’s current status, field activity and steel delivery.
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Link
              href={`/project/${projectId}/tower/${towerId}/dockets`}
              className="border px-4 py-2 rounded-lg"
            >
              View Dockets
            </Link>
            <Link
              href={`/project/${projectId}/tower/${towerId}/defects`}
              className="border px-4 py-2 rounded-lg"
            >
              View Defects
            </Link>
            <Link
              href={`/project/${projectId}/tower/${towerId}/deliveries`}
              className="border px-4 py-2 rounded-lg"
            >
              View Deliveries
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
          <SummaryCard label="Computed Progress" value={`${stats.computedProgress}%`} />
          <SummaryCard label="Computed Status" value={stats.computedStatus} />
          <SummaryCard label="Daily Dockets" value={String(stats.docketCount)} />
          <SummaryCard label="Total Manhours" value={`${stats.totalHours}h`} />
          <SummaryCard label="Steel Delivery" value={`${stats.deliveryPercent}%`} />
          <SummaryCard label="Last Docket" value={stats.latestDate || "-"} />

          <SummaryCard label="Defects Total" value={String(stats.defectCount)} />
          <SummaryCard label="Defects Open" value={String(stats.openDefectCount)} />
          <SummaryCard label="Modifications" value={String(stats.modificationCount)} />
          <SummaryCard label="Required Bundles" value={String(stats.totalRequiredBundles)} />
          <SummaryCard label="Required Qty" value={String(stats.totalRequiredQty)} />
          <SummaryCard
            label="Tower Weight"
            value={weightValue !== null ? formatValue(weightValue) : "-"}
          />
        </div>
      </div>

      {/* PROGRESS + DELIVERY + DELAYS */}
      <div className="grid xl:grid-cols-3 gap-6">
        <div className="bg-white border rounded-2xl p-6">
          <div className="text-lg font-semibold mb-4">Progress Snapshot</div>

          <div className="space-y-4">
            <MetricRow label="Current Progress" value={`${stats.computedProgress}%`} />
            <MetricRow label="Current Status" value={stats.computedStatus} />
            <MetricRow label="Tower Table Progress" value={`${tower.progress || 0}%`} />
            <MetricRow label="Tower Table Status" value={tower.status || "-"} />

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-500">Progress Bar</span>
                <span className="font-medium">{stats.computedProgress}%</span>
              </div>
              <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-3 bg-blue-600 rounded-full"
                  style={{ width: `${Math.min(stats.computedProgress, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-2xl p-6">
          <div className="text-lg font-semibold mb-4">Steel Delivery Snapshot</div>

          <div className="space-y-4">
            <MetricRow label="Steel Delivery" value={`${stats.deliveryPercent}%`} />
            <MetricRow label="Required Bundles" value={String(stats.totalRequiredBundles)} />
            <MetricRow label="Required Quantity" value={String(stats.totalRequiredQty)} />

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-500">Delivery Bar</span>
                <span className="font-medium">{stats.deliveryPercent}%</span>
              </div>
              <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-3 bg-emerald-600 rounded-full"
                  style={{ width: `${Math.min(stats.deliveryPercent, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-2xl p-6">
          <div className="text-lg font-semibold mb-4">Labour & Delay Snapshot</div>

          <div className="space-y-3">
            <MetricRow label="Total Manhours" value={`${stats.totalHours}h`} />
            <MetricRow label="Weather Delay" value={`${stats.totalWeatherDelay}h`} />
            <MetricRow label="Lightning Delay" value={`${stats.totalLightningDelay}h`} />
            <MetricRow label="Toolbox Delay" value={`${stats.totalToolboxDelay}h`} />
            <MetricRow label="Other Delay" value={`${stats.totalOtherDelay}h`} />
            <MetricRow label="Total Delay Hours" value={`${stats.totalDelayHours}h`} />
          </div>
        </div>
      </div>

      {/* DEFECTS + MODS + ACTIVITY */}
      <div className="grid xl:grid-cols-3 gap-6">
        <div className="bg-white border rounded-2xl p-6">
          <div className="text-lg font-semibold mb-4">Quality Snapshot</div>
          <div className="space-y-3">
            <MetricRow label="Total Defects" value={String(stats.defectCount)} />
            <MetricRow label="Open Defects" value={String(stats.openDefectCount)} />
            <MetricRow label="Modifications Logged" value={String(stats.modificationCount)} />
          </div>
        </div>

        <div className="bg-white border rounded-2xl p-6 xl:col-span-2">
          <div className="text-lg font-semibold mb-4">Latest Activity Snapshot</div>

          <div className="grid md:grid-cols-4 gap-4">
            <SnapshotCard label="Last Docket Date" value={stats.latestDate || "-"} />
            <SnapshotCard label="Daily Dockets Logged" value={String(stats.docketCount)} />
            <SnapshotCard label="Total Manhours" value={`${stats.totalHours}h`} />
            <SnapshotCard label="Steel Delivery" value={`${stats.deliveryPercent}%`} />
          </div>
        </div>
      </div>

      {/* TOWER INFORMATION */}
      <div className="bg-white border rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <div className="text-xl font-semibold">Tower Information</div>
            <div className="text-sm text-slate-500 mt-1">
              Imported tower properties and project-specific fields from the CSV.
            </div>
          </div>

          <div className="text-sm text-slate-500">
            Weight should ideally be imported with the CSV into <span className="font-medium">extra_data</span>.
          </div>
        </div>

        {extraDataEntries.length === 0 ? (
          <div className="text-slate-500">No tower extra data available.</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {extraDataEntries.map(([key, value]) => (
              <div
                key={key}
                className="border rounded-xl p-4 bg-slate-50"
              >
                <div className="text-xs text-slate-500 uppercase tracking-wide">
                  {formatLabel(key)}
                </div>
                <div className="font-semibold mt-1 break-words">
                  {formatValue(value)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border rounded-xl p-4 bg-slate-50">
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function SnapshotCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border rounded-xl p-4 bg-slate-50">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-semibold text-lg mt-1">{value}</div>
    </div>
  );
}

function MetricRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b last:border-b-0 pb-2 last:pb-0">
      <div className="text-slate-500 text-sm">{label}</div>
      <div className="font-semibold text-right">{value}</div>
    </div>
  );
}