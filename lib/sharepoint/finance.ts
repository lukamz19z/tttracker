import {
  ensureDriveFolder,
  uploadDriveItemContent,
} from "@/lib/sharepoint/graph";

export function safeFinanceSharePointPart(value: string) {
  return (
    value
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/\.+$/g, "")
      .slice(0, 120) || "File"
  );
}

export function financeMonthParts(value?: string | null) {
  const parsed = value ? new Date(value) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  return {
    year: String(date.getUTCFullYear()),
    month: `${String(date.getUTCMonth() + 1).padStart(2, "0")} - ${date.toLocaleString(
      "en-AU",
      {
        month: "long",
        timeZone: "UTC",
      },
    )}`,
  };
}

async function ensurePath(driveId: string, names: string[]) {
  let parentId = "root";
  let lastFolder: Awaited<ReturnType<typeof ensureDriveFolder>> | null = null;

  for (const rawName of names) {
    lastFolder = await ensureDriveFolder({
      driveId,
      parentItemId: parentId,
      name: safeFinanceSharePointPart(rawName),
    });

    parentId = lastFolder.id;
  }

  if (!lastFolder) {
    throw new Error("A Finance SharePoint folder could not be prepared.");
  }

  return lastFolder;
}

export async function ensureExpenseClaimFolder({
  driveId,
  baseFolder,
  submissionNumber,
  anchorDate,
}: {
  driveId: string;
  baseFolder: string;
  submissionNumber: string;
  anchorDate?: string | null;
}) {
  const { year, month } = financeMonthParts(anchorDate);

  return ensurePath(driveId, [
    baseFolder || "Expenses & Invoices",
    "Expenses",
    year,
    month,
    submissionNumber,
  ]);
}

export async function ensureExpenseClaimReceiptsFolder({
  driveId,
  baseFolder,
  submissionNumber,
  anchorDate,
}: {
  driveId: string;
  baseFolder: string;
  submissionNumber: string;
  anchorDate?: string | null;
}) {
  const claimFolder = await ensureExpenseClaimFolder({
    driveId,
    baseFolder,
    submissionNumber,
    anchorDate,
  });

  return ensureDriveFolder({
    driveId,
    parentItemId: claimFolder.id,
    name: "Receipts",
  });
}

export async function uploadExpenseClaimFile({
  driveId,
  folderId,
  fileName,
  content,
  contentType,
}: {
  driveId: string;
  folderId: string;
  fileName: string;
  content: Uint8Array;
  contentType: string;
}) {
  return uploadDriveItemContent({
    driveId,
    parentItemId: folderId,
    fileName: safeFinanceSharePointPart(fileName),
    content,
    contentType,
  });
}
