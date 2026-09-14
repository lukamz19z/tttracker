import { jsPDF } from "jspdf";

export type ExpenseClaimPdfBranding = {
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

export type ExpenseClaimPdfItem = {
  expenseDate?: string | null;
  category?: string | null;
  supplier?: string | null;
  description?: string | null;
  amountExGst?: number | null;
  gstAmount?: number | null;
  amountIncGst?: number | null;
  notes?: string | null;
};

export type ExpenseClaimPdfData = {
  submissionNumber: string;
  revision: number;
  description?: string | null;
  notes?: string | null;
  projectLabel?: string | null;
  submittedBy?: string | null;
  submittedAt?: string | null;
  approvedBy: string;
  approvedByEmail?: string | null;
  approvedAt: string;
  subtotalExGst?: number | null;
  gstAmount?: number | null;
  totalAmount?: number | null;
  receiptNames?: string[];
  items: ExpenseClaimPdfItem[];
  branding?: ExpenseClaimPdfBranding | null;
};

const C = {
  navy: [15, 23, 42] as const,
  slate: [71, 85, 105] as const,
  light: [241, 245, 249] as const,
  line: [203, 213, 225] as const,
  white: [255, 255, 255] as const,
  green: [4, 120, 87] as const,
};

function money(value: unknown) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(Number(value ?? 0) || 0);
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function generateExpenseClaimPdf(
  data: ExpenseClaimPdfData,
): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 16;

  function setText(rgb: readonly [number, number, number]) {
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  }

  function setFill(rgb: readonly [number, number, number]) {
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  }

  function setDraw(rgb: readonly [number, number, number]) {
    doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  }

  function addPageIfNeeded(height = 14) {
    if (y + height <= pageHeight - 18) return;
    doc.addPage();
    y = 16;
    drawPageHeader(false);
  }

  function line(label: string, value: string) {
    addPageIfNeeded(8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    setText(C.slate);
    doc.text(label, margin, y);

    doc.setFont("helvetica", "bold");
    setText(C.navy);
    const lines = doc.splitTextToSize(value || "—", contentWidth - 42);
    doc.text(lines, margin + 42, y);
    y += Math.max(6, lines.length * 4.4);
  }

  function section(title: string) {
    addPageIfNeeded(12);
    y += 2;
    setFill(C.light);
    doc.roundedRect(margin, y, contentWidth, 8, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setText(C.navy);
    doc.text(title.toUpperCase(), margin + 3, y + 5.3);
    y += 12;
  }

  function drawPageHeader(first = true) {
    const branding = data.branding;

    if (first && branding?.logoDataUrl?.startsWith("data:image/")) {
      try {
        const format = branding.logoDataUrl.startsWith("data:image/jpeg")
          ? "JPEG"
          : "PNG";
        doc.addImage(branding.logoDataUrl, format, margin, 8, 25, 14, undefined, "FAST");
      } catch {
        // Continue with the company name when an uploaded logo cannot be rendered.
      }
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(first ? 16 : 10);
    setText(C.navy);
    doc.text(first ? "EXPENSE CLAIM" : data.submissionNumber, first ? 45 : margin, first ? 14 : 10);

    if (first) {
      doc.setFontSize(9);
      setText(C.slate);
      doc.text(text(branding?.companyName) || "BC Contracting", 45, 20);
      doc.setFont("helvetica", "bold");
      setText(C.green);
      doc.text(`${data.submissionNumber} · R${String(data.revision).padStart(2, "0")}`, 45, 25);
      y = 34;
    } else {
      y = 16;
    }
  }

  drawPageHeader(true);

  section("Claim Details");
  line("Reference", data.submissionNumber);
  line("Project", text(data.projectLabel) || "Company / General");
  line("Description", text(data.description) || "Expense Claim");
  line("Submitted by", text(data.submittedBy) || "—");
  line("Submitted", dateLabel(data.submittedAt));

  if (text(data.notes)) {
    line("Notes", text(data.notes));
  }

  section("Expense Items");

  data.items.forEach((item, index) => {
    const description = text(item.description) || `Expense item ${index + 1}`;
    const detail = [
      dateLabel(item.expenseDate),
      text(item.category),
      text(item.supplier),
    ]
      .filter(Boolean)
      .join(" · ");

    const descriptionLines = doc.splitTextToSize(description, 108);
    const rowHeight = Math.max(13, descriptionLines.length * 4.2 + 8);
    addPageIfNeeded(rowHeight + 2);

    setDraw(C.line);
    doc.roundedRect(margin, y, contentWidth, rowHeight, 1.5, 1.5, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    setText(C.navy);
    doc.text(descriptionLines, margin + 3, y + 5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setText(C.slate);
    doc.text(detail || "Expense item", margin + 3, y + rowHeight - 3.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setText(C.navy);
    doc.text(money(item.amountIncGst), pageWidth - margin - 3, y + 5, {
      align: "right",
    });

    y += rowHeight + 3;
  });

  section("Totals");
  line("Amount ex GST", money(data.subtotalExGst));
  line("GST", money(data.gstAmount));
  line("Total incl GST", money(data.totalAmount));

  section("Receipts");
  if (data.receiptNames?.length) {
    for (const name of data.receiptNames) {
      addPageIfNeeded(6);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      setText(C.navy);
      doc.text(`• ${name}`, margin + 2, y);
      y += 5;
    }
  } else {
    line("Receipts", "No receipt metadata was available when the PDF was generated.");
  }

  section("Approval");
  line("Status", "APPROVED");
  line("Approved by", data.approvedBy);
  line("Approver email", text(data.approvedByEmail) || "—");
  line("Approved", dateLabel(data.approvedAt));

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    setDraw(C.line);
    doc.line(margin, 282, pageWidth - margin, 282);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    setText(C.slate);
    doc.text("TTTracker · Controlled Finance record · Uncontrolled when printed", margin, 287);
    doc.text(`Page ${page} of ${pages}`, pageWidth - margin, 287, { align: "right" });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
