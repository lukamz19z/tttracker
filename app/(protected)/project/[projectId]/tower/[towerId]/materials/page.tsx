"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Papa, { ParseResult } from "papaparse";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRightLeft,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Database,
  Download,
  ExternalLink,
  Minus,
  PackageCheck,
  PackageOpen,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  TriangleAlert,
  Truck,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";


type BundleCheckStatus = "not_checked" | "arrived" | "partial" | "missing" | "issue" | "transferred";
type MemberCheckStatus = "not_checked" | "arrived" | "not_here" | "missing" | "issue";
type MaterialEventType =
  | "missing"
  | "found_received"
  | "taken_from_another_tower"
  | "sent_to_another_tower"
  | "damaged_incorrect"
  | "excess"
  | string;

type TowerRecord = {
  id: string;
  project_id?: string | null;
  name?: string | null;
  line?: string | null;
  status?: string | null;
  progress?: number | null;
  extra_data?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type Bundle = {
  id?: string;
  tower_id: string;
  bundle_no: string;
  section: string;
  qty_required: number;
  member_qty: number;
  total_weight: number | null;
};

type Member = {
  id?: string;
  tower_id: string;
  bundle_id: string | null;
  bundle_reference: string;
  drawing_number: string;
  mark_no: string;
  qty_per_tower: number | null;
  section: string;
  tower_segment: string;
};

type MaterialItemType = "bolt" | "packer";

type LegConfigurationEntry = {
  key: string;
  segment: string;
  count: number;
};

type MaterialConfigOption = {
  id: string;
  project_id: string | null;
  category: string;
  code: string;
  label: string;
  behavior: string;
  value_text: string | null;
  value_number: number | null;
  is_effective: boolean;
  is_closed: boolean;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
};

type MaterialAmendmentItem = {
  id: string;
  amendment_id: string;
  action_config_id: string;
  base_material_id: string | null;
  item_type: MaterialItemType;
  tower_segment: string;
  drawing_number: string;
  bolt_diameter: string;
  bolt_type: string;
  dn_sn: string;
  length: string;
  packer_no: string;
  packer_mark: string;
  qty: number;
  quantity_basis_config_id: string | null;
  notes: string | null;
};

type MaterialAmendment = {
  id: string;
  project_id: string;
  tower_id: string | null;
  tower_type: string | null;
  drawing_number: string | null;
  drawing_revision: string | null;
  tower_segment: string | null;
  scope_config_id: string;
  reference_type_config_id: string | null;
  reference_no: string | null;
  title: string;
  reason: string | null;
  status_config_id: string;
  effective_date: string | null;
  document_url: string | null;
  created_by: string | null;
  created_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  items: MaterialAmendmentItem[];
};

type Bolt = {
  id?: string;
  tower_id: string;
  item_type: MaterialItemType;
  tower_segment: string;
  drawing_number: string;
  bolt_diameter: string;
  bolt_type: string;
  dn_sn: string;
  length: string;
  packer_no: string;
  packer_mark: string;
  qty: number;
  quantity_basis_behavior?: string;
  source_kind?: "base" | "amendment";
  base_material_id?: string | null;
  amendment_id?: string | null;
  amendment_reference?: string | null;
  amendment_title?: string | null;
  amendment_action_label?: string | null;
  amendment_status_label?: string | null;
  amendment_notes?: string | null;
  amendment_document_url?: string | null;
  original_item_label?: string | null;
};

type BundleCheck = {
  id?: string;
  tower_id: string;
  bundle_id: string | null;
  bundle_no: string;
  status: BundleCheckStatus;
  notes: string;
  checked_by: string;
  checked_at: string | null;
  qty_received: number;
};

type MemberCheck = {
  id?: string;
  tower_id: string;
  bundle_id: string | null;
  bundle_no: string;
  mark_no: string;
  status: MemberCheckStatus;
  notes: string;
  checked_by: string;
  checked_at: string | null;
};

type DeliveryItem = {
  bundle_id: string | null;
  bundle_no: string;
  qty_delivered: number;
};

type Delivery = {
  tower_bundle_delivery_items: DeliveryItem[];
};

type ProjectTowerOption = {
  id: string;
  name: string;
  line?: string | null;
};

type TransferStatus = "in_transit" | "received" | "cancelled";

type MaterialTransfer = {
  id: string;
  transfer_no: number | null;
  project_id: string;
  source_tower_id: string;
  destination_tower_id: string;
  source_bundle_id: string;
  destination_bundle_id: string;
  bundle_no: string;
  bundle_section: string;
  quantity: number;
  status: TransferStatus;
  transferred_by: string | null;
  transferred_by_name: string | null;
  transferred_at: string | null;
  received_by: string | null;
  received_by_name: string | null;
  received_at: string | null;
  cancelled_by: string | null;
  cancelled_by_name: string | null;
  cancelled_at: string | null;
  source_docket_id: string | null;
  destination_docket_id: string | null;
  notes: string | null;
};

type CreateTransferInput = {
  sourceBundle: Bundle;
  destinationTowerId: string;
  destinationBundleId: string;
  quantity: number;
  notes: string;
};

type MaterialEventItem = {
  id: string;
  event_id: string;
  source_table?: string | null;
  source_record_id?: string | null;
  material_type?: string | null;
  bolt_size?: string | null;
  item_reference?: string | null;
  item_description?: string | null;
  quantity?: number | null;
  unit?: string | null;
  notes?: string | null;
  issue_key?: string | null;
  source_issue_key?: string | null;
  bundle_id?: string | null;
  bundle_no?: string | null;
  bundle_section?: string | null;
};

type MaterialEvent = {
  id: string;
  project_id?: string | null;
  docket_id: string | null;
  tower_id: string;
  event_type: MaterialEventType;
  source_tower_id?: string | null;
  destination_tower_id?: string | null;
  source_location?: string | null;
  destination_location?: string | null;
  occurred_at?: string | null;
  affected_work?: boolean | null;
  work_outcome?: string | null;
  affected_activity?: string | null;
  affected_section?: string | null;
  impact_started_at?: string | null;
  impact_finished_at?: string | null;
  impact_ongoing?: boolean | null;
  current_effect?: string | null;
  mitigation_actions?: string[] | null;
  commercial_impact_type?: string | null;
  notes?: string | null;
  items: MaterialEventItem[];
};

type DocketSummary = {
  id: string;
  docket_date: string | null;
  crew?: string | null;
  leading_hand?: string | null;
};


type MissingIssueStatus = "open" | "partial" | "resolved";

type MissingIssueReceipt = {
  event: MaterialEvent;
  item: MaterialEventItem;
};

type MissingIssueRow = {
  issueKey: string;
  event: MaterialEvent;
  item: MaterialEventItem;
  originalQty: number;
  deliveredQty: number;
  remainingQty: number;
  status: MissingIssueStatus;
  reportedAt: string | null;
  lastDeliveryAt: string | null;
  receipts: MissingIssueReceipt[];
};

type ImportMode = "replace" | "merge";
type DataManagerTab = "bundles" | "members" | "bolts";
type IssueFilter = "all" | "open" | "partial" | "resolved" | "excess" | "damaged" | "movements";

type ImportSourceRow = Record<string, unknown>;

type MaterialsData = {
  tower: TowerRecord | null;
  projectTowers: ProjectTowerOption[];
  latestDate: string | null;
  bundles: Bundle[];
  members: Member[];
  bolts: Bolt[];
  applicableBolts: Bolt[];
  effectiveBolts: Bolt[];
  materialConfigOptions: MaterialConfigOption[];
  materialAmendments: MaterialAmendment[];
  amendmentSetupAvailable: boolean;
  amendmentSetupError: string | null;
  applicableMaterialSegments: string[];
  materialApplicabilityActive: boolean;
  towerLegConfiguration: LegConfigurationEntry[];
  towerLegExpectedCount: number;
  towerLegConfiguredCount: number;
  legConfigurationDetected: boolean;
  legConfigurationComplete: boolean;
  isLegMaterialSegment: (segment: string) => boolean;
  isMaterialSegmentApplicable: (segment: string) => boolean;
  getMaterialMultiplier: (segment: string) => number;
  getMaterialMultiplierForItem: (item: Bolt) => number;
  getRequiredMaterialQty: (item: Bolt) => number;
  getMaterialConfigOptions: (category: string) => MaterialConfigOption[];
  getMaterialConfigOption: (id: string | null | undefined) => MaterialConfigOption | undefined;
  bundleChecks: BundleCheck[];
  memberChecks: MemberCheck[];
  materialEvents: MaterialEvent[];
  transfers: MaterialTransfer[];
  dockets: DocketSummary[];
  deliveries: Delivery[];
  docketMap: Map<string, DocketSummary>;
  missingEvents: MaterialEvent[];
  excessEvents: MaterialEvent[];
  loading: boolean;
  saving: boolean;
  duplicateBundleRefs: Set<string>;
  resolveBundleForMember: (member: Member) => Bundle | undefined;
  deliveredQty: (bundle: Bundle) => number;
  receivedQty: (bundle: Bundle) => number;
  transferInQty: (bundle: Bundle) => number;
  transferOutQty: (bundle: Bundle) => number;
  pendingTransferInQty: (bundle: Bundle) => number;
  currentQty: (bundle: Bundle) => number;
  getMemberCheck: (member: Member) => MemberCheck | undefined;
  membersForBundle: (bundle: Bundle) => Member[];
  deriveBundleStatus: (bundle: Bundle) => BundleCheckStatus;
  saveBundleCheck: (bundle: Bundle, qtyReceived: number, forcedStatus?: BundleCheckStatus) => Promise<void>;
  clearBundleCheck: (bundle: Bundle) => Promise<void>;
  updateMemberStatus: (member: Member, status: MemberCheckStatus) => Promise<void>;
  clearMemberStatus: (member: Member) => Promise<void>;
  createTransfer: (input: CreateTransferInput) => Promise<boolean>;
  confirmTransferReceived: (transfer: MaterialTransfer) => Promise<boolean>;
  cancelTransfer: (transfer: MaterialTransfer) => Promise<boolean>;
  refresh: () => Promise<void>;
};


function safeString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function slugifyConfigCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getTowerTypeValue(tower: TowerRecord | null): string {
  if (!tower) return "";
  const extra = tower.extra_data || {};
  const direct =
    safeString(tower.tower_type) ||
    safeString(tower.type) ||
    safeString(extra["Tower Type"]) ||
    safeString(extra["tower_type"]) ||
    safeString(extra["Type"]);
  return direct.trim();
}

function resolveConfigOptions(
  options: MaterialConfigOption[],
  category: string,
  projectId: string,
): MaterialConfigOption[] {
  const wanted = options.filter(
    (option) =>
      option.is_active &&
      option.category === category &&
      (option.project_id === null || option.project_id === projectId),
  );

  const byCode = new Map<string, MaterialConfigOption>();
  wanted
    .filter((option) => option.project_id === null)
    .forEach((option) => byCode.set(option.code, option));
  wanted
    .filter((option) => option.project_id === projectId)
    .forEach((option) => byCode.set(option.code, option));

  return Array.from(byCode.values()).sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.label.localeCompare(b.label);
  });
}

function amendmentReferenceLabel(
  amendment: MaterialAmendment,
  referenceType?: MaterialConfigOption,
): string {
  const typeLabel = referenceType?.label?.trim() || "";
  const number = amendment.reference_no?.trim() || "";
  return [typeLabel, number].filter(Boolean).join(" ") || amendment.title;
}

function normaliseBundleKey(value: unknown): string {
  return safeString(value).trim().toUpperCase().replace(/\s+/g, "");
}

function normaliseSearch(value: string): string {
  return value.trim().toLowerCase();
}

function normaliseHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

function getRowValue(row: ImportSourceRow, aliases: string[]): unknown {
  const wanted = new Set(aliases.map(normaliseHeader));
  for (const [key, value] of Object.entries(row)) {
    if (wanted.has(normaliseHeader(key))) return value;
  }
  return undefined;
}

function normaliseTowerText(value: unknown): string {
  return safeString(value)
    .trim()
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/\s*([/.\-])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseNumericTowerSuffix(value: string): string {
  const match = value.trim().toUpperCase().match(/^0*(\d+)([A-Z]?)$/);
  if (!match) return "";
  return `${Number(match[1])}${match[2]}`;
}

function towerIdentifierTokens(value: unknown): string[] {
  const raw = normaliseTowerText(value);
  if (!raw) return [];

  const tokens = new Set<string>();
  const fullMatches = raw.match(/[A-Z0-9]+(?:\/|\.)[A-Z0-9]+-0*\d+[A-Z]?/g) || [];

  fullMatches.forEach((match) => {
    const slashForm = match.replace(".", "/");
    tokens.add(`FULL:${slashForm}`);
    const suffix = slashForm.match(/-([0-9]+[A-Z]?)$/)?.[1] || "";
    const normalisedSuffix = normaliseNumericTowerSuffix(suffix);
    if (normalisedSuffix) tokens.add(`NO:${normalisedSuffix}`);
  });

  const labelledMatches = raw.matchAll(
    /(?:TOWER|TWR|STRUCTURE|STR)\.?\s*(?:NO\.?|NUMBER|NUM)?\s*[:#-]?\s*(0*\d+(?:\.0+)?[A-Z]?)/g,
  );

  for (const match of labelledMatches) {
    const numericText = match[1].replace(/\.0+(?=[A-Z]?$)/, "");
    const suffix = normaliseNumericTowerSuffix(numericText);
    if (suffix) tokens.add(`NO:${suffix}`);
  }

  const simple = raw.match(/^0*(\d+)(?:\.0+)?([A-Z]?)$/);
  if (simple) tokens.add(`NO:${Number(simple[1])}${simple[2]}`);

  return Array.from(tokens);
}

function trustedTowerIdentifierTokens(value: unknown): string[] {
  const tokens = new Set(towerIdentifierTokens(value));
  const raw = normaliseTowerText(value);
  if (!raw) return Array.from(tokens);

  const patterns = [
    /^0*(\d{1,5})([A-Z]?)\b/,
    /\b0*(\d{1,5})([A-Z]?)$/,
    /^(?:T|TWR|TOWER|STRUCTURE|STR)[-\s:#.]*0*(\d{1,5})([A-Z]?)\b/,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match) continue;
    const suffix = normaliseNumericTowerSuffix(`${match[1]}${match[2] || ""}`);
    if (suffix) tokens.add(`NO:${suffix}`);
  }

  return Array.from(tokens);
}

function collectFullTowerReferences(value: unknown, output: Set<string>) {
  if (value == null) return;

  if (typeof value === "string" || typeof value === "number") {
    const tokens = towerIdentifierTokens(value);
    if (tokens.some((token) => token.startsWith("FULL:"))) {
      tokens.forEach((token) => output.add(token));
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectFullTowerReferences(item, output));
    return;
  }

  if (typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((nested) =>
      collectFullTowerReferences(nested, output),
    );
  }
}

function looksLikeTowerIdentifierField(fieldName: string): boolean {
  const key = normaliseHeader(fieldName);
  return (
    key.includes("tower") ||
    key.includes("twr") ||
    key.includes("structure") ||
    key === "label" ||
    key === "name"
  );
}

function collectTowerCandidatesFromExtraData(value: unknown, path: string, output: unknown[]) {
  if (value == null) return;

  if (typeof value === "string" || typeof value === "number") {
    if (looksLikeTowerIdentifierField(path)) output.push(value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectTowerCandidatesFromExtraData(item, `${path} ${index}`, output),
    );
    return;
  }

  if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, nested]) => {
      collectTowerCandidatesFromExtraData(nested, `${path} ${key}`, output);
    });
  }
}

function getTowerIdentifierKeys(tower: TowerRecord | null): Set<string> {
  const keys = new Set<string>();
  if (!tower) return keys;

  collectFullTowerReferences(tower, keys);

  const candidates: unknown[] = [
    tower.tower_number,
    tower.structure_number,
    tower.tower_no,
    tower.name,
  ];

  const extra = tower.extra_data || {};
  Object.entries(extra).forEach(([key, value]) => {
    if (looksLikeTowerIdentifierField(key)) {
      if (typeof value === "string" || typeof value === "number") {
        candidates.push(value);
      } else {
        collectTowerCandidatesFromExtraData(value, key, candidates);
      }
      return;
    }

    if (value && typeof value === "object") {
      collectTowerCandidatesFromExtraData(value, key, candidates);
    }
  });

  candidates.forEach((candidate) => {
    trustedTowerIdentifierTokens(candidate).forEach((token) => keys.add(token));
  });

  return keys;
}

function parseApplicableTowerKeys(value: unknown): Set<string> {
  const keys = new Set<string>();
  const raw = safeString(value).trim();
  if (!raw) return keys;

  raw
    .split(/[,;|\n\r]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      towerIdentifierTokens(item).forEach((token) => keys.add(token));
    });

  return keys;
}

function currentTowerMatchesApplicability(
  towerKeys: Set<string>,
  applicableTowerKeys: Set<string>,
): boolean {
  if (applicableTowerKeys.size === 0) return true;
  if (towerKeys.size === 0) return false;

  const towerFull = new Set(Array.from(towerKeys).filter((key) => key.startsWith("FULL:")));
  const applicableFull = new Set(
    Array.from(applicableTowerKeys).filter((key) => key.startsWith("FULL:")),
  );

  if (towerFull.size > 0 && applicableFull.size > 0) {
    for (const key of towerFull) {
      if (applicableFull.has(key)) return true;
    }
    return false;
  }

  for (const key of towerKeys) {
    if (applicableTowerKeys.has(key)) return true;
  }

  return false;
}

function getTowerMatchDisplay(towerKeys: Set<string>): string {
  const full = Array.from(towerKeys).find((key) => key.startsWith("FULL:"));
  if (full) return full.replace(/^FULL:/, "");

  const number = Array.from(towerKeys).find((key) => key.startsWith("NO:"));
  if (number) return number.replace(/^NO:/, "");

  return "not detected";
}


function normaliseBoltDiameter(value: string): string {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return "";
  return trimmed.startsWith("M") ? trimmed : `M${trimmed}`;
}

function normaliseMaterialItemType(value: unknown, packerNo = ""): MaterialItemType {
  const raw = safeString(value).trim().toLowerCase();
  if (raw === "packer" || raw === "packers" || packerNo.trim()) return "packer";
  return "bolt";
}

function materialItemLabel(item: Bolt): string {
  if (item.item_type === "packer") {
    return [item.bolt_diameter, item.packer_no, item.packer_mark ? `(${item.packer_mark})` : ""]
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  return [
    item.bolt_diameter,
    item.length ? `× ${item.length}` : "",
    item.dn_sn ? item.dn_sn.toUpperCase() : "",
    item.bolt_type && item.bolt_type.toLowerCase() !== "standard bolt" ? item.bolt_type : "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function materialItemSearchText(item: Bolt): string {
  return [
    item.item_type,
    item.tower_segment,
    item.drawing_number,
    item.bolt_diameter,
    item.bolt_type,
    item.dn_sn,
    item.length,
    item.packer_no,
    item.packer_mark,
    item.qty,
    materialItemLabel(item),
  ]
    .join(" ")
    .toLowerCase();
}

function csvEscape(value: string | number | null | undefined): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadTextFile(filename: string, content: string, mimeType = "text/csv;charset=utf-8;") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function parseImportFile(file: File): Promise<ImportSourceRow[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "csv") {
    return new Promise((resolve, reject) => {
      Papa.parse<ImportSourceRow>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res: ParseResult<ImportSourceRow>) => resolve(res.data),
        error: reject,
      });
    });
  }

  if (extension === "xlsx" || extension === "xls") {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });

    let bestRows: ImportSourceRow[] = [];
    let bestScore = -1;

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<ImportSourceRow>(sheet, {
        defval: "",
        raw: false,
      });

      if (!rows.length) return;

      const headers = Object.keys(rows[0]).map(normaliseHeader);
      const score =
        (headers.some((h) => ["member mark", "member number", "member no", "mark no"].includes(h)) ? 5 : 0) +
        (headers.some((h) => ["bundle no", "bundle number", "bundle reference", "bundle ref"].includes(h)) ? 5 : 0) +
        (headers.some((h) => h.includes("tower")) ? 2 : 0) +
        (headers.some((h) => h.includes("section") || h.includes("profile")) ? 1 : 0) +
        (headers.some((h) => h.includes("drawing")) ? 1 : 0) +
        (headers.some((h) => h.includes("qty")) ? 1 : 0);

      if (score > bestScore) {
        bestScore = score;
        bestRows = rows;
      }
    });

    if (!bestRows.length) {
      throw new Error("No readable worksheet was found in the workbook.");
    }

    return bestRows;
  }

  throw new Error("Unsupported file type.");
}

function itemDisplayReference(item: MaterialEventItem): string {
  return item.item_reference || item.bolt_size || item.bundle_no || "Unlisted material";
}

function missingIssueStatusLabel(status: MissingIssueStatus): string {
  if (status === "resolved") return "Resolved";
  if (status === "partial") return "Partially Delivered";
  return "Open";
}

function missingIssueStatusClasses(status: MissingIssueStatus): string {
  if (status === "resolved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "partial") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function buildMissingIssues(data: MaterialsData): MissingIssueRow[] {
  const receiptsByIssue = new Map<string, MissingIssueReceipt[]>();

  data.materialEvents
    .filter((event) => event.event_type === "found_received")
    .forEach((event) => {
      event.items.forEach((item) => {
        const sourceIssueKey = item.source_issue_key?.trim();
        if (!sourceIssueKey) return;
        const list = receiptsByIssue.get(sourceIssueKey) || [];
        list.push({ event, item });
        receiptsByIssue.set(sourceIssueKey, list);
      });
    });

  const rows: MissingIssueRow[] = [];

  data.materialEvents
    .filter((event) => event.event_type === "missing")
    .forEach((event) => {
      event.items.forEach((item) => {
        const issueKey = item.issue_key?.trim() || `legacy:${item.id}`;
        const receipts = item.issue_key ? receiptsByIssue.get(item.issue_key) || [] : [];
        const originalQty = Math.max(safeNumber(item.quantity, 1), 0);
        const deliveredQty = receipts.reduce(
          (sum, receipt) => sum + Math.max(safeNumber(receipt.item.quantity, 0), 0),
          0,
        );
        const remainingQty = Math.max(originalQty - deliveredQty, 0);
        const status: MissingIssueStatus =
          remainingQty <= 0 ? "resolved" : deliveredQty > 0 ? "partial" : "open";
        const sortedReceipts = [...receipts].sort((a, b) =>
          safeString(a.event.occurred_at).localeCompare(safeString(b.event.occurred_at)),
        );

        rows.push({
          issueKey,
          event,
          item,
          originalQty,
          deliveredQty,
          remainingQty,
          status,
          reportedAt: event.occurred_at || null,
          lastDeliveryAt: sortedReceipts.at(-1)?.event.occurred_at || null,
          receipts: sortedReceipts,
        });
      });
    });

  return rows.sort((a, b) => {
    const order: Record<MissingIssueStatus, number> = { open: 0, partial: 1, resolved: 2 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return safeString(b.reportedAt).localeCompare(safeString(a.reportedAt));
  });
}

function normaliseSegment(value: string): string {
  const raw = value.trim();
  if (!raw) return "General";

  const legIdentity = parseLegSegmentIdentity(raw);
  if (legIdentity && /\bleg\b/i.test(raw)) {
    return legIdentity.segment;
  }

  const compact = raw.toLowerCase().replace(/\s+/g, " ").trim();

  return compact
    .replace(/\blegs\b/g, "leg")
    .replace(/\bbody ext\b/g, "body extension")
    .replace(/\bcrossarms?\b/g, "crossarms")
    .split(" ")
    .map((word) =>
      word.replace(/(^|[_/])([a-z])/g, (_match, prefix: string, letter: string) =>
        `${prefix}${letter.toUpperCase()}`,
      ),
    )
    .join(" ");
}

function materialSegmentKey(value: string): string {
  return normaliseSegment(value)
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/[^A-Z0-9+-]/g, "");
}

function isGeneralMaterialSegment(value: string): boolean {
  return materialSegmentKey(value) === materialSegmentKey("General");
}

function formatLegMetres(value: number): string {
  const absolute = Math.abs(value);
  const magnitude = Number.isInteger(absolute)
    ? String(absolute)
    : String(Number(absolute.toFixed(3)));
  return value < 0 ? `-${magnitude}m` : `+${magnitude}m`;
}

function parseLegSegmentIdentity(
  value: unknown,
  options?: { allowBareNumeric?: boolean },
): { key: string; segment: string } | null {
  let raw = safeString(value)
    .trim()
    .replace(/[–—]/g, "-");

  if (!raw) return null;

  // Accept drawing / CSV variants such as +5Am and +5m_A without
  // hard-coding any particular leg height.
  raw = raw.replace(
    /([+-]?\d+(?:\.\d+)?)\s*([AB])\s*[mM]\b/g,
    "$1m_$2",
  );

  let match = raw.match(
    /([+-]?\d+(?:\.\d+)?)\s*[mM]\s*(?:[_\s-]*([AB]))?/i,
  );

  if (!match && (options?.allowBareNumeric || /\bleg\b/i.test(raw))) {
    match = raw.match(
      /([+-]?\d+(?:\.\d+)?)\s*(?:[_\s-]*([AB]))?(?:\s*(?:leg|legs|extension))?/i,
    );
  }

  if (!match) return null;

  const metres = Number(match[1]);
  if (!Number.isFinite(metres)) return null;

  const variant = safeString(match[2]).trim().toUpperCase();
  const height = formatLegMetres(metres);
  const suffix = variant ? `_${variant}` : "";
  const segment = `${height}${suffix} Leg Extension`;

  return {
    key: `LEG:${height.toUpperCase()}${suffix}`,
    segment,
  };
}

function isLegMaterialSegmentValue(value: string): boolean {
  if (!/\bleg\b/i.test(value)) return false;
  return parseLegSegmentIdentity(value) !== null;
}

function configuredLegCountFromExtra(extra: Record<string, unknown>): number {
  const countKeys = new Set(
    [
      "Leg Count",
      "Number of Legs",
      "No of Legs",
      "No. of Legs",
      "Qty Legs",
      "Leg Qty",
      "leg_count",
      "number_of_legs",
    ].map(normaliseHeader),
  );

  for (const [key, value] of Object.entries(extra)) {
    if (!countKeys.has(normaliseHeader(key))) continue;
    const count = Math.floor(safeNumber(value, 0));
    if (count > 0 && count <= 20) return count;
  }

  // Transmission towers in this workflow use four legs. If the source
  // supplies an explicit leg count, that value above takes precedence.
  return 4;
}

function addLegConfigurationCount(
  map: Map<string, LegConfigurationEntry>,
  identity: { key: string; segment: string } | null,
  count: number,
) {
  if (!identity || !Number.isFinite(count) || count <= 0) return;

  const cleanCount = Math.max(Math.floor(count), 1);
  const existing = map.get(identity.key);

  map.set(identity.key, {
    key: identity.key,
    segment: identity.segment,
    count: (existing?.count || 0) + cleanCount,
  });
}

function parseLegConfigurationValue(
  value: unknown,
  defaultSingleCount: number,
  treatValuesAsIndividualLegs = false,
): LegConfigurationEntry[] {
  const result = new Map<string, LegConfigurationEntry>();

  const add = (
    identity: { key: string; segment: string } | null,
    count: number,
  ) => addLegConfigurationCount(result, identity, count);

  const visit = (input: unknown, individual: boolean) => {
    if (input === null || input === undefined || input === "") return;

    if (Array.isArray(input)) {
      input.forEach((item) => visit(item, true));
      return;
    }

    if (typeof input === "object") {
      const object = input as Record<string, unknown>;
      const explicitCount = safeNumber(
        object["count"] ??
          object["qty"] ??
          object["quantity"] ??
          object["leg_count"] ??
          object["legCount"],
        0,
      );
      const descriptor =
        object["value"] ??
        object["type"] ??
        object["extension"] ??
        object["leg_extension"] ??
        object["legExtension"] ??
        object["height"];

      if (descriptor !== undefined && explicitCount > 0) {
        add(
          parseLegSegmentIdentity(descriptor, { allowBareNumeric: true }),
          explicitCount,
        );
        return;
      }

      Object.entries(object).forEach(([key, nested]) => {
        if (
          ["count", "qty", "quantity", "leg count", "leg_count", "legcount"].includes(
            normaliseHeader(key),
          )
        ) {
          return;
        }
        visit(nested, true);
      });
      return;
    }

    if (typeof input === "number") {
      add(
        parseLegSegmentIdentity(input, { allowBareNumeric: true }),
        individual ? 1 : defaultSingleCount,
      );
      return;
    }

    const text = safeString(input).trim();
    if (!text) return;

    if (
      (text.startsWith("[") && text.endsWith("]")) ||
      (text.startsWith("{") && text.endsWith("}"))
    ) {
      try {
        visit(JSON.parse(text), individual);
        return;
      } catch {
        // Continue with the normal text parser.
      }
    }

    const countFirst = text.match(
      /^\s*(\d+)\s*[x×]\s*(.+?)\s*(?:legs?)?\s*$/i,
    );
    if (countFirst) {
      add(
        parseLegSegmentIdentity(countFirst[2], { allowBareNumeric: true }),
        Number(countFirst[1]),
      );
      return;
    }

    const countLast = text.match(
      /^\s*(.+?)\s*[x×]\s*(\d+)\s*(?:legs?)?\s*$/i,
    );
    if (countLast) {
      add(
        parseLegSegmentIdentity(countLast[1], { allowBareNumeric: true }),
        Number(countLast[2]),
      );
      return;
    }

    const separated = text
      .split(/\s*(?:[,;/|]|\r?\n)\s*/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (separated.length > 1) {
      separated.forEach((part) =>
        add(
          parseLegSegmentIdentity(part, { allowBareNumeric: true }),
          1,
        ),
      );
      return;
    }

    const metreTokens = Array.from(
      text.matchAll(
        /[+-]?\d+(?:\.\d+)?\s*(?:(?:[AB]\s*)?[mM])(?:\s*[_-]?\s*[AB])?/gi,
      ),
    )
      .map((match) => match[0])
      .filter(Boolean);

    if (metreTokens.length > 1) {
      metreTokens.forEach((token) =>
        add(
          parseLegSegmentIdentity(token, { allowBareNumeric: true }),
          1,
        ),
      );
      return;
    }

    add(
      parseLegSegmentIdentity(text, { allowBareNumeric: true }),
      individual || treatValuesAsIndividualLegs ? 1 : defaultSingleCount,
    );
  };

  visit(value, treatValuesAsIndividualLegs);

  return Array.from(result.values()).sort((a, b) =>
    a.segment.localeCompare(b.segment),
  );
}

function isExplicitLegFieldName(value: string): boolean {
  const key = normaliseHeader(value);

  return (
    /\bleg (?:extension )?(?:[1-9]\d*|[a-d])\b/.test(key) ||
    /\b(?:[1-9]\d*|[a-d]) leg(?: extension)?\b/.test(key)
  );
}

function isGenericLegFieldName(value: string): boolean {
  const key = normaliseHeader(value);

  return (
    key === "leg" ||
    key === "legs" ||
    key === "leg type" ||
    key === "leg types" ||
    key === "leg extension" ||
    key === "leg extensions" ||
    key === "leg extension type" ||
    key === "leg configuration" ||
    key === "leg configurations" ||
    key.includes("leg extension")
  );
}

function deriveTowerLegConfiguration(
  tower: TowerRecord | null,
): LegConfigurationEntry[] {
  const extra = tower?.extra_data || {};
  if (!Object.keys(extra).length) return [];

  const defaultLegCount = configuredLegCountFromExtra(extra);
  const explicitValues: unknown[] = [];
  const genericValues: unknown[] = [];

  Object.entries(extra).forEach(([key, value]) => {
    const normalisedKey = normaliseHeader(key);

    if (
      normalisedKey.includes("leg count") ||
      normalisedKey.includes("number of legs") ||
      normalisedKey === "no of legs" ||
      normalisedKey === "qty legs" ||
      normalisedKey === "leg qty"
    ) {
      return;
    }

    if (isExplicitLegFieldName(key)) {
      explicitValues.push(value);
      return;
    }

    if (isGenericLegFieldName(key)) {
      genericValues.push(value);
    }
  });

  if (explicitValues.length > 0) {
    const merged = new Map<string, LegConfigurationEntry>();

    explicitValues.forEach((value) => {
      parseLegConfigurationValue(value, 1, true).forEach((entry) =>
        addLegConfigurationCount(merged, entry, entry.count),
      );
    });

    if (merged.size > 0) {
      return Array.from(merged.values()).sort((a, b) =>
        a.segment.localeCompare(b.segment),
      );
    }
  }

  // Generic aliases may repeat the same source value in extra_data. Select the
  // richest parsed configuration instead of summing aliases together.
  let best: LegConfigurationEntry[] = [];
  let bestCount = 0;
  const seenValues = new Set<string>();

  genericValues.forEach((value) => {
    let signature = "";
    try {
      signature =
        typeof value === "string" ? value.trim() : JSON.stringify(value);
    } catch {
      signature = safeString(value);
    }

    if (signature && seenValues.has(signature)) return;
    if (signature) seenValues.add(signature);

    const parsed = parseLegConfigurationValue(value, defaultLegCount, false);
    const count = parsed.reduce((sum, entry) => sum + entry.count, 0);

    if (count > bestCount) {
      best = parsed;
      bestCount = count;
    }
  });

  return best;
}

function formatLegConfigurationSummary(
  configuration: LegConfigurationEntry[],
): string {
  if (!configuration.length) return "Not detected";

  return configuration
    .map((entry) => {
      const shortSegment = entry.segment.replace(/\s+Leg Extension$/i, "");
      return `${shortSegment} × ${entry.count}`;
    })
    .join(" · ");
}

function materialQuantityBasis(
  baseQty: number,
  segment: string,
  multiplier: number,
  legConfigurationDetected: boolean,
  quantityBasisBehavior = "inherit",
): string {
  if (quantityBasisBehavior === "per_tower") {
    return `${baseQty} per tower`;
  }

  if (quantityBasisBehavior === "per_leg") {
    if (!legConfigurationDetected) return `${baseQty} per leg`;
    return `${baseQty} × ${multiplier} ${multiplier === 1 ? "leg" : "legs"}`;
  }

  if (isLegMaterialSegmentValue(segment)) {
    if (!legConfigurationDetected) {
      return `${baseQty} per leg`;
    }

    return `${baseQty} × ${multiplier} ${multiplier === 1 ? "leg" : "legs"}`;
  }

  return `${baseQty} per tower`;
}

function getTowerDisplayLabel(tower: TowerRecord | null): string {
  if (!tower) return "Unknown Tower";

  const extra = tower.extra_data || {};

  return (
    safeString(tower.tower_number) ||
    safeString(tower.structure_number) ||
    safeString(tower.tower_no) ||
    safeString(tower.name) ||
    safeString(extra["Tower No"]) ||
    safeString(extra["Tower Number"]) ||
    safeString(extra["Structure Number"]) ||
    safeString(extra["Structure No"]) ||
    "Unknown Tower"
  );
}

function escapeHtml(value: unknown): string {
  return safeString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

function statusLabel(status: BundleCheckStatus | MemberCheckStatus): string {
  switch (status) {
    case "arrived": return "Arrived";
    case "partial": return "Partial";
    case "missing": return "Missing";
    case "not_here": return "Not Here";
    case "issue": return "Issue";
    case "transferred": return "Transferred Out";
    default: return "Not Checked";
  }
}

function statusClasses(status: BundleCheckStatus | MemberCheckStatus): string {
  switch (status) {
    case "arrived": return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "partial": return "border-amber-200 bg-amber-50 text-amber-700";
    case "missing": return "border-rose-200 bg-rose-50 text-rose-700";
    case "not_here": return "border-orange-200 bg-orange-50 text-orange-700";
    case "issue": return "border-violet-200 bg-violet-50 text-violet-700";
    case "transferred": return "border-blue-200 bg-blue-50 text-blue-700";
    default: return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function bundleUiKey(bundle: Bundle): string {
  return bundle.id || `${normaliseBundleKey(bundle.bundle_no)}::${normaliseSegment(bundle.section)}`;
}

function workOutcomeLabel(value: string | null | undefined): string {
  const labels: Record<string, string> = {
    stopped_work: "Couldn’t continue",
    slowed_down: "Slowed down",
    changed_sequence: "Resequenced",
    minor_impact: "Minor impact",
  };
  return value ? labels[value] || value : "—";
}

function useMaterialsData(projectId: string, towerId: string) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [tower, setTower] = useState<TowerRecord | null>(null);
  const [projectTowers, setProjectTowers] = useState<ProjectTowerOption[]>([]);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [bolts, setBolts] = useState<Bolt[]>([]);
  const [materialConfigOptions, setMaterialConfigOptions] = useState<MaterialConfigOption[]>([]);
  const [materialAmendments, setMaterialAmendments] = useState<MaterialAmendment[]>([]);
  const [amendmentSetupAvailable, setAmendmentSetupAvailable] = useState(true);
  const [amendmentSetupError, setAmendmentSetupError] = useState<string | null>(null);
  const [bundleChecks, setBundleChecks] = useState<BundleCheck[]>([]);
  const [memberChecks, setMemberChecks] = useState<MemberCheck[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [materialEvents, setMaterialEvents] = useState<MaterialEvent[]>([]);
  const [transfers, setTransfers] = useState<MaterialTransfer[]>([]);
  const [dockets, setDockets] = useState<DocketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchAllMembers = useCallback(async () => {
    const pageSize = 1000;
    const rows: Record<string, unknown>[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("tower_material_members")
        .select("*")
        .eq("tower_id", towerId)
        .order("bundle_reference", { ascending: true })
        .order("mark_no", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const page = (data || []) as Record<string, unknown>[];
      rows.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    return rows;
  }, [supabase, towerId]);

  const fetchAllMemberChecks = useCallback(async () => {
    const pageSize = 1000;
    const rows: Record<string, unknown>[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("tower_material_member_checks")
        .select("*")
        .eq("tower_id", towerId)
        .order("bundle_no", { ascending: true })
        .order("mark_no", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const page = (data || []) as Record<string, unknown>[];
      rows.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    return rows;
  }, [supabase, towerId]);

  const loadAmendmentLayer = useCallback(async () => {
    const [configRes, amendmentRes] = await Promise.all([
      supabase
        .from("material_config_options")
        .select("*")
        .or(`project_id.is.null,project_id.eq.${projectId}`)
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true }),
      supabase
        .from("material_amendments")
        .select(`
          *,
          items:material_amendment_items(*)
        `)
        .eq("project_id", projectId)
        .order("effective_date", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true }),
    ]);

    if (configRes.error || amendmentRes.error) {
      const message =
        configRes.error?.message ||
        amendmentRes.error?.message ||
        "Material amendment tables are not available.";
      setMaterialConfigOptions([]);
      setMaterialAmendments([]);
      setAmendmentSetupAvailable(false);
      setAmendmentSetupError(message);
      return;
    }

    setAmendmentSetupAvailable(true);
    setAmendmentSetupError(null);

    setMaterialConfigOptions(
      ((configRes.data || []) as Array<Record<string, unknown>>).map((row) => ({
        id: safeString(row.id),
        project_id: safeString(row.project_id) || null,
        category: safeString(row.category).trim(),
        code: safeString(row.code).trim(),
        label: safeString(row.label).trim(),
        behavior: safeString(row.behavior).trim(),
        value_text: safeString(row.value_text) || null,
        value_number: row.value_number == null ? null : safeNumber(row.value_number),
        is_effective: Boolean(row.is_effective),
        is_closed: Boolean(row.is_closed),
        is_active: row.is_active !== false,
        sort_order: safeNumber(row.sort_order, 0),
        metadata:
          row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, unknown>)
            : {},
      })),
    );

    setMaterialAmendments(
      ((amendmentRes.data || []) as Array<Record<string, unknown>>).map((row) => ({
        id: safeString(row.id),
        project_id: safeString(row.project_id, projectId),
        tower_id: safeString(row.tower_id) || null,
        tower_type: safeString(row.tower_type) || null,
        drawing_number: safeString(row.drawing_number) || null,
        drawing_revision: safeString(row.drawing_revision) || null,
        tower_segment: safeString(row.tower_segment)
          ? normaliseSegment(safeString(row.tower_segment))
          : null,
        scope_config_id: safeString(row.scope_config_id),
        reference_type_config_id: safeString(row.reference_type_config_id) || null,
        reference_no: safeString(row.reference_no) || null,
        title: safeString(row.title, "Material amendment"),
        reason: safeString(row.reason) || null,
        status_config_id: safeString(row.status_config_id),
        effective_date: safeString(row.effective_date) || null,
        document_url: safeString(row.document_url) || null,
        created_by: safeString(row.created_by) || null,
        created_at: safeString(row.created_at) || null,
        approved_by: safeString(row.approved_by) || null,
        approved_at: safeString(row.approved_at) || null,
        items: Array.isArray(row.items)
          ? (row.items as Array<Record<string, unknown>>).map((item) => {
              const packerNo = safeString(item.packer_no).trim();
              return {
                id: safeString(item.id),
                amendment_id: safeString(item.amendment_id),
                action_config_id: safeString(item.action_config_id),
                base_material_id: safeString(item.base_material_id) || null,
                item_type: normaliseMaterialItemType(item.item_type, packerNo),
                tower_segment: normaliseSegment(
                  safeString(item.tower_segment, "General"),
                ),
                drawing_number: safeString(item.drawing_number).trim(),
                bolt_diameter: normaliseBoltDiameter(safeString(item.bolt_diameter)),
                bolt_type: safeString(item.bolt_type, "Standard Bolt").trim() || "Standard Bolt",
                dn_sn: safeString(item.dn_sn).trim().toUpperCase(),
                length: safeString(item.length).trim(),
                packer_no: packerNo,
                packer_mark: safeString(item.packer_mark).trim(),
                qty: safeNumber(item.qty, 0),
                quantity_basis_config_id: safeString(item.quantity_basis_config_id) || null,
                notes: safeString(item.notes) || null,
              };
            })
          : [],
      })),
    );
  }, [projectId, supabase]);

  const load = useCallback(async () => {
    if (!towerId) return;
    setLoading(true);
    try {
      const [
        towerRes,
        projectTowersRes,
        bundleRes,
        memberRows,
        boltRes,
        deliveryRes,
        docketRes,
        bundleCheckRes,
        memberCheckRows,
        eventRes,
        transferRes,
      ] = await Promise.all([
        supabase.from("towers").select("*").eq("id", towerId).single(),
        supabase.from("towers").select("id,name,line").eq("project_id", projectId).order("name"),
        supabase.from("tower_required_bundles").select("*").eq("tower_id", towerId).order("section").order("bundle_no"),
        fetchAllMembers(),
        supabase.from("tower_material_bolts").select("*").eq("tower_id", towerId).order("item_type").order("tower_segment").order("bolt_diameter").order("length"),
        supabase.from("tower_bundle_deliveries").select("tower_bundle_delivery_items(*)").eq("tower_id", towerId),
        supabase.from("tower_daily_dockets").select("id,docket_date,crew,leading_hand").eq("tower_id", towerId).order("docket_date", { ascending: false }),
        supabase.from("tower_material_bundle_checks").select("*").eq("tower_id", towerId),
        fetchAllMemberChecks(),
        supabase
          .from("tower_material_events")
          .select(`
            id,
            project_id,
            docket_id,
            tower_id,
            event_type,
            source_tower_id,
            destination_tower_id,
            source_location,
            destination_location,
            occurred_at,
            affected_work,
            work_outcome,
            affected_activity,
            affected_section,
            impact_started_at,
            impact_finished_at,
            impact_ongoing,
            current_effect,
            mitigation_actions,
            commercial_impact_type,
            notes,
            items:tower_material_event_items(
              id,
              event_id,
              source_table,
              source_record_id,
              material_type,
              bolt_size,
              item_reference,
              item_description,
              quantity,
              unit,
              notes,
              issue_key,
              source_issue_key,
              bundle_id,
              bundle_no,
              bundle_section
            )
          `)
          .eq("tower_id", towerId)
          .order("occurred_at", { ascending: false }),
        supabase
          .from("tower_material_transfers")
          .select("*")
          .eq("project_id", projectId)
          .or(`source_tower_id.eq.${towerId},destination_tower_id.eq.${towerId}`)
          .order("transferred_at", { ascending: false }),
      ]);

      const errors = [
        towerRes.error,
        projectTowersRes.error,
        bundleRes.error,
        boltRes.error,
        deliveryRes.error,
        docketRes.error,
        bundleCheckRes.error,
        eventRes.error,
        transferRes.error,
      ].filter(Boolean);
      if (errors.length) throw errors[0];

      setTower((towerRes.data as TowerRecord | null) || null);
      setProjectTowers(
        ((projectTowersRes.data || []) as Array<Record<string, unknown>>).map((row) => ({
          id: safeString(row.id),
          name: safeString(row.name, "Unnamed tower"),
          line: safeString(row.line) || null,
        })),
      );
      const loadedDockets = (docketRes.data || []) as DocketSummary[];
      setDockets(loadedDockets);
      setLatestDate(loadedDockets[0]?.docket_date || null);

      setBundles(((bundleRes.data || []) as Record<string, unknown>[]).map((row) => ({
        id: safeString(row.id) || undefined,
        tower_id: towerId,
        bundle_no: safeString(row.bundle_no),
        section: normaliseSegment(safeString(row.section, "General")),
        qty_required: Math.max(safeNumber(row.qty_required), 0),
        member_qty: Math.max(safeNumber(row.member_qty), 0),
        total_weight: row.total_weight == null ? null : safeNumber(row.total_weight),
      })));

      setMembers(memberRows.map((row) => ({
        id: safeString(row.id) || undefined,
        tower_id: towerId,
        bundle_id: safeString(row.bundle_id) || null,
        bundle_reference: safeString(row.bundle_reference),
        drawing_number: safeString(row.drawing_number),
        mark_no: safeString(row.mark_no),
        qty_per_tower: row.qty_per_tower == null ? null : Math.max(safeNumber(row.qty_per_tower), 0),
        section: safeString(row.section).trim(),
        tower_segment: safeString(row.tower_segment).trim() ? normaliseSegment(safeString(row.tower_segment)) : "",
      })));

      setBolts(((boltRes.data || []) as Record<string, unknown>[]).map((row) => {
        const packerNo = safeString(row.packer_no).trim();
        return {
          id: safeString(row.id) || undefined,
          tower_id: towerId,
          item_type: normaliseMaterialItemType(row.item_type, packerNo),
          tower_segment: normaliseSegment(safeString(row.tower_segment, "General")),
          drawing_number: safeString(row.drawing_number).trim(),
          bolt_diameter: normaliseBoltDiameter(safeString(row.bolt_diameter)),
          bolt_type: safeString(row.bolt_type, "Standard Bolt").trim() || "Standard Bolt",
          dn_sn: safeString(row.dn_sn).trim(),
          length: safeString(row.length).trim(),
          packer_no: packerNo,
          packer_mark: safeString(row.packer_mark).trim(),
          qty: Math.max(safeNumber(row.qty), 0),
        };
      }));

      setBundleChecks(((bundleCheckRes.data || []) as Record<string, unknown>[]).map((row) => ({
        id: safeString(row.id) || undefined,
        tower_id: safeString(row.tower_id, towerId),
        bundle_id: safeString(row.bundle_id) || null,
        bundle_no: safeString(row.bundle_no),
        status: (safeString(row.status, "not_checked") || "not_checked") as BundleCheckStatus,
        notes: safeString(row.notes),
        checked_by: safeString(row.checked_by),
        checked_at: safeString(row.checked_at) || null,
        qty_received: Math.max(safeNumber(row.qty_received), 0),
      })));

      setMemberChecks(memberCheckRows.map((row) => ({
        id: safeString(row.id) || undefined,
        tower_id: safeString(row.tower_id, towerId),
        bundle_id: safeString(row.bundle_id) || null,
        bundle_no: safeString(row.bundle_no),
        mark_no: safeString(row.mark_no),
        status: (safeString(row.status, "not_checked") || "not_checked") as MemberCheckStatus,
        notes: safeString(row.notes),
        checked_by: safeString(row.checked_by),
        checked_at: safeString(row.checked_at) || null,
      })));

      setDeliveries((deliveryRes.data || []) as Delivery[]);
      setMaterialEvents(((eventRes.data || []) as unknown as MaterialEvent[]).map((event) => ({ ...event, items: event.items || [] })));
      setTransfers(
        ((transferRes.data || []) as Array<Record<string, unknown>>).map((row) => ({
          id: safeString(row.id),
          transfer_no: row.transfer_no == null ? null : safeNumber(row.transfer_no),
          project_id: safeString(row.project_id, projectId),
          source_tower_id: safeString(row.source_tower_id),
          destination_tower_id: safeString(row.destination_tower_id),
          source_bundle_id: safeString(row.source_bundle_id),
          destination_bundle_id: safeString(row.destination_bundle_id),
          bundle_no: safeString(row.bundle_no),
          bundle_section: normaliseSegment(safeString(row.bundle_section, "General")),
          quantity: Math.max(safeNumber(row.quantity), 0),
          status: (safeString(row.status, "in_transit") || "in_transit") as TransferStatus,
          transferred_by: safeString(row.transferred_by) || null,
          transferred_by_name: safeString(row.transferred_by_name) || null,
          transferred_at: safeString(row.transferred_at) || null,
          received_by: safeString(row.received_by) || null,
          received_by_name: safeString(row.received_by_name) || null,
          received_at: safeString(row.received_at) || null,
          cancelled_by: safeString(row.cancelled_by) || null,
          cancelled_by_name: safeString(row.cancelled_by_name) || null,
          cancelled_at: safeString(row.cancelled_at) || null,
          source_docket_id: safeString(row.source_docket_id) || null,
          destination_docket_id: safeString(row.destination_docket_id) || null,
          notes: safeString(row.notes) || null,
        })),
      );

      await loadAmendmentLayer();
    } catch (error) {
      console.error("materials load error", error);} finally {
      setLoading(false);
    }
  }, [fetchAllMemberChecks, fetchAllMembers, loadAmendmentLayer, projectId, supabase, towerId]);

  useEffect(() => { void load(); }, [load]);

  const bundlesByReference = useMemo(() => {
    const map = new Map<string, Bundle[]>();
    bundles.forEach((bundle) => {
      const key = normaliseBundleKey(bundle.bundle_no);
      map.set(key, [...(map.get(key) || []), bundle]);
    });
    return map;
  }, [bundles]);

  const bundleById = useMemo(() => {
    const map = new Map<string, Bundle>();
    bundles.forEach((bundle) => {
      if (bundle.id) map.set(bundle.id, bundle);
    });
    return map;
  }, [bundles]);

  const resolveBundleForMember = useCallback((member: Member) => {
    if (member.bundle_id) {
      const linked = bundleById.get(member.bundle_id);
      if (linked) return linked;
    }

    const candidates = bundlesByReference.get(normaliseBundleKey(member.bundle_reference)) || [];
    if (candidates.length === 1) return candidates[0];

    const segment = member.tower_segment.trim()
      ? normaliseSegment(member.tower_segment)
      : "";

    if (segment) {
      const exact = candidates.filter(
        (bundle) => normaliseSegment(bundle.section) === segment,
      );
      if (exact.length === 1) return exact[0];
    }

    return undefined;
  }, [bundleById, bundlesByReference]);

  const towerLegConfiguration = deriveTowerLegConfiguration(tower);
  const towerLegExpectedCount = configuredLegCountFromExtra(
    tower?.extra_data || {},
  );
  const towerLegConfiguredCount = towerLegConfiguration.reduce(
    (sum, entry) => sum + entry.count,
    0,
  );
  const legConfigurationDetected = towerLegConfiguration.length > 0;
  const legConfigurationComplete =
    legConfigurationDetected &&
    towerLegConfiguredCount === towerLegExpectedCount;

  const legMultiplierByKey = new Map(
    towerLegConfiguration.map((entry) => [entry.key, entry.count]),
  );

  const getMaterialMultiplier = (segment: string): number => {
    const identity = parseLegSegmentIdentity(segment);

    if (!identity || !isLegMaterialSegmentValue(segment)) {
      return 1;
    }

    if (!legConfigurationDetected) {
      return 1;
    }

    return Math.max(legMultiplierByKey.get(identity.key) || 0, 0);
  };

  const applicableMaterialSegmentMap = new Map<string, string>();

  const addApplicableMaterialSegment = (value: string) => {
    const display = normaliseSegment(value);
    if (isGeneralMaterialSegment(display)) return;

    const legIdentity = parseLegSegmentIdentity(display);
    if (
      legIdentity &&
      isLegMaterialSegmentValue(display) &&
      legConfigurationDetected &&
      !legMultiplierByKey.has(legIdentity.key)
    ) {
      return;
    }

    const key = materialSegmentKey(display);
    if (!key || applicableMaterialSegmentMap.has(key)) return;
    applicableMaterialSegmentMap.set(key, display);
  };

  // The bundle/member register remains the source of the structural assemblies
  // required by the tower. Tower Overview leg configuration is then used as an
  // authoritative cross-check for leg-extension rows and their multiplicity.
  bundles.forEach((bundle) => addApplicableMaterialSegment(bundle.section));

  members.forEach((member) => {
    const resolvedBundle = resolveBundleForMember(member);
    if (!resolvedBundle) return;

    addApplicableMaterialSegment(resolvedBundle.section);
    if (member.tower_segment.trim()) {
      addApplicableMaterialSegment(member.tower_segment);
    }
  });

  towerLegConfiguration.forEach((entry) =>
    addApplicableMaterialSegment(entry.segment),
  );

  const applicableMaterialSegments = Array.from(
    applicableMaterialSegmentMap.values(),
  ).sort((a, b) => a.localeCompare(b));

  const applicableMaterialSegmentKeys = new Set(
    applicableMaterialSegments.map(materialSegmentKey),
  );

  const materialApplicabilityActive = applicableMaterialSegmentKeys.size > 0;

  const isMaterialSegmentApplicable = (segment: string): boolean => {
    const display = normaliseSegment(segment);

    if (isGeneralMaterialSegment(display)) return true;

    const legIdentity = parseLegSegmentIdentity(display);
    if (
      legIdentity &&
      isLegMaterialSegmentValue(display) &&
      legConfigurationDetected
    ) {
      return legMultiplierByKey.has(legIdentity.key);
    }

    if (!materialApplicabilityActive) return true;

    return applicableMaterialSegmentKeys.has(materialSegmentKey(display));
  };

  const getMaterialConfigOptions = (category: string): MaterialConfigOption[] =>
    resolveConfigOptions(materialConfigOptions, category, projectId);

  const materialConfigById = new Map(
    materialConfigOptions.map((option) => [option.id, option]),
  );

  const getMaterialConfigOption = (
    id: string | null | undefined,
  ): MaterialConfigOption | undefined =>
    id ? materialConfigById.get(id) : undefined;

  const getMaterialMultiplierForItem = (item: Bolt): number => {
    const behavior = item.quantity_basis_behavior || "inherit";
    if (behavior === "per_tower") return 1;
    if (behavior === "per_leg") {
      return getMaterialMultiplier(item.tower_segment);
    }
    return getMaterialMultiplier(item.tower_segment);
  };

  const getRequiredMaterialQty = (item: Bolt): number => {
    const multiplier = getMaterialMultiplierForItem(item);
    return Math.max(Number(item.qty || 0), 0) * Math.max(multiplier, 0);
  };

  const applicableBolts = materialApplicabilityActive
    ? bolts.filter((item) =>
        isMaterialSegmentApplicable(item.tower_segment),
      )
    : bolts;

  const currentTowerType = getTowerTypeValue(tower);

  const amendmentIsInCurrentTowerScope = (amendment: MaterialAmendment): boolean => {
    if (amendment.project_id !== projectId) return false;

    const status = getMaterialConfigOption(amendment.status_config_id);
    if (!status?.is_effective) return false;

    const scope = getMaterialConfigOption(amendment.scope_config_id);
    const behavior = scope?.behavior || "";

    if (behavior === "tower") {
      return amendment.tower_id === towerId;
    }

    if (behavior === "tower_type") {
      return Boolean(
        amendment.tower_type &&
          currentTowerType &&
          normaliseHeader(amendment.tower_type) === normaliseHeader(currentTowerType),
      );
    }

    if (behavior === "project") return true;

    if (behavior === "drawing") {
      const drawing = safeString(amendment.drawing_number).trim().toUpperCase();
      if (!drawing) return false;
      return applicableBolts.some(
        (item) => item.drawing_number.trim().toUpperCase() === drawing,
      );
    }

    if (behavior === "segment") {
      return Boolean(
        amendment.tower_segment &&
          isMaterialSegmentApplicable(amendment.tower_segment),
      );
    }

    // Unknown scope behaviours fail closed. Adding a new scope label does not
    // silently broaden where an amendment applies; its configured behaviour
    // must map to a supported scope capability first.
    return false;
  };

  const effectiveBolts = (() => {
    const rows: Bolt[] = applicableBolts.map((item) => ({
      ...item,
      source_kind: "base",
      base_material_id: item.id || null,
      quantity_basis_behavior: item.quantity_basis_behavior || "inherit",
    }));

    const findBaseIndex = (baseMaterialId: string | null) => {
      if (!baseMaterialId) return -1;
      return rows.findIndex(
        (row) =>
          row.base_material_id === baseMaterialId ||
          (row.source_kind === "base" && row.id === baseMaterialId),
      );
    };

    const amendments = [...materialAmendments].sort((a, b) => {
      const aDate = a.effective_date || a.created_at || "";
      const bDate = b.effective_date || b.created_at || "";
      return aDate.localeCompare(bDate);
    });

    amendments.forEach((amendment) => {
      if (!amendmentIsInCurrentTowerScope(amendment)) return;

      const status = getMaterialConfigOption(amendment.status_config_id);
      const referenceType = getMaterialConfigOption(amendment.reference_type_config_id);
      const reference = amendmentReferenceLabel(amendment, referenceType);
      const scope = getMaterialConfigOption(amendment.scope_config_id);

      amendment.items.forEach((amendmentItem) => {
        const action = getMaterialConfigOption(amendmentItem.action_config_id);
        const behavior = action?.behavior || "";
        if (!behavior) return;

        const baseIndex = findBaseIndex(amendmentItem.base_material_id);
        const base = baseIndex >= 0 ? rows[baseIndex] : undefined;

        // Drawing and segment scopes remain row-specific even when the
        // amendment has a base link, preventing an amendment from leaking
        // into another drawing/segment that happens to use the same item.
        if (scope?.behavior === "drawing" && base) {
          const scopeDrawing = safeString(amendment.drawing_number).trim().toUpperCase();
          if (scopeDrawing && base.drawing_number.trim().toUpperCase() !== scopeDrawing) return;
        }
        if (scope?.behavior === "segment" && base) {
          if (
            amendment.tower_segment &&
            materialSegmentKey(base.tower_segment) !== materialSegmentKey(amendment.tower_segment)
          ) {
            return;
          }
        }

        const quantityBasis = getMaterialConfigOption(
          amendmentItem.quantity_basis_config_id,
        );
        const quantityBasisBehavior =
          quantityBasis?.behavior ||
          base?.quantity_basis_behavior ||
          "inherit";

        const amendedRow = (qty: number): Bolt => ({
          id: `amendment:${amendmentItem.id}`,
          tower_id: towerId,
          item_type: amendmentItem.item_type || base?.item_type || "bolt",
          tower_segment: normaliseSegment(
            amendmentItem.tower_segment || base?.tower_segment || amendment.tower_segment || "General",
          ),
          drawing_number:
            amendmentItem.drawing_number ||
            base?.drawing_number ||
            amendment.drawing_number ||
            "",
          bolt_diameter:
            amendmentItem.bolt_diameter || base?.bolt_diameter || "",
          bolt_type:
            amendmentItem.item_type === "packer"
              ? ""
              : amendmentItem.bolt_type || base?.bolt_type || "Standard Bolt",
          dn_sn:
            amendmentItem.item_type === "packer"
              ? ""
              : amendmentItem.dn_sn || base?.dn_sn || "",
          length:
            amendmentItem.item_type === "packer"
              ? ""
              : amendmentItem.length || base?.length || "",
          packer_no:
            amendmentItem.item_type === "packer"
              ? amendmentItem.packer_no || base?.packer_no || ""
              : "",
          packer_mark:
            amendmentItem.item_type === "packer"
              ? amendmentItem.packer_mark || base?.packer_mark || ""
              : "",
          qty,
          quantity_basis_behavior: quantityBasisBehavior,
          source_kind: "amendment",
          base_material_id: amendmentItem.base_material_id || base?.base_material_id || null,
          amendment_id: amendment.id,
          amendment_reference: reference,
          amendment_title: amendment.title,
          amendment_action_label: action?.label || null,
          amendment_status_label: status?.label || null,
          amendment_notes: amendmentItem.notes || amendment.reason || null,
          amendment_document_url: amendment.document_url || null,
          original_item_label: base ? materialItemLabel(base) : null,
        });

        if (behavior === "note") {
          if (!base) return;
          rows[baseIndex] = {
            ...base,
            amendment_id: amendment.id,
            amendment_reference: [base.amendment_reference, reference]
              .filter(Boolean)
              .join("; "),
            amendment_title: amendment.title,
            amendment_action_label: action?.label || null,
            amendment_status_label: status?.label || null,
            amendment_notes: amendmentItem.notes || amendment.reason || null,
            amendment_document_url: amendment.document_url || null,
          };
          return;
        }

        if (behavior === "remove") {
          if (baseIndex >= 0) rows.splice(baseIndex, 1);
          return;
        }

        if (behavior === "replace") {
          if (!base) return;
          const qty = amendmentItem.qty > 0 ? amendmentItem.qty : base.qty;
          rows.splice(baseIndex, 1, amendedRow(qty));
          return;
        }

        if (behavior === "quantity_override") {
          if (!base) return;
          rows.splice(baseIndex, 1, amendedRow(Math.max(amendmentItem.qty, 0)));
          return;
        }

        if (behavior === "quantity_delta") {
          if (!base) return;
          rows.splice(
            baseIndex,
            1,
            amendedRow(Math.max(Number(base.qty || 0) + amendmentItem.qty, 0)),
          );
          return;
        }

        if (behavior === "add") {
          if (amendmentItem.qty <= 0) return;
          const row = amendedRow(amendmentItem.qty);
          if (!isMaterialSegmentApplicable(row.tower_segment)) return;
          rows.push(row);
        }
      });
    });

    return rows.filter((item) => isMaterialSegmentApplicable(item.tower_segment));
  })();

  const duplicateBundleRefs = useMemo(() => {
    return new Set(
      Array.from(bundlesByReference.entries())
        .filter(([, rows]) => rows.length > 1)
        .map(([key]) => key),
    );
  }, [bundlesByReference]);

  const bundleCheckById = useMemo(() => {
    const map = new Map<string, BundleCheck>();

    bundleChecks.forEach((check) => {
      if (check.bundle_id) {
        map.set(check.bundle_id, check);
        return;
      }

      const candidates = bundlesByReference.get(normaliseBundleKey(check.bundle_no)) || [];
      if (candidates.length === 1 && candidates[0].id) {
        map.set(candidates[0].id!, check);
      }
    });

    return map;
  }, [bundleChecks, bundlesByReference]);

  const getBundleCheck = useCallback((bundle: Bundle) => {
    return bundle.id ? bundleCheckById.get(bundle.id) : undefined;
  }, [bundleCheckById]);

  const memberCheckMap = useMemo(() => {
    const map = new Map<string, MemberCheck>();

    memberChecks.forEach((check) => {
      let bundleId = check.bundle_id || "";

      if (!bundleId) {
        const candidates = bundlesByReference.get(normaliseBundleKey(check.bundle_no)) || [];
        if (candidates.length === 1 && candidates[0].id) {
          bundleId = candidates[0].id!;
        }
      }

      if (!bundleId) return;
      map.set(`${bundleId}__${check.mark_no.trim().toUpperCase()}`, check);
    });

    return map;
  }, [memberChecks, bundlesByReference]);

  const membersByBundleId = useMemo(() => {
    const map = new Map<string, Member[]>();

    members.forEach((member) => {
      const bundle = resolveBundleForMember(member);
      if (!bundle?.id) return;
      map.set(bundle.id, [...(map.get(bundle.id) || []), member]);
    });

    return map;
  }, [members, resolveBundleForMember]);

  const docketMap = useMemo(() => {
    const map = new Map<string, DocketSummary>();
    dockets.forEach((docket) => map.set(docket.id, docket));
    return map;
  }, [dockets]);

  const missingEvents = useMemo(() => materialEvents.filter((event) => event.event_type === "missing"), [materialEvents]);
  const excessEvents = useMemo(() => materialEvents.filter((event) => event.event_type === "excess"), [materialEvents]);

  const deliveredQty = useCallback((bundle: Bundle) => {
    let total = 0;
    const refCount = (bundlesByReference.get(normaliseBundleKey(bundle.bundle_no)) || []).length;

    deliveries.forEach((delivery) => {
      (delivery.tower_bundle_delivery_items || []).forEach((item) => {
        if (item.bundle_id && bundle.id && item.bundle_id === bundle.id) {
          total += Math.max(safeNumber(item.qty_delivered), 0);
          return;
        }

        // Old delivery rows only have bundle_no. Use those rows only if the
        // display reference is unique on this tower; never double-count a
        // legacy quantity across duplicate bundle references.
        if (
          !item.bundle_id &&
          refCount === 1 &&
          normaliseBundleKey(item.bundle_no) === normaliseBundleKey(bundle.bundle_no)
        ) {
          total += Math.max(safeNumber(item.qty_delivered), 0);
        }
      });
    });

    return total;
  }, [bundlesByReference, deliveries]);

  const receivedQty = useCallback((bundle: Bundle) => {
    return Math.max(getBundleCheck(bundle)?.qty_received || 0, 0);
  }, [getBundleCheck]);

  const transferOutQty = useCallback((bundle: Bundle) => {
    if (!bundle.id) return 0;
    return transfers
      .filter(
        (transfer) =>
          transfer.source_bundle_id === bundle.id &&
          (transfer.status === "in_transit" || transfer.status === "received"),
      )
      .reduce((sum, transfer) => sum + Math.max(transfer.quantity, 0), 0);
  }, [transfers]);

  const transferInQty = useCallback((bundle: Bundle) => {
    if (!bundle.id) return 0;
    return transfers
      .filter(
        (transfer) =>
          transfer.destination_bundle_id === bundle.id &&
          transfer.status === "received",
      )
      .reduce((sum, transfer) => sum + Math.max(transfer.quantity, 0), 0);
  }, [transfers]);

  const pendingTransferInQty = useCallback((bundle: Bundle) => {
    if (!bundle.id) return 0;
    return transfers
      .filter(
        (transfer) =>
          transfer.destination_bundle_id === bundle.id &&
          transfer.status === "in_transit",
      )
      .reduce((sum, transfer) => sum + Math.max(transfer.quantity, 0), 0);
  }, [transfers]);

  const currentQty = useCallback((bundle: Bundle) => {
    return Math.max(receivedQty(bundle) - transferOutQty(bundle), 0);
  }, [receivedQty, transferOutQty]);

  const getMemberCheck = useCallback((member: Member) => {
    const bundle = resolveBundleForMember(member);
    if (!bundle?.id) return undefined;
    return memberCheckMap.get(`${bundle.id}__${member.mark_no.trim().toUpperCase()}`);
  }, [memberCheckMap, resolveBundleForMember]);

  const membersForBundle = useCallback((bundle: Bundle) => {
    return bundle.id ? membersByBundleId.get(bundle.id) || [] : [];
  }, [membersByBundleId]);

  const deriveBundleStatus = useCallback((bundle: Bundle): BundleCheckStatus => {
    const manual = getBundleCheck(bundle);
    const received = Math.max(manual?.qty_received || 0, 0);
    const current = currentQty(bundle);
    const transferredOut = transferOutQty(bundle);

    if (manual?.status === "issue") return "issue";
    if (received > 0 && current <= 0 && transferredOut > 0) return "transferred";
    if (manual?.status === "missing" && received <= 0) return "missing";
    if (current >= Math.max(bundle.qty_required, 1)) return "arrived";
    if (current > 0) return "partial";

    const related = membersForBundle(bundle);
    if (!related.length) return manual?.status || "not_checked";

    const statuses = related.map((member) => getMemberCheck(member)?.status || "not_checked");
    if (statuses.some((status) => status === "issue")) return "issue";
    if (statuses.every((status) => status === "arrived")) return transferredOut > 0 ? "transferred" : "arrived";
    if (statuses.every((status) => status === "missing")) return "missing";
    if (statuses.some((status) => status !== "not_checked")) return "partial";

    return manual?.status || "not_checked";
  }, [currentQty, getBundleCheck, getMemberCheck, membersForBundle, transferOutQty]);

  const saveBundleCheck = useCallback(async (
    bundle: Bundle,
    qtyReceived: number,
    forcedStatus?: BundleCheckStatus,
  ) => {
    if (!bundle.id) {
      alert("Save this bundle in Data & Imports before recording a site check.");
      return;
    }

    const cleanQty = Math.max(Math.round(qtyReceived), 0);
    const required = Math.max(bundle.qty_required, 1);
    const status: BundleCheckStatus =
      forcedStatus ||
      (cleanQty <= 0 ? "not_checked" : cleanQty < required ? "partial" : "arrived");

    const payload = {
      tower_id: towerId,
      bundle_id: bundle.id,
      bundle_no: bundle.bundle_no.trim(),
      status,
      notes: getBundleCheck(bundle)?.notes || "",
      checked_by: "Site Check",
      checked_at: new Date().toISOString(),
      qty_received: cleanQty,
    };

    setSaving(true);
    const { error } = await supabase
      .from("tower_material_bundle_checks")
      .upsert(payload, { onConflict: "bundle_id" });
    setSaving(false);

    if (error) {
      console.error("bundle check save error", error);
      alert("Failed to save bundle check.");
      return;
    }

    setBundleChecks((prev) => [
      ...prev.filter((row) => row.bundle_id !== bundle.id),
      payload,
    ]);
  }, [getBundleCheck, supabase, towerId]);

  const clearBundleCheck = useCallback(async (bundle: Bundle) => {
    if (!bundle.id) {
      alert("Save this bundle before clearing its checks.");
      return;
    }

    setSaving(true);
    const [bundleResult, memberResult] = await Promise.all([
      supabase.from("tower_material_bundle_checks").delete().eq("bundle_id", bundle.id),
      supabase.from("tower_material_member_checks").delete().eq("bundle_id", bundle.id),
    ]);
    setSaving(false);

    if (bundleResult.error || memberResult.error) {
      console.error("clear bundle checks error", bundleResult.error || memberResult.error);
      alert("Failed to clear bundle check.");
      return;
    }

    setBundleChecks((prev) => prev.filter((row) => row.bundle_id !== bundle.id));
    setMemberChecks((prev) => prev.filter((row) => row.bundle_id !== bundle.id));
  }, [supabase]);

  const updateMemberStatus = useCallback(async (member: Member, status: MemberCheckStatus) => {
    const bundle = resolveBundleForMember(member);

    if (!bundle?.id) {
      alert(
        `TTTracker cannot safely resolve the bundle for member ${member.mark_no}. ` +
          "Check the member's Tower Segment in Data & Imports.",
      );
      return;
    }

    const payload = {
      tower_id: towerId,
      bundle_id: bundle.id,
      bundle_no: bundle.bundle_no.trim(),
      mark_no: member.mark_no.trim(),
      status,
      notes: getMemberCheck(member)?.notes || "",
      checked_by: "Site Check",
      checked_at: new Date().toISOString(),
    };

    setSaving(true);
    const { error } = await supabase
      .from("tower_material_member_checks")
      .upsert(payload, { onConflict: "bundle_id,mark_no" });
    setSaving(false);

    if (error) {
      console.error("member status save error", error);
      alert("Failed to save member status.");
      return;
    }

    const key = `${bundle.id}__${payload.mark_no.toUpperCase()}`;
    setMemberChecks((prev) => [
      ...prev.filter(
        (row) => `${row.bundle_id || ""}__${row.mark_no.trim().toUpperCase()}` !== key,
      ),
      payload,
    ]);
  }, [getMemberCheck, resolveBundleForMember, supabase, towerId]);

  const clearMemberStatus = useCallback(async (member: Member) => {
    const bundle = resolveBundleForMember(member);

    if (!bundle?.id) {
      alert("TTTracker cannot safely resolve this member's bundle.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("tower_material_member_checks")
      .delete()
      .eq("bundle_id", bundle.id)
      .eq("mark_no", member.mark_no.trim());
    setSaving(false);

    if (error) {
      console.error("clear member status error", error);
      alert("Failed to clear member status.");
      return;
    }

    const key = `${bundle.id}__${member.mark_no.trim().toUpperCase()}`;
    setMemberChecks((prev) =>
      prev.filter(
        (row) => `${row.bundle_id || ""}__${row.mark_no.trim().toUpperCase()}` !== key,
      ),
    );
  }, [resolveBundleForMember, supabase]);

  const createTransfer = useCallback(async (input: CreateTransferInput) => {
    const sourceBundle = input.sourceBundle;

    if (!sourceBundle.id) {
      alert("This bundle must have a UUID before it can be transferred.");
      return false;
    }

    if (!input.destinationTowerId || input.destinationTowerId === towerId) {
      alert("Select a different destination tower.");
      return false;
    }

    if (!input.destinationBundleId) {
      alert("Select the matching destination bundle.");
      return false;
    }

    const cleanQty = Math.max(Math.floor(input.quantity), 0);
    const available = currentQty(sourceBundle);

    if (cleanQty <= 0) {
      alert("Enter a transfer quantity greater than zero.");
      return false;
    }

    if (cleanQty > available) {
      alert(`Only ${available} bundle(s) are currently confirmed at this tower.`);
      return false;
    }

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const actorName = safeString(
        user?.user_metadata?.full_name ||
          user?.user_metadata?.name ||
          user?.email ||
          "TTTracker User",
      );

      const { error } = await supabase.from("tower_material_transfers").insert({
        project_id: projectId,
        source_tower_id: towerId,
        destination_tower_id: input.destinationTowerId,
        source_bundle_id: sourceBundle.id,
        destination_bundle_id: input.destinationBundleId,
        bundle_no: sourceBundle.bundle_no.trim(),
        bundle_section: normaliseSegment(sourceBundle.section),
        quantity: cleanQty,
        status: "in_transit",
        transferred_by: user?.id || null,
        transferred_by_name: actorName,
        transferred_at: new Date().toISOString(),
        notes: input.notes.trim() || null,
      });

      if (error) throw error;

      await load();
      return true;
    } catch (error) {
      console.error("create material transfer error", error);
      alert(
        error instanceof Error
          ? error.message
          : "The bundle transfer could not be created.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [currentQty, load, projectId, supabase, towerId]);

  const confirmTransferReceived = useCallback(async (transfer: MaterialTransfer) => {
    if (transfer.destination_tower_id !== towerId) {
      alert("This transfer must be received from the destination tower.");
      return false;
    }

    if (transfer.status !== "in_transit") {
      return transfer.status === "received";
    }

    const destinationBundle = bundles.find(
      (bundle) => bundle.id === transfer.destination_bundle_id,
    );

    if (!destinationBundle?.id) {
      alert(
        "The destination bundle could not be found in this tower's bundle register.",
      );
      return false;
    }

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const actorName = safeString(
        user?.user_metadata?.full_name ||
          user?.user_metadata?.name ||
          user?.email ||
          "TTTracker User",
      );
      const receivedAt = new Date().toISOString();

      const { data: claimed, error: transferError } = await supabase
        .from("tower_material_transfers")
        .update({
          status: "received",
          received_by: user?.id || null,
          received_by_name: actorName,
          received_at: receivedAt,
        })
        .eq("id", transfer.id)
        .eq("status", "in_transit")
        .select("id")
        .maybeSingle();

      if (transferError) throw transferError;

      if (!claimed) {
        throw new Error(
          "This transfer has already been received, cancelled or changed by another user.",
        );
      }

      const existingCheck = getBundleCheck(destinationBundle);
      const nextQty =
        Math.max(existingCheck?.qty_received || 0, 0) +
        Math.max(transfer.quantity, 0);
      const required = Math.max(destinationBundle.qty_required, 1);
      const nextStatus: BundleCheckStatus =
        nextQty >= required ? "arrived" : nextQty > 0 ? "partial" : "not_checked";

      const checkPayload = {
        tower_id: towerId,
        bundle_id: destinationBundle.id,
        bundle_no: destinationBundle.bundle_no.trim(),
        status: nextStatus,
        notes: existingCheck?.notes || "",
        checked_by: actorName,
        checked_at: receivedAt,
        qty_received: nextQty,
      };

      const { error: checkError } = await supabase
        .from("tower_material_bundle_checks")
        .upsert(checkPayload, { onConflict: "bundle_id" });

      if (checkError) {
        await supabase
          .from("tower_material_transfers")
          .update({
            status: "in_transit",
            received_by: null,
            received_by_name: null,
            received_at: null,
          })
          .eq("id", transfer.id)
          .eq("status", "received");

        throw checkError;
      }

      await load();
      return true;
    } catch (error) {
      console.error("receive material transfer error", error);
      alert(
        error instanceof Error
          ? error.message
          : "The incoming transfer could not be received.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [bundles, getBundleCheck, load, supabase, towerId]);

  const cancelTransfer = useCallback(async (transfer: MaterialTransfer) => {
    if (transfer.source_tower_id !== towerId) {
      alert("Only the source tower can cancel an in-transit transfer.");
      return false;
    }

    if (transfer.status !== "in_transit") {
      alert("Only an in-transit transfer can be cancelled.");
      return false;
    }

    if (!window.confirm("Cancel this bundle transfer and return the quantity to the source tower's available stock?")) {
      return false;
    }

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const actorName = safeString(
        user?.user_metadata?.full_name ||
          user?.user_metadata?.name ||
          user?.email ||
          "TTTracker User",
      );

      const { data: cancelled, error } = await supabase
        .from("tower_material_transfers")
        .update({
          status: "cancelled",
          cancelled_by: user?.id || null,
          cancelled_by_name: actorName,
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", transfer.id)
        .eq("status", "in_transit")
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!cancelled) {
        throw new Error(
          "This transfer has already been received, cancelled or changed by another user.",
        );
      }

      await load();
      return true;
    } catch (error) {
      console.error("cancel material transfer error", error);
      alert(
        error instanceof Error
          ? error.message
          : "The transfer could not be cancelled.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [load, supabase, towerId]);

  return {
    tower,
    projectTowers,
    latestDate,
    bundles,
    members,
    bolts,
    applicableBolts,
    effectiveBolts,
    materialConfigOptions,
    materialAmendments,
    amendmentSetupAvailable,
    amendmentSetupError,
    applicableMaterialSegments,
    materialApplicabilityActive,
    towerLegConfiguration,
    towerLegExpectedCount,
    towerLegConfiguredCount,
    legConfigurationDetected,
    legConfigurationComplete,
    isLegMaterialSegment: isLegMaterialSegmentValue,
    isMaterialSegmentApplicable,
    getMaterialMultiplier,
    getMaterialMultiplierForItem,
    getRequiredMaterialQty,
    getMaterialConfigOptions,
    getMaterialConfigOption,
    bundleChecks,
    memberChecks,
    materialEvents,
    transfers,
    dockets,
    deliveries,
    docketMap,
    missingEvents,
    excessEvents,
    loading,
    saving,
    duplicateBundleRefs,
    resolveBundleForMember,
    deliveredQty,
    receivedQty,
    transferInQty,
    transferOutQty,
    pendingTransferInQty,
    currentQty,
    getMemberCheck,
    membersForBundle,
    deriveBundleStatus,
    saveBundleCheck,
    clearBundleCheck,
    updateMemberStatus,
    clearMemberStatus,
    createTransfer,
    confirmTransferReceived,
    cancelTransfer,
    refresh: load,
  };
}

type SearchMode = "members" | "bundles" | "fasteners";

function MaterialsSearch({ data }: { data: MaterialsData }) {
  const [mode, setMode] = useState<SearchMode>("members");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const q = normaliseSearch(query);

  const memberResults: Member[] = !q
    ? []
    : data.members.filter((member: Member) =>
        [member.mark_no, member.bundle_reference, member.drawing_number, member.section, member.tower_segment]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );

  const bundleResults: Bundle[] = !q
    ? []
    : data.bundles.filter((bundle: Bundle) => {
        const contents = data.membersForBundle(bundle);
        return [
          bundle.bundle_no,
          bundle.section,
          ...contents.map((member: Member) => `${member.mark_no} ${member.drawing_number} ${member.section} ${member.tower_segment}`),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      });

  const fastenerResults: Bolt[] = !q
    ? []
    : data.effectiveBolts.filter((item) => materialItemSearchText(item).includes(q));

  const placeholder =
    mode === "members"
      ? "Search member number, drawing, profile or segment…"
      : mode === "bundles"
        ? "Search bundle number, segment or a member inside the bundle…"
        : "Search bolt, packer, diameter, #10, Y3, length, drawing or segment…";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
        <div className="grid grid-cols-3 gap-1">
          <button type="button" onClick={() => { setMode("members"); setQuery(""); setExpanded(null); }} className={`rounded-xl px-3 py-2.5 text-sm font-black transition ${mode === "members" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Search Members</button>
          <button type="button" onClick={() => { setMode("bundles"); setQuery(""); setExpanded(null); }} className={`rounded-xl px-3 py-2.5 text-sm font-black transition ${mode === "bundles" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Search Bundles</button>
          <button type="button" onClick={() => { setMode("fasteners"); setQuery(""); setExpanded(null); }} className={`rounded-xl px-3 py-2.5 text-sm font-black transition ${mode === "fasteners" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Bolts & Packers</button>
        </div>
      </div>

      <div className="relative mt-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-10 pr-10 text-sm outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-slate-100"
        />
        {query && <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-800" title="Clear search"><X size={17} /></button>}
      </div>

      {!query ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm">{mode === "members" ? <Search size={20} /> : mode === "bundles" ? <Boxes size={20} /> : <Wrench size={20} />}</div>
          <div className="mt-3 text-sm font-black text-slate-800">{mode === "members" ? "Search for a specific steel member" : mode === "bundles" ? "Search for a bundle or pack" : "Search the tower bolt & packer register"}</div>
          <div className="mt-1 text-xs text-slate-500">Results appear as you type so the page stays clean on site.</div>
        </div>
      ) : mode === "members" ? (
        <div className="mt-4 space-y-2">
          <div className="text-xs font-bold text-slate-400">{memberResults.length} result(s)</div>
          {memberResults.length === 0 ? <SearchEmpty text={`No members match “${query}”.`} /> : memberResults.map((member: Member) => (
            <div key={member.id || `${member.bundle_reference}-${member.mark_no}`} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div><div className="text-base font-black text-slate-950">{member.mark_no}</div><div className="mt-1 text-xs text-slate-500">Bundle <strong className="text-slate-800">{member.bundle_reference || "—"}{data.resolveBundleForMember(member)?.section ? ` · ${data.resolveBundleForMember(member)?.section}` : ""}</strong> · Drawing {member.drawing_number || "—"}</div></div>
                <div className="grid grid-cols-3 gap-2 text-xs md:min-w-97.5">
                  <SearchInfo label="Profile" value={member.section || "—"} />
                  <SearchInfo label="Qty / Tower" value={member.qty_per_tower ?? "—"} />
                  <SearchInfo label="Tower Segment" value={member.tower_segment || "—"} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : mode === "bundles" ? (
        <div className="mt-4 space-y-2">
          <div className="text-xs font-bold text-slate-400">{bundleResults.length} result(s)</div>
          {bundleResults.length === 0 ? <SearchEmpty text={`No bundles match “${query}”.`} /> : bundleResults.map((bundle: Bundle) => {
            const key = bundleUiKey(bundle);
            const open = expanded === key;
            const contents = data.membersForBundle(bundle);
            const duplicate = data.duplicateBundleRefs.has(normaliseBundleKey(bundle.bundle_no));
            return (
              <div key={key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <button type="button" onClick={() => setExpanded(open ? null : key)} className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50">
                  <div><div className="flex items-center gap-2"><div className="text-base font-black text-slate-950">{bundle.bundle_no}</div>{duplicate && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">DUPLICATE REF</span>}</div><div className="mt-1 text-xs text-slate-500">{bundle.section} · {contents.length} member line(s) · Required {bundle.qty_required}</div></div>
                  <div className="flex items-center gap-2 text-xs font-black text-slate-600"><PackageOpen size={16} /> {open ? "Hide contents" : "Open contents"}</div>
                </button>

                {open && <div className="border-t border-slate-200 bg-slate-50 p-2">{contents.length === 0 ? <div className="rounded-xl bg-white p-4 text-sm text-slate-500">No member records are linked to this bundle.</div> : <div className="space-y-1.5">{contents.map((member: Member) => <div key={member.id || `${member.mark_no}-${member.bundle_reference}`} className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-2.5 md:grid-cols-[1.1fr_1fr_1.2fr_0.6fr_1.2fr]"><SearchInfo label="Member" value={member.mark_no} strong /><SearchInfo label="Profile" value={member.section || "—"} /><SearchInfo label="Drawing" value={member.drawing_number || "—"} /><SearchInfo label="Qty" value={member.qty_per_tower ?? "—"} /><SearchInfo label="Segment" value={member.tower_segment || "—"} /></div>)}</div>}</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-bold text-slate-400">{fastenerResults.length} result(s)</div>
            <div className="text-xs font-black text-slate-600">Qty {fastenerResults.reduce((sum, row) => sum + data.getRequiredMaterialQty(row), 0)}</div>
          </div>
          {fastenerResults.length === 0 ? <SearchEmpty text={`No bolts or packers match “${query}”.`} /> : fastenerResults.map((item) => (
            <div key={item.id || `${item.item_type}-${item.tower_segment}-${item.bolt_diameter}-${item.length}-${item.packer_no}-${item.drawing_number}`} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${item.item_type === "packer" ? "border-violet-200 bg-violet-50 text-violet-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>{item.item_type}</span>
                    <div className="text-base font-black text-slate-950">{materialItemLabel(item) || "Unspecified item"}</div>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {item.tower_segment || "General"}
                    {item.drawing_number ? ` · ${item.drawing_number}` : ""}
                    {data.isLegMaterialSegment(item.tower_segment) || item.quantity_basis_behavior === "per_leg"
                      ? ` · ${materialQuantityBasis(
                          item.qty,
                          item.tower_segment,
                          data.getMaterialMultiplierForItem(item),
                          data.legConfigurationDetected,
                          item.quantity_basis_behavior,
                        )}`
                      : ""}
                    {item.amendment_reference ? ` · Amended: ${item.amendment_reference}` : ""}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs md:min-w-97.5">
                  <SearchInfo label="Type" value={item.item_type === "packer" ? "Packer" : [item.dn_sn, item.bolt_type].filter(Boolean).join(" · ") || "Bolt"} />
                  <SearchInfo label="Spec" value={item.item_type === "packer" ? [item.packer_no, item.packer_mark].filter(Boolean).join(" · ") || "—" : item.length ? `${item.length} mm` : "—"} />
                  <SearchInfo label="Qty / Tower" value={data.getRequiredMaterialQty(item)} strong />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchInfo({ label, value, strong }: { label: string; value: string | number; strong?: boolean }) {
  return <div className="min-w-0 rounded-lg bg-slate-50 px-2 py-1.5"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div><div className={`truncate text-xs text-slate-800 ${strong ? "font-black" : "font-bold"}`}>{value}</div></div>;
}

function SearchEmpty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">{text}</div>;
}

function BundleControl({ data, onTransfer }: { data: MaterialsData; onTransfer: (bundle: Bundle) => void }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | BundleCheckStatus>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const q = normaliseSearch(query);

  const filtered = data.bundles.filter((bundle: Bundle) => {
    const status = data.deriveBundleStatus(bundle);
    if (statusFilter !== "all" && status !== statusFilter) return false;
    if (!q) return true;

    const contents = data.membersForBundle(bundle);
    const searchable = [
      bundle.bundle_no,
      bundle.section,
      ...contents.map((member) => `${member.mark_no} ${member.section} ${member.tower_segment}`),
    ]
      .join(" ")
      .toLowerCase();

    return searchable.includes(q);
  });

  return (
    <div>
      {data.duplicateBundleRefs.size > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Duplicate bundle references detected:</strong>{" "}
          {Array.from(data.duplicateBundleRefs).join(", ")}. These are handled as separate bundle UUID records; the section identifies the display pack while checks are saved against the UUID.
        </div>
      )}

      <div className={`${data.duplicateBundleRefs.size > 0 ? "mt-3" : ""} grid grid-cols-1 gap-2 md:grid-cols-[1fr_220px]`}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter bundle number, segment or contained member…"
          className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-4 focus:ring-slate-100"
        />

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as "all" | BundleCheckStatus)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="not_checked">Not checked</option>
          <option value="partial">Partial</option>
          <option value="arrived">Arrived</option>
          <option value="missing">Missing</option>
          <option value="issue">Issue</option>
          <option value="transferred">Transferred out</option>
        </select>
      </div>

      <div className="mt-3 space-y-2">
        {filtered.length === 0 ? (
          <BundleEmpty text="No bundles match the current filters." />
        ) : (
          filtered.map((bundle: Bundle) => {
            const key = bundleUiKey(bundle);
            const open = Boolean(expanded[key]);
            const status = data.deriveBundleStatus(bundle);
            const received = data.receivedQty(bundle);
            const delivered = data.deliveredQty(bundle);
            const transferIn = data.transferInQty(bundle);
            const transferOut = data.transferOutQty(bundle);
            const pendingIn = data.pendingTransferInQty(bundle);
            const current = data.currentQty(bundle);
            const remaining = Math.max(bundle.qty_required - current, 0);
            const excess = Math.max(current - bundle.qty_required, 0);
            const duplicate = data.duplicateBundleRefs.has(normaliseBundleKey(bundle.bundle_no));
            const contents = data.membersForBundle(bundle);
            const canTransfer = Boolean(bundle.id && current > 0);

            return (
              <div key={key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="p-3 md:p-4">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_640px] xl:items-start">
                    <div className="min-w-0">
                      <div className="flex min-h-7 flex-wrap items-center gap-2">
                        <div className="text-lg font-black text-slate-950">{bundle.bundle_no}</div>
                        <Pill className={statusClasses(status)}>{statusLabel(status)}</Pill>
                        {duplicate && <Pill className="border-amber-200 bg-amber-50 text-amber-700">Duplicate ref</Pill>}
                        {excess > 0 && <Pill className="border-blue-200 bg-blue-50 text-blue-700">+{excess} excess</Pill>}
                      </div>

                      <div className="mt-1 truncate text-sm font-semibold text-slate-500" title={bundle.section}>
                        {bundle.section}
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                        <BundleCardMetric label="Required" value={bundle.qty_required} />
                        <BundleCardMetric label="Supplier" value={delivered} />
                        <BundleCardMetric label="Site Checked" value={received} />
                        <BundleCardMetric label="Current" value={current} tone="strong" />
                        <BundleCardMetric label="Remaining" value={remaining} tone={remaining > 0 ? "warning" : "good"} />
                      </div>

                      <div className="mt-2 flex min-h-6 flex-wrap items-center gap-1.5 text-[11px] font-bold">
                        {transferIn > 0 && (
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                            +{transferIn} transfer in
                          </span>
                        )}
                        {pendingIn > 0 && (
                          <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">
                            {pendingIn} incoming
                          </span>
                        )}
                        {transferOut > 0 && (
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                            -{transferOut} transfer out
                          </span>
                        )}
                        {transferIn <= 0 && pendingIn <= 0 && transferOut <= 0 && (
                          <span className="text-slate-400">No tower transfers</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-[144px_64px_76px_64px_88px_72px_96px]">
                      <div className="grid h-10 grid-cols-[34px_1fr_34px] items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        <button
                          type="button"
                          onClick={() => void data.saveBundleCheck(bundle, Math.max(received - 1, 0))}
                          className="flex h-full items-center justify-center border-r border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                          title="Reduce site-checked quantity"
                        >
                          <Minus size={15} />
                        </button>

                        <div className="min-w-0 text-center leading-none">
                          <div className="text-sm font-black text-slate-950">{received}/{bundle.qty_required}</div>
                          <div className="mt-0.5 text-[8px] font-black uppercase tracking-wide text-slate-400">checked</div>
                        </div>

                        <button
                          type="button"
                          onClick={() => void data.saveBundleCheck(bundle, received + 1)}
                          className="flex h-full items-center justify-center border-l border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700"
                          title="Add site-checked quantity"
                        >
                          <Plus size={15} />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => void data.saveBundleCheck(bundle, bundle.qty_required, "arrived")}
                        className="h-10 w-full whitespace-nowrap rounded-xl bg-emerald-50 px-2 text-xs font-black text-emerald-700 hover:bg-emerald-100"
                      >
                        Full
                      </button>

                      <button
                        type="button"
                        onClick={() => void data.saveBundleCheck(bundle, 0, "missing")}
                        className="h-10 w-full whitespace-nowrap rounded-xl bg-rose-50 px-2 text-xs font-black text-rose-700 hover:bg-rose-100"
                      >
                        Missing
                      </button>

                      <button
                        type="button"
                        onClick={() => void data.saveBundleCheck(bundle, received, "issue")}
                        className="h-10 w-full whitespace-nowrap rounded-xl bg-violet-50 px-2 text-xs font-black text-violet-700 hover:bg-violet-100"
                      >
                        Issue
                      </button>

                      <button
                        type="button"
                        disabled={!canTransfer}
                        onClick={() => canTransfer && onTransfer(bundle)}
                        className="inline-flex h-10 w-full items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-blue-50 px-2 text-xs font-black text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300"
                        title={canTransfer ? "Transfer bundle to another tower" : "No current quantity available to transfer"}
                      >
                        <ArrowRightLeft size={13} /> Transfer
                      </button>

                      <button
                        type="button"
                        onClick={() => void data.clearBundleCheck(bundle)}
                        className="inline-flex h-10 w-full items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-slate-100 px-2 text-xs font-black text-slate-600 hover:bg-slate-200"
                      >
                        <RotateCcw size={13} /> Clear
                      </button>

                      <button
                        type="button"
                        onClick={() => setExpanded((prev) => ({ ...prev, [key]: !open }))}
                        className="inline-flex h-10 w-full items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-slate-950 px-2 text-xs font-black text-white hover:bg-slate-800"
                      >
                        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {open ? "Hide Pack" : "Open Pack"}
                      </button>
                    </div>
                  </div>
                </div>

                {open && (
                  <div className="border-t border-slate-200 bg-slate-50 p-2 md:p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-xs font-black uppercase tracking-wide text-slate-400">Bundle contents</div>
                      <div className="text-xs font-bold text-slate-500">{contents.length} member line(s)</div>
                    </div>

                    {contents.length === 0 ? (
                      <div className="rounded-xl bg-white p-4 text-sm text-slate-500">No member records are linked to this bundle.</div>
                    ) : (
                      <div className="space-y-1.5">
                        {contents.map((member) => {
                          const memberStatus: MemberCheckStatus = data.getMemberCheck(member)?.status || "not_checked";

                          return (
                            <div key={member.id || `${member.mark_no}-${member.bundle_reference}`} className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-2.5 md:grid-cols-[1fr_1fr_0.7fr_1fr_110px] md:items-center">
                              <BundleInfo label="Member" value={member.mark_no} />
                              <BundleInfo label="Profile" value={member.section || "—"} />
                              <BundleInfo label="Qty / Tower" value={member.qty_per_tower ?? "—"} />
                              <BundleInfo label="Segment" value={member.tower_segment || "—"} />
                              <div className="flex justify-start md:justify-end">
                                <Pill className={statusClasses(memberStatus)}>{statusLabel(memberStatus)}</Pill>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );}

function BundleCardMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "strong" | "good" | "warning";
}) {
  const style =
    tone === "strong"
      ? "border-slate-300 bg-slate-100 text-slate-950"
      : tone === "good"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-slate-200 bg-slate-50 text-slate-800";

  return (
    <div className={`min-w-0 rounded-lg border px-2 py-1.5 ${style}`}>
      <div className="truncate text-[8px] font-black uppercase tracking-wide opacity-55">{label}</div>
      <div className="mt-0.5 text-sm font-black leading-none">{value}</div>
    </div>
  );
}

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${className}`}>{children}</span>;
}


function BundleInfo({ label, value }: { label: string; value: string | number }) {
  return <div className="min-w-0"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div><div className="truncate text-xs font-bold text-slate-800">{value}</div></div>;
}

function BundleEmpty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">{text}</div>;
}


function OverviewWorkspace({
  data,
  projectId,
  towerId,
  onOpenIssues,
  onOpenBundles,
  onOpenTransfers,
  onOpenData,
}: {
  data: MaterialsData;
  projectId: string;
  towerId: string;
  onOpenIssues: () => void;
  onOpenBundles: () => void;
  onOpenTransfers: () => void;
  onOpenData: () => void;
}) {
  const missingIssues = buildMissingIssues(data);
  const recentReceipts = data.materialEvents
    .filter((event) => event.event_type === "found_received")
    .flatMap((event) => event.items.map((item) => ({ event, item })))
    .slice(0, 6);

  const unmatchedMembers = data.members.filter((member) => !data.resolveBundleForMember(member));
  const membersWithoutBundleId = data.members.filter((member) => !member.bundle_id).length;
  const missingWithoutIssueKey = data.materialEvents
    .filter((event) => event.event_type === "missing")
    .flatMap((event) => event.items)
    .filter((item) => !item.issue_key).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
            <div>
              <h3 className="font-black text-slate-950">Missing material supply status</h3>
              <p className="mt-1 text-xs text-slate-500">
                Daily Docket missing items stay open until linked receipt quantities bring the remaining quantity to zero.
              </p>
            </div>
            <button type="button" onClick={onOpenIssues} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">
              View Issues
            </button>
          </div>

          <div className="p-3">
            {missingIssues.length === 0 ? (
              <IssueEmpty text="No missing-material issues have been recorded for this tower." />
            ) : (
              <div className="space-y-2">
                {missingIssues.slice(0, 8).map((row) => (
                  <MissingIssueCompact key={row.issueKey} row={row} data={data} />
                ))}
                {missingIssues.length > 8 && (
                  <button type="button" onClick={onOpenIssues} className="w-full rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-100">
                    View all {missingIssues.length} missing-material records
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-black text-slate-950">Recent deliveries to site</h3>
                <p className="mt-1 text-xs text-slate-500">Receipts recorded against material issues in Daily Dockets.</p>
              </div>
              <Truck size={18} className="text-slate-400" />
            </div>

            <div className="mt-3 space-y-2">
              {recentReceipts.length === 0 ? (
                <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">No linked material receipts recorded yet.</div>
              ) : recentReceipts.map(({ event, item }) => (
                <div key={`${event.id}-${item.id}`} className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-950">{itemDisplayReference(item)}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {item.bundle_no ? `Bundle ${item.bundle_no}${item.bundle_section ? ` · ${item.bundle_section}` : ""} · ` : ""}
                        {formatDate(event.occurred_at)}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-xs font-black text-emerald-700">
                      +{safeNumber(item.quantity, 0)} {item.unit || "ea"}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <Link
              href={`/project/${projectId}/tower/${towerId}/dockets`}
              className="mt-3 inline-flex items-center gap-1 text-xs font-black text-slate-600 hover:text-slate-950"
            >
              <ExternalLink size={12} /> Open Daily Dockets
            </Link>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-950">Data health</h3>
              <button type="button" onClick={onOpenData} className="text-xs font-black text-blue-700">Manage data</button>
            </div>
            <div className="mt-3 space-y-2 text-xs">
              <HealthRow good={unmatchedMembers.length === 0} label="Members matched to bundle" value={`${data.members.length - unmatchedMembers.length}/${data.members.length}`} />
              <HealthRow good={membersWithoutBundleId === 0} label="Members with bundle UUID" value={membersWithoutBundleId === 0 ? "Complete" : `${membersWithoutBundleId} missing`} />
              <HealthRow good={missingWithoutIssueKey === 0} label="Missing issues with close-out key" value={missingWithoutIssueKey === 0 ? "Complete" : `${missingWithoutIssueKey} legacy`} />
              <HealthRow good={data.duplicateBundleRefs.size === 0} label="Duplicate display refs" value={data.duplicateBundleRefs.size === 0 ? "None" : String(data.duplicateBundleRefs.size)} />
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <QuickAction title="Bundle Control" description="Review supplier delivery, site-confirmed quantity and current quantity at this tower." icon={PackageCheck} onClick={onOpenBundles} />
        <QuickAction title="Tower Transfers" description="Move confirmed bundles between towers and confirm incoming transfers." icon={ArrowRightLeft} onClick={onOpenTransfers} />
        <QuickAction title="Issues & Deliveries" description="Track missing, partial deliveries, resolved items, excess and damage." icon={TriangleAlert} onClick={onOpenIssues} />
        <QuickAction title="Data & Imports" description="Upload, replace, merge, correct and delete master material data." icon={Database} onClick={onOpenData} />
      </div>
    </div>
  );
}

function MissingIssueCompact({ row, data }: { row: MissingIssueRow; data: MaterialsData }) {
  const docket = row.event.docket_id ? data.docketMap.get(row.event.docket_id) : undefined;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-black text-slate-950">{itemDisplayReference(row.item)}</div>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${missingIssueStatusClasses(row.status)}`}>
              {missingIssueStatusLabel(row.status)}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {row.item.bundle_no ? `Bundle ${row.item.bundle_no}${row.item.bundle_section ? ` · ${row.item.bundle_section}` : ""} · ` : ""}
            Reported {formatDate(docket?.docket_date || row.reportedAt)}
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-3 gap-1.5">
          <TinyQty label="Missing" value={row.originalQty} />
          <TinyQty label="Delivered" value={row.deliveredQty} tone="green" />
          <TinyQty label="Remaining" value={row.remainingQty} tone={row.remainingQty > 0 ? "red" : "green"} />
        </div>
      </div>
    </div>
  );
}

function TinyQty({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "green" | "red" }) {
  const style = tone === "green" ? "bg-emerald-50 text-emerald-800" : tone === "red" ? "bg-rose-50 text-rose-800" : "bg-white text-slate-800";
  return (
    <div className={`min-w-17 rounded-lg px-2 py-1.5 text-center ${style}`}>
      <div className="text-[8px] font-black uppercase tracking-wide opacity-60">{label}</div>
      <div className="text-sm font-black">{value}</div>
    </div>
  );
}

function HealthRow({ good, label, value }: { good: boolean; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-2 text-slate-700">
        {good ? <CheckCircle2 size={14} className="text-emerald-600" /> : <AlertCircle size={14} className="text-amber-600" />}
        <span>{label}</span>
      </div>
      <span className="font-black text-slate-900">{value}</span>
    </div>
  );
}

function QuickAction({
  title,
  description,
  icon: Icon,
  onClick,
}: {
  title: string;
  description: string;
  icon: typeof Boxes;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-400 hover:shadow-sm">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100"><Icon size={17} /></div>
      <div className="mt-3 font-black text-slate-950">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
    </button>
  );
}


function transferStatusLabel(status: TransferStatus): string {
  if (status === "received") return "Received";
  if (status === "cancelled") return "Cancelled";
  return "In Transit";
}

function transferStatusClasses(status: TransferStatus): string {
  if (status === "received") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "cancelled") return "border-slate-200 bg-slate-100 text-slate-500";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function transferReference(transfer: MaterialTransfer): string {
  return transfer.transfer_no
    ? `MT-${String(transfer.transfer_no).padStart(5, "0")}`
    : `MT-${transfer.id.slice(0, 8).toUpperCase()}`;
}

function TransfersWorkspace({
  data,
  towerId,
  onNewTransfer,
}: {
  data: MaterialsData;
  towerId: string;
  onNewTransfer: (bundle?: Bundle) => void;
}) {
  const [direction, setDirection] = useState<"all" | "incoming" | "outgoing">("all");
  const [status, setStatus] = useState<"all" | TransferStatus>("all");
  const [query, setQuery] = useState("");

  const towerNameById = useMemo(
    () => new Map(data.projectTowers.map((tower) => [tower.id, tower.name])),
    [data.projectTowers],
  );

  const incoming = data.transfers.filter(
    (transfer) => transfer.destination_tower_id === towerId,
  );
  const outgoing = data.transfers.filter(
    (transfer) => transfer.source_tower_id === towerId,
  );
  const incomingPending = incoming.filter((transfer) => transfer.status === "in_transit");
  const outgoingPending = outgoing.filter((transfer) => transfer.status === "in_transit");
  const receivedIn = incoming.filter((transfer) => transfer.status === "received");
  const sentOut = outgoing.filter((transfer) => transfer.status === "received");

  const q = normaliseSearch(query);

  const filtered = data.transfers.filter((transfer) => {
    if (direction === "incoming" && transfer.destination_tower_id !== towerId) return false;
    if (direction === "outgoing" && transfer.source_tower_id !== towerId) return false;
    if (status !== "all" && transfer.status !== status) return false;
    if (!q) return true;

    return [
      transferReference(transfer),
      transfer.bundle_no,
      transfer.bundle_section,
      towerNameById.get(transfer.source_tower_id),
      towerNameById.get(transfer.destination_tower_id),
      transfer.transferred_by_name,
      transfer.received_by_name,
      transfer.notes,
      transfer.status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <IssueMetric label="Incoming" value={incomingPending.length} tone="blue" />
        <IssueMetric label="Outgoing" value={outgoingPending.length} tone="amber" />
        <IssueMetric label="Received In" value={receivedIn.reduce((sum, row) => sum + row.quantity, 0)} tone="green" />
        <IssueMetric label="Transferred Out" value={sentOut.reduce((sum, row) => sum + row.quantity, 0)} />
      </div>

      <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-black text-blue-950">Tower-to-Tower Bundle Transfers</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-blue-800">
              A transfer moves already site-confirmed bundle quantity between towers. It does not create another supplier delivery. The source quantity is reserved as soon as the transfer is created, and the destination bundle check increases only when the receiving tower confirms it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNewTransfer()}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-black text-white"
          >
            <ArrowRightLeft size={14} /> New Transfer
          </button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-[auto_auto_1fr]">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {([
            ["all", "All"],
            ["incoming", "Incoming"],
            ["outgoing", "Outgoing"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setDirection(id)}
              className={`rounded-lg px-3 py-2 text-xs font-black ${
                direction === id ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as "all" | TransferStatus)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black"
        >
          <option value="all">All statuses</option>
          <option value="in_transit">In transit</option>
          <option value="received">Received</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search transfer, bundle or tower…"
            className="w-full rounded-xl border border-slate-300 py-2 pl-8 pr-3 text-xs"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <IssueEmpty text="No bundle transfers match the current filters." />
      ) : (
        <div className="space-y-2">
          {filtered.map((transfer) => {
            const isIncoming = transfer.destination_tower_id === towerId;
            const sourceName = towerNameById.get(transfer.source_tower_id) || "Source tower";
            const destinationName = towerNameById.get(transfer.destination_tower_id) || "Destination tower";

            return (
              <div
                key={transfer.id}
                className={`rounded-2xl border bg-white p-4 shadow-sm ${
                  transfer.status === "in_transit"
                    ? "border-blue-200"
                    : transfer.status === "received"
                      ? "border-emerald-200"
                      : "border-slate-200"
                }`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-black text-slate-950">{transferReference(transfer)}</div>
                      <Pill className={transferStatusClasses(transfer.status)}>
                        {transferStatusLabel(transfer.status)}
                      </Pill>
                      <Pill className={isIncoming ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
                        {isIncoming ? "Incoming" : "Outgoing"}
                      </Pill>
                    </div>

                    <div className="mt-2 text-lg font-black text-slate-950">
                      {transfer.bundle_no} · {transfer.bundle_section}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
                      <span className="font-bold">{sourceName}</span>
                      <ArrowRightLeft size={14} className="text-slate-400" />
                      <span className="font-bold">{destinationName}</span>
                      <span className="text-slate-300">•</span>
                      <span>Qty {transfer.quantity}</span>
                    </div>

                    <div className="mt-2 text-xs text-slate-500">
                      Sent {formatDate(transfer.transferred_at)}
                      {transfer.transferred_by_name ? ` by ${transfer.transferred_by_name}` : ""}
                      {transfer.received_at ? ` · Received ${formatDate(transfer.received_at)}` : ""}
                    </div>

                    {transfer.notes && (
                      <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        {transfer.notes}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {isIncoming && transfer.status === "in_transit" && (
                      <button
                        type="button"
                        disabled={data.saving}
                        onClick={() => void data.confirmTransferReceived(transfer)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-black text-white disabled:opacity-50"
                      >
                        <PackageCheck size={14} /> Confirm Received
                      </button>
                    )}

                    {!isIncoming && transfer.status === "in_transit" && (
                      <button
                        type="button"
                        disabled={data.saving}
                        onClick={() => void data.cancelTransfer(transfer)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-black text-slate-600 disabled:opacity-50"
                      >
                        Cancel Transfer
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TransferBundleModal({
  data,
  towerId,
  initialBundle,
  onClose,
}: {
  data: MaterialsData;
  towerId: string;
  initialBundle: Bundle | null;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const availableSourceBundles = data.bundles.filter(
    (bundle) => bundle.id && data.currentQty(bundle) > 0,
  );

  const [sourceBundleId, setSourceBundleId] = useState(
    initialBundle?.id || availableSourceBundles[0]?.id || "",
  );
  const [destinationTowerId, setDestinationTowerId] = useState("");
  const [destinationBundles, setDestinationBundles] = useState<Bundle[]>([]);
  const [destinationBundleId, setDestinationBundleId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [loadingDestination, setLoadingDestination] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const sourceBundle =
    data.bundles.find((bundle) => bundle.id === sourceBundleId) || null;
  const availableQty = sourceBundle ? data.currentQty(sourceBundle) : 0;

  const otherTowers = data.projectTowers.filter((tower) => tower.id !== towerId);

  useEffect(() => {
    let cancelled = false;

    async function loadDestinationBundles() {
      setDestinationBundles([]);
      setDestinationBundleId("");

      if (!destinationTowerId || !sourceBundle) return;

      setLoadingDestination(true);

      try {
        const { data: rows, error } = await supabase
          .from("tower_required_bundles")
          .select("*")
          .eq("tower_id", destinationTowerId)
          .order("section")
          .order("bundle_no");

        if (error) throw error;
        if (cancelled) return;

        const mapped = ((rows || []) as Array<Record<string, unknown>>).map((row) => ({
          id: safeString(row.id) || undefined,
          tower_id: destinationTowerId,
          bundle_no: safeString(row.bundle_no),
          section: normaliseSegment(safeString(row.section, "General")),
          qty_required: Math.max(safeNumber(row.qty_required), 0),
          member_qty: Math.max(safeNumber(row.member_qty), 0),
          total_weight: row.total_weight == null ? null : safeNumber(row.total_weight),
        }));

        setDestinationBundles(mapped);

        const exact = mapped.find(
          (bundle) =>
            normaliseBundleKey(bundle.bundle_no) ===
              normaliseBundleKey(sourceBundle.bundle_no) &&
            normaliseSegment(bundle.section) ===
              normaliseSegment(sourceBundle.section),
        );

        if (exact?.id) {
          setDestinationBundleId(exact.id);
        }
      } catch (error) {
        console.error("destination bundles load error", error);
      } finally {
        if (!cancelled) setLoadingDestination(false);
      }
    }

    void loadDestinationBundles();

    return () => {
      cancelled = true;
    };
  }, [destinationTowerId, sourceBundle, supabase]);

  const destinationBundle = destinationBundles.find(
    (bundle) => bundle.id === destinationBundleId,
  );

  const isExactMatch =
    Boolean(sourceBundle && destinationBundle) &&
    normaliseBundleKey(sourceBundle?.bundle_no) ===
      normaliseBundleKey(destinationBundle?.bundle_no) &&
    normaliseSegment(sourceBundle?.section || "") ===
      normaliseSegment(destinationBundle?.section || "");

  async function submit() {
    if (!sourceBundle) {
      alert("Select a source bundle.");
      return;
    }

    if (!destinationTowerId) {
      alert("Select a destination tower.");
      return;
    }

    if (!destinationBundle?.id) {
      alert("Select the bundle record this transfer should satisfy at the destination tower.");
      return;
    }

    const cleanQty = Math.max(Math.floor(safeNumber(quantity)), 0);
    if (cleanQty <= 0 || cleanQty > availableQty) {
      alert(`Transfer quantity must be between 1 and ${availableQty}.`);
      return;
    }

    if (!isExactMatch) {
      const confirmed = window.confirm(
        `The destination bundle is ${destinationBundle.bundle_no} · ${destinationBundle.section}, which does not exactly match ${sourceBundle.bundle_no} · ${sourceBundle.section}. Continue with this mapping?`,
      );
      if (!confirmed) return;
    }

    setSubmitting(true);
    const created = await data.createTransfer({
      sourceBundle,
      destinationTowerId,
      destinationBundleId: destinationBundle.id,
      quantity: cleanQty,
      notes,
    });
    setSubmitting(false);

    if (created) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-2 md:items-center">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h3 className="text-lg font-black text-slate-950">Transfer Bundle to Another Tower</h3>
            <p className="mt-1 text-xs text-slate-500">
              Only quantity already confirmed at this tower can be transferred.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100">
            <X size={17} />
          </button>
        </div>

        <div className="grid gap-4 p-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-black text-slate-500">Source Bundle</label>
            <select
              value={sourceBundleId}
              onChange={(event) => {
                setSourceBundleId(event.target.value);
                setQuantity("1");
              }}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">Select bundle…</option>
              {availableSourceBundles.map((bundle) => (
                <option key={bundleUiKey(bundle)} value={bundle.id}>
                  {bundle.bundle_no} · {bundle.section} · {data.currentQty(bundle)} available
                </option>
              ))}
            </select>
            {sourceBundle && (
              <div className="mt-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                Site confirmed <strong>{data.receivedQty(sourceBundle)}</strong> · Already transferred out <strong>{data.transferOutQty(sourceBundle)}</strong> · Available now <strong>{availableQty}</strong>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-black text-slate-500">Destination Tower</label>
            <select
              value={destinationTowerId}
              onChange={(event) => setDestinationTowerId(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">Select tower…</option>
              {otherTowers.map((tower) => (
                <option key={tower.id} value={tower.id}>
                  {tower.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-black text-slate-500">Destination Bundle</label>
            <select
              value={destinationBundleId}
              onChange={(event) => setDestinationBundleId(event.target.value)}
              disabled={!destinationTowerId || loadingDestination}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100"
            >
              <option value="">
                {loadingDestination ? "Loading destination bundles…" : "Select destination bundle…"}
              </option>
              {destinationBundles.map((bundle) => (
                <option key={bundleUiKey(bundle)} value={bundle.id}>
                  {bundle.bundle_no} · {bundle.section}
                </option>
              ))}
            </select>

            {destinationBundle && (
              <div className={`mt-2 rounded-xl border px-3 py-2 text-xs font-bold ${
                isExactMatch
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}>
                {isExactMatch
                  ? "Exact bundle + section match"
                  : "Different destination bundle mapping — check before saving"}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-black text-slate-500">Quantity</label>
            <input
              type="number"
              min={1}
              max={Math.max(availableQty, 1)}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-black text-slate-500">Transfer Notes</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Optional reason, truck / crew reference, or other transfer note…"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
            />
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
            Creating the transfer immediately reserves the quantity from the source tower. The destination does not count it as site-received until someone opens the destination tower and selects <strong>Confirm Received</strong>.
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700">
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting || data.saving || !sourceBundle || availableQty <= 0}
              onClick={() => void submit()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
            >
              <ArrowRightLeft size={15} />
              {submitting ? "Creating…" : "Create Transfer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IssuesWorkspace({
  data,
  projectId,
  towerId,
}: {
  data: MaterialsData;
  projectId: string;
  towerId: string;
}) {
  const [filter, setFilter] = useState<IssueFilter>("all");
  const [query, setQuery] = useState("");
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);

  const missingIssues = buildMissingIssues(data);
  const open = missingIssues.filter((row) => row.status === "open");
  const partial = missingIssues.filter((row) => row.status === "partial");
  const resolved = missingIssues.filter((row) => row.status === "resolved");

  const excessEvents = data.materialEvents.filter((event) => event.event_type === "excess");
  const damagedEvents = data.materialEvents.filter((event) => event.event_type === "damaged_incorrect");
  const movementEvents = data.materialEvents.filter((event) =>
    event.event_type === "taken_from_another_tower" || event.event_type === "sent_to_another_tower",
  );
  const transferMovements = data.transfers.filter((transfer) => transfer.status !== "cancelled");
  const unlinkedReceipts = data.materialEvents
    .filter((event) => event.event_type === "found_received")
    .flatMap((event) => event.items.map((item) => ({ event, item })))
    .filter(({ item }) => !item.source_issue_key);

  const overReceived = data.bundles
    .map((bundle) => ({
      bundle,
      received: data.receivedQty(bundle),
      excess: Math.max(data.receivedQty(bundle) - bundle.qty_required, 0),
    }))
    .filter((row) => row.excess > 0);

  const q = normaliseSearch(query);
  const missingByFilter =
    filter === "open" ? open :
    filter === "partial" ? partial :
    filter === "resolved" ? resolved :
    missingIssues;

  const filteredMissing = missingByFilter.filter((row) => {
    if (!q) return true;
    return [
      itemDisplayReference(row.item),
      row.item.item_description,
      row.item.bundle_no,
      row.item.bundle_section,
      row.event.notes,
      row.event.affected_activity,
      row.event.affected_section,
      row.event.current_effect,
    ].join(" ").toLowerCase().includes(q);
  });

  const showMissing = ["all", "open", "partial", "resolved"].includes(filter);
  const outstandingQty = missingIssues.reduce((sum, row) => sum + row.remainingQty, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <IssueMetric label="Open" value={open.length} tone="red" />
        <IssueMetric label="Part Delivered" value={partial.length} tone="amber" />
        <IssueMetric label="Resolved" value={resolved.length} tone="green" />
        <IssueMetric label="Qty Remaining" value={outstandingQty} tone="red" />
        <IssueMetric label="Excess" value={excessEvents.reduce((sum, event) => sum + event.items.length, 0) + overReceived.length} tone="blue" />
        <IssueMetric label="Damaged / Incorrect" value={damagedEvents.reduce((sum, event) => sum + event.items.length, 0)} />
        <IssueMetric label="Movements" value={movementEvents.reduce((sum, event) => sum + event.items.length, 0) + transferMovements.length} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
        <div className="flex gap-1 overflow-x-auto">
          {([
            ["all", "All"],
            ["open", "Open"],
            ["partial", "Part Delivered"],
            ["resolved", "Resolved"],
            ["excess", "Excess"],
            ["damaged", "Damaged / Incorrect"],
            ["movements", "Movements"],
          ] as Array<[IssueFilter, string]>).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black ${
                filter === id ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 md:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search member, bundle, section, notes or status…"
            className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-4 focus:ring-slate-100"
          />
        </div>
        <Link href={`/project/${projectId}/tower/${towerId}/dockets`} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2.5 text-xs font-black text-white">
          <ClipboardList size={14} /> Daily Dockets
        </Link>
      </div>

      {showMissing && (
        <section>
          <div className="mb-2">
            <h3 className="font-black text-slate-950">Missing material & delivery close-out</h3>
            <p className="mt-1 text-xs text-slate-500">
              Delivered-to-site quantities come from linked Found / Received Daily Docket entries. A specific missing item is not auto-resolved from the truck bundle register alone.
            </p>
          </div>

          {filteredMissing.length === 0 ? (
            <IssueEmpty text="No missing-material records match the current filter." />
          ) : (
            <div className="space-y-2">
              {filteredMissing.map((row) => {
                const openRow = expandedIssue === row.issueKey;
                const docket = row.event.docket_id ? data.docketMap.get(row.event.docket_id) : undefined;
                const linkedBundle = row.item.bundle_id
                  ? data.bundles.find((bundle) => bundle.id === row.item.bundle_id)
                  : undefined;
                const bundleDelivered = linkedBundle ? data.deliveredQty(linkedBundle) : null;

                return (
                  <div key={row.issueKey} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <button
                      type="button"
                      onClick={() => setExpandedIssue(openRow ? null : row.issueKey)}
                      className="flex w-full flex-col gap-3 p-4 text-left hover:bg-slate-50 md:flex-row md:items-start md:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-black text-slate-950">{itemDisplayReference(row.item)}</div>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${missingIssueStatusClasses(row.status)}`}>
                            {missingIssueStatusLabel(row.status)}
                          </span>
                          {!row.item.issue_key && (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">
                              LEGACY UNLINKED
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {row.item.bundle_no ? `Bundle ${row.item.bundle_no}${row.item.bundle_section ? ` · ${row.item.bundle_section}` : ""} · ` : ""}
                          Reported {formatDate(docket?.docket_date || row.reportedAt)}
                          {docket?.crew ? ` · ${docket.crew}` : ""}
                        </div>
                        {row.item.item_description && <div className="mt-1 text-xs text-slate-600">{row.item.item_description}</div>}
                      </div>

                      <div className="grid shrink-0 grid-cols-3 gap-2">
                        <IssueQty label="Missing" value={row.originalQty} />
                        <IssueQty label="Delivered" value={row.deliveredQty} tone="green" />
                        <IssueQty label="Remaining" value={row.remainingQty} tone={row.remainingQty > 0 ? "red" : "green"} />
                      </div>
                    </button>

                    {openRow && (
                      <div className="border-t border-slate-200 bg-slate-50 p-3 md:p-4">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <DetailCard label="First reported" value={formatDate(row.reportedAt)} />
                          <DetailCard label="Last material receipt" value={row.lastDeliveryAt ? formatDate(row.lastDeliveryAt) : "Not delivered yet"} />
                          <DetailCard label="Bundle delivery register" value={bundleDelivered == null ? "No linked bundle" : `${bundleDelivered} bundle(s) delivered`} />
                          <DetailCard label="Current effect" value={row.event.current_effect || "—"} />
                        </div>

                        <div className="mt-4">
                          <div className="text-xs font-black uppercase tracking-wide text-slate-400">Delivery history</div>
                          {row.receipts.length === 0 ? (
                            <div className="mt-2 rounded-xl border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">
                              No linked delivery has been recorded yet. Crew receipts should be entered from the Daily Docket.
                            </div>
                          ) : (
                            <div className="mt-2 space-y-2">
                              {row.receipts.map(({ event, item }, index) => {
                                const receiptDocket = event.docket_id ? data.docketMap.get(event.docket_id) : undefined;
                                return (
                                  <div key={`${event.id}-${item.id}`} className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-white p-3 md:flex-row md:items-center md:justify-between">
                                    <div>
                                      <div className="text-sm font-black text-slate-950">
                                        Delivery {index + 1} · {formatDate(receiptDocket?.docket_date || event.occurred_at)}
                                      </div>
                                      <div className="mt-0.5 text-xs text-slate-500">
                                        {receiptDocket?.crew ? `${receiptDocket.crew} · ` : ""}
                                        {event.notes || "Received / delivered to site"}
                                      </div>
                                    </div>
                                    <div className="rounded-xl bg-emerald-50 px-3 py-2 text-center">
                                      <div className="text-[9px] font-black uppercase text-emerald-500">Delivered</div>
                                      <div className="text-lg font-black text-emerald-800">+{safeNumber(item.quantity, 0)} {item.unit || "ea"}</div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {(filter === "all" || filter === "excess") && (
        <section className="border-t border-slate-200 pt-4">
          <h3 className="font-black text-slate-950">Excess material</h3>
          <div className="mt-2 space-y-2">
            {excessEvents.length === 0 && overReceived.length === 0 ? (
              <IssueEmpty text="No excess material is currently recorded." />
            ) : (
              <>
                {excessEvents.map((event) => (
                  <MaterialEventCard key={event.id} event={event} data={data} tone="blue" />
                ))}
                {overReceived.map(({ bundle, received, excess }) => (
                  <div key={bundleUiKey(bundle)} className="rounded-2xl border border-blue-200 bg-blue-50/50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-black text-slate-950">{bundle.bundle_no} · {bundle.section}</div>
                        <div className="mt-1 text-xs text-slate-500">Required {bundle.qty_required} · Site confirmed {received}</div>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2 text-center">
                        <div className="text-[9px] font-black uppercase text-blue-500">Excess</div>
                        <div className="text-xl font-black text-blue-800">+{excess}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </section>
      )}{(filter === "all" || filter === "damaged") && (
        <section className="border-t border-slate-200 pt-4">
          <h3 className="font-black text-slate-950">Damaged / incorrect material</h3>
          <div className="mt-2 space-y-2">
            {damagedEvents.length === 0 ? <IssueEmpty text="No damaged or incorrect material records." /> : damagedEvents.map((event) => (
              <MaterialEventCard key={event.id} event={event} data={data} tone="rose" />
            ))}
          </div>
        </section>
      )}

      {(filter === "all" || filter === "movements") && (
        <section className="border-t border-slate-200 pt-4">
          <h3 className="font-black text-slate-950">Material movements</h3>
          <div className="mt-2 space-y-2">
            {movementEvents.length === 0 && transferMovements.length === 0 ? (
              <IssueEmpty text="No inter-tower material movements recorded." />
            ) : (
              <>
                {transferMovements.map((transfer) => (
                  <div key={`transfer-${transfer.id}`} className="rounded-2xl border border-blue-200 bg-blue-50/50 p-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="font-black text-slate-950">
                          {transferReference(transfer)} · {transfer.bundle_no} · {transfer.bundle_section}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {data.projectTowers.find((tower) => tower.id === transfer.source_tower_id)?.name || "Source tower"} →{" "}
                          {data.projectTowers.find((tower) => tower.id === transfer.destination_tower_id)?.name || "Destination tower"} · Qty {transfer.quantity}
                        </div>
                      </div>
                      <Pill className={transferStatusClasses(transfer.status)}>
                        {transferStatusLabel(transfer.status)}
                      </Pill>
                    </div>
                  </div>
                ))}
                {movementEvents.map((event) => (
                  <MaterialEventCard key={event.id} event={event} data={data} tone="blue" />
                ))}
              </>
            )}
          </div>
        </section>
      )}

      {filter === "all" && unlinkedReceipts.length > 0 && (
        <section className="border-t border-slate-200 pt-4">
          <h3 className="font-black text-slate-950">Legacy / unlinked receipts</h3>
          <p className="mt-1 text-xs text-slate-500">These receipts pre-date the close-out link or were entered without selecting an outstanding missing item.</p>
          <div className="mt-2 space-y-2">
            {unlinkedReceipts.map(({ event, item }) => (
              <div key={`${event.id}-${item.id}`} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-black text-slate-950">{itemDisplayReference(item)}</div>
                    <div className="mt-1 text-xs text-slate-500">{formatDate(event.occurred_at)} · {event.notes || "Found / Received"}</div>
                  </div>
                  <div className="font-black text-amber-800">+{safeNumber(item.quantity, 0)} {item.unit || "ea"}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function IssueMetric({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "green" | "amber" | "red" | "blue" }) {
  const style =
    tone === "green" ? "border-emerald-200 bg-emerald-50 text-emerald-900" :
    tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-900" :
    tone === "red" ? "border-rose-200 bg-rose-50 text-rose-900" :
    tone === "blue" ? "border-blue-200 bg-blue-50 text-blue-900" :
    "border-slate-200 bg-slate-50 text-slate-900";
  return <div className={`rounded-xl border p-3 ${style}`}><div className="text-[9px] font-black uppercase tracking-wide opacity-50">{label}</div><div className="mt-1 text-xl font-black">{value}</div></div>;
}

function IssueQty({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "green" | "red" }) {
  const style = tone === "green" ? "bg-emerald-50 text-emerald-800" : tone === "red" ? "bg-rose-50 text-rose-800" : "bg-slate-50 text-slate-800";
  return <div className={`min-w-20 rounded-xl px-3 py-2 text-center ${style}`}><div className="text-[8px] font-black uppercase tracking-wide opacity-60">{label}</div><div className="text-lg font-black">{value}</div></div>;
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-sm font-black text-slate-900">{value}</div></div>;
}

function MaterialEventCard({ event, data, tone }: { event: MaterialEvent; data: MaterialsData; tone: "rose" | "blue" }) {
  const docket = event.docket_id ? data.docketMap.get(event.docket_id) : undefined;
  const toneClasses = tone === "rose" ? "border-rose-200 bg-rose-50/50" : "border-blue-200 bg-blue-50/50";

  return (
    <div className={`rounded-2xl border p-3 ${toneClasses}`}>
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-sm font-black text-slate-950">{docket?.docket_date ? formatDate(docket.docket_date) : formatDate(event.occurred_at)}{docket?.crew ? ` · ${docket.crew}` : ""}</div>
          <div className="mt-1 text-xs text-slate-500">{event.affected_section || "No segment specified"}{event.affected_work ? ` · Work impact: ${workOutcomeLabel(event.work_outcome)}` : " · No work impact recorded"}</div>
        </div>
        {event.impact_ongoing && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">ONGOING</span>}
      </div>

      <div className="mt-3 space-y-1.5">
        {event.items.length === 0 ? <div className="rounded-xl bg-white p-2.5 text-xs text-slate-500">No item rows were stored on this event.</div> : event.items.map((item) => (
          <div key={item.id} className="grid grid-cols-[auto_1fr] gap-3 rounded-xl border border-slate-200 bg-white p-2.5">
            <div className="min-w-16 text-center"><div className="text-[9px] font-black uppercase text-slate-400">Qty</div><div className="font-black text-slate-950">{item.quantity ?? 1} {item.unit || "ea"}</div></div>
            <div className="min-w-0">
              <div className="font-black text-slate-950">{itemDisplayReference(item)}</div>
              <div className="mt-0.5 text-xs text-slate-500">
                {item.bundle_no ? `Bundle ${item.bundle_no}${item.bundle_section ? ` · ${item.bundle_section}` : ""}` : item.item_description || item.material_type || "—"}
              </div>
              {item.bundle_no && item.item_description && <div className="mt-0.5 text-xs text-slate-500">{item.item_description}</div>}
            </div>
          </div>
        ))}
      </div>

      {(event.notes || event.current_effect || event.affected_activity) && (
        <div className="mt-2 rounded-xl bg-white p-2.5 text-xs text-slate-600">
          {event.affected_activity && <div><strong>Activity:</strong> {event.affected_activity}</div>}
          {event.current_effect && <div className="mt-1"><strong>Current effect:</strong> {event.current_effect}</div>}
          {event.notes && <div className="mt-1"><strong>Notes:</strong> {event.notes}</div>}
        </div>
      )}
    </div>
  );
}

function IssueEmpty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">{text}</div>;
}


function DataImportsWorkspace({ data, towerId }: { data: MaterialsData; towerId: string }) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [tab, setTab] = useState<DataManagerTab>("bundles");
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");
  const bundleInputRef = useRef<HTMLInputElement | null>(null);
  const memberInputRef = useRef<HTMLInputElement | null>(null);
  const boltInputRef = useRef<HTMLInputElement | null>(null);

  const [bundleDraft, setBundleDraft] = useState<Bundle | null>(null);
  const [memberDraft, setMemberDraft] = useState<Member | null>(null);
  const [boltDraft, setBoltDraft] = useState<Bolt | null>(null);

  const q = normaliseSearch(query);
  const unmatchedMembers = data.members.filter((member) => !data.resolveBundleForMember(member));
  const membersWithoutBundleId = data.members.filter((member) => !member.bundle_id).length;

  const filteredBundles = data.bundles.filter((bundle) =>
    !q || [bundle.bundle_no, bundle.section, bundle.qty_required, bundle.member_qty, bundle.total_weight]
      .join(" ").toLowerCase().includes(q),
  );
  const filteredMembers = data.members.filter((member) =>
    !q || [member.mark_no, member.bundle_reference, member.drawing_number, member.section, member.tower_segment]
      .join(" ").toLowerCase().includes(q),
  );
  const filteredBolts = data.bolts.filter((item) =>
    !q || materialItemSearchText(item).includes(q),
  );

  async function importBundles(file: File) {
    setBusy("bundles");
    try {
      const rows = await parseImportFile(file);
      const mapped = rows.map((row) => {
        const bundleNo = safeString(getRowValue(row, [
          "bundle_no", "Bundle No", "Bundle Number", "Bundle Reference", "Bundle Ref", "Bundle",
        ])).trim();
        if (!bundleNo) return null;

        const section = normaliseSegment(safeString(getRowValue(row, [
          "section", "Section", "Tower Segment", "Segment", "Bundle Segment", "Bundle Group",
        ]), "General"));

        return {
          tower_id: towerId,
          bundle_no: bundleNo,
          section,
          qty_required: Math.max(safeNumber(getRowValue(row, [
            "qty_required", "Qty Required", "Bundle Qty", "Bundle Quantity", "Qty/Tower", "Quantity of Bundles For Tower", "NO.",
          ]), 0), 0),
          member_qty: Math.max(safeNumber(getRowValue(row, [
            "member_qty", "Member Qty", "Member Quantity", "Members", "No. Members", "Member Count",
          ]), 0), 0),
          total_weight: (() => {
            const value = getRowValue(row, ["total_weight", "Total Weight", "Bundle Mass", "Bundle Weight"]);
            if (value == null || safeString(value).trim() === "") return null;
            return safeNumber(value, 0);
          })(),
        };
      }).filter(Boolean) as Array<Omit<Bundle, "id">>;

      const unique = new Map<string, Omit<Bundle, "id">>();
      mapped.forEach((row) => unique.set(`${normaliseBundleKey(row.bundle_no)}__${normaliseSegment(row.section)}`, row));
      const payload = Array.from(unique.values());

      if (!payload.length) throw new Error("No valid bundle rows were found.");

      if (importMode === "replace") {
        const clear = await supabase.from("tower_required_bundles").delete().eq("tower_id", towerId);
        if (clear.error) throw clear.error;
      }

      const result = await supabase
        .from("tower_required_bundles")
        .upsert(payload, { onConflict: "tower_id,bundle_no,section" });

      if (result.error) throw result.error;
      await data.refresh();
      alert(`Bundle import complete: ${payload.length} row(s).`);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Bundle import failed.");
    } finally {
      setBusy("");
    }
  }

  function resolveImportBundle(bundleReference: string, towerSegment: string): Bundle | undefined {
    const candidates = data.bundles.filter(
      (bundle) => normaliseBundleKey(bundle.bundle_no) === normaliseBundleKey(bundleReference),
    );
    if (candidates.length === 1) return candidates[0];

    const segment = normaliseSegment(towerSegment || "General");
    const exact = candidates.filter((bundle) => normaliseSegment(bundle.section) === segment);
    return exact.length === 1 ? exact[0] : undefined;
  }

  async function importMembers(file: File) {
    setBusy("members");
    try {
      const rows = await parseImportFile(file);
      const currentTowerKeys = getTowerIdentifierKeys(data.tower);
      const currentTowerDisplay = getTowerMatchDisplay(currentTowerKeys);
      let ambiguous = 0;
      let invalid = 0;
      let otherTower = 0;
      let towerRestrictedRows = 0;
      let towerRestrictedMatched = 0;

      const payload = rows.map((row) => {
        const markNo = safeString(getRowValue(row, [
          "mark_no", "Mark No", "Mark No.", "Member Mark", "Member Number", "Member No", "Mark",
        ])).trim();
        const bundleReference = safeString(getRowValue(row, [
          "bundle_reference", "Bundle Reference", "Bundle Ref", "bundle_no", "Bundle No", "Bundle Number",
        ])).trim();
        if (!markNo || !bundleReference) {
          invalid += 1;
          return null;
        }

        const applicableTowerValue = getRowValue(row, [
          "applicable_towers",
          "Applicable Towers",
          "Applicable Tower No(s)",
          "Applicable Tower Nos",
          "Tower No(s)",
          "Tower No",
          "Tower Nos",
          "Tower Number",
          "Tower Numbers",
          "Structure No",
          "Structure Number",
          "Applicable Structures",
        ]);

        const applicableTowerKeys = parseApplicableTowerKeys(applicableTowerValue);
        if (applicableTowerKeys.size > 0) {
          towerRestrictedRows += 1;
          if (!currentTowerMatchesApplicability(currentTowerKeys, applicableTowerKeys)) {
            otherTower += 1;
            return null;
          }
          towerRestrictedMatched += 1;
        }

        const towerSegment = normaliseSegment(safeString(getRowValue(row, [
          "tower_segment", "Tower Segment", "Member Segment", "Structure Segment", "Tower Section", "Assembly Segment",
        ]), "General"));
        const bundle = resolveImportBundle(bundleReference, towerSegment);

        if (!bundle?.id) {
          ambiguous += 1;
          return null;
        }

        const qty = safeNumber(getRowValue(row, [
          "qty_per_tower", "Qty/Tower", "QTY/Tower", "Qty per Tower", "Quantity per Tower", "Tower Qty",
        ]), 0);

        if (qty <= 0) {
          invalid += 1;
          return null;
        }

        return {
          tower_id: towerId,
          bundle_id: bundle.id,
          bundle_reference: bundleReference,
          drawing_number: safeString(getRowValue(row, [
            "drawing_number", "Drawing Number", "Drawing No", "Drawing", "Drg No",
          ])).trim(),
          mark_no: markNo,
          qty_per_tower: qty,
          section: safeString(getRowValue(row, [
            "section", "Section", "Section(s)", "Profile", "Member Section", "Steel Section", "Section / Profile",
          ])).trim(),
          tower_segment: towerSegment,
        };
      }).filter(Boolean) as Array<Omit<Member, "id">>;

      const unique = new Map<string, Omit<Member, "id">>();
      payload.forEach((row) => unique.set(`${row.bundle_id}__${row.mark_no.toUpperCase()}`, row));
      const finalRows = Array.from(unique.values());

      if (towerRestrictedRows > 0 && currentTowerKeys.size === 0) {
        throw new Error(
          `This file contains tower-specific member rows, but TTTracker could not identify the current tower number from this tower record. Displayed tower: ${safeString(data.tower?.name, "Unknown")}.`,
        );
      }

      if (!finalRows.length) {
        throw new Error(
          `No members could be imported for tower ${currentTowerDisplay}. ` +
          `${ambiguous} row(s) could not be matched to a unique bundle, ` +
          `${otherTower} row(s) belonged to other towers and ${invalid} row(s) were invalid.`,
        );
      }

      if (importMode === "replace") {
        const clear = await supabase.from("tower_material_members").delete().eq("tower_id", towerId);
        if (clear.error) throw clear.error;
      }

      const result = await supabase
        .from("tower_material_members")
        .upsert(finalRows, { onConflict: "tower_id,bundle_reference,mark_no,tower_segment" });

      if (result.error) throw result.error;
      await data.refresh();
      alert(
        [
          "Member import complete.",
          `Tower resolved as: ${currentTowerDisplay}`,
          `Imported: ${finalRows.length}`,
          `Tower-specific matched: ${towerRestrictedMatched}/${towerRestrictedRows}`,
          `Other-tower rows ignored: ${otherTower}`,
          `Ambiguous duplicate-bundle rows ignored: ${ambiguous}`,
          `Invalid rows ignored: ${invalid}`,
        ].join("\n"),
      );
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Member import failed.");
    } finally {
      setBusy("");
    }
  }

  async function importBolts(file: File) {
    setBusy("bolts");

    try {
      const rows = await parseImportFile(file);
      let invalid = 0;

      const mapped = rows
        .map((row) => {
          const packerNo = safeString(
            getRowValue(row, [
              "packer_no",
              "Packer No",
              "Packer Number",
              "Packer Size",
            ]),
          ).trim();
          const packerMark = safeString(
            getRowValue(row, [
              "packer_mark",
              "Packer Mark",
              "Packer ID Mark",
            ]),
          ).trim();
          const itemType = normaliseMaterialItemType(
            getRowValue(row, ["item_type", "Item Type", "Material Type"]),
            packerNo,
          );
          const boltType =
            safeString(
              getRowValue(row, [
                "bolt_type",
                "Bolt Type",
                "Bolt Style",
                "Bolt Kind",
              ]),
              "Standard Bolt",
            ).trim() || "Standard Bolt";
          const diameter = normaliseBoltDiameter(
            safeString(
              getRowValue(row, [
                "bolt_diameter",
                "Bolt Diameter",
                "Diameter",
                "Bolt",
              ]),
            ),
          );
          const length = safeString(
            getRowValue(row, [
              "length",
              "Length",
              "Bolt Length",
              "Length (mm)",
            ]),
          ).trim();
          const qty = Math.max(
            safeNumber(
              getRowValue(row, ["qty", "Qty", "QTY", "Quantity"]),
              0,
            ),
            0,
          );

          if (
            !diameter ||
            qty <= 0 ||
            (itemType === "bolt" && !length) ||
            (itemType === "packer" && !packerNo)
          ) {
            invalid += 1;
            return null;
          }

          return {
            tower_id: towerId,
            item_type: itemType,
            tower_segment: normaliseSegment(
              safeString(
                getRowValue(row, [
                  "tower_segment",
                  "Tower Segment",
                  "Segment",
                  "Section",
                ]),
                "General",
              ),
            ),
            drawing_number: safeString(
              getRowValue(row, [
                "drawing_number",
                "Drawing Number",
                "Drawing No",
                "Drawing",
                "Schedule Drawing",
              ]),
            ).trim(),
            bolt_diameter: diameter,
            bolt_type: itemType === "bolt" ? boltType : "",
            dn_sn:
              itemType === "bolt"
                ? safeString(
                    getRowValue(row, [
                      "dn_sn",
                      "DN/SN",
                      "DN / SN",
                      "DN-SN",
                    ]),
                  )
                    .trim()
                    .toUpperCase()
                : "",
            length: itemType === "bolt" ? length : "",
            packer_no: itemType === "packer" ? packerNo : "",
            packer_mark: itemType === "packer" ? packerMark : "",
            // Store the source schedule quantity. Leg multiplicity is applied
            // dynamically from Tower Overview so the calculation remains
            // traceable as base quantity × configured legs.
            qty,
          };
        })
        .filter(Boolean) as Array<Omit<Bolt, "id">>;

      if (!mapped.length) {
        throw new Error("No valid bolt or packer rows were found.");
      }

      const legRows = mapped.filter((row) =>
        data.isLegMaterialSegment(row.tower_segment),
      );

      if (legRows.length > 0 && !data.legConfigurationComplete) {
        throw new Error(
          data.legConfigurationDetected
            ? `This bolt / packer file contains leg-extension rows, but Tower Overview only resolves ${data.towerLegConfiguredCount}/${data.towerLegExpectedCount} legs (${formatLegConfigurationSummary(data.towerLegConfiguration)}). The import has been stopped rather than guessing the missing leg multiplier.`
            : "This bolt / packer file contains leg-extension rows, but TTTracker could not determine the tower's leg configuration from Tower Overview. The import has been stopped rather than assuming a leg quantity.",
        );
      }

      const segmentRestrictedRows = mapped.filter(
        (row) => !isGeneralMaterialSegment(row.tower_segment),
      );
      const nonLegRestrictedRows = segmentRestrictedRows.filter(
        (row) => !data.isLegMaterialSegment(row.tower_segment),
      );
      const hasNonLegTowerSegments =
        data.applicableMaterialSegments.some(
          (segmentName) =>
            !isGeneralMaterialSegment(segmentName) &&
            !data.isLegMaterialSegment(segmentName),
        );

      if (
        segmentRestrictedRows.length > 0 &&
        !data.materialApplicabilityActive
      ) {
        throw new Error(
          "TTTracker cannot safely determine which tower segments apply yet. Import the tower's bundle/member data and confirm Tower Overview first, then import the bolt & packer register.",
        );
      }

      if (
        nonLegRestrictedRows.length > 0 &&
        !hasNonLegTowerSegments
      ) {
        throw new Error(
          "This file contains non-leg tower-segment rows, but TTTracker has not resolved any non-leg segments from the tower's bundle/member register. Import or correct the bundle/member data before replacing the bolt & packer register.",
        );
      }

      const applicableMapped = mapped.filter((row) =>
        data.isMaterialSegmentApplicable(row.tower_segment),
      );
      const nonApplicableRows = mapped.length - applicableMapped.length;

      const unique = new Map<string, Omit<Bolt, "id">>();

      applicableMapped.forEach((row) => {
        const key = [
          row.tower_segment,
          row.item_type,
          row.drawing_number,
          row.bolt_diameter,
          row.bolt_type,
          row.dn_sn,
          row.length,
          row.packer_no,
          row.packer_mark,
        ].join("__");

        const existing = unique.get(key);
        unique.set(
          key,
          existing
            ? { ...existing, qty: existing.qty + row.qty }
            : row,
        );
      });

      const payload = Array.from(unique.values());

      if (!payload.length) {
        throw new Error(
          "No bolt or packer rows in this file apply to the current tower configuration.",
        );
      }

      if (importMode === "replace") {
        const clear = await supabase
          .from("tower_material_bolts")
          .delete()
          .eq("tower_id", towerId);

        if (clear.error) throw clear.error;
      }

      const result = await supabase
        .from("tower_material_bolts")
        .upsert(payload, {
          onConflict:
            "tower_id,tower_segment,item_type,drawing_number,bolt_diameter,bolt_type,dn_sn,length,packer_no,packer_mark",
        });

      if (result.error) throw result.error;

      await data.refresh();

      const boltRows = payload.filter(
        (row) => row.item_type === "bolt",
      ).length;
      const packerRows = payload.filter(
        (row) => row.item_type === "packer",
      ).length;

      alert(
        [
          "Bolt & packer import complete.",
          `Tower: ${getTowerDisplayLabel(data.tower)}`,
          `Tower legs: ${formatLegConfigurationSummary(data.towerLegConfiguration)}`,
          `Source rows read: ${rows.length}`,
          `Applicable rows saved: ${payload.length}`,
          `Bolts: ${boltRows} row(s)`,
          `Packers: ${packerRows} row(s)`,
          `Other configurations ignored: ${nonApplicableRows}`,
          `Invalid rows ignored: ${invalid}`,
          "",
          "Leg-extension Qty values are stored as the base schedule quantity. TTTracker applies the Tower Overview leg multiplier when calculating the tower requirement.",
        ].join("\n"),
      );
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error
          ? error.message
          : "Bolt & packer import failed.",
      );
    } finally {
      setBusy("");
    }
  }

  async function saveBundle() {
    if (!bundleDraft?.bundle_no.trim()) return;
    setBusy("save");
    try {
      const payload = {
        tower_id: towerId,
        bundle_no: bundleDraft.bundle_no.trim(),
        section: normaliseSegment(bundleDraft.section),
        qty_required: Math.max(safeNumber(bundleDraft.qty_required), 0),
        member_qty: Math.max(safeNumber(bundleDraft.member_qty), 0),
        total_weight: bundleDraft.total_weight == null ? null : safeNumber(bundleDraft.total_weight),
      };

      const result = bundleDraft.id
        ? await supabase.from("tower_required_bundles").update(payload).eq("id", bundleDraft.id)
        : await supabase.from("tower_required_bundles").insert(payload);

      if (result.error) throw result.error;

      // bundle_id remains the real identity, but keep all human-readable
      // bundle references in sync when an office user corrects the bundle.
      if (bundleDraft.id) {
        const syncResults = await Promise.all([
          supabase
            .from("tower_material_members")
            .update({
              bundle_reference: payload.bundle_no,
              tower_segment: payload.section,
            })
            .eq("bundle_id", bundleDraft.id),
          supabase
            .from("tower_material_bundle_checks")
            .update({ bundle_no: payload.bundle_no })
            .eq("bundle_id", bundleDraft.id),
          supabase
            .from("tower_material_member_checks")
            .update({ bundle_no: payload.bundle_no })
            .eq("bundle_id", bundleDraft.id),
          supabase
            .from("tower_bundle_delivery_items")
            .update({ bundle_no: payload.bundle_no })
            .eq("bundle_id", bundleDraft.id),
          supabase
            .from("tower_material_event_items")
            .update({
              bundle_no: payload.bundle_no,
              bundle_section: payload.section,
            })
            .eq("bundle_id", bundleDraft.id),
        ]);

        const syncError = syncResults.find((item) => item.error)?.error;
        if (syncError) {
          console.warn("Bundle saved but a linked display reference could not be synchronised", syncError);
        }
      }

      setBundleDraft(null);
      await data.refresh();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Bundle save failed.");
    } finally {
      setBusy("");
    }
  }

  async function saveMember() {
    if (!memberDraft?.mark_no.trim()) return;
    setBusy("save");
    try {
      const selectedBundle = memberDraft.bundle_id
        ? data.bundles.find((bundle) => bundle.id === memberDraft.bundle_id)
        : resolveImportBundle(memberDraft.bundle_reference, memberDraft.tower_segment);

      if (!selectedBundle?.id) {
        throw new Error("Select a unique bundle before saving this member.");
      }

      const payload = {
        tower_id: towerId,
        bundle_id: selectedBundle.id,
        bundle_reference: selectedBundle.bundle_no,
        drawing_number: memberDraft.drawing_number.trim(),
        mark_no: memberDraft.mark_no.trim(),
        qty_per_tower: Math.max(safeNumber(memberDraft.qty_per_tower), 0),
        section: memberDraft.section.trim(),
        tower_segment: normaliseSegment(selectedBundle.section),
      };

      const result = memberDraft.id
        ? await supabase.from("tower_material_members").update(payload).eq("id", memberDraft.id)
        : await supabase.from("tower_material_members").insert(payload);

      if (result.error) throw result.error;
      setMemberDraft(null);
      await data.refresh();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Member save failed.");
    } finally {
      setBusy("");
    }
  }

  async function saveBolt() {
    if (!boltDraft?.bolt_diameter.trim()) return;
    if (boltDraft.item_type === "bolt" && !boltDraft.length.trim()) {
      alert("Enter a bolt length.");
      return;
    }
    if (boltDraft.item_type === "packer" && !boltDraft.packer_no.trim()) {
      alert("Enter the packer number, for example #10.");
      return;
    }

    setBusy("save");
    try {
      const payload = {
        tower_id: towerId,
        item_type: boltDraft.item_type,
        tower_segment: normaliseSegment(boltDraft.tower_segment),
        drawing_number: boltDraft.drawing_number.trim(),
        bolt_diameter: normaliseBoltDiameter(boltDraft.bolt_diameter),
        bolt_type: boltDraft.item_type === "bolt" ? (boltDraft.bolt_type.trim() || "Standard Bolt") : "",
        dn_sn: boltDraft.item_type === "bolt" ? boltDraft.dn_sn.trim().toUpperCase() : "",
        length: boltDraft.item_type === "bolt" ? boltDraft.length.trim() : "",
        packer_no: boltDraft.item_type === "packer" ? boltDraft.packer_no.trim() : "",
        packer_mark: boltDraft.item_type === "packer" ? boltDraft.packer_mark.trim() : "",
        qty: Math.max(safeNumber(boltDraft.qty), 0),
      };

      const result = boltDraft.id
        ? await supabase.from("tower_material_bolts").update(payload).eq("id", boltDraft.id)
        : await supabase.from("tower_material_bolts").insert(payload);

      if (result.error) throw result.error;
      setBoltDraft(null);
      await data.refresh();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Bolt / packer save failed.");
    } finally {
      setBusy("");
    }
  }

  async function deleteRow(table: string, id: string | undefined, label: string) {
    if (!id) return;
    if (!window.confirm(`Delete ${label}?`)) return;
    setBusy("delete");
    try {
      const result = await supabase.from(table).delete().eq("id", id);
      if (result.error) throw result.error;
      await data.refresh();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : `Could not delete ${label}.`);
    } finally {
      setBusy("");
    }
  }

  function exportMasterData() {
    let rows: Array<Array<string | number | null | undefined>> = [];
    let filename = "";

    if (tab === "bundles") {
      filename = "materials_bundle_register.csv";
      rows = [
        ["Bundle ID", "Bundle No", "Section", "Qty Required", "Member Qty", "Total Weight"],
        ...data.bundles.map((row) => [row.id, row.bundle_no, row.section, row.qty_required, row.member_qty, row.total_weight]),
      ];
    } else if (tab === "members") {
      filename = "materials_member_register.csv";
      rows = [
        ["Member ID", "Bundle ID", "Bundle Reference", "Drawing Number", "Member Number", "Profile", "Qty/Tower", "Tower Segment"],
        ...data.members.map((row) => [row.id, row.bundle_id, row.bundle_reference, row.drawing_number, row.mark_no, row.section, row.qty_per_tower, row.tower_segment]),
      ];
    } else {
      filename = "materials_bolts_and_packers_register.csv";
      rows = [
        ["Item ID", "Item Type", "Tower Segment", "Drawing Number", "Bolt Diameter", "Bolt Type", "DN/SN", "Length", "Packer No", "Packer Mark", "Base Schedule Qty"],
        ...data.bolts.map((row) => [
          row.id,
          row.item_type,
          row.tower_segment,
          row.drawing_number,
          row.bolt_diameter,
          row.bolt_type,
          row.dn_sn,
          row.length,
          row.packer_no,
          row.packer_mark,
          row.qty,
        ]),
      ];
    }

    downloadTextFile(filename, rows.map((row) => row.map(csvEscape).join(",")).join("\n"));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="font-black text-blue-950">Data & Imports</h3>
            <p className="mt-1 text-xs text-blue-800">
              Website-only management area for replacing, merging, correcting and exporting source material data. Design / engineering changes should be recorded in Amendments so the original schedule remains auditable.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={importMode} onChange={(event) => setImportMode(event.target.value as ImportMode)} className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-black">
              <option value="merge">Add / merge</option>
              <option value="replace">Replace current tower data</option>
            </select>
            <button type="button" onClick={() => void data.refresh()} className="inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-900">
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <ImportCard
            title="Bundle Register"
            description="CSV. Duplicate display refs are kept separate by bundle section."
            busy={busy === "bundles"}
            onClick={() => bundleInputRef.current?.click()}
          />
          <ImportCard
            title="Member Register"
            description="CSV / XLSX / XLS. Members are linked to bundle UUID + section."
            busy={busy === "members"}
            onClick={() => memberInputRef.current?.click()}
          />
          <ImportCard
            title="Bolt & Packer Register"
            description="CSV. Saves only rows applicable to this tower. Leg rows keep the base schedule quantity; Tower Overview leg counts are applied dynamically."
            busy={busy === "bolts"}
            onClick={() => boltInputRef.current?.click()}
          />
        </div>

        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          <strong>Source data vs engineering change:</strong> use this area to fix import/data-entry mistakes in the source register. If an approved redline, RFI, drawing revision or other controlled instruction changes the actual material requirement, record it under <strong>Amendments</strong> instead of overwriting the original row.
        </div>

        <input ref={bundleInputRef} type="file" accept=".csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBundles(file); event.currentTarget.value = ""; }} />
        <input ref={memberInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importMembers(file); event.currentTarget.value = ""; }} />
        <input ref={boltInputRef} type="file" accept=".csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBolts(file); event.currentTarget.value = ""; }} />
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <DataHealthCard label="Bundles" value={data.bundles.length} good />
        <DataHealthCard label="Members" value={data.members.length} good />
        <DataHealthCard label="Unmatched Members" value={unmatchedMembers.length} good={unmatchedMembers.length === 0} />
        <DataHealthCard label="No Bundle UUID" value={membersWithoutBundleId} good={membersWithoutBundleId === 0} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
              {(["bundles", "members", "bolts"] as DataManagerTab[]).map((id) => (
                <button key={id} type="button" onClick={() => { setTab(id); setQuery(""); }} className={`rounded-lg px-3 py-2 text-xs font-black capitalize ${tab === id ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>
                  {id === "bolts" ? "Bolts & Packers" : id}
                </button>
              ))}
            </div>
            <div className="flex flex-1 gap-2 md:max-w-xl">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tab === "bolts" ? "Search bolts & packers…" : `Search ${tab}…`} className="w-full rounded-xl border border-slate-300 py-2 pl-8 pr-3 text-xs" />
              </div>
              <button type="button" onClick={exportMasterData} className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">
                <Download size={13} /> Export
              </button>
              <button
                type="button"
                onClick={() => {
                  if (tab === "bundles") setBundleDraft({ tower_id: towerId, bundle_no: "", section: "General", qty_required: 1, member_qty: 0, total_weight: null });
                  if (tab === "members") setMemberDraft({ tower_id: towerId, bundle_id: null, bundle_reference: "", drawing_number: "", mark_no: "", qty_per_tower: 1, section: "", tower_segment: "General" });
                  if (tab === "bolts") setBoltDraft({ tower_id: towerId, item_type: "bolt", tower_segment: "General", drawing_number: "", bolt_diameter: "", bolt_type: "Standard Bolt", dn_sn: "", length: "", packer_no: "", packer_mark: "", qty: 0 });
                }}
                className="inline-flex items-center gap-1 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white"
              >
                <Plus size={13} /> Add
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {tab === "bundles" && (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-wide text-slate-400">
                <tr><th className="px-3 py-2 text-left">Bundle</th><th className="px-3 py-2 text-left">Section</th><th className="px-3 py-2 text-center">Required</th><th className="px-3 py-2 text-center">Members</th><th className="px-3 py-2 text-center">Weight</th><th className="px-3 py-2 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBundles.map((row) => (
                  <tr key={bundleUiKey(row)}>
                    <td className="px-3 py-2.5 font-black text-slate-950">{row.bundle_no}</td>
                    <td className="px-3 py-2.5">{row.section}</td>
                    <td className="px-3 py-2.5 text-center font-bold">{row.qty_required}</td>
                    <td className="px-3 py-2.5 text-center">{row.member_qty}</td>
                    <td className="px-3 py-2.5 text-center">{row.total_weight ?? "—"}</td>
                    <td className="px-3 py-2.5"><DataActions onEdit={() => setBundleDraft({ ...row })} onDelete={() => void deleteRow("tower_required_bundles", row.id, `${row.bundle_no} · ${row.section}`)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "members" && (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-wide text-slate-400">
                <tr><th className="px-3 py-2 text-left">Member</th><th className="px-3 py-2 text-left">Bundle</th><th className="px-3 py-2 text-left">Drawing</th><th className="px-3 py-2 text-left">Profile</th><th className="px-3 py-2 text-center">Qty/Tower</th><th className="px-3 py-2 text-left">Segment</th><th className="px-3 py-2 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMembers.map((row) => (
                  <tr key={row.id || `${row.bundle_reference}-${row.mark_no}-${row.tower_segment}`}>
                    <td className="px-3 py-2.5 font-black text-slate-950">{row.mark_no}</td>
                    <td className="px-3 py-2.5">{row.bundle_reference}{!row.bundle_id && <span className="ml-1 text-[9px] font-black text-amber-600">UNLINKED</span>}</td>
                    <td className="px-3 py-2.5">{row.drawing_number || "—"}</td>
                    <td className="px-3 py-2.5">{row.section || "—"}</td>
                    <td className="px-3 py-2.5 text-center">{row.qty_per_tower ?? "—"}</td>
                    <td className="px-3 py-2.5">{row.tower_segment || "—"}</td>
                    <td className="px-3 py-2.5"><DataActions onEdit={() => setMemberDraft({ ...row })} onDelete={() => void deleteRow("tower_material_members", row.id, row.mark_no)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "bolts" && (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Segment</th>
                  <th className="px-3 py-2 text-left">Drawing</th>
                  <th className="px-3 py-2 text-center">Diameter</th>
                  <th className="px-3 py-2 text-center">Specification</th>
                  <th className="px-3 py-2 text-center">Base Qty</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBolts.map((row) => (
                  <tr key={row.id || `${row.item_type}-${row.tower_segment}-${row.bolt_diameter}-${row.bolt_type}-${row.dn_sn}-${row.length}-${row.packer_no}-${row.packer_mark}-${row.drawing_number}`}>
                    <td className="px-3 py-2.5">
                      <Pill className={row.item_type === "packer" ? "border-violet-200 bg-violet-50 text-violet-700" : "border-blue-200 bg-blue-50 text-blue-700"}>
                        {row.item_type === "packer" ? "Packer" : "Bolt"}
                      </Pill>
                    </td>
                    <td className="px-3 py-2.5 font-black text-slate-950">{row.tower_segment}</td>
                    <td className="px-3 py-2.5">{row.drawing_number || "—"}</td>
                    <td className="px-3 py-2.5 text-center font-black">{row.bolt_diameter}</td>
                    <td className="px-3 py-2.5 text-center font-bold">
                      {row.item_type === "packer"
                        ? [row.packer_no, row.packer_mark].filter(Boolean).join(" · ") || "—"
                        : [row.dn_sn, row.length ? `${row.length} mm` : "", row.bolt_type && row.bolt_type !== "Standard Bolt" ? row.bolt_type : ""].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center font-black">{row.qty}</td>
                    <td className="px-3 py-2.5">
                      <DataActions
                        onEdit={() => setBoltDraft({ ...row })}
                        onDelete={() => void deleteRow("tower_material_bolts", row.id, materialItemLabel(row))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {bundleDraft && (
        <EditPanel title={bundleDraft.id ? "Edit Bundle" : "Add Bundle"} onClose={() => setBundleDraft(null)} onSave={() => void saveBundle()} saving={busy === "save"}>
          <EditInput label="Bundle No" value={bundleDraft.bundle_no} onChange={(value) => setBundleDraft((prev) => prev ? { ...prev, bundle_no: value } : prev)} />
          <EditInput label="Section" value={bundleDraft.section} onChange={(value) => setBundleDraft((prev) => prev ? { ...prev, section: value } : prev)} />
          <EditInput label="Qty Required" type="number" value={bundleDraft.qty_required} onChange={(value) => setBundleDraft((prev) => prev ? { ...prev, qty_required: safeNumber(value) } : prev)} />
          <EditInput label="Member Qty" type="number" value={bundleDraft.member_qty} onChange={(value) => setBundleDraft((prev) => prev ? { ...prev, member_qty: safeNumber(value) } : prev)} />
          <EditInput label="Total Weight" type="number" value={bundleDraft.total_weight ?? ""} onChange={(value) => setBundleDraft((prev) => prev ? { ...prev, total_weight: value === "" ? null : safeNumber(value) } : prev)} />
        </EditPanel>
      )}

      {memberDraft && (
        <EditPanel title={memberDraft.id ? "Edit Member" : "Add Member"} onClose={() => setMemberDraft(null)} onSave={() => void saveMember()} saving={busy === "save"}>
          <EditInput label="Member Number" value={memberDraft.mark_no} onChange={(value) => setMemberDraft((prev) => prev ? { ...prev, mark_no: value } : prev)} />
          <div>
            <label className="mb-1 block text-xs font-black text-slate-500">Bundle</label>
            <select
              value={memberDraft.bundle_id || ""}
              onChange={(event) => {
                const bundle = data.bundles.find((row) => row.id === event.target.value);
                setMemberDraft((prev) => prev ? {
                  ...prev,
                  bundle_id: bundle?.id || null,
                  bundle_reference: bundle?.bundle_no || "",
                  tower_segment: bundle?.section || "General",
                } : prev);
              }}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">Select bundle…</option>
              {data.bundles.map((bundle) => <option key={bundleUiKey(bundle)} value={bundle.id || ""}>{bundle.bundle_no} · {bundle.section}</option>)}
            </select>
          </div>
          <EditInput label="Drawing Number" value={memberDraft.drawing_number} onChange={(value) => setMemberDraft((prev) => prev ? { ...prev, drawing_number: value } : prev)} />
          <EditInput label="Profile / Section" value={memberDraft.section} onChange={(value) => setMemberDraft((prev) => prev ? { ...prev, section: value } : prev)} />
          <EditInput label="Qty / Tower" type="number" value={memberDraft.qty_per_tower ?? ""} onChange={(value) => setMemberDraft((prev) => prev ? { ...prev, qty_per_tower: safeNumber(value) } : prev)} />
          <EditInput label="Tower Segment" value={memberDraft.tower_segment} onChange={(value) => setMemberDraft((prev) => prev ? { ...prev, tower_segment: value } : prev)} />
        </EditPanel>
      )}

      {boltDraft && (
        <EditPanel
          title={boltDraft.id ? "Edit Bolt / Packer" : "Add Bolt / Packer"}
          onClose={() => setBoltDraft(null)}
          onSave={() => void saveBolt()}
          saving={busy === "save"}
        >
          <div>
            <label className="mb-1 block text-xs font-black text-slate-500">Item Type</label>
            <select
              value={boltDraft.item_type}
              onChange={(event) => {
                const itemType = event.target.value as MaterialItemType;
                setBoltDraft((prev) => prev ? {
                  ...prev,
                  item_type: itemType,
                  bolt_type: itemType === "bolt" ? (prev.bolt_type || "Standard Bolt") : "",
                  dn_sn: itemType === "bolt" ? prev.dn_sn : "",
                  length: itemType === "bolt" ? prev.length : "",
                  packer_no: itemType === "packer" ? prev.packer_no : "",
                  packer_mark: itemType === "packer" ? prev.packer_mark : "",
                } : prev);
              }}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="bolt">Bolt</option>
              <option value="packer">Packer</option>
            </select>
          </div>
          <EditInput label="Tower Segment" value={boltDraft.tower_segment} onChange={(value) => setBoltDraft((prev) => prev ? { ...prev, tower_segment: value } : prev)} />
          <EditInput label="Drawing Number" value={boltDraft.drawing_number} onChange={(value) => setBoltDraft((prev) => prev ? { ...prev, drawing_number: value } : prev)} />
          <EditInput label="Bolt Diameter" value={boltDraft.bolt_diameter} onChange={(value) => setBoltDraft((prev) => prev ? { ...prev, bolt_diameter: value } : prev)} />
          {boltDraft.item_type === "bolt" ? (
            <>
              <EditInput label="Bolt Type" value={boltDraft.bolt_type} onChange={(value) => setBoltDraft((prev) => prev ? { ...prev, bolt_type: value } : prev)} />
              <EditInput label="DN/SN" value={boltDraft.dn_sn} onChange={(value) => setBoltDraft((prev) => prev ? { ...prev, dn_sn: value } : prev)} />
              <EditInput label="Length (mm)" value={boltDraft.length} onChange={(value) => setBoltDraft((prev) => prev ? { ...prev, length: value } : prev)} />
            </>
          ) : (
            <>
              <EditInput label="Packer No" value={boltDraft.packer_no} onChange={(value) => setBoltDraft((prev) => prev ? { ...prev, packer_no: value } : prev)} />
              <EditInput label="Packer Mark" value={boltDraft.packer_mark} onChange={(value) => setBoltDraft((prev) => prev ? { ...prev, packer_mark: value } : prev)} />
            </>
          )}
          <EditInput label="Base Schedule Qty" type="number" value={boltDraft.qty} onChange={(value) => setBoltDraft((prev) => prev ? { ...prev, qty: safeNumber(value) } : prev)} />
        </EditPanel>
      )}
    </div>
  );
}

function ImportCard({ title, description, busy, onClick }: { title: string; description: string; busy: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className="rounded-2xl border border-blue-200 bg-white p-4 text-left hover:border-blue-400 disabled:opacity-60">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Upload size={16} /></div>
        {busy && <RefreshCw size={15} className="animate-spin text-blue-600" />}
      </div>
      <div className="mt-3 font-black text-slate-950">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
    </button>
  );
}

function DataHealthCard({ label, value, good }: { label: string; value: number; good: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${good ? "border-slate-200 bg-white" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex items-center justify-between">
        <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div>
        {good ? <CheckCircle2 size={13} className="text-emerald-600" /> : <AlertCircle size={13} className="text-amber-600" />}
      </div>
      <div className="mt-1 text-xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function DataActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      <button type="button" onClick={onEdit} className="rounded-lg bg-slate-100 p-2 text-slate-600 hover:bg-slate-200" title="Edit"><Pencil size={13} /></button>
      <button type="button" onClick={onDelete} className="rounded-lg bg-rose-50 p-2 text-rose-600 hover:bg-rose-100" title="Delete"><Trash2 size={13} /></button>
    </div>
  );
}

function EditPanel({
  title,
  children,
  onClose,
  onSave,
  saving,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 p-2 md:items-center">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h3 className="text-lg font-black text-slate-950">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100"><X size={17} /></button>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2">{children}</div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700">Cancel</button>
          <button type="button" onClick={onSave} disabled={saving} className="inline-flex items-center gap-1 rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-60">
            <Save size={14} /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: "text" | "number";
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-black text-slate-500">{label}</label>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
    </div>
  );
}

const MATERIAL_CONFIG_CATEGORIES = [
  { id: "amendment_action", label: "Amendment Actions" },
  { id: "amendment_status", label: "Workflow Statuses" },
  { id: "amendment_scope", label: "Applicability Scopes" },
  { id: "reference_type", label: "Reference Types" },
  { id: "quantity_basis", label: "Quantity Bases" },
] as const;

function materialConfigBehaviorOptions(category: string) {
  if (category === "amendment_action") {
    return [
      ["add", "Add a new / omitted material item"],
      ["replace", "Replace an existing item / specification"],
      ["remove", "Remove an existing item"],
      ["quantity_override", "Override the existing base quantity"],
      ["quantity_delta", "Add or subtract from the existing base quantity"],
      ["note", "Attach a controlled note without changing quantity"],
    ] as const;
  }

  if (category === "amendment_scope") {
    return [
      ["tower", "Current tower only"],
      ["tower_type", "All matching tower types in this project"],
      ["project", "Entire project"],
      ["drawing", "Rows from a nominated drawing"],
      ["segment", "Rows from a nominated tower segment"],
    ] as const;
  }

  if (category === "quantity_basis") {
    return [
      ["inherit", "Use the normal segment basis"],
      ["per_tower", "Quantity is per tower"],
      ["per_leg", "Quantity is per matching leg"],
    ] as const;
  }

  return [] as const;
}

type AmendmentDraftItem = {
  key: string;
  action_config_id: string;
  base_material_id: string;
  item_type: MaterialItemType;
  tower_segment: string;
  drawing_number: string;
  bolt_diameter: string;
  bolt_type: string;
  dn_sn: string;
  length: string;
  packer_no: string;
  packer_mark: string;
  qty: string;
  quantity_basis_config_id: string;
  notes: string;
};

function makeDraftAmendmentItem(
  actionConfigId = "",
  quantityBasisConfigId = "",
): AmendmentDraftItem {
  return {
    key:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `amendment-item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    action_config_id: actionConfigId,
    base_material_id: "",
    item_type: "bolt",
    tower_segment: "General",
    drawing_number: "",
    bolt_diameter: "",
    bolt_type: "Standard Bolt",
    dn_sn: "",
    length: "",
    packer_no: "",
    packer_mark: "",
    qty: "1",
    quantity_basis_config_id: quantityBasisConfigId,
    notes: "",
  };
}

function MaterialConfigPanel({
  data,
  projectId,
}: {
  data: MaterialsData;
  projectId: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [category, setCategory] = useState("amendment_action");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [behavior, setBehavior] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isEffective, setIsEffective] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const projectRows = data.materialConfigOptions
    .filter((option) => option.category === category)
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.label.localeCompare(b.label);
    });

  const behaviorOptions = materialConfigBehaviorOptions(category);

  function resetForm(nextCategory = category) {
    setEditingId(null);
    setCategory(nextCategory);
    setLabel("");
    setCode("");
    setBehavior("");
    setSortOrder("0");
    setIsEffective(false);
    setIsClosed(false);
    setIsActive(true);
  }

  function editOption(option: MaterialConfigOption, forceProjectOverride = false) {
    setEditingId(forceProjectOverride ? null : option.id);
    setCategory(option.category);
    setLabel(option.label);
    setCode(option.code);
    setBehavior(option.behavior || "");
    setSortOrder(String(option.sort_order || 0));
    setIsEffective(Boolean(option.is_effective));
    setIsClosed(Boolean(option.is_closed));
    setIsActive(option.is_active !== false);
  }

  async function saveOption() {
    if (!label.trim()) {
      alert("Enter a configuration label.");
      return;
    }

    const cleanCode = slugifyConfigCode(code || label);
    if (!cleanCode) {
      alert("Enter a usable configuration code.");
      return;
    }

    if (behaviorOptions.length > 0 && !behavior) {
      alert("Select the system behaviour for this option.");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        project_id: projectId,
        category,
        code: cleanCode,
        label: label.trim(),
        behavior: behavior.trim(),
        value_text: null,
        value_number: null,
        is_effective: category === "amendment_status" ? isEffective : false,
        is_closed: category === "amendment_status" ? isClosed : false,
        is_active: isActive,
        sort_order: safeNumber(sortOrder, 0),
        metadata: {},
      };

      const current = editingId
        ? data.materialConfigOptions.find((option) => option.id === editingId)
        : undefined;

      if (current?.project_id === null) {
        throw new Error(
          "Global configuration rows are read-only here. Use Override to create a project-specific version.",
        );
      }

      const result = editingId
        ? await supabase
            .from("material_config_options")
            .update(payload)
            .eq("id", editingId)
        : await supabase.from("material_config_options").upsert(payload, {
            onConflict: "project_id,category,code",
          });

      if (result.error) throw result.error;
      resetForm(category);
      await data.refresh();
    } catch (error) {
      console.error("material config save error", error);
      alert(error instanceof Error ? error.message : "Configuration could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteOption(option: MaterialConfigOption) {
    if (option.project_id === null) {
      alert("Global rows cannot be deleted from the project Materials page. Create a project override instead.");
      return;
    }

    if (!window.confirm(`Delete configuration option “${option.label}”?`)) return;

    setBusy(true);
    try {
      const result = await supabase
        .from("material_config_options")
        .delete()
        .eq("id", option.id);
      if (result.error) throw result.error;
      await data.refresh();
    } catch (error) {
      console.error("material config delete error", error);
      alert(error instanceof Error ? error.message : "Configuration could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
        <h3 className="font-black text-blue-950">Material amendment configuration</h3>
        <p className="mt-1 text-xs leading-5 text-blue-800">
          Labels, workflow statuses, scope choices, reference types and quantity bases are stored in Supabase configuration rows. The page only understands the configured system behaviour, so projects can rename, add, deactivate or override options without changing this file.
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {MATERIAL_CONFIG_CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => resetForm(item.id)}
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-black ${
              category === item.id ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-2">
          {projectRows.length === 0 ? (
            <IssueEmpty text="No options are configured in this category yet." />
          ) : (
            projectRows.map((option) => (
              <div key={option.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-black text-slate-950">{option.label}</div>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">
                        {option.code}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${option.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                        {option.is_active ? "ACTIVE" : "INACTIVE"}
                      </span>
                      {option.project_id === null && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700">GLOBAL</span>
                      )}
                      {category === "amendment_status" && option.is_effective && (
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-black text-violet-700">AFFECTS REQUIREMENTS</span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {option.behavior ? `Behaviour: ${option.behavior}` : "No system behaviour required"} · Sort {option.sort_order}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {option.project_id === null ? (
                      <button type="button" onClick={() => editOption(option, true)} className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">
                        Override for project
                      </button>
                    ) : (
                      <>
                        <button type="button" onClick={() => editOption(option)} className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">
                          <Pencil size={13} /> Edit
                        </button>
                        <button type="button" onClick={() => void deleteOption(option)} className="inline-flex items-center gap-1 rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">
                          <Trash2 size={13} /> Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h4 className="font-black text-slate-950">{editingId ? "Edit option" : "Add project option"}</h4>
          <div className="mt-3 space-y-3">
            <EditInput label="Label" value={label} onChange={(value) => { setLabel(value); if (!code) setCode(slugifyConfigCode(value)); }} />
            <EditInput label="Code" value={code} onChange={setCode} />

            {behaviorOptions.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-black text-slate-500">System Behaviour</label>
                <select value={behavior} onChange={(event) => setBehavior(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
                  <option value="">Select behaviour…</option>
                  {behaviorOptions.map(([value, text]) => (
                    <option key={value} value={value}>{text}</option>
                  ))}
                </select>
              </div>
            )}

            <EditInput label="Sort Order" value={sortOrder} onChange={setSortOrder} type="number" />

            {category === "amendment_status" && (
              <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs">
                <label className="flex items-center gap-2 font-bold text-slate-700">
                  <input type="checkbox" checked={isEffective} onChange={(event) => setIsEffective(event.target.checked)} />
                  This status changes the current bolt / packer requirement
                </label>
                <label className="flex items-center gap-2 font-bold text-slate-700">
                  <input type="checkbox" checked={isClosed} onChange={(event) => setIsClosed(event.target.checked)} />
                  This status is a closed workflow state
                </label>
              </div>
            )}

            <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
              Available for selection
            </label>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => resetForm(category)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-600">
                Clear
              </button>
              <button type="button" disabled={busy} onClick={() => void saveOption()} className="inline-flex items-center gap-1 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                <Save size={13} /> {busy ? "Saving…" : "Save Option"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AmendmentsWorkspace({
  data,
  projectId,
  towerId,
}: {
  data: MaterialsData;
  projectId: string;
  towerId: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [mode, setMode] = useState<"register" | "new" | "config">("register");
  const actions = data.getMaterialConfigOptions("amendment_action");
  const statuses = data.getMaterialConfigOptions("amendment_status");
  const scopes = data.getMaterialConfigOptions("amendment_scope");
  const referenceTypes = data.getMaterialConfigOptions("reference_type");
  const quantityBases = data.getMaterialConfigOptions("quantity_basis");
  const defaultActionId = actions[0]?.id || "";
  const defaultQuantityBasisId = quantityBases[0]?.id || "";

  const [scopeConfigId, setScopeConfigId] = useState("");
  const [statusConfigId, setStatusConfigId] = useState("");
  const [referenceTypeConfigId, setReferenceTypeConfigId] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [drawingNumber, setDrawingNumber] = useState("");
  const [drawingRevision, setDrawingRevision] = useState("");
  const [towerSegment, setTowerSegment] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [draftItems, setDraftItems] = useState<AmendmentDraftItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  const currentTowerType = getTowerTypeValue(data.tower);
  const selectedScope = data.getMaterialConfigOption(scopeConfigId);

  const rawMaterialById = useMemo(
    () => new Map(data.bolts.filter((item) => item.id).map((item) => [item.id!, item])),
    [data.bolts],
  );

  const setupReady =
    data.amendmentSetupAvailable && actions.length > 0 && statuses.length > 0 && scopes.length > 0;

  function initialiseNew() {
    setScopeConfigId(scopes[0]?.id || "");
    setStatusConfigId(statuses[0]?.id || "");
    setReferenceTypeConfigId(referenceTypes[0]?.id || "");
    setReferenceNo("");
    setTitle("");
    setReason("");
    setDrawingNumber("");
    setDrawingRevision("");
    setTowerSegment("");
    setEffectiveDate("");
    setDocumentUrl("");
    setDraftItems([makeDraftAmendmentItem(defaultActionId, defaultQuantityBasisId)]);
    setMode("new");
  }

  function updateDraftItem(index: number, patch: Partial<AmendmentDraftItem>) {
    setDraftItems((previous) =>
      previous.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  function chooseBaseMaterial(index: number, baseMaterialId: string) {
    const base = rawMaterialById.get(baseMaterialId);
    if (!base) {
      updateDraftItem(index, { base_material_id: baseMaterialId });
      return;
    }

    updateDraftItem(index, {
      base_material_id: baseMaterialId,
      item_type: base.item_type,
      tower_segment: base.tower_segment,
      drawing_number: base.drawing_number,
      bolt_diameter: base.bolt_diameter,
      bolt_type: base.bolt_type,
      dn_sn: base.dn_sn,
      length: base.length,
      packer_no: base.packer_no,
      packer_mark: base.packer_mark,
      qty: String(base.qty),
    });
  }

  async function saveAmendment() {
    if (!setupReady) {
      alert("Configure at least one action, status and scope before creating an amendment.");
      return;
    }
    if (!title.trim()) {
      alert("Enter an amendment title.");
      return;
    }
    if (!scopeConfigId || !statusConfigId) {
      alert("Select a scope and workflow status.");
      return;
    }
    if (!draftItems.length) {
      alert("Add at least one amendment item.");
      return;
    }

    const scope = data.getMaterialConfigOption(scopeConfigId);
    if (scope?.behavior === "tower_type" && !currentTowerType) {
      alert("This tower does not have a Tower Type value, so a tower-type scope cannot be saved safely.");
      return;
    }
    if (scope?.behavior === "drawing" && !drawingNumber.trim()) {
      alert("Enter the drawing number for this drawing-scoped amendment.");
      return;
    }
    if (scope?.behavior === "segment" && !towerSegment.trim()) {
      alert("Select the tower segment for this segment-scoped amendment.");
      return;
    }

    for (const [index, item] of draftItems.entries()) {
      const action = data.getMaterialConfigOption(item.action_config_id);
      const behavior = action?.behavior || "";
      if (!action || !behavior) {
        alert(`Amendment item ${index + 1} does not have a configured action behaviour.`);
        return;
      }

      if (behavior !== "add" && !item.base_material_id) {
        alert(`Amendment item ${index + 1} must be linked to an existing source material row.`);
        return;
      }

      if (["add", "replace"].includes(behavior)) {
        if (!item.bolt_diameter.trim()) {
          alert(`Amendment item ${index + 1} requires a bolt / packer diameter.`);
          return;
        }
        if (item.item_type === "bolt" && !item.length.trim()) {
          alert(`Amendment item ${index + 1} requires a bolt length.`);
          return;
        }
        if (item.item_type === "packer" && !item.packer_no.trim()) {
          alert(`Amendment item ${index + 1} requires a packer number.`);
          return;
        }
        if (safeNumber(item.qty, 0) <= 0) {
          alert(`Amendment item ${index + 1} requires a quantity greater than zero.`);
          return;
        }
      }
    }

    setSaving(true);
    let amendmentId = "";
    try {
      const { data: userData } = await supabase.auth.getUser();
      const status = data.getMaterialConfigOption(statusConfigId);
      const now = new Date().toISOString();

      const headerPayload = {
        project_id: projectId,
        tower_id: scope?.behavior === "tower" ? towerId : null,
        tower_type: scope?.behavior === "tower_type" ? currentTowerType : null,
        drawing_number: scope?.behavior === "drawing" ? drawingNumber.trim() : drawingNumber.trim() || null,
        drawing_revision: drawingRevision.trim() || null,
        tower_segment: scope?.behavior === "segment" ? normaliseSegment(towerSegment) : towerSegment.trim() ? normaliseSegment(towerSegment) : null,
        scope_config_id: scopeConfigId,
        reference_type_config_id: referenceTypeConfigId || null,
        reference_no: referenceNo.trim() || null,
        title: title.trim(),
        reason: reason.trim() || null,
        status_config_id: statusConfigId,
        effective_date: effectiveDate || null,
        document_url: documentUrl.trim() || null,
        created_by: userData.user?.id || null,
        approved_by: status?.is_effective ? userData.user?.id || null : null,
        approved_at: status?.is_effective ? now : null,
      };

      const headerResult = await supabase
        .from("material_amendments")
        .insert(headerPayload)
        .select("id")
        .single();
      if (headerResult.error) throw headerResult.error;
      amendmentId = safeString(headerResult.data?.id);
      if (!amendmentId) throw new Error("The amendment header was saved without an ID.");

      const itemPayload = draftItems.map((item) => {
        const base = item.base_material_id ? rawMaterialById.get(item.base_material_id) : undefined;
        const behavior = data.getMaterialConfigOption(item.action_config_id)?.behavior || "";
        const useSpec = behavior === "add" || behavior === "replace";

        return {
          amendment_id: amendmentId,
          action_config_id: item.action_config_id,
          base_material_id: item.base_material_id || null,
          item_type: useSpec ? item.item_type : base?.item_type || item.item_type,
          tower_segment: normaliseSegment(useSpec ? item.tower_segment : base?.tower_segment || item.tower_segment || "General"),
          drawing_number: useSpec ? item.drawing_number.trim() : base?.drawing_number || item.drawing_number.trim(),
          bolt_diameter: normaliseBoltDiameter(useSpec ? item.bolt_diameter : base?.bolt_diameter || item.bolt_diameter),
          bolt_type: (useSpec ? item.item_type : base?.item_type) === "packer" ? "" : (useSpec ? item.bolt_type : base?.bolt_type || item.bolt_type) || "Standard Bolt",
          dn_sn: (useSpec ? item.item_type : base?.item_type) === "packer" ? "" : (useSpec ? item.dn_sn : base?.dn_sn || item.dn_sn).trim().toUpperCase(),
          length: (useSpec ? item.item_type : base?.item_type) === "packer" ? "" : (useSpec ? item.length : base?.length || item.length).trim(),
          packer_no: (useSpec ? item.item_type : base?.item_type) === "packer" ? (useSpec ? item.packer_no : base?.packer_no || item.packer_no).trim() : "",
          packer_mark: (useSpec ? item.item_type : base?.item_type) === "packer" ? (useSpec ? item.packer_mark : base?.packer_mark || item.packer_mark).trim() : "",
          qty: ["remove", "note"].includes(behavior) ? 0 : safeNumber(item.qty, 0),
          quantity_basis_config_id: item.quantity_basis_config_id || null,
          notes: item.notes.trim() || null,
        };
      });

      const itemResult = await supabase.from("material_amendment_items").insert(itemPayload);
      if (itemResult.error) throw itemResult.error;

      await data.refresh();
      setMode("register");
      alert("Material amendment saved.");
    } catch (error) {
      console.error("material amendment save error", error);
      if (amendmentId) {
        await supabase.from("material_amendments").delete().eq("id", amendmentId);
      }
      alert(error instanceof Error ? error.message : "Material amendment could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(amendment: MaterialAmendment, statusConfigIdValue: string) {
    const status = data.getMaterialConfigOption(statusConfigIdValue);
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const payload: Record<string, unknown> = {
        status_config_id: statusConfigIdValue,
      };
      if (status?.is_effective) {
        payload.approved_by = userData.user?.id || null;
        payload.approved_at = new Date().toISOString();
      }
      const result = await supabase
        .from("material_amendments")
        .update(payload)
        .eq("id", amendment.id);
      if (result.error) throw result.error;
      await data.refresh();
    } catch (error) {
      console.error("amendment status update error", error);
      alert(error instanceof Error ? error.message : "Status could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAmendment(amendment: MaterialAmendment) {
    if (!window.confirm(`Delete material amendment “${amendment.title}”?`)) return;
    setSaving(true);
    try {
      const result = await supabase.from("material_amendments").delete().eq("id", amendment.id);
      if (result.error) throw result.error;
      await data.refresh();
    } catch (error) {
      console.error("material amendment delete error", error);
      alert(error instanceof Error ? error.message : "Amendment could not be deleted.");
    } finally {
      setSaving(false);
    }
  }

  const currentTowerAmendments = data.materialAmendments.filter((amendment) => {
    const scope = data.getMaterialConfigOption(amendment.scope_config_id);
    if (!scope) return true;
    if (scope.behavior === "tower") return amendment.tower_id === towerId;
    if (scope.behavior === "tower_type") {
      return Boolean(amendment.tower_type && currentTowerType && normaliseHeader(amendment.tower_type) === normaliseHeader(currentTowerType));
    }
    if (scope.behavior === "drawing") {
      const drawing = safeString(amendment.drawing_number).trim().toUpperCase();
      return Boolean(drawing && data.applicableBolts.some((item) => item.drawing_number.trim().toUpperCase() === drawing));
    }
    if (scope.behavior === "segment") {
      return Boolean(amendment.tower_segment && data.isMaterialSegmentApplicable(amendment.tower_segment));
    }
    return scope.behavior === "project";
  });

  const q = normaliseSearch(query);
  const filteredAmendments = currentTowerAmendments.filter((amendment) => {
    if (!q) return true;
    const referenceType = data.getMaterialConfigOption(amendment.reference_type_config_id);
    const scope = data.getMaterialConfigOption(amendment.scope_config_id);
    const status = data.getMaterialConfigOption(amendment.status_config_id);
    return [
      amendment.title,
      amendment.reason,
      amendment.reference_no,
      referenceType?.label,
      scope?.label,
      status?.label,
      amendment.drawing_number,
      amendment.drawing_revision,
      amendment.tower_segment,
      ...amendment.items.flatMap((item) => [
        materialItemLabel({
          tower_id: towerId,
          item_type: item.item_type,
          tower_segment: item.tower_segment,
          drawing_number: item.drawing_number,
          bolt_diameter: item.bolt_diameter,
          bolt_type: item.bolt_type,
          dn_sn: item.dn_sn,
          length: item.length,
          packer_no: item.packer_no,
          packer_mark: item.packer_mark,
          qty: item.qty,
        }),
        item.notes,
      ]),
    ].filter(Boolean).join(" ").toLowerCase().includes(q);
  });

  const effectiveCount = currentTowerAmendments.filter((amendment) =>
    Boolean(data.getMaterialConfigOption(amendment.status_config_id)?.is_effective),
  ).length;

  if (!data.amendmentSetupAvailable) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-black">Material amendment storage is not installed yet.</div>
          <div className="mt-1 text-xs leading-5">
            The rest of Materials Control continues to work, but amendments cannot be configured or applied until the material amendment migration is installed.
          </div>
          {data.amendmentSetupError && <div className="mt-2 rounded-xl bg-white/70 p-2 font-mono text-[11px]">{data.amendmentSetupError}</div>}
        </div>
      </div>
    );
  }

  if (mode === "config") {
    return (
      <div className="space-y-4">
        <div className="flex justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">Amendment Configuration</h2>
            <p className="mt-1 text-xs text-slate-500">Configure the options used by the material amendment workflow.</p>
          </div>
          <button type="button" onClick={() => setMode("register")} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">Back to Register</button>
        </div>
        <MaterialConfigPanel data={data} projectId={projectId} />
      </div>
    );
  }

  if (mode === "new") {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-950">New Material Amendment</h2>
            <p className="mt-1 text-xs text-slate-500">Record a controlled change without altering the original imported material schedule.</p>
          </div>
          <button type="button" onClick={() => setMode("register")} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">Cancel</button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-black text-slate-500">Workflow Status</label>
              <select value={statusConfigId} onChange={(event) => setStatusConfigId(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
                <option value="">Select status…</option>
                {statuses.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-black text-slate-500">Applicability Scope</label>
              <select value={scopeConfigId} onChange={(event) => setScopeConfigId(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
                <option value="">Select scope…</option>
                {scopes.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-black text-slate-500">Reference Type</label>
              <select value={referenceTypeConfigId} onChange={(event) => setReferenceTypeConfigId(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
                <option value="">No reference type</option>
                {referenceTypes.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </div>
            <EditInput label="Reference No." value={referenceNo} onChange={setReferenceNo} />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <EditInput label="Title" value={title} onChange={setTitle} />
            <EditInput label="Effective Date" value={effectiveDate} onChange={setEffectiveDate} type="text" />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {selectedScope?.behavior === "tower" && (
              <div className="rounded-xl bg-slate-50 p-3 text-xs"><div className="font-black uppercase text-slate-400">Scope Target</div><div className="mt-1 font-black text-slate-900">{getTowerDisplayLabel(data.tower)}</div></div>
            )}
            {selectedScope?.behavior === "tower_type" && (
              <div className="rounded-xl bg-slate-50 p-3 text-xs"><div className="font-black uppercase text-slate-400">Tower Type</div><div className="mt-1 font-black text-slate-900">{currentTowerType || "Not available"}</div></div>
            )}
            {(selectedScope?.behavior === "drawing" || drawingNumber) && <EditInput label="Drawing Number" value={drawingNumber} onChange={setDrawingNumber} />}
            <EditInput label="Drawing Revision" value={drawingRevision} onChange={setDrawingRevision} />
            {selectedScope?.behavior === "segment" && (
              <div>
                <label className="mb-1 block text-xs font-black text-slate-500">Tower Segment</label>
                <select value={towerSegment} onChange={(event) => setTowerSegment(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
                  <option value="">Select segment…</option>
                  {data.applicableMaterialSegments.map((segment) => <option key={segment} value={segment}>{segment}</option>)}
                </select>
              </div>
            )}
            <EditInput label="Document / SharePoint URL" value={documentUrl} onChange={setDocumentUrl} />
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-black text-slate-500">Reason / Engineering Basis</label>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" placeholder="Explain why the source schedule is being amended and what evidence supports the change…" />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-black text-slate-950">Amendment Items</h3>
              <p className="mt-1 text-xs text-slate-500">Each item uses a configured action. Existing rows stay traceable through Base Material ID.</p>
            </div>
            <button type="button" onClick={() => setDraftItems((previous) => [...previous, makeDraftAmendmentItem(defaultActionId, defaultQuantityBasisId)])} className="inline-flex items-center gap-1 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">
              <Plus size={13} /> Add Item
            </button>
          </div>

          {draftItems.map((item, index) => {
            const action = data.getMaterialConfigOption(item.action_config_id);
            const behavior = action?.behavior || "";
            const needsBase = behavior !== "add";
            const showSpec = behavior === "add" || behavior === "replace";
            const showQty = ["add", "replace", "quantity_override", "quantity_delta"].includes(behavior);

            return (
              <div key={item.key} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-black text-slate-950">Item {index + 1}</div>
                  <button type="button" onClick={() => setDraftItems((previous) => previous.filter((row) => row.key !== item.key))} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"><Trash2 size={14} /></button>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-black text-slate-500">Configured Action</label>
                    <select value={item.action_config_id} onChange={(event) => updateDraftItem(index, { action_config_id: event.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
                      <option value="">Select action…</option>
                      {actions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </div>

                  {needsBase && (
                    <div className="md:col-span-1 xl:col-span-3">
                      <label className="mb-1 block text-xs font-black text-slate-500">Existing Source Material Row</label>
                      <select value={item.base_material_id} onChange={(event) => chooseBaseMaterial(index, event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
                        <option value="">Select existing row…</option>
                        {data.applicableBolts.filter((row) => row.id).map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.tower_segment} · {materialItemLabel(row)} · Qty {row.qty}{row.drawing_number ? ` · ${row.drawing_number}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {showSpec && (
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <div>
                      <label className="mb-1 block text-xs font-black text-slate-500">Item Type</label>
                      <select value={item.item_type} onChange={(event) => updateDraftItem(index, { item_type: event.target.value as MaterialItemType })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
                        <option value="bolt">Bolt</option>
                        <option value="packer">Packer</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-black text-slate-500">Tower Segment</label>
                      <select value={item.tower_segment} onChange={(event) => updateDraftItem(index, { tower_segment: event.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
                        <option value="General">General</option>
                        {data.applicableMaterialSegments.map((segment) => <option key={segment} value={segment}>{segment}</option>)}
                      </select>
                    </div>
                    <EditInput label="Drawing" value={item.drawing_number} onChange={(value) => updateDraftItem(index, { drawing_number: value })} />
                    <EditInput label="Diameter" value={item.bolt_diameter} onChange={(value) => updateDraftItem(index, { bolt_diameter: value })} />
                    {item.item_type === "bolt" ? (
                      <>
                        <EditInput label="Bolt Type" value={item.bolt_type} onChange={(value) => updateDraftItem(index, { bolt_type: value })} />
                        <EditInput label="DN/SN" value={item.dn_sn} onChange={(value) => updateDraftItem(index, { dn_sn: value })} />
                        <EditInput label="Length" value={item.length} onChange={(value) => updateDraftItem(index, { length: value })} />
                      </>
                    ) : (
                      <>
                        <EditInput label="Packer No." value={item.packer_no} onChange={(value) => updateDraftItem(index, { packer_no: value })} />
                        <EditInput label="Packer Mark" value={item.packer_mark} onChange={(value) => updateDraftItem(index, { packer_mark: value })} />
                      </>
                    )}
                  </div>
                )}

                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {showQty && <EditInput label={behavior === "quantity_delta" ? "Quantity Delta (+/-)" : "Base Quantity"} value={item.qty} onChange={(value) => updateDraftItem(index, { qty: value })} type="number" />}
                  {(showSpec || behavior === "quantity_override" || behavior === "quantity_delta") && quantityBases.length > 0 && (
                    <div>
                      <label className="mb-1 block text-xs font-black text-slate-500">Quantity Basis</label>
                      <select value={item.quantity_basis_config_id} onChange={(event) => updateDraftItem(index, { quantity_basis_config_id: event.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
                        <option value="">Inherit source row</option>
                        {quantityBases.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </select>
                    </div>
                  )}
                  <EditInput label="Item Notes" value={item.notes} onChange={(value) => updateDraftItem(index, { notes: value })} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setMode("register")} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700">Cancel</button>
          <button type="button" disabled={saving} onClick={() => void saveAmendment()} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
            <Save size={15} /> {saving ? "Saving…" : "Save Amendment"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-950">Material Amendments</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            Preserve the imported drawing/material schedule as the source record, then apply controlled, traceable amendments on top of it. Only statuses configured to affect requirements change the Bolts & Packers list.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode("config")} className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">
            <Database size={13} /> Configuration
          </button>
          <button type="button" disabled={!setupReady} onClick={initialiseNew} className="inline-flex items-center gap-1 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:opacity-40">
            <Plus size={13} /> New Amendment
          </button>
        </div>
      </div>

      {!setupReady && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          <strong>Configuration required.</strong> Create at least one Amendment Action, Workflow Status and Applicability Scope before recording an amendment. Nothing is hard-coded to a particular RFI, redline type, workflow label or scope.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <IssueMetric label="Current Tower Amendments" value={currentTowerAmendments.length} tone="blue" />
        <IssueMetric label="Effective Now" value={effectiveCount} tone="green" />
        <IssueMetric label="Not Effective" value={Math.max(currentTowerAmendments.length - effectiveCount, 0)} tone="amber" />
        <IssueMetric label="Effective Material Rows" value={data.effectiveBolts.length} />
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reference, title, drawing, item or status…" className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm" />
      </div>

      {filteredAmendments.length === 0 ? (
        <IssueEmpty text="No material amendments match this tower and the current search." />
      ) : (
        <div className="space-y-3">
          {[...filteredAmendments].reverse().map((amendment) => {
            const scope = data.getMaterialConfigOption(amendment.scope_config_id);
            const status = data.getMaterialConfigOption(amendment.status_config_id);
            const referenceType = data.getMaterialConfigOption(amendment.reference_type_config_id);
            const reference = amendmentReferenceLabel(amendment, referenceType);

            return (
              <div key={amendment.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${status?.is_effective ? "border-emerald-200" : "border-slate-200"}`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-black text-slate-950">{reference}</div>
                      <Pill className={status?.is_effective ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
                        {status?.label || "Unconfigured status"}
                      </Pill>
                      {scope && <Pill className="border-blue-200 bg-blue-50 text-blue-700">{scope.label}</Pill>}
                    </div>
                    <div className="mt-1 font-bold text-slate-800">{amendment.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {amendment.drawing_number ? `Drawing ${amendment.drawing_number}${amendment.drawing_revision ? ` Rev ${amendment.drawing_revision}` : ""} · ` : ""}
                      {amendment.tower_segment ? `${amendment.tower_segment} · ` : ""}
                      {amendment.effective_date ? `Effective ${formatDate(amendment.effective_date)}` : "No effective date"}
                    </div>
                    {amendment.reason && <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">{amendment.reason}</div>}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <select value={amendment.status_config_id} disabled={saving} onChange={(event) => void updateStatus(amendment, event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black">
                      {statuses.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                    {amendment.document_url && (
                      <a href={amendment.document_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">
                        <ExternalLink size={13} /> Document
                      </a>
                    )}
                    <button type="button" disabled={saving} onClick={() => void deleteAmendment(amendment)} className="inline-flex items-center gap-1 rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 disabled:opacity-50">
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {amendment.items.map((item) => {
                    const action = data.getMaterialConfigOption(item.action_config_id);
                    const base = item.base_material_id ? rawMaterialById.get(item.base_material_id) : undefined;
                    const displayItem: Bolt = {
                      tower_id: towerId,
                      item_type: item.item_type,
                      tower_segment: item.tower_segment,
                      drawing_number: item.drawing_number,
                      bolt_diameter: item.bolt_diameter,
                      bolt_type: item.bolt_type,
                      dn_sn: item.dn_sn,
                      length: item.length,
                      packer_no: item.packer_no,
                      packer_mark: item.packer_mark,
                      qty: item.qty,
                    };

                    return (
                      <div key={item.id} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[170px_1fr_1fr_110px] md:items-center">
                        <div><div className="text-[9px] font-black uppercase text-slate-400">Action</div><div className="text-xs font-black text-slate-900">{action?.label || "Unconfigured action"}</div></div>
                        <div><div className="text-[9px] font-black uppercase text-slate-400">Original</div><div className="text-xs font-bold text-slate-700">{base ? `${materialItemLabel(base)} · ${base.tower_segment} · Qty ${base.qty}` : "No base row (added item)"}</div></div>
                        <div><div className="text-[9px] font-black uppercase text-slate-400">Amended / Recorded</div><div className="text-xs font-bold text-slate-700">{materialItemLabel(displayItem) || "No replacement specification"}{item.tower_segment ? ` · ${item.tower_segment}` : ""}{item.notes ? ` · ${item.notes}` : ""}</div></div>
                        <div className="text-right"><div className="text-[9px] font-black uppercase text-slate-400">Qty</div><div className="text-sm font-black text-slate-950">{item.qty}</div></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BoltRegister({ data }: { data: MaterialsData }) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState("all");
  const [itemType, setItemType] =
    useState<"all" | MaterialItemType>("all");

  const bolts = data.effectiveBolts;
  const excludedRows = Math.max(
    data.bolts.length - data.applicableBolts.length,
    0,
  );
  const appliedAmendmentCount = new Set(
    bolts.map((item) => item.amendment_id).filter(Boolean),
  ).size;

  const segments: string[] = Array.from(
    new Set<string>(
      bolts
        .map((item) => item.tower_segment)
        .filter(
          (value): value is string =>
            Boolean(value?.trim()),
        ),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const q = normaliseSearch(query);
  const filtered = bolts.filter((item) => {
    if (
      segment !== "all" &&
      materialSegmentKey(item.tower_segment) !==
        materialSegmentKey(segment)
    ) {
      return false;
    }

    if (
      itemType !== "all" &&
      item.item_type !== itemType
    ) {
      return false;
    }

    if (!q) return true;
    return materialItemSearchText(item).includes(q);
  });

  const grouped = (() => {
    const map = new Map<
      string,
      {
        key: string;
        itemType: MaterialItemType;
        label: string;
        segment: string;
        baseQty: number;
        multiplier: number;
        requiredQty: number;
        drawings: Set<string>;
        amendmentRefs: Set<string>;
        amendmentDocuments: Set<string>;
        quantityBasisBehavior: string;
      }
    >();

    filtered.forEach((item) => {
      const specificationKey =
        item.item_type === "packer"
          ? [
              "packer",
              item.bolt_diameter,
              item.packer_no,
              item.packer_mark,
            ].join("__")
          : [
              "bolt",
              item.bolt_diameter,
              item.bolt_type,
              item.dn_sn,
              item.length,
            ].join("__");

      const segmentKey = materialSegmentKey(
        item.tower_segment,
      );
      const quantityBasisBehavior = item.quantity_basis_behavior || "inherit";
      const key = `${segmentKey}__${specificationKey}__${quantityBasisBehavior}`;
      const existing = map.get(key);

      if (existing) {
        existing.baseQty += Number(item.qty || 0);
        if (item.drawing_number) {
          existing.drawings.add(item.drawing_number);
        }
        if (item.amendment_reference) existing.amendmentRefs.add(item.amendment_reference);
        if (item.amendment_document_url) existing.amendmentDocuments.add(item.amendment_document_url);
        return;
      }

      map.set(key, {
        key,
        itemType: item.item_type,
        label: materialItemLabel(item),
        segment: item.tower_segment || "General",
        baseQty: Number(item.qty || 0),
        multiplier: data.getMaterialMultiplierForItem(item),
        requiredQty: 0,
        drawings: new Set(
          item.drawing_number
            ? [item.drawing_number]
            : [],
        ),
        amendmentRefs: new Set(item.amendment_reference ? [item.amendment_reference] : []),
        amendmentDocuments: new Set(item.amendment_document_url ? [item.amendment_document_url] : []),
        quantityBasisBehavior,
      });
    });

    return Array.from(map.values())
      .map((row) => ({
        ...row,
        requiredQty:
          row.baseQty * Math.max(row.multiplier, 0),
      }))
      .sort((a, b) => {
        const segmentCompare = a.segment.localeCompare(
          b.segment,
        );
        if (segmentCompare !== 0) return segmentCompare;
        return a.label.localeCompare(b.label);
      });
  })();

  const totalQty = grouped.reduce(
    (sum, row) => sum + row.requiredQty,
    0,
  );
  const boltQty = grouped
    .filter((row) => row.itemType === "bolt")
    .reduce(
      (sum, row) => sum + row.requiredQty,
      0,
    );
  const packerQty = grouped
    .filter((row) => row.itemType === "packer")
    .reduce(
      (sum, row) => sum + row.requiredQty,
      0,
    );

  const selectedSegmentLabel =
    segment === "all" ? "All Tower Segments" : segment;
  const selectedItemTypeLabel =
    itemType === "all"
      ? "Bolts & Packers"
      : itemType === "bolt"
        ? "Bolts only"
        : "Packers only";

  function printRequirementList() {
    if (!grouped.length) {
      alert(
        "There are no bolt or packer rows in the current filter to print.",
      );
      return;
    }

    const printWindow = window.open(
      "",
      "tttracker-bolt-packer-list",
      "width=1100,height=850",
    );

    if (!printWindow) {
      alert(
        "The print window was blocked. Allow pop-ups for TTTracker and try again.",
      );
      return;
    }

    const rowsHtml = grouped
      .map((row) => {
        const basis = materialQuantityBasis(
          row.baseQty,
          row.segment,
          row.multiplier,
          data.legConfigurationDetected,
          row.quantityBasisBehavior,
        );
        const source = Array.from(row.amendmentRefs).join("; ") || "Source schedule";

        return `
          <tr>
            <td>${escapeHtml(
              row.itemType === "packer"
                ? "Packer"
                : "Bolt",
            )}</td>
            <td><strong>${escapeHtml(
              row.label || "Unspecified",
            )}</strong></td>
            <td>${escapeHtml(row.segment)}</td>
            <td>${escapeHtml(
              Array.from(row.drawings).join(", ") ||
                "—",
            )}</td>
            <td>${escapeHtml(basis)}</td>
            <td>${escapeHtml(source)}</td>
            <td class="qty">${escapeHtml(
              row.requiredQty,
            )}</td>
          </tr>
        `;
      })
      .join("");

    const legSummary =
      formatLegConfigurationSummary(
        data.towerLegConfiguration,
      );
    const searchSummary = query.trim()
      ? query.trim()
      : "None";
    const printedAt = new Date().toLocaleString(
      "en-AU",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      },
    );

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(
            getTowerDisplayLabel(data.tower),
          )} - Bolt & Packer List</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 12mm;
            }

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              color: #0f172a;
              background: #ffffff;
              font-family: Arial, Helvetica, sans-serif;
              font-size: 10px;
              line-height: 1.35;
            }

            .header {
              display: flex;
              justify-content: space-between;
              gap: 20px;
              padding-bottom: 10px;
              border-bottom: 2px solid #0f172a;
            }

            h1 {
              margin: 0;
              font-size: 20px;
              line-height: 1.1;
            }

            .subtitle {
              margin-top: 4px;
              color: #475569;
              font-size: 10px;
            }

            .meta {
              margin-top: 10px;
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 5px 16px;
            }

            .meta-row {
              display: flex;
              gap: 5px;
            }

            .meta-label {
              min-width: 95px;
              color: #64748b;
              font-weight: 700;
            }

            .leg-note {
              margin-top: 10px;
              padding: 7px 9px;
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              background: #f8fafc;
            }

            table {
              width: 100%;
              margin-top: 12px;
              border-collapse: collapse;
              page-break-inside: auto;
            }

            thead {
              display: table-header-group;
            }

            tr {
              page-break-inside: avoid;
              page-break-after: auto;
            }

            th,
            td {
              padding: 6px 7px;
              border: 1px solid #cbd5e1;
              vertical-align: top;
            }

            th {
              background: #f1f5f9;
              text-align: left;
              font-size: 9px;
              text-transform: uppercase;
              letter-spacing: .04em;
            }

            .qty {
              width: 66px;
              text-align: center;
              font-size: 12px;
              font-weight: 700;
            }

            .totals {
              margin-top: 10px;
              display: flex;
              justify-content: flex-end;
              gap: 16px;
              font-size: 10px;
              font-weight: 700;
            }

            .footer {
              margin-top: 16px;
              padding-top: 7px;
              border-top: 1px solid #cbd5e1;
              color: #64748b;
              font-size: 9px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>TTTracker - Bolt &amp; Packer List</h1>
              <div class="subtitle">
                Required materials for the current tower and active filters
              </div>
            </div>
            <div>
              <strong>${escapeHtml(
                getTowerDisplayLabel(data.tower),
              )}</strong>
            </div>
          </div>

          <div class="meta">
            <div class="meta-row">
              <span class="meta-label">Tower:</span>
              <span>${escapeHtml(
                getTowerDisplayLabel(data.tower),
              )}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Printed:</span>
              <span>${escapeHtml(printedAt)}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Tower Segment:</span>
              <span>${escapeHtml(
                selectedSegmentLabel,
              )}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Item Filter:</span>
              <span>${escapeHtml(
                selectedItemTypeLabel,
              )}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Search:</span>
              <span>${escapeHtml(searchSummary)}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Leg Configuration:</span>
              <span>${escapeHtml(
                data.legConfigurationDetected
                  ? `${legSummary} (${data.towerLegConfiguredCount}/${data.towerLegExpectedCount} legs resolved)`
                  : legSummary,
              )}</span>
            </div>
          </div>

          ${
            data.legConfigurationComplete
              ? `
                <div class="leg-note">
                  Leg-extension quantities show the source schedule quantity multiplied by the number of matching legs configured in Tower Overview.
                </div>
              `
              : data.legConfigurationDetected
                ? `
                  <div class="leg-note">
                    WARNING: Tower Overview resolves only ${escapeHtml(
                      data.towerLegConfiguredCount,
                    )}/${escapeHtml(
                      data.towerLegExpectedCount,
                    )} legs. Check the tower configuration before relying on leg-extension totals.
                  </div>
                `
                : ""
          }

          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Item</th>
                <th>Segment</th>
                <th>Drawing</th>
                <th>Basis</th>
                <th>Source / Amendment</th>
                <th>Required</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="totals">
            <span>Bolts: ${escapeHtml(
              boltQty,
            )}</span>
            <span>Packers: ${escapeHtml(
              packerQty,
            )}</span>
            <span>Total Qty: ${escapeHtml(
              totalQty,
            )}</span>
          </div>

          <div class="footer">
            TTTracker · LMZ Contracting
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();

    window.setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 150);
  }

  return (
    <div>
      <div
        className={`rounded-2xl border p-3 text-xs leading-5 ${
          data.materialApplicabilityActive
            ? "border-blue-200 bg-blue-50/50 text-blue-900"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        {data.materialApplicabilityActive ? (
          <>
            <strong>
              Automatic tower applicability is active.
            </strong>{" "}
            TTTracker is matching bolt and packer
            rows against this tower&apos;s bundle/member
            segments. Leg extensions are additionally
            cross-checked against Tower Overview. Showing{" "}
            <strong>{data.applicableBolts.length}</strong>{" "}
            of <strong>{data.bolts.length}</strong>{" "}
            imported row(s)
            {excludedRows > 0
              ? `; ${excludedRows} non-applicable row(s) are excluded`
              : ""}
            . Current requirement rows after effective amendments: {" "}
            <strong>{data.effectiveBolts.length}</strong>
            {appliedAmendmentCount > 0
              ? `; ${appliedAmendmentCount} effective amendment(s) are applied`
              : "; no effective amendments are changing the list"}
            .
            {data.applicableMaterialSegments.length >
              0 && (
              <div className="mt-2 text-[11px] text-blue-800">
                <strong>Applicable segments:</strong>{" "}
                {data.applicableMaterialSegments.join(
                  ", ",
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <strong>
              Tower segment applicability is not available.
            </strong>{" "}
            TTTracker is temporarily showing the
            imported rows already stored on this tower.
            Import the bundle/member data before replacing
            the bolt &amp; packer register.
          </>
        )}
      </div>

      <div
        className={`mt-3 rounded-2xl border p-3 text-xs leading-5 ${
          data.legConfigurationComplete
            ? "border-emerald-200 bg-emerald-50/60 text-emerald-900"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        {data.legConfigurationComplete ? (
          <>
            <strong>Tower leg configuration:</strong>{" "}
            {formatLegConfigurationSummary(
              data.towerLegConfiguration,
            )}{" "}
            <span className="font-bold">
              ({data.towerLegConfiguredCount}/
              {data.towerLegExpectedCount} legs resolved)
            </span>
            <div className="mt-1 text-[11px]">
              Leg-extension schedule quantities are kept
              as their base quantity and multiplied by the
              matching leg count. For example, a base
              quantity of 34 on a configuration used by
              four legs is shown as 34 × 4 = 136.
            </div>
          </>
        ) : data.legConfigurationDetected ? (
          <>
            <strong>
              Tower leg configuration is incomplete:
            </strong>{" "}
            {formatLegConfigurationSummary(
              data.towerLegConfiguration,
            )}. TTTracker resolved{" "}
            <strong>
              {data.towerLegConfiguredCount}/
              {data.towerLegExpectedCount}
            </strong>{" "}
            legs from Tower Overview. Leg-extension imports
            are blocked until every leg is resolved.
          </>
        ) : (
          <>
            <strong>
              Tower leg configuration was not detected.
            </strong>{" "}
            Leg-extension imports are blocked until the
            Tower Overview contains a usable leg
            configuration, so TTTracker does not guess the
            multiplier.
          </>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-[1fr_220px_240px]">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={17}
            />
            <input
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Search bolt, packer, diameter, DN/SN, length, # number, drawing or segment…"
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-4 focus:ring-slate-100"
            />
          </div>

          <select
            value={itemType}
            onChange={(event) =>
              setItemType(
                event.target.value as
                  | "all"
                  | MaterialItemType,
              )
            }
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
          >
            <option value="all">
              All item types
            </option>
            <option value="bolt">
              Bolts only
            </option>
            <option value="packer">
              Packers only
            </option>
          </select>

          <select
            value={segment}
            onChange={(event) =>
              setSegment(event.target.value)
            }
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
          >
            <option value="all">
              All tower segments
            </option>
            {segments.map((item) => {
              const multiplier =
                data.getMaterialMultiplier(item);
              const isLeg =
                data.isLegMaterialSegment(item);

              return (
                <option key={item} value={item}>
                  {isLeg &&
                  data.legConfigurationDetected
                    ? `${item} (${multiplier} ${
                        multiplier === 1
                          ? "leg"
                          : "legs"
                      })`
                    : item}
                </option>
              );
            })}
          </select>
        </div>

        <button
          type="button"
          onClick={printRequirementList}
          className="inline-flex items-center justify-center gap-1 rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-200"
        >
          <Printer size={14} /> Print List
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <BoltSummary
          label="Line Items"
          value={grouped.length}
        />
        <BoltSummary
          label="Required Qty"
          value={totalQty}
        />
        <BoltSummary
          label="Bolt Qty"
          value={boltQty}
        />
        <BoltSummary
          label="Packer Qty"
          value={packerQty}
        />
      </div>

      <div className="mt-3">
        {grouped.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
            No bolts or packers match the current
            filters.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                Required bolt &amp; packer list
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                The table below is the same list used by
                Print List. Filters are applied before
                quantities are grouped and calculated.
              </div>
            </div>

            <table className="min-w-full text-sm">
              <thead className="bg-white text-[10px] font-black uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">
                    Type
                  </th>
                  <th className="px-3 py-2 text-left">
                    Item
                  </th>
                  <th className="px-3 py-2 text-left">
                    Tower Segment
                  </th>
                  <th className="px-3 py-2 text-left">
                    Drawing
                  </th>
                  <th className="px-3 py-2 text-center">
                    Basis
                  </th>
                  <th className="px-3 py-2 text-left">
                    Source / Amendment
                  </th>
                  <th className="px-3 py-2 text-center">
                    Required
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {grouped.map((row) => (
                  <tr key={row.key}>
                    <td className="px-3 py-2.5">
                      <Pill
                        className={
                          row.itemType === "packer"
                            ? "border-violet-200 bg-violet-50 text-violet-700"
                            : "border-blue-200 bg-blue-50 text-blue-700"
                        }
                      >
                        {row.itemType === "packer"
                          ? "Packer"
                          : "Bolt"}
                      </Pill>
                    </td>

                    <td className="px-3 py-2.5 font-black text-slate-950">
                      {row.label || "Unspecified"}
                    </td>

                    <td className="px-3 py-2.5 font-bold text-slate-900">
                      {row.segment}
                    </td>

                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {Array.from(row.drawings).join(
                        ", ",
                      ) || "—"}
                    </td>

                    <td className="px-3 py-2.5 text-center text-xs font-bold text-slate-700">
                      {materialQuantityBasis(
                        row.baseQty,
                        row.segment,
                        row.multiplier,
                        data.legConfigurationDetected,
                        row.quantityBasisBehavior,
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {row.amendmentRefs.size > 0 ? (
                        <div className="space-y-1">
                          {Array.from(row.amendmentRefs).map((reference) => (
                            <div key={reference} className="font-black text-violet-700">
                              {reference}
                            </div>
                          ))}
                          {Array.from(row.amendmentDocuments).map((url) => (
                            <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-black text-blue-700">
                              <ExternalLink size={11} /> View document
                            </a>
                          ))}
                        </div>
                      ) : (
                        "Source schedule"
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-flex min-w-14 justify-center rounded-lg bg-slate-950 px-2.5 py-1 font-black text-white">
                        {row.requiredQty}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function BoltSummary({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div><div className="text-xl font-black text-slate-950">{value}</div></div>;
}


type Tab = "overview" | "search" | "bundles" | "transfers" | "issues" | "bolts" | "amendments" | "data";

const tabs: Array<{ id: Tab; label: string; icon: typeof Search }> = [
  { id: "overview", label: "Overview", icon: Boxes },
  { id: "search", label: "Search", icon: Search },
  { id: "bundles", label: "Bundles", icon: PackageCheck },
  { id: "transfers", label: "Transfers", icon: ArrowRightLeft },
  { id: "issues", label: "Issues", icon: TriangleAlert },
  { id: "bolts", label: "Bolts & Packers", icon: Wrench },
  { id: "amendments", label: "Amendments", icon: Pencil },
  { id: "data", label: "Data & Imports", icon: Database },
];

export default function MaterialsControlPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;
  const data = useMaterialsData(projectId, towerId);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [transferBundle, setTransferBundle] = useState<Bundle | null>(null);
  const [transferModalOpen, setTransferModalOpen] = useState(false);

  const missingIssues = buildMissingIssues(data);
  const openMissing = missingIssues.filter((row) => row.status === "open").length;
  const partialMissing = missingIssues.filter((row) => row.status === "partial").length;
  const missingOutstandingQty = missingIssues.reduce((sum, row) => sum + row.remainingQty, 0);
  const excessCount =
    data.excessEvents.reduce((sum, event) => sum + event.items.length, 0) +
    data.bundles.filter((bundle) => data.receivedQty(bundle) > bundle.qty_required).length;
  const completed = data.bundles.filter((bundle) => data.deriveBundleStatus(bundle) === "arrived").length;
  const inTransitTransfers = data.transfers.filter((transfer) => transfer.status === "in_transit").length;

  if (data.loading) {
    return <div className="min-h-screen bg-slate-50 p-6 text-sm text-slate-500">Loading materials control…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-2 md:p-6">
      <div className="mx-auto max-w-7xl space-y-3">
        {data.tower && <TowerHeader projectId={projectId} tower={data.tower} latestDate={data.latestDate} />}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4 md:p-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white"><Boxes size={19} /></div>
                <div>
                  <h1 className="text-xl font-black tracking-tight text-slate-950 md:text-2xl">Materials Control</h1>
                  <p className="mt-0.5 max-w-3xl text-sm text-slate-500">
                    Website management workspace for bundle control, tower transfers, missing-material close-out, bolts, packers, controlled amendments and master data.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {data.saving && <span className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">Saving…</span>}
                <button type="button" onClick={() => void data.refresh()} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
                  <RefreshCw size={14} /> Refresh</button>
                <Link href={`/project/${projectId}/tower/${towerId}/dockets`} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-200">
                  <ClipboardList size={14} /> Daily Dockets
                </Link>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
              <MainSummary label="Bundles" value={data.bundles.length} />
              <MainSummary label="Complete" value={completed} tone="green" />
              <MainSummary label="Members" value={data.members.length} />
              <MainSummary label="Missing Open" value={openMissing} tone="red" />
              <MainSummary label="Part Delivered" value={partialMissing} tone="amber" />
              <MainSummary label="Missing Qty Left" value={missingOutstandingQty} tone="red" />
              <MainSummary label="Excess" value={excessCount} tone="blue" />
              <MainSummary label="Current Bolt / Packer Rows" value={data.effectiveBolts.length} />
            </div>
          </div>

          <div className="border-b border-slate-200 bg-slate-50 px-2 py-2 md:px-4">
            <div className="flex gap-1 overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                const count =
                  tab.id === "issues"
                    ? openMissing + partialMissing
                    : tab.id === "transfers"
                      ? inTransitTransfers
                      : tab.id === "amendments"
                        ? data.materialAmendments.length
                        : null;
                return (
                  <button
                    type="button"
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black transition ${
                      active ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-950"
                    }`}
                  >
                    <Icon size={15} />
                    {tab.label}
                    {count !== null && count > 0 && (
                      <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-black ${active ? "bg-white/15 text-white" : "bg-rose-100 text-rose-700"}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3 md:p-5">
            {activeTab === "overview" && (
              <OverviewWorkspace
                data={data}
                projectId={projectId}
                towerId={towerId}
                onOpenIssues={() => setActiveTab("issues")}
                onOpenBundles={() => setActiveTab("bundles")}
                onOpenTransfers={() => setActiveTab("transfers")}
                onOpenData={() => setActiveTab("data")}
              />
            )}
            {activeTab === "search" && <MaterialsSearch data={data} />}
            {activeTab === "bundles" && (
              <BundleControl
                data={data}
                onTransfer={(bundle) => {
                  setTransferBundle(bundle);
                  setTransferModalOpen(true);
                }}
              />
            )}
            {activeTab === "transfers" && (
              <TransfersWorkspace
                data={data}
                towerId={towerId}
                onNewTransfer={(bundle) => {
                  setTransferBundle(bundle || null);
                  setTransferModalOpen(true);
                }}
              />
            )}
            {activeTab === "issues" && <IssuesWorkspace data={data} projectId={projectId} towerId={towerId} />}
            {activeTab === "bolts" && <BoltRegister data={data} />}
            {activeTab === "amendments" && <AmendmentsWorkspace data={data} projectId={projectId} towerId={towerId} />}
            {activeTab === "data" && <DataImportsWorkspace data={data} towerId={towerId} />}
          </div>
        </div>
      </div>

      {transferModalOpen && (
        <TransferBundleModal
          data={data}
          towerId={towerId}
          initialBundle={transferBundle}
          onClose={() => {
            setTransferModalOpen(false);
            setTransferBundle(null);
          }}
        />
      )}
    </div>
  );
}

function MainSummary({ label, value, tone = "slate" }: { label: string; value: string | number; tone?: "slate" | "green" | "amber" | "red" | "blue" }) {
  const styles = {
    slate: "border-slate-200 bg-slate-50 text-slate-950",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-rose-200 bg-rose-50 text-rose-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
  };
  return <div className={`rounded-xl border px-3 py-2.5 ${styles[tone]}`}><div className="text-[9px] font-black uppercase tracking-wide opacity-50">{label}</div><div className="mt-0.5 text-xl font-black">{value}</div></div>;
}