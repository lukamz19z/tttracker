import { NextResponse } from "next/server";

import {
  assetApiError,
  canManageAssets,
  clean,
  requireAssetUser,
} from "@/lib/assets/server";
import {
  loadEquipmentDocumentTypeById,
  parseEquipmentType,
  publishEquipmentDocument,
} from "@/lib/assets/equipment-sharepoint";
import { loadAssetSettings } from "@/lib/assets/sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<{ equipmentType: string; equipmentId: string }> },
) {
  try {
    const { equipmentType: rawType, equipmentId } = await context.params;
    const equipmentType = parseEquipmentType(rawType);
    if (!equipmentType) return NextResponse.json({ error: "Unsupported equipment type." }, { status: 400 });

    const { service, identity } = await requireAssetUser(request);
    if (!canManageAssets(identity.role)) throw new Error("ASSET_MANAGE_FORBIDDEN");

    const formData = await request.formData();
    const file = formData.get("file");
    const documentTypeId = clean(formData.get("documentTypeId"));

    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: "Choose a document to upload." }, { status: 400 });
    }
    if (!documentTypeId) {
      return NextResponse.json({ error: "Select the equipment document type." }, { status: 400 });
    }

    const [settings, documentType] = await Promise.all([
      loadAssetSettings(service),
      loadEquipmentDocumentTypeById({ service, documentTypeId, equipmentType }),
    ]);

    const maxBytes = Math.max(1, Number(settings.max_file_size_mb || 50)) * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json({ error: `The file is larger than the configured ${settings.max_file_size_mb} MB Asset upload limit.` }, { status: 413 });
    }

    const document = await publishEquipmentDocument({
      service,
      identity,
      equipmentType,
      equipmentId,
      documentType,
      fileName: file.name,
      content: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type || "application/octet-stream",
      title: clean(formData.get("title")) || documentType.name,
      documentDate: clean(formData.get("documentDate")) || null,
      expiryDate: clean(formData.get("expiryDate")) || null,
      supplier: clean(formData.get("supplier")) || null,
      notes: clean(formData.get("notes")) || null,
    });

    return NextResponse.json({ document });
  } catch (error) {
    const apiError = assetApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
