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
  if (!raw) return "-";

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
  if (!raw) return "-";

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
  const footerTop = pageHeight - 11;

  const C = {
    ink: [17, 24, 39] as const,
    slate: [51, 65, 85] as const,
    muted: [100, 116, 139] as const,
    line: [214, 222, 232] as const,
    soft: [248, 250, 252] as const,
    soft2: [241, 245, 249] as const,
    white: [255, 255, 255] as const,
    accent: [220, 38, 38] as const,
    green: [22, 101, 52] as const,
    greenSoft: [240, 253, 244] as const,
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
    .join(" - ");

  const companyName = text(data.branding?.companyName) || "BC Contracting";

  function header(compact = false) {
    const logo = data.branding?.logoDataUrl;
    const top = compact ? 5 : 6;
    const logoW = compact ? 21 : 25;
    const logoH = compact ? 12 : 14;

    if (logo?.startsWith("data:image/")) {
      try {
        const format = logo.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
        doc.addImage(logo, format, margin, top, logoW, logoH, undefined, "FAST");
      } catch {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(compact ? 9 : 10);
        setText(C.ink);
        doc.text(companyName, margin, top + 8);
      }
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(compact ? 9 : 10);
      setText(C.ink);
      doc.text(companyName, margin, top + 8);
    }

    const titleX = margin + logoW + 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(compact ? 12 : 16);
    setText(C.ink);
    doc.text("SITE PRESTART REGISTER", titleX, compact ? 10 : 11.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(compact ? 7 : 8.2);
    setText(C.slate);
    doc.text(projectLabel || "Project", titleX, compact ? 15 : 17.5);

    if (!compact) {
      doc.setFontSize(7.2);
      setText(C.muted);
      doc.text(
        [
          text(data.prestart.prestart_number),
          formatDate(data.prestart.prestart_date),
          text(data.prestart.location),
        ]
          .filter(Boolean)
          .join("  |  "),
        titleX,
        22.5,
      );
    }

    const badgeH = 7;
    const revText = `REV ${data.prestart.current_revision}`;
    const statusText = text(data.prestart.completed_at) ? "COMPLETED" : "DRAFT";

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.3);

    const statusW = doc.getTextWidth(statusText) + 8;
    const revW = doc.getTextWidth(revText) + 8;
    const badgeY = compact ? 6 : 7;
    let badgeX = pageWidth - margin - statusW;

    setFill(text(data.prestart.completed_at) ? C.greenSoft : C.soft2);
    setDraw(text(data.prestart.completed_at) ? [187, 247, 208] : C.line);
    doc.roundedRect(badgeX, badgeY, statusW, badgeH, 2.5, 2.5, "FD");
    setText(text(data.prestart.completed_at) ? C.green : C.slate);
    doc.text(statusText, badgeX + statusW / 2, badgeY + 4.65, {
      align: "center",
    });

    badgeX -= revW + 3;
    setFill(C.soft2);
    setDraw(C.line);
    doc.roundedRect(badgeX, badgeY, revW, badgeH, 2.5, 2.5, "FD");
    setText(C.ink);
    doc.text(revText, badgeX + revW / 2, badgeY + 4.65, {
      align: "center",
    });

    if (!compact) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.9);
      setText(C.muted);
      doc.text(
        `Conducted by ${text(data.prestart.conducted_by_name) || "-"}`,
        pageWidth - margin,
        20.5,
        { align: "right" },
      );
    }

    setFill(C.accent);
    doc.rect(margin, compact ? 20 : 27, contentWidth, 0.9, "F");

    return compact ? 25 : 32;
  }

  function footer() {
    setDraw(C.line);
    doc.setLineWidth(0.2);
    doc.line(margin, footerTop, pageWidth - margin, footerTop);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    setText(C.muted);

    const footerLeft = `${companyName}  |  Generated by TTTracker  |  Uncontrolled when printed`;
    doc.text(footerLeft, margin, pageHeight - 5.2);
    doc.text(
      `Page ${doc.getNumberOfPages()}`,
      pageWidth - margin,
      pageHeight - 5.2,
      { align: "right" },
    );
  }

  function newPage() {
    footer();
    doc.addPage();
    return header(true);
  }

  function ensureSpace(y: number, needed: number) {
    if (y + needed <= footerTop - 3) return y;
    return newPage();
  }

  function drawLabelValue(
    x: number,
    y: number,
    width: number,
    label: string,
    value: string,
    options?: { emphasize?: boolean },
  ) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.1);
    setText(C.muted);
    doc.text(label.toUpperCase(), x, y);

    doc.setFont("helvetica", options?.emphasize ? "bold" : "normal");
    doc.setFontSize(options?.emphasize ? 9.2 : 8.2);
    setText(C.ink);

    const lines = doc.splitTextToSize(value || "-", width) as string[];
    doc.text(lines.slice(0, 2), x, y + 5.3);
  }

  function drawSummary(y: number) {
    const leftW = 112;
    const gap = 5;
    const rightW = contentWidth - leftW - gap;
    const h = 30;

    setFill(C.white);
    setDraw(C.line);
    doc.setLineWidth(0.25);
    doc.roundedRect(margin, y, leftW, h, 2.5, 2.5, "FD");
    doc.roundedRect(margin + leftW + gap, y, rightW, h, 2.5, 2.5, "FD");

    setFill(C.accent);
    doc.roundedRect(margin, y, 1.8, h, 0.9, 0.9, "F");

    drawLabelValue(
      margin + 6,
      y + 6,
      leftW - 12,
      "Project",
      projectLabel || "-",
      { emphasize: true },
    );
    drawLabelValue(
      margin + 6,
      y + 19,
      leftW - 12,
      "Site / Location",
      text(data.prestart.location) || "-",
    );

    const rx = margin + leftW + gap + 6;
    const colGap = 6;
    const colW = (rightW - 12 - colGap) / 2;

    drawLabelValue(
      rx,
      y + 6,
      colW,
      "Prestart No.",
      text(data.prestart.prestart_number) || "-",
      { emphasize: true },
    );
    drawLabelValue(
      rx + colW + colGap,
      y + 6,
      colW,
      "Date",
      formatDate(data.prestart.prestart_date),
      { emphasize: true },
    );
    drawLabelValue(
      rx,
      y + 19,
      colW,
      "Conducted By",
      text(data.prestart.conducted_by_name) || "-",
    );
    drawLabelValue(
      rx + colW + colGap,
      y + 19,
      colW,
      "Completed",
      formatDateTime(data.prestart.completed_at),
    );

    return y + h + 5;
  }

  function drawSection(
    title: string,
    value: string,
    y: number,
    options?: { note?: string | null },
  ) {
    const body = value || "-";
    const innerW = contentWidth - 10;
    const lines = doc.splitTextToSize(body, innerW) as string[];
    const note = text(options?.note);
    const lineHeight = 4.1;
    let lineIndex = 0;
    let first = true;

    while (lineIndex < lines.length || first) {
      y = ensureSpace(y, 22);
      const available = footerTop - 3 - y;
      const headerH = 9;
      const noteH = first && note ? 5 : 0;
      const bodyAvailable = Math.max(8, available - headerH - noteH - 7);
      const maxLines = Math.max(1, Math.floor(bodyAvailable / lineHeight));
      const chunk = lines.slice(lineIndex, lineIndex + maxLines);
      const bodyH = Math.max(11, chunk.length * lineHeight + 6);
      const totalH = headerH + noteH + bodyH;

      if (totalH > available && available < 28) {
        y = newPage();
        continue;
      }

      setDraw(C.line);
      setFill(C.white);
      doc.setLineWidth(0.25);
      doc.roundedRect(margin, y, contentWidth, totalH, 2.4, 2.4, "FD");

      setFill(C.ink);
      doc.roundedRect(margin, y, contentWidth, headerH, 2.4, 2.4, "F");
      // square off the lower header corners so it reads as one card.
      doc.rect(margin, y + headerH - 2.4, contentWidth, 2.4, "F");
      setFill(C.accent);
      doc.rect(margin, y, 2.2, headerH, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.7);
      setText(C.white);
      doc.text(
        first ? title : `${title} (continued)`,
        margin + 6,
        y + 5.8,
      );

      let textY = y + headerH + 6;

      if (first && note) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.7);
        setText(C.muted);
        doc.text(note, margin + 5, textY - 1.2);
        textY += noteH;
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.4);
      setText(C.slate);
      doc.text(chunk.length ? chunk : ["-"], margin + 5, textY);

      lineIndex += chunk.length || 1;
      y += totalH + 5;
      first = false;

      if (lineIndex < lines.length) {
        y = newPage();
      }
    }

    return y;
  }

  function drawRevisionHistory(y: number) {
    if (data.revisions.length <= 1) return y;

    y = ensureSpace(y, 24);

    const rows = data.revisions.map((revision) => ({
      revision: `Rev ${revision.revision_no}`,
      when: formatDateTime(revision.created_at),
      by: text(revision.created_by_name) || "-",
      note: text(revision.revision_note) || "Discussion points updated",
    }));

    const columns = {
      revision: 22,
      when: 40,
      by: 48,
      note: contentWidth - 22 - 40 - 48,
    };

    const drawHeader = (atY: number) => {
      setFill(C.ink);
      setDraw(C.ink);
      doc.roundedRect(margin, atY, contentWidth, 9, 2.2, 2.2, "F");
      doc.rect(margin, atY + 6.5, contentWidth, 2.5, "F");

      const labels: [string, number][] = [
        ["REVISION", columns.revision],
        ["CREATED", columns.when],
        ["CREATED BY", columns.by],
        ["REVISION NOTE", columns.note],
      ];

      let x = margin;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      setText(C.white);
      labels.forEach(([label, width]) => {
        doc.text(label, x + 2.5, atY + 5.8);
        x += width;
      });

      return atY + 9;
    };

    y = drawHeader(y);

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowH = 11;

      if (y + rowH > footerTop - 3) {
        y = newPage();
        y = drawHeader(y);
      }

      setFill(index % 2 === 0 ? C.white : C.soft);
      setDraw(C.line);
      doc.rect(margin, y, contentWidth, rowH, "FD");

      const values: [string, number][] = [
        [row.revision, columns.revision],
        [row.when, columns.when],
        [row.by, columns.by],
        [row.note, columns.note],
      ];

      let x = margin;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.1);
      setText(C.slate);

      values.forEach(([value, width]) => {
        const wrapped = doc.splitTextToSize(value, width - 5) as string[];
        doc.text(wrapped.slice(0, 2), x + 2.5, y + 4.5);
        x += width;
      });

      y += rowH;
    }

    return y + 5;
  }

  function drawAttendance(y: number) {
    y = ensureSpace(y, 28);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    setText(C.ink);
    doc.text("SIGNED ATTENDANCE", margin, y + 1.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    setText(C.muted);
    doc.text(
      "Employees shown below signed the current discussion revision.",
      margin,
      y + 6.5,
    );

    y += 10;

    const columns = {
      payroll: 25,
      name: 50,
      breath: 28,
      signed: 41,
      revision: 18,
      signature: contentWidth - 25 - 50 - 28 - 41 - 18,
    };

    const drawTableHeader = (atY: number) => {
      const labels: [string, number][] = [
        ["PAYROLL ID", columns.payroll],
        ["EMPLOYEE", columns.name],
        ["BREATHALYSER", columns.breath],
        ["SIGNED", columns.signed],
        ["REV", columns.revision],
        ["SIGNATURE", columns.signature],
      ];

      setFill(C.ink);
      setDraw(C.ink);
      doc.roundedRect(margin, atY, contentWidth, 9, 2, 2, "F");
      doc.rect(margin, atY + 6.5, contentWidth, 2.5, "F");

      let x = margin;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.4);
      setText(C.white);
      labels.forEach(([label, width]) => {
        doc.text(label, x + 2.5, atY + 5.8);
        x += width;
      });

      return atY + 9;
    };

    y = drawTableHeader(y);

    const latestAttendees = data.attendees
      .filter(
        (attendee) =>
          Number(attendee.discussion_revision_no) ===
          Number(data.prestart.current_revision),
      )
      .sort((a, b) => a.employee_name.localeCompare(b.employee_name));

    for (let attendeeIndex = 0; attendeeIndex < latestAttendees.length; attendeeIndex += 1) {
      const attendee = latestAttendees[attendeeIndex];
      const rowHeight = 18;

      if (y + rowHeight > footerTop - 3) {
        y = newPage();
        y = drawTableHeader(y);
      }

      setFill(attendeeIndex % 2 === 0 ? C.white : C.soft);
      setDraw(C.line);
      doc.setLineWidth(0.25);
      doc.rect(margin, y, contentWidth, rowHeight, "FD");

      const cells: [number, string, "left" | "center"][] = [
        [columns.payroll, text(attendee.payroll_id) || "-", "left"],
        [columns.name, text(attendee.employee_name) || "Employee", "left"],
        [columns.breath, breathalyser(attendee.breathalyser_reading), "center"],
        [columns.signed, formatDateTime(attendee.signed_at), "left"],
        [columns.revision, `R${attendee.discussion_revision_no}`, "center"],
      ];

      let x = margin;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.2);
      setText(C.slate);

      cells.forEach(([width, value, align]) => {
        setDraw(C.line);
        doc.line(x + width, y, x + width, y + rowHeight);

        if (align === "center") {
          doc.text(value, x + width / 2, y + 10.7, { align: "center" });
        } else {
          const wrapped = doc.splitTextToSize(value, width - 5) as string[];
          doc.text(wrapped.slice(0, 2), x + 2.5, y + 7.1);
        }

        x += width;
      });

      const strokes = normaliseStrokes(attendee.signature_strokes);
      const sourceWidth = Math.max(1, number(attendee.signature_width, 320));
      const sourceHeight = Math.max(1, number(attendee.signature_height, 140));

      if (strokes.length) {
        const rawW = Math.max(sourceWidth, 1);
        const rawH = Math.max(sourceHeight, 1);
        const maxW = columns.signature - 8;
        const maxH = rowHeight - 6;
        const scale = Math.min(maxW / rawW, maxH / rawH);
        const drawW = rawW * scale;
        const drawH = rawH * scale;
        const drawX = x + (columns.signature - drawW) / 2;
        const drawY = y + (rowHeight - drawH) / 2;

        setDraw(C.ink);
        doc.setLineWidth(0.28);

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
      } else {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(6.7);
        setText(C.muted);
        doc.text("Signature captured electronically", x + columns.signature / 2, y + 10.5, {
          align: "center",
        });
      }

      y += rowHeight;
    }

    if (latestAttendees.length === 0) {
      const rowHeight = 16;
      setFill(C.soft);
      setDraw(C.line);
      doc.rect(margin, y, contentWidth, rowHeight, "FD");
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.4);
      setText(C.muted);
      doc.text("No signed attendees were recorded for the current revision.", margin + 4, y + 9.5);
      y += rowHeight;
    }

    return { y: y + 5, latestAttendees };
  }

  function drawDeclaration(y: number, declaration: string) {
    const body = text(declaration);
    if (!body) return y;

    const lines = doc.splitTextToSize(body, contentWidth - 12) as string[];
    const h = Math.max(18, lines.length * 4 + 13);
    y = ensureSpace(y, h + 3);

    setFill(C.soft);
    setDraw(C.line);
    doc.roundedRect(margin, y, contentWidth, h, 2.2, 2.2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    setText(C.ink);
    doc.text("SIGNED DECLARATION", margin + 5, y + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setText(C.slate);
    doc.text(lines, margin + 5, y + 12);

    return y + h + 4;
  }

  let y = header(false);
  y = drawSummary(y);

  const revisionNote = text(data.currentRevision.revision_note);
  y = drawSection(
    `DISCUSSION POINTS - REVISION ${data.currentRevision.revision_no}`,
    text(data.currentRevision.discussion_points),
    y,
    {
      note: revisionNote
        ? `Revision note: ${revisionNote}`
        : `Issued ${formatDateTime(data.currentRevision.created_at)} by ${text(data.currentRevision.created_by_name) || "-"}`,
    },
  );

  if (text(data.prestart.admin_notes)) {
    y = drawSection("SITE / ADMIN NOTES", text(data.prestart.admin_notes), y);
  }

  y = drawRevisionHistory(y);

  const attendance = drawAttendance(y);
  y = attendance.y;

  const declaration = attendance.latestAttendees[0]?.declaration_text;
  y = drawDeclaration(y, declaration);

  footer();

  return new Uint8Array(doc.output("arraybuffer"));
}
