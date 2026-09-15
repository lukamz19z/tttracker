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

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  try {
    const { defectId } = await context.params;
    const { service, user, role } = await requireQualityUser(request);
    const body = (await request.json()) as { action?: string };
    const action = clean(body.action);

    if (!action) {
      return NextResponse.json(
        { error: "Enter an action or follow-up note." },
        { status: 400 },
      );
    }

    const { data: defect, error: defectError } = await service
      .from("tower_defects")
      .select("*")
      .eq("id", defectId)
      .single();

    if (defectError || !defect) {
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

    const actorLabel = qualityUserLabel(user);

    const { data: inserted, error: actionError } = await service
      .from("defect_actions")
      .insert({
        defect_id: defect.id,
        action_note: action,
        created_by: actorLabel,
      })
      .select("*")
      .single();

    if (actionError || !inserted) {
      throw new Error(
        actionError?.message || "Defect action could not be saved.",
      );
    }

    let warning: string | null = null;

    try {
      const [project, tower, issueType] = await Promise.all([
        loadQualityProject(service, defect.project_id),
        loadQualityTower(service, defect.tower_id, defect.project_id),
        defect.issue_type_id
          ? service
              .from("project_field_issue_types")
              .select("name")
              .eq("id", defect.issue_type_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      await notifyDefectEvent({
        service,
        defect,
        kind: "action_added",
        actorUserId: user.id,
        actorLabel,
        issueTypeName: clean(issueType.data?.name) || null,
        projectLabel:
          project.project_number || project.name || project.id,
        towerLabel: qualityTowerLabel(tower),
        detail: action,
      });
    } catch (notificationError) {
      console.error("Defect action notification warning", notificationError);
      warning =
        "The action was saved, but one or more notifications could not be sent.";
    }

    return NextResponse.json({
      action: inserted,
      warning,
    });
  } catch (error) {
    const apiError = qualityApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
