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
  extra_data?: Record<string, unknown> | null;
};

type Props = {
  projectId: string;
  tower: Tower;
  latestDate?: string | null;
};

type DocketRow = {
  id: string;
  docket_date?: string | null;
  assembly_percent?: number | null;
  erection_percent?: number | null;
  raw_manhours?: number | null;
  production_manhours?: number | null;
};

type LabourRow = {
  docket_id?: string | null;
  total_hours?: number | null;
  production_hours?: number | null;
};

type DefectRow = {
  status?: string | null;
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
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const cleaned = String(value)
    .toLowerCase()
    .replace(/,/g, "")
    .replace("tonnes", "")
    .replace("tonne", "")
    .replace("tons", "")
    .replace("ton", "")
    .replace("kgs", "")
    .replace("kg", "")
    .replace("t", "")
    .trim();

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

function formatNumber(value: number | null, decimals = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
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

function extractNumericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const str = String(value).trim();
  const cleaned = str.replace(/,/g, "");
  const match = cleaned.match(/-?\d+(\.\d+)?/);

  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getTowerWeightFromExtraData(extraData?: Record<string, unknown> | null) {
  if (!extraData) return null;

  const entries = Object.entries(extraData);

  const exactTowerWeightEntry = entries.find(([key]) => {
    const k = key.trim().toLowerCase();
    return (
      k === "tower weight" ||
      k === "tower weight (t)" ||
      k === "tower_weight" ||
      k === "towerweight" ||
      k === "structure total weights" ||
      k === "structure total weight"
    );
  });

  if (exactTowerWeightEntry) {
    return extractNumericValue(exactTowerWeightEntry[1]);
  }

  const towerWeightLikeEntry = entries.find(([key]) => {
    const k = key.trim().toLowerCase();
    return (k.includes("tower") || k.includes("structure")) && k.includes("weight");
  });

  if (towerWeightLikeEntry) {
    return extractNumericValue(towerWeightLikeEntry[1]);
  }

  const genericWeightEntry = entries.find(([key]) =>
    key.trim().toLowerCase().includes("weight"),
  );

  if (genericWeightEntry) {
    return extractNumericValue(genericWeightEntry[1]);
  }

  const massEntry = entries.find(([key]) => key.trim().toLowerCase().includes("mass"));

  if (massEntry) {
    return extractNumericValue(massEntry[1]);
  }

  return null;
}

function statusClass(status: string) {
  const s = status.toLowerCase();

  if (s === "complete") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (s === "in progress") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function calcOverall(assembly: number, erection: number) {
  return Math.round(assembly * 0.5 + erection * 0.5);
}

export default function TowerHeader({ projectId, tower, latestDate }: Props) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const towerId = tower.id;

  const [assemblyProgress, setAssemblyProgress] = useState(0);
  const [erectionProgress, setErectionProgress] = useState(0);
  const [overallProgress, setOverallProgress] = useState(0);
  const [totalHours, setTotalHours] = useState(0);
  const [productionHours, setProductionHours] = useState(0);
  const [openDefects, setOpenDefects] = useState(0);
  const [deliveryProgress, setDeliveryProgress] = useState(0);
  const [lastDocketDate, setLastDocketDate] = useState<string | null>(latestDate || null);

  const towerLabel =
    tower.tower_number ||
    tower.structure_number ||
    tower.tower_no ||
    tower.name ||
    "Tower";

  const towerLine = tower.line || tower.line_name || "—";

  const towerWeightTonnes = useMemo(() => {
    return getTowerWeightFromExtraData(tower?.extra_data);
  }, [tower?.extra_data]);

  const status = useMemo(() => {
    if (overallProgress >= 100) return "Complete";
    if (overallProgress > 0) return "In Progress";
    return tower.status || "Not Started";
  }, [overallProgress, tower.status]);

  const completedTonnes = useMemo(() => {
    if (towerWeightTonnes === null) return null;
    return towerWeightTonnes * (overallProgress / 100);
  }, [towerWeightTonnes, overallProgress]);

  const totalMhPerTonne = useMemo(() => {
    if (!completedTonnes || completedTonnes <= 0) return null;
    return totalHours / completedTonnes;
  }, [totalHours, completedTonnes]);

  const productionMhPerTonne = useMemo(() => {
    if (!completedTonnes || completedTonnes <= 0) return null;
    return productionHours / completedTonnes;
  }, [productionHours, completedTonnes]);

  const coverUrl = tower.cover_photo_path
    ? supabase.storage.from("tower-photos").getPublicUrl(tower.cover_photo_path).data.publicUrl
    : null;

  useEffect(() => {
    if (!towerId) return;

    let cancelled = false;

    async function loadHeaderData() {
      const [docketsRes, defectsRes, requiredBundlesRes, deliveriesRes] = await Promise.all([
        supabase
          .from("tower_daily_dockets")
          .select("id,docket_date,assembly_percent,erection_percent,raw_manhours,production_manhours")
          .eq("tower_id", towerId)
          .order("docket_date", { ascending: false }),

        supabase.from("tower_defects").select("status").eq("tower_id", towerId),

        supabase
          .from("tower_required_bundles")
          .select("bundle_no,qty_required")
          .eq("tower_id", towerId),

        supabase.from("tower_bundle_deliveries").select("id").eq("tower_id", towerId),
      ]);

      if (cancelled) return;

      const dockets = (docketsRes.data || []) as DocketRow[];

      let bestOverall = 0;
      let bestAssembly = 0;
      let bestErection = 0;

      dockets.forEach((docket) => {
        const assembly = safeNumber(docket.assembly_percent, 0);
        const erection = safeNumber(docket.erection_percent, 0);
        const overall = calcOverall(assembly, erection);

        if (overall >= bestOverall) {
          bestOverall = overall;
          bestAssembly = Math.round(assembly);
          bestErection = Math.round(erection);
        }
      });

      const docketRawTotal = dockets.reduce(
        (sum, docket) => sum + safeNumber(docket.raw_manhours, 0),
        0,
      );

      const docketProductionTotal = dockets.reduce(
        (sum, docket) => sum + safeNumber(docket.production_manhours, 0),
        0,
      );

      let nextTotalHours = docketRawTotal;
      let nextProductionHours = docketProductionTotal;

      if (dockets.length > 0) {
        setLastDocketDate(dockets[0]?.docket_date || latestDate || null);

        const docketIds = dockets.map((docket) => docket.id);

        const labourRes = await supabase
          .from("tower_docket_labour")
          .select("docket_id,total_hours,production_hours")
          .in("docket_id", docketIds);

        if (!cancelled && !labourRes.error) {
          const labourRows = (labourRes.data || []) as LabourRow[];

          const labourTotal = labourRows.reduce(
            (sum, row) => sum + safeNumber(row.total_hours, 0),
            0,
          );

          const labourProduction = labourRows.reduce(
            (sum, row) => sum + safeNumber(row.production_hours, 0),
            0,
          );

          if (nextTotalHours <= 0) nextTotalHours = labourTotal;
          if (nextProductionHours <= 0) nextProductionHours = labourProduction;
        }
      }

      const defects = (defectsRes.data || []) as DefectRow[];
      const nextOpenDefects = defects.filter((defect) => {
        const s = (defect.status || "").toLowerCase().trim();
        return s !== "closed" && s !== "complete" && s !== "completed";
      }).length;

      let nextDeliveryProgress = 0;

      const requiredRows = (requiredBundlesRes.data || []) as RequiredBundleRow[];
      const deliveryRows = (deliveriesRes.data || []) as DeliveryRow[];

      const totalRequired = requiredRows.reduce(
        (sum, row) => sum + safeNumber(row.qty_required, 0),
        0,
      );

      if (totalRequired > 0 && deliveryRows.length > 0) {
        const deliveryIds = deliveryRows.map((row) => row.id);

        const itemsRes = await supabase
          .from("tower_bundle_delivery_items")
          .select("delivery_id,bundle_no,qty_delivered")
          .in("delivery_id", deliveryIds);

        if (!cancelled && !itemsRes.error) {
          const deliveredByBundle: Record<string, number> = {};

          ((itemsRes.data || []) as DeliveryItemRow[]).forEach((item) => {
            deliveredByBundle[item.bundle_no] =
              (deliveredByBundle[item.bundle_no] || 0) +
              safeNumber(item.qty_delivered, 0);
          });

          const deliveredCapped = requiredRows.reduce((sum, bundle) => {
            const required = safeNumber(bundle.qty_required, 0);
            const delivered = deliveredByBundle[bundle.bundle_no] || 0;
            return sum + Math.min(required, delivered);
          }, 0);

          nextDeliveryProgress = Math.round((deliveredCapped / totalRequired) * 100);
        }
      }

      if (cancelled) return;

      setAssemblyProgress(bestAssembly);
      setErectionProgress(bestErection);
      setOverallProgress(bestOverall);
      setTotalHours(Math.round(nextTotalHours * 100) / 100);
      setProductionHours(Math.round(nextProductionHours * 100) / 100);
      setOpenDefects(nextOpenDefects);
      setDeliveryProgress(nextDeliveryProgress);
    }

    void loadHeaderData();

    return () => {
      cancelled = true;
    };
  }, [supabase, towerId, latestDate]);

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px]">
        <div className="p-4 md:p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Tower
                </span>

                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(
                    status,
                  )}`}
                >
                  {status}
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
                  {towerWeightTonnes !== null && towerWeightTonnes > 0
                    ? `${formatNumber(towerWeightTonnes, 2)} t`
                    : "Not set"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 min-w-full lg:min-w-[360px]">
              <QuickStat label="Overall" value={`${overallProgress}%`} tone="blue" />
              <QuickStat label="Assembly" value={`${assemblyProgress}%`} />
              <QuickStat label="Erection" value={`${erectionProgress}%`} tone="green" />
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
              hint={
                completedTonnes !== null
                  ? `${formatNumber(totalHours, 1)}h / ${formatNumber(completedTonnes, 2)}t`
                  : "Tower weight not found"
              }
            />
            <MetricCard
              label="Prod MH/t"
              value={productionMhPerTonne === null ? "—" : formatNumber(productionMhPerTonne, 2)}
              tone="green"
              hint={
                completedTonnes !== null
                  ? `${formatNumber(productionHours, 1)}h / ${formatNumber(completedTonnes, 2)}t`
                  : "Tower weight not found"
              }
            />
            <MetricCard
              label="Open Defects"
              value={openDefects}
              tone={openDefects > 0 ? "amber" : "slate"}
            />
            <MetricCard label="Steel Delivery" value={`${deliveryProgress}%`} />
          </div>

          <div className="flex gap-2 flex-wrap">
            <HeaderLink href={`/project/${projectId}/tower/${towerId}`} label="Overview" />
            <HeaderLink href={`/project/${projectId}/tower/${towerId}/dockets`} label="Daily Dockets" />
            <HeaderLink href={`/project/${projectId}/tower/${towerId}/workpack`} label="Workpack" />
            <HeaderLink href={`/project/${projectId}/tower/${towerId}/deliveries`} label="Deliveries" />
            <HeaderLink href={`/project/${projectId}/tower/${towerId}/materials`} label="Materials" />
            <HeaderLink href={`/project/${projectId}/tower/${towerId}/defects`} label="Defects" />
            <HeaderLink href={`/project/${projectId}/tower/${towerId}/modifications`} label="Modifications" />
            <HeaderLink href={`/project/${projectId}/tower/${towerId}/photos`} label="Photos" />
          </div>
        </div>

        <div className="border-t xl:border-t-0 xl:border-l border-slate-200 bg-slate-100">
          {coverUrl ? (
            <div className="relative h-52 xl:h-full min-h-[240px]">
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
            <div className="h-52 xl:h-full min-h-[240px] flex items-center justify-center p-6 text-center">
              <div>
                <div className="mx-auto h-16 w-16 rounded-3xl bg-white border border-slate-200 flex items-center justify-center text-2xl">
                  🗼
                </div>
                <div className="mt-3 font-bold text-slate-800">No cover photo</div>
                <div className="mt-1 text-sm text-slate-500">
                  Upload a tower photo to make this easier to identify.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HeaderLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
    >
      {label}
    </Link>
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