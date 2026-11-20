import { ensureDriveFolder, uploadDriveItemContent, type SharePointDriveItem } from "@/lib/sharepoint/graph";

export function liftSharePointFolderName() {
  const configured = process.env.LIFT_ENGINEERING_SHAREPOINT_FOLDER?.trim();
  return configured || "Lift Engineering";
}

export async function ensureLiftStudyFolder({ driveId, projectFolderId, studyNumber, revisionLabel }: {
  driveId: string; projectFolderId: string; studyNumber: string; revisionLabel: string;
}) {
  const root = await ensureDriveFolder({ driveId, parentItemId: projectFolderId, name: liftSharePointFolderName() });
  const studies = await ensureDriveFolder({ driveId, parentItemId: root.id, name: "Studies" });
  const study = await ensureDriveFolder({ driveId, parentItemId: studies.id, name: safeName(studyNumber) });
  return ensureDriveFolder({ driveId, parentItemId: study.id, name: `Revision ${safeName(revisionLabel)}` });
}

function safeName(value: string) { return value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").slice(0, 100) || "Study"; }

export async function uploadLiftStudyPdf({ driveId, folderId, fileName, content }: {
  driveId: string; folderId: string; fileName: string; content: Uint8Array;
}): Promise<SharePointDriveItem> {
  return uploadDriveItemContent({ driveId, parentItemId: folderId, fileName: safeName(fileName), content, contentType: "application/pdf" });
}

export async function uploadLiftLibrarySource({ fileName, content, contentType }: { fileName: string; content: Uint8Array; contentType: string }) {
  const driveId = process.env.LIFT_ENGINEERING_LIBRARY_DRIVE_ID?.trim();
  const folderId = process.env.LIFT_ENGINEERING_LIBRARY_FOLDER_ID?.trim();
  if (!driveId || !folderId) throw new Error("Lift Engineering library SharePoint drive/folder is not configured.");
  const uploaded = await uploadDriveItemContent({ driveId, parentItemId: folderId, fileName: safeName(fileName), content, contentType });
  return { driveId, folderId, uploaded };
}
