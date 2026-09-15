import { jsPDF } from "jspdf";

export type RevisionPdfBranding = {
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

export type RevisionPdfPhoto = {
  id: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  capturedAt?: string | null;
  uploadedByLabel?: string | null;
};

export type RevisionPdfItem = {
  itemNumber: number;
  issueType: string;
  towerSegment?: string | null;
  memberNumber?: string | null;
  drawingNumber?: string | null;
  finding: string;
  rectificationComment: string;
  status: string;
  beforeTakenAt?: string | null;
  beforeTakenByLabel?: string | null;
  afterTakenAt?: string | null;
  afterTakenByLabel?: string | null;
  beforePhotos: RevisionPdfPhoto[];
  afterPhotos: RevisionPdfPhoto[];
};

export type RevisionPdfData = {
  projectName: string;
  projectNumber: string;
  towerName: string;
  fliNumber: string;
  reportRevision: number;
  inspectionStage: string;
  inspectionDate: string;
  clientInspector?: string | null;
  clientCompany?: string | null;
  clientReference?: string | null;
  notes?: string | null;
  generatedBy: string;
  generatedAt: string;
  branding?: RevisionPdfBranding | null;
  items: RevisionPdfItem[];
};

const C = {
  navy: [15, 23, 42] as const,
  slate: [71, 85, 105] as const,
  muted: [100, 116, 139] as const,
  border: [203, 213, 225] as const,
  soft: [248, 250, 252] as const,
  white: [255, 255, 255] as const,
  green: [4, 120, 87] as const,
};

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function date(value: string | null | undefined, withTime = false) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime
      ? { hour: "2-digit", minute: "2-digit", hour12: true }
      : {}),
  }).format(parsed);
}

function imageFormat(mimeType: string, dataUrl: string) {
  const type = mimeType.toLowerCase();
  if (type.includes("png") || dataUrl.startsWith("data:image/png")) return "PNG";
  return "JPEG";
}

export function generateRevisionPdf(data: RevisionPdfData): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 13;
  const contentWidth = pageWidth - margin * 2;

  const setText = (rgb: readonly [number, number, number]) =>
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  const setFill = (rgb: readonly [number, number, number]) =>
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  const setDraw = (rgb: readonly [number, number, number]) =>
    doc.setDrawColor(rgb[0], rgb[1], rgb[2]);

  function businessLine() {
    const branding = data.branding;
    if (!branding) return "";
    const address = [
      [branding.addressLine1, branding.addressLine2].filter(Boolean).join(", "),
      [branding.suburb, branding.state, branding.postcode].filter(Boolean).join(" "),
    ].filter(Boolean);
    return [
      branding.abn ? `ABN ${branding.abn}` : "",
      ...address,
      branding.phone || "",
      branding.email || "",
      branding.website || "",
    ]
      .filter(Boolean)
      .join("  •  ");
  }

  function drawHeader() {
    setFill(C.white);
    doc.rect(0, 0, pageWidth, 34, "F");

    const logo = data.branding?.logoDataUrl;
    if (logo?.startsWith("data:image/")) {
      try {
        doc.addImage(
          logo,
          imageFormat("", logo),
          margin,
          6,
          24,
          14,
          undefined,
          "FAST",
        );
      } catch {
        // Fall back to company text below.
      }
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    setText(C.navy);
    doc.text("FIELD INSPECTION / RECTIFICATION REPORT", 43, 11.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setText(C.slate);
    doc.text(
      [data.projectNumber, data.projectName].filter(Boolean).join(" - ") || "Project",
      43,
      17.5,
    );
    doc.text(`${data.towerName}  •  ${data.fliNumber}`, 43, 22.5);

    const details = businessLine();
    if (details) {
      doc.setFontSize(6.2);
      setText(C.muted);
      const lines = doc.splitTextToSize(details, 145) as string[];
      doc.text(lines.slice(0, 2), 43, 27.2);
    }

    setFill([236, 253, 245]);
    doc.roundedRect(168, 7, 29, 13, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setText(C.green);
    doc.text(`R${String(data.reportRevision).padStart(2, "0")}`, 182.5, 15, {
      align: "center",
    });

    setDraw(C.border);
    doc.line(margin, 34, pageWidth - margin, 34);
  }

  function drawFooter() {
    const total = doc.getNumberOfPages();
    for (let page = 1; page <= total; page += 1) {
      doc.setPage(page);
      setDraw(C.border);
      doc.line(margin, 283, pageWidth - margin, 283);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      setText(C.muted);
      doc.text(
        "TTTracker · BC Contracting · Controlled Quality Record · Uncontrolled when printed",
        margin,
        288,
      );
      doc.text(`Page ${page} of ${total}`, pageWidth - margin, 288, {
        align: "right",
      });
    }
  }

  function keyValue(x: number, y: number, label: string, value: string, width = 84) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    setText(C.muted);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    setText(C.navy);
    const lines = doc.splitTextToSize(value || "-", width) as string[];
    doc.text(lines.slice(0, 2), x, y + 4.5);
  }

  function drawPhoto(
    photo: RevisionPdfPhoto | undefined,
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
  ) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setText(C.navy);
    doc.text(title.toUpperCase(), x, y - 2.5);

    setFill(C.soft);
    setDraw(C.border);
    doc.roundedRect(x, y, width, height, 2, 2, "FD");

    if (!photo?.dataUrl) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      setText(C.muted);
      doc.text("No photo", x + width / 2, y + height / 2, { align: "center" });
      return;
    }

    try {
      const props = doc.getImageProperties(photo.dataUrl);
      const ratio = props.width / props.height;
      let drawWidth = width - 4;
      let drawHeight = drawWidth / ratio;
      if (drawHeight > height - 4) {
        drawHeight = height - 4;
        drawWidth = drawHeight * ratio;
      }
      const drawX = x + (width - drawWidth) / 2;
      const drawY = y + (height - drawHeight) / 2;
      doc.addImage(
        photo.dataUrl,
        imageFormat(photo.mimeType, photo.dataUrl),
        drawX,
        drawY,
        drawWidth,
        drawHeight,
        undefined,
        "FAST",
      );
    } catch {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      setText(C.muted);
      doc.text("Photo could not be rendered", x + width / 2, y + height / 2, {
        align: "center",
      });
    }
  }

  // Cover / register summary.
  drawHeader();
  let y = 43;

  setFill(C.soft);
  setDraw(C.border);
  doc.roundedRect(margin, y, contentWidth, 49, 2, 2, "FD");
  keyValue(margin + 4, y + 7, "Inspection stage", data.inspectionStage, 52);
  keyValue(margin + 63, y + 7, "Inspection date", date(data.inspectionDate), 45);
  keyValue(margin + 112, y + 7, "Client reference", text(data.clientReference) || "-", 64);
  keyValue(margin + 4, y + 25, "Client inspector", text(data.clientInspector) || "-", 52);
  keyValue(margin + 63, y + 25, "Client / company", text(data.clientCompany) || "-", 45);
  keyValue(margin + 112, y + 25, "Findings", String(data.items.length), 64);

  y += 58;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  setText(C.navy);
  doc.text("Inspection / Rectification Summary", margin, y);
  y += 6;

  const headers = ["Item", "Issue", "Segment", "Member", "Status"];
  const widths = [14, 68, 38, 36, 28];
  const rowHeight = 8;
  let x = margin;
  setFill([241, 245, 249]);
  setDraw(C.border);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  setText(C.slate);
  headers.forEach((header, index) => {
    doc.rect(x, y, widths[index], rowHeight, "FD");
    doc.text(header, x + 2, y + 5);
    x += widths[index];
  });
  y += rowHeight;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  for (const item of data.items) {
    if (y > 270) {
      doc.addPage();
      drawHeader();
      y = 43;
    }
    const cells = [
      String(item.itemNumber).padStart(3, "0"),
      item.issueType || "Other",
      text(item.towerSegment) || "-",
      text(item.memberNumber) || "-",
      item.status,
    ];
    x = margin;
    cells.forEach((cell, index) => {
      doc.rect(x, y, widths[index], rowHeight);
      const wrapped = doc.splitTextToSize(cell, widths[index] - 3) as string[];
      doc.text(wrapped.slice(0, 1), x + 1.5, y + 5);
      x += widths[index];
    });
    y += rowHeight;
  }

  if (data.notes) {
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setText(C.slate);
    doc.text("NOTES", margin, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setText(C.navy);
    doc.text((doc.splitTextToSize(data.notes, contentWidth) as string[]).slice(0, 8), margin, y);
  }

  // One controlled before/after sheet per finding.
  for (const item of data.items) {
    doc.addPage();
    drawHeader();
    let iy = 42;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    setText(C.navy);
    doc.text(
      `ITEM ${String(item.itemNumber).padStart(3, "0")} · ${item.issueType || "Other"}`,
      margin,
      iy,
    );
    iy += 8;

    setFill(C.soft);
    setDraw(C.border);
    doc.roundedRect(margin, iy, contentWidth, 44, 2, 2, "FD");
    keyValue(margin + 4, iy + 7, "Tower segment", text(item.towerSegment) || "-", 50);
    keyValue(margin + 59, iy + 7, "Member", text(item.memberNumber) || "-", 38);
    keyValue(margin + 103, iy + 7, "Drawing", text(item.drawingNumber) || "-", 70);
    keyValue(margin + 4, iy + 24, "Finding", item.finding, 82);
    keyValue(margin + 96, iy + 24, "Status", item.status, 70);
    iy += 53;

    drawPhoto(item.beforePhotos[0], margin, iy, 88, 76, "Before");
    drawPhoto(item.afterPhotos[0], margin + 96, iy, 88, 76, "After");
    iy += 84;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    setText(C.muted);
    doc.text("BEFORE CAPTURE", margin, iy);
    doc.text("AFTER CAPTURE", margin + 96, iy);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    setText(C.slate);
    doc.text(
      `${date(item.beforeTakenAt, true)} · ${text(item.beforeTakenByLabel) || "-"}`,
      margin,
      iy + 4.5,
    );
    doc.text(
      `${date(item.afterTakenAt, true)} · ${text(item.afterTakenByLabel) || "-"}`,
      margin + 96,
      iy + 4.5,
    );
    iy += 14;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setText(C.navy);
    doc.text("RECTIFICATION", margin, iy);
    iy += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setText(C.slate);
    const rectification = doc.splitTextToSize(item.rectificationComment || "-", contentWidth) as string[];
    doc.text(rectification.slice(0, 7), margin, iy);

    const extraBefore = item.beforePhotos.slice(1);
    const extraAfter = item.afterPhotos.slice(1);
    const extraCount = Math.max(extraBefore.length, extraAfter.length);

    for (let index = 0; index < extraCount; index += 1) {
      doc.addPage();
      drawHeader();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      setText(C.navy);
      doc.text(
        `ITEM ${String(item.itemNumber).padStart(3, "0")} · ADDITIONAL EVIDENCE ${index + 1}`,
        margin,
        43,
      );
      drawPhoto(extraBefore[index], margin, 55, 88, 165, "Additional Before");
      drawPhoto(extraAfter[index], margin + 96, 55, 88, 165, "Additional After");
    }
  }

  doc.addPage();
  drawHeader();
  y = 48;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  setText(C.navy);
  doc.text("REPORT CONTROL", margin, y);
  y += 10;
  keyValue(margin, y, "Report", data.fliNumber, 82);
  keyValue(margin + 96, y, "Revision", `R${String(data.reportRevision).padStart(2, "0")}`, 82);
  y += 18;
  keyValue(margin, y, "Generated by", data.generatedBy, 82);
  keyValue(margin + 96, y, "Generated", date(data.generatedAt, true), 82);
  y += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setText(C.slate);
  const statement =
    "This report records field inspection findings and the before/after evidence retained by BC Contracting in TTTracker and SharePoint. It is a controlled record at the revision shown above.";
  doc.text(doc.splitTextToSize(statement, contentWidth), margin, y);

  drawFooter();
  return new Uint8Array(doc.output("arraybuffer"));
}
