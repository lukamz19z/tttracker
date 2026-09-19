import { NextResponse } from "next/server";

import {
  cleanMaterialValue,
  mobileMaterialApiError,
  requireMobileMaterialUser,
} from "@/lib/materials/mobile-material-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;

type RouteContext = {
  params: Promise<{ bundleId: string }>;
};

async function loadByBundleId(
  service: Awaited<ReturnType<typeof requireMobileMaterialUser>>["service"],
  bundleId: string,
) {
  const rows: Array<Record<string, unknown>> = [];
  let from = 0;

  while (true) {
    const { data, error } = await service
      .from("tower_material_members")
      .select(
        "id,tower_id,bundle_id,bundle_reference,drawing_number,mark_no,pn_final,qty_per_tower,section,tower_segment",
      )
      .eq("bundle_id", bundleId)
      .order("mark_no", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const page = (data ?? []) as Array<Record<string, unknown>>;
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function loadLegacyMembers(
  service: Awaited<ReturnType<typeof requireMobileMaterialUser>>["service"],
  bundle: Record<string, unknown>,
) {
  const towerId = cleanMaterialValue(bundle.tower_id);
  const bundleNo = cleanMaterialValue(bundle.bundle_no);
  const section = cleanMaterialValue(bundle.section);

  if (!towerId || !bundleNo) return [];

  let query = service
    .from("tower_material_members")
    .select(
      "id,tower_id,bundle_id,bundle_reference,drawing_number,mark_no,pn_final,qty_per_tower,section,tower_segment",
    )
    .eq("tower_id", towerId)
    .eq("bundle_reference", bundleNo);

  // Duplicate bundle references are valid in TTTracker. When older member rows
  // have not yet been backfilled with bundle_id, use the bundle segment to
  // avoid mixing members from another bundle that shares the same reference.
  if (section) {
    query = query.eq("tower_segment", section);
  }

  const { data, error } = await query.order("mark_no", { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { bundleId: rawBundleId } = await params;
    const bundleId = cleanMaterialValue(rawBundleId);
    const url = new URL(request.url);
    const projectId = cleanMaterialValue(url.searchParams.get("projectId"));

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required." },
        { status: 400 },
      );
    }

    if (!bundleId) {
      return NextResponse.json(
        { error: "Bundle ID is required." },
        { status: 400 },
      );
    }

    const { service } = await requireMobileMaterialUser(request, projectId);

    const { data: bundleData, error: bundleError } = await service
      .from("tower_required_bundles")
      .select("id,tower_id,bundle_no,section,qty_required,total_weight,member_qty")
      .eq("id", bundleId)
      .maybeSingle();

    if (bundleError) throw new Error(bundleError.message);
    if (!bundleData) {
      return NextResponse.json(
        { error: "Bundle could not be found." },
        { status: 404 },
      );
    }

    const bundle = bundleData as Record<string, unknown>;
    const towerId = cleanMaterialValue(bundle.tower_id);

    const { data: tower, error: towerError } = await service
      .from("towers")
      .select("id,project_id")
      .eq("id", towerId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (towerError) throw new Error(towerError.message);
    if (!tower) {
      return NextResponse.json(
        { error: "This bundle does not belong to the selected project." },
        { status: 404 },
      );
    }

    let members = await loadByBundleId(service, bundleId);

    // Compatibility fallback for legacy rows created before bundle UUIDs were
    // backfilled. New/current rows should resolve through bundle_id above.
    if (members.length === 0) {
      members = await loadLegacyMembers(service, bundle);
    }

    return NextResponse.json({
      projectId,
      bundle,
      members,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const apiError = mobileMaterialApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
