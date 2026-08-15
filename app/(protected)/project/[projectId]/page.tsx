"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";
import { getUserRole } from "@/lib/roles";

type Project = {
  id: string;
  name: string;
  status?: string | null;
  client?: string | null;
  client_code?: string | null;
  project_year?: number | null;
  project_sequence?: number | null;
  project_number?: string | null;
  location?: string | null;
  total_towers?: number | null;
  sharepoint_url?: string | null;
  sharepoint_tender_url?: string | null;
};

type Tower = {
  id: string;
  project_id: string;
  name?: string | null;
  line?: string | null;
  status?: string | null;
  progress?: number | null;
  tower_number?: string | null;
  structure_number?: string | null;
  tower_no?: string | null;
  extra_data?: Record<string, unknown> | null;
};

type DocketRow = {
  id: string;
  tower_id?: string | null;
  project_id?: string | null;
  docket_date?: string | null;
  assembly_percent?: number | null;
  erection_percent?: number | null;
  crew?: string | null;
  leading_hand?: string | null;
  raw_manhours?: number | null;
  production_manhours?: number | null;
};

type LabourRow = {
  docket_id: string;
  total_hours?: number | null;
  production_hours?: number | null;
};

type DefectRow = {
  id: string;
  tower_id?: string | null;
  status?: string | null;
};

type DeliveryRow = {
  id: string;
  tower_id?: string | null;
  [key: string]: unknown;
};

type DeliveryItemRow = {
  delivery_id?: string | null;
  bundle_no?: string | null;
  qty_delivered?: number | null;
  quantity_delivered?: number | null;
  delivered_qty?: number | null;
  qty?: number | null;
  [key: string]: unknown;
};

type MaterialBundleRow = {
  id?: string;
  tower_id?: string | null;
  bundle_no?: string | null;
  qty_required?: number | null;
  required_qty?: number | null;
  total_weight?: number | null;
  [key: string]: unknown;
};

type TowerDeliverySummary = Tower & {
  requiredQty: number;
  deliveredQty: number;
  outstandingQty: number;
  deliveryPercent: number;
};

type TowerProductionSummary = Tower & {
  computedProgress: number;
  computedWeight: number | null;
  completedTonnes: number | null;
  manhours: number;
  productionManhours: number;
  rawMhPerTonne: number | null;
  productionMhPerTonne: number | null;
};

type CrewProductionSummary = {
  crewName: string;
  docketCount: number;
  totalHours: number;
  productionHours: number;
  productionTonnes: number;
  rawMhPerTonne: number | null;
  mhPerTonne: number | null;
  tonnesPerHour: number | null;
  towersTouched: number;
  completedTowers: number;
  towerNames: string[];
  lastDocketDate: string | null;
};

type ForecastRow = {
  towerId: string;
  towerName: string;
  towerType: string;
  progress: number;
  weight: number | null;
  remainingTonnes: number | null;
  benchmarkLabel: string;
  benchmarkMhPerTonne: number | null;
  forecastRawHours: number | null;
  forecastDays: number | null;
  benchmarkDailyRawHours: number | null;
  oldProjectAverageRawHours: number | null;
  oldProjectAverageDays: number | null;
  confidence: "High" | "Medium" | "Low";
};

type TowerTypeBenchmark = {
  typeName: string;
  towerCount: number;
  docketCount: number;
  rawHours: number;
  productionHours: number;
  productionTonnes: number;
  rawMhPerTonne: number | null;
  productionMhPerTonne: number | null;
  dailyRawHours: number | null;
};

type DocketLookupRow = {
  docket: DocketRow;
  tower: TowerProductionSummary | null;
  rawHours: number;
  productionHours: number;
  progress: number;
};

type TrendRow = {
  date: string;
  rawHours: number;
  productionHours: number;
  productionTonnes: number;
  rawMhPerTonne: number | null;
  productionMhPerTonne: number | null;
  docketCount: number;
};

type QuickActionType = "docket" | "delivery" | "materials" | "docket_lookup" | null;
type AnalyticsView = "tower_performance" | "crew_performance" | "mh_per_tonne" | "production_mh_per_tonne" | "completed_towers";
type SortDirection = "best" | "worst";
type RowsToShow = "10" | "25" | "50" | "all";
type TrendMetric = "both" | "raw" | "production";
type UserRole = "admin" | "editor" | "viewer" | string | null;

type ProjectStats = {
  totalTowers: number;
  towersComplete: number;
  towersInProgress: number;
  towersNotStarted: number;
  deliveryTowersInProgress: number;
  totalDockets: number;
  totalManhours: number;
  productionManhours: number;
  totalTowerWeight: number | null;
  completedTonnes: number | null;
  manhoursPerTonne: number | null;
  productionManhoursPerTonne: number | null;
  overallProgressPercent: number;
  openDefects: number;
  totalDefects: number;
  totalDeliveries: number;
  totalRequiredQty: number;
  deliveredQty: number;
  outstandingQty: number;
  deliveryPercent: number;
  latestDocketDate: string | null;
};

function buildProjectNumber(
  clientCode: string,
  year: string | number,
  sequence: string | number,
) {
  const cleanClient = String(clientCode || "").trim().toUpperCase();
  const cleanYear = String(year || "").trim().slice(-2);
  const sequenceNumber = Number(sequence || 1);

  if (
    !cleanClient ||
    !cleanYear ||
    !Number.isInteger(sequenceNumber) ||
    sequenceNumber < 1
  ) {
    return "";
  }

  return `P-${cleanClient}-${cleanYear}-${String(sequenceNumber).padStart(3, "0")}`;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeString(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function formatDecimal(value: number | null, decimals = 2) {
  if (value === null || Number.isNaN(value)) return "-";
  return value.toFixed(decimals);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

function extractNumericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const str = String(value).trim();
  if (!str) return null;

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

  if (exactTowerWeightEntry) return extractNumericValue(exactTowerWeightEntry[1]);

  const towerWeightLikeEntry = entries.find(([key]) => {
    const k = key.trim().toLowerCase();
    return (k.includes("tower") || k.includes("structure")) && k.includes("weight");
  });

  if (towerWeightLikeEntry) return extractNumericValue(towerWeightLikeEntry[1]);

  const genericWeightEntry = entries.find(([key]) => key.trim().toLowerCase().includes("weight"));
  if (genericWeightEntry) return extractNumericValue(genericWeightEntry[1]);

  return null;
}

function getTowerTypeFromExtraData(tower: Tower) {
  const extraData = tower.extra_data;
  const displayName = getTowerDisplayName(tower);

  if (extraData) {
    const entries = Object.entries(extraData);
    const exactTypeEntry = entries.find(([key]) => {
      const k = key.trim().toLowerCase();
      return (
        k === "tower type" ||
        k === "tower_type" ||
        k === "structure type" ||
        k === "structure_type" ||
        k === "type" ||
        k === "tower model" ||
        k === "tower_model"
      );
    });

    if (exactTypeEntry) {
      const value = safeString(exactTypeEntry[1]).trim();
      if (value) return value.toUpperCase();
    }

    const typeLikeEntry = entries.find(([key]) => {
      const k = key.trim().toLowerCase();
      return (k.includes("tower") || k.includes("structure")) && k.includes("type");
    });

    if (typeLikeEntry) {
      const value = safeString(typeLikeEntry[1]).trim();
      if (value) return value.toUpperCase();
    }
  }

  const text = [displayName, safeString(tower.name), safeString(tower.structure_number), safeString(tower.tower_number)]
    .join(" ")
    .toUpperCase();

  const knownTypeMatch = text.match(/\b\d+[A-Z]{2}\b/);
  if (knownTypeMatch) return knownTypeMatch[0];

  return "UNKNOWN";
}

function getTowerDisplayName(tower: Tower) {
  return tower.tower_number || tower.structure_number || tower.tower_no || tower.name || "Unnamed Tower";
}

function naturalSortText(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function naturalTowerSort(a: Tower, b: Tower) {
  return naturalSortText(getTowerDisplayName(a), getTowerDisplayName(b));
}

function getTowerComputedProgress(tower: Tower, dockets: DocketRow[]) {
  const related = dockets.filter((d) => d.tower_id === tower.id);

  if (related.length > 0) {
    return related.reduce((max, docket) => {
      const assembly = Number(docket.assembly_percent || 0);
      const erection = Number(docket.erection_percent || 0);
      const weighted = Math.round(assembly * 0.5 + erection * 0.5);
      return Math.max(max, weighted);
    }, 0);
  }

  return safeNumber(tower.progress, 0);
}

function getDocketProgress(docket: DocketRow) {
  const assembly = safeNumber(docket.assembly_percent, 0);
  const erection = safeNumber(docket.erection_percent, 0);
  return clampPercent(Math.round(assembly * 0.5 + erection * 0.5));
}

function getDeliveredQty(row: DeliveryItemRow) {
  return safeNumber(row.qty_delivered ?? row.quantity_delivered ?? row.delivered_qty ?? row.qty, 0);
}

function getRequiredQty(row: MaterialBundleRow) {
  return safeNumber(row.qty_required ?? row.required_qty, 0);
}

function getStatusBadgeClasses(status: string) {
  const s = status.trim().toLowerCase();

  if (s === "ongoing" || s === "active" || s === "in progress") return "bg-green-100 text-green-700";
  if (s === "tendering" || s === "planning") return "bg-yellow-100 text-yellow-700";
  if (s === "complete" || s === "completed") return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-700";
}

function sectionCardClasses(tint: "blue" | "purple" | "emerald" | "amber" | "rose" | "slate") {
  switch (tint) {
    case "blue":
      return "bg-gradient-to-br from-blue-50 to-white border-blue-100";
    case "purple":
      return "bg-gradient-to-br from-violet-50 to-white border-violet-100";
    case "emerald":
      return "bg-gradient-to-br from-emerald-50 to-white border-emerald-100";
    case "amber":
      return "bg-gradient-to-br from-amber-50 to-white border-amber-100";
    case "rose":
      return "bg-gradient-to-br from-rose-50 to-white border-rose-100";
    default:
      return "bg-gradient-to-br from-slate-50 to-white border-slate-200";
  }
}

function MetricTile({
  title,
  value,
  subtitle,
  accent,
}: {
  title: string;
  value: string;
  subtitle?: string;
  accent: "blue" | "purple" | "emerald" | "amber" | "rose" | "slate";
}) {
  const accentBar =
    accent === "blue"
      ? "bg-blue-500"
      : accent === "purple"
      ? "bg-violet-500"
      : accent === "emerald"
      ? "bg-emerald-500"
      : accent === "amber"
      ? "bg-amber-500"
      : accent === "rose"
      ? "bg-rose-500"
      : "bg-slate-500";

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${sectionCardClasses(accent)}`}>
      <div className={`mb-4 h-1.5 w-14 rounded-full ${accentBar}`} />
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</div>
      {subtitle ? <div className="mt-2 text-sm text-slate-600">{subtitle}</div> : null}
    </div>
  );
}


function ProgressRing({
  label,
  value,
  sublabel,
  tone = "blue",
}: {
  label: string;
  value: number;
  sublabel?: string;
  tone?: "blue" | "emerald" | "purple" | "amber" | "slate";
}) {
  const pct = clampPercent(value);
  const stroke = tone === "emerald" ? "#10b981" : tone === "purple" ? "#8b5cf6" : tone === "amber" ? "#f59e0b" : tone === "slate" ? "#64748b" : "#3b82f6";
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (pct / 100) * circumference;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
      <div className="relative h-28 w-28 shrink-0">
        <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="9" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-black text-slate-900">{formatDecimal(pct, 0)}%</span>
        </div>
      </div>
      <div>
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        {sublabel ? <div className="mt-1 text-sm text-slate-500 leading-5">{sublabel}</div> : null}
      </div>
    </div>
  );
}

function CompactRankCard({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: { id: string; label: string; meta: string; value: string; href?: string }[];
  emptyText: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      {items.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">{emptyText}</div>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item, index) => {
            const content = (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:bg-slate-100 transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-400">#{index + 1}</div>
                    <div className="mt-1 truncate font-semibold text-slate-900">{item.label}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.meta}</div>
                  </div>
                  <div className="text-right text-lg font-black text-slate-900">{item.value}</div>
                </div>
              </div>
            );
            return item.href ? <Link key={item.id} href={item.href}>{content}</Link> : <div key={item.id}>{content}</div>;
          })}
        </div>
      )}
    </div>
  );
}

function QuickActionCard({
  title,
  description,
  accent,
  onClick,
}: {
  title: string;
  description: string;
  accent: "blue" | "purple" | "emerald" | "amber";
  onClick: () => void;
}) {
  const styles =
    accent === "blue"
      ? { card: "from-blue-50 to-white border-blue-100", bar: "bg-blue-500" }
      : accent === "purple"
      ? { card: "from-violet-50 to-white border-violet-100", bar: "bg-violet-500" }
      : accent === "amber"
      ? { card: "from-amber-50 to-white border-amber-100", bar: "bg-amber-500" }
      : { card: "from-emerald-50 to-white border-emerald-100", bar: "bg-emerald-500" };

  return (
    <button
      onClick={onClick}
      className={`text-left rounded-2xl border bg-gradient-to-br p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all ${styles.card}`}
    >
      <div className={`mb-4 h-1.5 w-14 rounded-full ${styles.bar}`} />
      <div className="text-lg font-semibold text-slate-900">{title}</div>
      <div className="mt-2 text-sm leading-6 text-slate-600">{description}</div>
    </button>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
      <p className="text-slate-500 text-sm">{title}</p>
      <p className="text-3xl font-bold mt-2 text-slate-900">{value}</p>
      {subtitle ? <p className="text-sm text-slate-500 mt-2">{subtitle}</p> : null}
    </div>
  );
}

function SectionHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function ForecastBadge({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">No forecast</span>;
  }

  const tone =
    value <= 3
      ? "bg-emerald-100 text-emerald-700"
      : value <= 7
      ? "bg-blue-100 text-blue-700"
      : value <= 14
      ? "bg-amber-100 text-amber-700"
      : "bg-rose-100 text-rose-700";

  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{formatDecimal(value, 1)} days</span>;
}

function TrendBarChart({ rows, metric }: { rows: TrendRow[]; metric: TrendMetric }) {
  const visibleRows = rows.slice(-24);

  if (visibleRows.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">
        No trend data found for the selected filters.
      </div>
    );
  }

  const chartWidth = Math.max(720, visibleRows.length * 70);
  const chartHeight = 320;
  const padding = { top: 28, right: 26, bottom: 64, left: 62 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  const values = visibleRows.flatMap((row) => {
    const next: number[] = [];
    if (metric !== "production" && row.rawMhPerTonne !== null) next.push(row.rawMhPerTonne);
    if (metric !== "raw" && row.productionMhPerTonne !== null) next.push(row.productionMhPerTonne);
    return next;
  });

  const maxValue = Math.max(1, ...values);
  const yMax = Math.ceil(maxValue * 1.15);
  const yTicks = Array.from({ length: 5 }, (_, index) => (yMax / 4) * index).reverse();

  function xForIndex(index: number) {
    if (visibleRows.length === 1) return padding.left + plotWidth / 2;
    return padding.left + (index / (visibleRows.length - 1)) * plotWidth;
  }

  function yForValue(value: number | null) {
    if (value === null) return null;
    return padding.top + plotHeight - (value / yMax) * plotHeight;
  }

  function buildLine(metricKey: "rawMhPerTonne" | "productionMhPerTonne") {
    return visibleRows
      .map((row, index) => {
        const y = yForValue(row[metricKey]);
        if (y === null) return null;
        return `${xForIndex(index)},${y}`;
      })
      .filter((point): point is string => Boolean(point))
      .join(" ");
  }

  const rawLine = buildLine("rawMhPerTonne");
  const productionLine = buildLine("productionMhPerTonne");

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">MH/t trend by docket date</div>
          <div className="text-xs text-slate-500">X-axis is date. Y-axis is MH/t. Lower is better.</div>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          {metric !== "production" && (
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-blue-500" /> Raw MH/t
            </span>
          )}
          {metric !== "raw" && (
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-violet-500" /> Production MH/t
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <svg width={chartWidth} height={chartHeight} className="block">
          {yTicks.map((tick) => {
            const y = yForValue(tick) || padding.top + plotHeight;
            return (
              <g key={`y-${tick}`}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={chartWidth - padding.right}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 12}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-500 text-[11px]"
                >
                  {formatDecimal(tick, 0)}
                </text>
              </g>
            );
          })}

          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={padding.top + plotHeight}
            stroke="#cbd5e1"
            strokeWidth="1.5"
          />
          <line
            x1={padding.left}
            y1={padding.top + plotHeight}
            x2={chartWidth - padding.right}
            y2={padding.top + plotHeight}
            stroke="#cbd5e1"
            strokeWidth="1.5"
          />

          {metric !== "production" && rawLine && (
            <polyline
              points={rawLine}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {metric !== "raw" && productionLine && (
            <polyline
              points={productionLine}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {visibleRows.map((row, index) => {
            const x = xForIndex(index);
            const rawY = yForValue(row.rawMhPerTonne);
            const productionY = yForValue(row.productionMhPerTonne);
            const showLabel = visibleRows.length <= 12 || index % Math.ceil(visibleRows.length / 8) === 0;

            return (
              <g key={row.date}>
                {metric !== "production" && rawY !== null && (
                  <g>
                    <circle cx={x} cy={rawY} r="4.5" fill="#3b82f6">
                      <title>{`${formatDate(row.date)} raw MH/t: ${formatDecimal(row.rawMhPerTonne, 2)}`}</title>
                    </circle>
                    {visibleRows.length <= 14 && (
                      <text
                        x={x}
                        y={rawY - 10}
                        textAnchor="middle"
                        className="fill-slate-600 text-[10px] font-semibold"
                      >
                        {formatDecimal(row.rawMhPerTonne, 1)}
                      </text>
                    )}
                  </g>
                )}

                {metric !== "raw" && productionY !== null && (
                  <g>
                    <circle cx={x} cy={productionY} r="4.5" fill="#8b5cf6">
                      <title>{`${formatDate(row.date)} production MH/t: ${formatDecimal(row.productionMhPerTonne, 2)}`}</title>
                    </circle>
                    {visibleRows.length <= 14 && (
                      <text
                        x={x}
                        y={productionY + 18}
                        textAnchor="middle"
                        className="fill-slate-600 text-[10px] font-semibold"
                      >
                        {formatDecimal(row.productionMhPerTonne, 1)}
                      </text>
                    )}
                  </g>
                )}

                {showLabel && (
                  <text
                    x={x}
                    y={chartHeight - 24}
                    textAnchor="middle"
                    transform={`rotate(-35 ${x} ${chartHeight - 24})`}
                    className="fill-slate-500 text-[11px]"
                  >
                    {formatDate(row.date)}
                  </text>
                )}

                {showLabel && (
                  <text
                    x={x}
                    y={chartHeight - 8}
                    textAnchor="middle"
                    className="fill-slate-400 text-[10px]"
                  >
                    {row.docketCount} docket{row.docketCount === 1 ? "" : "s"}
                  </text>
                )}
              </g>
            );
          })}

          <text
            x={20}
            y={padding.top + plotHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90 20 ${padding.top + plotHeight / 2})`}
            className="fill-slate-500 text-[12px] font-medium"
          >
            MH/t
          </text>
        </svg>
      </div>
    </div>
  );
}

export default function ProjectDashboard() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const supabase = createSupabaseBrowser();

  const [project, setProject] = useState<Project | null>(null);
  const [towers, setTowers] = useState<Tower[]>([]);
  const [dockets, setDockets] = useState<DocketRow[]>([]);
  const [labourRows, setLabourRows] = useState<LabourRow[]>([]);
  const [defects, setDefects] = useState<DefectRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [deliveryItems, setDeliveryItems] = useState<DeliveryItemRow[]>([]);
  const [materialBundles, setMaterialBundles] = useState<MaterialBundleRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [actionType, setActionType] = useState<QuickActionType>(null);
  const [towerSearch, setTowerSearch] = useState("");
  const [analyticsView, setAnalyticsView] = useState<AnalyticsView>("tower_performance");
  const [analyticsCrewFilter, setAnalyticsCrewFilter] = useState("all");
  const [analyticsSortDirection, setAnalyticsSortDirection] = useState<SortDirection>("best");
  const [analyticsSearch, setAnalyticsSearch] = useState("");
  const [analyticsRowsToShow, setAnalyticsRowsToShow] = useState<RowsToShow>("25");
  const [forecastBenchmark, setForecastBenchmark] = useState("tower_type");
  const [forecastSearch, setForecastSearch] = useState("");
  const [forecastRowsToShow, setForecastRowsToShow] = useState<RowsToShow>("25");
  const [trendCrewFilter, setTrendCrewFilter] = useState("all");
  const [trendStartDate, setTrendStartDate] = useState("");
  const [trendEndDate, setTrendEndDate] = useState("");
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("both");
  const [docketLookupDate, setDocketLookupDate] = useState("");
  const [docketLookupCrewFilter, setDocketLookupCrewFilter] = useState("all");
  const [docketLookupSearch, setDocketLookupSearch] = useState("");
  const [role, setRole] = useState<UserRole>(null);

  const [editingProject, setEditingProject] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [projectForm, setProjectForm] = useState({
    name: "",
    client: "",
    clientCode: "",
    projectYear: String(new Date().getFullYear()),
    projectSequence: "1",
    location: "",
    totalTowers: "",
    status: "ongoing",
  });

  const isAdmin = role === "admin";

  useEffect(() => {
    void load();
    void loadRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function loadRole() {
    const userRole = await getUserRole();
    setRole(userRole);
  }

  async function load() {
    setLoading(true);

    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select("id, name, status, client, client_code, project_year, project_sequence, project_number, location, total_towers, sharepoint_url, sharepoint_tender_url")
      .eq("id", projectId)
      .single();

    if (projectError) console.error("project load error", projectError);

    const { data: towersData, error: towersError } = await supabase
      .from("towers")
      .select("*")
      .eq("project_id", projectId)
      .order("name", { ascending: true });

    if (towersError) console.error("towers load error", towersError);

    const loadedTowers = [...((towersData as Tower[] | null) || [])].sort(naturalTowerSort);
    const towerIds = loadedTowers.map((t) => t.id);

    const { data: docketsData, error: docketsError } = await supabase
      .from("tower_daily_dockets")
      .select("id, tower_id, project_id, docket_date, assembly_percent, erection_percent, crew, leading_hand, raw_manhours, production_manhours")
      .eq("project_id", projectId);

    if (docketsError) console.error("dockets load error", docketsError);

    const loadedDockets = (docketsData as DocketRow[] | null) || [];
    const docketIds = loadedDockets.map((d) => d.id);

    let loadedLabourRows: LabourRow[] = [];
    if (docketIds.length > 0) {
      const labourTableCandidates = [
        "tower_docket_labour",
        "tower_daily_docket_labour",
        "tower_daily_docket_labour_rows",
      ];

      for (const table of labourTableCandidates) {
        const { data, error } = await supabase.from(table).select("docket_id, total_hours, production_hours");
        if (!error && data) {
          loadedLabourRows = (data as LabourRow[]).filter((row) => docketIds.includes(row.docket_id));
          break;
        }
      }
    }

    let loadedDefects: DefectRow[] = [];
    if (towerIds.length > 0) {
      const { data, error } = await supabase
        .from("tower_defects")
        .select("id, tower_id, status")
        .in("tower_id", towerIds);

      if (!error && data) loadedDefects = data as DefectRow[];
      else if (error) console.error("defects load error", error);
    }

    let loadedMaterialBundles: MaterialBundleRow[] = [];
    if (towerIds.length > 0) {
      const { data, error } = await supabase
        .from("tower_required_bundles")
        .select("*")
        .in("tower_id", towerIds);

      if (!error && data) loadedMaterialBundles = data as MaterialBundleRow[];
      else if (error) console.error("materials load error", error);
    }

    let loadedDeliveries: DeliveryRow[] = [];
    if (towerIds.length > 0) {
      const deliveryTableCandidates = ["tower_bundle_deliveries", "tower_deliveries"];

      for (const table of deliveryTableCandidates) {
        const { data, error } = await supabase.from(table).select("*").in("tower_id", towerIds);
        if (!error && data) {
          loadedDeliveries = data as DeliveryRow[];
          break;
        }
        if (error) console.warn(`${table} load skipped`, error.message);
      }
    }

    const deliveryIds = loadedDeliveries.map((d) => d.id);

    let loadedDeliveryItems: DeliveryItemRow[] = [];
    if (deliveryIds.length > 0) {
      const deliveryItemCandidates = [
        "tower_bundle_delivery_items",
        "tower_delivery_items",
        "tower_delivered_items",
      ];

      for (const table of deliveryItemCandidates) {
        const { data, error } = await supabase.from(table).select("*").in("delivery_id", deliveryIds);
        if (!error && data) {
          loadedDeliveryItems = data as DeliveryItemRow[];
          break;
        }
        if (error) console.warn(`${table} load skipped`, error.message);
      }
    }

    const loadedProject = (projectData as Project | null) || null;

    setProject(loadedProject);
    setProjectForm({
      name: loadedProject?.name || "",
      client: loadedProject?.client || "",
      clientCode: loadedProject?.client_code || "",
      projectYear: loadedProject?.project_year
        ? String(loadedProject.project_year)
        : String(new Date().getFullYear()),
      projectSequence: loadedProject?.project_sequence
        ? String(loadedProject.project_sequence)
        : "1",
      location: loadedProject?.location || "",
      totalTowers:
        loadedProject?.total_towers !== null &&
        loadedProject?.total_towers !== undefined
          ? String(loadedProject.total_towers)
          : "",
      status: loadedProject?.status || "ongoing",
    });
    setTowers(loadedTowers);
    setDockets(loadedDockets);
    setLabourRows(loadedLabourRows);
    setDefects(loadedDefects);
    setDeliveries(loadedDeliveries);
    setDeliveryItems(loadedDeliveryItems);
    setMaterialBundles(loadedMaterialBundles);
    setLoading(false);
  }

  const docketHoursById = useMemo(() => {
    const map = new Map<string, number>();

    dockets.forEach((docket) => {
      const raw = safeNumber(docket.raw_manhours, NaN);
      if (Number.isFinite(raw)) map.set(docket.id, raw);
    });

    labourRows.forEach((row) => {
      if (map.has(row.docket_id)) return;
      map.set(row.docket_id, (map.get(row.docket_id) || 0) + safeNumber(row.total_hours, 0));
    });

    return map;
  }, [dockets, labourRows]);

  const docketProductionHoursById = useMemo(() => {
    const map = new Map<string, number>();

    dockets.forEach((docket) => {
      const production = safeNumber(docket.production_manhours, NaN);
      if (Number.isFinite(production)) map.set(docket.id, production);
    });

    labourRows.forEach((row) => {
      if (map.has(row.docket_id)) return;
      map.set(row.docket_id, (map.get(row.docket_id) || 0) + safeNumber(row.production_hours ?? row.total_hours, 0));
    });

    return map;
  }, [dockets, labourRows]);

  const deliverySummaryByTowerId = useMemo(() => {
    const map = new Map<string, { requiredQty: number; deliveredQty: number; outstandingQty: number; deliveryPercent: number }>();

    towers.forEach((tower) => {
      const towerDeliveries = deliveries.filter((delivery) => delivery.tower_id === tower.id);
      const towerDeliveryIds = new Set(towerDeliveries.map((delivery) => delivery.id));

      const requiredQty = materialBundles
        .filter((bundle) => bundle.tower_id === tower.id)
        .reduce((sum, bundle) => sum + getRequiredQty(bundle), 0);

      const deliveredQty = deliveryItems
        .filter((item) => item.delivery_id && towerDeliveryIds.has(item.delivery_id))
        .reduce((sum, item) => sum + getDeliveredQty(item), 0);

      const outstandingQty = Math.max(0, requiredQty - deliveredQty);
      const deliveryPercent = requiredQty > 0 ? clampPercent((deliveredQty / requiredQty) * 100) : 0;

      map.set(tower.id, { requiredQty, deliveredQty, outstandingQty, deliveryPercent });
    });

    return map;
  }, [towers, deliveries, deliveryItems, materialBundles]);

  const towerProductionSummaries = useMemo<TowerProductionSummary[]>(() => {
    return [...towers].sort(naturalTowerSort).map((tower) => {
      const computedProgress = getTowerComputedProgress(tower, dockets);
      const computedWeight = getTowerWeightFromExtraData(tower.extra_data);
      const completedTonnes = computedWeight ? computedWeight * (computedProgress / 100) : null;

      const towerDocketIds = dockets.filter((d) => d.tower_id === tower.id).map((d) => d.id);
      const manhours = towerDocketIds.reduce((sum, docketId) => sum + (docketHoursById.get(docketId) || 0), 0);
      const productionManhours = towerDocketIds.reduce((sum, docketId) => sum + (docketProductionHoursById.get(docketId) || 0), 0);
      const rawMhPerTonne = completedTonnes && completedTonnes > 0 ? manhours / completedTonnes : null;
      const productionMhPerTonne = completedTonnes && completedTonnes > 0 ? productionManhours / completedTonnes : null;

      return {
        ...tower,
        computedProgress,
        computedWeight,
        completedTonnes,
        manhours,
        productionManhours,
        rawMhPerTonne,
        productionMhPerTonne,
      };
    });
  }, [towers, dockets, docketHoursById, docketProductionHoursById]);

  const stats = useMemo<ProjectStats>(() => {
    const totalTowers = towers.length;

    const towersComplete = towerProductionSummaries.filter((tower) => tower.computedProgress >= 100).length;
    const towersInProgress = towerProductionSummaries.filter(
      (tower) => tower.computedProgress > 0 && tower.computedProgress < 100,
    ).length;
    const towersNotStarted = towerProductionSummaries.filter((tower) => tower.computedProgress <= 0).length;

    const deliveryTowersInProgress = towers.filter((tower) => {
      const summary = deliverySummaryByTowerId.get(tower.id);
      return summary && summary.deliveryPercent > 0 && summary.deliveryPercent < 100;
    }).length;

    const totalDockets = dockets.length;
    const totalManhours = towerProductionSummaries.reduce((sum, tower) => sum + tower.manhours, 0);
    const productionManhours = towerProductionSummaries.reduce((sum, tower) => sum + tower.productionManhours, 0);

    const totalTowerWeightRaw = towerProductionSummaries.reduce((sum, tower) => sum + safeNumber(tower.computedWeight, 0), 0);
    const totalTowerWeight = totalTowerWeightRaw > 0 ? totalTowerWeightRaw : null;

    const completedTonnesRaw = towerProductionSummaries.reduce((sum, tower) => sum + safeNumber(tower.completedTonnes, 0), 0);
    const completedTonnes = completedTonnesRaw > 0 ? completedTonnesRaw : null;

    const manhoursPerTonne = completedTonnes && completedTonnes > 0 ? totalManhours / completedTonnes : null;
    const productionManhoursPerTonne = completedTonnes && completedTonnes > 0 ? productionManhours / completedTonnes : null;
    const overallProgressPercent = totalTowerWeightRaw > 0
      ? clampPercent((completedTonnesRaw / totalTowerWeightRaw) * 100)
      : totalTowers > 0
      ? clampPercent(towerProductionSummaries.reduce((sum, tower) => sum + tower.computedProgress, 0) / totalTowers)
      : 0;

    const totalDefects = defects.length;
    const openDefects = defects.filter((defect) => {
      const st = safeString(defect.status).trim().toLowerCase();
      return st !== "closed" && st !== "complete" && st !== "completed";
    }).length;

    const totalDeliveries = deliveries.length;

    const totalRequiredQty = towers.reduce((sum, tower) => sum + safeNumber(deliverySummaryByTowerId.get(tower.id)?.requiredQty, 0), 0);
    const deliveredQty = towers.reduce((sum, tower) => sum + safeNumber(deliverySummaryByTowerId.get(tower.id)?.deliveredQty, 0), 0);
    const outstandingQty = Math.max(0, totalRequiredQty - deliveredQty);
    const deliveryPercent = totalRequiredQty > 0 ? clampPercent((deliveredQty / totalRequiredQty) * 100) : 0;

    const latestDocketDate =
      dockets
        .map((d) => d.docket_date)
        .filter((d): d is string => !!d)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

    return {
      totalTowers,
      towersComplete,
      towersInProgress,
      towersNotStarted,
      deliveryTowersInProgress,
      totalDockets,
      totalManhours,
      productionManhours,
      totalTowerWeight,
      completedTonnes,
      manhoursPerTonne,
      productionManhoursPerTonne,
      overallProgressPercent,
      openDefects,
      totalDefects,
      totalDeliveries,
      totalRequiredQty,
      deliveredQty,
      outstandingQty,
      deliveryPercent,
      latestDocketDate,
    };
  }, [towers, towerProductionSummaries, dockets, defects, deliveries, deliverySummaryByTowerId]);

  const inProgressTowers = useMemo(() => {
    return towerProductionSummaries
      .filter((tower) => tower.computedProgress > 0 && tower.computedProgress < 100)
      .sort((a, b) => b.computedProgress - a.computedProgress)
      .slice(0, 8);
  }, [towerProductionSummaries]);

  const deliveryTowersInProgress = useMemo<TowerDeliverySummary[]>(() => {
    return towers
      .map((tower) => {
        const summary = deliverySummaryByTowerId.get(tower.id) || {
          requiredQty: 0,
          deliveredQty: 0,
          outstandingQty: 0,
          deliveryPercent: 0,
        };
        return { ...tower, ...summary };
      })
      .filter((tower) => tower.deliveryPercent > 0 && tower.deliveryPercent < 100)
      .sort((a, b) => b.deliveryPercent - a.deliveryPercent)
      .slice(0, 8);
  }, [towers, deliverySummaryByTowerId]);

  const crewProduction = useMemo<CrewProductionSummary[]>(() => {
    const towerById = new Map<string, TowerProductionSummary>();
    towerProductionSummaries.forEach((tower) => towerById.set(tower.id, tower));

    const sortedDocketsByTower = new Map<string, DocketRow[]>();
    dockets.forEach((docket) => {
      if (!docket.tower_id) return;
      const arr = sortedDocketsByTower.get(docket.tower_id) || [];
      arr.push(docket);
      sortedDocketsByTower.set(docket.tower_id, arr);
    });

    sortedDocketsByTower.forEach((arr, towerId) => {
      arr.sort((a, b) => {
        const ad = a.docket_date ? new Date(a.docket_date).getTime() : 0;
        const bd = b.docket_date ? new Date(b.docket_date).getTime() : 0;
        return ad - bd;
      });
      sortedDocketsByTower.set(towerId, arr);
    });

    const rows = new Map<string, CrewProductionSummary & { towerIds: Set<string>; completedTowerIds: Set<string> }>();

    sortedDocketsByTower.forEach((towerDockets, towerId) => {
      const tower = towerById.get(towerId);
      const towerWeight = safeNumber(tower?.computedWeight, 0);
      let previousProgress = 0;

      towerDockets.forEach((docket) => {
        const crewName = safeString(docket.crew || docket.leading_hand || "Unassigned Crew", "Unassigned Crew").trim() || "Unassigned Crew";
        const currentProgress = getDocketProgress(docket);
        const progressDelta = Math.max(0, currentProgress - previousProgress);
        const productionTonnes = towerWeight > 0 ? towerWeight * (progressDelta / 100) : 0;
        const rawHours = docketHoursById.get(docket.id) || 0;
        const productionHours = docketProductionHoursById.get(docket.id) || rawHours;

        const existing = rows.get(crewName) || {
          crewName,
          docketCount: 0,
          totalHours: 0,
          productionHours: 0,
          productionTonnes: 0,
          rawMhPerTonne: null,
          mhPerTonne: null,
          tonnesPerHour: null,
          towersTouched: 0,
          completedTowers: 0,
          towerNames: [],
          towerIds: new Set<string>(),
          completedTowerIds: new Set<string>(),
          lastDocketDate: null,
        };

        existing.docketCount += 1;
        existing.totalHours += rawHours;
        existing.productionHours += productionHours;
        existing.productionTonnes += productionTonnes;
        existing.towerIds.add(towerId);
        if (tower && tower.computedProgress >= 100) existing.completedTowerIds.add(towerId);
        if (
          docket.docket_date &&
          (!existing.lastDocketDate || new Date(docket.docket_date).getTime() > new Date(existing.lastDocketDate).getTime())
        ) {
          existing.lastDocketDate = docket.docket_date;
        }

        rows.set(crewName, existing);
        previousProgress = Math.max(previousProgress, currentProgress);
      });
    });

    return Array.from(rows.values())
      .map((row) => ({
        crewName: row.crewName,
        docketCount: row.docketCount,
        totalHours: row.totalHours,
        productionHours: row.productionHours,
        productionTonnes: row.productionTonnes,
        rawMhPerTonne: row.productionTonnes > 0 ? row.totalHours / row.productionTonnes : null,
        mhPerTonne: row.productionTonnes > 0 ? row.productionHours / row.productionTonnes : null,
        tonnesPerHour: row.productionHours > 0 ? row.productionTonnes / row.productionHours : null,
        towersTouched: row.towerIds.size,
        completedTowers: row.completedTowerIds.size,
        towerNames: Array.from(row.towerIds)
          .map((towerId) => towerById.get(towerId))
          .filter((tower): tower is TowerProductionSummary => Boolean(tower))
          .map((tower) => getTowerDisplayName(tower))
          .slice(0, 6),
        lastDocketDate: row.lastDocketDate,
      }))
      .sort((a, b) => {
        if (a.mhPerTonne === null && b.mhPerTonne === null) return b.productionHours - a.productionHours;
        if (a.mhPerTonne === null) return 1;
        if (b.mhPerTonne === null) return -1;
        return a.mhPerTonne - b.mhPerTonne;
      });
  }, [towerProductionSummaries, dockets, docketHoursById, docketProductionHoursById]);

  const bestPerformingTowers = useMemo(() => {
    return towerProductionSummaries
      .filter((tower) => tower.productionMhPerTonne !== null && tower.computedProgress > 0)
      .sort((a, b) => safeNumber(a.productionMhPerTonne, 999999) - safeNumber(b.productionMhPerTonne, 999999))
      .slice(0, 5);
  }, [towerProductionSummaries]);

  const watchlistTowers = useMemo(() => {
    return towerProductionSummaries
      .filter((tower) => tower.productionMhPerTonne !== null && tower.computedProgress > 0)
      .sort((a, b) => safeNumber(b.productionMhPerTonne, -1) - safeNumber(a.productionMhPerTonne, -1))
      .slice(0, 5);
  }, [towerProductionSummaries]);

  const completedTowersByCrew = useMemo(() => {
    return crewProduction
      .filter((crew) => crew.completedTowers > 0)
      .sort((a, b) => b.completedTowers - a.completedTowers || safeNumber(a.mhPerTonne, 999999) - safeNumber(b.mhPerTonne, 999999));
  }, [crewProduction]);

  const analyticsCrewOptions = useMemo(() => {
    return ["all", ...crewProduction.map((crew) => crew.crewName)];
  }, [crewProduction]);

  const analyticsRows = useMemo(() => {
    let rows = [...towerProductionSummaries];

    const q = analyticsSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter((tower) =>
        [getTowerDisplayName(tower), safeString(tower.line), safeString(tower.status)]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }

    if (analyticsCrewFilter !== "all") {
      const towerIds = new Set(
        dockets
          .filter((docket) => (docket.crew || docket.leading_hand || "Unassigned Crew") === analyticsCrewFilter)
          .map((docket) => docket.tower_id)
          .filter((towerId): towerId is string => Boolean(towerId)),
      );
      rows = rows.filter((tower) => towerIds.has(tower.id));
    }

    if (analyticsView === "completed_towers") rows = rows.filter((tower) => tower.computedProgress >= 100);
    if (analyticsView === "mh_per_tonne") rows = rows.filter((tower) => tower.rawMhPerTonne !== null);
    if (analyticsView === "production_mh_per_tonne") rows = rows.filter((tower) => tower.productionMhPerTonne !== null);

    const direction = analyticsSortDirection === "best" ? 1 : -1;

    return rows.sort((a, b) => {
      if (analyticsView === "mh_per_tonne") return (safeNumber(a.rawMhPerTonne, 999999) - safeNumber(b.rawMhPerTonne, 999999)) * direction;
      if (analyticsView === "production_mh_per_tonne") return (safeNumber(a.productionMhPerTonne, 999999) - safeNumber(b.productionMhPerTonne, 999999)) * direction;
      if (analyticsView === "completed_towers") return b.computedProgress - a.computedProgress || naturalTowerSort(a, b);
      return (safeNumber(a.productionMhPerTonne, 999999) - safeNumber(b.productionMhPerTonne, 999999)) * direction || naturalTowerSort(a, b);
    });
  }, [towerProductionSummaries, analyticsView, analyticsCrewFilter, analyticsSortDirection, analyticsSearch, dockets]);

  function limitRows<T>(rows: T[], count: RowsToShow) {
    if (count === "all") return rows;
    return rows.slice(0, Number(count));
  }

  const visibleAnalyticsRows = useMemo(() => {
    return limitRows(analyticsRows, analyticsRowsToShow);
  }, [analyticsRows, analyticsRowsToShow]);

  const projectAverageDailyRawHours = useMemo(() => {
    const rawHoursByDate = new Map<string, number>();

    dockets.forEach((docket) => {
      if (!docket.docket_date) return;
      rawHoursByDate.set(
        docket.docket_date,
        (rawHoursByDate.get(docket.docket_date) || 0) + (docketHoursById.get(docket.id) || 0),
      );
    });

    const values = Array.from(rawHoursByDate.values());
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [dockets, docketHoursById]);

  const recentProjectDockets = useMemo(() => {
    const dated = dockets
      .filter((docket) => docket.docket_date)
      .sort((a, b) => new Date(b.docket_date || "").getTime() - new Date(a.docket_date || "").getTime());

    const latest = dated[0]?.docket_date;
    if (!latest) return [];

    const latestTime = new Date(latest).getTime();
    const cutoff = new Date(latestTime);
    cutoff.setDate(cutoff.getDate() - 28);
    const cutoffKey = cutoff.toISOString().slice(0, 10);

    return dated.filter((docket) => docket.docket_date && docket.docket_date >= cutoffKey);
  }, [dockets]);

  const recentProjectBenchmark = useMemo(() => {
    const towerById = new Map<string, TowerProductionSummary>();
    towerProductionSummaries.forEach((tower) => towerById.set(tower.id, tower));

    const byTower = new Map<string, DocketRow[]>();
    recentProjectDockets.forEach((docket) => {
      if (!docket.tower_id) return;
      const arr = byTower.get(docket.tower_id) || [];
      arr.push(docket);
      byTower.set(docket.tower_id, arr);
    });

    let rawHours = 0;
    let productionHours = 0;
    let productionTonnes = 0;
    const rawByDate = new Map<string, number>();

    byTower.forEach((towerDockets, towerId) => {
      const tower = towerById.get(towerId);
      const towerWeight = safeNumber(tower?.computedWeight, 0);
      let previousProgress = 0;

      towerDockets
        .sort((a, b) => new Date(a.docket_date || "").getTime() - new Date(b.docket_date || "").getTime())
        .forEach((docket) => {
          if (!docket.docket_date) return;

          const currentProgress = getDocketProgress(docket);
          const progressDelta = Math.max(0, currentProgress - previousProgress);
          const tonnes = towerWeight > 0 ? towerWeight * (progressDelta / 100) : 0;
          const raw = docketHoursById.get(docket.id) || 0;
          const production = docketProductionHoursById.get(docket.id) || raw;

          rawHours += raw;
          productionHours += production;
          productionTonnes += tonnes;
          rawByDate.set(docket.docket_date, (rawByDate.get(docket.docket_date) || 0) + raw);
          previousProgress = Math.max(previousProgress, currentProgress);
        });
    });

    const dailyValues = Array.from(rawByDate.values());
    const dailyRawHours = dailyValues.length > 0 ? dailyValues.reduce((sum, value) => sum + value, 0) / dailyValues.length : null;

    return {
      label: "Recent project actuals",
      docketCount: recentProjectDockets.length,
      rawHours,
      productionHours,
      productionTonnes,
      rawMhPerTonne: productionTonnes > 0 ? rawHours / productionTonnes : null,
      productionMhPerTonne: productionTonnes > 0 ? productionHours / productionTonnes : null,
      dailyRawHours,
    };
  }, [recentProjectDockets, towerProductionSummaries, docketHoursById, docketProductionHoursById]);

  const towerTypeBenchmarks = useMemo(() => {
    const towerById = new Map<string, TowerProductionSummary>();
    towerProductionSummaries.forEach((tower) => towerById.set(tower.id, tower));

    const sortedDocketsByTower = new Map<string, DocketRow[]>();
    dockets.forEach((docket) => {
      if (!docket.tower_id) return;
      const arr = sortedDocketsByTower.get(docket.tower_id) || [];
      arr.push(docket);
      sortedDocketsByTower.set(docket.tower_id, arr);
    });

    const rows = new Map<string, TowerTypeBenchmark & { towerIds: Set<string>; rawByDate: Map<string, number> }>();

    sortedDocketsByTower.forEach((towerDockets, towerId) => {
      const tower = towerById.get(towerId);
      if (!tower) return;

      const typeName = getTowerTypeFromExtraData(tower);
      const towerWeight = safeNumber(tower.computedWeight, 0);
      let previousProgress = 0;

      towerDockets
        .sort((a, b) => new Date(a.docket_date || "").getTime() - new Date(b.docket_date || "").getTime())
        .forEach((docket) => {
          const currentProgress = getDocketProgress(docket);
          const progressDelta = Math.max(0, currentProgress - previousProgress);
          const tonnes = towerWeight > 0 ? towerWeight * (progressDelta / 100) : 0;
          const raw = docketHoursById.get(docket.id) || 0;
          const production = docketProductionHoursById.get(docket.id) || raw;

          const existing = rows.get(typeName) || {
            typeName,
            towerCount: 0,
            docketCount: 0,
            rawHours: 0,
            productionHours: 0,
            productionTonnes: 0,
            rawMhPerTonne: null,
            productionMhPerTonne: null,
            dailyRawHours: null,
            towerIds: new Set<string>(),
            rawByDate: new Map<string, number>(),
          };

          existing.towerIds.add(towerId);
          existing.docketCount += 1;
          existing.rawHours += raw;
          existing.productionHours += production;
          existing.productionTonnes += tonnes;
          if (docket.docket_date) {
            existing.rawByDate.set(docket.docket_date, (existing.rawByDate.get(docket.docket_date) || 0) + raw);
          }

          rows.set(typeName, existing);
          previousProgress = Math.max(previousProgress, currentProgress);
        });
    });

    return Array.from(rows.values()).map((row) => {
      const dailyValues = Array.from(row.rawByDate.values());
      return {
        typeName: row.typeName,
        towerCount: row.towerIds.size,
        docketCount: row.docketCount,
        rawHours: row.rawHours,
        productionHours: row.productionHours,
        productionTonnes: row.productionTonnes,
        rawMhPerTonne: row.productionTonnes > 0 ? row.rawHours / row.productionTonnes : null,
        productionMhPerTonne: row.productionTonnes > 0 ? row.productionHours / row.productionTonnes : null,
        dailyRawHours: dailyValues.length > 0 ? dailyValues.reduce((sum, value) => sum + value, 0) / dailyValues.length : null,
      };
    });
  }, [towerProductionSummaries, dockets, docketHoursById, docketProductionHoursById]);

  const bestBenchmarkCrew = useMemo(() => {
    return crewProduction.find((crew) => crew.rawMhPerTonne !== null && crew.productionTonnes > 0) || null;
  }, [crewProduction]);

  const forecastBenchmarkOptions = useMemo(() => {
    return [
      { value: "tower_type", label: "Tower type benchmark (recommended)" },
      { value: "recent_project", label: "Recent project actuals (last 28 days)" },
      { value: "project_average", label: "Project average" },
      { value: "best_crew", label: bestBenchmarkCrew ? `Best crew (${bestBenchmarkCrew.crewName})` : "Best crew" },
      ...crewProduction
        .filter((crew) => crew.rawMhPerTonne !== null && crew.productionTonnes > 0)
        .map((crew) => ({ value: crew.crewName, label: crew.crewName })),
    ];
  }, [crewProduction, bestBenchmarkCrew]);

  const selectedForecastBenchmark = useMemo(() => {
    if (forecastBenchmark === "recent_project") {
      return {
        label: "Recent project actuals",
        mhPerTonne: recentProjectBenchmark.rawMhPerTonne,
        dailyRawHours: recentProjectBenchmark.dailyRawHours || projectAverageDailyRawHours,
      };
    }

    if (forecastBenchmark === "best_crew" && bestBenchmarkCrew) {
      const dailyRawHours =
        bestBenchmarkCrew.docketCount > 0 ? bestBenchmarkCrew.totalHours / bestBenchmarkCrew.docketCount : null;

      return {
        label: bestBenchmarkCrew.crewName,
        mhPerTonne: bestBenchmarkCrew.rawMhPerTonne,
        dailyRawHours,
      };
    }

    const selectedCrew = crewProduction.find((crew) => crew.crewName === forecastBenchmark);

    if (selectedCrew) {
      const dailyRawHours = selectedCrew.docketCount > 0 ? selectedCrew.totalHours / selectedCrew.docketCount : null;

      return {
        label: selectedCrew.crewName,
        mhPerTonne: selectedCrew.rawMhPerTonne,
        dailyRawHours,
      };
    }

    return {
      label: forecastBenchmark === "tower_type" ? "Tower type benchmark" : "Project average",
      mhPerTonne: stats.manhoursPerTonne,
      dailyRawHours: projectAverageDailyRawHours,
    };
  }, [forecastBenchmark, bestBenchmarkCrew, crewProduction, stats.manhoursPerTonne, projectAverageDailyRawHours, recentProjectBenchmark]);

  const forecastRows = useMemo<ForecastRow[]>(() => {
    const q = forecastSearch.trim().toLowerCase();
    const towerTypeMap = new Map(towerTypeBenchmarks.map((benchmark) => [benchmark.typeName, benchmark]));

    return towerProductionSummaries
      .filter((tower) => tower.computedProgress < 100)
      .filter((tower) => {
        if (!q) return true;
        return [getTowerDisplayName(tower), getTowerTypeFromExtraData(tower), safeString(tower.line), safeString(tower.status)]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .map((tower) => {
        const towerType = getTowerTypeFromExtraData(tower);
        const typeBenchmark = towerTypeMap.get(towerType);
        const useTowerType = forecastBenchmark === "tower_type";

        const benchmarkLabel =
          useTowerType && typeBenchmark?.rawMhPerTonne
            ? `${towerType} type actuals`
            : useTowerType && recentProjectBenchmark.rawMhPerTonne
            ? "Recent project fallback"
            : selectedForecastBenchmark.label;

        const benchmarkMhPerTonne =
          useTowerType
            ? typeBenchmark?.rawMhPerTonne || recentProjectBenchmark.rawMhPerTonne || stats.manhoursPerTonne
            : selectedForecastBenchmark.mhPerTonne;

        const benchmarkDailyRawHours =
          useTowerType
            ? typeBenchmark?.dailyRawHours || recentProjectBenchmark.dailyRawHours || projectAverageDailyRawHours
            : selectedForecastBenchmark.dailyRawHours;

        const confidence: ForecastRow["confidence"] =
          useTowerType && typeBenchmark?.rawMhPerTonne && typeBenchmark.docketCount >= 5 && typeBenchmark.towerCount >= 2
            ? "High"
            : benchmarkMhPerTonne && benchmarkDailyRawHours
            ? "Medium"
            : "Low";

        const weight = tower.computedWeight;
        const remainingTonnes =
          weight !== null && weight > 0 ? weight * ((100 - tower.computedProgress) / 100) : null;
        const forecastRawHours =
          remainingTonnes !== null && benchmarkMhPerTonne !== null ? remainingTonnes * benchmarkMhPerTonne : null;
        const forecastDays =
          forecastRawHours !== null && benchmarkDailyRawHours !== null && benchmarkDailyRawHours > 0
            ? forecastRawHours / benchmarkDailyRawHours
            : null;

        const oldProjectAverageRawHours =
          remainingTonnes !== null && stats.manhoursPerTonne !== null ? remainingTonnes * stats.manhoursPerTonne : null;
        const oldProjectAverageDays =
          oldProjectAverageRawHours !== null && projectAverageDailyRawHours !== null && projectAverageDailyRawHours > 0
            ? oldProjectAverageRawHours / projectAverageDailyRawHours
            : null;

        return {
          towerId: tower.id,
          towerName: getTowerDisplayName(tower),
          towerType,
          progress: tower.computedProgress,
          weight,
          remainingTonnes,
          benchmarkLabel,
          benchmarkMhPerTonne,
          forecastRawHours,
          forecastDays,
          benchmarkDailyRawHours,
          oldProjectAverageRawHours,
          oldProjectAverageDays,
          confidence,
        };
      })
      .sort((a, b) => safeNumber(a.forecastDays, 999999) - safeNumber(b.forecastDays, 999999) || naturalSortText(a.towerName, b.towerName));
  }, [
    towerProductionSummaries,
    selectedForecastBenchmark,
    forecastSearch,
    forecastBenchmark,
    towerTypeBenchmarks,
    recentProjectBenchmark,
    stats.manhoursPerTonne,
    projectAverageDailyRawHours,
  ]);

  const visibleForecastRows = useMemo(() => {
    return limitRows(forecastRows, forecastRowsToShow);
  }, [forecastRows, forecastRowsToShow]);

  const trendCrewOptions = useMemo(() => {
    return ["all", ...crewProduction.map((crew) => crew.crewName)];
  }, [crewProduction]);

  const trendRows = useMemo<TrendRow[]>(() => {
    const towerById = new Map<string, TowerProductionSummary>();
    towerProductionSummaries.forEach((tower) => towerById.set(tower.id, tower));

    const sortedDocketsByTower = new Map<string, DocketRow[]>();
    dockets.forEach((docket) => {
      if (!docket.tower_id || !docket.docket_date) return;

      const crewName = safeString(docket.crew || docket.leading_hand || "Unassigned Crew", "Unassigned Crew").trim() || "Unassigned Crew";
      if (trendCrewFilter !== "all" && crewName !== trendCrewFilter) return;
      if (trendStartDate && docket.docket_date < trendStartDate) return;
      if (trendEndDate && docket.docket_date > trendEndDate) return;

      const arr = sortedDocketsByTower.get(docket.tower_id) || [];
      arr.push(docket);
      sortedDocketsByTower.set(docket.tower_id, arr);
    });

    const byDate = new Map<string, { rawHours: number; productionHours: number; productionTonnes: number; docketCount: number }>();

    sortedDocketsByTower.forEach((towerDockets, towerId) => {
      const tower = towerById.get(towerId);
      const towerWeight = safeNumber(tower?.computedWeight, 0);
      let previousProgress = 0;

      towerDockets
        .sort((a, b) => new Date(a.docket_date || "").getTime() - new Date(b.docket_date || "").getTime())
        .forEach((docket) => {
          if (!docket.docket_date) return;

          const currentProgress = getDocketProgress(docket);
          const progressDelta = Math.max(0, currentProgress - previousProgress);
          const productionTonnes = towerWeight > 0 ? towerWeight * (progressDelta / 100) : 0;
          const rawHours = docketHoursById.get(docket.id) || 0;
          const productionHours = docketProductionHoursById.get(docket.id) || rawHours;

          const existing = byDate.get(docket.docket_date) || {
            rawHours: 0,
            productionHours: 0,
            productionTonnes: 0,
            docketCount: 0,
          };

          existing.rawHours += rawHours;
          existing.productionHours += productionHours;
          existing.productionTonnes += productionTonnes;
          existing.docketCount += 1;
          byDate.set(docket.docket_date, existing);

          previousProgress = Math.max(previousProgress, currentProgress);
        });
    });

    return Array.from(byDate.entries())
      .map(([date, row]) => ({
        date,
        rawHours: row.rawHours,
        productionHours: row.productionHours,
        productionTonnes: row.productionTonnes,
        rawMhPerTonne: row.productionTonnes > 0 ? row.rawHours / row.productionTonnes : null,
        productionMhPerTonne: row.productionTonnes > 0 ? row.productionHours / row.productionTonnes : null,
        docketCount: row.docketCount,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [towerProductionSummaries, dockets, docketHoursById, docketProductionHoursById, trendCrewFilter, trendStartDate, trendEndDate]);

  const trendPeriodSummary = useMemo(() => {
    const rawHours = trendRows.reduce((sum, row) => sum + row.rawHours, 0);
    const productionHours = trendRows.reduce((sum, row) => sum + row.productionHours, 0);
    const productionTonnes = trendRows.reduce((sum, row) => sum + row.productionTonnes, 0);
    const docketCount = trendRows.reduce((sum, row) => sum + row.docketCount, 0);

    return {
      rawHours,
      productionHours,
      productionTonnes,
      docketCount,
      rawMhPerTonne: productionTonnes > 0 ? rawHours / productionTonnes : null,
      productionMhPerTonne: productionTonnes > 0 ? productionHours / productionTonnes : null,
    };
  }, [trendRows]);

  const docketLookupCrewOptions = useMemo(() => {
    return ["all", ...crewProduction.map((crew) => crew.crewName)];
  }, [crewProduction]);

  const docketLookupRows = useMemo<DocketLookupRow[]>(() => {
    const towerById = new Map<string, TowerProductionSummary>();
    towerProductionSummaries.forEach((tower) => towerById.set(tower.id, tower));

    const q = docketLookupSearch.trim().toLowerCase();

    return dockets
      .filter((docket) => {
        if (docketLookupDate && docket.docket_date !== docketLookupDate) return false;

        const crewName = safeString(docket.crew || docket.leading_hand || "Unassigned Crew", "Unassigned Crew").trim() || "Unassigned Crew";
        if (docketLookupCrewFilter !== "all" && crewName !== docketLookupCrewFilter) return false;

        const tower = docket.tower_id ? towerById.get(docket.tower_id) || null : null;
        if (!q) return true;

        return [
          docket.docket_date,
          crewName,
          safeString(docket.leading_hand),
          tower ? getTowerDisplayName(tower) : "",
          tower ? getTowerTypeFromExtraData(tower) : "",
          tower ? safeString(tower.line) : "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .map((docket) => {
        const tower = docket.tower_id ? towerById.get(docket.tower_id) || null : null;
        const rawHours = docketHoursById.get(docket.id) || 0;
        const productionHours = docketProductionHoursById.get(docket.id) || rawHours;

        return {
          docket,
          tower,
          rawHours,
          productionHours,
          progress: getDocketProgress(docket),
        };
      })
      .sort((a, b) => {
        const ad = a.docket.docket_date ? new Date(a.docket.docket_date).getTime() : 0;
        const bd = b.docket.docket_date ? new Date(b.docket.docket_date).getTime() : 0;
        return bd - ad || naturalSortText(a.tower ? getTowerDisplayName(a.tower) : "", b.tower ? getTowerDisplayName(b.tower) : "");
      });
  }, [
    dockets,
    docketLookupDate,
    docketLookupCrewFilter,
    docketLookupSearch,
    towerProductionSummaries,
    docketHoursById,
    docketProductionHoursById,
  ]);

  const filteredTowers = useMemo(() => {
    const q = towerSearch.trim().toLowerCase();
    const sorted = [...towers].sort(naturalTowerSort);
    if (!q) return sorted;

    return sorted.filter((tower) => {
      const text = [getTowerDisplayName(tower), safeString(tower.line), safeString(tower.status)].join(" ").toLowerCase();
      return text.includes(q);
    });
  }, [towers, towerSearch]);

  function openAction(type: QuickActionType) {
    setActionType(type);
    setTowerSearch("");

    if (type === "docket_lookup" && !docketLookupDate && stats.latestDocketDate) {
      setDocketLookupDate(stats.latestDocketDate);
    }
  }

  function closeAction() {
    setActionType(null);
    setTowerSearch("");
    setDocketLookupSearch("");
  }

  function getProjectFormFromProject(value: Project) {
    return {
      name: value.name || "",
      client: value.client || "",
      clientCode: value.client_code || "",
      projectYear: value.project_year
        ? String(value.project_year)
        : String(new Date().getFullYear()),
      projectSequence: value.project_sequence
        ? String(value.project_sequence)
        : "1",
      location: value.location || "",
      totalTowers:
        value.total_towers !== null && value.total_towers !== undefined
          ? String(value.total_towers)
          : "",
      status: value.status || "ongoing",
    };
  }

  function startEditingProject() {
    if (!project) return;
    setProjectForm(getProjectFormFromProject(project));
    setEditingProject(true);
  }

  function cancelEditingProject() {
    if (project) {
      setProjectForm(getProjectFormFromProject(project));
    }
    setEditingProject(false);
  }

  const editedProjectNumber = buildProjectNumber(
    projectForm.clientCode,
    projectForm.projectYear,
    projectForm.projectSequence,
  );

  async function saveProjectDetails() {
    if (!project || savingProject) return;

    const cleanName = projectForm.name.trim();
    const cleanClientCode = projectForm.clientCode.trim().toUpperCase();
    const projectYear = Number(projectForm.projectYear);
    const projectSequence = Number(projectForm.projectSequence);
    const totalTowers =
      projectForm.totalTowers.trim() === ""
        ? null
        : Number(projectForm.totalTowers);

    if (!cleanName) {
      alert("Project name is required.");
      return;
    }

    if (!cleanClientCode) {
      alert("Client code is required.");
      return;
    }

    if (
      !Number.isInteger(projectYear) ||
      projectYear < 2000 ||
      projectYear > 2100
    ) {
      alert("Enter a valid project year.");
      return;
    }

    if (!Number.isInteger(projectSequence) || projectSequence < 1) {
      alert("Enter a valid project sequence.");
      return;
    }

    if (
      totalTowers !== null &&
      (!Number.isFinite(totalTowers) || totalTowers < 0)
    ) {
      alert("Total towers must be a valid number.");
      return;
    }

    setSavingProject(true);

    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: cleanName,
          client: projectForm.client.trim(),
          clientCode: cleanClientCode,
          projectYear,
          projectSequence,
          location: projectForm.location.trim(),
          totalTowers,
          status: projectForm.status,
        }),
      });

      const result = (await response.json()) as {
        project?: Project;
        error?: string;
      };

      if (!response.ok || !result.project) {
        throw new Error(result.error || "Failed to update project details.");
      }

      setProject(result.project);
      setProjectForm(getProjectFormFromProject(result.project));
      setEditingProject(false);
    } catch (error) {
      console.error("project update error", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to update project details.",
      );
    } finally {
      setSavingProject(false);
    }
  }

  function goToTowerAction(towerId: string) {
    if (!actionType) return;
    if (actionType === "docket") router.push(`/project/${projectId}/tower/${towerId}/dockets`);
    if (actionType === "delivery") router.push(`/project/${projectId}/tower/${towerId}/deliveries`);
    if (actionType === "materials") router.push(`/project/${projectId}/tower/${towerId}/materials`);
  }

  function goToDocket(row: DocketLookupRow) {
    if (!row.docket.tower_id) return;
    router.push(`/project/${projectId}/tower/${row.docket.tower_id}/dockets`);
  }

  function getActionTitle(type: QuickActionType) {
    if (type === "docket") return "Select tower for Daily Docket";
    if (type === "delivery") return "Select tower for Delivery";
    if (type === "materials") return "Select tower for Materials";
    if (type === "docket_lookup") return "Docket Lookup";
    return "Select Tower";
  }

  function getActionSubtitle(type: QuickActionType) {
    if (type === "docket") return "Choose a tower, then open its Daily Dockets page.";
    if (type === "delivery") return "Choose a tower, then open its Deliveries page.";
    if (type === "materials") return "Choose a tower, then open its Materials page.";
    if (type === "docket_lookup") return "Search a date, crew or tower and open the associated docket register.";
    return "";
  }

  if (loading) return <div className="p-8">Loading project dashboard...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-8 space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {!editingProject ? (
          <div className="space-y-5">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div>
                {project?.project_number ? (
                  <div className="text-sm font-bold uppercase tracking-[0.12em] text-blue-600">
                    {project.project_number}
                  </div>
                ) : null}

                <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
                  {project?.name || `Project ${projectId}`}
                </h1>

                <p className="mt-2 text-slate-600">
                  Project-wide overview across all assigned towers.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {project?.sharepoint_url ? (
                  <a
                    href={project.sharepoint_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    Project Delivery
                  </a>
                ) : null}

                {project?.sharepoint_tender_url ? (
                  <a
                    href={project.sharepoint_tender_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    Tendering
                  </a>
                ) : null}

                {isAdmin ? (
                  <button
                    onClick={startEditingProject}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Edit Project
                  </button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Client
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {project?.client || "-"}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {project?.status || "-"}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Location
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {project?.location || "-"}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total Towers
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {project?.total_towers ?? stats.totalTowers}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Edit Project Details
                </h1>
                <p className="mt-2 text-sm text-slate-600">
                  Project numbering and SharePoint Project Delivery and Tendering folders
                  will stay synchronised with these details.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={cancelEditingProject}
                  disabled={savingProject}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>

                <button
                  onClick={saveProjectDetails}
                  disabled={savingProject}
                  className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {savingProject ? "Saving & Syncing..." : "Save Changes"}
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Project Name
                </label>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                  value={projectForm.name}
                  onChange={(e) =>
                    setProjectForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Client
                </label>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                  value={projectForm.client}
                  onChange={(e) =>
                    setProjectForm((prev) => ({ ...prev, client: e.target.value }))
                  }
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Client Code
                </label>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 uppercase"
                  value={projectForm.clientCode}
                  onChange={(e) =>
                    setProjectForm((prev) => ({
                      ...prev,
                      clientCode: e.target.value.toUpperCase(),
                    }))
                  }
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Project Year
                </label>
                <input
                  type="number"
                  min="2000"
                  max="2100"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                  value={projectForm.projectYear}
                  onChange={(e) =>
                    setProjectForm((prev) => ({
                      ...prev,
                      projectYear: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Project No.
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                  value={projectForm.projectSequence}
                  onChange={(e) =>
                    setProjectForm((prev) => ({
                      ...prev,
                      projectSequence: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total Towers
                </label>
                <input
                  type="number"
                  min="0"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                  value={projectForm.totalTowers}
                  onChange={(e) =>
                    setProjectForm((prev) => ({
                      ...prev,
                      totalTowers: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Location
                </label>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                  value={projectForm.location}
                  onChange={(e) =>
                    setProjectForm((prev) => ({
                      ...prev,
                      location: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Project Status
                </label>
                <select
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
                  value={projectForm.status}
                  onChange={(e) =>
                    setProjectForm((prev) => ({
                      ...prev,
                      status: e.target.value,
                    }))
                  }
                >
                  <option value="tendering">Tendering</option>
                  <option value="mobilising">Mobilising</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="demobilising">Demobilising</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                Project Number
              </div>
              <div className="mt-1 text-xl font-bold text-slate-950">
                {editedProjectNumber || "P-CLIENT-YY-001"}
              </div>
              <div className="mt-1 text-xs text-slate-600">
                Saving a changed project number or project name will rename both
                SharePoint project folders.
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid xl:grid-cols-[1.2fr_2fr] gap-6">
        <div className="grid sm:grid-cols-2 gap-4">
          <ProgressRing label="Overall Progress" value={stats.overallProgressPercent} sublabel={`${stats.towersComplete} complete • ${stats.towersInProgress} active`} tone="blue" />
          <ProgressRing label="Delivery Progress" value={stats.deliveryPercent} sublabel={`${formatDecimal(stats.deliveredQty, 0)} / ${formatDecimal(stats.totalRequiredQty, 0)} delivered`} tone="emerald" />
        </div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricTile title="Total Towers" value={String(stats.totalTowers)} subtitle={`${stats.towersNotStarted} not started`} accent="slate" />
          <MetricTile title="Production MH/t" value={formatDecimal(stats.productionManhoursPerTonne, 2)} subtitle={`${formatDecimal(stats.productionManhours, 1)} production hrs`} accent="purple" />
          <MetricTile title="Raw MH/t" value={formatDecimal(stats.manhoursPerTonne, 2)} subtitle={`${formatDecimal(stats.totalManhours, 1)} raw hrs`} accent="blue" />
          <MetricTile title="Open Defects" value={String(stats.openDefects)} subtitle={`${stats.totalDefects} total defects`} accent="rose" />
        </div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Daily Dockets" value={String(stats.totalDockets)} subtitle={`Latest: ${formatDate(stats.latestDocketDate)}`} />
        <StatCard title="Completed Tonnes" value={formatDecimal(stats.completedTonnes, 2)} subtitle={stats.totalTowerWeight !== null ? `${formatDecimal(stats.totalTowerWeight, 2)} total tower weight` : "Tower weights not found"} />
        <StatCard title="Towers Complete" value={String(stats.towersComplete)} subtitle={`${stats.towersInProgress} in progress`} />
        <StatCard title="Delivery Towers Active" value={String(stats.deliveryTowersInProgress)} subtitle="shown in logistics list below" />
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader title="Quick Actions" subtitle="Jump straight into common project tasks by selecting a tower." />

        <div className="mt-6 grid md:grid-cols-2 xl:grid-cols-4 gap-6">
          <QuickActionCard title="Add Daily Docket" description="Choose a tower and jump into its Daily Dockets page." accent="blue" onClick={() => openAction("docket")} />
          <QuickActionCard title="Docket Lookup" description="Search by date, crew or tower and open the matching docket register." accent="amber" onClick={() => openAction("docket_lookup")} />
          <QuickActionCard title="Add Delivery" description="Choose a tower and jump into its Deliveries page." accent="emerald" onClick={() => openAction("delivery")} />
          <QuickActionCard title="Search Materials" description="Choose a tower and jump into its Materials page." accent="purple" onClick={() => openAction("materials")} />
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader title="Current Towers In Progress" subtitle="Key live towers currently moving in this project." />

          {inProgressTowers.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">No towers currently in progress.</div>
          ) : (
            <div className="mt-6 space-y-3">
              {inProgressTowers.map((tower) => (
                <Link key={tower.id} href={`/project/${projectId}/tower/${tower.id}`} className="block">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:bg-slate-100 transition">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-base font-semibold text-slate-900">{getTowerDisplayName(tower)}</div>
                        <div className="text-sm text-slate-500 mt-1">
                          {tower.line || "Line not set"} • MH/t {formatDecimal(tower.productionMhPerTonne, 2)}
                        </div>
                      </div>

                      <div className="min-w-[120px] text-right">
                        <div className="text-sm font-semibold text-slate-900">{tower.computedProgress}%</div>
                        <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${clampPercent(tower.computedProgress)}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader title="Delivery Towers In Progress" subtitle="Towers where deliveries have started but still have outstanding material." />

          {deliveryTowersInProgress.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">No delivery towers currently in progress.</div>
          ) : (
            <div className="mt-6 space-y-3">
              {deliveryTowersInProgress.map((tower) => (
                <Link key={tower.id} href={`/project/${projectId}/tower/${tower.id}/deliveries`} className="block">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:bg-slate-100 transition">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-base font-semibold text-slate-900">{getTowerDisplayName(tower)}</div>
                        <div className="text-sm text-slate-500 mt-1">
                          Delivered {formatDecimal(tower.deliveredQty, 0)} / {formatDecimal(tower.requiredQty, 0)} • Outstanding {formatDecimal(tower.outstandingQty, 0)}
                        </div>
                      </div>

                      <div className="min-w-[120px] text-right">
                        <div className="text-sm font-semibold text-slate-900">{formatDecimal(tower.deliveryPercent, 0)}%</div>
                        <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${clampPercent(tower.deliveryPercent)}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid xl:grid-cols-3 gap-6">
        <CompactRankCard
          title="Best Performing Towers"
          emptyText="No tower production rates available yet."
          items={bestPerformingTowers.map((tower) => ({
            id: tower.id,
            label: getTowerDisplayName(tower),
            meta: `${tower.computedProgress}% progress • ${formatDecimal(tower.productionManhours, 1)} prod hrs`,
            value: `${formatDecimal(tower.productionMhPerTonne, 2)} MH/t`,
            href: `/project/${projectId}/tower/${tower.id}`,
          }))}
        />
        <CompactRankCard
          title="Watchlist Towers"
          emptyText="No watchlist towers yet."
          items={watchlistTowers.map((tower) => ({
            id: tower.id,
            label: getTowerDisplayName(tower),
            meta: `${tower.computedProgress}% progress • ${formatDecimal(tower.productionManhours, 1)} prod hrs`,
            value: `${formatDecimal(tower.productionMhPerTonne, 2)} MH/t`,
            href: `/project/${projectId}/tower/${tower.id}`,
          }))}
        />
        <CompactRankCard
          title="Completed Towers by Crew"
          emptyText="No completed towers allocated to crews yet."
          items={completedTowersByCrew.slice(0, 5).map((crew) => ({
            id: crew.crewName,
            label: crew.crewName,
            meta: crew.towerNames.join(", ") || "No towers listed",
            value: `${crew.completedTowers} complete`,
          }))}
        />
      </div>

      <div className="grid xl:grid-cols-2 gap-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader title="Crew Production Comparison" subtitle="Compares crew production using docket progress gain, tower weight and production manhours." />

          {crewProduction.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">No crew production data yet.</div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-3 pr-4 font-medium">Crew</th>
                    <th className="py-3 pr-4 font-medium">Dockets</th>
                    <th className="py-3 pr-4 font-medium">Raw Hrs</th>
                    <th className="py-3 pr-4 font-medium">Prod Hrs</th>
                    <th className="py-3 pr-4 font-medium">Prod. Tonnes</th>
                    <th className="py-3 pr-4 font-medium">Prod MH/t</th>
                    <th className="py-3 pr-4 font-medium">Towers</th>
                  </tr>
                </thead>
                <tbody>
                  {crewProduction.map((crew) => (
                    <tr key={crew.crewName} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 pr-4 font-semibold text-slate-900">{crew.crewName}</td>
                      <td className="py-3 pr-4 text-slate-600">{crew.docketCount}</td>
                      <td className="py-3 pr-4 text-slate-600">{formatDecimal(crew.totalHours, 1)}</td>
                      <td className="py-3 pr-4 text-slate-600">{formatDecimal(crew.productionHours, 1)}</td>
                      <td className="py-3 pr-4 text-slate-600">{formatDecimal(crew.productionTonnes, 2)}</td>
                      <td className="py-3 pr-4 font-semibold text-slate-900">{formatDecimal(crew.mhPerTonne, 2)}</td>
                      <td className="py-3 pr-4 text-slate-600">{crew.towersTouched} touched • {crew.completedTowers} complete</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader title="Project Logistics" subtitle="High-level delivery and material movement across the project." />

          <div className="mt-6 grid grid-cols-2 gap-4">
            <MetricTile title="Delivery Records" value={String(stats.totalDeliveries)} subtitle="logged delivery events" accent="blue" />
            <MetricTile title="Delivered Qty" value={formatDecimal(stats.deliveredQty, 0)} subtitle={`of ${formatDecimal(stats.totalRequiredQty, 0)} required`} accent="emerald" />
            <MetricTile title="Outstanding Qty" value={formatDecimal(stats.outstandingQty, 0)} subtitle="still to arrive" accent="rose" />
            <MetricTile title="Delivery Progress" value={`${formatDecimal(stats.deliveryPercent, 0)}%`} subtitle="delivered vs required" accent="amber" />
          </div>

          <div className="mt-6 h-4 rounded-full overflow-hidden bg-slate-100">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600" style={{ width: `${stats.deliveryPercent}%` }} />
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader
          title="Project Analytics View"
          subtitle="Filter the project like a dashboard: compare by raw MH/t, production MH/t, crew allocation or completed towers."
        />

        <div className="mt-6 grid md:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">View mode</label>
            <select value={analyticsView} onChange={(e) => setAnalyticsView(e.target.value as AnalyticsView)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
              <option value="tower_performance">Tower Performance</option>
              <option value="crew_performance">Towers by Crew</option>
              <option value="mh_per_tonne">Raw MH/T</option>
              <option value="production_mh_per_tonne">Production MH/T</option>
              <option value="completed_towers">Completed Towers</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Crew filter</label>
            <select value={analyticsCrewFilter} onChange={(e) => setAnalyticsCrewFilter(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
              {analyticsCrewOptions.map((crew) => <option key={crew} value={crew}>{crew === "all" ? "All crews" : crew}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Sort</label>
            <select value={analyticsSortDirection} onChange={(e) => setAnalyticsSortDirection(e.target.value as SortDirection)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
              <option value="best">Best first</option>
              <option value="worst">Worst first</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Rows</label>
            <select value={analyticsRowsToShow} onChange={(e) => setAnalyticsRowsToShow(e.target.value as RowsToShow)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
              <option value="10">10 rows</option>
              <option value="25">25 rows</option>
              <option value="50">50 rows</option>
              <option value="all">All rows</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1">Search tower</label>
            <input
              value={analyticsSearch}
              onChange={(e) => setAnalyticsSearch(e.target.value)}
              placeholder="Search tower, line or status..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3 w-fit">
          <div className="text-xs uppercase tracking-wide text-slate-500">Rows shown</div>
          <div className="mt-1 text-xl font-black text-slate-900">{visibleAnalyticsRows.length} / {analyticsRows.length}</div>
        </div>

        <div className="mt-6 hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-3 pr-4 font-medium">Tower</th>
                <th className="py-3 pr-4 font-medium">Progress</th>
                <th className="py-3 pr-4 font-medium">Raw Hrs</th>
                <th className="py-3 pr-4 font-medium">Prod Hrs</th>
                <th className="py-3 pr-4 font-medium">Tonnes</th>
                <th className="py-3 pr-4 font-medium">Raw MH/t</th>
                <th className="py-3 pr-4 font-medium">Prod MH/t</th>
              </tr>
            </thead>
            <tbody>
              {visibleAnalyticsRows.map((tower) => (
                <tr key={tower.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 pr-4 font-semibold text-slate-900"><Link href={`/project/${projectId}/tower/${tower.id}`} className="hover:underline">{getTowerDisplayName(tower)}</Link></td>
                  <td className="py-3 pr-4 text-slate-600">{tower.computedProgress}%</td>
                  <td className="py-3 pr-4 text-slate-600">{formatDecimal(tower.manhours, 1)}</td>
                  <td className="py-3 pr-4 text-slate-600">{formatDecimal(tower.productionManhours, 1)}</td>
                  <td className="py-3 pr-4 text-slate-600">{formatDecimal(tower.completedTonnes, 2)}</td>
                  <td className="py-3 pr-4 text-slate-600">{formatDecimal(tower.rawMhPerTonne, 2)}</td>
                  <td className="py-3 pr-4 font-semibold text-slate-900">{formatDecimal(tower.productionMhPerTonne, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 md:hidden space-y-3">
          {visibleAnalyticsRows.map((tower) => (
            <Link key={tower.id} href={`/project/${projectId}/tower/${tower.id}`} className="block rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">{getTowerDisplayName(tower)}</div>
                  <div className="mt-1 text-xs text-slate-500">{tower.computedProgress}% progress • {formatDecimal(tower.completedTonnes, 2)} t</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Prod MH/t</div>
                  <div className="text-lg font-black text-slate-900">{formatDecimal(tower.productionMhPerTonne, 2)}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader
          title="Performance Trend Analytics"
          subtitle="Track raw MH/t and production MH/t across dates to see whether certain periods, crews or conditions are performing better or worse."
        />

        <div className="mt-6 grid md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Crew</label>
            <select value={trendCrewFilter} onChange={(e) => setTrendCrewFilter(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
              {trendCrewOptions.map((crew) => <option key={crew} value={crew}>{crew === "all" ? "All crews" : crew}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Start date</label>
            <input type="date" value={trendStartDate} onChange={(e) => setTrendStartDate(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">End date</label>
            <input type="date" value={trendEndDate} onChange={(e) => setTrendEndDate(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Metric</label>
            <select value={trendMetric} onChange={(e) => setTrendMetric(e.target.value as TrendMetric)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
              <option value="both">Raw + Production</option>
              <option value="raw">Raw MH/t only</option>
              <option value="production">Production MH/t only</option>
            </select>
          </div>
          <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Dates shown</div>
            <div className="mt-1 text-xl font-black text-slate-900">{trendRows.length}</div>
          </div>
        </div>

        <div className="mt-6 grid md:grid-cols-5 gap-4">
          <MetricTile title="Period Raw MH/t" value={formatDecimal(trendPeriodSummary.rawMhPerTonne, 2)} subtitle={`${formatDecimal(trendPeriodSummary.rawHours, 1)} raw hrs`} accent="blue" />
          <MetricTile title="Period Prod MH/t" value={formatDecimal(trendPeriodSummary.productionMhPerTonne, 2)} subtitle={`${formatDecimal(trendPeriodSummary.productionHours, 1)} production hrs`} accent="purple" />
          <MetricTile title="Period Tonnes" value={formatDecimal(trendPeriodSummary.productionTonnes, 2)} subtitle="calculated from progress movement" accent="emerald" />
          <MetricTile title="Dockets" value={String(trendPeriodSummary.docketCount)} subtitle="within selected range" accent="slate" />
          <MetricTile title="Crew Filter" value={trendCrewFilter === "all" ? "All" : trendCrewFilter} subtitle={trendStartDate || trendEndDate ? `${trendStartDate || "start"} to ${trendEndDate || "latest"}` : "all dates"} accent="amber" />
        </div>

        <TrendBarChart rows={trendRows} metric={trendMetric} />
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader
          title="Forecasting"
          subtitle="Forecast only — recommended mode uses tower type actuals, then falls back to recent project actuals and project average where data is thin."
          action={
            <div className="w-full sm:w-auto">
              <label className="block text-xs font-medium text-slate-500 mb-1">Forecast benchmark</label>
              <select
                value={forecastBenchmark}
                onChange={(e) => setForecastBenchmark(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                {forecastBenchmarkOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          }
        />

        <div className="mt-6 grid md:grid-cols-5 gap-3">
          <MetricTile
            title="Benchmark"
            value={selectedForecastBenchmark.label}
            subtitle={forecastBenchmark === "tower_type" ? `${towerTypeBenchmarks.length} tower type benchmarks` : `${formatDecimal(selectedForecastBenchmark.mhPerTonne, 2)} raw MH/t`}
            accent="purple"
          />
          <MetricTile
            title="Recent Daily Raw Hours"
            value={formatDecimal(recentProjectBenchmark.dailyRawHours || selectedForecastBenchmark.dailyRawHours, 1)}
            subtitle="recent/project avg hrs/day"
            accent="blue"
          />
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Rows</label>
            <select value={forecastRowsToShow} onChange={(e) => setForecastRowsToShow(e.target.value as RowsToShow)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
              <option value="10">10 rows</option>
              <option value="25">25 rows</option>
              <option value="50">50 rows</option>
              <option value="all">All rows</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1">Search tower</label>
            <input
              value={forecastSearch}
              onChange={(e) => setForecastSearch(e.target.value)}
              placeholder="Search tower, line or status..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3 w-fit">
          <div className="text-xs uppercase tracking-wide text-slate-500">Rows shown</div>
          <div className="mt-1 text-xl font-black text-slate-900">{visibleForecastRows.length} / {forecastRows.length}</div>
        </div>

        {forecastRows.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">
            No towers available for forecasting. Towers need a weight from CSV and remaining progress.
          </div>
        ) : (
          <>
            <div className="mt-6 hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-3 pr-4 font-medium">Tower</th>
                    <th className="py-3 pr-4 font-medium">Type</th>
                    <th className="py-3 pr-4 font-medium">Progress</th>
                    <th className="py-3 pr-4 font-medium">Remaining t</th>
                    <th className="py-3 pr-4 font-medium">Benchmark</th>
                    <th className="py-3 pr-4 font-medium">Forecast raw hrs</th>
                    <th className="py-3 pr-4 font-medium">Forecast duration</th>
                    <th className="py-3 pr-4 font-medium">Old method</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleForecastRows.map((row) => (
                    <tr key={row.towerId} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 pr-4 font-semibold text-slate-900">
                        <Link href={`/project/${projectId}/tower/${row.towerId}`} className="hover:underline">{row.towerName}</Link>
                      </td>
                      <td className="py-3 pr-4 text-slate-600">{row.towerType}</td>
                      <td className="py-3 pr-4 text-slate-600">{row.progress}%</td>
                      <td className="py-3 pr-4 text-slate-600">{formatDecimal(row.remainingTonnes, 2)}</td>
                      <td className="py-3 pr-4 text-slate-600">
                        <div className="font-semibold text-slate-900">{row.benchmarkLabel}</div>
                        <div className="text-xs text-slate-500">{formatDecimal(row.benchmarkMhPerTonne, 2)} MH/t • {row.confidence} confidence</div>
                      </td>
                      <td className="py-3 pr-4 text-slate-600">{formatDecimal(row.forecastRawHours, 1)}</td>
                      <td className="py-3 pr-4"><ForecastBadge value={row.forecastDays} /></td>
                      <td className="py-3 pr-4 text-slate-500">{formatDecimal(row.oldProjectAverageDays, 1)} days</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 md:hidden space-y-3">
              {visibleForecastRows.map((row) => (
                <Link key={row.towerId} href={`/project/${projectId}/tower/${row.towerId}`} className="block rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{row.towerName}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {row.progress}% progress • {row.towerType} • {formatDecimal(row.remainingTonnes, 2)} t remaining
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {formatDecimal(row.forecastRawHours, 1)} forecast raw hrs • {row.benchmarkLabel}
                      </div>
                    </div>
                    <ForecastBadge value={row.forecastDays} />
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader title="Project Towers" subtitle="Open any tower dashboard in this project. Production rate is shown as MH/t where tower weight and docket hours are available." />

        {towers.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">No towers found in this project yet.</div>
        ) : (
          <div className="mt-6 grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {towerProductionSummaries.map((tower) => {
              const deliverySummary = deliverySummaryByTowerId.get(tower.id) || { deliveryPercent: 0 };

              return (
                <Link key={tower.id} href={`/project/${projectId}/tower/${tower.id}`}>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-slate-900">{getTowerDisplayName(tower)}</div>
                        <div className="text-sm text-slate-500 mt-1">{tower.line || "Line not set"}</div>
                      </div>

                      <span className={`inline-block text-xs px-3 py-1 rounded-full ${getStatusBadgeClasses(safeString(tower.status, ""))}`}>{tower.status || "unknown"}</span>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                      <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                        <div className="text-slate-500 text-xs">Progress</div>
                        <div className="mt-1 font-bold text-slate-900">{tower.computedProgress}%</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                        <div className="text-slate-500 text-xs">Prod MH/t</div>
                        <div className="mt-1 font-bold text-slate-900">{formatDecimal(tower.productionMhPerTonne, 2)}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                        <div className="text-slate-500 text-xs">Delivery</div>
                        <div className="mt-1 font-bold text-slate-900">{formatDecimal(deliverySummary.deliveryPercent, 0)}%</div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between text-sm text-slate-600">
                        <span>Tower Progress</span>
                        <span className="font-semibold text-slate-900">{tower.computedProgress}%</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${clampPercent(tower.computedProgress)}%` }} />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {actionType && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-3xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900">{getActionTitle(actionType)}</h2>
                  <p className="mt-2 text-sm text-slate-600">{getActionSubtitle(actionType)}</p>
                </div>

                <button onClick={closeAction} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50">
                  Close
                </button>
              </div>

              {actionType === "docket_lookup" ? (
                <div className="mt-4 grid md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Docket date</label>
                    <input type="date" value={docketLookupDate} onChange={(e) => setDocketLookupDate(e.target.value)} className="w-full border border-slate-300 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Crew</label>
                    <select value={docketLookupCrewFilter} onChange={(e) => setDocketLookupCrewFilter(e.target.value)} className="w-full border border-slate-300 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                      {docketLookupCrewOptions.map((crew) => <option key={crew} value={crew}>{crew === "all" ? "All crews" : crew}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
                    <input value={docketLookupSearch} onChange={(e) => setDocketLookupSearch(e.target.value)} placeholder="Tower, type, LH..." className="w-full border border-slate-300 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <input value={towerSearch} onChange={(e) => setTowerSearch(e.target.value)} placeholder="Search tower name, line or status..." className="w-full border border-slate-300 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}
            </div>

            <div className="p-6 max-h-[60vh] overflow-auto">
              {actionType === "docket_lookup" ? (
                docketLookupRows.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">No dockets match that lookup.</div>
                ) : (
                  <div className="space-y-3">
                    {docketLookupRows.map((row) => (
                      <button key={row.docket.id} onClick={() => goToDocket(row)} className="w-full text-left rounded-2xl border border-slate-200 bg-white p-4 hover:bg-slate-50 transition">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="font-semibold text-slate-900">{row.tower ? getTowerDisplayName(row.tower) : "Tower not linked"}</div>
                            <div className="mt-1 text-sm text-slate-500">
                              {formatDate(row.docket.docket_date)} • {row.docket.crew || row.docket.leading_hand || "Unassigned Crew"} • LH {row.docket.leading_hand || "-"}
                            </div>
                            <div className="mt-2 text-xs text-slate-500">
                              Raw {formatDecimal(row.rawHours, 1)} hrs • Production {formatDecimal(row.productionHours, 1)} hrs • Progress {row.progress}%
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-xs uppercase tracking-wide text-slate-500">Open</div>
                            <div className="mt-1 text-sm font-semibold text-blue-600">Dockets</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              ) : filteredTowers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">No towers match your search.</div>
              ) : (
                <div className="space-y-3">
                  {filteredTowers.map((tower) => {
                    const computedProgress = getTowerComputedProgress(tower, dockets);
                    return (
                      <button key={tower.id} onClick={() => goToTowerAction(tower.id)} className="w-full text-left rounded-2xl border border-slate-200 bg-white p-4 hover:bg-slate-50 transition">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="font-semibold text-slate-900">{getTowerDisplayName(tower)}</div>
                            <div className="text-sm text-slate-500 mt-1">
                              {tower.line || "Line not set"} • {tower.status || "Status not set"}
                            </div>
                          </div>

                          <div className="min-w-[120px] text-right">
                            <div className="text-sm font-semibold text-slate-900">
                              {`${computedProgress}%`}
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
                              <div className="h-full rounded-full bg-blue-500" style={{ width: `${clampPercent(computedProgress)}%` }} />
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
