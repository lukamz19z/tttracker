import { jsPDF } from "jspdf";
import {
  calculateLabourTotals,
  calculateProgressTotals,
  type DelayCalculationRow,
  type LabourCalculationRow,
  type LegacyProgressCalculationRow,
  type SectionV2CalculationRow,
} from "@/lib/dockets/calculations";

type Row = Record<string, unknown>;

type MaterialEvent = Row & {
  transfer_id?: string | null;
  tower_material_event_items?: Row[] | null;
  tower_material_event_people?: Row[] | null;
  tower_material_event_plant?: Row[] | null;
};

export type DailyDocketClientContentKey =
  | "daily_site_summary"
  | "rfi_references"
  | "progress"
  | "workforce"
  | "raw_manhours"
  | "plant"
  | "mobilisation"
  | "travel"
  | "delays"
  | "missing_materials"
  | "received_materials"
  | "bundle_transfers"
  | "safety";

export type DailyDocketBundleTransfer = {
  id: string;
  transfer_no?: number | null;
  source_tower_id: string;
  destination_tower_id: string;
  source_bundle_id?: string | null;
  destination_bundle_id?: string | null;
  bundle_no: string;
  bundle_section?: string | null;
  quantity: number;
  status?: string | null;
  transferred_at?: string | null;
  received_at?: string | null;
  source_docket_id?: string | null;
  destination_docket_id?: string | null;
  notes?: string | null;
};

export type DailyDocketPdfData = {
  project: Row;
  tower: Row;
  docket: Row;
  labour: Row[];
  plant: Row[];
  delays: Row[];
  progress: Row[];
  towers?: Row[];
  hourAllocations?: Row[];
  materialEvents: MaterialEvent[];
  materialHistory?: MaterialEvent[];
  bundleTransfers?: DailyDocketBundleTransfer[];
  transferEvents?: MaterialEvent[];
  branding?: {
    logoDataUrl?: string | null;
    companyName?: string | null;
    abn?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    suburb?: string | null;
    state?: string | null;
    postcode?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
  };
  clientContentKeys?: DailyDocketClientContentKey[] | null;
};

const SECTION_ORDER = [
  "LE", "BE", "CB", "BSS", "MSS", "TSS", "BX_ARMS", "MX_ARMS", "TX_ARMS", "EP",
] as const;

const C = {
  navy: [15, 23, 42] as const,
  slate: [71, 85, 105] as const,
  muted: [100, 116, 139] as const,
  border: [203, 213, 225] as const,
  pale: [248, 250, 252] as const,
  section: [241, 245, 249] as const,
  blue: [30, 64, 175] as const,
  bluePale: [239, 246, 255] as const,
  green: [4, 120, 87] as const,
  greenPale: [236, 253, 245] as const,
  amber: [180, 83, 9] as const,
  amberPale: [255, 251, 235] as const,
  red: [185, 28, 28] as const,
  redPale: [254, 242, 242] as const,
  white: [255, 255, 255] as const,
};

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}
function number(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function clampPercent(value: unknown) {
  return Math.max(0, Math.min(100, number(value)));
}
function formatDate(value: unknown) {
  const raw = text(value);
  if (!raw) return "—";
  const [y, m, d] = raw.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : raw;
}
function formatDateTime(value: unknown) {
  const raw = text(value);
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}
function formatHours(value: unknown) {
  return `${number(value).toFixed(2)} h`;
}
function durationHours(start: unknown, finish: unknown) {
  const a = Date.parse(text(start));
  const b = Date.parse(text(finish));
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? (b - a) / 3_600_000 : null;
}
function titleCase(value: unknown) {
  return text(value).replace(/_/g, " ").trim().replace(/\b\w/g, c => c.toUpperCase());
}
function sectionCode(row: Row) {
  return text(row.section_code).trim().toUpperCase();
}
function sectionLabel(row: Row) {
  return text(row.section_label).trim() || sectionCode(row).replaceAll("_", " ") || "Section";
}
function progressRowsForTower(data: DailyDocketPdfData, towerId: string) {
  const primaryTowerId = text(data.docket.tower_id);
  return data.progress.filter((row) => {
    const rowTowerId = text(row.tower_id);
    return rowTowerId ? rowTowerId === towerId : towerId === primaryTowerId;
  });
}
function progressModelForRows(data: DailyDocketPdfData, rows: Row[]) {
  if (rows.some(row => text(row.progress_model).trim().toLowerCase() === "section_v2")) {
    return "section_v2" as const;
  }
  if (
    towerIdIsPrimary(data, rows) &&
    text(data.docket.progress_model).trim().toLowerCase() === "section_v2"
  ) {
    return "section_v2" as const;
  }
  return rows.some(
    row => Boolean(sectionCode(row)) &&
      (row.assembly_today !== undefined || row.erection_today !== undefined),
  )
    ? ("section_v2" as const)
    : ("legacy" as const);
}
function towerIdIsPrimary(data: DailyDocketPdfData, rows: Row[]) {
  const primaryTowerId = text(data.docket.tower_id);
  return rows.some(row => !text(row.tower_id) || text(row.tower_id) === primaryTowerId);
}
function hasBodyExtensionForRows(model: "legacy" | "section_v2", rows: Row[]) {
  return model !== "section_v2" || rows.some(row => sectionCode(row) === "BE");
}
function applicableV2RowsForTower(data: DailyDocketPdfData, towerId: string) {
  const rows = progressRowsForTower(data, towerId);
  const model = progressModelForRows(data, rows);
  const includeBe = hasBodyExtensionForRows(model, rows);
  const byCode = new Map<string, Row>();
  for (const row of rows) {
    const code = sectionCode(row);
    if (code) byCode.set(code, row);
  }
  return SECTION_ORDER.filter(code => includeBe || code !== "BE").map(code => {
    const row = byCode.get(code) ?? {};
    return {
      ...row,
      section_code: code,
      section_label: text(row.section_label).trim() || code.replaceAll("_", " "),
      assembly_today: row.assembly_today !== undefined ? row.assembly_today : row.assembled_qty,
      erection_today: row.erection_today !== undefined ? row.erection_today : row.erected_qty,
    };
  });
}
function overallProgressForTower(data: DailyDocketPdfData, towerId: string) {
  const rows = progressRowsForTower(data, towerId);
  const model = progressModelForRows(data, rows);
  return calculateProgressTotals({
    progressModel: model,
    sectionV2Rows: rows.map(row => ({
      section_code: sectionCode(row),
      section_label: sectionLabel(row),
      assembly_today: row.assembly_today !== undefined ? row.assembly_today : row.assembled_qty,
      erection_today: row.erection_today !== undefined ? row.erection_today : row.erected_qty,
      assembly_weight: row.assembly_weight,
      erection_weight: row.erection_weight,
    })) as SectionV2CalculationRow[],
    legacyRows: rows.map(row => ({
      section_label: sectionLabel(row),
      assembled_qty: row.assembled_qty,
      erected_qty: row.erected_qty,
    })) as LegacyProgressCalculationRow[],
    hasBodyExtension: hasBodyExtensionForRows(model, rows),
  });
}
function allocationManhours(row: Row) {
  const workers = Array.isArray(row.worker_names) ? row.worker_names.length : 0;
  return number(row.hours) * Math.max(workers, 1);
}
function productionAllocations(data: DailyDocketPdfData) {
  return (data.hourAllocations || []).filter(
    row => text(row.allocation_type).trim().toLowerCase() === "production",
  );
}
function revisionAllocations(data: DailyDocketPdfData) {
  return (data.hourAllocations || []).filter(row => {
    const type = text(row.allocation_type).trim().toLowerCase();
    return !type || type === "revision";
  });
}
function towerDisplayName(data: DailyDocketPdfData, towerId: string) {
  if (!towerId) return "Tower";
  if (towerId === text(data.tower.id)) return towerName(data);
  const row = (data.towers || []).find(item => text(item.id) === towerId);
  return text(row?.name).trim() || towerId;
}
function workedTowerIds(data: DailyDocketPdfData) {
  const primary = text(data.docket.tower_id);
  const ids = new Set<string>();
  if (primary) ids.add(primary);
  productionAllocations(data).forEach(row => {
    const id = text(row.target_tower_id);
    if (id) ids.add(id);
  });
  data.progress.forEach(row => {
    const id = text(row.tower_id);
    if (id) ids.add(id);
  });
  return Array.from(ids);
}
type MissingIssueSnapshot = {
  issueKey: string;
  originalQty: number;
  deliveredQty: number;
  remainingQty: number;
  status: "Open" | "Partially Delivered" | "Resolved";
};
function missingIssueSnapshots(data: DailyDocketPdfData) {
  const history = data.materialHistory?.length ? data.materialHistory : data.materialEvents;
  const receipts = new Map<string, number>();
  history
    .filter(event => text(event.event_type).trim().toLowerCase() === "found_received")
    .forEach(event => {
      (event.tower_material_event_items || []).forEach(item => {
        const key = text(item.source_issue_key).trim();
        if (!key) return;
        receipts.set(key, (receipts.get(key) || 0) + number(item.quantity));
      });
    });

  const map = new Map<string, MissingIssueSnapshot>();
  history
    .filter(event => text(event.event_type).trim().toLowerCase() === "missing")
    .forEach(event => {
      (event.tower_material_event_items || []).forEach(item => {
        const key = text(item.issue_key).trim();
        if (!key) return;
        const originalQty = Math.max(number(item.quantity), 0);
        const deliveredQty = Math.max(receipts.get(key) || 0, 0);
        const remainingQty = Math.max(originalQty - deliveredQty, 0);
        map.set(key, {
          issueKey: key,
          originalQty,
          deliveredQty,
          remainingQty,
          status:
            remainingQty <= 0
              ? "Resolved"
              : deliveredQty > 0
                ? "Partially Delivered"
                : "Open",
        });
      });
    });
  return map;
}
function materialReference(item: Row) {
  const reference =
    text(item.item_reference) ||
    text(item.part_number) ||
    text(item.bolt_size) ||
    text(item.bundle_reference) ||
    text(item.bundle_no) ||
    "—";
  const bundleNo = text(item.bundle_no).trim();
  const bundleSection = text(item.bundle_section).trim();
  if (!bundleNo) return reference;
  const bundle = `Bundle ${bundleNo}${bundleSection ? ` · ${bundleSection}` : ""}`;
  return reference === bundleNo || reference === "—" ? bundle : `${reference} · ${bundle}`;
}
const CLIENT_CONTENT_KEYS: readonly DailyDocketClientContentKey[] = [
  "daily_site_summary",
  "rfi_references",
  "progress",
  "workforce",
  "raw_manhours",
  "plant",
  "mobilisation",
  "travel",
  "delays",
  "missing_materials",
  "received_materials",
  "bundle_transfers",
  "safety",
] as const;

type ClientContentKey = DailyDocketClientContentKey;

function clientContentSet(data: DailyDocketPdfData) {
  const supplied = Array.isArray(data.clientContentKeys)
    ? data.clientContentKeys
        .map(value => text(value).trim().toLowerCase())
        .filter((value): value is ClientContentKey =>
          (CLIENT_CONTENT_KEYS as readonly string[]).includes(value),
        )
    : [];

  return new Set<ClientContentKey>(
    supplied.length > 0 ? supplied : CLIENT_CONTENT_KEYS,
  );
}

function isMissingMaterialEvent(event: MaterialEvent) {
  const type = text(event.event_type).trim().toLowerCase();
  return type.includes("missing") || type.includes("short");
}

function isReceivedMaterialEvent(event: MaterialEvent) {
  const type = text(event.event_type).trim().toLowerCase();
  return (
    type.includes("received") ||
    type.includes("found") ||
    type.includes("deliver") ||
    type.includes("transfer")
  );
}

function selectedMaterialEvents(
  data: DailyDocketPdfData,
  visible: Set<ClientContentKey>,
) {
  const includeMissing = visible.has("missing_materials");
  const includeReceived = visible.has("received_materials");
  const nonTransferEvents = data.materialEvents.filter(
    event => !text(event.transfer_id).trim(),
  );

  if (includeMissing && includeReceived) {
    return nonTransferEvents;
  }

  if (includeMissing) {
    return nonTransferEvents.filter(isMissingMaterialEvent);
  }

  if (includeReceived) {
    return nonTransferEvents.filter(isReceivedMaterialEvent);
  }

  return [];
}

type TransferReplacementSnapshot = {
  originalQty: number;
  deliveredQty: number;
  remainingQty: number;
  status: "Outstanding" | "Partially Replaced" | "Replaced";
};

function transferReplacementSnapshots(data: DailyDocketPdfData) {
  const events = data.transferEvents || [];
  const missingByTransfer = new Map<
    string,
    { issueKey: string; quantity: number }
  >();
  const receiptsByIssue = new Map<string, number>();

  events.forEach(event => {
    const transferId = text(event.transfer_id).trim();
    if (!transferId) return;

    if (text(event.event_type).trim().toLowerCase() === "missing") {
      (event.tower_material_event_items || []).forEach(item => {
        const issueKey = text(item.issue_key).trim();
        if (!issueKey) return;

        missingByTransfer.set(transferId, {
          issueKey,
          quantity: Math.max(number(item.quantity), 0),
        });
      });
    }

    if (
      text(event.event_type).trim().toLowerCase() === "found_received"
    ) {
      (event.tower_material_event_items || []).forEach(item => {
        const sourceIssueKey = text(item.source_issue_key).trim();
        if (!sourceIssueKey) return;

        receiptsByIssue.set(
          sourceIssueKey,
          (receiptsByIssue.get(sourceIssueKey) || 0) +
            Math.max(number(item.quantity), 0),
        );
      });
    }
  });

  const snapshots = new Map<string, TransferReplacementSnapshot>();

  missingByTransfer.forEach((missing, transferId) => {
    const deliveredQty = Math.max(
      receiptsByIssue.get(missing.issueKey) || 0,
      0,
    );
    const remainingQty = Math.max(
      missing.quantity - deliveredQty,
      0,
    );

    snapshots.set(transferId, {
      originalQty: missing.quantity,
      deliveredQty,
      remainingQty,
      status:
        remainingQty <= 0
          ? "Replaced"
          : deliveredQty > 0
            ? "Partially Replaced"
            : "Outstanding",
    });
  });

  return snapshots;
}

function plantDelayHours(
  plantRow: Row,
  delays: Row[],
) {
  const names = new Set(
    [
      text(plantRow.plant_name),
      text(plantRow.asset_number),
      text(plantRow.asset_id),
    ]
      .map(value => value.trim().toLowerCase())
      .filter(Boolean),
  );

  if (!names.size) return 0;

  return delays.reduce((sum, delay) => {
    if (
      text(delay.delay_applies_mode).trim().toLowerCase() !==
      "labour_and_plant"
    ) {
      return sum;
    }

    const selected = Array.isArray(delay.plant_names)
      ? delay.plant_names.some(name =>
          names.has(text(name).trim().toLowerCase()),
        )
      : false;

    return selected ? sum + number(delay.delay_hours) : sum;
  }, 0);
}

function formatBusinessAddress(data: DailyDocketPdfData) {
  const branding = data.branding;
  const lineOne = [branding?.addressLine1, branding?.addressLine2]
    .map(value => text(value).trim())
    .filter(Boolean)
    .join(", ");
  const lineTwo = [
    branding?.suburb,
    branding?.state,
    branding?.postcode,
  ]
    .map(value => text(value).trim())
    .filter(Boolean)
    .join(" ");

  return [lineOne, lineTwo].filter(Boolean);
}

function documentState(data: DailyDocketPdfData): "DRAFT" | "FINAL" {
  const status = text(data.docket.approval_status).toLowerCase();
  return status === "final" || status === "legacy_final" || Boolean(text(data.docket.client_approved_at))
    ? "FINAL" : "DRAFT";
}
function revisionNumber(data: DailyDocketPdfData) {
  return Math.max(0, Math.round(number(data.docket.approval_revision)));
}
function revisionLabel(data: DailyDocketPdfData) {
  return `R${String(revisionNumber(data)).padStart(2, "0")}`;
}
function parseMobilisation(data: DailyDocketPdfData) {
  const comments = text(data.docket.delays_comments);
  const line = comments.split(/\r?\n/).find(entry => entry.startsWith("MOBILISATION|"));
  const values: Record<string, string> = {};
  if (line) {
    for (const piece of line.split("|").slice(1)) {
      const i = piece.indexOf("=");
      if (i >= 0) values[piece.slice(0, i)] = piece.slice(i + 1);
    }
  }
  const docketHours = number(data.docket.mobilisation_hours);
  const parsedMinutes = number(values.minutes);
  const parsedHours = number(values.hours);
  const labourHasMob = data.labour.some(row => number(row.mobilisation_hours) > 0);
  const included = Boolean(line) || docketHours > 0 || labourHasMob || Boolean(text(data.docket.mobilisation_notes).trim());
  const hours = parsedHours > 0 ? parsedHours : parsedMinutes > 0 ? parsedMinutes / 60 : docketHours;
  return {
    included, hours,
    from: values.from || "", to: values.to || "", status: values.status || "",
    workers: values.workers ? values.workers.split(",").map(v => v.trim()).filter(Boolean) : [],
    notes: values.notes || text(data.docket.mobilisation_notes),
  };
}
function generalSiteComments(value: unknown) {
  return text(value).split(/\r?\n/).filter(line => !line.startsWith("MOBILISATION|")).join("\n").trim();
}
function isPngDataUrl(value: unknown) {
  return text(value).startsWith("data:image/png;base64,");
}
function towerName(data: DailyDocketPdfData) {
  return text(data.tower.name).trim() || "Tower";
}

export function generateDailyDocketPdf(data: DailyDocketPdfData): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 13;
  const contentWidth = pageWidth - margin * 2;
  const footerTop = 283;
  const state = documentState(data);
  const rev = revisionLabel(data);
  const visible = clientContentSet(data);
  const primaryTowerId = text(data.docket.tower_id);
  const workedTowers = workedTowerIds(data);
  const missingSnapshots = missingIssueSnapshots(data);
  const mobilisationForCalc = parseMobilisation(data);
  const labourTotals = calculateLabourTotals(
    data.labour as LabourCalculationRow[],
    data.delays as DelayCalculationRow[],
    {
      enabled: mobilisationForCalc.included,
      durationMinutes: mobilisationForCalc.hours * 60,
      workerNames: mobilisationForCalc.workers,
    },
  );
  const revisionMh = revisionAllocations(data).reduce(
    (sum, row) => sum + allocationManhours(row),
    0,
  );
  const materialEvents = selectedMaterialEvents(data, visible);
  const bundleTransfers = data.bundleTransfers || [];
  const transferSnapshots = transferReplacementSnapshots(data);
  const projectName = [text(data.project.project_number), text(data.project.name)].filter(Boolean).join(" - ");
  const tower = towerName(data);
  let y = 40;
  let sectionIndex = 0;

  function setText(rgb: readonly [number, number, number]) {
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  }
  function setFill(rgb: readonly [number, number, number]) {
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  }
  function setDraw(rgb: readonly [number, number, number]) {
    doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  }
  function drawHeader() {
    setFill(C.white);
    doc.rect(0, 0, pageWidth, 35, "F");

    const logo = data.branding?.logoDataUrl;
    if (logo && logo.startsWith("data:image/")) {
      try {
        const format = logo.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
        doc.addImage(logo, format, margin, 6.5, 24, 14, undefined, "FAST");
      } catch {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        setText(C.navy);
        doc.text(
          text(data.branding?.companyName).trim() || "Company",
          margin,
          15.5,
        );
      }
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      setText(C.navy);
      doc.text(
        text(data.branding?.companyName).trim() || "Company",
        margin,
        15.5,
      );
    }

    const companyName = text(data.branding?.companyName).trim() || "Company";
    const businessAddress = formatBusinessAddress(data);
    const businessDetails = [
      text(data.branding?.abn).trim() ? `ABN ${text(data.branding?.abn).trim()}` : "",
      ...businessAddress,
      [text(data.branding?.phone).trim(), text(data.branding?.email).trim()]
        .filter(Boolean)
        .join("  •  "),
      text(data.branding?.website).trim(),
    ].filter(Boolean);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    setText(C.navy);
    doc.text("DAILY DOCKET", 43, 11.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.9);
    setText(C.slate);
    doc.text(projectName || "Project", 43, 17);
    doc.text(`${tower}  •  ${formatDate(data.docket.docket_date)}`, 43, 22);

    if (businessDetails.length) {
      doc.setFontSize(6.4);
      setText(C.muted);
      const businessLine = `${companyName}  •  ${businessDetails.join("  •  ")}`;
      const wrapped = doc.splitTextToSize(businessLine, 118) as string[];
      doc.text(wrapped.slice(0, 2), 43, 26.5);
    }

    const statusColor = state === "FINAL" ? C.green : C.amber;
    const statusFill = state === "FINAL" ? C.greenPale : C.amberPale;
    setFill(statusFill);
    doc.roundedRect(165, 8, 32, 14, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setText(statusColor);
    doc.text(state, 181, 13, { align: "center" });
    doc.setFontSize(10);
    doc.text(rev, 181, 19, { align: "center" });

    setDraw(C.border);
    doc.line(margin, 33, pageWidth - margin, 33);
  }

  function newPage() {
    doc.addPage();
    drawHeader();
    y = 40;
  }
  function ensure(height: number) {
    if (y + height > footerTop - 4) newPage();
  }
  function section(title: string) {
    sectionIndex += 1;
    const numberLabel = String(sectionIndex).padStart(2, "0");
    ensure(12);
    setFill(C.navy); doc.roundedRect(margin, y, contentWidth, 8, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); setText(C.white);
    doc.text(`${numberLabel}  ${title.toUpperCase()}`, margin + 3, y + 5.4);
    y += 11;
  }
  function table(headers: string[], rows: string[][], widths: number[], opts?: { compact?: boolean; headerFill?: readonly [number, number, number] }) {
    const fontSize = opts?.compact ? 7.2 : 7.8;
    const padX = 2;
    const padY = opts?.compact ? 2.1 : 2.5;
    const lineHeight = opts?.compact ? 3.1 : 3.4;

    const drawRow = (cells: string[], header: boolean) => {
      const wrapped = cells.map((cell, i) => doc.splitTextToSize(cell || "—", widths[i] - padX * 2) as string[]);
      const lines = Math.max(1, ...wrapped.map(v => v.length));
      const h = Math.max(header ? 7 : 6, lines * lineHeight + padY * 2);
      ensure(h + 1);
      let x = margin;
      for (let i = 0; i < cells.length; i++) {
        setFill(header ? (opts?.headerFill ?? C.section) : C.white);
        setDraw(C.border);
        doc.rect(x, y, widths[i], h, "FD");
        doc.setFont("helvetica", header ? "bold" : "normal");
        doc.setFontSize(fontSize);
        setText(header ? C.navy : C.slate);
        doc.text(wrapped[i], x + padX, y + padY + lineHeight - 0.7);
        x += widths[i];
      }
      y += h;
    };
    drawRow(headers, true);
    for (const row of rows) drawRow(row, false);
    y += 3;
  }
  function infoGrid(items: Array<[string, string]>) {
    const colW = contentWidth / 2;
    for (let i = 0; i < items.length; i += 2) {
      ensure(12);
      for (let j = 0; j < 2; j++) {
        const item = items[i + j];
        if (!item) continue;
        const x = margin + j * colW;
        setFill(C.pale); setDraw(C.border); doc.rect(x, y, colW, 11, "FD");
        doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); setText(C.muted);
        doc.text(item[0].toUpperCase(), x + 2.5, y + 4);
        doc.setFont("helvetica", "bold"); doc.setFontSize(8.2); setText(C.navy);
        const lines = doc.splitTextToSize(item[1] || "—", colW - 5) as string[];
        doc.text(lines.slice(0, 1), x + 2.5, y + 8.5);
      }
      y += 11;
    }
    y += 3;
  }
  function callout(label: string, value: string, tone: "blue" | "green" | "amber" | "red" = "blue") {
    ensure(15);
    const fill = tone === "green" ? C.greenPale : tone === "amber" ? C.amberPale : tone === "red" ? C.redPale : C.bluePale;
    const color = tone === "green" ? C.green : tone === "amber" ? C.amber : tone === "red" ? C.red : C.blue;
    setFill(fill); setDraw(color); doc.roundedRect(margin, y, contentWidth, 12, 1.5, 1.5, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); setText(color); doc.text(label.toUpperCase(), margin + 3, y + 4);
    doc.setFontSize(9); setText(C.navy); doc.text(value, margin + 3, y + 9);
    y += 15;
  }
  function paragraph(value: string) {
    if (!value) return;
    const lines = doc.splitTextToSize(value, contentWidth - 5) as string[];
    ensure(lines.length * 4 + 5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); setText(C.slate);
    doc.text(lines, margin + 2.5, y + 3);
    y += lines.length * 4 + 4;
  }
  function signatureCard(title: string, name: unknown, email: unknown, approvedAt: unknown, signature: unknown) {
    ensure(35);
    const h = 31;
    setFill(C.pale); setDraw(C.border); doc.roundedRect(margin, y, contentWidth, h, 1.5, 1.5, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); setText(C.navy);
    doc.text(title.toUpperCase(), margin + 3, y + 5);
    setFill(C.white); doc.rect(margin + 3, y + 8, 54, 19, "F");
    if (isPngDataUrl(signature)) {
      try { doc.addImage(text(signature), "PNG", margin + 5, y + 9, 50, 16, undefined, "FAST"); }
      catch { doc.setFont("helvetica", "italic"); doc.setFontSize(7); setText(C.muted); doc.text("Signature unavailable", margin + 6, y + 18); }
    } else {
      doc.setFont("helvetica", "italic"); doc.setFontSize(7); setText(C.muted); doc.text("No signature recorded", margin + 6, y + 18);
    }
    const dx = margin + 64;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); setText(C.navy); doc.text(text(name) || "—", dx, y + 12);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.3); setText(C.slate);
    if (text(email)) doc.text(text(email), dx, y + 18);
    doc.text(`Approved: ${formatDateTime(approvedAt)}`, dx, y + 24);
    y += h + 4;
  }

  drawHeader();

  section("Docket Details");
  infoGrid([
    ["Crew", text(data.docket.crew) || "—"],
    ["Leading Hand", text(data.docket.leading_hand) || "—"],
    ["Weather", text(data.docket.weather) || "—"],
    ["Primary Tower", towerDisplayName(data, primaryTowerId)],
    ["Towers Worked", workedTowers.map(id => towerDisplayName(data, id)).join(", ") || tower],
    ["BC Representative", text(data.docket.bc_rep_name) || "—"],
    ["Document Status", `${state} · ${rev}`],
    ["Client Representative", text(data.docket.client_rep_name) || (state === "DRAFT" ? "Pending approval" : "—")],
  ]);

  const dailySummary = text(data.docket.daily_site_summary).trim();
  const rfiReferences = Array.isArray(data.docket.rfi_references)
    ? data.docket.rfi_references.map(value => text(value).trim()).filter(Boolean)
    : [];

  const showDailySummary =
    visible.has("daily_site_summary") && Boolean(dailySummary);
  const showRfiReferences =
    visible.has("rfi_references") && rfiReferences.length > 0;

  if (showDailySummary || showRfiReferences) {
    section(
      showDailySummary && showRfiReferences
        ? "Daily Site Summary & References"
        : showDailySummary
          ? "Daily Site Summary"
          : "RFI References",
    );

    if (showDailySummary) {
      paragraph(dailySummary);
    }

    if (showRfiReferences) {
      callout("RFI References", rfiReferences.join(", "), "blue");
    }
  }

  if (visible.has("progress")) {
    section("Progress");

    for (const workedTowerId of workedTowers) {
      const rows = progressRowsForTower(data, workedTowerId);
      const allocation = productionAllocations(data).find(
        row => text(row.target_tower_id) === workedTowerId,
      );
      const activity = titleCase(allocation?.activity);
      const note = text(allocation?.reason).trim();
      const heading = [
        towerDisplayName(data, workedTowerId),
        activity && activity !== "—" ? activity : "",
      ].filter(Boolean).join(" · ");

      callout(
        workedTowerId === primaryTowerId ? "Primary Workfront" : "Additional Workfront",
        heading || towerDisplayName(data, workedTowerId),
        "blue",
      );

      if (note) paragraph(`Work notes: ${note}`);

      if (!rows.length) {
        paragraph("No progress change rows were recorded for this workfront.");
        continue;
      }

      const model = progressModelForRows(data, rows);
      if (model === "section_v2") {
        const displayRows = applicableV2RowsForTower(data, workedTowerId).map(row => [
          sectionLabel(row),
          `${clampPercent(row.assembly_today).toFixed(0)}%`,
          `${clampPercent(row.erection_today).toFixed(0)}%`,
        ]);
        table(
          ["Section", "Assembly Today", "Erection Today"],
          displayRows,
          [82, 51, 51],
          { compact: true },
        );
      } else {
        table(
          ["Section", "Assembled", "Erected"],
          rows.map(row => [
            sectionLabel(row),
            text(row.assembled_qty) || "0",
            text(row.erected_qty) || "0",
          ]),
          [92, 46, 46],
          { compact: true },
        );
      }

      const calculated = overallProgressForTower(data, workedTowerId);
      table(
        ["Overall Assembly", "Overall Erection", "Total Progress"],
        [[
          `${calculated.assemblyPercent.toFixed(1)}%`,
          `${calculated.erectionPercent.toFixed(1)}%`,
          `${calculated.totalProgressPercent.toFixed(1)}%`,
        ]],
        [61.3, 61.3, 61.4],
        { headerFill: C.bluePale },
      );
    }
  }

  if (visible.has("workforce") || visible.has("raw_manhours")) {
    section("Workforce");

    if (visible.has("workforce")) {
      table(
        ["Personnel", "Time In", "Time Out", "Raw", "Prestart"],
        data.labour.length
          ? data.labour.map(row => [
              text(row.worker_name) || "Worker",
              text(row.time_in) || "—",
              text(row.time_out) || "—",
              formatHours(row.total_hours),
              `${number(row.prestart_minutes).toFixed(0)} min`,
            ])
          : [["No labour recorded", "—", "—", "—", "—"]],
        [76, 28, 28, 27, 25],
        { compact: true },
      );
    }

    if (visible.has("raw_manhours")) {
      callout(
        "Total raw man-hours",
        formatHours(data.docket.raw_manhours),
        "blue",
      );
    }

    if (visible.has("workforce") && labourTotals.prestartManhours > 0) {
      infoGrid([
        ["Prestart MH", formatHours(labourTotals.prestartManhours)],
        ["Lunch MH", formatHours(labourTotals.lunchManhours)],
        ["Travel MH", formatHours(labourTotals.travelManhours)],
        ["Mobilisation MH", formatHours(labourTotals.mobilisationManhours)],
      ]);
    }
  }

  if (visible.has("mobilisation")) {
    const mobilisation = parseMobilisation(data);
    section("Mobilisation / Demobilisation");

    if (!mobilisation.included) {
      callout("Mobilising", "No", "blue");
    } else {
      infoGrid([
        ["Mobilising", "Yes"],
        ["Duration", formatHours(mobilisation.hours)],
        ["From", mobilisation.from || "—"],
        ["To", mobilisation.to || "—"],
        ["Stage", titleCase(mobilisation.status) || "—"],
        [
          "Personnel",
          mobilisation.workers.length
            ? mobilisation.workers.join(", ")
            : "Crew / as recorded",
        ],
      ]);

      if (mobilisation.notes) {
        paragraph(`Notes: ${mobilisation.notes}`);
      }
    }
  }

  if (visible.has("travel")) {
    section("Travel");

    const travelHours = number(data.docket.travel_hours);
    const travelInHours = number(data.docket.travel_in_hours);
    const travelOutHours = number(data.docket.travel_out_hours);
    const travelNotes =
      text(data.docket.travel_notes).trim() ||
      text(data.docket.travel_comments).trim();

    const travelItems: Array<[string, string]> = [];
    if (travelHours > 0) travelItems.push(["Total Travel", formatHours(travelHours)]);
    if (travelInHours > 0) travelItems.push(["Travel In", formatHours(travelInHours)]);
    if (travelOutHours > 0) travelItems.push(["Travel Out", formatHours(travelOutHours)]);

    if (travelItems.length > 0) {
      infoGrid(travelItems);
    } else {
      callout("Travel", "No separate travel hours recorded", "blue");
    }

    if (travelNotes) {
      paragraph(`Notes: ${travelNotes}`);
    }
  }

  if (visible.has("plant")) {
    section("Plant & Equipment");
    table(
      ["Asset", "Type", "Time In", "Time Out", "Raw Hrs", "Delay Hrs"],
      data.plant.length
        ? data.plant.map(row => [
            text(row.plant_name) ||
              text(row.asset_number) ||
              text(row.asset_id) ||
              "Plant",
            text(row.plant_type) || "—",
            text(row.time_in) || "—",
            text(row.time_out) || "—",
            formatHours(row.total_hours),
            formatHours(plantDelayHours(row, data.delays)),
          ])
        : [["No plant recorded", "—", "—", "—", "—", "—"]],
      [55, 35, 23, 23, 24, 24],
      { compact: true },
    );
  }

  if (visible.has("delays")) {
    section("Delays & Disruptions");

    if (!data.delays.length) {
      callout("Delay status", "No general delays recorded", "green");
    } else {
      table(
        ["Type", "Hours", "Reason / Impact"],
        data.delays.map(row => [
          titleCase(row.delay_type) || "Delay",
          formatHours(row.delay_hours),
          text(row.delay_reason) || "—",
        ]),
        [43, 27, 114],
        { compact: true, headerFill: C.amberPale },
      );

      for (const row of data.delays) {
        const affected = [
          Array.isArray(row.worker_names) && row.worker_names.length
            ? `Personnel: ${row.worker_names.join(", ")}`
            : "",
          Array.isArray(row.plant_names) && row.plant_names.length
            ? `Plant: ${row.plant_names.join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join("  •  ");

        if (affected) {
          paragraph(affected);
        }
      }
    }

    const comments = generalSiteComments(data.docket.delays_comments);
    if (comments) {
      paragraph(`Site comment: ${comments}`);
    }
  }

  if (visible.has("missing_materials") || visible.has("received_materials")) {
    section("Materials");

    if (!materialEvents.length) {
      callout(
        "Material status",
        "No selected material events recorded",
        "green",
      );
    } else {
      materialEvents.forEach((event, index) => {
        ensure(15);
        callout(
          `${index + 1}. ${titleCase(event.event_type) || "Material Event"}`,
          [text(event.affected_section), text(event.affected_activity)]
            .filter(Boolean)
            .join(" · ") || "Material event recorded",
          isMissingMaterialEvent(event) ? "amber" : "blue",
        );

        const items = event.tower_material_event_items ?? [];
        if (items.length) {
          table(
            ["Qty", "Reference / Part", "Description"],
            items.map(item => [
              `${number(item.quantity)} ${text(item.unit) || "x"}`,
              materialReference(item),
              (() => {
                const issueKey = text(item.issue_key).trim();
                const sourceIssueKey = text(item.source_issue_key).trim();
                const snapshot = issueKey
                  ? missingSnapshots.get(issueKey)
                  : sourceIssueKey
                    ? missingSnapshots.get(sourceIssueKey)
                    : undefined;
                const closeout = snapshot
                  ? `Missing ${snapshot.originalQty} · Delivered ${snapshot.deliveredQty} · Remaining ${snapshot.remainingQty} · ${snapshot.status}`
                  : "";
                return [
                  titleCase(item.material_type),
                  text(item.item_description),
                  text(item.drawing_number)
                    ? `Drawing ${text(item.drawing_number)}`
                    : "",
                  closeout,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—";
              })(),
            ]),
            [30, 55, 99],
            { compact: true },
          );
        }

        const people = event.tower_material_event_people ?? [];
        if (people.length) {
          table(
            ["Personnel", "Start", "Finish", "Hours"],
            people.map(person => {
              const hrs = durationHours(person.started_at, person.finished_at);
              return [
                text(person.employee_name) || "—",
                text(person.started_at).slice(11, 16) || "—",
                text(person.finished_at).slice(11, 16) || "—",
                hrs === null ? "—" : `${hrs.toFixed(2)} h`,
              ];
            }),
            [88, 32, 32, 32],
            { compact: true },
          );
        }

        const eventPlant = event.tower_material_event_plant ?? [];
        if (eventPlant.length) {
          table(
            ["Plant / Equipment", "Affected Hours"],
            eventPlant.map(item => {
              const hrs = durationHours(item.started_at, item.finished_at);
              return [
                text(item.plant_name) || "Plant",
                hrs === null ? "—" : `${hrs.toFixed(2)} h`,
              ];
            }),
            [130, 54],
            { compact: true },
          );
        }

        const impactRows: Array<[string, string]> = [];
        if (text(event.work_outcome)) {
          impactRows.push(["Work Outcome", titleCase(event.work_outcome)]);
        }
        if (text(event.commercial_impact_type)) {
          impactRows.push([
            "Impact",
            titleCase(event.commercial_impact_type),
          ]);
        }
        if (text(event.current_effect)) {
          impactRows.push([
            "Remaining Effect",
            titleCase(event.current_effect),
          ]);
        }
        if (impactRows.length) {
          infoGrid(impactRows);
        }

        if (
          Array.isArray(event.mitigation_actions) &&
          event.mitigation_actions.length
        ) {
          paragraph(
            `Mitigation undertaken: ${event.mitigation_actions
              .map(titleCase)
              .join("; ")}.`,
          );
        }

        if (text(event.notes)) {
          paragraph(`Notes: ${text(event.notes)}`);
        }
      });
    }
  }

  if (visible.has("bundle_transfers")) {
    section("Bundle Transfers");

    if (!bundleTransfers.length) {
      callout(
        "Bundle Transfers",
        "No bundles taken from another tower on this docket",
        "green",
      );
    } else {
      bundleTransfers.forEach((transfer, index) => {
        const replacement =
          transferSnapshots.get(transfer.id) || {
            originalQty: number(transfer.quantity),
            deliveredQty: 0,
            remainingQty: number(transfer.quantity),
            status: "Outstanding" as const,
          };

        const sourceTower = towerDisplayName(
          data,
          text(transfer.source_tower_id),
        );

        const bundleLabel = [
          text(transfer.bundle_no)
            ? `Bundle ${text(transfer.bundle_no)}`
            : "Bundle",
          text(transfer.bundle_section),
        ]
          .filter(Boolean)
          .join(" · ");

        callout(
          `${index + 1}. Taken From Another Tower`,
          `${bundleLabel} · From ${sourceTower} · Qty ${number(
            transfer.quantity,
          )}`,
          replacement.status === "Replaced"
            ? "green"
            : replacement.status === "Partially Replaced"
              ? "amber"
              : "red",
        );

        infoGrid([
          ["Source Tower", sourceTower],
          ["Quantity Taken", String(number(transfer.quantity))],
          ["Replacement Status", replacement.status],
          [
            "Replacement Progress",
            `${replacement.deliveredQty}/${replacement.originalQty} replaced`,
          ],
          ["Still Missing", String(replacement.remainingQty)],
          [
            "Taken / Received",
            formatDateTime(
              transfer.received_at || transfer.transferred_at,
            ),
          ],
        ]);

        if (text(transfer.notes).trim()) {
          paragraph(`Notes: ${text(transfer.notes).trim()}`);
        }
      });
    }
  }

  if (visible.has("safety")) {
    section("Safety");

    const incident = Boolean(data.docket.incident_occurred);
    callout(
      "Incident / Event",
      incident ? "Yes — details recorded below" : "No incident recorded",
      incident ? "red" : "green",
    );

    if (incident) {
      if (text(data.docket.incident_type)) {
        paragraph(`Type: ${text(data.docket.incident_type)}`);
      }
      if (text(data.docket.incident_notes)) {
        paragraph(`Details: ${text(data.docket.incident_notes)}`);
      }
    }

    if (text(data.docket.safety_check_completed)) {
      paragraph(
        `Safety check completed: ${text(data.docket.safety_check_completed)}`,
      );
    }
  }

  section("Sign-Off & Approval");
  signatureCard(
    "BC Representative Sign-Off",
    data.docket.bc_rep_name,
    "",
    data.docket.bc_signed_at || data.docket.bc_submitted_at,
    data.docket.bc_signature_data_url,
  );

  if (text(data.docket.bc_approved_name) || text(data.docket.bc_approved_at)) {
    signatureCard(
      "BC Approval",
      data.docket.bc_approved_name,
      data.docket.bc_approved_email,
      data.docket.bc_approved_at,
      data.docket.bc_reviewer_signature_data_url ||
        data.docket.bc_approval_signature_data_url,
    );
  }

  if (state === "FINAL") {
    signatureCard(
      "Client Approval",
      data.docket.client_approved_name || data.docket.client_rep_name,
      data.docket.client_approved_email,
      data.docket.client_approved_at || data.docket.signed_date,
      data.docket.client_signature_data_url,
    );
  } else {
    callout(
      "Client Approval",
      "Pending — this document is issued for client review only",
      "amber",
    );
  }

  const pageCount = doc.getNumberOfPages();
  const control = state === "FINAL"
    ? `FINAL · ${rev} · Controlled copy stored in SharePoint · Uncontrolled when printed`
    : `DRAFT · ${rev} · For client review only · Uncontrolled when printed`;

  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    setDraw(C.border); doc.line(margin, footerTop, pageWidth - margin, footerTop);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); setText(C.muted);
    doc.text(control, margin, 288);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, 288, { align: "right" });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
