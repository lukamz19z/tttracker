import { NextRequest, NextResponse } from "next/server";
import { requireAccessAdmin } from "@/lib/access/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { service } = await requireAccessAdmin(request);

    const [rolesResult, matrixResult, groupsResult] = await Promise.all([
      service
        .from("roles")
        .select(
          "id,code,name,description,is_active,is_system,grants_all,sort_order",
        )
        .eq("is_active", true)
        .order("sort_order")
        .order("name"),
      service
        .from("role_access_matrix")
        .select("*")
        .order("group_sort_order")
        .order("access_sort_order"),
      service
        .from("access_groups")
        .select("id,code,name,description,sort_order,is_active")
        .eq("is_active", true)
        .order("sort_order"),
    ]);

    if (rolesResult.error) throw new Error(rolesResult.error.message);
    if (matrixResult.error) throw new Error(matrixResult.error.message);
    if (groupsResult.error) throw new Error(groupsResult.error.message);

    return NextResponse.json({
      roles: rolesResult.data ?? [],
      matrix: matrixResult.data ?? [],
      groups: groupsResult.data ?? [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load access control.";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
