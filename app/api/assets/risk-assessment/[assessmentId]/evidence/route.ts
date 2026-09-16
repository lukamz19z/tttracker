import { NextResponse } from "next/server";

import {
  assetApiError,
  canManageAssets,
  clean,
  requireAssetUser,
} from "@/lib/assets/server";
import { ensureAssetCategoryFolder } from "@/lib/assets/sharepoint";
import { ensureDriveFolder, uploadDriveItemContent } from "@/lib/sharepoint/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function assessmentAssetType(sourceTable: unknown) {
  const table = clean(sourceTable).toLowerCase();
  if (table === "vehicle_assets") return "vehicle" as const;
  if (table === "plant_assets") return "plant" as const;
  return null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ assessmentId: string }> },
) {
  try {
    const { assessmentId } = await context.params;
    const { service, identity } = await requireAssetUser(request);
    if (!canManageAssets(identity.role)) throw new Error("ASSET_MANAGE_FORBIDDEN");

    const formData = await request.formData();
    const file = formData.get("file");
    const responseId = clean(formData.get("responseId")) || null;

    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: "Choose an evidence file." }, { status: 400 });
    }

    const { data: assessment, error: assessmentError } = await service
      .from("asset_risk_assessments")
      .select("id,assessment_number,asset_source_table,asset_id,status")
      .eq("id", assessmentId)
      .maybeSingle();
    if (assessmentError) throw new Error(assessmentError.message);
    if (!assessment) return NextResponse.json({ error: "Risk assessment was not found." }, { status: 404 });

    const assetType = assessmentAssetType(assessment.asset_source_table);
    if (!assetType) {
      return NextResponse.json(
        { error: "This risk assessment is not linked to a Vehicle or Plant Asset." },
        { status: 400 },
      );
    }

    const resolved = await ensureAssetCategoryFolder({
      service,
      assetType,
      assetId: assessment.asset_id,
      category: "compliance",
    });

    const riskFolder = await ensureDriveFolder({
      driveId: resolved.driveId,
      parentItemId: resolved.categoryFolder.id,
      name: "Risk Assessments",
    });
    const assessmentFolder = await ensureDriveFolder({
      driveId: resolved.driveId,
      parentItemId: riskFolder.id,
      name: clean(assessment.assessment_number) || assessmentId,
    });
    const evidenceFolder = await ensureDriveFolder({
      driveId: resolved.driveId,
      parentItemId: assessmentFolder.id,
      name: "Evidence",
    });

    const safeName = file.name
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
      .replace(/\s+/g, " ")
      .trim() || "evidence";
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const dot = safeName.lastIndexOf(".");
    const fileName = dot > 0
      ? `${safeName.slice(0, dot)}-${stamp}${safeName.slice(dot)}`
      : `${safeName}-${stamp}`;

    const item = await uploadDriveItemContent({
      driveId: resolved.driveId,
      parentItemId: evidenceFolder.id,
      fileName,
      content: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type || "application/octet-stream",
    });

    const evidenceType = file.type === "application/pdf" ? "document" : file.type.startsWith("image/") ? "photo" : "other";

    const { data: inserted, error: insertError } = await service
      .from("asset_risk_assessment_evidence")
      .insert({
        assessment_id: assessmentId,
        response_id: responseId,
        evidence_type: evidenceType,
        storage_bucket: null,
        storage_path: null,
        file_name: fileName,
        mime_type: file.type || "application/octet-stream",
        file_size_bytes: file.size,
        caption: clean(formData.get("caption")) || null,
        description: clean(formData.get("description")) || null,
        display_order: Number(clean(formData.get("displayOrder")) || 0),
        include_in_report: clean(formData.get("includeInReport")) !== "false",
        uploaded_by: identity.userId,
        sharepoint_site_id: resolved.settings.sharepoint_site_id,
        sharepoint_drive_id: resolved.driveId,
        sharepoint_folder_id: evidenceFolder.id,
        sharepoint_item_id: item.id,
        sharepoint_web_url: item.webUrl ?? null,
        sharepoint_folder_path: [
          resolved.baseFolder.name,
          resolved.typeFolder.name,
          resolved.assetFolder.name,
          resolved.categoryFolder.name,
          riskFolder.name,
          assessmentFolder.name,
          evidenceFolder.name,
        ].join("/"),
      })
      .select("*")
      .single();

    if (insertError) throw new Error(insertError.message);
    return NextResponse.json({ evidence: inserted });
  } catch (error) {
    const apiError = assetApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
