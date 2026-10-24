
import { NextResponse } from "next/server";

import {
  assertQualityProjectAccess,
  qualityApiError,
  requireQualityUser,
} from "@/lib/quality/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ revisionId: string }>;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  try {
    const { revisionId } = await context.params;
    const body = await request.json();

    const clientMutationId = clean(body.clientMutationId);

    const { service, user, role } =
      await requireQualityUser(request);

    const { data: revision, error: revisionError } =
      await service
        .from("tower_revisions")
        .select("id,project_id,tower_id,status")
        .eq("id", revisionId)
        .maybeSingle();

    if (revisionError) {
      throw new Error(revisionError.message);
    }

    if (!revision) {
      return NextResponse.json(
        { error: "Revision not found." },
        { status: 404 },
      );
    }

    await assertQualityProjectAccess({
      service,
      userId: user.id,
      role,
      projectId: revision.project_id,
    });

    if (clientMutationId) {
      const { data: existing, error: existingError } =
        await service
          .from("tower_revision_items")
          .select("*")
          .eq("project_id", revision.project_id)
          .eq("mobile_client_mutation_id", clientMutationId)
          .maybeSingle();

      if (existingError) {
        throw new Error(existingError.message);
      }

      if (existing) {
        if (existing.revision_id !== revisionId || existing.created_by !== user.id) return NextResponse.json({ error: "This mutation belongs to another finding. Reconcile before retrying.", code: "RECONCILIATION_REQUIRED" }, { status: 409 });
        return NextResponse.json({ item: existing });
      }
    }

    const leg = clean(body.leg) || null;
    if (leg && !["A","B","C","D"].includes(leg)) return NextResponse.json({ error: "Select Leg A, B, C or D." }, { status: 400 });
    const issueTypeId = clean(body.issueTypeId) || null;
    const otherIssueText =
      clean(body.otherIssueText) || null;
    const finding = clean(body.finding) || null;

    if (!issueTypeId && !otherIssueText) {
      return NextResponse.json(
        {
          error:
            "Select a Flagged Issue type or enter an Other issue.",
        },
        { status: 400 },
      );
    }

    const { data: item, error } = await service
      .from("tower_revision_items")
      .insert({
        revision_id: revisionId,
        project_id: revision.project_id,
        tower_id: revision.tower_id,
        leg, assigned_flag: clean(body.assignedFlag) || null,
        issue_type_id: issueTypeId,
        other_issue_text: otherIssueText,
        tower_segment: clean(body.towerSegment) || null,
        member_number: clean(body.memberNumber) || null,
        drawing_number: clean(body.drawingNumber) || null,
        finding,
        rectification_comment:
          clean(body.rectificationComment) || null,
        status: "Open",
        created_by: user.id,
        mobile_client_mutation_id:
          clientMutationId || null,
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505" && clientMutationId) {
        const existing = await service.from("tower_revision_items").select("*").eq("project_id", revision.project_id).eq("mobile_client_mutation_id", clientMutationId).maybeSingle();
        if (existing.error) throw new Error(existing.error.message);
        if (existing.data && existing.data.revision_id === revisionId && existing.data.created_by === user.id) return NextResponse.json({ item: existing.data });
      }
      if (error.code === "23505") {
        console.warn("Finding identifier conflict", { code: error.code, constraint: error.message.match(/constraint "([^"]+)"/)?.[1] });
        return NextResponse.json({ error: "The finding number conflicts with an existing record. Reconcile before retrying.", code: "RECONCILIATION_REQUIRED" }, { status: 409 });
      }
      throw new Error(error.message);
    }
    if (!item?.id || !item.fli_number) throw new Error("Finding creation did not return its server ID and FLI number.");

    if (revision.status === "Draft") {
      await service
        .from("tower_revisions")
        .update({
          status: "In Progress",
          updated_at: new Date().toISOString(),
        })
        .eq("id", revisionId)
        .eq("status", "Draft");
    }

    await service.from("tower_revisions").update({ finalised_at: null }).eq("id", revisionId);
    return NextResponse.json({ item });
  } catch (error) {
    const apiError = qualityApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
