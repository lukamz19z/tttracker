import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { MaterialsSecurityError } from "@/lib/materials/access-policy";
import { materialsErrorResponse } from "@/lib/materials/security";
import { requireProjectContext } from "@/lib/projects/project-context";

type Context = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const body = await request.json();

    const project = await requireProjectContext(
      projectId,
      String(body.organisationId ?? "") || null,
      "configuration",
    );

    if (!project.access.settingsConfigure) throw new MaterialsSecurityError("CONFIGURATION_PERMISSION_DENIED");
    const admin = createSupabaseAdmin();

    const { error } = await admin
      .from("v2_project_docket_review_settings")
      .upsert(
        {
          project_id: projectId,
          organisation_id:
            project.dataOrganisationId,
          internal_review_required:
            body.internalReviewRequired !== false,
          client_approval_enabled:
            Boolean(body.clientApprovalEnabled),
          client_approval_required:
            Boolean(body.clientApprovalEnabled) &&
            Boolean(body.clientApprovalRequired),
          client_can_view_raw_mh:
            body.clientCanViewRawMh !== false,
          client_can_view_production_mh:
            body.clientCanViewProductionMh !== false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id" },
      );

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return materialsErrorResponse(error);
  }
}
