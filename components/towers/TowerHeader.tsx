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
  weight?: number | string | null;
  total_weight?: number | string | null;
  tower_weight?: number | string | null;
  structure_weight?: number | string | null;
  extra_data?: Record<string, unknown> | null;
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

type DocketHourRow = {
  id: string;
  raw_manhours?: number | null;
  production_manhours?: number | null;
};

type LabourHourRow = {
  docket_id?: string | null;
  total_hours: number | null;
  production_hours?: number | null;
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

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatNumber(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(decimals);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function readExtraValue(extra: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!extra) return null;

  for (const key of keys) {
    const value = extra[key];

    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }

  return null;
}

function getTowerWeightTonnes(tower: Tower): number {
  const direct =
    tower.weight ??
    tower.total_weight ??
    tower.tower_weight ??
    tower.structure_weight ??
    readExtraValue(tower.extra_data, [
      "Weight",
      "weight",
      "Tower Weight",
      "tower_weight",
      "Structure Weight",
      "structure_weight",
      "Total Weight",
      "total_weight",
      "Mass",
      "mass",
      "Tower Mass",
      "tower_mass",
      "Structure Mass",
      "structure_mass",
    ]);

  const value = safeNumber(direct, 0);

  if (value <= 0) return 0;

  // If the imported value looks like kg, convert to tonnes.
  // Example: 24462 kg becomes 24.462 t.
  if (value > 500) return value / 1000;

  return value;
}

function getProgressColour(progress: number): string {
  if (progress >= 100) return "bg-emerald-500";
  if (progress >= 60) return "bg-blue-500";
  if (progress >= 30) return "bg-amber-500";
  return "bg-slate-400";
}

function getStatusClasses(status: string): string {
  const s = status.toLowerCase();

  if (s === "complete") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (s === "in progress") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export default function TowerHeader({
  projectId,
  tower,
  latestDate,
}: TowerHeaderProps) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const towerId = tower?.id;

  const [progress, setProgress] = useState<number>(0);
  const [assemblyProgress, setAssemblyProgress] = useState<number>(0);
  const [erectionProgress, setErectionProgress] = useState<number>(0);
  const [totalHours, setTotalHours] = useState<number>(0);
  const [productionHours, setProductionHours] = useState<number>(0);
  const [openDefects, setOpenDefects] = useState<number>(0);
  const [deliveryProgress, setDeliveryProgress] = useState<number>(0);
  const [lastDocketDate, setLastDocketDate] = useState<string | null>(latestDate || null);

  const towerLabel =
    tower?.tower_number ||
    tower?.structure_number ||
    tower?.tower_no ||
    tower?.name ||
    "Tower";

  const towerLine = tower?.line || tower?.line_name || "—";

  const towerWeightTonnes = useMemo(() => getTowerWeightTonnes(tower), [tower]);

  const derivedStatus = useMemo(() => {
    if (progress >= 100) return "Complete";
    if (progress > 0) return "In Progress";
    return "Not Started";
  }, [progress]);

  const installedTonnes = useMemo(() => {
    if (towerWeightTonnes <= 0 || progress <= 0) return 0;
    return towerWeightTonnes * (progress / 100);
  }, [towerWeightTonnes, progress]);

  const totalMhPerTonne = useMemo(() => {
    if (installedTonnes <= 0) return null;
    return totalHours / installedTonnes;
  }, [totalHours, installedTonnes]);

  const productionMhPerTonne = useMemo(() => {
    if (installedTonnes <= 0) return null;
    return productionHours / installedTonnes;
  }, [productionHours, installedTonnes]);

  const coverUrl = tower?.cover_photo_path
    ? supabase.storage.from("tower-photos").getPublicUrl(tower.cover_photo_path).data.publicUrl
    : null;

  useEffect(() => {
    if (!towerId) return;

    let cancelled = false;

    async function loadHeaderData() {
      try {
        const [
          docketProgressRowsRes,
          docketRowsRes,
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
            .select("id, docket_date, raw_manhours, production_manhours")
            .eq("tower_id", towerId)
            .order("docket_date", { ascending: false }),

          supabase.from("tower_defects").select("status").eq("tower_id", towerId),

          supabase
            .from("tower_required_bundles")
            .select("bundle_no, qty_required")
            .eq("tower_id", towerId),

          supabase.from("tower_bundle_deliveries").select("id").eq("tower_id", towerId),
        ]);

        if (cancelled) return;

        let nextProgress = 0;
        let nextAssembly = 0;
        let nextErection = 0;

        if (!docketProgressRowsRes.error && docketProgressRowsRes.data) {
          const progressRows = docketProgressRowsRes.data as DocketProgressRow[];

          progressRows.forEach((row) => {
            const assembly = safeNumber(row.assembly_percent, 0);
            const erection = safeNumber(row.erection_percent, 0);
            const weighted = Math.round(assembly * 0.5 + erection * 0.5);

            if (weighted >= nextProgress) {
              nextProgress = weighted;
              nextAssembly = Math.round(assembly);
              nextErection = Math.round(erection);
            }
          });
        }

        let nextTotalHours = 0;
        let nextProductionHours = 0;
        let nextLastDocketDate: string | null = latestDate || null;

        if (!docketRowsRes.error && docketRowsRes.data && docketRowsRes.data.length > 0) {
          const docketRows = docketRowsRes.data as DocketHourRow[];

          nextLastDocketDate = docketRows[0]?.id
            ? ((docketRowsRes.data[0] as unknown as { docket_date?: string | null }).docket_date ||
                latestDate ||
                null)
            : latestDate || null;

          const docketIds = docketRows.map((d) => d.id);

          const docketRawTotal = docketRows.reduce(
            (sum, row) => sum + safeNumber(row.raw_manhours, 0),
            0,
          );

          const docketProductionTotal = docketRows.reduce(
            (sum, row) => sum + safeNumber(row.production_manhours, 0),
            0,
          );

          if (docketRawTotal > 0 || docketProductionTotal > 0) {
            nextTotalHours = docketRawTotal;
            nextProductionHours = docketProductionTotal;
          }

          const labourRes = await supabase
            .from("tower_docket_labour")
            .select("docket_id, total_hours, production_hours")
            .in("docket_id", docketIds);

          if (!cancelled && !labourRes.error && labourRes.data) {
            const labourRows = labourRes.data as LabourHourRow[];

            const labourRawTotal = labourRows.reduce(
              (sum, row) => sum + safeNumber(row.total_hours, 0),
              0,
            );

            const labourProductionTotal = labourRows.reduce(
              (sum, row) => sum + safeNumber(row.production_hours, 0),
              0,
            );

            // Use docket stored totals where available, otherwise fall back to labour rows.
            if (nextTotalHours <= 0) nextTotalHours = labourRawTotal;
            if (nextProductionHours <= 0) nextProductionHours = labourProductionTotal;
          }
        }

        let nextOpenDefects = 0;

        if (!defectsRes.error && defectsRes.data) {
          nextOpenDefects = (defectsRes.data as DefectRow[]).filter((d) => {
            const status = (d.status || "").trim().toLowerCase();
            return status !== "closed" && status !== "complete" && status !== "completed";
          }).length;
        }

        let nextDeliveryProgress = 0;

        const requiredRows = (requiredBundlesRes.data || []) as RequiredBundleRow[];
        const deliveryRows = (deliveriesRes.data || []) as DeliveryRow[];

        if (!requiredBundlesRes.error && requiredRows.length > 0) {
          const totalRequired = requiredRows.reduce(
            (sum, row) => sum + safeNumber(row.qty_required, 0),
            0,
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
                  safeNumber(item.qty_delivered, 0);
              });

              const cappedDelivered = requiredRows.reduce((sum, bundle) => {
                const required = safeNumber(bundle.qty_required, 0);
                const delivered = deliveredByBundle[bundle.bundle_no] || 0;
                return sum + Math.min(required, delivered);
              }, 0);

              nextDeliveryProgress = Math.round((cappedDelivered / totalRequired) * 100);
            }
          }
        }

        if (cancelled) return;

        setProgress(nextProgress);
        setAssemblyProgress(nextAssembly);
        setErectionProgress(nextErection);
        setTotalHours(Math.round(nextTotalHours * 100) / 100);
        setProductionHours(Math.round(nextProductionHours * 100) / 100);
        setOpenDefects(nextOpenDefects);
        setDeliveryProgress(nextDeliveryProgress);
        setLastDocketDate(nextLastDocketDate);
      } catch (error) {
        console.error("Failed to load tower header data:", error);
      }
    }

    void loadHeaderData();

    return () => {
      cancelled = true;
    };
  }, [supabase, towerId, latestDate]);

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px]">
        <div className="p-4 md:p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Tower
                </span>

                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClasses(
                    derivedStatus,
                  )}`}
                >
                  {derivedStatus}
                </span>
              </div>

              <h1 className="mt-1 text-3xl md:text-4xl font-black tracking-tight text-slate-900 truncate">
                {towerLabel}
              </h1>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                <span>Line: {towerLine}</span>
                <span>Last docket: {formatDate(lastDocketDate)}</span>
                <span>
                  Weight:{" "}
                  {towerWeightTonnes > 0 ? `${formatNumber(towerWeightTonnes, 2)} t` : "Not set"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 min-w-full lg:min-w-[360px]">
              <QuickStat label="Overall" value={`${progress}%`} tone="blue" />
              <QuickStat label="Assembly" value={`${assemblyProgress}%`} />
              <QuickStat label="Erection" value={`${erectionProgress}%`} tone="green" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <div className="text-sm font-bold text-slate-900">Tower Progress</div>
                <div className="text-xs text-slate-500">50% assembly + 50% erection</div>
              </div>

              <div className="text-2xl font-black text-slate-900">{progress}%</div>
            </div>

            <div className="h-4 rounded-full bg-white border border-slate-200 overflow-hidden">
              <div
                className={`h-full rounded-full ${getProgressColour(progress)}`}
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <MiniProgress label="Assembly" value={assemblyProgress} colour="bg-blue-500" />
              <MiniProgress label="Erection" value={erectionProgress} colour="bg-emerald-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2 md:gap-3">
            <MetricCard label="Total Hrs" value={`${formatNumber(totalHours, 1)}h`} />
            <MetricCard
              label="Prod Hrs"
              value={`${formatNumber(productionHours, 1)}h`}
              tone="green"
            />
            <MetricCard
              label="Total MH/t"
              value={totalMhPerTonne === null ? "—" : formatNumber(totalMhPerTonne, 2)}
              hint={installedTonnes > 0 ? `${formatNumber(installedTonnes, 2)}t installed` : "Needs weight/progress"}
            />
            <MetricCard
              label="Prod MH/t"
              value={productionMhPerTonne === null ? "—" : formatNumber(productionMhPerTonne, 2)}
              tone="green"
              hint={installedTonnes > 0 ? `${formatNumber(installedTonnes, 2)}t installed` : "Needs weight/progress"}
            />
            <MetricCard label="Defects" value={openDefects} tone={openDefects > 0 ? "amber" : "slate"} />
            <MetricCard label="Steel" value={`${deliveryProgress}%`} />
          </div>

          <div className="flex gap-2 flex-wrap">
            <Link
              href={`/project/${projectId}/tower/${towerId}/dockets/new`}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Add Daily Docket
            </Link>

            <Link
              href={`/project/${projectId}/tower/${towerId}/workpack`}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Open Workpack
            </Link>

            <Link
              href={`/project/${projectId}/tower/${towerId}/materials`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Materials
            </Link>

            <Link
              href={`/project/${projectId}/tower/${towerId}/photos`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Upload Photo
            </Link>
          </div>
        </div>

        <div className="border-t xl:border-t-0 xl:border-l border-slate-200 bg-slate-100">
          {coverUrl ? (
            <div className="relative h-56 xl:h-full min-h-[260px]">
              <img
                src={coverUrl}
                alt={`${towerLabel} cover`}
                className="absolute inset-0 h-full w-full object-cover object-center"
              />

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                <div className="text-white">
                  <div className="text-xs uppercase tracking-wide opacity-80">Cover Photo</div>
                  <div className="font-bold truncate">{towerLabel}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-56 xl:h-full min-h-[260px] flex items-center justify-center p-6 text-center">
              <div>
                <div className="mx-auto h-16 w-16 rounded-3xl bg-white border border-slate-200 flex items-center justify-center text-2xl">
                  🗼
                </div>
                <div className="mt-3 font-bold text-slate-800">No cover photo</div>
                <div className="mt-1 text-sm text-slate-500">
                  Upload a photo to make this tower header easier to identify.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickStat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  tone?: "slate" | "blue" | "green";
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-900",
    blue: "bg-blue-100 text-blue-800",
    green: "bg-emerald-100 text-emerald-800",
  };

  return (
    <div className={`rounded-2xl px-3 py-3 text-center min-w-0 ${tones[tone]}`}>
      <div className="text-[11px] opacity-75 truncate">{label}</div>
      <div className="font-black text-lg md:text-xl mt-1 truncate">{value}</div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "slate" | "green" | "amber";
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-900",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
  };

  return (
    <div className={`rounded-2xl px-3 py-3 min-w-0 ${tones[tone]}`}>
      <div className="text-[11px] opacity-75 truncate">{label}</div>
      <div className="font-black text-base md:text-lg mt-1 truncate">{value}</div>
      {hint && <div className="text-[10px] opacity-70 mt-1 truncate">{hint}</div>}
    </div>
  );
}

function MiniProgress({
  label,
  value,
  colour,
}: {
  label: string;
  value: number;
  colour: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span className="font-semibold">{label}</span>
        <span>{clamped}%</span>
      </div>

      <div className="h-2.5 rounded-full bg-white border border-slate-200 overflow-hidden">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}