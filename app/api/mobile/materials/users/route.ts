import { NextRequest, NextResponse } from "next/server";
import { mobileApiError, requireMobilePermission } from "@/lib/mobile/server";

const clean = (value: unknown) => String(value ?? "").trim();

export async function GET(request: NextRequest) {
  try {
    const { service, identity } = await requireMobilePermission(request, "mobile.materials");
    const projectId = clean(request.nextUrl.searchParams.get("projectId"));
    if (!projectId) return NextResponse.json({ error: "Project ID is required." }, { status: 400 });
    const { data: access, error: accessError } = await service.from("project_access").select("user_id").eq("project_id", projectId).eq("user_id", identity.userId).maybeSingle();
    if (accessError) throw new Error(accessError.message);
    if (!access) return NextResponse.json({ error: "Project access denied." }, { status: 403 });
    const { data: rows, error } = await service.from("project_access").select("user_id").eq("project_id", projectId).limit(200);
    if (error) throw new Error(error.message);
    const users = await Promise.all((rows || []).map(async (row) => {
      const { data } = await service.auth.admin.getUserById(row.user_id);
      const user = data.user;
      const name = clean(user?.user_metadata?.full_name || user?.user_metadata?.name || user?.user_metadata?.display_name) || "Project User";
      const role = clean(user?.user_metadata?.role || user?.app_metadata?.role);
      return { id: row.user_id, name, role };
    }));
    return NextResponse.json({ users: users.sort((a, b) => a.name.localeCompare(b.name)) });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
