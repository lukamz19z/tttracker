import { NextResponse } from "next/server";

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
  safeQualitySharePointPart,
  uploadQualityFile,
} from "@/lib/sharepoint/quality";
import { deleteDriveItem, getGraphAccessToken } from "@/lib/sharepoint/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ revisionId: string }>;
};

type QualityFileRow = {
  id: string;
  revision_id: string;
  revision_item_id: string | null;
  file_role: "before_photo" | "after_photo" | "supporting" | "revision_pdf";
  file_name: string;
  mime_type: string | null;
  sharepoint_drive_id: string;
  sharepoint_item_id: string;
  captured_at: string | null;
  uploaded_by_label: string | null;
};

async function graphFileDataUrl(file: QualityFileRow) {
  const token = await getGraphAccessToken();
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(file.sharepoint_drive_id)}/items/${encodeURIComponent(file.sharepoint_item_id)}/content`,
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

  const contentType =
    response.headers.get("content-type") || file.mime_type || "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());

  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

async function toPdfPhoto(file: QualityFileRow): Promise<RevisionPdfPhoto> {
  return {
    id: file.id,
    fileName: file.file_name,
    mimeType: file.mime_type || "image/jpeg",
    dataUrl: await graphFileDataUrl(file),
    capturedAt: file.captured_at,
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
  try {
    const { revisionId } = await context.params;
    const { service, user, role } = await requireQualityUser(request);

    const { data: revision, error: revisionError } = await service
      .from("tower_revisions")
      .select(
        "id,project_id,tower_id,fli_number,inspection_stage,inspection_date,client_inspector,client_company,client_reference,notes,status,pdf_revision",
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

    const [project, tower, itemResult, issueTypeResult, fileResult, branding] =
      await Promise.all([
        loadQualityProject(service, revision.project_id),
        loadQualityTower(service, revision.tower_id, revision.project_id),
        service
          .from("tower_revision_items")
          .select(
            "id,item_number,issue_type_id,tower_segment,member_number,drawing_number,finding,rectification_comment,status,before_taken_at,before_taken_by_label,after_taken_at,after_taken_by_label,sort_order",
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
            "id,revision_id,revision_item_id,file_role,file_name,mime_type,sharepoint_drive_id,sharepoint_item_id,captured_at,uploaded_by_label",
          )
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
      return !before || !after || !String(item.rectification_comment ?? "").trim();
    });

    if (incomplete.length > 0) {
      const labels = incomplete
        .slice(0, 6)
        .map((item) => `Item ${String(item.item_number).padStart(3, "0")}`)
        .join(", ");
      return NextResponse.json(
        {
          error: `${labels}${incomplete.length > 6 ? " and others" : ""} need a Before photo, rectification comment and After photo before the controlled PDF can be created.`,
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

    const pdfItems: RevisionPdfItem[] = [];
    for (const item of items) {
      const beforeRows = files.filter(
        (file) =>
          file.revision_item_id === item.id && file.file_role === "before_photo",
      );
      const afterRows = files.filter(
        (file) => file.revision_item_id === item.id && file.file_role === "after_photo",
      );

      const [beforePhotos, afterPhotos] = await Promise.all([
        Promise.all(beforeRows.map(toPdfPhoto)),
        Promise.all(afterRows.map(toPdfPhoto)),
      ]);

      pdfItems.push({
        itemNumber: Number(item.item_number),
        issueType: issueTypeMap.get(item.issue_type_id) || "Other",
        towerSegment: item.tower_segment,
        memberNumber: item.member_number,
        drawingNumber: item.drawing_number,
        finding: item.finding,
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

    const reportRevision = Math.max(1, Number(revision.pdf_revision ?? 0) + 1);
    const generatedAt = new Date().toISOString();
    const generatedBy = qualityUserLabel(user);

    const pdf = generateRevisionPdf({
      projectName: project.name || "",
      projectNumber: project.project_number || "",
      towerName: qualityTowerLabel(tower),
      fliNumber: revision.fli_number,
      reportRevision,
      inspectionStage: revision.inspection_stage,
      inspectionDate: revision.inspection_date,
      clientInspector: revision.client_inspector,
      clientCompany: revision.client_company,
      clientReference: revision.client_reference,
      notes: revision.notes,
      generatedBy,
      generatedAt,
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

    const revisionFolder = await ensureRevisionFolder({
      driveId: project.sharepoint_drive_id,
      projectFolderId: project.sharepoint_folder_id,
      towerLabel: qualityTowerLabel(tower),
      fliNumber: revision.fli_number,
    });

    const fileName = `${safeQualitySharePointPart(revision.fli_number)}-R${String(reportRevision).padStart(2, "0")}.pdf`;
    const uploaded = await uploadQualityFile({
      driveId: project.sharepoint_drive_id,
      folderId: revisionFolder.id,
      fileName,
      content: pdf,
      contentType: "application/pdf",
    });

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

    const revisionUpdate = await service
      .from("tower_revisions")
      .update({
        pdf_revision: reportRevision,
        latest_pdf_file_id: savedFile.id,
        status: "Closed",
        completed_by: user.id,
        completed_by_label: generatedBy,
        completed_at: generatedAt,
      })
      .eq("id", revision.id);

    if (revisionUpdate.error) {
      throw new Error(
        `The PDF was created, but the Revision record could not be finalised: ${revisionUpdate.error.message}`,
      );
    }

    // Findings represented in a controlled PDF have completed rectification evidence.
    const itemUpdate = await service
      .from("tower_revision_items")
      .update({ status: "Verified" })
      .eq("revision_id", revision.id)
      .neq("status", "Verified");

    if (itemUpdate.error) {
      console.error("Revision PDF created but finding verification update failed", itemUpdate.error);
    }

    return NextResponse.json({
      success: true,
      report_revision: reportRevision,
      file: savedFile,
    });
  } catch (error) {
    console.error("REVISION PDF ERROR", error);

    const apiError = qualityApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
