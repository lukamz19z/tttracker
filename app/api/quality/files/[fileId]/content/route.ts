import sharp from "sharp";
import { loadDefectEvidenceContext, loadRevisionEvidenceContext } from "@/lib/quality/evidence-context";
import { ensurePublishedQualityEvidence } from "@/lib/quality/evidence-publication";
import { annotateEvidence, WATERMARK_POSITIONS, type WatermarkPosition } from "@/lib/quality/evidence-watermark";
import { NextResponse } from "next/server";

import {
  assertQualityProjectAccess,
  qualityApiError,
  requireQualityUser,
} from "@/lib/quality/server";
import { getGraphAccessToken } from "@/lib/sharepoint/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ fileId: string }>;
};

function safeHeaderFileName(value: string) {
  return value.replace(/[\r\n"]/g, "_");
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { fileId } = await context.params;
    const { service, user, role } = await requireQualityUser(request);

    const { data: storedFile, error } = await service
      .from("tower_quality_files")
      .select(
        "id,project_id,tower_id,photo_no,file_name,mime_type,sharepoint_drive_id,sharepoint_item_id,annotated_sharepoint_item_id,defect_id,revision_id,revision_item_id,file_role,captured_at,created_at,evidence_metadata",
      )
      .eq("deletion_pending", false)
      .eq("id", fileId)
      .single();

    if (error || !storedFile) {
      return NextResponse.json({ error: "Quality file could not be found." }, { status: 404 });
    }

    await assertQualityProjectAccess({
      service,
      userId: user.id,
      role,
      projectId: storedFile.project_id,
    });

    const annotated = new URL(request.url).searchParams.get("variant") !== "original";
    const file=annotated?await ensurePublishedQualityEvidence(service,storedFile):storedFile;
    const itemId = annotated && file.annotated_sharepoint_item_id ? file.annotated_sharepoint_item_id : file.sharepoint_item_id;
    const token = await getGraphAccessToken();
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(file.sharepoint_drive_id)}/items/${encodeURIComponent(itemId)}/content`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        redirect: "follow",
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `SharePoint quality file could not be loaded (${response.status}): ${body}`,
      );
    }

    let bytes = await response.arrayBuffer();
    const legacyAnnotation = annotated && !file.annotated_sharepoint_item_id && ((file.revision_id && file.revision_item_id && ["before_photo","after_photo"].includes(file.file_role)) || (file.defect_id && file.file_role==="defect_photo"));
    if (legacyAnnotation) {
      const context=file.defect_id ? await loadDefectEvidenceContext(service,file.project_id,file.defect_id) : await loadRevisionEvidenceContext(service,file.project_id,file.revision_id,file.revision_item_id);
      const selected=file.evidence_metadata?.position;
      const position: WatermarkPosition = WATERMARK_POSITIONS.includes(selected) ? selected : "bottom-left";
      bytes = Uint8Array.from(await annotateEvidence(new Uint8Array(bytes),{...context,phase:file.file_role === "after_photo" ? "AFTER" : "BEFORE",capturedAt:file.captured_at},position)).buffer;
    }
    const contentType =
      (annotated && file.annotated_sharepoint_item_id) || legacyAnnotation ? "image/jpeg" : response.headers.get("content-type") || file.mime_type || "application/octet-stream";

    const preview = new URL(request.url).searchParams.get("preview") === "1" && contentType.startsWith("image/");
    if(preview) bytes=Uint8Array.from(await sharp(Buffer.from(bytes)).resize({width:960,height:960,fit:"inside",withoutEnlargement:true}).jpeg({quality:78}).toBuffer()).buffer;
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": preview ? "image/jpeg" : contentType,
        "Content-Disposition": `inline; filename="${safeHeaderFileName(file.file_name)}"`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("QUALITY FILE CONTENT ERROR", error);
    const apiError = qualityApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
