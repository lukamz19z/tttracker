import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveOrganisationEntitlement } from "@/lib/integrations/entitlements";
import { availableDocumentContexts } from "@/lib/integrations/sharepoint-ux";
import type { DocumentContext } from "@/lib/integrations/resolver";

export async function GET(request: NextRequest) {
  try {
    const workspace = await requireWorkspaceContext(request.nextUrl.searchParams.get("organisation"));
    const org = workspace.organisation.organisationId, context = request.nextUrl.searchParams.get("context") as DocumentContext;
    if (!availableDocumentContexts(workspace.enabledModules, []).includes(context)) return NextResponse.json({ error: "Document area unavailable." }, { status: 403 });
    const entitlement = await resolveOrganisationEntitlement(org, "sharepoint");
    const canManage = !!workspace.permissions?.["integrations.sharepoint.manage"] && entitlement.enabled && !workspace.projectOnly;
    const rules = await createSupabaseAdmin().from("v2_document_destinations").select("id").eq("organisation_id", org).eq("context", context).eq("is_active", true).limit(1);
    if (rules.error) throw new Error("DOCUMENT_SETUP_UNAVAILABLE");
    return NextResponse.json({ configured: entitlement.enabled && !!rules.data?.length, canManage }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Document storage status could not be checked." }, { status: 403 }); }
}
