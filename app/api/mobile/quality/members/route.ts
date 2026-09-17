
import { NextResponse } from "next/server";

import {
  assertQualityProjectAccess,
  qualityApiError,
  requireQualityUser,
} from "@/lib/quality/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = clean(url.searchParams.get("projectId"));
    const towerId = clean(url.searchParams.get("towerId"));

    if (!projectId || !towerId) {
      return NextResponse.json(
        { error: "Project and tower are required." },
        { status: 400 },
      );
    }

    const { service, user, role } = await requireQualityUser(request);

    await assertQualityProjectAccess({
      service,
      userId: user.id,
      role,
      projectId,
    });

    const { data: tower, error: towerError } = await service
      .from("towers")
      .select("id,project_id")
      .eq("id", towerId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (towerError) throw new Error(towerError.message);
    if (!tower) {
      return NextResponse.json(
        { error: "Tower not found in this project." },
        { status: 404 },
      );
    }

    const { data, error } = await service
      .from("tower_material_members")
      .select(
        "id,tower_id,bundle_reference,drawing_number,mark_no,pn_final,qty_per_tower,section,tower_segment",
      )
      .eq("tower_id", towerId)
      .order("tower_segment", { ascending: true })
      .order("mark_no", { ascending: true })
      .limit(5000);

    if (error) throw new Error(error.message);

    return NextResponse.json({
      members: (data ?? []).map((row) => ({
        id: row.id,
        towerId: row.tower_id,
        bundleReference: row.bundle_reference,
        drawingNumber: row.drawing_number,
        memberNumber: row.mark_no || row.pn_final || "",
        alternateMemberNumber: row.pn_final,
        qtyPerTower: row.qty_per_tower,
        section: row.section,
        towerSegment: row.tower_segment,
      })),
    });
  } catch (error) {
    const apiError = qualityApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
