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
import { deleteDriveItem } from "@/lib/sharepoint/graph";

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

function normaliseCapturedAt(value: string) {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
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

  try {
    const { service, user, role } = await requireQualityUser(request);
    const formData = await request.formData();

    const projectId = field(formData, "projectId");
    const towerId = field(formData, "towerId");
    const defectId = field(formData, "defectId") || null;
    const revisionId = field(formData, "revisionId") || null;
    const revisionItemId = field(formData, "revisionItemId") || null;
    const fileRole = field(formData, "fileRole") as FileRole;
    const capturedAt = normaliseCapturedAt(field(formData, "capturedAt"));
    const fileValue = formData.get("file");
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
        { error: "Quality files must be 25 MB or smaller." },
        { status: 400 },
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

    if (fileRole === "defect_photo") {
      if (!defectId || revisionId || revisionItemId) {
        return NextResponse.json(
          { error: "A Defect photo requires a Defect ID only." },
          { status: 400 },
        );
      }

      const { data: defect, error: defectError } = await service
        .from("tower_defects")
        .select("id,project_id,tower_id,defect_number")
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

      folder = await ensureDefectPhotosFolder({
        driveId: project.sharepoint_drive_id,
        projectFolderId: project.sharepoint_folder_id,
        towerLabel,
        defectNumber: defect.defect_number,
      });

      finalName = `${safeQualitySharePointPart(defect.defect_number)}-${timestampPart(capturedAt)}-${safeOriginalName(file.name)}`;
    } else {
      if (!revisionId) {
        return NextResponse.json(
          { error: "Revision files require a Revision ID." },
          { status: 400 },
        );
      }

      const { data: revision, error: revisionError } = await service
        .from("tower_revisions")
        .select("id,project_id,tower_id,fli_number")
        .eq("id", revisionId)
        .eq("project_id", projectId)
        .eq("tower_id", towerId)
        .single();

      if (revisionError || !revision) {
        return NextResponse.json({ error: "Revision could not be found." }, { status: 404 });
      }

      if (!revision.fli_number) {
        return NextResponse.json(
          { error: "The Revision does not have a controlled FLI number." },
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
          .select("id,revision_id,item_number,rectification_comment,status")
          .eq("id", revisionItemId)
          .eq("revision_id", revisionId)
          .single();

        if (itemError || !revisionItem) {
          return NextResponse.json(
            { error: "Revision finding could not be found." },
            { status: 404 },
          );
        }

        itemNumber = Number(revisionItem.item_number);

        folder = await ensureRevisionPhotoFolder({
          driveId: project.sharepoint_drive_id,
          projectFolderId: project.sharepoint_folder_id,
          towerLabel,
          fliNumber: revision.fli_number,
          photoType: fileRole === "before_photo" ? "before" : "after",
        });

        const typePart = fileRole === "before_photo" ? "BEFORE" : "AFTER";
        finalName = `${safeQualitySharePointPart(revision.fli_number)}-ITEM-${String(itemNumber).padStart(3, "0")}-${typePart}-${timestampPart(capturedAt)}-${safeOriginalName(file.name)}`;
      } else {
        folder = await ensureRevisionPhotoFolder({
          driveId: project.sharepoint_drive_id,
          projectFolderId: project.sharepoint_folder_id,
          towerLabel,
          fliNumber: revision.fli_number,
          photoType: "supporting",
        });
        finalName = `${safeQualitySharePointPart(revision.fli_number)}-${timestampPart(capturedAt)}-${safeOriginalName(file.name)}`;
      }
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const uploaded = await uploadQualityFile({
      driveId: project.sharepoint_drive_id,
      folderId: folder.id,
      fileName: finalName,
      content: bytes,
      contentType: file.type || "application/octet-stream",
    });

    uploadedDriveId = project.sharepoint_drive_id;
    uploadedItemId = uploaded.id;

    const { data: savedFile, error: fileError } = await service
      .from("tower_quality_files")
      .insert({
        project_id: projectId,
        tower_id: towerId,
        defect_id: defectId,
        revision_id: revisionId,
        revision_item_id: revisionItemId,
        file_role: fileRole,
        file_name: uploaded.name || finalName,
        mime_type: file.type || null,
        sharepoint_site_id: project.sharepoint_site_id,
        sharepoint_drive_id: project.sharepoint_drive_id,
        sharepoint_folder_id: folder.id,
        sharepoint_item_id: uploaded.id,
        sharepoint_web_url: uploaded.webUrl ?? null,
        captured_at: capturedAt,
        uploaded_by: user.id,
        uploaded_by_label: uploadedByLabel,
      })
      .select("*")
      .single();

    if (fileError || !savedFile) {
      await deleteDriveItem({
        driveId: project.sharepoint_drive_id,
        itemId: uploaded.id,
      }).catch(() => undefined);
      throw new Error(fileError?.message || "Quality file metadata could not be saved.");
    }

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
          update.status = "Rectified";
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
    });
  } catch (error) {
    if (uploadedDriveId && uploadedItemId) {
      await deleteDriveItem({
        driveId: uploadedDriveId,
        itemId: uploadedItemId,
      }).catch(() => undefined);
    }

    console.error("QUALITY FILE UPLOAD ERROR", error);
    const apiError = qualityApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
