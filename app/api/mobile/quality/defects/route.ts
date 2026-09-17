import { NextResponse } from "next/server";

import { POST as createCanonicalDefect } from "@/app/api/quality/defects/route";
import {
  qualityApiError,
  requireQualityUser,
} from "@/lib/quality/server";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

type MobileCreateBody = {
  clientMutationId?: string | null;
  projectId?: string | null;
  towerId?: string | null;
  issueTypeId?: string | null;
  memberNumber?: string | null;
  segment?: string | null;
  drawingNumber?: string | null;
  description?: string | null;
  responsibility?: string | null;
  clientReference?: string | null;
  severity?: "Minor" | "Major" | "Critical";
  assignedToUserId?: string | null;
};

export async function POST(request: Request) {
  try {
    const body =
      (await request.json()) as MobileCreateBody;

    const clientMutationId = clean(
      body.clientMutationId,
    );

    const { service } =
      await requireQualityUser(request);

    /*
     * Offline sync can retry the same mutation after a
     * timeout. Resolve an already-created Defect first so
     * a reconnect never creates a duplicate DEF number.
     */
    if (clientMutationId) {
      const { data: existing, error } =
        await service
          .from("tower_defects")
          .select("*")
          .eq(
            "mobile_client_mutation_id",
            clientMutationId,
          )
          .maybeSingle();

      if (error) throw new Error(error.message);

      if (existing) {
        return NextResponse.json({
          defect: existing,
          idempotent: true,
        });
      }
    }

    /*
     * IMPORTANT:
     * Mobile uses the canonical website POST handler.
     * That keeps numbering, access checks, assignee labels
     * and Defect notifications in one server-side path.
     */
    const headers = new Headers();
    const authorization =
      request.headers.get("authorization");

    if (authorization) {
      headers.set("Authorization", authorization);
    }
    headers.set("Content-Type", "application/json");

    const canonicalRequest = new Request(
      new URL("/api/quality/defects", request.url),
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          projectId: clean(body.projectId),
          towerId: clean(body.towerId),
          issueTypeId:
            clean(body.issueTypeId) || null,
          memberNumber:
            clean(body.memberNumber) || null,
          segment: clean(body.segment) || null,
          drawingNumber:
            clean(body.drawingNumber) || null,
          description: clean(body.description),
          responsibility:
            clean(body.responsibility) || null,
          clientReference:
            clean(body.clientReference) || null,
          severity: body.severity || "Minor",
          assignedToUserId:
            clean(body.assignedToUserId) || null,
          source: "mobile",
        }),
      },
    );

    const canonicalResponse =
      await createCanonicalDefect(
        canonicalRequest,
      );

    const payload = (await canonicalResponse.json()) as {
      defect?: Record<string, unknown>;
      warning?: string | null;
      error?: string;
    };

    if (
      !canonicalResponse.ok ||
      !payload.defect
    ) {
      return NextResponse.json(payload, {
        status: canonicalResponse.status,
      });
    }

    if (clientMutationId) {
      const defectId = clean(payload.defect.id);

      const { data: updated, error } =
        await service
          .from("tower_defects")
          .update({
            mobile_client_mutation_id:
              clientMutationId,
          })
          .eq("id", defectId)
          .select("*")
          .single();

      if (error) throw new Error(error.message);

      payload.defect = updated;
    }

    return NextResponse.json(payload);
  } catch (error) {
    const apiError = qualityApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
