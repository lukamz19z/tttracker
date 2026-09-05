import { jsPDF } from "jspdf";
import {
  calculateProgressTotals,
  type LegacyProgressCalculationRow,
  type SectionV2CalculationRow,
} from "@/lib/dockets/calculations";

type Row = Record<string, unknown>;

type MaterialEvent = Row & {
  tower_material_event_items?: Row[] | null;
  tower_material_event_people?: Row[] | null;
  tower_material_event_plant?: Row[] | null;
};

export type DailyDocketPdfData = {
  project: Row;
  tower: Row;
  docket: Row;
  labour: Row[];
  plant: Row[];
  delays: Row[];
  progress: Row[];
  materialEvents: MaterialEvent[];
  branding?: {
    logoDataUrl?: string | null;
    companyName?: string | null;
  };
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
function progressModel(data: DailyDocketPdfData) {
  if (text(data.docket.progress_model).trim().toLowerCase() === "section_v2") return "section_v2";
  return data.progress.some(row => Boolean(sectionCode(row)) && (row.assembly_today !== undefined || row.erection_today !== undefined))
    ? "section_v2" : "legacy";
}
function hasBodyExtension(data: DailyDocketPdfData) {
  return progressModel(data) !== "section_v2" || data.progress.some(row => sectionCode(row) === "BE");
}
function applicableV2Rows(data: DailyDocketPdfData) {
  const includeBe = hasBodyExtension(data);
  const byCode = new Map<string, Row>();
  for (const row of data.progress) {
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
function weightFor(code: string) {
  if (code === "LE") return 20;
  if (code === "BE" || code === "CB") return 15;
  if (["BSS", "MSS", "TSS"].includes(code)) return 10;
  return 5;
}
function overallProgress(data: DailyDocketPdfData) {
  return calculateProgressTotals({
    progressModel: progressModel(data),
    sectionV2Rows: data.progress.map(row => ({
      section_code: sectionCode(row),
      section_label: sectionLabel(row),
      assembly_today: row.assembly_today !== undefined ? row.assembly_today : row.assembled_qty,
      erection_today: row.erection_today !== undefined ? row.erection_today : row.erected_qty,
      assembly_weight: row.assembly_weight,
      erection_weight: row.erection_weight,
    })) as SectionV2CalculationRow[],
    legacyRows: data.progress.map(row => ({
      section_label: sectionLabel(row),
      assembled_qty: row.assembled_qty,
      erected_qty: row.erected_qty,
    })) as LegacyProgressCalculationRow[],
    hasBodyExtension: hasBodyExtension(data),
  });
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
  const calculated = overallProgress(data);
  const projectName = [text(data.project.project_number), text(data.project.name)].filter(Boolean).join(" - ");
  const tower = towerName(data);
  let y = 36;

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
    doc.rect(0, 0, pageWidth, 31, "F");

    const logo = data.branding?.logoDataUrl;
    if (logo && logo.startsWith("data:image/")) {
      try {
        const format = logo.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
        doc.addImage(logo, format, margin, 7, 25, 15, undefined, "FAST");
      } catch {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        setText(C.navy);
        doc.text(
          text(data.branding?.companyName).trim() || "Company",
          margin,
          17,
        );
      }
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      setText(C.navy);
      doc.text(
        text(data.branding?.companyName).trim() || "Company",
        margin,
        17,
      );
    }

    doc.setFont("helvetica", "bold"); doc.setFontSize(15); setText(C.navy);
    doc.text("DAILY DOCKET", 43, 13);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); setText(C.slate);
    doc.text(projectName || "Project", 43, 19);
    doc.text(`${tower}  •  ${formatDate(data.docket.docket_date)}`, 43, 24);

    const statusColor = state === "FINAL" ? C.green : C.amber;
    const statusFill = state === "FINAL" ? C.greenPale : C.amberPale;
    setFill(statusFill); doc.roundedRect(165, 8, 32, 14, 2, 2, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); setText(statusColor);
    doc.text(state, 181, 13, { align: "center" });
    doc.setFontSize(10); doc.text(rev, 181, 19, { align: "center" });

    setDraw(C.border); doc.line(margin, 29, pageWidth - margin, 29);
  }
  function newPage() {
    doc.addPage();
    drawHeader();
    y = 36;
  }
  function ensure(height: number) {
    if (y + height > footerTop - 4) newPage();
  }
  function section(title: string, numberLabel: string) {
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

  section("Docket Details", "01");
  infoGrid([
    ["Crew", text(data.docket.crew) || "—"],
    ["Leading Hand", text(data.docket.leading_hand) || "—"],
    ["Weather", text(data.docket.weather) || "—"],
    ["BC Representative", text(data.docket.bc_rep_name) || "—"],
    ["Document Status", `${state} · ${rev}`],
    ["Client Representative", text(data.docket.client_rep_name) || (state === "DRAFT" ? "Pending approval" : "—")],
  ]);

  section("Progress", "02");
  if (progressModel(data) === "section_v2") {
    const rows = applicableV2Rows(data).map(row => [
      sectionLabel(row),
      `${weightFor(text(row.section_code))}%`,
      `${clampPercent(row.assembly_today).toFixed(0)}%`,
      `${clampPercent(row.erection_today).toFixed(0)}%`,
    ]);
    table(["Section", "Weight", "Assembly Today", "Erection Today"], rows, [62, 30, 46, 46], { compact: true });
    const beText = hasBodyExtension(data) ? "Body Extension included" : "Body Extension excluded; remaining weights normalised";
    paragraph(beText);
  } else {
    table(["Section", "Assembled", "Erected"], data.progress.map(row => [
      sectionLabel(row), text(row.assembled_qty) || "0", text(row.erected_qty) || "0",
    ]), [92, 46, 46], { compact: true });
  }
  table(["Overall Assembly", "Overall Erection", "Total Progress"], [[
    `${calculated.assemblyPercent.toFixed(1)}%`,
    `${calculated.erectionPercent.toFixed(1)}%`,
    `${calculated.totalProgressPercent.toFixed(1)}%`,
  ]], [61.3, 61.3, 61.4], { headerFill: C.bluePale });

  section("Labour", "03");
  table(["Personnel", "Time In", "Time Out", "Raw Hours"], data.labour.length ? data.labour.map(row => [
    text(row.worker_name) || "Worker", text(row.time_in) || "—", text(row.time_out) || "—", formatHours(row.total_hours),
  ]) : [["No labour recorded", "—", "—", "—"]], [88, 32, 32, 32], { compact: true });
  callout("Total raw man-hours", formatHours(data.docket.raw_manhours), "blue");

  const mobilisation = parseMobilisation(data);
  section("Mobilisation / Demobilisation", "04");
  if (!mobilisation.included) {
    callout("Mobilising", "No", "blue");
  } else {
    infoGrid([
      ["Mobilising", "Yes"],
      ["Duration", formatHours(mobilisation.hours)],
      ["From", mobilisation.from || "—"],
      ["To", mobilisation.to || "—"],
      ["Stage", titleCase(mobilisation.status) || "—"],
      ["Personnel", mobilisation.workers.length ? mobilisation.workers.join(", ") : "Crew / as recorded"],
    ]);
    if (mobilisation.notes) paragraph(`Notes: ${mobilisation.notes}`);
  }

  section("Plant & Equipment", "05");
  table(["Asset", "Type", "Time In", "Time Out", "Hours"], data.plant.length ? data.plant.map(row => [
    text(row.plant_name) || text(row.asset_number) || text(row.asset_id) || "Plant",
    text(row.plant_type) || "—", text(row.time_in) || "—", text(row.time_out) || "—", formatHours(row.total_hours),
  ]) : [["No plant recorded", "—", "—", "—", "—"]], [70, 40, 25, 25, 24], { compact: true });

  section("Delays & Disruptions", "06");
  if (!data.delays.length) {
    callout("Delay status", "No general delays recorded", "green");
  } else {
    table(["Type", "Hours", "Reason / Impact"], data.delays.map(row => [
      titleCase(row.delay_type) || "Delay", formatHours(row.delay_hours), text(row.delay_reason) || "—",
    ]), [43, 27, 114], { compact: true, headerFill: C.amberPale });
    for (const row of data.delays) {
      const affected = [
        Array.isArray(row.worker_names) && row.worker_names.length ? `Personnel: ${row.worker_names.join(", ")}` : "",
        Array.isArray(row.plant_names) && row.plant_names.length ? `Plant: ${row.plant_names.join(", ")}` : "",
      ].filter(Boolean).join("  •  ");
      if (affected) paragraph(affected);
    }
  }
  const comments = generalSiteComments(data.docket.delays_comments);
  if (comments) paragraph(`Site comment: ${comments}`);

  section("Materials", "07");
  if (!data.materialEvents.length) {
    callout("Material status", "No structured material events recorded", "green");
  } else {
    data.materialEvents.forEach((event, index) => {
      ensure(15);
      callout(
        `${index + 1}. ${titleCase(event.event_type) || "Material Event"}`,
        [text(event.affected_section), text(event.affected_activity)].filter(Boolean).join(" · ") || "Material event recorded",
        text(event.event_type).toLowerCase().includes("missing") ? "amber" : "blue",
      );
      const items = event.tower_material_event_items ?? [];
      if (items.length) table(["Qty", "Reference", "Description"], items.map(item => [
        `${number(item.quantity)} ${text(item.unit) || "x"}`, text(item.item_reference) || "—", text(item.item_description) || "—",
      ]), [30, 55, 99], { compact: true });

      const people = event.tower_material_event_people ?? [];
      if (people.length) {
        table(["Personnel", "Start", "Finish", "Hours"], people.map(person => {
          const hrs = durationHours(person.started_at, person.finished_at);
          return [text(person.employee_name) || "—", text(person.started_at).slice(11,16) || "—", text(person.finished_at).slice(11,16) || "—", hrs === null ? "—" : `${hrs.toFixed(2)} h`];
        }), [88, 32, 32, 32], { compact: true });
      }
      const eventPlant = event.tower_material_event_plant ?? [];
      if (eventPlant.length) table(["Plant / Equipment", "Affected Hours"], eventPlant.map(item => {
        const hrs = durationHours(item.started_at, item.finished_at);
        return [text(item.plant_name) || "Plant", hrs === null ? "—" : `${hrs.toFixed(2)} h`];
      }), [130, 54], { compact: true });

      const impactRows: Array<[string, string]> = [];
      if (text(event.work_outcome)) impactRows.push(["Work Outcome", titleCase(event.work_outcome)]);
      if (text(event.commercial_impact_type)) impactRows.push(["Impact", titleCase(event.commercial_impact_type)]);
      if (text(event.current_effect)) impactRows.push(["Remaining Effect", titleCase(event.current_effect)]);
      if (impactRows.length) infoGrid(impactRows);
      if (Array.isArray(event.mitigation_actions) && event.mitigation_actions.length) {
        paragraph(`Mitigation undertaken: ${event.mitigation_actions.map(titleCase).join("; ")}.`);
      }
      if (text(event.notes)) paragraph(`Notes: ${text(event.notes)}`);
    });
  }

  section("Safety", "08");
  const incident = Boolean(data.docket.incident_occurred);
  callout("Incident / Event", incident ? "Yes — details recorded below" : "No incident recorded", incident ? "red" : "green");
  if (incident) {
    if (text(data.docket.incident_type)) paragraph(`Type: ${text(data.docket.incident_type)}`);
    if (text(data.docket.incident_notes)) paragraph(`Details: ${text(data.docket.incident_notes)}`);
  }
  if (text(data.docket.safety_check_completed)) paragraph(`Safety check completed: ${text(data.docket.safety_check_completed)}`);

  section("Sign-Off & Approval", "09");
  signatureCard("BC Representative Sign-Off", data.docket.bc_rep_name, "", data.docket.bc_signed_at || data.docket.bc_submitted_at, data.docket.bc_signature_data_url);
  if (text(data.docket.bc_approved_name) || text(data.docket.bc_approved_at)) {
    signatureCard("BC Approval", data.docket.bc_approved_name, data.docket.bc_approved_email, data.docket.bc_approved_at, data.docket.bc_reviewer_signature_data_url || data.docket.bc_approval_signature_data_url);
  }
  if (state === "FINAL") {
    signatureCard("Client Approval", data.docket.client_approved_name || data.docket.client_rep_name, data.docket.client_approved_email, data.docket.client_approved_at || data.docket.signed_date, data.docket.client_signature_data_url);
  } else {
    callout("Client Approval", "Pending — this document is issued for client review only", "amber");
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
