import { NextResponse } from "next/server";

import { assetApiError, canManageAssets, canViewAssets, requireAssetUser } from "@/lib/assets/server";
import { deleteDriveItem, downloadDriveItemContent } from "@/lib/sharepoint/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ evidenceId: string }> },
) {
  try {
    const { evidenceId } = await context.params;
    const { service, identity } = await requireAssetUser(request);
    if (!canViewAssets(identity.role)) throw new Error("ASSET_VIEW_FORBIDDEN");

    const { data, error } = await service
      .from("asset_risk_assessment_evidence")
      .select("*")
      .eq("id", evidenceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Evidence was not found." }, { status: 404 });
    if (!data.sharepoint_drive_id || !data.sharepoint_item_id) {
      return NextResponse.json({ error: "This is legacy Supabase evidence and must be migrated to SharePoint first." }, { status: 409 });
    }

    const downloaded = await downloadDriveItemContent({
      driveId: data.sharepoint_drive_id,
      itemId: data.sharepoint_item_id,
    });

    return new NextResponse(downloaded.content, {
      headers: {
        "Content-Type": data.mime_type || downloaded.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${String(data.file_name || "evidence").replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const apiError = assetApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ evidenceId: string }> },
) {
  try {
    const { evidenceId } = await context.params;
    const { service, identity } = await requireAssetUser(request);
    if (!canManageAssets(identity.role)) throw new Error("ASSET_MANAGE_FORBIDDEN");

    const { data, error } = await service
      .from("asset_risk_assessment_evidence")
      .select("*")
      .eq("id", evidenceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Evidence was not found." }, { status: 404 });

    if (data.sharepoint_drive_id && data.sharepoint_item_id) {
      await deleteDriveItem({
        driveId: data.sharepoint_drive_id,
        itemId: data.sharepoint_item_id,
      });
    }

    const { error: deleteError } = await service
      .from("asset_risk_assessment_evidence")
      .delete()
      .eq("id", evidenceId);
    if (deleteError) throw new Error(deleteError.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const apiError = assetApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
