import { NextRequest, NextResponse } from "next/server";
import { mobileApiError, requireMobilePermission } from "@/lib/mobile/server";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const { service, identity } = await requireMobilePermission(request, "mobile.materials");
    const projectId = request.nextUrl.searchParams.get("projectId") || "";
    const kind = request.nextUrl.searchParams.get("kind");
    const offset = Number(request.nextUrl.searchParams.get("offset") || 0);
    if (!projectId || !["member", "bolt"].includes(kind || "") || !Number.isSafeInteger(offset) || offset < 0) return NextResponse.json({ error: "Invalid material catalogue request." }, { status: 400 });
    const access = await service.from("project_access").select("project_id").eq("project_id", projectId).eq("user_id", identity.userId).maybeSingle();
    if (access.error) throw new Error(access.error.message);
    if (!access.data) return NextResponse.json({ error: "Project access denied." }, { status: 403 });
    const towers = await service.from("towers").select("id").eq("project_id", projectId);
    if (towers.error) throw new Error(towers.error.message);
    if (!towers.data?.length) return NextResponse.json({ rows: [] });
    const result = await service.from(kind === "member" ? "tower_material_members" : "tower_material_bolts")
      .select(kind === "member" ? "id,tower_id,bundle_reference,drawing_number,mark_no,pn_final,qty_per_tower,section,tower_segment" : "id,tower_id,item_type,tower_segment,drawing_number,bolt_diameter,dn_sn,length,packer_no,packer_mark,qty")
      .in("tower_id", towers.data.map(row => row.id)).order("id").range(offset, offset + 499);
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ rows: result.data || [] });
  } catch (error) { const result = mobileApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
