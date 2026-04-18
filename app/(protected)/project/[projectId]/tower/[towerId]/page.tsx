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
  closedDefectCount: number;
  modificationCount: number;
  totalRequiredBundles: number;
  totalRequiredQty: number;
  deliveredQty: number;
  outstandingQty: number;
  deliveryPercent: number;
  computedProgress: number;
  remainingProgress: number;
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

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
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
      const remainingProgress = Math.max(0, 100 - computedProgress);
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

      const deliveredQty = requiredBundles.reduce((sum, bundle) => {
        const required = Number(bundle.qty_required || 0);
        const delivered = deliveredByBundle[bundle.bundle_no] || 0;
        return sum + Math.min(required, delivered);
      }, 0);

      const outstandingQty = Math.max(0, totalRequiredQty - deliveredQty);

      const deliveryPercent =
        totalRequiredQty > 0
          ? Math.round((deliveredQty / totalRequiredQty) * 100)
          : 0;

      const openDefectCount = getOpenDefectCount(defects);
      const closedDefectCount = Math.max(0, defects.length - openDefectCount);

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
        openDefectCount,
        closedDefectCount,
        modificationCount: modifications.length,
        totalRequiredBundles,
        totalRequiredQty,
        deliveredQty,
        outstandingQty,
        deliveryPercent,
        computedProgress,
        remainingProgress,
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

      <div className="bg-white border rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div>
            <div className="text-2xl font-bold">Tower Dashboard</div>
            <div className="text-sm text-slate-500 mt-1">
              Power-BI style overview of progress, steel, labour, delays, defects and tower metadata.
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Link
              href={`/project/${projectId}/tower/${towerId}/dockets`}
              className="border px-4 py-2 rounded-lg hover:bg-slate-50"
            >
              View Dockets
            </Link>
            <Link
              href={`/project/${projectId}/tower/${towerId}/defects`}
              className="border px-4 py-2 rounded-lg hover:bg-slate-50"
            >
              View Defects
            </Link>
            <Link
              href={`/project/${projectId}/tower/${towerId}/deliveries`}
              className="border px-4 py-2 rounded-lg hover:bg-slate-50"
            >
              View Deliveries
            </Link>
            <Link
              href={`/project/${projectId}/tower/${towerId}/modifications`}
              className="border px-4 py-2 rounded-lg hover:bg-slate-50"
            >
              View Mods
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
          <KpiCard
            label="Progress"
            value={`${stats.computedProgress}%`}
            tone="blue"
            subtext={stats.computedStatus}
          />
          <KpiCard
            label="Steel Delivery"
            value={`${stats.deliveryPercent}%`}
            tone="green"
            subtext={`${stats.deliveredQty}/${stats.totalRequiredQty}`}
          />
          <KpiCard
            label="Total Hours"
            value={`${stats.totalHours}h`}
            tone="blue"
            subtext={`${stats.docketCount} dockets`}
          />
          <KpiCard
            label="Open Defects"
            value={String(stats.openDefectCount)}
            tone={stats.openDefectCount > 0 ? "red" : "green"}
            subtext={`${stats.defectCount} total`}
          />
          <KpiCard
            label="Mods"
            value={String(stats.modificationCount)}
            tone="slate"
            subtext="Logged items"
          />
          <KpiCard
            label="Delay Hours"
            value={`${stats.totalDelayHours}h`}
            tone={stats.totalDelayHours > 0 ? "orange" : "green"}
            subtext="All causes"
          />
          <KpiCard
            label="Last Docket"
            value={stats.latestDate || "-"}
            tone="slate"
            subtext="Latest activity"
          />
          <KpiCard
            label="Tower Weight"
            value={weightValue !== null ? formatValue(weightValue) : "-"}
            tone="slate"
            subtext="From CSV import"
          />
        </div>
      </div>

      <div className="grid xl:grid-cols-3 gap-6">
        <ChartCard
          title="Overall Progress"
          subtitle="Completed vs remaining"
        >
          <div className="flex flex-col items-center gap-4">
            <DonutChart
              percent={stats.computedProgress}
              color="#2563eb"
              remainderColor="#e2e8f0"
              centerTop={`${stats.computedProgress}%`}
              centerBottom="Complete"
            />

            <div className="w-full space-y-3">
              <LegendRow label="Completed" value={`${stats.computedProgress}%`} colorClass="bg-blue-600" />
              <LegendRow label="Remaining" value={`${stats.remainingProgress}%`} colorClass="bg-slate-300" />
              <ProgressBar
                label="Tower Progress"
                value={stats.computedProgress}
                barClass="bg-blue-600"
              />
            </div>
          </div>
        </ChartCard>

        <ChartCard
          title="Steel Delivery"
          subtitle="Delivered vs outstanding"
        >
          <div className="flex flex-col items-center gap-4">
            <DonutChart
              percent={stats.deliveryPercent}
              color="#16a34a"
              remainderColor="#e2e8f0"
              centerTop={`${stats.deliveryPercent}%`}
              centerBottom="Delivered"
            />

            <div className="w-full space-y-3">
              <LegendRow
                label="Delivered Qty"
                value={String(stats.deliveredQty)}
                colorClass="bg-green-600"
              />
              <LegendRow
                label="Outstanding Qty"
                value={String(stats.outstandingQty)}
                colorClass="bg-slate-300"
              />
              <ProgressBar
                label="Steel Completion"
                value={stats.deliveryPercent}
                barClass="bg-green-600"
              />
            </div>
          </div>
        </ChartCard>

        <ChartCard
          title="Defects Status"
          subtitle="Open vs closed"
        >
          <div className="flex flex-col items-center gap-4">
            <DonutChart
              percent={
                stats.defectCount > 0
                  ? Math.round((stats.closedDefectCount / stats.defectCount) * 100)
                  : 100
              }
              color="#16a34a"
              remainderColor="#dc2626"
              centerTop={String(stats.defectCount)}
              centerBottom="Total"
            />

            <div className="w-full space-y-3">
              <LegendRow
                label="Closed"
                value={String(stats.closedDefectCount)}
                colorClass="bg-green-600"
              />
              <LegendRow
                label="Open"
                value={String(stats.openDefectCount)}
                colorClass="bg-red-600"
              />
              <div className="grid grid-cols-2 gap-3">
                <SmallStat label="Open Rate" value={`${stats.defectCount > 0 ? Math.round((stats.openDefectCount / stats.defectCount) * 100) : 0}%`} tone="red" />
                <SmallStat label="Closed Rate" value={`${stats.defectCount > 0 ? Math.round((stats.closedDefectCount / stats.defectCount) * 100) : 0}%`} tone="green" />
              </div>
            </div>
          </div>
        </ChartCard>
      </div>

      <div className="grid xl:grid-cols-3 gap-6">
        <PanelCard title="Operations Summary" subtitle="Field productivity and logged activity">
          <div className="space-y-3">
            <MetricRow label="Current Status" value={stats.computedStatus} tone={stats.computedStatus === "Complete" ? "green" : stats.computedStatus === "In Progress" ? "blue" : "slate"} />
            <MetricRow label="Daily Dockets Logged" value={String(stats.docketCount)} />
            <MetricRow label="Total Manhours" value={`${stats.totalHours}h`} tone="blue" />
            <MetricRow label="Last Docket Date" value={stats.latestDate || "-"} />
            <MetricRow label="Modifications Logged" value={String(stats.modificationCount)} tone="slate" />
          </div>
        </PanelCard>

        <PanelCard title="Delay Breakdown" subtitle="Highlighting productivity losses">
          <div className="space-y-4">
            <DelayBar
              label="Weather"
              value={stats.totalWeatherDelay}
              total={stats.totalDelayHours}
              barClass="bg-orange-500"
            />
            <DelayBar
              label="Lightning"
              value={stats.totalLightningDelay}
              total={stats.totalDelayHours}
              barClass="bg-red-500"
            />
            <DelayBar
              label="Toolbox"
              value={stats.totalToolboxDelay}
              total={stats.totalDelayHours}
              barClass="bg-amber-500"
            />
            <DelayBar
              label="Other"
              value={stats.totalOtherDelay}
              total={stats.totalDelayHours}
              barClass="bg-slate-500"
            />
            <div className="pt-2 border-t">
              <MetricRow label="Total Delay Hours" value={`${stats.totalDelayHours}h`} tone={stats.totalDelayHours > 0 ? "orange" : "green"} />
            </div>
          </div>
        </PanelCard>

        <PanelCard title="Quality & Steel Snapshot" subtitle="Quick action-needed overview">
          <div className="grid grid-cols-2 gap-3">
            <SmallStat label="Open Defects" value={String(stats.openDefectCount)} tone={stats.openDefectCount > 0 ? "red" : "green"} />
            <SmallStat label="Total Defects" value={String(stats.defectCount)} tone="slate" />
            <SmallStat label="Bundles" value={String(stats.totalRequiredBundles)} tone="blue" />
            <SmallStat label="Required Qty" value={String(stats.totalRequiredQty)} tone="slate" />
            <SmallStat label="Delivered Qty" value={String(stats.deliveredQty)} tone="green" />
            <SmallStat label="Outstanding Qty" value={String(stats.outstandingQty)} tone={stats.outstandingQty > 0 ? "orange" : "green"} />
          </div>
        </PanelCard>
      </div>

      <div className="bg-white border rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <div className="text-xl font-semibold">Tower Information</div>
            <div className="text-sm text-slate-500 mt-1">
              Imported tower properties and project-specific fields from the CSV.
            </div>
          </div>

          <div className="text-sm text-slate-500">
            Weight should ideally be imported with the CSV into{" "}
            <span className="font-medium">extra_data</span>.
          </div>
        </div>

        {extraDataEntries.length === 0 ? (
          <div className="text-slate-500">No tower extra data available.</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {extraDataEntries.map(([key, value]) => (
              <InfoTile
                key={key}
                label={formatLabel(key)}
                value={formatValue(value)}
                tone={isWeightKey(key) ? "blue" : "slate"}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  subtext,
  tone,
}: {
  label: string;
  value: string;
  subtext?: string;
  tone: "blue" | "green" | "orange" | "red" | "slate";
}) {
  const toneClasses: Record<typeof tone, string> = {
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    green: "border-green-200 bg-green-50 text-green-900",
    orange: "border-orange-200 bg-orange-50 text-orange-900",
    red: "border-red-200 bg-red-50 text-red-900",
    slate: "border-slate-200 bg-slate-50 text-slate-900",
  };

  const topBarClasses: Record<typeof tone, string> = {
    blue: "bg-blue-600",
    green: "bg-green-600",
    orange: "bg-orange-500",
    red: "bg-red-600",
    slate: "bg-slate-500",
  };

  return (
    <div className={`border rounded-2xl overflow-hidden ${toneClasses[tone]}`}>
      <div className={`h-1.5 ${topBarClasses[tone]}`} />
      <div className="p-4">
        <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
        <div className="text-2xl font-bold mt-1 break-words">{value}</div>
        <div className="text-xs mt-1 opacity-70">{subtext || "\u00A0"}</div>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border rounded-2xl p-6">
      <div className="mb-5">
        <div className="text-lg font-semibold">{title}</div>
        <div className="text-sm text-slate-500 mt-1">{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function PanelCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border rounded-2xl p-6">
      <div className="mb-4">
        <div className="text-lg font-semibold">{title}</div>
        <div className="text-sm text-slate-500 mt-1">{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function DonutChart({
  percent,
  color,
  remainderColor,
  centerTop,
  centerBottom,
}: {
  percent: number;
  color: string;
  remainderColor: string;
  centerTop: string;
  centerBottom: string;
}) {
  const safePercent = clampPercent(percent);

  return (
    <div
      className="relative h-44 w-44 rounded-full"
      style={{
        background: `conic-gradient(${color} 0% ${safePercent}%, ${remainderColor} ${safePercent}% 100%)`,
      }}
    >
      <div className="absolute inset-5 rounded-full bg-white border flex flex-col items-center justify-center text-center">
        <div className="text-2xl font-bold">{centerTop}</div>
        <div className="text-xs text-slate-500 mt-1">{centerBottom}</div>
      </div>
    </div>
  );
}

function LegendRow({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: string;
  colorClass: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`h-3 w-3 rounded-full ${colorClass}`} />
        <span className="text-sm text-slate-600">{label}</span>
      </div>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function ProgressBar({
  label,
  value,
  barClass,
}: {
  label: string;
  value: number;
  barClass: string;
}) {
  const safeValue = clampPercent(value);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm mb-1">
        <span className="text-slate-500">{label}</span>
        <span className="font-medium">{safeValue}%</span>
      </div>
      <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
        <div
          className={`h-3 rounded-full ${barClass}`}
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}

function DelayBar({
  label,
  value,
  total,
  barClass,
}: {
  label: string;
  value: number;
  total: number;
  barClass: string;
}) {
  const percent = total > 0 ? (value / total) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium">{value}h</span>
      </div>
      <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
        <div
          className={`h-3 rounded-full ${barClass}`}
          style={{ width: `${clampPercent(percent)}%` }}
        />
      </div>
    </div>
  );
}

function SmallStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "green" | "orange" | "red" | "slate";
}) {
  const classes: Record<typeof tone, string> = {
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    green: "border-green-200 bg-green-50 text-green-900",
    orange: "border-orange-200 bg-orange-50 text-orange-900",
    red: "border-red-200 bg-red-50 text-red-900",
    slate: "border-slate-200 bg-slate-50 text-slate-900",
  };

  return (
    <div className={`border rounded-xl p-4 ${classes[tone]}`}>
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}

function InfoTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "slate";
}) {
  const classes =
    tone === "blue"
      ? "border-blue-200 bg-blue-50"
      : "border-slate-200 bg-slate-50";

  return (
    <div className={`border rounded-xl p-4 ${classes}`}>
      <div className="text-xs text-slate-500 uppercase tracking-wide">
        {label}
      </div>
      <div className="font-semibold mt-1 break-words">{value}</div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "blue" | "green" | "orange" | "red" | "slate";
}) {
  const valueClasses: Record<typeof tone, string> = {
    blue: "text-blue-700",
    green: "text-green-700",
    orange: "text-orange-700",
    red: "text-red-700",
    slate: "text-slate-900",
  };

  return (
    <div className="flex items-center justify-between gap-4 border-b last:border-b-0 pb-2 last:pb-0">
      <div className="text-slate-500 text-sm">{label}</div>
      <div className={`font-semibold text-right ${valueClasses[tone]}`}>
        {value}
      </div>
    </div>
  );
}