import { NextRequest, NextResponse } from "next/server";
import { mobileApiError, requireMobilePermission } from "@/lib/mobile/server";
import { configuredMaterialUsers } from "@/lib/materials/configured-users";
import { hasV1FullAccess } from "@/lib/access/server";

const clean = (value: unknown) => String(value ?? "").trim();

export async function GET(request: NextRequest) {
  try {
    const { service, identity } = await requireMobilePermission(request, "mobile.materials");
    const projectId = clean(request.nextUrl.searchParams.get("projectId"));
    if (!projectId) return NextResponse.json({ error: "Project ID is required." }, { status: 400 });
    const { data: access, error: accessError } = await service.from("project_access").select("user_id").eq("project_id", projectId).eq("user_id", identity.userId).maybeSingle();
    if (accessError) throw new Error(accessError.message);
    if (!access && !await hasV1FullAccess(service, identity.userId)) return NextResponse.json({ error: "Project access denied." }, { status: 403 });
    const materialUsers = await configuredMaterialUsers(service, projectId);
    return NextResponse.json({ materialUsers });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
