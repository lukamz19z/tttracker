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

function clean(value: unknown) {
  return String(value ?? "").trim();
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
