import { NextResponse } from "next/server";

import {
  assetApiError,
  canViewAssets,
  requireAssetUser,
} from "@/lib/assets/server";
import { downloadDriveItemContent } from "@/lib/sharepoint/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { documentId } = await context.params;
    const { service, identity } = await requireAssetUser(request);

    if (!canViewAssets(identity.role)) {
      throw new Error("ASSET_VIEW_FORBIDDEN");
    }

    const { data: document, error } = await service
      .from("asset_documents")
      .select(
        "id,file_name,content_type,sharepoint_drive_id,sharepoint_item_id,active,superseded_at",
      )
      .eq("id", documentId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!document) {
      return NextResponse.json(
        { error: "Asset document could not be found." },
        { status: 404 },
      );
    }

    const downloaded = await downloadDriveItemContent({
      driveId: document.sharepoint_drive_id,
      itemId: document.sharepoint_item_id,
    });

    return new NextResponse(downloaded.content, {
      status: 200,
      headers: {
        "Content-Type":
          document.content_type ||
          downloaded.contentType ||
          "application/octet-stream",
        "Content-Disposition": `inline; filename="${String(
          document.file_name,
        ).replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const apiError = assetApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
