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
};

const SECTION_ORDER = [
  "LE",
  "BE",
  "CB",
  "BSS",
  "MSS",
  "TSS",
  "BX_ARMS",
  "MX_ARMS",
  "TX_ARMS",
  "EP",
] as const;

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function number(value: unknown) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function clampPercent(value: unknown) {
  return Math.max(0, Math.min(100, number(value)));
}

function formatDate(value: unknown) {
  const raw = text(value);
  if (!raw) return "";

  const [year, month, day] = raw.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : raw;
}

function formatDateTime(value: unknown) {
  const raw = text(value);
  if (!raw) return "";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatHours(value: unknown) {
  return number(value).toFixed(2);
}

function durationHours(start: unknown, finish: unknown) {
  const a = Date.parse(text(start));
  const b = Date.parse(text(finish));

  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;

  return (b - a) / 3_600_000;
}

function titleCase(value: unknown) {
  return text(value)
    .replace(/_/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function sectionCode(row: Row) {
  return text(row.section_code).trim().toUpperCase();
}

function sectionLabel(row: Row) {
  return (
    text(row.section_label).trim() ||
    sectionCode(row).replaceAll("_", " ") ||
    "Section"
  );
}

function progressModel(data: DailyDocketPdfData) {
  const docketModel = text(data.docket.progress_model).trim().toLowerCase();

  if (docketModel === "section_v2") return "section_v2";

  const hasV2Rows = data.progress.some(
    (row) =>
      Boolean(sectionCode(row)) &&
      (row.assembly_today !== undefined || row.erection_today !== undefined),
  );

  return hasV2Rows ? "section_v2" : "legacy";
}

function hasBodyExtension(data: DailyDocketPdfData) {
  if (progressModel(data) !== "section_v2") return true;

  return data.progress.some((row) => sectionCode(row) === "BE");
}

function applicableV2Rows(data: DailyDocketPdfData) {
  const includeBe = hasBodyExtension(data);

  const byCode = new Map<string, Row>();
  for (const row of data.progress) {
    const code = sectionCode(row);
    if (code) byCode.set(code, row);
  }

  return SECTION_ORDER.filter((code) => includeBe || code !== "BE").map(
    (code) => {
      const row = byCode.get(code) ?? {};

      return {
        ...row,
        section_code: code,
        section_label:
          text(row.section_label).trim() || code.replaceAll("_", " "),
        assembly_today:
          row.assembly_today !== undefined
            ? row.assembly_today
            : row.assembled_qty,
        erection_today:
          row.erection_today !== undefined
            ? row.erection_today
            : row.erected_qty,
      };
    },
  );
}

function overallProgress(data: DailyDocketPdfData) {
  return calculateProgressTotals({
    progressModel: progressModel(data),
    sectionV2Rows: data.progress.map((row) => ({
      section_code: sectionCode(row),
      section_label: sectionLabel(row),
      assembly_today:
        row.assembly_today !== undefined ? row.assembly_today : row.assembled_qty,
      erection_today:
        row.erection_today !== undefined ? row.erection_today : row.erected_qty,
      assembly_weight: row.assembly_weight,
      erection_weight: row.erection_weight,
    })) as SectionV2CalculationRow[],
    legacyRows: data.progress.map((row) => ({
      section_label: sectionLabel(row),
      assembled_qty: row.assembled_qty,
      erected_qty: row.erected_qty,
    })) as LegacyProgressCalculationRow[],
    hasBodyExtension: hasBodyExtension(data),
  });
}

function documentState(data: DailyDocketPdfData): "DRAFT" | "FINAL" {
  const status = text(data.docket.approval_status).trim().toLowerCase();

  if (
    status === "final" ||
    status === "legacy_final" ||
    Boolean(text(data.docket.client_approved_at)) ||
    Boolean(text(data.docket.client_signature_data_url))
  ) {
    return "FINAL";
  }

  return "DRAFT";
}


function revisionNumber(data: DailyDocketPdfData) {
  return Math.max(0, Math.round(number(data.docket.approval_revision)));
}

function revisionLabel(data: DailyDocketPdfData) {
  return `R${String(revisionNumber(data)).padStart(2, "0")}`;
}

function parseMobilisation(data: DailyDocketPdfData) {
  const comments = text(data.docket.delays_comments);
  const line = comments
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("MOBILISATION|"));

  const values: Record<string, string> = {};
  if (line) {
    for (const piece of line.split("|").slice(1)) {
      const index = piece.indexOf("=");
      if (index === -1) continue;
      values[piece.slice(0, index)] = piece.slice(index + 1);
    }
  }

  const docketHours = number(data.docket.mobilisation_hours);
  const parsedMinutes = number(values.minutes);
  const parsedHours = number(values.hours);
  const labourHasMob = data.labour.some(
    (row) => number(row.mobilisation_hours) > 0,
  );

  const included =
    Boolean(line) ||
    docketHours > 0 ||
    labourHasMob ||
    Boolean(text(data.docket.mobilisation_notes).trim());

  const hours =
    parsedHours > 0
      ? parsedHours
      : parsedMinutes > 0
        ? parsedMinutes / 60
        : docketHours;

  return {
    included,
    hours,
    minutes: parsedMinutes > 0 ? parsedMinutes : Math.round(hours * 60),
    from: values.from || "",
    to: values.to || "",
    status: values.status || "",
    workers: values.workers
      ? values.workers.split(",").map((value) => value.trim()).filter(Boolean)
      : [],
    notes: values.notes || text(data.docket.mobilisation_notes),
  };
}

function generalSiteComments(value: unknown) {
  return text(value)
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("MOBILISATION|"))
    .join("\n")
    .trim();
}

function isPngDataUrl(value: unknown) {
  return text(value).startsWith("data:image/png;base64,");
}

export function generateDailyDocketPdf(
  data: DailyDocketPdfData,
): Uint8Array {
  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const marginX = 14;
  const pageWidth = 210;
  const pageHeight = 297;
  const contentWidth = pageWidth - marginX * 2;
  const bottomMargin = 15;

  let y = 15;

  function ensureSpace(height = 8) {
    if (y + height <= pageHeight - bottomMargin) return;
    doc.addPage();
    y = 16;
  }

  function rule() {
    ensureSpace(5);
    doc.setDrawColor(203, 213, 225);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 5;
  }

  function heading(value: string, size = 13) {
    ensureSpace(10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setTextColor(15, 23, 42);
    doc.text(value, marginX, y);
    y += 7;
  }

  function paragraph(value: string, bold = false) {
    if (!value) return;

    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);

    const lines = doc.splitTextToSize(value, contentWidth) as string[];

    ensureSpace(lines.length * 4.5 + 2);
    doc.text(lines, marginX, y);
    y += lines.length * 4.5 + 2;
  }

  function keyValue(label: string, value: unknown) {
    ensureSpace(6);

    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.text(`${label}:`, marginX, y);

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text(text(value) || "-", marginX + 39, y);

    y += 5;
  }

  function sectionBox(title: string, body: () => void) {
    ensureSpace(12);

    const startY = y;

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(
      marginX,
      y - 4,
      contentWidth,
      8,
      1.5,
      1.5,
      "F",
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(title, marginX + 3, y + 1);

    y += 8;
    body();

    if (y === startY + 8) y += 1;
  }

  function signatureBlock({
    title,
    name,
    email,
    approvedAt,
    signatureDataUrl,
  }: {
    title: string;
    name: unknown;
    email?: unknown;
    approvedAt?: unknown;
    signatureDataUrl?: unknown;
  }) {
    ensureSpace(42);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(title, marginX, y);
    y += 5;

    const boxY = y;
    const boxHeight = 26;

    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(
      marginX,
      boxY,
      contentWidth,
      boxHeight,
      1.5,
      1.5,
      "FD",
    );

    if (isPngDataUrl(signatureDataUrl)) {
      try {
        doc.addImage(
          text(signatureDataUrl),
          "PNG",
          marginX + 3,
          boxY + 2,
          58,
          18,
          undefined,
          "FAST",
        );
      } catch {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(
          "Signature image could not be rendered.",
          marginX + 3,
          boxY + 10,
        );
      }
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text("No signature recorded", marginX + 3, boxY + 10);
    }

    const detailX = marginX + 68;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(text(name) || "-", detailX, boxY + 7);

    if (text(email)) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(text(email), detailX, boxY + 13);
    }

    if (text(approvedAt)) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Approved: ${formatDateTime(approvedAt)}`,
        detailX,
        boxY + 19,
      );
    }

    y = boxY + boxHeight + 6;
  }

  const projectName = [
    text(data.project.project_number),
    text(data.project.name),
  ]
    .filter(Boolean)
    .join(" - ");

  const towerName =
    text(data.tower.tower_number) ||
    text(data.tower.structure_number) ||
    text(data.tower.name) ||
    "Tower";

  const state = documentState(data);
  const calculated = overallProgress(data);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text("BC CONTRACTING | DAILY DOCKET", marginX, y);

  doc.setFontSize(11);
  doc.setTextColor(state === "FINAL" ? 5 : 180, state === "FINAL" ? 150 : 83, state === "FINAL" ? 105 : 9);
  doc.text(
    `${state} | ${revisionLabel(data)}`,
    pageWidth - marginX,
    y,
    { align: "right" },
  );

  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(projectName || "Project", marginX, y);
  y += 5;
  doc.text(`${towerName} | ${formatDate(data.docket.docket_date)}`, marginX, y);
  y += 7;

  rule();

  sectionBox("01 | Docket Details", () => {
    keyValue("Revision", revisionLabel(data));
    keyValue("Document Status", state);
    keyValue("Crew", data.docket.crew);
    keyValue("Leading Hand", data.docket.leading_hand);
    keyValue("Weather", data.docket.weather);
    keyValue("BC Representative", data.docket.bc_rep_name);

    if (text(data.docket.client_rep_name)) {
      keyValue("Client Representative", data.docket.client_rep_name);
    }
  });

  sectionBox("02 | Progress", () => {
    if (progressModel(data) === "section_v2") {
      paragraph(
        hasBodyExtension(data)
          ? "Progress model: Section weighted progress - Body Extension included."
          : "Progress model: Section weighted progress - Body Extension excluded and remaining sections normalised.",
      );

      const rows = applicableV2Rows(data);

      for (const row of rows) {
        const weight =
          row.section_code === "LE"
            ? 20
            : row.section_code === "BE"
              ? 15
              : ["CB"].includes(row.section_code)
                ? 15
                : ["BSS", "MSS", "TSS"].includes(row.section_code)
                  ? 10
                  : 5;

        paragraph(
          `${sectionLabel(row)} | Weight ${weight}% | Assembly Today ${clampPercent(
            row.assembly_today,
          ).toFixed(0)}% | Erection Today ${clampPercent(
            row.erection_today,
          ).toFixed(0)}%`,
        );
      }
    } else {
      if (!data.progress.length) {
        paragraph("No progress rows recorded.");
      }

      for (const row of data.progress) {
        paragraph(
          `${sectionLabel(row)} | Assembled ${text(
            row.assembled_qty,
          ) || "0"} | Erected ${text(row.erected_qty) || "0"}`,
        );
      }
    }

    paragraph(
      `Overall Assembly ${calculated.assemblyPercent.toFixed(
        1,
      )}% | Overall Erection ${calculated.erectionPercent.toFixed(
        1,
      )}% | Total Progress ${calculated.totalProgressPercent.toFixed(1)}%`,
      true,
    );
  });

  sectionBox("03 | Labour", () => {
    if (!data.labour.length) {
      paragraph("No labour rows recorded.");
    }

    for (const row of data.labour) {
      paragraph(
        [
          text(row.worker_name) || "Worker",
          `${text(row.time_in) || "-"} - ${text(row.time_out) || "-"}`,
          `Raw ${formatHours(row.total_hours)} h`,
        ]
          .filter(Boolean)
          .join(" | "),
      );
    }

    paragraph(
      `Total raw man-hours: ${formatHours(data.docket.raw_manhours)}`,
      true,
    );
  });

  const mobilisation = parseMobilisation(data);

  sectionBox("04 | Mobilisation / Demobilisation", () => {
    if (!mobilisation.included) {
      paragraph("Mobilising: No");
      return;
    }

    paragraph("Mobilising: Yes", true);

    const details = [
      mobilisation.from ? `From: ${mobilisation.from}` : "",
      mobilisation.to ? `To: ${mobilisation.to}` : "",
      mobilisation.status ? `Stage: ${titleCase(mobilisation.status)}` : "",
      `Duration: ${formatHours(mobilisation.hours)} hrs`,
    ].filter(Boolean);

    paragraph(details.join(" | "));

    if (mobilisation.workers.length) {
      paragraph(`Workers: ${mobilisation.workers.join(", ")}`);
    }

    if (mobilisation.notes) {
      paragraph(`Notes: ${mobilisation.notes}`);
    }
  });

  sectionBox("05 | Plant", () => {
    if (!data.plant.length) {
      paragraph("No plant recorded.");
    }

    for (const row of data.plant) {
      paragraph(
        [
          text(row.plant_name) ||
            text(row.asset_number) ||
            text(row.asset_id) ||
            "Plant",
          text(row.plant_type),
          `${text(row.time_in) || "-"} - ${text(row.time_out) || "-"}`,
          `${formatHours(row.total_hours)} h`,
        ]
          .filter(Boolean)
          .join(" | "),
      );
    }
  });

  sectionBox("06 | Delays", () => {
    if (!data.delays.length) {
      paragraph("No general delay rows recorded.");
    }

    for (const row of data.delays) {
      paragraph(
        [
          titleCase(row.delay_type) || "Delay",
          `${formatHours(row.delay_hours)} h`,
          text(row.delay_reason),
          Array.isArray(row.worker_names) && row.worker_names.length
            ? `Workers: ${row.worker_names.join(", ")}`
            : "",
          Array.isArray(row.plant_names) && row.plant_names.length
            ? `Plant: ${row.plant_names.join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join(" | "),
      );
    }

    const comments = generalSiteComments(data.docket.delays_comments);
    if (comments) {
      paragraph(`General site comment: ${comments}`);
    }
  });

  sectionBox("07 | Materials", () => {
    if (!data.materialEvents.length) {
      paragraph("No structured material events recorded.");
    }

    for (const event of data.materialEvents) {
      paragraph(
        [
          titleCase(event.event_type) || "Material Event",
          text(event.affected_activity),
          text(event.affected_section),
        ]
          .filter(Boolean)
          .join(" - "),
        true,
      );

      for (const item of event.tower_material_event_items ?? []) {
        paragraph(
          `${number(item.quantity)} ${text(item.unit) || "x"} ${text(
            item.item_reference,
          )}${
            text(item.item_description)
              ? ` - ${text(item.item_description)}`
              : ""
          }`,
        );
      }

      const people = event.tower_material_event_people ?? [];

      if (people.length) {
        const personHours = people.reduce((sum, person) => {
          return (
            sum +
            (durationHours(person.started_at, person.finished_at) ?? 0)
          );
        }, 0);

        paragraph(
          `People involved: ${people
            .map((person) => text(person.employee_name))
            .filter(Boolean)
            .join(", ")} | Calculated person-hours: ${personHours.toFixed(
            2,
          )}`,
        );
      }

      for (const item of event.tower_material_event_plant ?? []) {
        const hours = durationHours(
          item.started_at,
          item.finished_at,
        );

        paragraph(
          `Plant affected: ${text(item.plant_name) || "Plant"}${
            hours !== null ? ` | ${hours.toFixed(2)} h` : ""
          }`,
        );
      }

      if (text(event.work_outcome)) {
        paragraph(`Work outcome: ${titleCase(event.work_outcome)}`);
      }

      if (text(event.commercial_impact_type)) {
        paragraph(
          `Commercial impact: ${titleCase(
            event.commercial_impact_type,
          )}`,
        );
      }

      if (text(event.current_effect)) {
        paragraph(`Current effect: ${titleCase(event.current_effect)}`);
      }

      if (
        Array.isArray(event.mitigation_actions) &&
        event.mitigation_actions.length
      ) {
        paragraph(
          `Mitigation: ${event.mitigation_actions
            .map(titleCase)
            .join(", ")}`,
        );
      }

      if (text(event.notes)) {
        paragraph(`Notes: ${text(event.notes)}`);
      }
    }
  });

  sectionBox("08 | Safety", () => {
    paragraph(
      `Incident occurred: ${
        data.docket.incident_occurred ? "Yes" : "No"
      }`,
    );

    if (data.docket.incident_occurred) {
      if (text(data.docket.incident_type)) {
        paragraph(
          `Incident type: ${text(data.docket.incident_type)}`,
        );
      }

      if (text(data.docket.incident_notes)) {
        paragraph(
          `Incident notes: ${text(data.docket.incident_notes)}`,
        );
      }
    }

    if (text(data.docket.safety_check_completed)) {
      paragraph(
        `Safety check completed: ${text(
          data.docket.safety_check_completed,
        )}`,
      );
    }
  });

  heading("09 | Sign-Off & Approval");

  signatureBlock({
    title: "BC Representative Sign-Off",
    name: data.docket.bc_rep_name,
    approvedAt:
      data.docket.bc_signed_at || data.docket.bc_submitted_at,
    signatureDataUrl: data.docket.bc_signature_data_url,
  });

  if (
    text(data.docket.bc_approved_name) ||
    text(data.docket.bc_approved_at)
  ) {
    signatureBlock({
      title: "BC Approval",
      name: data.docket.bc_approved_name,
      email: data.docket.bc_approved_email,
      approvedAt: data.docket.bc_approved_at,
      signatureDataUrl:
        data.docket.bc_reviewer_signature_data_url ||
        data.docket.bc_approval_signature_data_url,
    });
  }

  if (state === "FINAL") {
    signatureBlock({
      title: "Client Approval",
      name:
        data.docket.client_approved_name ||
        data.docket.client_rep_name,
      email: data.docket.client_approved_email,
      approvedAt:
        data.docket.client_approved_at ||
        data.docket.signed_date,
      signatureDataUrl:
        data.docket.client_signature_data_url,
    });
  } else {
    ensureSpace(12);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      "Client approval pending. This document is not the final approved copy.",
      marginX,
      y,
    );
    y += 7;
  }

  const pageCount = doc.getNumberOfPages();
  const controlText =
    state === "FINAL"
      ? `FINAL | ${revisionLabel(data)} | Controlled copy stored in SharePoint | Uncontrolled when printed`
      : `DRAFT | ${revisionLabel(data)} | For client review only | Uncontrolled when printed`;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    doc.setDrawColor(203, 213, 225);
    doc.line(marginX, pageHeight - 11, pageWidth - marginX, pageHeight - 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(controlText, marginX, pageHeight - 6);
    doc.text(
      `Page ${pageNumber} of ${pageCount}`,
      pageWidth - marginX,
      pageHeight - 6,
      { align: "right" },
    );
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
