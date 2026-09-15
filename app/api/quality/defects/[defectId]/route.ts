import { NextResponse } from "next/server";

import { notifyDefectEvent } from "@/lib/quality/defect-notifications";
import {
  assertQualityProjectAccess,
  loadQualityProject,
  loadQualityTower,
  qualityApiError,
  qualityTowerLabel,
  qualityUserLabel,
  requireQualityUser,
} from "@/lib/quality/server";
import { deleteDriveItem } from "@/lib/sharepoint/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ defectId: string }>;
};

type PatchBody = {
  issueTypeId?: string | null;
  memberNumber?: string | null;
  segment?: string | null;
  drawingNumber?: string | null;
  description?: string;
  responsibility?: string | null;
  clientReference?: string | null;
  severity?: "Minor" | "Major" | "Critical";
  status?: "Open" | "In Progress" | "Fixed" | "Closed";
  resolutionNotes?: string | null;
  assignedToUserId?: string | null;
};

type DeleteBody = {
  confirm?: string;
  projectId?: string;
  towerId?: string;
};

type QualityFileDeleteRow = {
  id: string;
  file_name?: string | null;
  sharepoint_drive_id?: string | null;
  sharepoint_item_id?: string | null;
  drive_id?: string | null;
  item_id?: string | null;
};

type LegacyPhotoRow = {
  id: string;
  photo_path: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function qualityFileSharePointIds(file: QualityFileDeleteRow) {
  return {
    driveId: clean(file.sharepoint_drive_id || file.drive_id) || null,
    itemId: clean(file.sharepoint_item_id || file.item_id) || null,
  };
}

async function userLabel(
  service: Awaited<ReturnType<typeof requireQualityUser>>["service"],
  userId: string | null,
) {
  if (!userId) return null;
  const { data } = await service.auth.admin.getUserById(userId);
  const user = data.user;

  return user
    ? clean(
        user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email,
      ) || "TTTracker User"
    : null;
}

async function issueName(
  service: Awaited<ReturnType<typeof requireQualityUser>>["service"],
  projectId: string,
  issueTypeId: string | null,
) {
  if (!issueTypeId) return null;

  const { data } = await service
    .from("project_field_issue_types")
    .select("name")
    .eq("id", issueTypeId)
    .eq("project_id", projectId)
    .maybeSingle();

  return clean(data?.name) || null;
}

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  const { defectId } = await context.params;
  return NextResponse.json({
    ok: true,
    route: `/api/quality/defects/${defectId}`,
  });
}

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  try {
    const { defectId } = await context.params;
    const { service, user, role } = await requireQualityUser(request);
    const body = (await request.json()) as PatchBody;

    const { data: current, error: currentError } = await service
      .from("tower_defects")
      .select("*")
      .eq("id", defectId)
      .single();

    if (currentError || !current) {
      return NextResponse.json(
        { error: "Defect could not be found." },
        { status: 404 },
      );
    }

    await assertQualityProjectAccess({
      service,
      userId: user.id,
      role,
      projectId: current.project_id,
    });

    const nextAssignedUserId =
      body.assignedToUserId === undefined
        ? current.assigned_to_user_id
        : clean(body.assignedToUserId) || null;

    const nextAssignedLabel =
      body.assignedToUserId === undefined
        ? current.assigned_to_label
        : await userLabel(service, nextAssignedUserId);

    const nextStatus =
      body.status === undefined ? current.status : body.status;

    const nextSeverity =
      body.severity === undefined ? current.severity : body.severity;

    const patch = {
      issue_type_id:
        body.issueTypeId === undefined
          ? current.issue_type_id
          : clean(body.issueTypeId) || null,
      member_number:
        body.memberNumber === undefined
          ? current.member_number
          : clean(body.memberNumber) || null,
      segment:
        body.segment === undefined
          ? current.segment
          : clean(body.segment) || null,
      drawing_number:
        body.drawingNumber === undefined
          ? current.drawing_number
          : clean(body.drawingNumber) || null,
      description:
        body.description === undefined
          ? current.description
          : clean(body.description),
      responsibility:
        body.responsibility === undefined
          ? current.responsibility
          : clean(body.responsibility) || null,
      client_reference:
        body.clientReference === undefined
          ? current.client_reference
          : clean(body.clientReference) || null,
      severity: nextSeverity,
      status: nextStatus,
      resolution_notes:
        body.resolutionNotes === undefined
          ? current.resolution_notes
          : clean(body.resolutionNotes) || null,
      assigned_to_user_id: nextAssignedUserId,
      assigned_to_label: nextAssignedLabel,
      completed_by:
        nextStatus === "Closed"
          ? qualityUserLabel(user)
          : nextStatus !== current.status
            ? null
            : current.completed_by,
      completed_at:
        nextStatus === "Closed"
          ? new Date().toISOString()
          : nextStatus !== current.status
            ? null
            : current.completed_at,
      updated_at: new Date().toISOString(),
    };

    if (!clean(patch.description)) {
      return NextResponse.json(
        { error: "Enter a Defect description." },
        { status: 400 },
      );
    }

    const { data: defect, error: updateError } = await service
      .from("tower_defects")
      .update(patch)
      .eq("id", defectId)
      .select("*")
      .single();

    if (updateError || !defect) {
      throw new Error(updateError?.message || "Defect could not be updated.");
    }

    const [project, tower, issueTypeName] = await Promise.all([
      loadQualityProject(service, defect.project_id),
      loadQualityTower(service, defect.tower_id, defect.project_id),
      issueName(service, defect.project_id, defect.issue_type_id),
    ]);

    const actorLabel = qualityUserLabel(user);
    let warning: string | null = null;

    try {
      if (current.status !== defect.status) {
        await notifyDefectEvent({
          service,
          defect,
          kind: defect.status === "Closed" ? "closed" : "status_changed",
          actorUserId: user.id,
          actorLabel,
          issueTypeName,
          projectLabel:
            project.project_number || project.name || project.id,
          towerLabel: qualityTowerLabel(tower),
          detail: `Status changed from ${current.status} to ${defect.status}.`,
        });
      } else if (
        current.assigned_to_user_id !== defect.assigned_to_user_id
      ) {
        await notifyDefectEvent({
          service,
          defect,
          kind: "status_changed",
          actorUserId: user.id,
          actorLabel,
          issueTypeName,
          projectLabel:
            project.project_number || project.name || project.id,
          towerLabel: qualityTowerLabel(tower),
          detail: defect.assigned_to_label
            ? `Assigned to ${defect.assigned_to_label}.`
            : "Defect assignment was cleared.",
        });
      }

      if (
        clean(current.severity).toLowerCase() !== "critical" &&
        clean(defect.severity).toLowerCase() === "critical"
      ) {
        await notifyDefectEvent({
          service,
          defect,
          kind: "critical",
          actorUserId: user.id,
          actorLabel,
          issueTypeName,
          projectLabel:
            project.project_number || project.name || project.id,
          towerLabel: qualityTowerLabel(tower),
          detail: "Defect severity was escalated to Critical.",
        });
      }
    } catch (notificationError) {
      console.error("Defect update notification warning", notificationError);
      warning =
        "The Defect was updated, but one or more notifications could not be sent.";
    }

    return NextResponse.json({ defect, warning });
  } catch (error) {
    const apiError = qualityApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
) {
  try {
    const { defectId } = await context.params;
    const { service, user, role } = await requireQualityUser(request);

    if (!clean(defectId)) {
      return NextResponse.json(
        { error: "Defect ID is required." },
        { status: 400 },
      );
    }

    let body: DeleteBody = {};

    try {
      body = (await request.json()) as DeleteBody;
    } catch {
      return NextResponse.json(
        { error: "A delete confirmation is required." },
        { status: 400 },
      );
    }

    const { data: defect, error: defectError } = await service
      .from("tower_defects")
      .select("*")
      .eq("id", defectId)
      .maybeSingle();

    if (defectError) throw new Error(defectError.message);

    if (!defect) {
      return NextResponse.json(
        { error: "Defect could not be found." },
        { status: 404 },
      );
    }

    await assertQualityProjectAccess({
      service,
      userId: user.id,
      role,
      projectId: defect.project_id,
    });

    const requestedProjectId = clean(body.projectId);
    const requestedTowerId = clean(body.towerId);

    if (
      requestedProjectId &&
      requestedProjectId !== clean(defect.project_id)
    ) {
      return NextResponse.json(
        { error: "Defect does not belong to this project." },
        { status: 409 },
      );
    }

    if (
      requestedTowerId &&
      requestedTowerId !== clean(defect.tower_id)
    ) {
      return NextResponse.json(
        { error: "Defect does not belong to this tower." },
        { status: 409 },
      );
    }

    const confirmationLabel = clean(defect.defect_number) || defect.id;

    if (clean(body.confirm) !== confirmationLabel) {
      return NextResponse.json(
        {
          error: `Type "${confirmationLabel}" to confirm deletion.`,
        },
        { status: 400 },
      );
    }

    const warningParts: string[] = [];

    /*
     * 1. Remove SharePoint evidence linked through tower_quality_files.
     *    Failure to remove a physical SharePoint file does not block the
     *    TTTracker deletion; a warning is returned instead.
     */
    const { data: qualityFiles, error: qualityFileLoadError } = await service
      .from("tower_quality_files")
      .select("*")
      .eq("defect_id", defectId);

    if (qualityFileLoadError) {
      throw new Error(qualityFileLoadError.message);
    }

    for (const file of (qualityFiles ?? []) as QualityFileDeleteRow[]) {
      const { driveId, itemId } = qualityFileSharePointIds(file);
      if (!driveId || !itemId) continue;

      try {
        await deleteDriveItem({
          driveId,
          itemId,
        });
      } catch (error) {
        console.error("Defect SharePoint delete warning", {
          defectId,
          fileId: file.id,
          fileName: file.file_name,
          error,
        });

        warningParts.push(
          `SharePoint file "${clean(file.file_name) || file.id}" could not be removed`,
        );
      }
    }

    /*
     * 2. Remove legacy Supabase Storage photos.
     */
    const { data: legacyPhotos, error: legacyPhotoLoadError } = await service
      .from("defect_photos")
      .select("id,photo_path")
      .eq("defect_id", defectId);

    if (legacyPhotoLoadError) {
      // Some deployments may no longer use the legacy table. Do not block
      // deletion solely because legacy photo metadata could not be read.
      console.error("Legacy defect photo load warning", legacyPhotoLoadError);
      warningParts.push("legacy photo metadata could not be checked");
    } else {
      const storagePaths = ((legacyPhotos ?? []) as LegacyPhotoRow[])
        .map((row) => clean(row.photo_path))
        .filter(
          (path) =>
            Boolean(path) &&
            !/^https?:\/\//i.test(path) &&
            path !== "pending",
        );

      if (storagePaths.length > 0) {
        const { error: storageError } = await service.storage
          .from("defect-photos")
          .remove(storagePaths);

        if (storageError) {
          console.error("Legacy defect storage delete warning", storageError);
          warningParts.push("one or more legacy defect photos could not be removed from storage");
        }
      }
    }

    /*
     * 3. Delete TTTracker child rows explicitly so deletion does not depend
     *    on database ON DELETE CASCADE configuration.
     */
    const { error: actionDeleteError } = await service
      .from("defect_actions")
      .delete()
      .eq("defect_id", defectId);

    if (actionDeleteError) {
      throw new Error(
        `Defect actions could not be removed: ${actionDeleteError.message}`,
      );
    }

    if (!legacyPhotoLoadError) {
      const { error: legacyPhotoDeleteError } = await service
        .from("defect_photos")
        .delete()
        .eq("defect_id", defectId);

      if (legacyPhotoDeleteError) {
        throw new Error(
          `Legacy defect photo records could not be removed: ${legacyPhotoDeleteError.message}`,
        );
      }
    }

    const { error: qualityFileDeleteError } = await service
      .from("tower_quality_files")
      .delete()
      .eq("defect_id", defectId);

    if (qualityFileDeleteError) {
      throw new Error(
        `Defect evidence records could not be removed: ${qualityFileDeleteError.message}`,
      );
    }

    /*
     * 4. Delete the Defect itself.
     */
    const { error: deleteError } = await service
      .from("tower_defects")
      .delete()
      .eq("id", defectId)
      .eq("project_id", defect.project_id)
      .eq("tower_id", defect.tower_id);

    if (deleteError) {
      throw new Error(`Defect could not be deleted: ${deleteError.message}`);
    }

    return NextResponse.json({
      success: true,
      defectId,
      defectNumber: defect.defect_number ?? null,
      warning:
        warningParts.length > 0
          ? `${warningParts.join("; ")}. The Defect was still deleted from TTTracker.`
          : null,
    });
  } catch (error) {
    const apiError = qualityApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
