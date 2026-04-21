"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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

type GenericDocumentRow = {
  id?: string;
  tower_id?: string | null;
  status?: string | null;
  category?: string | null;
  type?: string | null;
  document_type?: string | null;
  expiry_date?: string | null;
  valid_to?: string | null;
  end_date?: string | null;
  issue_date?: string | null;
  start_date?: string | null;
  is_active?: boolean | null;
};

type ItcDocumentRow = {
  id: string;
  tower_id: string;
  status?: string | null;
  itc_mode?: "BC" | "Client" | string | null;
  revision?: string | null;
};

type ItcItemRow = {
  id: string;
  itc_id: string;
  validation?: "" | "Y" | "N" | "NA" | null;
};

type ItcTorqueRow = {
  id: string;
  itc_id: string;
  torque_achieved?: string | null;
};

type ItcClientUploadRow = {
  id: string;
  tower_id: string;
};

type DocumentMetrics = {
  totalSafetyDocs: number;
  activeSafetyDocs: number;
  expiredSafetyDocs: number;
  expiringSoonSafetyDocs: number;
};

type ItcMetrics = {
  hasItc: boolean;
  itcMode: string;
  itcStatus: string;
  revision: string;
  checklistTotal: number;
  checklistComplete: number;
  checklistFailed: number;
  checklistPending: number;
  torqueTotal: number;
  torqueComplete: number;
  clientUploadCount: number;
  overallReady: boolean;
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
  totalSafetyDocs: number;
  activeSafetyDocs: number;
  expiredSafetyDocs: number;
  expiringSoonSafetyDocs: number;
  towerWeightTonnes: number | null;
  completedTonnes: number | null;
  manhoursPerTonne: number | null;
};

function formatLabel(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function formatDecimal(value: number | null, decimals = 2) {
  if (value === null || Number.isNaN(value)) return "-";
  return value.toFixed(decimals);
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

  const genericWeightEntry = entries.find(([key]) => {
    const k = key.trim().toLowerCase();
    return k.includes("weight");
  });

  if (genericWeightEntry) {
    return extractNumericValue(genericWeightEntry[1]);
  }

  const massEntry = entries.find(([key]) => {
    const k = key.trim().toLowerCase();
    return k.includes("mass");
  });

  if (massEntry) {
    return extractNumericValue(massEntry[1]);
  }

  return null;
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

function isSafetyDocument(doc: GenericDocumentRow) {
  const values = [doc.category, doc.type, doc.document_type, doc.status]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());

  if (values.length === 0) return true;

  return values.some((value) =>
    [
      "safety",
      "permit",
      "swms",
      "itc",
      "checklist",
      "sign on",
      "sign-on",
      "lift",
      "study",
      "wms",
      "jsea",
      "jsa",
    ].some((keyword) => value.includes(keyword)),
  );
}

function getDocumentExpiryDate(doc: GenericDocumentRow) {
  return doc.expiry_date || doc.valid_to || doc.end_date || null;
}

function isDocumentExpired(expiryDate: string | null, today: Date) {
  if (!expiryDate) return false;
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return false;

  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const expiryOnly = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());

  return expiryOnly < todayOnly;
}

function isDocumentExpiringSoon(expiryDate: string | null, today: Date) {
  if (!expiryDate) return false;
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return false;

  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const soon = new Date(todayOnly);
  soon.setDate(soon.getDate() + 14);

  const expiryOnly = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());

  return expiryOnly >= todayOnly && expiryOnly <= soon;
}

function getDocumentMetrics(documents: GenericDocumentRow[]): DocumentMetrics {
  const today = new Date();
  const safetyDocs = documents.filter(isSafetyDocument);

  const expiredSafetyDocs = safetyDocs.filter((doc) =>
    isDocumentExpired(getDocumentExpiryDate(doc), today),
  ).length;

  const expiringSoonSafetyDocs = safetyDocs.filter((doc) =>
    isDocumentExpiringSoon(getDocumentExpiryDate(doc), today),
  ).length;

  const activeSafetyDocs = safetyDocs.filter((doc) => {
    if (doc.is_active === true) return true;
    const status = (doc.status || "").toLowerCase();
    return !["expired", "inactive", "superseded"].includes(status);
  }).length;

  return {
    totalSafetyDocs: safetyDocs.length,
    activeSafetyDocs,
    expiredSafetyDocs,
    expiringSoonSafetyDocs,
  };
}

function getBadgeClasses(kind: "green" | "yellow" | "red" | "blue" | "slate") {
  switch (kind) {
    case "green":
      return "bg-green-100 text-green-700 border-green-200";
    case "yellow":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "red":
      return "bg-red-100 text-red-700 border-red-200";
    case "blue":
      return "bg-blue-100 text-blue-700 border-blue-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function getItcStatusKind(status: string) {
  const s = status.trim().toLowerCase();
  if (s === "approved" || s === "closed" || s === "submitted") return "green";
  if (s === "draft") return "yellow";
  return "slate";
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

function DonutWheel({
  value,
  label,
  sublabel,
  color,
}: {
  value: number;
  label: string;
  sublabel?: string;
  color: string;
}) {
  const safeValue = clampPercent(value);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div
          className="relative h-20 w-20 rounded-full"
          style={{
            background: `conic-gradient(${color} 0deg ${safeValue * 3.6}deg, #e5e7eb ${safeValue * 3.6}deg 360deg)`,
          }}
        >
          <div className="absolute inset-[8px] rounded-full bg-white flex items-center justify-center">
            <span className="text-lg font-bold text-slate-900">
              {Math.round(safeValue)}%
            </span>
          </div>
        </div>

        <div>
          <div className="text-sm text-slate-500">{label}</div>
          <div className="text-xl font-semibold text-slate-900 mt-1">
            {Math.round(safeValue)}%
          </div>
          {sublabel ? <div className="text-sm text-slate-500 mt-1">{sublabel}</div> : null}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
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

async function safeSelect<T>(
  supabase: ReturnType<typeof createSupabaseBrowser>,
  table: string,
  select: string,
  filters?: Array<{ column: string; value: string }>,
) {
  try {
    let query = supabase.from(table).select(select);
    for (const filter of filters || []) {
      query = query.eq(filter.column, filter.value);
    }
    const { data, error } = await query;
    if (error) return [] as T[];
    return (data as T[] | null) ?? [];
  } catch {
    return [] as T[];
  }
}

async function safeSelectFirstExisting<T>(
  supabase: ReturnType<typeof createSupabaseBrowser>,
  tables: string[],
  select: string,
  filters?: Array<{ column: string; value: string }>,
) {
  for (const table of tables) {
    const rows = await safeSelect<T>(supabase, table, select, filters);
    if (rows.length > 0) return rows;
  }
  return [] as T[];
}

export default function TowerOverviewPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<Tower | null>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [coverPhotoUrl, setCoverPhotoUrl] = useState<string | null>(null);

  const [dockets, setDockets] = useState<DocketRow[]>([]);
  const [labourRows, setLabourRows] = useState<LabourRow[]>([]);
  const [defects, setDefects] = useState<DefectRow[]>([]);
  const [modifications, setModifications] = useState<ModificationRow[]>([]);
  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [deliveryItems, setDeliveryItems] = useState<DeliveryItemRow[]>([]);
  const [documents, setDocuments] = useState<GenericDocumentRow[]>([]);
  const [itcMetrics, setItcMetrics] = useState<ItcMetrics>({
    hasItc: false,
    itcMode: "-",
    itcStatus: "-",
    revision: "-",
    checklistTotal: 0,
    checklistComplete: 0,
    checklistFailed: 0,
    checklistPending: 0,
    torqueTotal: 0,
    torqueComplete: 0,
    clientUploadCount: 0,
    overallReady: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [towerId]);

  async function load() {
    setLoading(true);

    const towerRes = await supabase.from("towers").select("*").eq("id", towerId).single();

    const towerData = (towerRes.data as Tower | null) ?? null;
    setTower(towerData);

    if (towerData?.cover_photo_path) {
      const { data } = supabase.storage
        .from("tower-photos")
        .getPublicUrl(towerData.cover_photo_path);
      setCoverPhotoUrl(data.publicUrl);
    } else {
      setCoverPhotoUrl(null);
    }

    const docketData = await safeSelect<DocketRow>(
      supabase,
      "tower_daily_dockets",
      "id, docket_date, assembly_percent, erection_percent, weather_delay_hours, lightning_delay_hours, toolbox_delay_hours, other_delay_hours",
      [{ column: "tower_id", value: towerId }],
    );

    docketData.sort((a, b) => {
      const aDate = a.docket_date ? new Date(a.docket_date).getTime() : 0;
      const bDate = b.docket_date ? new Date(b.docket_date).getTime() : 0;
      return bDate - aDate;
    });

    setDockets(docketData);
    setLatestDate(docketData[0]?.docket_date ?? null);

    const docketIds = docketData.map((d) => d.id).filter(Boolean);

    let labourData: LabourRow[] = [];
    if (docketIds.length > 0) {
      labourData = await safeSelectFirstExisting<LabourRow>(
        supabase,
        ["tower_docket_labour", "tower_daily_docket_labour", "tower_daily_docket_labour_rows"],
        "docket_id, total_hours",
      );

      labourData = labourData.filter((row) => docketIds.includes(row.docket_id));
    }

    const [
      defectsData,
      modificationsData,
      bundlesData,
      deliveriesData,
      deliveryItemsData,
      documentsData,
    ] = await Promise.all([
      safeSelect<DefectRow>(supabase, "tower_defects", "id, status", [
        { column: "tower_id", value: towerId },
      ]),
      safeSelect<ModificationRow>(supabase, "tower_modifications", "id", [
        { column: "tower_id", value: towerId },
      ]),
      safeSelectFirstExisting<BundleRow>(
        supabase,
        ["tower_bundle_register", "tower_bundles", "tower_delivery_bundles"],
        "bundle_no, qty_required",
        [{ column: "tower_id", value: towerId }],
      ),
      safeSelect<DeliveryRow>(supabase, "tower_deliveries", "id", [
        { column: "tower_id", value: towerId },
      ]),
      safeSelectFirstExisting<DeliveryItemRow>(
        supabase,
        ["tower_delivery_items", "tower_delivered_items"],
        "delivery_id, bundle_no, qty_delivered",
      ),
      safeSelectFirstExisting<GenericDocumentRow>(
        supabase,
        ["tower_workpack_documents", "tower_documents", "tower_safety_documents"],
        "id, tower_id, status, category, type, document_type, expiry_date, valid_to, end_date, issue_date, start_date, is_active",
        [{ column: "tower_id", value: towerId }],
      ),
    ]);

    setLabourRows(labourData);
    setDefects(defectsData);
    setModifications(modificationsData);
    setBundles(bundlesData);
    setDeliveries(deliveriesData);
    setDeliveryItems(deliveryItemsData);
    setDocuments(documentsData);

    const itcDocs = await safeSelect<ItcDocumentRow>(
      supabase,
      "tower_itc_documents",
      "id, tower_id, status, itc_mode, revision",
      [{ column: "tower_id", value: towerId }],
    );

    const latestItc = itcDocs[0] ?? null;

    if (!latestItc) {
      setItcMetrics({
        hasItc: false,
        itcMode: "-",
        itcStatus: "-",
        revision: "-",
        checklistTotal: 0,
        checklistComplete: 0,
        checklistFailed: 0,
        checklistPending: 0,
        torqueTotal: 0,
        torqueComplete: 0,
        clientUploadCount: 0,
        overallReady: false,
      });
    } else {
      const [itcItems, torqueRows, clientUploads] = await Promise.all([
        safeSelect<ItcItemRow>(
          supabase,
          "tower_itc_items",
          "id, itc_id, validation",
          [{ column: "itc_id", value: latestItc.id }],
        ),
        safeSelect<ItcTorqueRow>(
          supabase,
          "tower_itc_torque",
          "id, itc_id, torque_achieved",
          [{ column: "itc_id", value: latestItc.id }],
        ),
        safeSelect<ItcClientUploadRow>(
          supabase,
          "tower_itc_client_uploads",
          "id, tower_id",
          [{ column: "tower_id", value: towerId }],
        ),
      ]);

      const checklistTotal = itcItems.length;
      const checklistComplete = itcItems.filter(
        (item) => item.validation === "Y" || item.validation === "NA",
      ).length;
      const checklistFailed = itcItems.filter(
        (item) => item.validation === "N",
      ).length;
      const checklistPending = checklistTotal - checklistComplete - checklistFailed;

      const torqueTotal = torqueRows.length;
      const torqueComplete = torqueRows.filter(
        (row) => String(row.torque_achieved || "").trim() !== "",
      ).length;

      const mode = latestItc.itc_mode || "BC";

      const overallReady =
        mode === "Client"
          ? clientUploads.length > 0
          : checklistTotal > 0 &&
            checklistFailed === 0 &&
            checklistPending === 0 &&
            torqueTotal > 0 &&
            torqueComplete === torqueTotal;

      setItcMetrics({
        hasItc: true,
        itcMode: mode,
        itcStatus: latestItc.status || "Draft",
        revision: latestItc.revision || "-",
        checklistTotal,
        checklistComplete,
        checklistFailed,
        checklistPending,
        torqueTotal,
        torqueComplete,
        clientUploadCount: clientUploads.length,
        overallReady,
      });
    }

    setLoading(false);
  }

  const stats = useMemo<OverviewStats>(() => {
    const totalHours = labourRows.reduce(
      (sum, row) => sum + Number(row.total_hours || 0),
      0,
    );

    const totalWeatherDelay = dockets.reduce(
      (sum, row) => sum + Number(row.weather_delay_hours || 0),
      0,
    );
    const totalLightningDelay = dockets.reduce(
      (sum, row) => sum + Number(row.lightning_delay_hours || 0),
      0,
    );
    const totalToolboxDelay = dockets.reduce(
      (sum, row) => sum + Number(row.toolbox_delay_hours || 0),
      0,
    );
    const totalOtherDelay = dockets.reduce(
      (sum, row) => sum + Number(row.other_delay_hours || 0),
      0,
    );
    const totalDelayHours =
      totalWeatherDelay +
      totalLightningDelay +
      totalToolboxDelay +
      totalOtherDelay;

    const defectCount = defects.length;
    const openDefectCount = getOpenDefectCount(defects);
    const closedDefectCount = defectCount - openDefectCount;
    const modificationCount = modifications.length;

    const totalRequiredBundles = bundles.length;
    const totalRequiredQty = bundles.reduce(
      (sum, row) => sum + Number(row.qty_required || 0),
      0,
    );

    const deliveredQty = deliveryItems.reduce(
      (sum, row) => sum + Number(row.qty_delivered || 0),
      0,
    );
    const outstandingQty = Math.max(0, totalRequiredQty - deliveredQty);
    const deliveryPercent =
      totalRequiredQty > 0
        ? clampPercent((deliveredQty / totalRequiredQty) * 100)
        : 0;

    const computedProgress = getProgressFromDockets(dockets);
    const remainingProgress = Math.max(0, 100 - computedProgress);
    const computedStatus = getStatusFromProgress(computedProgress);

    const documentMetrics = getDocumentMetrics(documents);

    const towerWeightTonnes = getTowerWeightFromExtraData(tower?.extra_data);
    const completedTonnes =
      towerWeightTonnes !== null ? towerWeightTonnes * (computedProgress / 100) : null;
    const manhoursPerTonne =
      completedTonnes && completedTonnes > 0 ? totalHours / completedTonnes : null;

    return {
      latestDate,
      docketCount: dockets.length,
      totalHours,
      totalWeatherDelay,
      totalLightningDelay,
      totalToolboxDelay,
      totalOtherDelay,
      totalDelayHours,
      defectCount,
      openDefectCount,
      closedDefectCount,
      modificationCount,
      totalRequiredBundles,
      totalRequiredQty,
      deliveredQty,
      outstandingQty,
      deliveryPercent,
      computedProgress,
      remainingProgress,
      computedStatus,
      totalSafetyDocs: documentMetrics.totalSafetyDocs,
      activeSafetyDocs: documentMetrics.activeSafetyDocs,
      expiredSafetyDocs: documentMetrics.expiredSafetyDocs,
      expiringSoonSafetyDocs: documentMetrics.expiringSoonSafetyDocs,
      towerWeightTonnes,
      completedTonnes,
      manhoursPerTonne,
    };
  }, [
    labourRows,
    dockets,
    defects,
    modifications,
    bundles,
    deliveryItems,
    documents,
    tower?.extra_data,
    latestDate,
  ]);

  const extraFields = useMemo(() => {
    const extra = tower?.extra_data || {};
    return Object.entries(extra).sort(([a], [b]) => a.localeCompare(b));
  }, [tower?.extra_data]);

  const safetyActivePercent = useMemo(() => {
    if (stats.totalSafetyDocs <= 0) return 0;
    return clampPercent((stats.activeSafetyDocs / stats.totalSafetyDocs) * 100);
  }, [stats.activeSafetyDocs, stats.totalSafetyDocs]);

  const itcCompletionPercent = useMemo(() => {
    if (!itcMetrics.hasItc) return 0;
    if (itcMetrics.itcMode === "Client") {
      return itcMetrics.clientUploadCount > 0 ? 100 : 0;
    }
    if (itcMetrics.checklistTotal <= 0) return 0;
    return clampPercent((itcMetrics.checklistComplete / itcMetrics.checklistTotal) * 100);
  }, [
    itcMetrics.hasItc,
    itcMetrics.itcMode,
    itcMetrics.clientUploadCount,
    itcMetrics.checklistComplete,
    itcMetrics.checklistTotal,
  ]);

  if (loading || !tower) {
    return <div className="p-8">Loading tower overview...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8 space-y-6">
      <TowerHeader
        projectId={projectId}
        tower={tower}
        latestDate={stats.latestDate}
      />

      {(coverPhotoUrl || tower.cover_photo_path) && (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {coverPhotoUrl ? (
            <img
              src={coverPhotoUrl}
              alt="Tower cover"
              className="h-72 w-full object-cover"
            />
          ) : null}
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader
          title="Tower Performance"
          subtitle="High-level delivery, progress and production metrics."
        />

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
          <MetricTile
            title="Tower Progress"
            value={`${stats.computedProgress}%`}
            subtitle={`${stats.remainingProgress}% remaining`}
            accent="blue"
          />
          <MetricTile
            title="Manhours"
            value={formatDecimal(stats.totalHours, 1)}
            subtitle={`Dockets logged: ${stats.docketCount}`}
            accent="purple"
          />
          <MetricTile
            title="Delivery Progress"
            value={`${formatDecimal(stats.deliveryPercent, 0)}%`}
            subtitle={`Outstanding qty: ${formatDecimal(stats.outstandingQty, 0)}`}
            accent="emerald"
          />
          <MetricTile
            title="Manhours / Tonne"
            value={formatDecimal(stats.manhoursPerTonne, 2)}
            subtitle={
              stats.towerWeightTonnes !== null
                ? `Tower weight: ${formatDecimal(stats.towerWeightTonnes, 2)} t`
                : "Tower weight not found"
            }
            accent="amber"
          />
          <MetricTile
            title="Last Docket"
            value={stats.latestDate || "-"}
            subtitle="latest submitted date"
            accent="slate"
          />
          <MetricTile
            title="Completed Tonnes"
            value={
              stats.completedTonnes !== null
                ? `${formatDecimal(stats.completedTonnes, 2)} t`
                : "-"
            }
            subtitle={tower.status || stats.computedStatus}
            accent="blue"
          />
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <DonutWheel
            value={stats.computedProgress}
            label="Total Progress"
            sublabel={`${stats.remainingProgress}% remaining`}
            color="#2563eb"
          />
          <DonutWheel
            value={stats.deliveryPercent}
            label="Delivery Progress"
            sublabel={`${formatDecimal(stats.outstandingQty, 0)} qty outstanding`}
            color="#059669"
          />
          <DonutWheel
            value={itcCompletionPercent}
            label="ITC Completion"
            sublabel={itcMetrics.hasItc ? `${itcMetrics.itcMode} mode` : "No ITC yet"}
            color="#7c3aed"
          />
          <DonutWheel
            value={safetyActivePercent}
            label="Safety Docs Active"
            sublabel={`${stats.activeSafetyDocs}/${stats.totalSafetyDocs} active`}
            color="#f59e0b"
          />
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader
          title="ITC Overview"
          subtitle="Latest ITC status and readiness summary for this tower."
          action={
            <Link
              href={`/project/${projectId}/tower/${towerId}/workpack/itc`}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Open ITC
            </Link>
          }
        />

        {!itcMetrics.hasItc ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">
            No ITC has been created for this tower yet.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              <div className={`rounded-2xl border p-5 shadow-sm ${sectionCardClasses("purple")}`}>
                <div className="text-sm text-slate-500">Mode</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">
                  {itcMetrics.itcMode}
                </div>
              </div>

              <div className={`rounded-2xl border p-5 shadow-sm ${sectionCardClasses("emerald")}`}>
                <div className="text-sm text-slate-500">Ready Status</div>
                <div className="mt-3">
                  <span
                    className={`inline-flex px-3 py-1 rounded-full border text-xs font-semibold ${
                      itcMetrics.overallReady
                        ? "bg-green-100 text-green-700 border-green-200"
                        : "bg-yellow-100 text-yellow-800 border-yellow-200"
                    }`}
                  >
                    {itcMetrics.overallReady ? "Ready" : "Pending"}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-sm text-slate-500">Status</div>
                <div className="mt-3">
                  <span
                    className={`inline-flex px-3 py-1 rounded-full border text-xs font-semibold ${getBadgeClasses(
                      getItcStatusKind(itcMetrics.itcStatus),
                    )}`}
                  >
                    {itcMetrics.itcStatus}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-sm text-slate-500">Revision</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">
                  {itcMetrics.revision}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-sm text-slate-500">Client Uploads</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">
                  {itcMetrics.clientUploadCount}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <MetricTile
                title="Checklist Passed"
                value={String(itcMetrics.checklistComplete)}
                subtitle={`of ${itcMetrics.checklistTotal}`}
                accent="blue"
              />
              <MetricTile
                title="Checklist Failed"
                value={String(itcMetrics.checklistFailed)}
                subtitle="items needing action"
                accent="rose"
              />
              <MetricTile
                title="Checklist Pending"
                value={String(itcMetrics.checklistPending)}
                subtitle="unfinished items"
                accent="amber"
              />
              <MetricTile
                title="Torque Complete"
                value={`${itcMetrics.torqueComplete}/${itcMetrics.torqueTotal}`}
                subtitle="completed torque rows"
                accent="emerald"
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader
            title="Construction Summary"
            subtitle="Defects, modifications, and delay overview."
            action={
              <Link
                href={`/project/${projectId}/tower/${towerId}/dockets`}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
              >
                Open Daily Dockets
              </Link>
            }
          />

          <div className="mt-6 grid grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricTile
              title="Open Defects"
              value={String(stats.openDefectCount)}
              subtitle={`Total defects: ${stats.defectCount}`}
              accent="rose"
            />
            <MetricTile
              title="Closed Defects"
              value={String(stats.closedDefectCount)}
              subtitle="resolved items"
              accent="emerald"
            />
            <MetricTile
              title="Modifications"
              value={String(stats.modificationCount)}
              subtitle="logged changes"
              accent="purple"
            />
            <MetricTile
              title="Total Delay Hours"
              value={formatDecimal(stats.totalDelayHours, 1)}
              subtitle="all delay categories"
              accent="amber"
            />
          </div>

          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm text-slate-500">Weather</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {formatDecimal(stats.totalWeatherDelay, 1)} h
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm text-slate-500">Lightning</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {formatDecimal(stats.totalLightningDelay, 1)} h
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm text-slate-500">Toolbox</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {formatDecimal(stats.totalToolboxDelay, 1)} h
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm text-slate-500">Other</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {formatDecimal(stats.totalOtherDelay, 1)} h
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader
            title="Workpack / Safety"
            subtitle="Safety document health and workpack access."
            action={
              <Link
                href={`/project/${projectId}/tower/${towerId}/workpack`}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
              >
                Open Workpack
              </Link>
            }
          />

          <div className="mt-6 grid grid-cols-2 gap-4">
            <MetricTile
              title="Safety Docs"
              value={String(stats.totalSafetyDocs)}
              subtitle="records linked to tower"
              accent="blue"
            />
            <MetricTile
              title="Active Docs"
              value={String(stats.activeSafetyDocs)}
              subtitle="currently valid / usable"
              accent="emerald"
            />
            <MetricTile
              title="Expired"
              value={String(stats.expiredSafetyDocs)}
              subtitle="needs replacement"
              accent="rose"
            />
            <MetricTile
              title="Expiring Soon"
              value={String(stats.expiringSoonSafetyDocs)}
              subtitle="within 14 days"
              accent="amber"
            />
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader
          title="Delivery Summary"
          subtitle="Bundle and steel delivery metrics for this tower."
          action={
            <Link
              href={`/project/${projectId}/tower/${towerId}/deliveries`}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Open Deliveries
            </Link>
          }
        />

        <div className="mt-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <MetricTile
            title="Bundles"
            value={String(stats.totalRequiredBundles)}
            subtitle="bundle register rows"
            accent="blue"
          />
          <MetricTile
            title="Required Qty"
            value={formatDecimal(stats.totalRequiredQty, 0)}
            subtitle="planned steel quantity"
            accent="purple"
          />
          <MetricTile
            title="Delivered Qty"
            value={formatDecimal(stats.deliveredQty, 0)}
            subtitle="received to date"
            accent="emerald"
          />
          <MetricTile
            title="Outstanding Qty"
            value={formatDecimal(stats.outstandingQty, 0)}
            subtitle="still to arrive"
            accent="rose"
          />
          <MetricTile
            title="Delivery Records"
            value={String(deliveries.length)}
            subtitle="logged delivery events"
            accent="amber"
          />
          <MetricTile
            title="Progress"
            value={`${formatDecimal(stats.deliveryPercent, 0)}%`}
            subtitle="delivered vs required"
            accent="emerald"
          />
        </div>

        <div className="mt-6 h-4 rounded-full overflow-hidden bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600"
            style={{ width: `${stats.deliveryPercent}%` }}
          />
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader
          title="Tower Details"
          subtitle="Imported tower overview fields and CSV-backed metadata."
        />

        <div className="mt-6 grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm text-slate-500">Tower Name</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {tower.name || "-"}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm text-slate-500">Line</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {tower.line || "-"}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm text-slate-500">Stored Status</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {tower.status || "-"}
            </div>
          </div>
        </div>

        {extraFields.length > 0 && (
          <div className="mt-6 grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {extraFields.map(([key, value]) => (
              <div
                key={key}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="text-sm text-slate-500">{formatLabel(key)}</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
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