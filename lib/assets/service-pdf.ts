import { jsPDF } from "jspdf";

import type {
  AssetServiceItemInput,
  AssetType,
} from "@/lib/assets/types";

type Branding = {
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

export type ServicePdfInput = {
  serviceNumber: string;
  assetType: AssetType;
  assetLabel: string;
  assetDetails: {
    registration?: string | null;
    serialNumber?: string | null;
    vin?: string | null;
    project?: string | null;
    crew?: string | null;
  };
  serviceDate: string;
  recordType: string;
  providerType: "internal" | "external";
  providerName?: string | null;
  mechanicName?: string | null;
  workOrderReference?: string | null;
  odometerKm?: number | null;
  engineHours?: number | null;
  summary: string;
  items: AssetServiceItemInput[];
  workCompleted?: string | null;
  recommendations?: string | null;
  followUpActions?: string | null;
  nextServiceDate?: string | null;
  nextServiceKm?: number | null;
  nextServiceHours?: number | null;
  supplier?: string | null;
  invoiceNumber?: string | null;
  amountExGst?: number | null;
  gstAmount?: number | null;
  amountIncGst?: number | null;
  completedAt: string;
  branding?: Branding;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function dateLabel(value: unknown) {
  const raw = clean(value);
  if (!raw) return "—";

  const parsed = new Date(
    raw.length <= 10 ? `${raw.slice(0, 10)}T00:00:00` : raw,
  );

  if (Number.isNaN(parsed.getTime())) return raw;

  return parsed.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function dateTimeLabel(value: unknown) {
  const raw = clean(value);
  if (!raw) return "—";

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;

  return parsed.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function money(value: unknown) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(Number(value ?? 0) || 0);
}

function titleCase(value: unknown) {
  const text = clean(value).replace(/[_-]+/g, " ");
  return text.replace(/\b\w/g, (character) =>
    character.toUpperCase(),
  );
}

export function generateAssetServicePdf(input: ServicePdfInput) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = width - margin * 2;

  const colours = {
    navy: [15, 23, 42] as const,
    slate: [71, 85, 105] as const,
    muted: [100, 116, 139] as const,
    border: [203, 213, 225] as const,
    fill: [248, 250, 252] as const,
    blue: [29, 78, 216] as const,
    green: [4, 120, 87] as const,
    amber: [180, 83, 9] as const,
    rose: [190, 24, 93] as const,
  };

  const setText = (rgb: readonly [number, number, number]) =>
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  const setDraw = (rgb: readonly [number, number, number]) =>
    doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  const setFill = (rgb: readonly [number, number, number]) =>
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);

  function header() {
    const logo = input.branding?.logoDataUrl;

    if (logo?.startsWith("data:image/")) {
      try {
        doc.addImage(
          logo,
          logo.startsWith("data:image/jpeg") ? "JPEG" : "PNG",
          margin,
          9,
          31,
          18,
          undefined,
          "FAST",
        );
      } catch {
        // Text fallback below.
      }
    }

    if (!logo?.startsWith("data:image/")) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      setText(colours.navy);
      doc.text(
        clean(input.branding?.companyName) || "BC Contracting",
        margin,
        18,
      );
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    setText(colours.navy);
    doc.text("ASSET SERVICE & REPAIR RECORD", 50, 15);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setText(colours.slate);
    doc.text(input.assetLabel, 50, 21);
    doc.text(
      `${input.serviceNumber}  •  ${dateLabel(input.serviceDate)}`,
      50,
      26,
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setText(colours.blue);
    doc.text(
      titleCase(input.recordType),
      width - margin,
      15,
      { align: "right" },
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    setText(colours.muted);
    doc.text(
      `Completed ${dateTimeLabel(input.completedAt)}`,
      width - margin,
      21,
      { align: "right" },
    );

    setDraw(colours.border);
    doc.line(margin, 32, width - margin, 32);
  }

  function footer() {
    setDraw(colours.border);
    doc.line(margin, height - 11, width - margin, height - 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    setText(colours.muted);
    doc.text(
      "Generated by TTTracker. Controlled electronic copy is stored in SharePoint. Uncontrolled when printed.",
      margin,
      height - 6.5,
    );
    doc.text(
      `Page ${doc.getNumberOfPages()}`,
      width - margin,
      height - 6.5,
      { align: "right" },
    );
  }

  function newPage() {
    footer();
    doc.addPage();
    header();
    return 38;
  }

  function ensureSpace(y: number, needed: number) {
    return y + needed > height - 16 ? newPage() : y;
  }

  function sectionTitle(title: string, y: number) {
    y = ensureSpace(y, 10);
    setFill(colours.fill);
    doc.roundedRect(margin, y, contentWidth, 8, 1.2, 1.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    setText(colours.navy);
    doc.text(title, margin + 3, y + 5.2);
    return y + 11;
  }

  function paragraph(value: unknown, y: number) {
    const text = clean(value) || "—";
    const lines = doc.splitTextToSize(text, contentWidth) as string[];
    const needed = Math.max(1, lines.length) * 4.2 + 1;
    y = ensureSpace(y, needed);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setText(colours.slate);
    doc.text(lines, margin, y);

    return y + needed;
  }

  function infoGrid(
    items: Array<[string, string]>,
    y: number,
  ) {
    const columns = 3;
    const gap = 3;
    const boxWidth =
      (contentWidth - gap * (columns - 1)) / columns;
    const boxHeight = 17;

    for (let index = 0; index < items.length; index += 1) {
      if (index > 0 && index % columns === 0) {
        y += boxHeight + gap;
      }

      y = ensureSpace(y, boxHeight + 1);

      const column = index % columns;
      const x = margin + column * (boxWidth + gap);
      const [label, value] = items[index];

      setFill(colours.fill);
      setDraw(colours.border);
      doc.roundedRect(x, y, boxWidth, boxHeight, 1, 1, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.2);
      setText(colours.muted);
      doc.text(label.toUpperCase(), x + 2.4, y + 4.8);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.4);
      setText(colours.navy);
      const wrapped = doc.splitTextToSize(
        value || "—",
        boxWidth - 4.8,
      ) as string[];
      doc.text(wrapped.slice(0, 2), x + 2.4, y + 9.5);
    }

    const rowCount = Math.ceil(items.length / columns);
    return y + boxHeight + (rowCount > 1 ? 0 : 0);
  }

  header();

  let y = 38;

  y = infoGrid(
    [
      ["Asset", input.assetLabel],
      ["Asset Type", titleCase(input.assetType)],
      ["Record Type", titleCase(input.recordType)],
      ["Registration", clean(input.assetDetails.registration) || "—"],
      [
        "Serial / VIN",
        clean(input.assetDetails.serialNumber) ||
          clean(input.assetDetails.vin) ||
          "—",
      ],
      [
        "Project / Crew",
        [clean(input.assetDetails.project), clean(input.assetDetails.crew)]
          .filter(Boolean)
          .join(" / ") || "—",
      ],
      [
        "Provider",
        input.providerType === "internal"
          ? "BC Contracting"
          : clean(input.providerName) ||
            clean(input.supplier) ||
            "External",
      ],
      ["Mechanic", clean(input.mechanicName) || "—"],
      ["Work Order", clean(input.workOrderReference) || "—"],
      [
        "Odometer",
        input.odometerKm === null ||
        input.odometerKm === undefined
          ? "—"
          : `${Number(input.odometerKm).toLocaleString("en-AU")} km`,
      ],
      [
        "Engine Hours",
        input.engineHours === null ||
        input.engineHours === undefined
          ? "—"
          : `${Number(input.engineHours).toLocaleString("en-AU")} h`,
      ],
      ["Service Date", dateLabel(input.serviceDate)],
    ],
    y,
  );

  y += 5;
  y = sectionTitle("Service Summary", y);
  y = paragraph(input.summary, y);

  y = sectionTitle("Issues / Inspection Findings / Rectification", y + 2);

  if (input.items.length === 0) {
    y = paragraph("No separate issue lines recorded.", y);
  } else {
    for (let index = 0; index < input.items.length; index += 1) {
      const item = input.items[index];
      const status = item.itemStatus || "resolved";
      const statusColour =
        status === "resolved"
          ? colours.green
          : status === "monitor"
            ? colours.amber
            : colours.rose;

      const issueLines = doc.splitTextToSize(
        clean(item.issue) || "Issue",
        contentWidth - 6,
      ) as string[];
      const diagnosisLines = doc.splitTextToSize(
        clean(item.diagnosis) || "—",
        contentWidth - 9,
      ) as string[];
      const fixLines = doc.splitTextToSize(
        clean(item.rectification) || "—",
        contentWidth - 9,
      ) as string[];
      const partsLines = doc.splitTextToSize(
        clean(item.partsUsed) || "—",
        contentWidth - 9,
      ) as string[];

      const needed =
        12 +
        issueLines.length * 3.8 +
        diagnosisLines.length * 3.5 +
        fixLines.length * 3.5 +
        partsLines.length * 3.5;

      y = ensureSpace(y, needed);

      setDraw(colours.border);
      doc.roundedRect(margin, y, contentWidth, needed - 2, 1.2, 1.2);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      setText(colours.navy);
      doc.text(
        `${index + 1}. ${issueLines[0] || "Issue"}`,
        margin + 3,
        y + 5,
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      setText(statusColour);
      doc.text(
        titleCase(status).toUpperCase(),
        width - margin - 3,
        y + 5,
        { align: "right" },
      );

      let itemY = y + 10;

      const detail = (
        label: string,
        lines: string[],
      ) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        setText(colours.muted);
        doc.text(label, margin + 3, itemY);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.4);
        setText(colours.slate);
        doc.text(lines, margin + 26, itemY);
        itemY += Math.max(1, lines.length) * 3.5 + 1;
      };

      detail("DIAGNOSIS", diagnosisLines);
      detail("FIX / ACTION", fixLines);
      detail("PARTS USED", partsLines);

      if (
        item.labourHours !== null &&
        item.labourHours !== undefined
      ) {
        detail(
          "LABOUR",
          [`${Number(item.labourHours).toFixed(2)} h`],
        );
      }

      y += needed + 1;
    }
  }

  if (clean(input.workCompleted)) {
    y = sectionTitle("Work Completed", y + 2);
    y = paragraph(input.workCompleted, y);
  }

  if (
    clean(input.recommendations) ||
    clean(input.followUpActions)
  ) {
    y = sectionTitle("Recommendations / Follow-up", y + 2);
    y = paragraph(
      [
        clean(input.recommendations)
          ? `Recommendations: ${clean(input.recommendations)}`
          : "",
        clean(input.followUpActions)
          ? `Follow-up: ${clean(input.followUpActions)}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      y,
    );
  }

  y = sectionTitle("Next Service / Cost Summary", y + 2);
  y = infoGrid(
    [
      ["Next Service", dateLabel(input.nextServiceDate)],
      [
        "Next KM",
        input.nextServiceKm === null ||
        input.nextServiceKm === undefined
          ? "—"
          : Number(input.nextServiceKm).toLocaleString("en-AU"),
      ],
      [
        "Next Hours",
        input.nextServiceHours === null ||
        input.nextServiceHours === undefined
          ? "—"
          : Number(input.nextServiceHours).toLocaleString("en-AU"),
      ],
      ["Supplier", clean(input.supplier) || "—"],
      ["Invoice", clean(input.invoiceNumber) || "—"],
      ["Total inc GST", money(input.amountIncGst)],
    ],
    y,
  );

  y += 5;
  y = sectionTitle("Record Confirmation", y);
  y = paragraph(
    `Prepared by ${clean(input.mechanicName) || "TTTracker user"} on ${dateTimeLabel(
      input.completedAt,
    )}. This structured service record is the searchable service history. Supporting invoices, reports and the generated service PDF are stored in the controlled Asset SharePoint folder.`,
    y,
  );

  footer();

  return new Uint8Array(doc.output("arraybuffer"));
}
