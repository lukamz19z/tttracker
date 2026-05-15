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
  crew?: string | null;
  leading_hand?: string | null;
  assembly_percent?: number | null;
  erection_percent?: number | null;
  raw_manhours?: number | null;
  production_manhours?: number | null;
  weather_delay_hours?: number | null;
  lightning_delay_hours?: number | null;
  toolbox_delay_hours?: number | null;
  other_delay_hours?: number | null;
  client_rep_name?: string | null;
  signed_date?: string | null;
};

type LabourRow = {
  docket_id: string;
  total_hours?: number | null;
  production_hours?: number | null;
  delay_hours?: number | null;
};

type DelayRow = {
  docket_id: string;
  delay_type?: string | null;
  delay_hours?: number | null;
  delay_applies_mode?: string | null;
  plant_names?: string[] | null;
};

type PlantRow = {
  docket_id: string;
  plant_name?: string | null;
  plant_type?: string | null;
  asset_number?: string | null;
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
  bundle_no?: string | null;
  qty_required?: number | null;
  required_qty?: number | null;
  total_weight?: number | null;
  section?: string | null;
};

type DeliveryRow = {
  id: string;
};

type DeliveryItemRow = {
  delivery_id?: string | null;
  bundle_no?: string | null;
  qty_delivered?: number | null;
  quantity_delivered?: number | null;
  delivered_qty?: number | null;
  qty?: number | null;
};

type MemberRow = {
  id?: string;
  bundle_reference?: string | null;
  drawing_number?: string | null;
  mark_no?: string | null;
  pn_final?: string | null;
  qty_per_tower?: number | null;
  section?: string | null;
};

type GenericDocumentRow = {
  id?: string;
  status?: string | null;
  category?: string | null;
  type?: string | null;
  document_type?: string | null;
  expiry_date?: string | null;
  valid_to?: string | null;
  end_date?: string | null;
  is_active?: boolean | null;
};

type ItcDocumentRow = {
  id: string;
  status?: string | null;
  itc_mode?: "BC" | "Client" | string | null;
  revision?: string | null;
};

type ItcItemRow = {
  id: string;
  validation?: "" | "Y" | "N" | "NA" | null;
};

type ItcTorqueRow = {
  id: string;
  torque_achieved?: string | null;
};

type ItcClientUploadRow = {
  id: string;
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

type NeedAction = {
  id: string;
  title: string;
  detail: string;
  tone: "red" | "amber" | "blue" | "slate" | "green";
  href?: string;
};

function safeNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeString(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function formatDecimal(value: number | null | undefined, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toFixed(decimals);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

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

function extractNumericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const match = String(value).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getTowerDisplayName(tower: Tower | null) {
  if (!tower) return "Tower";
  return tower.tower_number || tower.structure_number || tower.tower_no || tower.name || "Unnamed Tower";
}

function getTowerWeightFromExtraData(extraData?: Record<string, unknown> | null) {
  if (!extraData) return null;

  const entries = Object.entries(extraData);
  const exact = entries.find(([key]) => {
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

  if (exact) return extractNumericValue(exact[1]);

  const towerWeightLike = entries.find(([key]) => {
    const k = key.trim().toLowerCase();
    return (k.includes("tower") || k.includes("structure")) && k.includes("weight");
  });

  if (towerWeightLike) return extractNumericValue(towerWeightLike[1]);

  const genericWeight = entries.find(([key]) => key.trim().toLowerCase().includes("weight"));
  if (genericWeight) return extractNumericValue(genericWeight[1]);

  const mass = entries.find(([key]) => key.trim().toLowerCase().includes("mass"));
  if (mass) return extractNumericValue(mass[1]);

  return null;
}

function getRequiredQty(row: BundleRow) {
  return safeNumber(row.qty_required ?? row.required_qty, 0);
}

function getDeliveredQty(row: DeliveryItemRow) {
  return safeNumber(row.qty_delivered ?? row.quantity_delivered ?? row.delivered_qty ?? row.qty, 0);
}

function getDocketProgress(docket: DocketRow) {
  const assembly = safeNumber(docket.assembly_percent, 0);
  const erection = safeNumber(docket.erection_percent, 0);
  return clampPercent(Math.round(assembly * 0.5 + erection * 0.5));
}

function getProgressFromLiveDockets(dockets: DocketRow[]) {
  if (dockets.length === 0) return 0;
  return dockets.reduce((max, docket) => Math.max(max, getDocketProgress(docket)), 0);
}

function getStatusFromProgress(progress: number) {
  if (progress >= 100) return "Complete";
  if (progress > 0) return "In Progress";
  return "Not Started";
}

function isOpenDefect(defect: DefectRow) {
  const status = safeString(defect.status).trim().toLowerCase();
  return status !== "closed" && status !== "complete" && status !== "completed";
}

function isSafetyDocument(doc: GenericDocumentRow) {
  const values = [doc.category, doc.type, doc.document_type, doc.status]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());

  if (values.length === 0) return true;

  return values.some((value) =>
    ["safety", "permit", "swms", "itc", "checklist", "sign on", "sign-on", "lift", "study", "wms", "jsea", "jsa"].some(
      (keyword) => value.includes(keyword),
    ),
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

async function safeSelect<T>(
  supabase: ReturnType<typeof createSupabaseBrowser>,
  table: string,
  select: string,
  filters?: Array<{ column: string; value: string }>,
) {
  try {
    let query = supabase.from(table).select(select);
    for (const filter of filters || []) query = query.eq(filter.column, filter.value);
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

function SectionHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
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

function MiniMetric({ label, value, tone = "slate" }: { label: string; value: string | number; tone?: "slate" | "blue" | "emerald" | "amber" | "rose" }) {
  const tones = {
    slate: "bg-slate-50 border-slate-200 text-slate-900",
    blue: "bg-blue-50 border-blue-100 text-blue-900",
    emerald: "bg-emerald-50 border-emerald-100 text-emerald-900",
    amber: "bg-amber-50 border-amber-100 text-amber-900",
    rose: "bg-rose-50 border-rose-100 text-rose-900",
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${tones}`}>
      <div className="text-[11px] uppercase tracking-wide opacity-70 truncate">{label}</div>
      <div className="mt-1 text-lg font-black truncate">{value}</div>
    </div>
  );
}

function SmallStatusCard({ title, value, helper, tone = "slate" }: { title: string; value: string; helper: string; tone?: "slate" | "blue" | "emerald" | "amber" | "rose" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <MiniMetric label={title} value={value} tone={tone} />
      <p className="mt-3 text-xs leading-5 text-slate-500">{helper}</p>
    </div>
  );
}

function DonutWheel({ value, label, sublabel, color }: { value: number; label: string; sublabel?: string; color: string }) {
  const safeValue = clampPercent(value);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-4">
        <div
          className="relative h-20 w-20 shrink-0 rounded-full"
          style={{
            background: `conic-gradient(${color} 0deg ${safeValue * 3.6}deg, #e5e7eb ${safeValue * 3.6}deg 360deg)`,
          }}
        >
          <div className="absolute inset-[8px] flex items-center justify-center rounded-full bg-white">
            <span className="text-lg font-black text-slate-900">{Math.round(safeValue)}%</span>
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">{label}</div>
          {sublabel ? <div className="mt-1 text-xs leading-5 text-slate-500">{sublabel}</div> : null}
        </div>
      </div>
    </div>
  );
}

function ActionCard({ item }: { item: NeedAction }) {
  const toneClass = {
    red: "border-red-200 bg-red-50 text-red-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    slate: "border-slate-200 bg-slate-50 text-slate-900",
  }[item.tone];

  const content = (
    <div className={`rounded-2xl border p-4 transition hover:shadow-sm ${toneClass}`}>
      <div className="text-sm font-bold">{item.title}</div>
      <div className="mt-1 text-xs leading-5 opacity-80">{item.detail}</div>
    </div>
  );

  return item.href ? <Link href={item.href}>{content}</Link> : content;
}

function ProgressLine({ label, value, tone }: { label: string; value: number; tone: "blue" | "emerald" | "slate" | "amber" }) {
  const colour = {
    blue: "bg-blue-500",
    emerald: "bg-emerald-500",
    slate: "bg-slate-900",
    amber: "bg-amber-500",
  }[tone];
  const clamped = clampPercent(value);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
        <div className="text-sm font-black text-slate-900">{Math.round(clamped)}%</div>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

export default function TowerOverviewPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;
  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<Tower | null>(null);
  const [coverPhotoUrl, setCoverPhotoUrl] = useState<string | null>(null);
  const [dockets, setDockets] = useState<DocketRow[]>([]);
  const [labourRows, setLabourRows] = useState<LabourRow[]>([]);
  const [delayRows, setDelayRows] = useState<DelayRow[]>([]);
  const [plantRows, setPlantRows] = useState<PlantRow[]>([]);
  const [defects, setDefects] = useState<DefectRow[]>([]);
  const [modifications, setModifications] = useState<ModificationRow[]>([]);
  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [deliveryItems, setDeliveryItems] = useState<DeliveryItemRow[]>([]);
  const [materialBundles, setMaterialBundles] = useState<BundleRow[]>([]);
  const [materialMembers, setMaterialMembers] = useState<MemberRow[]>([]);
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
      const { data } = supabase.storage.from("tower-photos").getPublicUrl(towerData.cover_photo_path);
      setCoverPhotoUrl(data.publicUrl);
    } else {
      setCoverPhotoUrl(null);
    }

    const docketData = await safeSelect<DocketRow>(
      supabase,
      "tower_daily_dockets",
      "id, docket_date, crew, leading_hand, assembly_percent, erection_percent, raw_manhours, production_manhours, weather_delay_hours, lightning_delay_hours, toolbox_delay_hours, other_delay_hours, client_rep_name, signed_date",
      [{ column: "tower_id", value: towerId }],
    );
    docketData.sort((a, b) => {
      const aDate = a.docket_date ? new Date(a.docket_date).getTime() : 0;
      const bDate = b.docket_date ? new Date(b.docket_date).getTime() : 0;
      return bDate - aDate;
    });
    setDockets(docketData);

    const docketIds = docketData.map((docket) => docket.id).filter(Boolean);

    let labourData: LabourRow[] = [];
    let delayData: DelayRow[] = [];
    let plantData: PlantRow[] = [];

    if (docketIds.length > 0) {
      labourData = await safeSelectFirstExisting<LabourRow>(
        supabase,
        ["tower_docket_labour", "tower_daily_docket_labour", "tower_daily_docket_labour_rows"],
        "docket_id, total_hours, production_hours, delay_hours",
      );
      labourData = labourData.filter((row) => docketIds.includes(row.docket_id));

      delayData = await safeSelect<DelayRow>(
        supabase,
        "tower_docket_delays",
        "docket_id, delay_type, delay_hours, delay_applies_mode, plant_names",
      );
      delayData = delayData.filter((row) => docketIds.includes(row.docket_id));

      plantData = await safeSelect<PlantRow>(
        supabase,
        "tower_docket_plant",
        "docket_id, plant_name, plant_type, asset_number, total_hours",
      );
      plantData = plantData.filter((row) => docketIds.includes(row.docket_id));
    }

    const [
      defectsData,
      modificationsData,
      bundlesData,
      deliveriesData,
      deliveryItemsData,
      documentsData,
      materialBundlesData,
      materialMembersData,
    ] = await Promise.all([
      safeSelect<DefectRow>(supabase, "tower_defects", "id, status", [{ column: "tower_id", value: towerId }]),
      safeSelect<ModificationRow>(supabase, "tower_modifications", "id", [{ column: "tower_id", value: towerId }]),
      safeSelectFirstExisting<BundleRow>(
        supabase,
        ["tower_bundle_register", "tower_bundles", "tower_delivery_bundles"],
        "bundle_no, qty_required, required_qty, total_weight, section",
        [{ column: "tower_id", value: towerId }],
      ),
      safeSelectFirstExisting<DeliveryRow>(supabase, ["tower_bundle_deliveries", "tower_deliveries"], "id", [
        { column: "tower_id", value: towerId },
      ]),
      safeSelectFirstExisting<DeliveryItemRow>(
        supabase,
        ["tower_bundle_delivery_items", "tower_delivery_items", "tower_delivered_items"],
        "delivery_id, bundle_no, qty_delivered, quantity_delivered, delivered_qty, qty",
      ),
      safeSelectFirstExisting<GenericDocumentRow>(
        supabase,
        ["tower_workpack_documents", "tower_documents", "tower_safety_documents"],
        "id, status, category, type, document_type, expiry_date, valid_to, end_date, is_active",
        [{ column: "tower_id", value: towerId }],
      ),
      safeSelect<BundleRow>(
        supabase,
        "tower_required_bundles",
        "bundle_no, qty_required, required_qty, total_weight, section",
        [{ column: "tower_id", value: towerId }],
      ),
      safeSelect<MemberRow>(
        supabase,
        "tower_material_members",
        "id, bundle_reference, drawing_number, mark_no, pn_final, qty_per_tower, section",
        [{ column: "tower_id", value: towerId }],
      ),
    ]);

    setLabourRows(labourData);
    setDelayRows(delayData);
    setPlantRows(plantData);
    setDefects(defectsData);
    setModifications(modificationsData);
    setBundles(bundlesData);
    setDeliveries(deliveriesData);
    setDeliveryItems(deliveryItemsData);
    setDocuments(documentsData);
    setMaterialBundles(materialBundlesData);
    setMaterialMembers(materialMembersData);

    const itcDocs = await safeSelect<ItcDocumentRow>(
      supabase,
      "tower_itc_documents",
      "id, status, itc_mode, revision",
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
        safeSelect<ItcItemRow>(supabase, "tower_itc_items", "id, validation", [{ column: "itc_id", value: latestItc.id }]),
        safeSelect<ItcTorqueRow>(supabase, "tower_itc_torque", "id, torque_achieved", [
          { column: "itc_id", value: latestItc.id },
        ]),
        safeSelect<ItcClientUploadRow>(supabase, "tower_itc_client_uploads", "id", [{ column: "tower_id", value: towerId }]),
      ]);

      const checklistTotal = itcItems.length;
      const checklistComplete = itcItems.filter((item) => item.validation === "Y" || item.validation === "NA").length;
      const checklistFailed = itcItems.filter((item) => item.validation === "N").length;
      const checklistPending = checklistTotal - checklistComplete - checklistFailed;
      const torqueTotal = torqueRows.length;
      const torqueComplete = torqueRows.filter((row) => String(row.torque_achieved || "").trim() !== "").length;
      const mode = latestItc.itc_mode || "BC";
      const overallReady =
        mode === "Client"
          ? clientUploads.length > 0
          : checklistTotal > 0 && checklistFailed === 0 && checklistPending === 0 && torqueTotal > 0 && torqueComplete === torqueTotal;

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

  const deliveryStats = useMemo(() => {
    const requiredRows = bundles.length > 0 ? bundles : materialBundles;
    const requiredBundleSet = new Set(requiredRows.map((row) => String(row.bundle_no || "").trim()).filter(Boolean));
    const deliveryIdSet = new Set(deliveries.map((delivery) => delivery.id));

    const towerDeliveryItems = deliveryItems.filter((item) => {
      const deliveryId = String(item.delivery_id || "").trim();
      const bundleNo = String(item.bundle_no || "").trim();
      if (deliveryId && deliveryIdSet.has(deliveryId)) return true;
      if (bundleNo && requiredBundleSet.has(bundleNo)) return true;
      return false;
    });

    const requiredQty = requiredRows.reduce((sum, row) => sum + getRequiredQty(row), 0);
    const deliveredQty = towerDeliveryItems.reduce((sum, row) => sum + getDeliveredQty(row), 0);
    const outstandingQty = Math.max(0, requiredQty - deliveredQty);
    const deliveryPercent = requiredQty > 0 ? clampPercent((deliveredQty / requiredQty) * 100) : 0;

    const deliveredByBundle = new Map<string, number>();
    towerDeliveryItems.forEach((item) => {
      const bundleNo = String(item.bundle_no || "").trim();
      if (!bundleNo) return;
      deliveredByBundle.set(bundleNo, (deliveredByBundle.get(bundleNo) || 0) + getDeliveredQty(item));
    });

    const outstandingBundles = requiredRows
      .map((row) => {
        const bundleNo = String(row.bundle_no || "").trim();
        const required = getRequiredQty(row);
        const delivered = deliveredByBundle.get(bundleNo) || 0;
        return {
          bundleNo,
          required,
          delivered,
          outstanding: Math.max(0, required - delivered),
          section: row.section || null,
        };
      })
      .filter((row) => row.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding);

    return {
      requiredRows,
      towerDeliveryItems,
      requiredQty,
      deliveredQty,
      outstandingQty,
      deliveryPercent,
      outstandingBundles,
    };
  }, [bundles, materialBundles, deliveries, deliveryItems]);

  const stats = useMemo(() => {
    const computedProgress = getProgressFromLiveDockets(dockets);
    const computedStatus = getStatusFromProgress(computedProgress);
    const latestDate = dockets[0]?.docket_date ?? null;

    const docketRawTotal = dockets.reduce((sum, docket) => sum + safeNumber(docket.raw_manhours, 0), 0);
    const docketProductionTotal = dockets.reduce((sum, docket) => sum + safeNumber(docket.production_manhours, 0), 0);
    const labourRawTotal = labourRows.reduce((sum, row) => sum + safeNumber(row.total_hours, 0), 0);
    const labourProductionTotal = labourRows.reduce((sum, row) => sum + safeNumber(row.production_hours, 0), 0);
    const totalHours = docketRawTotal > 0 ? docketRawTotal : labourRawTotal;
    const productionHours = docketProductionTotal > 0 ? docketProductionTotal : labourProductionTotal;

    const totalWeatherDelay = dockets.reduce((sum, row) => sum + safeNumber(row.weather_delay_hours, 0), 0);
    const totalLightningDelay = dockets.reduce((sum, row) => sum + safeNumber(row.lightning_delay_hours, 0), 0);
    const totalToolboxDelay = dockets.reduce((sum, row) => sum + safeNumber(row.toolbox_delay_hours, 0), 0);
    const totalOtherDelay = dockets.reduce((sum, row) => sum + safeNumber(row.other_delay_hours, 0), 0);
    const labourDelayHours = labourRows.reduce((sum, row) => sum + safeNumber(row.delay_hours, 0), 0);
    const delayEventHours = delayRows.reduce((sum, row) => sum + safeNumber(row.delay_hours, 0), 0);
    const plantDelayHours = delayRows.reduce((sum, row) => {
      if (row.delay_applies_mode !== "labour_and_plant") return sum;
      return sum + safeNumber(row.delay_hours, 0) * (row.plant_names?.length || 0);
    }, 0);
    const totalDelayHours = totalWeatherDelay + totalLightningDelay + totalToolboxDelay + totalOtherDelay;

    const openDefects = defects.filter(isOpenDefect).length;
    const closedDefects = defects.length - openDefects;
    const safetyDocs = documents.filter(isSafetyDocument);
    const today = new Date();
    const expiredSafetyDocs = safetyDocs.filter((doc) => isDocumentExpired(getDocumentExpiryDate(doc), today)).length;
    const expiringSoonSafetyDocs = safetyDocs.filter((doc) => isDocumentExpiringSoon(getDocumentExpiryDate(doc), today)).length;
    const activeSafetyDocs = safetyDocs.filter((doc) => {
      if (doc.is_active === true) return true;
      const status = safeString(doc.status).toLowerCase();
      return !["expired", "inactive", "superseded"].includes(status);
    }).length;

    const towerWeightTonnes = getTowerWeightFromExtraData(tower?.extra_data);
    const completedTonnes = towerWeightTonnes !== null ? towerWeightTonnes * (computedProgress / 100) : null;
    const rawMhPerTonne = completedTonnes && completedTonnes > 0 ? totalHours / completedTonnes : null;
    const productionMhPerTonne = completedTonnes && completedTonnes > 0 ? productionHours / completedTonnes : null;

    return {
      computedProgress,
      computedStatus,
      latestDate,
      remainingProgress: Math.max(0, 100 - computedProgress),
      totalHours,
      productionHours,
      totalWeatherDelay,
      totalLightningDelay,
      totalToolboxDelay,
      totalOtherDelay,
      totalDelayHours,
      labourDelayHours,
      delayEventHours,
      plantDelayHours,
      openDefects,
      closedDefects,
      totalDefects: defects.length,
      modificationCount: modifications.length,
      totalSafetyDocs: safetyDocs.length,
      activeSafetyDocs,
      expiredSafetyDocs,
      expiringSoonSafetyDocs,
      towerWeightTonnes,
      completedTonnes,
      rawMhPerTonne,
      productionMhPerTonne,
      docketCount: dockets.length,
      unsignedDockets: dockets.filter((docket) => !(docket.client_rep_name?.trim() && docket.signed_date?.trim())).length,
      materialMemberCount: materialMembers.length,
      materialBundleCount: materialBundles.length,
      plantHours: plantRows.reduce((sum, row) => sum + safeNumber(row.total_hours, 0), 0),
      plantItemCount: plantRows.filter((row) => row.plant_name || row.asset_number || row.plant_type).length,
    };
  }, [dockets, labourRows, delayRows, plantRows, defects, modifications, documents, tower?.extra_data, materialMembers.length, materialBundles.length]);

  const itcCompletionPercent = useMemo(() => {
    if (!itcMetrics.hasItc) return 0;
    if (itcMetrics.itcMode === "Client") return itcMetrics.clientUploadCount > 0 ? 100 : 0;
    if (itcMetrics.checklistTotal <= 0) return 0;
    return clampPercent((itcMetrics.checklistComplete / itcMetrics.checklistTotal) * 100);
  }, [itcMetrics]);

  const safetyActivePercent = useMemo(() => {
    if (stats.totalSafetyDocs <= 0) return 0;
    return clampPercent((stats.activeSafetyDocs / stats.totalSafetyDocs) * 100);
  }, [stats.totalSafetyDocs, stats.activeSafetyDocs]);

  const needsAction = useMemo<NeedAction[]>(() => {
    const rows: NeedAction[] = [];

    if (deliveryStats.outstandingQty > 0) {
      rows.push({
        id: "outstanding-delivery",
        title: "Outstanding delivery items",
        detail: `${formatDecimal(deliveryStats.outstandingQty, 0)} items outstanding across ${deliveryStats.outstandingBundles.length} bundle(s).`,
        tone: "amber",
        href: `/project/${projectId}/tower/${towerId}/deliveries`,
      });
    }

    if (stats.openDefects > 0) {
      rows.push({
        id: "open-defects",
        title: "Open defects",
        detail: `${stats.openDefects} defect(s) still open for this tower.`,
        tone: "red",
        href: `/project/${projectId}/tower/${towerId}/workpack`,
      });
    }

    if (stats.unsignedDockets > 0) {
      rows.push({
        id: "unsigned-dockets",
        title: "Unsigned/open dockets",
        detail: `${stats.unsignedDockets} docket(s) not client signed.`,
        tone: "amber",
        href: `/project/${projectId}/tower/${towerId}/dockets`,
      });
    }

    if (stats.expiredSafetyDocs > 0) {
      rows.push({
        id: "expired-safety",
        title: "Expired safety documents",
        detail: `${stats.expiredSafetyDocs} safety document(s) appear expired.`,
        tone: "red",
        href: `/project/${projectId}/tower/${towerId}/workpack`,
      });
    } else if (stats.expiringSoonSafetyDocs > 0) {
      rows.push({
        id: "expiring-safety",
        title: "Safety documents expiring soon",
        detail: `${stats.expiringSoonSafetyDocs} document(s) expire within 14 days.`,
        tone: "amber",
        href: `/project/${projectId}/tower/${towerId}/workpack`,
      });
    }

    if (!itcMetrics.hasItc) {
      rows.push({
        id: "missing-itc",
        title: "ITC not started",
        detail: "No ITC record has been found for this tower yet.",
        tone: "blue",
        href: `/project/${projectId}/tower/${towerId}/workpack/itc`,
      });
    } else if (!itcMetrics.overallReady) {
      rows.push({
        id: "itc-incomplete",
        title: "ITC requires action",
        detail: `${itcMetrics.checklistPending} pending, ${itcMetrics.checklistFailed} failed, ${itcMetrics.torqueComplete}/${itcMetrics.torqueTotal} torque rows complete.`,
        tone: itcMetrics.checklistFailed > 0 ? "red" : "amber",
        href: `/project/${projectId}/tower/${towerId}/workpack/itc`,
      });
    }

    if (stats.docketCount === 0) {
      rows.push({
        id: "no-dockets",
        title: "No daily dockets recorded",
        detail: "Progress and MH/t will remain zero until a docket is created.",
        tone: "slate",
        href: `/project/${projectId}/tower/${towerId}/dockets`,
      });
    }

    if (stats.towerWeightTonnes === null) {
      rows.push({
        id: "missing-weight",
        title: "Tower weight missing",
        detail: "MH/t cannot calculate until tower weight exists in CSV extra data.",
        tone: "blue",
      });
    }

    if (rows.length === 0) {
      rows.push({
        id: "all-clear",
        title: "No immediate action found",
        detail: "Delivery, defects, dockets, safety and ITC checks look clear from current data.",
        tone: "green",
      });
    }

    return rows;
  }, [deliveryStats, stats, itcMetrics, projectId, towerId]);

  const extraFields = useMemo(() => {
    const extra = tower?.extra_data || {};
    return Object.entries(extra).sort(([a], [b]) => a.localeCompare(b));
  }, [tower?.extra_data]);

  if (loading || !tower) return <div className="p-8">Loading tower overview...</div>;

  const towerForHeader = {
    ...tower,
    progress: stats.computedProgress,
    status: stats.computedStatus,
  };

  const latestDocket = dockets[0] ?? null;

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6 lg:p-8 space-y-6">
      <TowerHeader projectId={projectId} tower={towerForHeader} latestDate={stats.latestDate} />

      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 px-5 py-5 text-white md:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-200">Tower Overview Dashboard</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight">{getTowerDisplayName(tower)}</h1>
              <p className="mt-1 text-sm text-slate-300">
                Live status, commercial performance, logistics and actions calculated from current records.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href={`/project/${projectId}/tower/${towerId}/dockets`} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                Dockets
              </Link>
              <Link href={`/project/${projectId}/tower/${towerId}/deliveries`} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                Deliveries
              </Link>
              <Link href={`/project/${projectId}/tower/${towerId}/materials`} className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600">
                Materials
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4 md:p-6">
          <DonutWheel label="Tower Progress" value={stats.computedProgress} sublabel={`${stats.computedStatus} • ${formatDecimal(stats.remainingProgress, 0)}% remaining`} color="#3b82f6" />
          <DonutWheel label="Delivery Progress" value={deliveryStats.deliveryPercent} sublabel={`${formatDecimal(deliveryStats.deliveredQty, 0)} / ${formatDecimal(deliveryStats.requiredQty, 0)} delivered`} color="#10b981" />
          <DonutWheel label="Safety Docs" value={safetyActivePercent} sublabel={`${stats.activeSafetyDocs}/${stats.totalSafetyDocs} active • ${stats.expiredSafetyDocs} expired`} color="#f59e0b" />
          <DonutWheel label="ITC Completion" value={itcCompletionPercent} sublabel={itcMetrics.hasItc ? `${itcMetrics.itcMode} • ${itcMetrics.itcStatus}` : "No ITC found"} color="#8b5cf6" />
        </div>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <SectionHeader title="Needs Action" subtitle="Items that may block progress, claims, sign-off or handover." />
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {needsAction.map((item) => (
            <ActionCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SmallStatusCard title="Production MH/t" value={formatDecimal(stats.productionMhPerTonne, 2)} helper={`${formatDecimal(stats.productionHours, 1)} production hours / ${formatDecimal(stats.completedTonnes, 2)} completed tonnes`} tone="blue" />
        <SmallStatusCard title="Raw MH/t" value={formatDecimal(stats.rawMhPerTonne, 2)} helper={`${formatDecimal(stats.totalHours, 1)} raw hours recorded`} tone="slate" />
        <SmallStatusCard title="Delivery Outstanding" value={formatDecimal(deliveryStats.outstandingQty, 0)} helper={`${deliveryStats.outstandingBundles.length} bundle(s) still outstanding`} tone={deliveryStats.outstandingQty > 0 ? "amber" : "emerald"} />
        <SmallStatusCard title="Open Defects" value={String(stats.openDefects)} helper={`${stats.closedDefects} closed / ${stats.totalDefects} total`} tone={stats.openDefects > 0 ? "rose" : "emerald"} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <SectionHeader title="Status Breakdown" subtitle="Compact view of progress, delivery, documents and commercial readiness." />

          <div className="mt-6 space-y-5">
            <ProgressLine label="Tower Progress" value={stats.computedProgress} tone="blue" />
            <ProgressLine label="Delivery Progress" value={deliveryStats.deliveryPercent} tone="emerald" />
            <ProgressLine label="Safety Active" value={safetyActivePercent} tone="amber" />
            <ProgressLine label="ITC Completion" value={itcCompletionPercent} tone="slate" />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniMetric label="Dockets" value={stats.docketCount} />
            <MiniMetric label="Latest" value={formatDate(stats.latestDate)} />
            <MiniMetric label="Weight" value={`${formatDecimal(stats.towerWeightTonnes, 2)} t`} />
            <MiniMetric label="Completed" value={`${formatDecimal(stats.completedTonnes, 2)} t`} />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <SectionHeader title="Commercial Snapshot" subtitle="Manhours, delay tracking and plant usage for this tower." />

          <div className="mt-6 grid grid-cols-2 gap-3">
            <MiniMetric label="Raw Hrs" value={formatDecimal(stats.totalHours, 1)} tone="slate" />
            <MiniMetric label="Prod Hrs" value={formatDecimal(stats.productionHours, 1)} tone="blue" />
            <MiniMetric label="Delay Hrs" value={formatDecimal(stats.labourDelayHours || stats.totalDelayHours, 1)} tone="amber" />
            <MiniMetric label="Plant Delay" value={formatDecimal(stats.plantDelayHours, 1)} tone="amber" />
            <MiniMetric label="Plant Hrs" value={formatDecimal(stats.plantHours, 1)} tone="emerald" />
            <MiniMetric label="Plant Items" value={String(stats.plantItemCount)} tone="emerald" />
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <SectionHeader title="Delivery Breakdown" subtitle="Live delivered vs required quantities. This avoids stale stored delivery percentages." />

          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniMetric label="Required Qty" value={formatDecimal(deliveryStats.requiredQty, 0)} />
            <MiniMetric label="Delivered Qty" value={formatDecimal(deliveryStats.deliveredQty, 0)} tone="emerald" />
            <MiniMetric label="Outstanding" value={formatDecimal(deliveryStats.outstandingQty, 0)} tone={deliveryStats.outstandingQty > 0 ? "amber" : "emerald"} />
            <MiniMetric label="Delivery Records" value={deliveries.length} />
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-700">Delivery progress</span>
              <span className="font-black text-slate-900">{formatDecimal(deliveryStats.deliveryPercent, 0)}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${deliveryStats.deliveryPercent}%` }} />
            </div>
          </div>

          {deliveryStats.outstandingBundles.length > 0 ? (
            <div className="mt-5 space-y-2">
              <div className="text-sm font-bold text-slate-900">Top outstanding bundles</div>
              {deliveryStats.outstandingBundles.slice(0, 6).map((bundle) => (
                <div key={bundle.bundleNo} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  <div className="min-w-0 truncate font-semibold text-slate-800">{bundle.bundleNo || "Unnamed bundle"}</div>
                  <div className="shrink-0 text-slate-600">
                    {formatDecimal(bundle.delivered, 0)} / {formatDecimal(bundle.required, 0)} delivered
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              No outstanding bundles found from current required and delivery records.
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <SectionHeader title="Docket History" subtitle="Latest progress and commercial records submitted against this tower." />

          {dockets.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">No dockets recorded for this tower.</div>
          ) : (
            <div className="mt-6 space-y-3">
              {dockets.slice(0, 5).map((docket) => (
                <Link key={docket.id} href={`/project/${projectId}/tower/${towerId}/dockets/${docket.id}`} className="block">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:bg-slate-100">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">{formatDate(docket.docket_date)}</div>
                        <div className="mt-1 text-xs text-slate-500">{docket.crew || docket.leading_hand || "Crew not set"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-black text-slate-900">{getDocketProgress(docket)}%</div>
                        <div className="text-xs text-slate-500">progress</div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <SectionHeader title="Workpack, QA & Records" subtitle="Documents, ITC, defects and modification indicators." />

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MiniMetric label="Safety Docs" value={`${stats.activeSafetyDocs}/${stats.totalSafetyDocs}`} tone={stats.expiredSafetyDocs > 0 ? "rose" : "emerald"} />
          <MiniMetric label="Expiring Soon" value={stats.expiringSoonSafetyDocs} tone={stats.expiringSoonSafetyDocs > 0 ? "amber" : "slate"} />
          <MiniMetric label="ITC Mode" value={itcMetrics.itcMode} tone="blue" />
          <MiniMetric label="ITC Status" value={itcMetrics.itcStatus} tone={itcMetrics.overallReady ? "emerald" : "amber"} />
          <MiniMetric label="Checklist" value={`${itcMetrics.checklistComplete}/${itcMetrics.checklistTotal}`} />
          <MiniMetric label="Torque" value={`${itcMetrics.torqueComplete}/${itcMetrics.torqueTotal}`} />
          <MiniMetric label="Defects" value={`${stats.openDefects} open`} tone={stats.openDefects > 0 ? "rose" : "emerald"} />
          <MiniMetric label="Modifications" value={stats.modificationCount} />
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <SectionHeader title="Tower Details" subtitle="Imported tower fields and CSV-backed metadata." />

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MiniMetric label="Tower Name" value={tower.name || "-"} />
          <MiniMetric label="Line" value={tower.line || "-"} />
          <MiniMetric label="Live Status" value={stats.computedStatus} tone={stats.computedStatus === "Complete" ? "emerald" : stats.computedStatus === "In Progress" ? "blue" : "slate"} />
          <MiniMetric label="Stored Status" value={tower.status || "-"} />
          <MiniMetric label="Material Bundles" value={stats.materialBundleCount} />
          <MiniMetric label="Material Members" value={stats.materialMemberCount} />
          <MiniMetric label="Required Bundles" value={deliveryStats.requiredRows.length} />
          <MiniMetric label="Cover Photo" value={coverPhotoUrl ? "Uploaded" : "Not set"} />
        </div>

        {extraFields.length > 0 && (
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {extraFields.map(([key, value]) => (
              <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">{formatLabel(key)}</div>
                <div className="mt-1 break-words text-sm font-bold text-slate-900">{formatValue(value)}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
