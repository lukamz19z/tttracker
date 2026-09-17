
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
          .eq("revision_id", revisionId)
          .eq("mobile_client_mutation_id", clientMutationId)
          .maybeSingle();

      if (existingError) {
        throw new Error(existingError.message);
      }

      if (existing) {
        return NextResponse.json({ item: existing });
      }
    }

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
        issue_type_id: issueTypeId,
        other_issue_text: otherIssueText,
        tower_segment: clean(body.towerSegment) || null,
        member_number: clean(body.memberNumber) || null,
        drawing_number: clean(body.drawingNumber) || null,
        finding,
        rectification_comment:
          clean(body.rectificationComment) || null,
        status:
          clean(body.status) === "Rectified"
            ? "Rectified"
            : "Open",
        created_by: user.id,
        mobile_client_mutation_id:
          clientMutationId || null,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

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

    return NextResponse.json({ item });
  } catch (error) {
    const apiError = qualityApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
