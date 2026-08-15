import {
  createDriveFolder,
  deleteDriveItem,
  getBCContractingSite,
  getDriveByName,
  renameDriveItem,
} from "@/lib/sharepoint/graph";

import {
  PROJECT_DELIVERY_TEMPLATE,
  TENDERING_TEMPLATE,
  type SharePointFolderTemplate,
} from "@/lib/sharepoint/templates";

export type ProjectSharePointInput = {
  projectNumber: string;
  projectName: string;
};

export type ProjectSharePointResult = {
  siteId: string;

  delivery: {
    driveId: string;
    folderId: string;
    folderName: string;
    url: string | null;
  };

  tendering: {
    driveId: string;
    folderId: string;
    folderName: string;
    url: string | null;
  };
};

const PROJECT_DELIVERY_LIBRARY =
  process.env.SHAREPOINT_PROJECT_DELIVERY_LIBRARY ??
  "Project Delivery";

const TENDERING_LIBRARY =
  process.env.SHAREPOINT_TENDERING_LIBRARY ??
  "Tendering";

export function sanitiseSharePointName(value: string) {
  return value
    .replace(/["*:<>?/\\|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .trim();
}

export function buildSharePointProjectFolderName({
  projectNumber,
  projectName,
}: ProjectSharePointInput) {
  const cleanNumber =
    sanitiseSharePointName(projectNumber);

  const cleanName =
    sanitiseSharePointName(projectName);

  if (!cleanNumber) {
    throw new Error(
      "Project number is required for SharePoint.",
    );
  }

  if (!cleanName) {
    throw new Error(
      "Project name is required for SharePoint.",
    );
  }

  return `${cleanNumber} ${cleanName}`;
}

async function createFolderTree({
  driveId,
  parentFolderId,
  folders,
}: {
  driveId: string;
  parentFolderId: string;
  folders: SharePointFolderTemplate[];
}) {
  for (const folder of folders) {
    const createdFolder = await createDriveFolder({
      driveId,
      parentItemId: parentFolderId,
      name: folder.name,
    });

    if (folder.children?.length) {
      await createFolderTree({
        driveId,
        parentFolderId: createdFolder.id,
        folders: folder.children,
      });
    }
  }
}

export async function createProjectSharePointStructure(
  input: ProjectSharePointInput,
): Promise<ProjectSharePointResult> {
  const site = await getBCContractingSite();

  const [deliveryDrive, tenderingDrive] =
    await Promise.all([
      getDriveByName(
        site.id,
        PROJECT_DELIVERY_LIBRARY,
      ),
      getDriveByName(
        site.id,
        TENDERING_LIBRARY,
      ),
    ]);

  const folderName =
    buildSharePointProjectFolderName(input);

  let deliveryFolder:
    | Awaited<ReturnType<typeof createDriveFolder>>
    | null = null;

  let tenderingFolder:
    | Awaited<ReturnType<typeof createDriveFolder>>
    | null = null;

  try {
    /*
     * --------------------------------------------------
     * PROJECT DELIVERY
     * --------------------------------------------------
     */

    deliveryFolder =
      await createDriveFolder({
        driveId: deliveryDrive.id,
        parentItemId: null,
        name: folderName,
      });

    await createFolderTree({
      driveId: deliveryDrive.id,
      parentFolderId: deliveryFolder.id,
      folders: PROJECT_DELIVERY_TEMPLATE,
    });

    /*
     * --------------------------------------------------
     * TENDERING
     * --------------------------------------------------
     */

    tenderingFolder =
      await createDriveFolder({
        driveId: tenderingDrive.id,
        parentItemId: null,
        name: folderName,
      });

    await createFolderTree({
      driveId: tenderingDrive.id,
      parentFolderId: tenderingFolder.id,
      folders: TENDERING_TEMPLATE,
    });

    /*
     * --------------------------------------------------
     * RETURN SHAREPOINT REFERENCES
     * --------------------------------------------------
     */

    return {
      siteId: site.id,

      delivery: {
        driveId: deliveryDrive.id,
        folderId: deliveryFolder.id,
        folderName: deliveryFolder.name,
        url: deliveryFolder.webUrl ?? null,
      },

      tendering: {
        driveId: tenderingDrive.id,
        folderId: tenderingFolder.id,
        folderName: tenderingFolder.name,
        url: tenderingFolder.webUrl ?? null,
      },
    };
  } catch (error) {
    /*
     * --------------------------------------------------
     * ROLLBACK PARTIAL SHAREPOINT CREATION
     * --------------------------------------------------
     *
     * If either structure fails to create, remove
     * anything that was already created so TTTracker
     * doesn't leave half-built SharePoint projects.
     */

    const rollbackOperations: Promise<void>[] = [];

    if (deliveryFolder) {
      rollbackOperations.push(
        deleteDriveItem({
          driveId: deliveryDrive.id,
          itemId: deliveryFolder.id,
        }).catch((rollbackError) => {
          console.error(
            "PROJECT DELIVERY SHAREPOINT ROLLBACK ERROR:",
            rollbackError,
          );
        }),
      );
    }

    if (tenderingFolder) {
      rollbackOperations.push(
        deleteDriveItem({
          driveId: tenderingDrive.id,
          itemId: tenderingFolder.id,
        }).catch((rollbackError) => {
          console.error(
            "TENDERING SHAREPOINT ROLLBACK ERROR:",
            rollbackError,
          );
        }),
      );
    }

    await Promise.all(rollbackOperations);

    throw error;
  }
}

export async function renameProjectSharePointFolders({
  deliveryDriveId,
  deliveryFolderId,
  tenderingDriveId,
  tenderingFolderId,
  projectNumber,
  projectName,
}: {
  deliveryDriveId: string;
  deliveryFolderId: string;
  tenderingDriveId?: string | null;
  tenderingFolderId?: string | null;
  projectNumber: string;
  projectName: string;
}) {
  const newFolderName =
    buildSharePointProjectFolderName({
      projectNumber,
      projectName,
    });

  /*
   * Rename Project Delivery folder.
   */
  await renameDriveItem({
    driveId: deliveryDriveId,
    itemId: deliveryFolderId,
    name: newFolderName,
  });

  /*
   * Rename Tendering folder if linked.
   */
  if (
    tenderingDriveId &&
    tenderingFolderId
  ) {
    await renameDriveItem({
      driveId: tenderingDriveId,
      itemId: tenderingFolderId,
      name: newFolderName,
    });
  }
}

export async function deleteProjectSharePointFolders({
  deliveryDriveId,
  deliveryFolderId,
  tenderingDriveId,
  tenderingFolderId,
}: {
  deliveryDriveId?: string | null;
  deliveryFolderId?: string | null;
  tenderingDriveId?: string | null;
  tenderingFolderId?: string | null;
}) {
  const deleteOperations: Promise<void>[] = [];

  /*
   * Project Delivery
   */
  if (
    deliveryDriveId &&
    deliveryFolderId
  ) {
    deleteOperations.push(
      deleteDriveItem({
        driveId: deliveryDriveId,
        itemId: deliveryFolderId,
      }),
    );
  }

  /*
   * Tendering
   */
  if (
    tenderingDriveId &&
    tenderingFolderId
  ) {
    deleteOperations.push(
      deleteDriveItem({
        driveId: tenderingDriveId,
        itemId: tenderingFolderId,
      }),
    );
  }

  if (deleteOperations.length === 0) {
    return;
  }

  await Promise.all(deleteOperations);
}