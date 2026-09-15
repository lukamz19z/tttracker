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

type CreateBody = {
  projectId?: string;
  towerId?: string;
  issueTypeId?: string | null;
  memberNumber?: string | null;
  segment?: string | null;
  drawingNumber?: string | null;
  description?: string;
  responsibility?: string | null;
  clientReference?: string | null;
  severity?: "Minor" | "Major" | "Critical";
  assignedToUserId?: string | null;
  source?: string | null;
  sourceDocketId?: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

async function userLabel(
  service: Awaited<ReturnType<typeof requireQualityUser>>["service"],
  userId: string | null | undefined,
) {
  const id = clean(userId);
  if (!id) return null;

  const { data } = await service.auth.admin.getUserById(id);
  const user = data.user;

  if (!user) return null;

  return (
    clean(
      user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email,
    ) || "TTTracker User"
  );
}

async function issueTypeName(
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

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/quality/defects",
  });
}

export async function POST(request: Request) {
  try {
    const { service, user, role } = await requireQualityUser(request);
    const body = (await request.json()) as CreateBody;

    const projectId = clean(body.projectId);
    const towerId = clean(body.towerId);
    const description = clean(body.description);
    const issueTypeId = clean(body.issueTypeId) || null;
    const assignedToUserId = clean(body.assignedToUserId) || null;
    const sourceDocketId = clean(body.sourceDocketId) || null;

    if (!projectId || !towerId) {
      return NextResponse.json(
        { error: "Project and Tower are required." },
        { status: 400 },
      );
    }

    if (!description) {
      return NextResponse.json(
        { error: "Enter a Defect description." },
        { status: 400 },
      );
    }

    await assertQualityProjectAccess({
      service,
      userId: user.id,
      role,
      projectId,
    });

    const [project, tower, assignedToLabel, issueName] =
      await Promise.all([
        loadQualityProject(service, projectId),
        loadQualityTower(service, towerId, projectId),
        userLabel(service, assignedToUserId),
        issueTypeName(service, projectId, issueTypeId),
      ]);

    if (sourceDocketId) {
      const { data: docket, error: docketError } = await service
        .from("tower_daily_dockets")
        .select("id,project_id,tower_id")
        .eq("id", sourceDocketId)
        .eq("project_id", projectId)
        .eq("tower_id", towerId)
        .single();

      if (docketError || !docket) {
        return NextResponse.json(
          {
            error:
              "The Daily Docket selected as the Defect source could not be found.",
          },
          { status: 409 },
        );
      }
    }

    const actorLabel = qualityUserLabel(user);
    const severity =
      body.severity === "Critical"
        ? "Critical"
        : body.severity === "Major"
          ? "Major"
          : "Minor";

    const { data: defect, error: insertError } = await service
      .from("tower_defects")
      .insert({
        project_id: projectId,
        tower_id: towerId,
        issue_type_id: issueTypeId,
        member_number: clean(body.memberNumber) || null,
        segment: clean(body.segment) || null,
        drawing_number: clean(body.drawingNumber) || null,
        description,
        responsibility: clean(body.responsibility) || null,
        client_reference: clean(body.clientReference) || null,
        severity,
        status: "Open",
        source: clean(body.source) || "manual",
        identified_at: new Date().toISOString(),
        identified_by: user.id,
        identified_by_label: actorLabel,
        uploaded_by: actorLabel,
        photo_url: null,
        assigned_to_user_id: assignedToUserId,
        assigned_to_label: assignedToLabel,
      })
      .select("*")
      .single();

    if (insertError || !defect) {
      throw new Error(insertError?.message || "Defect could not be created.");
    }

    if (sourceDocketId) {
      const { error: linkError } = await service
        .from("tower_docket_defects")
        .upsert(
          {
            docket_id: sourceDocketId,
            project_id: projectId,
            tower_id: towerId,
            defect_id: defect.id,
            link_type: "raised",
            created_by: user.id,
          },
          { onConflict: "docket_id,defect_id" },
        );

      if (linkError) {
        console.error(
          "Defect was created but Daily Docket link failed",
          linkError,
        );
      }
    }

    let warning: string | null = null;

    try {
      await notifyDefectEvent({
        service,
        defect,
        kind: severity === "Critical" ? "critical" : "created",
        actorUserId: user.id,
        actorLabel,
        issueTypeName: issueName,
        projectLabel:
          project.project_number || project.name || project.id,
        towerLabel: qualityTowerLabel(tower),
        detail:
          severity === "Critical"
            ? "A Critical Defect has been raised."
            : null,
        docketId: sourceDocketId,
      });
    } catch (notificationError) {
      console.error("Defect notification warning", notificationError);
      warning =
        "The Defect was created, but one or more notifications could not be sent.";
    }

    return NextResponse.json({
      defect,
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
