import { NextResponse } from "next/server";

import { notifyRevisionEvent } from "@/lib/quality/revision-notifications";
import {
  assertQualityProjectAccess,
  qualityApiError,
  requireQualityUser,
} from "@/lib/quality/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function localDate(value: unknown) {
  const raw = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? raw
    : new Intl.DateTimeFormat("en-CA", {
        timeZone: "Australia/Sydney",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const projectId = clean(body.projectId);
    const towerId = clean(body.towerId);

    if (!projectId || !towerId) {
      return NextResponse.json(
        { error: "Project and tower are required." },
        { status: 400 },
      );
    }

    const { service, user, role } = await requireQualityUser(request);
    await assertQualityProjectAccess({
      service,
      userId: user.id,
      role,
      projectId,
    });

    const { data: tower, error: towerError } = await service
      .from("towers")
      .select("id,project_id")
      .eq("id", towerId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (towerError) throw new Error(towerError.message);
    if (!tower) {
      return NextResponse.json({ error: "Tower not found in this project." }, { status: 404 });
    }

    const clientMutationId = clean(body.clientMutationId);
    const findExisting = async () => {
      if (!clientMutationId) return null;
      const result = await service.from("tower_revisions").select("*")
        .eq("project_id", projectId).eq("mobile_client_mutation_id", clientMutationId).maybeSingle();
      if (result.error) throw new Error(result.error.message);
      return result.data;
    };
    const existingResponse = (existing: { created_by: string | null; tower_id: string }) =>
      existing.created_by === user.id && existing.tower_id === towerId
        ? NextResponse.json({ revision: existing })
        : NextResponse.json({ error: "This mutation is already associated with another Revision. Reconcile before retrying.", code: "RECONCILIATION_REQUIRED" }, { status: 409 });
    const existing = await findExisting();
    if (existing) return existingResponse(existing);

    const { data: authUser } = await service.auth.admin.getUserById(user.id);
    const actorLabel =
      clean(authUser.user?.user_metadata?.full_name) ||
      clean(authUser.user?.user_metadata?.name) ||
      clean(authUser.user?.email) ||
      "TTTracker user";

    const { data: revision, error } = await service
      .from("tower_revisions")
      .insert({
        fli_number: null, // RECT is allocated in revision_number by the shared DB trigger.
        project_id: projectId,
        tower_id: towerId,
        inspection_stage: clean(body.inspectionStage) || "Post Erection",
        inspection_date: localDate(body.inspectionDate),
        client_inspector: clean(body.clientInspector) || null,
        client_company: clean(body.clientCompany) || null,
        client_reference: clean(body.clientReference) || null,
        notes: clean(body.notes) || null,
        status: "Draft",
        created_by: user.id,
        created_by_label: actorLabel,
        mobile_client_mutation_id: clientMutationId || null,
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        const existing = await findExisting();
        if (existing) return existingResponse(existing);
        console.warn("Revision identifier conflict", { code: error.code, constraint: error.message.match(/constraint "([^"]+)"/)?.[1] });
        return NextResponse.json({ error: "The Revision number conflicts with an existing record. Reconcile Quality numbering before retrying.", code: "RECONCILIATION_REQUIRED" }, { status: 409 });
      }
      throw new Error(error.message);
    }
    if (!revision?.id || !revision.revision_number) throw new Error("Revision creation did not return its server ID and RECT number.");

    const notification = await notifyRevisionEvent({
      service,
      revision,
      event: "created",
      actorLabel,
    }).catch((notificationError) => ({
      recipients: 0, inApp: 0, email: 0, push: 0,
      warning: notificationError instanceof Error ? notificationError.message : "Notification warning.",
    }));

    return NextResponse.json({ revision, notification });
  } catch (error) {
    const apiError = qualityApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
