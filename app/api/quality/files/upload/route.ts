import { defectEvidenceContext, revisionEvidenceContext } from "@/lib/quality/evidence-context";
import { revisionItemFli, revisionReference } from "@/lib/quality/fli";
import { createHash, randomUUID } from "node:crypto";
import { annotateEvidence, EVIDENCE_WATERMARK_VERSION, watermarkLines, WATERMARK_POSITIONS, type WatermarkPosition } from "@/lib/quality/evidence-watermark";
import { qualityEvidenceName } from "@/lib/quality/file-names";
import { canonicalCaptureTime, qualityTimeZone } from "@/lib/quality/date-time";
import { NextResponse } from "next/server";

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
  ensureDefectPhotosFolder,
  ensureRevisionPhotoFolder,
  safeQualitySharePointPart,
  uploadQualityFile,
} from "@/lib/sharepoint/quality";
import { deleteDriveItem, downloadDriveItemContent, ensureDriveFolder, graphRequest } from "@/lib/sharepoint/graph";
import { verifyQualityUpload } from "@/lib/quality/upload-ticket";
import { cleanupQualityUploadSessions } from "@/lib/quality/upload-cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png"]);
const SUPPORTING_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
]);

type FileRole =
  | "defect_photo"
  | "before_photo"
  | "after_photo"
  | "supporting";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function timestampPart(value: string) {
  return value.replace(/[-:.TZ]/g, "").slice(0, 14);
}

function safeOriginalName(name: string) {
  const dot = name.lastIndexOf(".");
  const extension = dot >= 0 ? name.slice(dot).toLowerCase() : "";
  const stem = dot >= 0 ? name.slice(0, dot) : name;
  return `${safeQualitySharePointPart(stem).replace(/\s+/g, "-")}${extension}`;
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/quality/files/upload" });
}

export async function POST(request: Request) {
  let uploadedDriveId: string | null = null;
  let uploadedItemId: string | null = null;
  let uploadedAnnotatedItemId: string | null = null;
  let staging: {driveId:string;itemId:string} | null = null;
  let cleanupTransfer: (()=>Promise<void>) | null = null;
  let transferId: string|null=null;
  let transferConfirmed=false;

  try {
    const { service, user, role } = await requireQualityUser(request);
    let formData: FormData;
    if (request.headers.get("content-type")?.includes("application/json")) {
      const body=await request.json();
      let ticket;
      try {ticket=verifyQualityUpload(String(body.ticket || ""),user.id);}
      catch {return NextResponse.json({error:"Evidence upload session is invalid or expired. Retry this photo."},{status:403});}
      await assertQualityProjectAccess({service,userId:user.id,role,projectId:ticket.projectId});
      const existing=await service.from("tower_quality_files").select("*").eq("project_id",ticket.projectId).eq("mobile_client_mutation_id",`${ticket.revisionItemId || ticket.defectId}:${ticket.fileRole}:${ticket.clientMutationId}`).maybeSingle();
      if(existing.error) throw new Error(existing.error.message);
      if(existing.data) return NextResponse.json({success:true,file:existing.data});
      const transfer=await service.from("tower_quality_upload_sessions").select("id").eq("id",ticket.sessionId).eq("user_id",user.id).eq("project_id",ticket.projectId).maybeSingle();
      if(transfer.error) throw new Error(transfer.error.message);
      if(!transfer.data) return NextResponse.json({error:"Evidence session no longer exists. Retry the pending photo."},{status:409});
      transferId=ticket.sessionId;
      cleanupTransfer=()=>cleanupQualityUploadSessions(service,{sessionId:ticket.sessionId,preservePublished:true});
      const item=await graphRequest<{id:string;size:number;parentReference:{id:string}}>(`/drives/${encodeURIComponent(ticket.driveId)}/items/${encodeURIComponent(ticket.folderId)}:/${encodeURIComponent(ticket.stagingName)}`);
      if(item.size!==ticket.size || item.size>MAX_FILE_BYTES || item.parentReference.id!==ticket.folderId) return NextResponse.json({error:"Uploaded evidence size or destination does not match its authorised session."},{status:400});
      staging={driveId:ticket.driveId,itemId:item.id};
      const source=await downloadDriveItemContent(staging);
      formData=new FormData();
      for(const key of ["projectId","towerId","defectId","revisionId","revisionItemId","fileRole","clientMutationId","watermarkPosition","capturedAt","evidencePhase"] as const) formData.set(key,ticket[key]);
      formData.set("file",new File([Buffer.from(source.content)],ticket.name,{type:ticket.mimeType}));
    } else {
      if(Number(request.headers.get("content-length"))>4_000_000) return NextResponse.json({error:"Use the Quality direct upload session for large evidence.",code:"DIRECT_UPLOAD_REQUIRED"},{status:413});
      formData = await request.formData();
    }

    const projectId = field(formData, "projectId");
    const towerId = field(formData, "towerId");
    const defectId = field(formData, "defectId") || null;
    const revisionId = field(formData, "revisionId") || null;
    const revisionItemId = field(formData, "revisionItemId") || null;
    const fileRole = field(formData, "fileRole") as FileRole;
    const photoMutationId = field(formData, "clientMutationId");
    const mutationKey = photoMutationId ? `${revisionItemId || defectId}:${fileRole}:${photoMutationId}` : null;
    const watermarkPosition = (field(formData, "watermarkPosition") || "bottom-left") as WatermarkPosition;
    if (!WATERMARK_POSITIONS.includes(watermarkPosition)) return NextResponse.json({ error: "Invalid watermark position." }, { status: 400 });
    const capturedAt = canonicalCaptureTime(field(formData, "capturedAt")) || "";
    if (["before_photo","after_photo","defect_photo"].includes(fileRole) && !capturedAt) return NextResponse.json({error:"A valid evidence capture timestamp including UTC or timezone offset is required."},{status:400});
    const displayValue = formData.get("file");
    const originalValue = formData.get("originalFile");
    // Legacy multipart clients may carry both; direct sessions carry only
    // untouched original bytes. Derivatives are generated here before publishing.
    // Canonical server rendering always starts from untouched original bytes.
    const fileValue = originalValue instanceof File ? originalValue : displayValue;
    if (originalValue instanceof File && (!(displayValue instanceof File) || !PHOTO_TYPES.has(displayValue.type) || displayValue.size > MAX_FILE_BYTES)) return NextResponse.json({error:"Invalid annotated evidence image."},{status:400});
    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;

    if (!projectId || !towerId) {
      return NextResponse.json(
        { error: "Project and Tower are required." },
        { status: 400 },
      );
    }

    if (!file) {
      return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "Quality files must be 25 MB or smaller. The original is retained locally." },
        { status: 413 },
      );
    }

    if (!["defect_photo", "before_photo", "after_photo", "supporting"].includes(fileRole)) {
      return NextResponse.json({ error: "Invalid quality file role." }, { status: 400 });
    }

    const allowedTypes = fileRole === "supporting" ? SUPPORTING_TYPES : PHOTO_TYPES;
    if (!allowedTypes.has(file.type)) {
      return NextResponse.json(
        {
          error:
            fileRole === "supporting"
              ? "Supporting files must be PDF, JPEG or PNG."
              : "Photos must be JPEG or PNG. HEIC/HEIF should be converted to JPEG before upload.",
        },
        { status: 400 },
      );
    }

    await assertQualityProjectAccess({
      service,
      userId: user.id,
      role,
      projectId,
    });

    if (mutationKey) {
      const existing = await service.from("tower_quality_files").select("*").eq("project_id", projectId).eq("mobile_client_mutation_id", mutationKey).maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (existing.data) return NextResponse.json({ success: true, file: existing.data });
    }

    const [project, tower] = await Promise.all([
      loadQualityProject(service, projectId),
      loadQualityTower(service, towerId, projectId),
    ]);

    if (!project.sharepoint_drive_id || !project.sharepoint_folder_id) {
      return NextResponse.json(
        {
          error:
            "This project is not linked to its Project Delivery SharePoint folder. Configure the project SharePoint link first.",
        },
        { status: 409 },
      );
    }

    const towerLabel = qualityTowerLabel(tower);
    const uploadedByLabel = qualityUserLabel(user);
    let folder: { id: string; webUrl?: string };
    let finalName: string;
    let itemNumber: number | null = null;
    let evidenceContext: Record<string, unknown> | null = null;

    if (fileRole === "defect_photo") {
      if (!defectId || revisionId || revisionItemId) {
        return NextResponse.json(
          { error: "A Defect photo requires a Defect ID only." },
          { status: 400 },
        );
      }

      const { data: defect, error: defectError } = await service
        .from("tower_defects")
        .select("*")
        .eq("id", defectId)
        .eq("project_id", projectId)
        .eq("tower_id", towerId)
        .single();

      if (defectError || !defect) {
        return NextResponse.json({ error: "Defect could not be found." }, { status: 404 });
      }

      if (!defect.defect_number) {
        return NextResponse.json(
          { error: "The Defect does not have a controlled Defect number." },
          { status: 409 },
        );
      }
      if(defect.status==="Closed") return NextResponse.json({error:"Reopen the Defect before changing evidence."},{status:409});

      folder = await ensureDefectPhotosFolder({
        driveId: project.sharepoint_drive_id,
        projectFolderId: project.sharepoint_folder_id,
        towerLabel,
        defectNumber: defect.defect_number,
      });

      finalName = `${safeQualitySharePointPart(defect.defect_number)}-${timestampPart(capturedAt)}-${safeOriginalName(file.name)}`;
      const issue=defect.issue_type_id ? await service.from("project_field_issue_types").select("name").eq("id",defect.issue_type_id).maybeSingle() : null;
      if(issue?.error) throw new Error(issue.error.message);
      evidenceContext={...defectEvidenceContext(defect,towerLabel,issue?.data?.name),phase:["BEFORE","AFTER","EVIDENCE"].includes(field(formData,"evidencePhase"))?field(formData,"evidencePhase"):"EVIDENCE",project:project.project_number,capturedAt};
    } else {
      if (!revisionId) {
        return NextResponse.json(
          { error: "Revision files require a Revision ID." },
          { status: 400 },
        );
      }

      const { data: revision, error: revisionError } = await service
        .from("tower_revisions")
        .select("id,project_id,tower_id,revision_number,fli_number,sequence_no,status,finalised_at")
        .eq("id", revisionId)
        .eq("project_id", projectId)
        .eq("tower_id", towerId)
        .single();

      if (revisionError || !revision) {
        return NextResponse.json({ error: "Revision could not be found." }, { status: 404 });
      }
      if(revision.finalised_at || !["Draft","Open","In Progress"].includes(revision.status)) return NextResponse.json({error:"Controlled Revision evidence cannot be changed."},{status:409});

      const parentReference = revisionReference(revision);
      if (!parentReference) {
        return NextResponse.json(
          { error: "The Revision does not have a controlled RECT number." },
          { status: 409 },
        );
      }

      if (fileRole === "before_photo" || fileRole === "after_photo") {
        if (!revisionItemId) {
          return NextResponse.json(
            { error: "Before/After photos require a Revision finding." },
            { status: 400 },
          );
        }

        const { data: revisionItem, error: itemError } = await service
          .from("tower_revision_items")
          .select("*")
          .eq("id", revisionItemId)
          .eq("revision_id", revisionId)
          .single();

        if (itemError || !revisionItem) {
          return NextResponse.json(
            { error: "Revision finding could not be found." },
            { status: 404 },
          );
        }

        if (!revisionItemFli(revisionItem)) return NextResponse.json({ error: "The finding does not have a controlled FLI number yet. Retry after the finding has synced." }, { status: 409 });
        itemNumber = Number(revisionItem.item_number);
        const issue = revisionItem.issue_type_id ? await service.from("project_field_issue_types").select("name").eq("id", revisionItem.issue_type_id).maybeSingle() : null;
        if (issue?.error) throw new Error(issue.error.message);
        evidenceContext = { ...revisionEvidenceContext(revision,revisionItem,towerLabel,issue?.data?.name), project:project.project_number,phase: fileRole === "before_photo" ? "BEFORE" : "AFTER", capturedAt };


        folder = await ensureRevisionPhotoFolder({
          driveId: project.sharepoint_drive_id,
          projectFolderId: project.sharepoint_folder_id,
          towerLabel,
          fliNumber: parentReference,
          photoType: fileRole === "before_photo" ? "before" : "after",
        });

        const typePart = fileRole === "before_photo" ? "BEFORE" : "AFTER";
        finalName = `${safeQualitySharePointPart(parentReference)}-ITEM-${String(itemNumber).padStart(3, "0")}-${typePart}-${timestampPart(capturedAt)}-${safeOriginalName(file.name)}`;
      } else {
        folder = await ensureRevisionPhotoFolder({
          driveId: project.sharepoint_drive_id,
          projectFolderId: project.sharepoint_folder_id,
          towerLabel,
          fliNumber: parentReference,
          photoType: "supporting",
        });
        finalName = `${safeQualitySharePointPart(parentReference)}-${timestampPart(capturedAt)}-${safeOriginalName(file.name)}`;
      }
    }

    let photoNumber:number|null=null;
    const phase=String(evidenceContext?.phase || "EVIDENCE");
    if(evidenceContext) {
      if(!transferId) {
        const tracked=await service.from("tower_quality_upload_sessions").upsert({idempotency_key:createHash("sha256").update(mutationKey || randomUUID()).digest("hex"),project_id:projectId,tower_id:towerId,user_id:user.id,revision_id:revisionId,revision_item_id:revisionItemId,defect_id:defectId,drive_id:project.sharepoint_drive_id,folder_id:folder.id,staging_name:"Unused multipart staging placeholder"},{onConflict:"idempotency_key"}).select("id").single();
        if(tracked.error || !tracked.data) throw new Error(tracked.error?.message || "Photo numbering receipt was not saved.");
        const id=String(tracked.data.id);transferId=id;
        cleanupTransfer=()=>cleanupQualityUploadSessions(service,{sessionId:id,preservePublished:true});
      }
      const number=await service.rpc("claim_v1_quality_photo_number",{target_file:null,target_session:transferId,photo_phase:phase});
      if(number.error || !number.data) throw new Error(number.error?.message || "Photo number was not allocated.");
      photoNumber=Number(number.data);
      finalName=qualityEvidenceName(project.project_number,towerLabel,evidenceContext.reference,evidenceContext.fli,phase,photoNumber);
    }
    if(evidenceContext) evidenceContext.timeZone=qualityTimeZone(project.timezone);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const annotatedBytes = evidenceContext ? await annotateEvidence(bytes,evidenceContext,watermarkPosition) : null;
    console.info("Quality evidence size",{operation:"quality_evidence_upload",fileRole,originalBytes:bytes.byteLength,annotatedBytes:annotatedBytes?.byteLength,transport:staging?"SharePoint upload session":"multipart"});
    const uploaded = await uploadQualityFile({
      driveId: project.sharepoint_drive_id,
      folderId: evidenceContext ? (await ensureDriveFolder({driveId:project.sharepoint_drive_id,parentItemId:folder.id,name:"Originals"})).id : folder.id,
      fileName: evidenceContext ? `ORIGINAL_${finalName.replace(/\.jpg$/i,file.type==="image/png"?".png":".jpg")}` : finalName,
      content: bytes,
      contentType: file.type || "application/octet-stream",
    });

    uploadedDriveId = project.sharepoint_drive_id;
    uploadedItemId = uploaded.id;
    if(transferId) {const saved=await service.from("tower_quality_upload_sessions").update({published_item_id:uploaded.id}).eq("id",transferId);if(saved.error) throw new Error(saved.error.message);}

    let annotatedItemId: string | null = null;
    let annotatedWebUrl: string | null = null;
    if (annotatedBytes) {
      const annotated = annotatedBytes;
      const derivative = await uploadQualityFile({ driveId: project.sharepoint_drive_id, folderId: folder.id, fileName: finalName, content: annotated, contentType: "image/jpeg" });
      annotatedItemId = derivative.id; uploadedAnnotatedItemId = derivative.id;
      annotatedWebUrl = derivative.webUrl || null;
      if(transferId) {const saved=await service.from("tower_quality_upload_sessions").update({annotated_item_id:derivative.id}).eq("id",transferId);if(saved.error) throw new Error(saved.error.message);}
    }
    const { data: savedFile, error: fileError } = await service
      .from("tower_quality_files")
      .insert({
        mobile_client_mutation_id: mutationKey,
        photo_no:photoNumber,evidence_type:evidenceContext?phase:null,
        evidence_metadata: evidenceContext ? { ...evidenceContext, watermarkVersion:EVIDENCE_WATERMARK_VERSION,position: watermarkPosition, lines: watermarkLines(evidenceContext) } : null,
        annotated_sharepoint_item_id: annotatedItemId,
        project_id: projectId,
        tower_id: towerId,
        defect_id: defectId,
        revision_id: revisionId,
        revision_item_id: revisionItemId,
        file_role: fileRole,
        file_name: finalName,
        mime_type: annotatedBytes ? "image/jpeg" : file.type || null,
        sharepoint_site_id: project.sharepoint_site_id,
        sharepoint_drive_id: project.sharepoint_drive_id,
        sharepoint_folder_id: folder.id,
        sharepoint_item_id: uploaded.id,
        sharepoint_web_url: annotatedWebUrl || uploaded.webUrl || null,
        captured_at: capturedAt || null,
        uploaded_by: user.id,
        uploaded_by_label: uploadedByLabel,
      })
      .select("*")
      .single();

    if (fileError || !savedFile) {
      if (mutationKey) {
        // A timed-out earlier request may have committed, or another retry won
        // the unique-key race. Never delete a file another metadata row owns.
        const existing = await service.from("tower_quality_files").select("*").eq("project_id", projectId).eq("mobile_client_mutation_id", mutationKey).maybeSingle();
        uploadedItemId = null; uploadedAnnotatedItemId = null;
        if (existing.data) {transferConfirmed=true;return NextResponse.json({ success: true, file: existing.data });}
        throw new Error(fileError?.message || "Evidence association could not be confirmed. Retry the pending upload.");
      }
      await deleteDriveItem({
        driveId: project.sharepoint_drive_id,
        itemId: uploaded.id,
      }).catch(() => undefined);
      throw new Error(fileError?.message || "Quality file metadata could not be saved.");
    }

    // Both files are now durably associated. Do not delete them on a later timestamp-update error.
    uploadedItemId = null; uploadedAnnotatedItemId = null;
    transferConfirmed=true;
    if (revisionItemId && (fileRole === "before_photo" || fileRole === "after_photo")) {
      const update: Record<string, unknown> = {};

      if (fileRole === "before_photo") {
        update.before_taken_at = capturedAt;
        update.before_taken_by = user.id;
        update.before_taken_by_label = uploadedByLabel;
      } else {
        update.after_taken_at = capturedAt;
        update.after_taken_by = user.id;
        update.after_taken_by_label = uploadedByLabel;

        const { data: item } = await service
          .from("tower_revision_items")
          .select("rectification_comment")
          .eq("id", revisionItemId)
          .maybeSingle();

        if (String(item?.rectification_comment ?? "").trim()) {
          const before=await service.from("tower_quality_files").select("id").eq("revision_item_id",revisionItemId).eq("file_role","before_photo").limit(1);
          if(before.error) throw new Error(before.error.message);
          if(before.data?.length) update.status = "Rectified";
        }
      }

      const itemUpdate = await service
        .from("tower_revision_items")
        .update(update)
        .eq("id", revisionItemId);

      if (itemUpdate.error) {
        console.error("Quality photo saved but Revision finding metadata update failed", itemUpdate.error);
      }
    }

    return NextResponse.json({
      success: true,
      file: savedFile,
      item_number: itemNumber,
      sizes:{originalBytes:bytes.byteLength,annotatedBytes:annotatedBytes?.byteLength || null},
    });
  } catch (error) {
    if (uploadedDriveId && uploadedAnnotatedItemId) await deleteDriveItem({ driveId: uploadedDriveId, itemId: uploadedAnnotatedItemId }).catch(() => undefined);
    if (uploadedDriveId && uploadedItemId) {
      await deleteDriveItem({
        driveId: uploadedDriveId,
        itemId: uploadedItemId,
      }).catch(() => undefined);
    }

    console.error("QUALITY FILE UPLOAD ERROR", error);
    const apiError = qualityApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  } finally {
    if(cleanupTransfer && transferConfirmed) await cleanupTransfer().catch(()=>console.warn("Quality staging cleanup pending; durable receipt retained",{itemId:staging?.itemId}));
  }
}
