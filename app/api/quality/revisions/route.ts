import { qualityWorkflowAccess } from "@/lib/quality/workflow-access";
import { atomicQualityError } from "@/lib/quality/atomic-error";
import { NextResponse } from "next/server";

import { notifyRevisionEvent } from "@/lib/quality/revision-notifications";
import {
  assertQualityProjectAccess,
  qualityApiError,
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

    const { service, user, role, label } = await qualityWorkflowAccess(request, projectId);
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

    const actorLabel = label;

    // Every attempt is a fresh INSERT using the shared drift-safe DB trigger.
    // Idempotency wins before/after each attempt; proposed client numbers are ignored.
    const insert = {
        source_type: "manual",
        additional_rect_confirmed: body.additionalRectConfirmed === true,
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
      };
    let revision: Awaited<ReturnType<typeof findExisting>> = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const result = await service.from("tower_revisions").insert(insert).select("*").single();
      if (!result.error) { revision = result.data; break; }
      if (result.error.code !== "23505") { const error=atomicQualityError(result.error); return NextResponse.json({error:error.message,code:"RECONCILIATION_REQUIRED"},{status:error.status}); }
      const existing = await findExisting();
      if (existing) return existingResponse(existing);
      const constraint = result.error.message.match(/constraint "([^"]+)"/)?.[1];
      if (process.env.NODE_ENV !== "production") {
        const details = result.error.details || "";
        const key = details.match(/Key \(([^)]+)\)=\(([^)]+)\)/);
        const columns = key?.[1].split(",").map(value => value.trim()) || [];
        const values = key?.[2].split(",").map(value => value.trim()) || [];
        const index = columns.findIndex(column => ["fli_number","revision_number"].includes(column));
        let owners = null;
        if (index >= 0) {
          let query = service.from("tower_revisions").select("id,project_id,tower_id,sequence_no,revision_number").eq(columns[index],values[index]);
          if (columns[index] === "revision_number") query = query.eq("project_id",projectId).eq("tower_id",towerId);
          owners = (await query).data;
        }
        console.warn("RECT allocation retry", { attempt: attempt + 1, constraint, conflictingNumber: values[index], owners });
      }
      if (!constraint || !/tower_revisions_(fli_number|tower_sequence|project_tower_revision_number)/.test(constraint)) {
        return NextResponse.json({ error: "This Revision mutation conflicts with another record.", code: "RECONCILIATION_REQUIRED" }, { status: 409 });
      }
      if (attempt === 3) return NextResponse.json({ error: "Revision numbering is temporarily unavailable. Please retry.", code: "RECT_ALLOCATION_BUSY" }, { status: 503 });
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
