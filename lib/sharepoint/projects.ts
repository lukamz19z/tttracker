import {
  createDriveFolder,
  getBCContractingSite,
  getDriveByName,
  renameDriveItem,
} from "@/lib/sharepoint/graph";

export type ProjectSharePointInput = {
  projectNumber: string;
  projectName: string;
};

export type ProjectSharePointResult = {
  siteId: string;
  driveId: string;
  folderId: string;
  folderName: string;
  url: string | null;
};

type FolderTemplate = {
  name: string;
  children?: FolderTemplate[];
};

const PROJECT_DELIVERY_LIBRARY =
  process.env.SHAREPOINT_PROJECT_DELIVERY_LIBRARY ??
  "Project Delivery";

/**
 * This is the standard BC Contracting Project Delivery folder structure.
 *
 * Keep this as the single source of truth for automatically-created
 * project folders.
 */
const PROJECT_FOLDER_TEMPLATE: FolderTemplate[] = [
  {
    name: "01 Programme & Scheduling",
    children: [
      {
        name: "Programme",
      },
      {
        name: "Look Aheads",
      },
      {
        name: "Progress Reports",
      },
      {
        name: "Weekly Reports",
      },
      {
        name: "Meeting Minutes",
      },
    ],
  },

  {
    name: "02 Commercial",
    children: [
      {
        name: "Dayworks",
      },
      {
        name: "Daily Dockets",
      },
      {
        name: "Monthly Claims",
      },
      {
        name: "Reports & Meetings",
      },
      {
        name: "Claims",
        children: [
          {
            name: "NDO",
          },
          {
            name: "DOV",
          },
          {
            name: "Variations",
          },
          {
            name: "EOT",
          },
        ],
      },
    ],
  },

  {
    name: "03 Quality",
    children: [
      {
        name: "ITCs",
      },
      {
        name: "ITPs",
      },
    ],
  },

  {
    name: "04 HSEQ",
    children: [
      {
        name: "SWMS",
      },
      {
        name: "Workpacks",
      },
      {
        name: "Registers",
      },
      {
        name: "Toolbox Talks",
      },
      {
        name: "Client Documents",
      },
      {
        name: "Management Plans",
      },
      {
        name: "Lift Studies",
      },
    ],
  },

  {
    name: "05 Drawings",
  },

  {
    name: "06 Onboarding",
    children: [
      {
        name: "Personnel",
      },
      {
        name: "Plant & Equipment",
      },
    ],
  },

  {
    name: "100 Incoming",
  },

  {
    name: "200 Outgoing",
  },

  {
    name: "999 Project Completion",
    children: [
      {
        name: "Lessons Learnt",
      },
    ],
  },
];

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
  const cleanNumber = sanitiseSharePointName(projectNumber);
  const cleanName = sanitiseSharePointName(projectName);

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
  folders: FolderTemplate[];
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

  const drive = await getDriveByName(
    site.id,
    PROJECT_DELIVERY_LIBRARY,
  );

  const folderName =
    buildSharePointProjectFolderName(input);

  /*
   * Create the main project folder at the root of:
   *
   * Project Delivery
   * └── P-UGL-26-001 Project Name
   */
  const projectFolder = await createDriveFolder({
    driveId: drive.id,
    parentItemId: null,
    name: folderName,
  });

  /*
   * Create the agreed standard project structure.
   */
  await createFolderTree({
    driveId: drive.id,
    parentFolderId: projectFolder.id,
    folders: PROJECT_FOLDER_TEMPLATE,
  });

  return {
    siteId: site.id,
    driveId: drive.id,
    folderId: projectFolder.id,
    folderName: projectFolder.name,
    url: projectFolder.webUrl ?? null,
  };
}

/**
 * Used later when the project number/name is edited in TTTracker.
 *
 * Because we store the SharePoint drive ID and folder ID,
 * we do NOT need to search for the folder by name.
 */
export async function renameProjectSharePointFolder({
  driveId,
  folderId,
  projectNumber,
  projectName,
}: {
  driveId: string;
  folderId: string;
  projectNumber: string;
  projectName: string;
}) {
  const newFolderName =
    buildSharePointProjectFolderName({
      projectNumber,
      projectName,
    });

  return renameDriveItem({
    driveId,
    itemId: folderId,
    name: newFolderName,
  });
}