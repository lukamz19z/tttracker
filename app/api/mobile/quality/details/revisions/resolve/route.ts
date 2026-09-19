import { NextRequest, NextResponse } from "next/server";

import { assertMobileProjectAccess } from "@/lib/mobile/quality";
import {
  mobileApiError,
  requireMobilePermission,
} from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { service, identity } =
      await requireMobilePermission(
        request,
        "mobile.rectifications",
      );

    const projectId =
      request.nextUrl.searchParams.get("projectId")?.trim() ||
      "";
    const clientMutationId =
      request.nextUrl.searchParams
        .get("clientMutationId")
        ?.trim() || "";

    if (!projectId || !clientMutationId) {
      return NextResponse.json(
        {
          error:
            "Project ID and client mutation ID are required.",
        },
        { status: 400 },
      );
    }

    await assertMobileProjectAccess(
      service,
      identity.userId,
      projectId,
    );

    const { data, error } = await service
      .from("tower_revisions")
      .select(
        "id,project_id,tower_id,mobile_client_mutation_id",
      )
      .eq("project_id", projectId)
      .eq("mobile_client_mutation_id", clientMutationId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      revision: data ?? null,
    });
  } catch (error) {
    const apiError = mobileApiError(error);
    const denied =
      error instanceof Error &&
      error.message === "MOBILE_PROJECT_DENIED";

    return NextResponse.json(
      {
        error: denied
          ? "You do not have access to this project."
          : apiError.message,
      },
      { status: denied ? 403 : apiError.status },
    );
  }
}
