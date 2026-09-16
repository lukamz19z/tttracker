import { NextResponse } from "next/server";

import { assetApiError, canViewAssets, requireAssetUser } from "@/lib/assets/server";
import { downloadDriveItemContent } from "@/lib/sharepoint/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await context.params;
    const { service, identity } = await requireAssetUser(request);
    if (!canViewAssets(identity.role)) throw new Error("ASSET_VIEW_FORBIDDEN");

    const { data, error } = await service.from("equipment_documents").select("*").eq("id", documentId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Equipment document was not found." }, { status: 404 });

    const downloaded = await downloadDriveItemContent({
      driveId: data.sharepoint_drive_id,
      itemId: data.sharepoint_item_id,
    });

    return new NextResponse(downloaded.content, {
      headers: {
        "Content-Type": data.content_type || downloaded.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${String(data.file_name || "document").replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const apiError = assetApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
