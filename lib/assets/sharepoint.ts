import {
  ensureDriveFolder,
  getDriveChildByName,
  graphRequest,
  listDriveChildren,
  moveDriveItem,
  renameDriveItem,
  uploadDriveItemContent,
  type SharePointDriveItem,
} from "@/lib/sharepoint/graph";
import { buildAssetDocumentFileName } from "@/lib/assets/document-naming";
import {
  assetDetailRoute,
  assetIdColumn,
  assetTable,
  clean,
  type AssetIdentity,
  type AssetServiceClient,
} from "@/lib/assets/server";
import type {
  AssetDocumentCategory,
  AssetDocumentRow,
  AssetDocumentTypeRow,
  AssetRecord,
  AssetSettings,
  AssetType,
} from "@/lib/assets/types";

export type AssetFolderResolution = {
  settings: AssetSettings;
  driveId: string;
  rootFolder: SharePointDriveItem;
  baseFolder: SharePointDriveItem;
  typeFolder: SharePointDriveItem;
  assetFolder: SharePointDriveItem;
  asset: AssetRecord;
  assetLabel: string;
};

function documentFolderDefaults(): Record<AssetDocumentCategory, string> {
  return {
    compliance: "Compliance",
    service: "Service & Repairs",
    invoice: "Invoices",
    inspection: "Inspections",
    manual: "Manuals",
    photo: "Photos",
    other: "Other",
  };
}

export function sanitiseSharePointPart(value: unknown, fallback = "Item") {
  const cleaned = clean(value)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .trim();

  return cleaned || fallback;
}

export function assetCode(type: AssetType, asset: AssetRecord) {
  return type === "vehicle"
    ? clean(asset.vehicle_id) || clean(asset.vehicle_rego) || asset.id
    : clean(asset.asset_id) || clean(asset.rego) || asset.id;
}

export function assetLabel(type: AssetType, asset: AssetRecord) {
  const code = assetCode(type, asset);
  const makeModel = [clean(asset.make), clean(asset.model)]
    .filter(Boolean)
    .join(" ");
  const rego =
    type === "vehicle" ? clean(asset.vehicle_rego) : clean(asset.rego);

  return [code, makeModel, rego].filter(Boolean).join(" - ");
}

export function assetFolderName(type: AssetType, asset: AssetRecord) {
  return sanitiseSharePointPart(
    assetLabel(type, asset),
    type === "vehicle" ? "Vehicle" : "Plant",
  );
}

export async function loadAssetSettings(
  service: AssetServiceClient,
): Promise<AssetSettings> {
  const { data, error } = await service
    .from("asset_settings")
    .select("*")
    .eq("id", true)
    .single();

  if (error) throw new Error(error.message);

  const folders =
    data.document_folders &&
    typeof data.document_folders === "object" &&
    !Array.isArray(data.document_folders)
      ? (data.document_folders as Record<string, string>)
      : {};

  return {
    ...(data as Omit<AssetSettings, "document_folders">),
    superseded_folder_name:
      clean(data.superseded_folder_name) || "Superseded",
    document_folders: {
      ...documentFolderDefaults(),
      ...folders,
    },
  };
}

export async function loadAssetRecord({
  service,
  assetType,
  assetId,
}: {
  service: AssetServiceClient;
  assetType: AssetType;
  assetId: string;
}): Promise<AssetRecord> {
  const { data, error } = await service
    .from(assetTable(assetType))
    .select("*")
    .eq("id", assetId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("ASSET_NOT_FOUND");

  return data as AssetRecord;
}

export async function loadAssetDocumentTypeById({
  service,
  documentTypeId,
}: {
  service: AssetServiceClient;
  documentTypeId: string;
}) {
  const { data, error } = await service
    .from("asset_document_types")
    .select("*")
    .eq("id", documentTypeId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Asset document type could not be found.");

  return data as AssetDocumentTypeRow;
}

export async function loadSystemAssetDocumentType({
  service,
  systemKey,
}: {
  service: AssetServiceClient;
  systemKey: string;
}) {
  const { data, error } = await service
    .from("asset_document_types")
    .select("*")
    .eq("system_key", systemKey)
    .eq("active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error(
      `The ${systemKey} Asset document type is not active. Open Assets → Configuration → Document Types.`,
    );
  }

  return data as AssetDocumentTypeRow;
}

async function driveRoot(driveId: string) {
  return graphRequest<SharePointDriveItem>(
    `/drives/${encodeURIComponent(
      driveId,
    )}/root?$select=id,name,webUrl,parentReference`,
  );
}

async function resolveStoredAssetFolder({
  driveId,
  asset,
}: {
  driveId: string;
  asset: AssetRecord;
}) {
  const storedDriveId = clean(asset.sharepoint_drive_id);
  const storedFolderId = clean(asset.sharepoint_folder_id);

  if (!storedFolderId || storedDriveId !== driveId) return null;

  try {
    return await graphRequest<SharePointDriveItem>(
      `/drives/${encodeURIComponent(
        driveId,
      )}/items/${encodeURIComponent(
        storedFolderId,
      )}?$select=id,name,webUrl,parentReference,folder`,
    );
  } catch {
    return null;
  }
}

export async function ensureAssetSharePointFolder({
  service,
  assetType,
  assetId,
}: {
  service: AssetServiceClient;
  assetType: AssetType;
  assetId: string;
}): Promise<AssetFolderResolution> {
  const [settings, asset] = await Promise.all([
    loadAssetSettings(service),
    loadAssetRecord({ service, assetType, assetId }),
  ]);

  const driveId = clean(settings.sharepoint_drive_id);
  if (!driveId) {
    throw new Error(
      "Assets SharePoint storage is not configured. Open Assets → Configuration first.",
    );
  }

  const rootFolder = await driveRoot(driveId);

  const baseFolder = await ensureDriveFolder({
    driveId,
    parentItemId: rootFolder.id,
    name: sanitiseSharePointPart(
      settings.sharepoint_base_folder || "Assets",
      "Assets",
    ),
  });

  const typeFolder = await ensureDriveFolder({
    driveId,
    parentItemId: baseFolder.id,
    name: sanitiseSharePointPart(
      assetType === "vehicle"
        ? settings.vehicle_folder_name || "Vehicles"
        : settings.plant_folder_name || "Plant",
      assetType === "vehicle" ? "Vehicles" : "Plant",
    ),
  });

  const expectedName = assetFolderName(assetType, asset);

  let folder = await resolveStoredAssetFolder({
    driveId,
    asset,
  });

  if (folder && clean(folder.name) !== expectedName) {
    folder = await renameDriveItem({
      driveId,
      itemId: folder.id,
      name: expectedName,
    });
  }

  if (!folder) {
    folder = await ensureDriveFolder({
      driveId,
      parentItemId: typeFolder.id,
      name: expectedName,
    });
  }

  const now = new Date().toISOString();

  const { error: updateError } = await service
    .from(assetTable(assetType))
    .update({
      sharepoint_site_id: settings.sharepoint_site_id,
      sharepoint_drive_id: driveId,
      sharepoint_folder_id: folder.id,
      sharepoint_web_url: folder.webUrl ?? null,
      sharepoint_folder_name: folder.name,
      sharepoint_synced_at: now,
    })
    .eq("id", asset.id);

  if (updateError) throw new Error(updateError.message);

  return {
    settings,
    driveId,
    rootFolder,
    baseFolder,
    typeFolder,
    assetFolder: folder,
    asset: {
      ...asset,
      sharepoint_site_id: settings.sharepoint_site_id,
      sharepoint_drive_id: driveId,
      sharepoint_folder_id: folder.id,
      sharepoint_web_url: folder.webUrl ?? null,
      sharepoint_folder_name: folder.name,
      sharepoint_synced_at: now,
    },
    assetLabel: assetLabel(assetType, asset),
  };
}

export async function ensureAssetCategoryFolder({
  service,
  assetType,
  assetId,
  category,
}: {
  service: AssetServiceClient;
  assetType: AssetType;
  assetId: string;
  category: AssetDocumentCategory;
}) {
  const resolved = await ensureAssetSharePointFolder({
    service,
    assetType,
    assetId,
  });

  const folderMap = {
    ...documentFolderDefaults(),
    ...resolved.settings.document_folders,
  };

  const categoryFolder = await ensureDriveFolder({
    driveId: resolved.driveId,
    parentItemId: resolved.assetFolder.id,
    name: sanitiseSharePointPart(
      folderMap[category] || documentFolderDefaults()[category],
      "Other",
    ),
  });

  return {
    ...resolved,
    categoryFolder,
  };
}

async function ensureSupersededCategoryFolder({
  resolved,
  category,
}: {
  resolved: Awaited<ReturnType<typeof ensureAssetCategoryFolder>>;
  category: AssetDocumentCategory;
}) {
  const superseded = await ensureDriveFolder({
    driveId: resolved.driveId,
    parentItemId: resolved.assetFolder.id,
    name: sanitiseSharePointPart(
      resolved.settings.superseded_folder_name || "Superseded",
      "Superseded",
    ),
  });

  const folderMap = {
    ...documentFolderDefaults(),
    ...resolved.settings.document_folders,
  };

  const categoryFolder = await ensureDriveFolder({
    driveId: resolved.driveId,
    parentItemId: superseded.id,
    name: sanitiseSharePointPart(
      folderMap[category] || documentFolderDefaults()[category],
      "Other",
    ),
  });

  return { superseded, categoryFolder };
}

function validateDocumentTypeForAsset({
  documentType,
  assetType,
  documentDate,
  expiryDate,
}: {
  documentType: AssetDocumentTypeRow;
  assetType: AssetType;
  documentDate?: string | null;
  expiryDate?: string | null;
}) {
  if (!documentType.active) {
    throw new Error(`${documentType.name} is inactive.`);
  }

  if (
    documentType.applies_to !== "both" &&
    documentType.applies_to !== assetType
  ) {
    throw new Error(
      `${documentType.name} is not configured for ${assetType} assets.`,
    );
  }

  if (
    ["document_date", "document_and_expiry"].includes(
      documentType.date_requirement,
    ) &&
    !clean(documentDate)
  ) {
    throw new Error(`Enter the completion / document date for ${documentType.name}.`);
  }

  if (
    ["expiry_date", "document_and_expiry"].includes(
      documentType.date_requirement,
    ) &&
    !clean(expiryDate)
  ) {
    throw new Error(`Enter the expiry / due date for ${documentType.name}.`);
  }
}

const VEHICLE_FIELD_ALLOWLIST = new Set([
  "rego_expiry",
  "insurance_expiry",
  "next_inspection_due",
  "next_service_due",
  "risk_assessment_date",
]);

const PLANT_FIELD_ALLOWLIST = new Set([
  "rego_expiry",
  "insurance_expiry",
  "cranesafe_expiry",
  "next_inspection_due",
  "next_service_due",
  "risk_assessment_date",
  "ten_year_inspection_due",
]);

async function updateMappedAssetField({
  service,
  assetType,
  assetId,
  documentType,
  documentDate,
  expiryDate,
}: {
  service: AssetServiceClient;
  assetType: AssetType;
  assetId: string;
  documentType: AssetDocumentTypeRow;
  documentDate?: string | null;
  expiryDate?: string | null;
}) {
  const field = clean(documentType.asset_field_mapping);
  const source = documentType.asset_field_source;

  if (!field || !source) return;

  const allowed =
    assetType === "vehicle"
      ? VEHICLE_FIELD_ALLOWLIST.has(field)
      : PLANT_FIELD_ALLOWLIST.has(field);

  if (!allowed) {
    throw new Error(
      `${documentType.name} is configured to update unsupported ${assetType} field "${field}".`,
    );
  }

  const value = source === "expiry_date" ? clean(expiryDate) : clean(documentDate);
  if (!value) return;

  const { error } = await service
    .from(assetTable(assetType))
    .update({ [field]: value })
    .eq("id", assetId);

  if (error) throw new Error(error.message);
}

export type PublishAssetDocumentInput = {
  service: AssetServiceClient;
  identity: AssetIdentity;
  assetType: AssetType;
  assetId: string;
  documentType: AssetDocumentTypeRow;
  originalFileName: string;
  content: Uint8Array | ArrayBuffer;
  contentType?: string | null;
  title?: string | null;
  documentDate?: string | null;
  expiryDate?: string | null;
  supplier?: string | null;
  invoiceNumber?: string | null;
  amountExGst?: number | null;
  gstAmount?: number | null;
  amountIncGst?: number | null;
  serviceRecordId?: string | null;
  fleetJobId?: string | null;
  financialSubmissionId?: string | null;
  financialItemId?: string | null;
  financialAttachmentId?: string | null;
  source?: "assets" | "finance" | "service" | "risk_assessment" | "fleet_job" | "migration";
  generatedByModule?: string | null;
  serviceNumber?: string | null;
  forcedExtension?: string | null;
  createTimelineEvent?: boolean;
};

export async function publishAssetDocument(
  input: PublishAssetDocumentInput,
): Promise<AssetDocumentRow> {
  const {
    service,
    identity,
    assetType,
    assetId,
    documentType,
  } = input;

  validateDocumentTypeForAsset({
    documentType,
    assetType,
    documentDate: input.documentDate,
    expiryDate: input.expiryDate,
  });

  const resolved = await ensureAssetCategoryFolder({
    service,
    assetType,
    assetId,
    category: documentType.category,
  });

  const fileName = buildAssetDocumentFileName({
    documentType,
    assetType,
    asset: resolved.asset,
    documentDate: input.documentDate,
    expiryDate: input.expiryDate,
    invoiceNumber: input.invoiceNumber,
    supplier: input.supplier,
    serviceNumber: input.serviceNumber,
    originalFileName: input.originalFileName,
    forcedExtension: input.forcedExtension,
  });

  const assetColumn = assetIdColumn(assetType);

  let previousDocuments: AssetDocumentRow[] = [];
  let supersededCategoryFolder: SharePointDriveItem | null = null;
  let supersededPath = "";

  if (documentType.replacement_mode === "current") {
    const { data, error } = await service
      .from("asset_documents")
      .select("*")
      .eq(assetColumn, assetId)
      .eq("document_type_id", documentType.id)
      .eq("active", true)
      .eq("is_current", true)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    previousDocuments = (data ?? []) as AssetDocumentRow[];

    if (previousDocuments.length > 0) {
      const superseded = await ensureSupersededCategoryFolder({
        resolved,
        category: documentType.category,
      });

      supersededCategoryFolder = superseded.categoryFolder;
      supersededPath = [
        resolved.baseFolder.name,
        resolved.typeFolder.name,
        resolved.assetFolder.name,
        superseded.superseded.name,
        superseded.categoryFolder.name,
      ].join("/");

      for (const previous of previousDocuments) {
        if (
          clean(previous.sharepoint_drive_id) === resolved.driveId &&
          clean(previous.sharepoint_item_id)
        ) {
          await moveDriveItem({
            driveId: resolved.driveId,
            itemId: previous.sharepoint_item_id,
            parentItemId: superseded.categoryFolder.id,
          });
        }
      }
    }
  }

  const collision = await getDriveChildByName({
    driveId: resolved.driveId,
    parentItemId: resolved.categoryFolder.id,
    name: fileName,
  });

  if (collision) {
    throw new Error(
      `${fileName} already exists in the current Asset SharePoint folder. Check the configured date / naming rule before uploading.`,
    );
  }

  const item = await uploadDriveItemContent({
    driveId: resolved.driveId,
    parentItemId: resolved.categoryFolder.id,
    fileName,
    content: input.content,
    contentType: input.contentType || "application/octet-stream",
  });

  const { data: inserted, error: insertError } = await service
    .from("asset_documents")
    .insert({
      asset_type: assetType,
      vehicle_asset_id: assetType === "vehicle" ? assetId : null,
      plant_asset_id: assetType === "plant" ? assetId : null,
      document_type_id: documentType.id,
      document_type_name: documentType.name,
      document_type_code: documentType.code,
      naming_template_snapshot: documentType.naming_template,
      replacement_mode_snapshot: documentType.replacement_mode,
      document_category: documentType.category,
      title: clean(input.title) || documentType.name,
      document_date: clean(input.documentDate) || null,
      expiry_date: clean(input.expiryDate) || null,
      supplier: clean(input.supplier) || null,
      invoice_number: clean(input.invoiceNumber) || null,
      amount_ex_gst: input.amountExGst ?? null,
      gst_amount: input.gstAmount ?? null,
      amount_inc_gst: input.amountIncGst ?? null,
      service_record_id: clean(input.serviceRecordId) || null,
      fleet_job_id: clean(input.fleetJobId) || null,
      financial_submission_id: clean(input.financialSubmissionId) || null,
      financial_item_id: clean(input.financialItemId) || null,
      financial_attachment_id: clean(input.financialAttachmentId) || null,
      source: input.source ?? "assets",
      generated_by_module: clean(input.generatedByModule) || null,
      file_name: fileName,
      content_type: input.contentType || "application/octet-stream",
      file_size_bytes:
        input.content instanceof ArrayBuffer
          ? input.content.byteLength
          : input.content.byteLength,
      sharepoint_site_id: resolved.settings.sharepoint_site_id,
      sharepoint_drive_id: resolved.driveId,
      sharepoint_folder_id: resolved.categoryFolder.id,
      sharepoint_item_id: item.id,
      sharepoint_web_url: item.webUrl ?? null,
      sharepoint_folder_path: [
        resolved.baseFolder.name,
        resolved.typeFolder.name,
        resolved.assetFolder.name,
        resolved.categoryFolder.name,
      ].join("/"),
      is_current: documentType.replacement_mode === "current",
      supersedes_document_id: previousDocuments[0]?.id ?? null,
      superseded_by_document_id: null,
      superseded_at: null,
      superseded_by: null,
      uploaded_by: identity.userId,
      uploaded_by_name: identity.name,
      active: true,
    })
    .select("*")
    .single();

  if (insertError) throw new Error(insertError.message);

  const document = inserted as AssetDocumentRow;

  if (previousDocuments.length > 0) {
    const now = new Date().toISOString();

    for (const previous of previousDocuments) {
      const { error } = await service
        .from("asset_documents")
        .update({
          active: false,
          is_current: false,
          superseded_by_document_id: document.id,
          superseded_at: now,
          superseded_by: identity.userId,
          sharepoint_folder_id:
            supersededCategoryFolder?.id ?? previous.sharepoint_folder_id,
          sharepoint_folder_path:
            supersededPath || previous.sharepoint_folder_path,
        })
        .eq("id", previous.id);

      if (error) throw new Error(error.message);
    }
  }

  if (documentType.replacement_mode === "current") {
    await updateMappedAssetField({
      service,
      assetType,
      assetId,
      documentType,
      documentDate: input.documentDate,
      expiryDate: input.expiryDate,
    });
  }

  if (input.createTimelineEvent !== false) {
    const { error } = await service.from("asset_events").insert({
      asset_type: assetType,
      vehicle_asset_id: assetType === "vehicle" ? assetId : null,
      plant_asset_id: assetType === "plant" ? assetId : null,
      event_type:
        documentType.system_key === "risk_assessment"
          ? "compliance"
          : "document",
      event_date:
        clean(input.documentDate) ||
        clean(input.expiryDate) ||
        new Date().toISOString().slice(0, 10),
      title: `${documentType.name} updated`,
      description: fileName,
      supplier: clean(input.supplier) || null,
      cost: input.amountIncGst ?? null,
      odometer_km: null,
      engine_hours: null,
      fleet_job_id: clean(input.fleetJobId) || null,
      service_record_id: clean(input.serviceRecordId) || null,
      document_id: document.id,
      financial_submission_id: clean(input.financialSubmissionId) || null,
      performed_by: identity.userId,
      performed_by_name: identity.name,
      metadata: {
        document_type_id: documentType.id,
        document_type_code: documentType.code,
        replacement_mode: documentType.replacement_mode,
        superseded_count: previousDocuments.length,
        action_route: assetDetailRoute(assetType, assetId),
      },
    });

    if (error) {
      console.error("Asset document timeline insert warning", error);
    }
  }

  return document;
}

export type RecursiveAssetFile = {
  name: string;
  relativePath: string;
  itemId: string;
  size: number;
  contentType: string | null;
};

export async function listAssetFolderFilesRecursively({
  driveId,
  folderId,
}: {
  driveId: string;
  folderId: string;
}) {
  const files: RecursiveAssetFile[] = [];

  async function walk(parentId: string, parentPath: string) {
    const children = await listDriveChildren({
      driveId,
      parentItemId: parentId,
    });

    for (const child of children.value) {
      const relativePath = parentPath
        ? `${parentPath}/${child.name}`
        : child.name;

      if (child.folder) {
        await walk(child.id, relativePath);
        continue;
      }

      if (child.file) {
        files.push({
          name: child.name,
          relativePath,
          itemId: child.id,
          size: Number(child.size ?? 0),
          contentType: child.file.mimeType ?? null,
        });
      }
    }
  }

  await walk(folderId, "");
  return files;
}
