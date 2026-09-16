import { NextRequest, NextResponse } from "next/server";

import { mobileApiError, requireMobilePermission } from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;

async function paged(
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
) {
  const rows: unknown[] = [];
  let from = 0;

  while (true) {
    const result = await build(from, from + PAGE_SIZE - 1);
    if (result.error) throw new Error(result.error.message);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

export async function GET(request: NextRequest) {
  try {
    const { service, identity } = await requireMobilePermission(request, "mobile.materials");
    const projectId = request.nextUrl.searchParams.get("projectId")?.trim() ?? "";

    if (!projectId) {
      return NextResponse.json({ error: "Project ID is required." }, { status: 400 });
    }

    const { data: access, error: accessError } = await service
      .from("project_access")
      .select("project_id")
      .eq("project_id", projectId)
      .eq("user_id", identity.userId)
      .maybeSingle();

    if (accessError) throw new Error(accessError.message);
    if (!access) {
      return NextResponse.json({ error: "You do not have access to this project." }, { status: 403 });
    }

    const { data: towers, error: towerError } = await service
      .from("towers")
      .select("id,project_id,name,line,status,progress,extra_data")
      .eq("project_id", projectId)
      .order("name");

    if (towerError) throw new Error(towerError.message);

    const towerIds = (towers ?? []).map((tower) => tower.id);

    if (towerIds.length === 0) {
      return NextResponse.json({
        projectId,
        generatedAt: new Date().toISOString(),
        towers: [],
        bundles: [],
        members: [],
        bolts: [],
        bundleChecks: [],
        memberChecks: [],
        deliveries: [],
        materialEvents: [],
        transfers: [],
      });
    }

    const [bundles, members, bolts, bundleChecks, memberChecks, deliveries, events, transfers] = await Promise.all([
      paged((from, to) =>
        service
          .from("tower_required_bundles")
          .select("*")
          .in("tower_id", towerIds)
          .order("tower_id")
          .order("section")
          .order("bundle_no")
          .range(from, to),
      ),
      paged((from, to) =>
        service
          .from("tower_material_members")
          .select("*")
          .in("tower_id", towerIds)
          .order("tower_id")
          .order("tower_segment")
          .order("bundle_reference")
          .order("mark_no")
          .range(from, to),
      ),
      paged((from, to) =>
        service
          .from("tower_material_bolts")
          .select("*")
          .in("tower_id", towerIds)
          .order("tower_id")
          .order("tower_segment")
          .order("bolt_diameter")
          .range(from, to),
      ),
      paged((from, to) =>
        service
          .from("tower_material_bundle_checks")
          .select("*")
          .in("tower_id", towerIds)
          .range(from, to),
      ),
      paged((from, to) =>
        service
          .from("tower_material_member_checks")
          .select("*")
          .in("tower_id", towerIds)
          .range(from, to),
      ),
      paged((from, to) =>
        service
          .from("tower_bundle_deliveries")
          .select("*,tower_bundle_delivery_items(*)")
          .in("tower_id", towerIds)
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
      paged((from, to) =>
        service
          .from("tower_material_events")
          .select("*,tower_material_event_items(*),tower_material_event_people(*),tower_material_event_plant(*)")
          .eq("project_id", projectId)
          .order("occurred_at", { ascending: false })
          .range(from, to),
      ),
      paged((from, to) =>
        service
          .from("tower_material_transfers")
          .select("*")
          .eq("project_id", projectId)
          .order("transferred_at", { ascending: false })
          .range(from, to),
      ),
    ]);

    return NextResponse.json({
      projectId,
      generatedAt: new Date().toISOString(),
      towers: towers ?? [],
      bundles,
      members,
      bolts,
      bundleChecks,
      memberChecks,
      deliveries,
      materialEvents: events,
      transfers,
    });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
