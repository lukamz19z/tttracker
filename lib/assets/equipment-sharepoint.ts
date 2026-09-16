import {
  deleteDriveItem,
  ensureDriveFolder,
  getDriveChildByName,
  graphRequest,
  moveDriveItem,
  renameDriveItem,
  uploadDriveItemContent,
  type SharePointDriveItem,
} from "@/lib/sharepoint/graph";
import { clean, type AssetIdentity, type AssetServiceClient } from "@/lib/assets/server";
import { loadAssetSettings, sanitiseSharePointPart } from "@/lib/assets/sharepoint";

export type EquipmentType =
  | "lifting_gear"
  | "fall_arrest"
  | "generator"
  | "ladder"
  | "torque_wrench"
  | "inventory_kit";

export type EquipmentDocumentTypeRow = {
  id: string;
  system_key: string | null;
  name: string;
  code: string;
  category: "compliance" | "service" | "inspection" | "manual" | "photo" | "other";
  applies_to: string[];
  date_requirement: "none" | "document_date" | "expiry_date" | "document_and_expiry";
  replacement_mode: "current" | "historical";
  preserve_original_filename: boolean;
  active: boolean;
  sort_order: number;
};

export type EquipmentDocumentRow = {
  id: string;
  equipment_type: EquipmentType;
  equipment_id: string;
  document_type_id: string | null;
  document_type_name: string | null;
  document_type_code: string | null;
  replacement_mode_snapshot: string | null;
  document_category: string;
  title: string;
  document_date: string | null;
  expiry_date: string | null;
  supplier: string | null;
  notes: string | null;
  file_name: string;
  content_type: string | null;
  file_size_bytes: number | string | null;
  sharepoint_site_id: string | null;
  sharepoint_drive_id: string;
  sharepoint_folder_id: string | null;
  sharepoint_item_id: string;
  sharepoint_web_url: string | null;
  sharepoint_folder_path: string | null;
  is_current: boolean;
  superseded_at: string | null;
  active: boolean;
  uploaded_by_name: string | null;
  created_at: string;
};

type EquipmentDefinition = {
  table: string;
  groupFolder: string;
  numberFields: string[];
  labelFields: string[];
};

const DEFINITIONS: Record<EquipmentType, EquipmentDefinition> = {
  lifting_gear: {
    table: "equipment_lifting_gear",
    groupFolder: "Lifting Gear",
    numberFields: ["serial_id"],
    labelFields: ["equipment_type", "description"],
  },
  fall_arrest: {
    table: "equipment_lifting_gear",
    groupFolder: "Fall Arrest",
    numberFields: ["serial_id"],
    labelFields: ["equipment_type", "description"],
  },
  generator: {
    table: "equipment_generators",
    groupFolder: "Generators",
    numberFields: ["generator_number", "serial_number"],
    labelFields: ["make", "model"],
  },
  ladder: {
    table: "equipment_ladders",
    groupFolder: "Ladders",
    numberFields: ["ladder_number"],
    labelFields: ["make", "ladder_type", "height"],
  },
  torque_wrench: {
    table: "equipment_torque_wrenches",
    groupFolder: "Torque Wrenches",
    numberFields: ["torque_wrench_number", "serial_number"],
    labelFields: ["serial_number"],
  },
  inventory_kit: {
    table: "inventory_kits",
    groupFolder: "Inventory Kits",
    numberFields: ["kit_number"],
    labelFields: ["kit_type", "assigned_asset_id", "assigned_location"],
  },
};

const CATEGORY_FOLDERS: Record<string, string> = {
  compliance: "Compliance",
  service: "Service & Repairs",
  inspection: "Inspections",
  manual: "Manuals",
  photo: "Photos",
  other: "Other",
};

export function parseEquipmentType(value: unknown): EquipmentType | null {
  const type = clean(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (type in DEFINITIONS) return type as EquipmentType;
  return null;
}

export function equipmentTable(type: EquipmentType) {
  return DEFINITIONS[type].table;
}

export async function loadEquipmentRecord({
  service,
  equipmentType,
  equipmentId,
}: {
  service: AssetServiceClient;
  equipmentType: EquipmentType;
  equipmentId: string;
}) {
  const { data, error } = await service
    .from(equipmentTable(equipmentType))
    .select("*")
    .eq("id", equipmentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("EQUIPMENT_NOT_FOUND");
  return data as Record<string, unknown> & { id: string };
}

export function equipmentLabel(
  type: EquipmentType,
  item: Record<string, unknown>,
) {
  const definition = DEFINITIONS[type];
  const number = definition.numberFields.map((key) => clean(item[key])).find(Boolean) || clean(item.id);
  const detail = definition.labelFields.map((key) => clean(item[key])).filter(Boolean).join(" - ");
  return [number, detail].filter(Boolean).join(" - ");
}

function equipmentFolderName(type: EquipmentType, item: Record<string, unknown>) {
  return sanitiseSharePointPart(equipmentLabel(type, item), "Equipment Item");
}

async function driveRoot(driveId: string) {
  return graphRequest<SharePointDriveItem>(
    `/drives/${encodeURIComponent(driveId)}/root?$select=id,name,webUrl,parentReference`,
  );
}

export async function ensureEquipmentSharePointFolder({
  service,
  equipmentType,
  equipmentId,
}: {
  service: AssetServiceClient;
  equipmentType: EquipmentType;
  equipmentId: string;
}) {
  const [settings, item] = await Promise.all([
    loadAssetSettings(service),
    loadEquipmentRecord({ service, equipmentType, equipmentId }),
  ]);

  const driveId = clean(settings.sharepoint_drive_id);
  if (!driveId) {
    throw new Error("Assets SharePoint storage is not configured. Open Assets → Configuration first.");
  }

  const root = await driveRoot(driveId);
  const baseFolder = await ensureDriveFolder({
    driveId,
    parentItemId: root.id,
    name: sanitiseSharePointPart(settings.sharepoint_base_folder || "Assets", "Assets"),
  });
  const equipmentFolder = await ensureDriveFolder({
    driveId,
    parentItemId: baseFolder.id,
    name: sanitiseSharePointPart(settings.equipment_folder_name || "Equipment", "Equipment"),
  });
  const groupFolder = await ensureDriveFolder({
    driveId,
    parentItemId: equipmentFolder.id,
    name: DEFINITIONS[equipmentType].groupFolder,
  });

  const expectedName = equipmentFolderName(equipmentType, item);
  const { data: storedLink, error: linkError } = await service
    .from("equipment_sharepoint_links")
    .select("*")
    .eq("equipment_type", equipmentType)
    .eq("equipment_id", equipmentId)
    .maybeSingle();
  if (linkError) throw new Error(linkError.message);

  let folder: SharePointDriveItem | null = null;
  if (storedLink?.sharepoint_folder_id && clean(storedLink.sharepoint_drive_id) === driveId) {
    try {
      folder = await graphRequest<SharePointDriveItem>(
        `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(storedLink.sharepoint_folder_id)}?$select=id,name,webUrl,parentReference,folder`,
      );
    } catch {
      folder = null;
    }
  }

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
      parentItemId: groupFolder.id,
      name: expectedName,
    });
  }

  const now = new Date().toISOString();
  const { error: upsertError } = await service.from("equipment_sharepoint_links").upsert(
    {
      equipment_type: equipmentType,
      equipment_id: equipmentId,
      sharepoint_site_id: settings.sharepoint_site_id,
      sharepoint_drive_id: driveId,
      sharepoint_folder_id: folder.id,
      sharepoint_web_url: folder.webUrl ?? null,
      sharepoint_folder_name: folder.name,
      sharepoint_synced_at: now,
      updated_at: now,
    },
    { onConflict: "equipment_type,equipment_id" },
  );
  if (upsertError) throw new Error(upsertError.message);

  return { settings, item, driveId, root, baseFolder, equipmentFolder, groupFolder, itemFolder: folder };
}

export async function loadEquipmentDocumentTypes({
  service,
  equipmentType,
}: {
  service: AssetServiceClient;
  equipmentType: EquipmentType;
}) {
  const { data, error } = await service
    .from("equipment_document_types")
    .select("*")
    .eq("active", true)
    .order("sort_order")
    .order("name");
  if (error) throw new Error(error.message);

  return ((data ?? []) as EquipmentDocumentTypeRow[]).filter((row) => {
    const applies = Array.isArray(row.applies_to) ? row.applies_to : [];
    return applies.includes("all") || applies.includes(equipmentType);
  });
}

export async function loadEquipmentDocumentTypeById({
  service,
  documentTypeId,
  equipmentType,
}: {
  service: AssetServiceClient;
  documentTypeId: string;
  equipmentType: EquipmentType;
}) {
  const { data, error } = await service
    .from("equipment_document_types")
    .select("*")
    .eq("id", documentTypeId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Equipment document type could not be found.");

  const row = data as EquipmentDocumentTypeRow;
  const applies = Array.isArray(row.applies_to) ? row.applies_to : [];
  if (!applies.includes("all") && !applies.includes(equipmentType)) {
    throw new Error("That document type does not apply to this equipment register.");
  }
  return row;
}

function safeFileName(original: string) {
  const cleaned = original
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "document";
}

function validateDates(type: EquipmentDocumentTypeRow, documentDate?: string | null, expiryDate?: string | null) {
  if (["document_date", "document_and_expiry"].includes(type.date_requirement) && !clean(documentDate)) {
    throw new Error(`${type.name} requires a document / completion date.`);
  }
  if (["expiry_date", "document_and_expiry"].includes(type.date_requirement) && !clean(expiryDate)) {
    throw new Error(`${type.name} requires an expiry / due date.`);
  }
}

export async function publishEquipmentDocument({
  service,
  identity,
  equipmentType,
  equipmentId,
  documentType,
  fileName,
  content,
  contentType,
  title,
  documentDate,
  expiryDate,
  supplier,
  notes,
}: {
  service: AssetServiceClient;
  identity: AssetIdentity;
  equipmentType: EquipmentType;
  equipmentId: string;
  documentType: EquipmentDocumentTypeRow;
  fileName: string;
  content: Uint8Array;
  contentType: string;
  title?: string | null;
  documentDate?: string | null;
  expiryDate?: string | null;
  supplier?: string | null;
  notes?: string | null;
}) {
  validateDates(documentType, documentDate, expiryDate);

  const resolved = await ensureEquipmentSharePointFolder({
    service,
    equipmentType,
    equipmentId,
  });
  const categoryName = CATEGORY_FOLDERS[documentType.category] || "Other";
  const categoryFolder = await ensureDriveFolder({
    driveId: resolved.driveId,
    parentItemId: resolved.itemFolder.id,
    name: categoryName,
  });

  const previous: EquipmentDocumentRow[] = [];
  let supersededFolder: SharePointDriveItem | null = null;

  if (documentType.replacement_mode === "current") {
    const { data, error } = await service
      .from("equipment_documents")
      .select("*")
      .eq("equipment_type", equipmentType)
      .eq("equipment_id", equipmentId)
      .eq("document_type_id", documentType.id)
      .eq("active", true)
      .eq("is_current", true)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    previous.push(...((data ?? []) as EquipmentDocumentRow[]));

    if (previous.length > 0) {
      const supersededRoot = await ensureDriveFolder({
        driveId: resolved.driveId,
        parentItemId: resolved.itemFolder.id,
        name: clean(resolved.settings.superseded_folder_name) || "Superseded",
      });
      supersededFolder = await ensureDriveFolder({
        driveId: resolved.driveId,
        parentItemId: supersededRoot.id,
        name: categoryName,
      });
    }
  }

  let controlledName = safeFileName(fileName);
  const collision = await getDriveChildByName({
    driveId: resolved.driveId,
    parentItemId: categoryFolder.id,
    name: controlledName,
  });

  const previousItemIds = new Set(
    previous.map((row) => clean(row.sharepoint_item_id)).filter(Boolean),
  );

  if (collision && !previousItemIds.has(collision.id)) {
    const dot = controlledName.lastIndexOf(".");
    const stamp = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .slice(0, 14);
    controlledName =
      dot > 0
        ? `${controlledName.slice(0, dot)}-${stamp}${controlledName.slice(dot)}`
        : `${controlledName}-${stamp}`;
  }

  const movedPrevious: string[] = [];
  let uploadedItem: SharePointDriveItem | null = null;

  try {
    if (supersededFolder) {
      for (const row of previous) {
        if (
          clean(row.sharepoint_item_id) &&
          clean(row.sharepoint_drive_id) === resolved.driveId
        ) {
          await moveDriveItem({
            driveId: resolved.driveId,
            itemId: row.sharepoint_item_id,
            parentItemId: supersededFolder.id,
          });
          movedPrevious.push(row.sharepoint_item_id);
        }
      }
    }

    uploadedItem = await uploadDriveItemContent({
      driveId: resolved.driveId,
      parentItemId: categoryFolder.id,
      fileName: controlledName,
      content,
      contentType: contentType || "application/octet-stream",
    });

    const { data: inserted, error: insertError } = await service
      .from("equipment_documents")
      .insert({
        equipment_type: equipmentType,
        equipment_id: equipmentId,
        document_type_id: documentType.id,
        document_type_name: documentType.name,
        document_type_code: documentType.code,
        replacement_mode_snapshot: documentType.replacement_mode,
        document_category: documentType.category,
        title: clean(title) || documentType.name,
        document_date: clean(documentDate) || null,
        expiry_date: clean(expiryDate) || null,
        supplier: clean(supplier) || null,
        notes: clean(notes) || null,
        file_name: controlledName,
        content_type: contentType || "application/octet-stream",
        file_size_bytes: content.byteLength,
        sharepoint_site_id: resolved.settings.sharepoint_site_id,
        sharepoint_drive_id: resolved.driveId,
        sharepoint_folder_id: categoryFolder.id,
        sharepoint_item_id: uploadedItem.id,
        sharepoint_web_url: uploadedItem.webUrl ?? null,
        sharepoint_folder_path: [
          resolved.baseFolder.name,
          resolved.equipmentFolder.name,
          resolved.groupFolder.name,
          resolved.itemFolder.name,
          categoryFolder.name,
        ].join("/"),
        is_current: documentType.replacement_mode === "current",
        supersedes_document_id: previous[0]?.id ?? null,
        uploaded_by: identity.userId,
        uploaded_by_name: identity.name,
        active: true,
      })
      .select("*")
      .single();

    if (insertError) throw new Error(insertError.message);

    const document = inserted as EquipmentDocumentRow;

    if (previous.length > 0) {
      const now = new Date().toISOString();
      for (const row of previous) {
        const { error } = await service
          .from("equipment_documents")
          .update({
            active: false,
            is_current: false,
            superseded_by_document_id: document.id,
            superseded_at: now,
            superseded_by: identity.userId,
            sharepoint_folder_id:
              supersededFolder?.id ?? row.sharepoint_folder_id,
          })
          .eq("id", row.id);

        if (error) {
          console.error(
            `Equipment document ${row.id} supersede metadata warning`,
            error,
          );
        }
      }
    }

    return document;
  } catch (error) {
    if (uploadedItem?.id) {
      try {
        await deleteDriveItem({
          driveId: resolved.driveId,
          itemId: uploadedItem.id,
        });
      } catch (cleanupError) {
        console.error(
          "Failed to clean up incomplete equipment SharePoint upload",
          cleanupError,
        );
      }
    }

    for (const itemId of movedPrevious) {
      try {
        await moveDriveItem({
          driveId: resolved.driveId,
          itemId,
          parentItemId: categoryFolder.id,
        });
      } catch (restoreError) {
        console.error(
          `Failed to restore previous equipment document ${itemId}`,
          restoreError,
        );
      }
    }

    throw error;
  }
}

