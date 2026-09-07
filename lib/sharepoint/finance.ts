import { ClientSecretCredential } from "@azure/identity";

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function cleanFolderPath(path: string) {
  return path
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

function encodeGraphPath(path: string) {
  return cleanFolderPath(path)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function getGraphAccessToken() {
  const credential = new ClientSecretCredential(
    requiredEnv("AZURE_TENANT_ID"),
    requiredEnv("AZURE_CLIENT_ID"),
    requiredEnv("AZURE_CLIENT_SECRET"),
  );

  const token = await credential.getToken(GRAPH_SCOPE);

  if (!token?.token) {
    throw new Error("Could not obtain a Microsoft Graph access token.");
  }

  return token.token;
}

export type FinanceSharePointFile = {
  siteId: string;
  driveId: string;
  itemId: string;
  webUrl: string | null;
  name: string;
  size: number | null;
  mimeType: string | null;
};

export function getFinanceSharePointConfig() {
  return {
    siteId: requiredEnv("TTTRACKER_FINANCE_SHAREPOINT_SITE_ID"),
    driveId: requiredEnv("TTTRACKER_FINANCE_SHAREPOINT_DRIVE_ID"),
  };
}

export async function uploadFinanceFile(params: {
  fileName: string;
  bytes: Uint8Array;
  contentType: string;
  folderPath: string;
}): Promise<FinanceSharePointFile> {
  const { siteId, driveId } = getFinanceSharePointConfig();
  const token = await getGraphAccessToken();

  const fullPath = encodeGraphPath(
    `${cleanFolderPath(params.folderPath)}/${params.fileName}`,
  );

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(
      driveId,
    )}/root:/${fullPath}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": params.contentType || "application/octet-stream",
      },
      body: Buffer.from(params.bytes),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const message = await response.text();

    throw new Error(
      `SharePoint upload failed (${response.status}): ${message.slice(0, 500)}`,
    );
  }

  const item = (await response.json()) as {
    id: string;
    name: string;
    webUrl?: string;
    size?: number;
    file?: {
      mimeType?: string;
    };
  };

  return {
    siteId,
    driveId,
    itemId: item.id,
    webUrl: item.webUrl ?? null,
    name: item.name,
    size: item.size ?? null,
    mimeType: item.file?.mimeType ?? params.contentType ?? null,
  };
}

export async function downloadFinanceFile(params: {
  driveId: string;
  itemId: string;
}) {
  const token = await getGraphAccessToken();

  const metadataResponse = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(
      params.driveId,
    )}/items/${encodeURIComponent(params.itemId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );

  if (!metadataResponse.ok) {
    const message = await metadataResponse.text();

    throw new Error(
      `Could not read SharePoint file metadata (${metadataResponse.status}): ${message.slice(
        0,
        300,
      )}`,
    );
  }

  const metadata = (await metadataResponse.json()) as {
    name?: string;
    size?: number;
    file?: {
      mimeType?: string;
    };
  };

  const contentResponse = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(
      params.driveId,
    )}/items/${encodeURIComponent(params.itemId)}/content`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      redirect: "follow",
      cache: "no-store",
    },
  );

  if (!contentResponse.ok) {
    const message = await contentResponse.text();

    throw new Error(
      `Could not download SharePoint file (${contentResponse.status}): ${message.slice(
        0,
        300,
      )}`,
    );
  }

  return {
    bytes: new Uint8Array(await contentResponse.arrayBuffer()),
    fileName: metadata.name ?? "attachment",
    contentType: metadata.file?.mimeType ?? "application/octet-stream",
    fileSizeBytes: metadata.size ?? null,
  };
}

export async function deleteFinanceFile(params: {
  driveId: string;
  itemId: string;
}) {
  const token = await getGraphAccessToken();

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(
      params.driveId,
    )}/items/${encodeURIComponent(params.itemId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok && response.status !== 404) {
    const message = await response.text();

    throw new Error(
      `Could not delete SharePoint file (${response.status}): ${message.slice(
        0,
        300,
      )}`,
    );
  }
}
