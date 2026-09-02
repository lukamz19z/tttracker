import {
  ensureDriveFolder,
  uploadDriveItemContent,
  type SharePointDriveItem,
} from "@/lib/sharepoint/graph";

import { sanitiseSharePointName } from "@/lib/sharepoint/projects";

const COMMERCIAL_FOLDER = "02 Commercial";
const DAILY_DOCKETS_FOLDER = "Daily Dockets";

export function buildDailyDocketPdfFileName({
  towerName,
  docketDate,
}: {
  towerName: string;
  docketDate: string;
}) {
  const safeTower =
    sanitiseSharePointName(towerName).replace(/\s+/g, "-") ||
    "Tower";

  return `BC-${safeTower}-DD-${docketDate}.pdf`;
}

export async function ensureDailyDocketTowerFolder({
  driveId,
  projectFolderId,
  towerName,
}: {
  driveId: string;
  projectFolderId: string;
  towerName: string;
}) {
  const commercialFolder = await ensureDriveFolder({
    driveId,
    parentItemId: projectFolderId,
    name: COMMERCIAL_FOLDER,
  });

  const dailyDocketsFolder = await ensureDriveFolder({
    driveId,
    parentItemId: commercialFolder.id,
    name: DAILY_DOCKETS_FOLDER,
  });

  const towerFolder = await ensureDriveFolder({
    driveId,
    parentItemId: dailyDocketsFolder.id,
    name: sanitiseSharePointName(towerName),
  });

  return {
    commercialFolder,
    dailyDocketsFolder,
    towerFolder,
  };
}

export async function publishDailyDocketPdfToSharePoint({
  driveId,
  projectFolderId,
  towerName,
  docketDate,
  pdf,
}: {
  driveId: string;
  projectFolderId: string;
  towerName: string;
  docketDate: string;
  pdf: Uint8Array;
}): Promise<{
  fileName: string;
  folder: SharePointDriveItem;
  item: SharePointDriveItem;
}> {
  const { towerFolder } =
    await ensureDailyDocketTowerFolder({
      driveId,
      projectFolderId,
      towerName,
    });

  const fileName = buildDailyDocketPdfFileName({
    towerName,
    docketDate,
  });

  const item = await uploadDriveItemContent({
    driveId,
    parentItemId: towerFolder.id,
    fileName,
    content: pdf,
    contentType: "application/pdf",
  });

  return {
    fileName,
    folder: towerFolder,
    item,
  };
}
