import {
  ensureDriveFolder,
  uploadDriveItemContent,
} from "@/lib/sharepoint/graph";

export function safeQualitySharePointPart(value: string) {
  return (
    value
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/\.+$/g, "")
      .slice(0, 120) || "Item"
  );
}

async function ensurePath({
  driveId,
  rootFolderId,
  names,
}: {
  driveId: string;
  rootFolderId: string;
  names: string[];
}) {
  let parentId = rootFolderId;
  let last: Awaited<ReturnType<typeof ensureDriveFolder>> | null = null;

  for (const raw of names) {
    last = await ensureDriveFolder({
      driveId,
      parentItemId: parentId,
      name: safeQualitySharePointPart(raw),
    });
    parentId = last.id;
  }

  if (!last) throw new Error("Quality SharePoint folder could not be prepared.");
  return last;
}

export async function ensureQualityRoot({
  driveId,
  projectFolderId,
}: {
  driveId: string;
  projectFolderId: string;
}) {
  return ensurePath({
    driveId,
    rootFolderId: projectFolderId,
    names: ["03 Quality"],
  });
}

export async function ensureDefectPhotosFolder({
  driveId,
  projectFolderId,
  towerLabel,
  defectNumber,
}: {
  driveId: string;
  projectFolderId: string;
  towerLabel: string;
  defectNumber: string;
}) {
  const quality = await ensureQualityRoot({ driveId, projectFolderId });
  return ensurePath({
    driveId,
    rootFolderId: quality.id,
    names: ["Defects", towerLabel, defectNumber, "Photos"],
  });
}

export async function ensureRevisionFolder({
  driveId,
  projectFolderId,
  towerLabel,
  fliNumber,
}: {
  driveId: string;
  projectFolderId: string;
  towerLabel: string;
  fliNumber: string;
}) {
  const quality = await ensureQualityRoot({ driveId, projectFolderId });
  return ensurePath({
    driveId,
    rootFolderId: quality.id,
    names: ["Revisions", towerLabel, fliNumber],
  });
}

export async function ensureRevisionPhotoFolder({
  driveId,
  projectFolderId,
  towerLabel,
  fliNumber,
  photoType,
}: {
  driveId: string;
  projectFolderId: string;
  towerLabel: string;
  fliNumber: string;
  photoType: "before" | "after" | "supporting";
}) {
  const revisionFolder = await ensureRevisionFolder({
    driveId,
    projectFolderId,
    towerLabel,
    fliNumber,
  });

  const name =
    photoType === "before"
      ? "Before"
      : photoType === "after"
        ? "After"
        : "Supporting";

  return ensureDriveFolder({
    driveId,
    parentItemId: revisionFolder.id,
    name,
  });
}

export async function uploadQualityFile({
  driveId,
  folderId,
  fileName,
  content,
  contentType,
}: {
  driveId: string;
  folderId: string;
  fileName: string;
  content: Uint8Array | ArrayBuffer;
  contentType: string;
}) {
  return uploadDriveItemContent({
    driveId,
    parentItemId: folderId,
    fileName: safeQualitySharePointPart(fileName),
    content,
    contentType,
  });
}
