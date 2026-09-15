import { jsPDF } from "jspdf";

export type SignaturePoint = {
  x: number;
  y: number;
};

export type SignatureStroke = SignaturePoint[];

export type SitePrestartPdfAttendee = {
  employee_name: string;
  payroll_id: string | null;
  breathalyser_reading: number | string | null;
  declaration_text: string;
  discussion_revision_no: number;
  signature_strokes: SignatureStroke[];
  signature_width: number | string | null;
  signature_height: number | string | null;
  signed_at: string;
};

export type SitePrestartPdfRevision = {
  revision_no: number;
  discussion_points: string;
  revision_note: string | null;
  created_by_name: string;
  created_at: string;
};

export type SitePrestartPdfData = {
  prestart: {
    prestart_number: string;
    prestart_date: string;
    location: string;
    conducted_by_name: string;
    current_revision: number;
    admin_notes: string | null;
    completed_at?: string | null;
  };
  project: {
    name: string;
    project_number: string | null;
  };
  currentRevision: SitePrestartPdfRevision;
  revisions: SitePrestartPdfRevision[];
  attendees: SitePrestartPdfAttendee[];
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
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDate(value: unknown) {
  const raw = text(value);
  if (!raw) return "—";

  const parsed = new Date(
    raw.length <= 10 ? `${raw.slice(0, 10)}T00:00:00` : raw,
  );

  if (Number.isNaN(parsed.getTime())) return raw;

  return parsed.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value: unknown) {
  const raw = text(value);
  if (!raw) return "—";

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;

  return parsed.toLocaleString("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function breathalyser(value: unknown) {
  if (value === null || value === undefined || text(value) === "") {
    return "N/A";
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return text(value);

  return parsed.toFixed(3);
}

function normaliseStrokes(value: unknown): SignatureStroke[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((stroke) => {
      if (!Array.isArray(stroke)) return [];

      return stroke
        .map((point) => {
          if (
            typeof point !== "object" ||
            point === null ||
            !("x" in point) ||
            !("y" in point)
          ) {
            return null;
          }

          const x = number((point as { x?: unknown }).x, NaN);
          const y = number((point as { y?: unknown }).y, NaN);

          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

          return { x, y };
        })
        .filter((point): point is SignaturePoint => Boolean(point));
    })
    .filter((stroke) => stroke.length > 0);
}

export function generateSitePrestartPdf(data: SitePrestartPdfData) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;

  const C = {
    navy: [15, 23, 42] as const,
    slate: [71, 85, 105] as const,
    muted: [100, 116, 139] as const,
    border: [203, 213, 225] as const,
    fill: [248, 250, 252] as const,
    blue: [37, 99, 235] as const,
  };

  const setText = (rgb: readonly [number, number, number]) =>
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);

  const setDraw = (rgb: readonly [number, number, number]) =>
    doc.setDrawColor(rgb[0], rgb[1], rgb[2]);

  const setFill = (rgb: readonly [number, number, number]) =>
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);

  const projectLabel = [
    text(data.project.project_number),
    text(data.project.name),
  ]
    .filter(Boolean)
    .join(" — ");

  function header(title = "SITE PRESTART REGISTER") {
    const logo = data.branding?.logoDataUrl;

    if (logo?.startsWith("data:image/")) {
      try {
        const format = logo.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
        doc.addImage(logo, format, margin, 6, 26, 15, undefined, "FAST");
      } catch {
        // Fall through to company text below.
      }
    }

    if (!logo?.startsWith("data:image/")) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      setText(C.navy);
      doc.text(text(data.branding?.companyName) || "BC Contracting", margin, 14);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    setText(C.navy);
    doc.text(title, 42, 11);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setText(C.slate);
    doc.text(
      projectLabel || "Project",
      42,
      17,
    );
    doc.text(
      `${text(data.prestart.prestart_number)}  •  ${formatDate(
        data.prestart.prestart_date,
      )}  •  ${text(data.prestart.location)}`,
      42,
      22,
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setText(C.blue);
    doc.text(
      `REV ${data.prestart.current_revision}`,
      pageWidth - margin,
      12,
      { align: "right" },
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    setText(C.muted);
    doc.text(
      `Conducted by ${text(data.prestart.conducted_by_name)}`,
      pageWidth - margin,
      18,
      { align: "right" },
    );

    setDraw(C.border);
    doc.line(margin, 28, pageWidth - margin, 28);
  }

  function footer() {
    setDraw(C.border);
    doc.line(margin, pageHeight - 9, pageWidth - margin, pageHeight - 9);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    setText(C.muted);
    doc.text(
      "Generated by TTTracker from the completed Site Prestart record. Uncontrolled when printed.",
      margin,
      pageHeight - 5,
    );
    doc.text(
      `Page ${doc.getNumberOfPages()}`,
      pageWidth - margin,
      pageHeight - 5,
      { align: "right" },
    );
  }

  function ensureSpace(y: number, needed: number) {
    if (y + needed <= pageHeight - 13) return y;

    footer();
    doc.addPage();
    header();
    return 34;
  }

  function sectionTitle(title: string, y: number) {
    y = ensureSpace(y, 10);

    setFill(C.fill);
    doc.roundedRect(margin, y, contentWidth, 8, 1.5, 1.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    setText(C.navy);
    doc.text(title, margin + 3, y + 5.2);

    return y + 11;
  }

  function paragraph(value: string, y: number, maxWidth = contentWidth) {
    const lines = doc.splitTextToSize(value || "—", maxWidth) as string[];
    const required = Math.max(1, lines.length) * 4 + 2;
    y = ensureSpace(y, required);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setText(C.slate);
    doc.text(lines, margin, y);

    return y + required;
  }

  header();

  let y = 34;

  const summary = [
    ["Prestart", text(data.prestart.prestart_number)],
    ["Date", formatDate(data.prestart.prestart_date)],
    ["Project", projectLabel || "—"],
    ["Location", text(data.prestart.location) || "—"],
    ["Conducted By", text(data.prestart.conducted_by_name) || "—"],
    ["Completed", formatDateTime(data.prestart.completed_at)],
  ];

  const summaryGap = 2;
  const summaryWidth =
    (contentWidth - summaryGap * (summary.length - 1)) / summary.length;

  summary.forEach(([label, value], index) => {
    const x = margin + index * (summaryWidth + summaryGap);

    setFill(C.fill);
    setDraw(C.border);
    doc.roundedRect(x, y, summaryWidth, 17, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    setText(C.muted);
    doc.text(label.toUpperCase(), x + 2.5, y + 5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    setText(C.navy);

    const lines = doc.splitTextToSize(value || "—", summaryWidth - 5) as string[];
    doc.text(lines.slice(0, 2), x + 2.5, y + 10);
  });

  y += 22;

  y = sectionTitle(`Discussion Points — Revision ${data.currentRevision.revision_no}`, y);
  y = paragraph(data.currentRevision.discussion_points, y);

  if (text(data.prestart.admin_notes)) {
    y = sectionTitle("Site / Admin Notes", y + 1);
    y = paragraph(text(data.prestart.admin_notes), y);
  }

  if (data.revisions.length > 1) {
    y = sectionTitle("Discussion Revision History", y + 1);

    for (const revision of data.revisions) {
      y = paragraph(
        `Rev ${revision.revision_no} — ${formatDateTime(
          revision.created_at,
        )} — ${text(revision.created_by_name)}${
          text(revision.revision_note)
            ? ` — ${text(revision.revision_note)}`
            : ""
        }`,
        y,
      );
    }
  }

  y = sectionTitle("Signed Attendance", y + 1);

  const columns = {
    payroll: 25,
    name: 52,
    breath: 24,
    signed: 33,
    revision: 17,
    signature: contentWidth - 25 - 52 - 24 - 33 - 17,
  };

  function drawAttendanceHeader(atY: number) {
    const labels = [
      ["Payroll ID", columns.payroll],
      ["Employee", columns.name],
      ["Breatho", columns.breath],
      ["Signed", columns.signed],
      ["Rev", columns.revision],
      ["Signature", columns.signature],
    ] as const;

    let x = margin;

    setFill(C.fill);
    setDraw(C.border);

    for (const [label, width] of labels) {
      doc.rect(x, atY, width, 8, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      setText(C.navy);
      doc.text(label, x + 2, atY + 5.1);
      x += width;
    }

    return atY + 8;
  }

  y = drawAttendanceHeader(y);

  const latestAttendees = data.attendees
    .filter(
      (attendee) =>
        Number(attendee.discussion_revision_no) ===
        Number(data.prestart.current_revision),
    )
    .sort((a, b) => a.employee_name.localeCompare(b.employee_name));

  for (const attendee of latestAttendees) {
    const rowHeight = 21;

    if (y + rowHeight > pageHeight - 13) {
      footer();
      doc.addPage();
      header();
      y = 34;
      y = drawAttendanceHeader(y);
    }

    let x = margin;

    const cells = [
      {
        width: columns.payroll,
        value: text(attendee.payroll_id) || "—",
      },
      {
        width: columns.name,
        value: text(attendee.employee_name) || "Employee",
      },
      {
        width: columns.breath,
        value: breathalyser(attendee.breathalyser_reading),
      },
      {
        width: columns.signed,
        value: formatDateTime(attendee.signed_at),
      },
      {
        width: columns.revision,
        value: `R${attendee.discussion_revision_no}`,
      },
    ];

    for (const cell of cells) {
      setDraw(C.border);
      doc.rect(x, y, cell.width, rowHeight);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      setText(C.slate);

      const wrapped = doc.splitTextToSize(
        cell.value,
        cell.width - 4,
      ) as string[];
      doc.text(wrapped.slice(0, 3), x + 2, y + 5);

      x += cell.width;
    }

    setDraw(C.border);
    doc.rect(x, y, columns.signature, rowHeight);

    const strokes = normaliseStrokes(attendee.signature_strokes);
    const sourceWidth = Math.max(1, number(attendee.signature_width, 320));
    const sourceHeight = Math.max(1, number(attendee.signature_height, 140));
    const drawX = x + 2;
    const drawY = y + 2;
    const drawW = columns.signature - 4;
    const drawH = rowHeight - 4;

    setDraw(C.navy);
    doc.setLineWidth(0.35);

    for (const stroke of strokes) {
      for (let index = 1; index < stroke.length; index += 1) {
        const a = stroke[index - 1];
        const b = stroke[index];

        doc.line(
          drawX + (a.x / sourceWidth) * drawW,
          drawY + (a.y / sourceHeight) * drawH,
          drawX + (b.x / sourceWidth) * drawW,
          drawY + (b.y / sourceHeight) * drawH,
        );
      }
    }

    y += rowHeight;
  }

  if (latestAttendees.length === 0) {
    y = paragraph("No signed attendees were recorded.", y + 4);
  }

  const declaration = latestAttendees[0]?.declaration_text;

  if (text(declaration)) {
    y = sectionTitle("Signed Declaration", y + 3);
    y = paragraph(text(declaration), y);
  }

  footer();

  return new Uint8Array(doc.output("arraybuffer"));
}
