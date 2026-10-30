import { revisionEvidenceContext } from "@/lib/quality/evidence-context";
import { annotateEvidence, WATERMARK_POSITIONS, type WatermarkPosition } from "@/lib/quality/evidence-watermark";
import { revisionItemFli, revisionReference } from "@/lib/quality/fli";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { ensurePublishedQualityEvidence } from "@/lib/quality/evidence-publication";
import { qualityPdfName } from "@/lib/quality/file-names";
import { qualityTimeZone } from "@/lib/quality/date-time";

import { loadSystemPdfBranding } from "@/lib/branding/server";
import {
  generateRevisionPdf,
  type RevisionPdfItem,
  type RevisionPdfPhoto,
} from "@/lib/quality/revision-pdf";
import {
  assertQualityProjectAccess,
  loadQualityProject,
  loadQualityTower,
  qualityApiError,
  qualityTowerLabel,
  qualityUserLabel,
  requireQualityUser,
} from "@/lib/quality/server";
import {
  ensureRevisionFolder,
  uploadQualityFile,
} from "@/lib/sharepoint/quality";
import { deleteDriveItem, getGraphAccessToken } from "@/lib/sharepoint/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ revisionId: string }>;
};

type QualityFileRow = {
  project_id:string;tower_id:string;defect_id:string|null;photo_no?:number|null;
  id: string;
  revision_id: string;
  revision_item_id: string | null;
  file_role: "before_photo" | "after_photo" | "supporting" | "revision_pdf";
  file_name: string;
  mime_type: string | null;
  sharepoint_drive_id: string;
  sharepoint_item_id: string;
  annotated_sharepoint_item_id?: string | null;
  evidence_metadata?: Record<string,unknown> | null;
  captured_at: string | null;
  created_at?: string | null;
  uploaded_by_label: string | null;
};

async function graphFileDataUrl(file: QualityFileRow, context?: Record<string,unknown>) {
  const token = await getGraphAccessToken();
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(file.sharepoint_drive_id)}/items/${encodeURIComponent(file.annotated_sharepoint_item_id || file.sharepoint_item_id)}/content`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      redirect: "follow",
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Could not load ${file.file_name} from SharePoint (${response.status}): ${body}`,
    );
  }

  let contentType =
    response.headers.get("content-type") || file.mime_type || "image/jpeg";
  let buffer: Buffer = Buffer.from(await response.arrayBuffer());
  try {buffer=await sharp(buffer).rotate().jpeg({quality:90}).toBuffer();contentType="image/jpeg";}
  catch {throw new Error(`Evidence image could not be decoded: ${file.file_name}.`);}
  if (!file.annotated_sharepoint_item_id && context) {
    const position=file.evidence_metadata?.position;
    buffer = Buffer.from(await annotateEvidence(buffer,{...context,phase:file.file_role === "after_photo" ? "AFTER" : "BEFORE",capturedAt:file.captured_at,capturedBy:file.evidence_metadata?.capturedBy,capturedDate:file.evidence_metadata?.capturedDate},typeof position === "string" && WATERMARK_POSITIONS.includes(position as WatermarkPosition) ? position as WatermarkPosition : "bottom-left"));
    contentType="image/jpeg";
  }

  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

async function toPdfPhoto(file: QualityFileRow, context?: Record<string,unknown>): Promise<RevisionPdfPhoto> {
  return {
    id: file.id,
    fileName: file.file_name,
    mimeType: file.annotated_sharepoint_item_id || context ? "image/jpeg" : file.mime_type || "image/jpeg",
    dataUrl: await graphFileDataUrl(file,context),
    capturedAt: file.captured_at,
    recordedAt: file.created_at,
    capturedBy:String(file.evidence_metadata?.capturedBy || ""),capturedDate:String(file.evidence_metadata?.capturedDate || ""),
    uploadedByLabel: file.uploaded_by_label,
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/quality/revisions/[revisionId]/pdf",
  });
}

export async function POST(request: Request, context: RouteContext) {
  let stage="authentication";
  const started=Date.now();
  const checkpoint=(value:string)=>{stage=value;if(process.env.NODE_ENV!=="production")console.info("Revision PDF stage",{stage,durationMs:Date.now()-started});};
  try {
    const { revisionId } = await context.params;
    const { service, user, role } = await requireQualityUser(request);

    checkpoint("Revision load");
    const { data: revision, error: revisionError } = await service
      .from("tower_revisions")
      .select(
        "id,project_id,tower_id,revision_number,fli_number,sequence_no,inspection_stage,inspection_date,client_inspector,client_company,client_reference,notes,status,pdf_revision",
      )
      .eq("id", revisionId)
      .single();

    if (revisionError || !revision) {
      return NextResponse.json({ error: "Revision could not be found." }, { status: 404 });
    }

    await assertQualityProjectAccess({
      service,
      userId: user.id,
      role,
      projectId: revision.project_id,
    });

    checkpoint("project, tower, items, issue labels, evidence and branding load");
    const [project, tower, itemResult, issueTypeResult, fileResult, branding] =
      await Promise.all([
        loadQualityProject(service, revision.project_id),
        loadQualityTower(service, revision.tower_id, revision.project_id),
        service
          .from("tower_revision_items")
          .select(
            "id,source_type,external_reference,source_date,inspector_name,imported_by_label,inspector_comment,actioned_by_label,actioned_at,item_number,fli_number,leg,assigned_flag,issue_type_id,other_issue_text,tower_segment,member_number,drawing_number,finding,rectification_comment,status,before_taken_at,before_taken_by_label,after_taken_at,after_taken_by_label,sort_order",
          )
          .eq("revision_id", revision.id)
          .order("sort_order")
          .order("item_number"),
        service
          .from("project_field_issue_types")
          .select("id,name")
          .eq("project_id", revision.project_id),
        service
          .from("tower_quality_files")
          .select(
            "id,project_id,tower_id,defect_id,photo_no,revision_id,revision_item_id,file_role,file_name,mime_type,sharepoint_drive_id,sharepoint_item_id,annotated_sharepoint_item_id,evidence_metadata,captured_at,created_at,uploaded_by_label",
          ).eq("deletion_pending",false)
          .eq("revision_id", revision.id)
          .in("file_role", ["before_photo", "after_photo"])
          .order("created_at"),
        loadSystemPdfBranding(),
      ]);

    if (itemResult.error) throw new Error(itemResult.error.message);
    if (issueTypeResult.error) throw new Error(issueTypeResult.error.message);
    if (fileResult.error) throw new Error(fileResult.error.message);

    const items = itemResult.data ?? [];
    const files = (fileResult.data ?? []) as QualityFileRow[];
    const issueTypeMap = new Map(
      (issueTypeResult.data ?? []).map((item) => [item.id, item.name]),
    );

    if (items.length === 0) {
      return NextResponse.json(
        { error: "Add at least one inspection finding before creating the PDF." },
        { status: 409 },
      );
    }

    const incomplete = items.filter((item) => {
      const before = files.some(
        (file) =>
          file.revision_item_id === item.id && file.file_role === "before_photo",
      );
      const after = files.some(
        (file) => file.revision_item_id === item.id && file.file_role === "after_photo",
      );
      const issueSelected = Boolean(
        item.issue_type_id || String(item.other_issue_text ?? "").trim(),
      );
      return !issueSelected || !before || !after || !["Rectified","Verified"].includes(item.status);
    });

    if (incomplete.some(item=>!item.issue_type_id && !String(item.other_issue_text || "").trim())) {
      const labels = incomplete
        .slice(0, 6)
        .map((item) => `Item ${String(item.item_number).padStart(3, "0")}`)
        .join(", ");
      return NextResponse.json(
        {
          error: `${labels}${incomplete.length > 6 ? " and others" : ""} need an issue type or Other description before a report can be created.`,
        },
        { status: 409 },
      );
    }

    if (!project.sharepoint_drive_id || !project.sharepoint_folder_id) {
      return NextResponse.json(
        {
          error:
            "This project is not linked to its Project Delivery SharePoint folder.",
        },
        { status: 409 },
      );
    }

    checkpoint("canonical evidence publication, download and image decode");
    const pdfItems: RevisionPdfItem[] = [];
    for (const item of items) {
      const beforeRows = files.filter(
        (file) =>
          file.revision_item_id === item.id && file.file_role === "before_photo",
      );
      const afterRows = files.filter(
        (file) => file.revision_item_id === item.id && file.file_role === "after_photo",
      );

      const evidenceContext = revisionEvidenceContext(revision,item,qualityTowerLabel(tower),issueTypeMap.get(item.issue_type_id));
      const [beforePhotos, afterPhotos] = await Promise.all([
        Promise.all(beforeRows.map(async file => toPdfPhoto({...file,...await ensurePublishedQualityEvidence(service,file),revision_id:file.revision_id},evidenceContext))),
        Promise.all(afterRows.map(async file => toPdfPhoto({...file,...await ensurePublishedQualityEvidence(service,file),revision_id:file.revision_id},evidenceContext))),
      ]);

      pdfItems.push({
        itemNumber: Number(item.item_number),
        assignedFlag: item.assigned_flag, leg: item.leg, itemReference: revisionItemFli(item),
        issueType:
          issueTypeMap.get(item.issue_type_id) ||
          String(item.other_issue_text ?? "").trim() ||
          "Other",
        towerSegment: item.tower_segment,
        memberNumber: item.member_number,
        drawingNumber: item.drawing_number,
        inspectorName:item.inspector_name,importedByLabel:item.imported_by_label,sourceType:item.source_type,externalReference:item.external_reference,sourceDate:item.source_date,inspectorComment:item.inspector_comment,actionedBy:item.actioned_by_label,actionedAt:item.actioned_at,
        finding: String(item.finding ?? ""),
        rectificationComment: String(item.rectification_comment ?? ""),
        status: item.status,
        beforeTakenAt: item.before_taken_at,
        beforeTakenByLabel: item.before_taken_by_label,
        afterTakenAt: item.after_taken_at,
        afterTakenByLabel: item.after_taken_by_label,
        beforePhotos,
        afterPhotos,
      });
    }

    const reserved=await service.rpc("reserve_v1_revision_pdf_number",{target_revision:revision.id});
    if(reserved.error || !reserved.data) throw new Error(reserved.error?.message || "PDF revision could not be reserved.");
    const reportRevision = Number(reserved.data);
    const complete=incomplete.length===0;
    const generatedAt = new Date().toISOString();
    const generatedBy = qualityUserLabel(user);

    checkpoint("PDF rendering");
    const pdf = generateRevisionPdf({
      projectName: project.name || "",
      projectNumber: project.project_number || "",
      towerName: qualityTowerLabel(tower),
      fliNumber: revisionReference(revision),
      reportRevision,
      reportState:complete?"Rectified":"Rectification pending - not finalised",
      inspectionStage: revision.inspection_stage,
      inspectionDate: revision.inspection_date,
      clientInspector: revision.client_inspector,
      clientCompany: revision.client_company,
      clientReference: revision.client_reference,
      notes: revision.notes,
      generatedBy,
      generatedAt,
      timeZone:qualityTimeZone(project.timezone),
      branding: {
        logoDataUrl: branding.logoDataUrl,
        companyName: branding.companyName,
        abn: branding.abn,
        addressLine1: branding.addressLine1,
        addressLine2: branding.addressLine2,
        suburb: branding.suburb,
        state: branding.state,
        postcode: branding.postcode,
        phone: branding.phone,
        email: branding.email,
        website: branding.website,
      },
      items: pdfItems,
    });

    checkpoint("SharePoint folder resolution");
    const revisionFolder = await ensureRevisionFolder({
      driveId: project.sharepoint_drive_id,
      projectFolderId: project.sharepoint_folder_id,
      towerLabel: qualityTowerLabel(tower),
      fliNumber: revisionReference(revision),
    });

    const fileName = qualityPdfName(project.project_number,qualityTowerLabel(tower),revisionReference(revision),reportRevision);
    checkpoint("SharePoint PDF upload");
    const uploaded = await uploadQualityFile({
      driveId: project.sharepoint_drive_id,
      folderId: revisionFolder.id,
      fileName,
      content: pdf,
      contentType: "application/pdf",
    });

    checkpoint("tower_quality_files insert");
    const { data: savedFile, error: saveFileError } = await service
      .from("tower_quality_files")
      .insert({
        project_id: revision.project_id,
        tower_id: revision.tower_id,
        revision_id: revision.id,
        revision_item_id: null,
        defect_id: null,
        file_role: "revision_pdf",
        file_name: uploaded.name || fileName,
        mime_type: "application/pdf",
        sharepoint_site_id: project.sharepoint_site_id,
        sharepoint_drive_id: project.sharepoint_drive_id,
        sharepoint_folder_id: revisionFolder.id,
        sharepoint_item_id: uploaded.id,
        sharepoint_web_url: uploaded.webUrl ?? null,
        captured_at: generatedAt,
        uploaded_by: user.id,
        uploaded_by_label: generatedBy,
      })
      .select("*")
      .single();

    if (saveFileError || !savedFile) {
      await deleteDriveItem({
        driveId: project.sharepoint_drive_id,
        itemId: uploaded.id,
      }).catch(() => undefined);
      throw new Error(saveFileError?.message || "PDF metadata could not be saved.");
    }

    checkpoint("latest_pdf_file_id and PDF revision update");
    const revisionUpdate = await service
      .from("tower_revisions")
      .update({
        pdf_revision: reportRevision,
        latest_pdf_file_id: savedFile.id,
        ...(complete?{status:"Closed",completed_by:user.id,completed_by_label:generatedBy,completed_at:generatedAt}:{}),
      })
      .eq("id", revision.id).or(`pdf_revision.is.null,pdf_revision.lte.${reportRevision}`);

    if (revisionUpdate.error) {
      throw new Error(
        `The PDF was created, but the Revision record could not be finalised: ${revisionUpdate.error.message}`,
      );
    }

    // Findings represented in a controlled PDF have completed rectification evidence.
    const itemUpdate = complete ? await service
      .from("tower_revision_items")
      .update({ status: "Verified" })
      .eq("revision_id", revision.id)
      .neq("status", "Verified") : {error:null};

    if (itemUpdate.error) {
      console.error("Revision PDF created but finding verification update failed", itemUpdate.error);
    }

    return NextResponse.json({
      success: true,
      report_revision: reportRevision,
      file: savedFile,
    });
  } catch (error) {
    console.error("REVISION PDF ERROR", {stage,durationMs:Date.now()-started,error:error instanceof Error?error.message:"Unknown error"});

    const apiError = qualityApiError(error);
    return NextResponse.json({ error: apiError.status===500?`Revision PDF failed during ${stage}: ${apiError.message}`:apiError.message }, { status: apiError.status });
  }
}
