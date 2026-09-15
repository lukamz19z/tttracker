import {
  ensureDriveFolder,
  uploadDriveItemContent,
} from "@/lib/sharepoint/graph";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function safeName(value: unknown, fallback: string) {
  const cleaned = clean(value)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .trim();

  return cleaned || fallback;
}

export function buildSitePrestartPdfFileName({
  prestartNumber,
  prestartDate,
  location,
}: {
  prestartNumber: string;
  prestartDate: string;
  location: string;
}) {
  return `${safeName(prestartNumber, "Site-Prestart")} - ${safeName(
    prestartDate,
    "Date",
  )} - ${safeName(location, "Site")}.pdf`;
}

export async function publishSitePrestartPdfToSharePoint({
  driveId,
  projectFolderId,
  prestartNumber,
  prestartDate,
  location,
  pdf,
}: {
  driveId: string;
  projectFolderId: string;
  prestartNumber: string;
  prestartDate: string;
  location: string;
  pdf: Uint8Array;
}) {
  if (!clean(driveId) || !clean(projectFolderId)) {
    throw new Error(
      "This project is not linked to its Project Delivery SharePoint folder.",
    );
  }

  const hseqFolder = await ensureDriveFolder({
    driveId,
    parentItemId: projectFolderId,
    name: "04 HSEQ",
  });

  const prestartsFolder = await ensureDriveFolder({
    driveId,
    parentItemId: hseqFolder.id,
    name: "Prestarts",
  });

  const date = clean(prestartDate).slice(0, 10);
  const year = date.slice(0, 4) || String(new Date().getFullYear());
  const month = date.slice(5, 7) || String(new Date().getMonth() + 1).padStart(2, "0");

  const yearFolder = await ensureDriveFolder({
    driveId,
    parentItemId: prestartsFolder.id,
    name: year,
  });

  const monthFolder = await ensureDriveFolder({
    driveId,
    parentItemId: yearFolder.id,
    name: month,
  });

  const fileName = buildSitePrestartPdfFileName({
    prestartNumber,
    prestartDate: date,
    location,
  });

  const item = await uploadDriveItemContent({
    driveId,
    parentItemId: monthFolder.id,
    fileName,
    content: pdf,
    contentType: "application/pdf",
  });

  return {
    fileName,
    folder: monthFolder,
    item,
  };
}
