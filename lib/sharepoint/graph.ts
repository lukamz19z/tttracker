import { ClientSecretCredential } from "@azure/identity";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

export type SharePointSite = {
  id: string;
  displayName?: string;
  webUrl?: string;
};

export type SharePointDrive = {
  id: string;
  name: string;
  webUrl?: string;
};

export type SharePointDriveItem = {
  id: string;
  name: string;
  webUrl?: string;
};

type GraphDriveList = {
  value: SharePointDrive[];
};

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export async function getGraphAccessToken() {
  const tenantId = getRequiredEnv("AZURE_TENANT_ID");
  const clientId = getRequiredEnv("AZURE_CLIENT_ID");
  const clientSecret = getRequiredEnv("AZURE_CLIENT_SECRET");

  const credential = new ClientSecretCredential(
    tenantId,
    clientId,
    clientSecret,
  );

  const token = await credential.getToken(
    "https://graph.microsoft.com/.default",
  );

  if (!token?.token) {
    throw new Error("Microsoft Graph authentication failed.");
  }

  return token.token;
}

export async function graphRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getGraphAccessToken();

  const response = await fetch(`${GRAPH_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const responseBody = await response.text();

    throw new Error(
      `Microsoft Graph request failed (${response.status} ${response.statusText}): ${responseBody}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function getBCContractingSite() {
  const hostname =
    process.env.SHAREPOINT_HOSTNAME ??
    "netorg19622551.sharepoint.com";

  const sitePath =
    process.env.SHAREPOINT_SITE_PATH ??
    "/sites/BCContracting";

  return graphRequest<SharePointSite>(
    `/sites/${hostname}:${sitePath}`,
  );
}

export async function getSiteDrives(siteId: string) {
  return graphRequest<GraphDriveList>(
    `/sites/${encodeURIComponent(
      siteId,
    )}/drives?$select=id,name,webUrl`,
  );
}

export async function getDriveByName(
  siteId: string,
  driveName: string,
) {
  const drives = await getSiteDrives(siteId);

  const drive = drives.value.find(
    (item) =>
      item.name.trim().toLowerCase() ===
      driveName.trim().toLowerCase(),
  );

  if (!drive) {
    throw new Error(
      `SharePoint document library "${driveName}" could not be found.`,
    );
  }

  return drive;
}

export async function createDriveFolder({
  driveId,
  parentItemId,
  name,
}: {
  driveId: string;
  parentItemId?: string | null;
  name: string;
}) {
  const endpoint = parentItemId
    ? `/drives/${encodeURIComponent(
        driveId,
      )}/items/${encodeURIComponent(parentItemId)}/children`
    : `/drives/${encodeURIComponent(driveId)}/root/children`;

  return graphRequest<SharePointDriveItem>(endpoint, {
    method: "POST",
    body: JSON.stringify({
      name,
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    }),
  });
}

export async function renameDriveItem({
  driveId,
  itemId,
  name,
}: {
  driveId: string;
  itemId: string;
  name: string;
}) {
  return graphRequest<SharePointDriveItem>(
    `/drives/${encodeURIComponent(
      driveId,
    )}/items/${encodeURIComponent(itemId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        name,
      }),
    },
  );
}

export async function deleteDriveItem({
  driveId,
  itemId,
}: {
  driveId: string;
  itemId: string;
}) {
  await graphRequest<void>(
    `/drives/${encodeURIComponent(
      driveId,
    )}/items/${encodeURIComponent(itemId)}`,
    {
      method: "DELETE",
    },
  );
}