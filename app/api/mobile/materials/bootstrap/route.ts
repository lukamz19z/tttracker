import { NextRequest, NextResponse } from "next/server";

import { mobileApiError, requireMobilePermission } from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;
// Keep the general Materials bootstrap small. The Bundles screen obtains its
// own tower/filter-scoped pages as the user scrolls.
const BUNDLE_BOOTSTRAP_LIMIT = 20;

async function paged(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: unknown[] | null;
    error: { message: string } | null;
  }>,
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
  const started = performance.now();
  try {
    const { service, identity } = await requireMobilePermission(
      request,
      "mobile.materials",
    );

    const projectId =
      request.nextUrl.searchParams.get("projectId")?.trim() ?? "";
    const bundlePage = request.nextUrl.searchParams.get("bundlePage") === "1";

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required." },
        { status: 400 },
      );
    }

    const { data: access, error: accessError } = await service
      .from("project_access")
      .select("project_id")
      .eq("project_id", projectId)
      .eq("user_id", identity.userId)
      .maybeSingle();

    if (accessError) throw new Error(accessError.message);

    if (!access) {
      return NextResponse.json(
        { error: "You do not have access to this project." },
        { status: 403 },
      );
    }

    const { data: towers, error: towerError } = await service
      .from("towers")
      .select("id,project_id,name,line,status,progress,extra_data")
      .eq("project_id", projectId)
      .order("name");

    if (towerError) throw new Error(towerError.message);

    const towerIds = (towers ?? []).map((tower) => tower.id);

    if (bundlePage) {
      const requestedTowerId = request.nextUrl.searchParams.get("towerId")?.trim() ?? "";
      const section = request.nextUrl.searchParams.get("section")?.trim() ?? "";
      const search = (request.nextUrl.searchParams.get("q") ?? "").replace(/[,%()\"']/g, " ").replace(/\s+/g, " ").trim();
      const offset = Math.max(0, Number.parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10) || 0);
      const requestedSize = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "20", 10) || 20;
      const pageSize = Math.max(1, Math.min(requestedSize, 50));
      if (requestedTowerId && !towerIds.includes(requestedTowerId)) {
        return NextResponse.json({ error: "The selected tower is not available in this project." }, { status: 400 });
      }
      if (!towerIds.length) return NextResponse.json({ bundles: [], offset, nextOffset: null, hasMore: false, pageSize });
      let bundleQuery = service
        .from("tower_required_bundles")
        .select("id,tower_id,bundle_no,section,qty_required,total_weight,member_qty")
        .in("tower_id", requestedTowerId ? [requestedTowerId] : towerIds);
      if (section) bundleQuery = bundleQuery.eq("section", section);
      if (search.length > 0) bundleQuery = bundleQuery.or(`bundle_no.ilike.%${search}%,section.ilike.%${search}%`);
      const { data: page, error: pageError } = await bundleQuery
        .order("bundle_no", { ascending: true })
        .order("tower_id", { ascending: true })
        .order("section", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (pageError) throw new Error(`Materials bundle page could not be loaded: ${pageError.message}`);
      const bundles = page ?? [];
      const hasMore = bundles.length === pageSize;
      return NextResponse.json({ bundles, offset, nextOffset: hasMore ? offset + bundles.length : null, hasMore, pageSize }, { headers: { "Cache-Control": "private, no-store" } });
    }

    if (towerIds.length === 0) {
      return NextResponse.json({
        cacheVersion: 2,
        snapshotMode: "summary",
        projectId,
        generatedAt: new Date().toISOString(),
        catalogCounts: {
          members: 0,
          bolts: 0,
        },
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

    /*
     * IMPORTANT PERFORMANCE CHANGE
     * ----------------------------
     * Do not preload tower_material_members or tower_material_bolts here.
     * HumeLink projects can contain many thousands of rows and the previous
     * bootstrap paged every one of them before Materials could render.
     *
     * Members and bolts are now loaded only through:
     *   GET /api/mobile/materials/search
     *
     * The bootstrap keeps the smaller operational datasets needed immediately
     * for bundle status, deliveries, transfers, missing/excess and offline
     * check-off state.
     */
    const [
      bundleBootstrap,
      bundleChecks,
      memberChecks,
      deliveries,
      events,
      transfers,
    ] = await Promise.all([
      service
        .from("tower_required_bundles")
        .select("id,tower_id,bundle_no,section,qty_required,total_weight,member_qty")
        .in("tower_id", towerIds)
        .order("tower_id")
        .order("section")
        .order("bundle_no")
        .order("id")
        .limit(BUNDLE_BOOTSTRAP_LIMIT),
      paged((from, to) =>
        service
          .from("tower_material_bundle_checks")
          .select(
            "id,tower_id,bundle_id,bundle_no,status,notes,checked_by,checked_at,qty_received",
          )
          .in("tower_id", towerIds)
          .range(from, to),
      ),
      paged((from, to) =>
        service
          .from("tower_material_member_checks")
          .select(
            "id,tower_id,bundle_id,bundle_no,mark_no,status,notes,checked_by,checked_at",
          )
          .in("tower_id", towerIds)
          .range(from, to),
      ),
      paged((from, to) =>
        service
          .from("tower_bundle_deliveries")
          .select("id,tower_id,created_at,tower_bundle_delivery_items(*)")
          .in("tower_id", towerIds)
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
      paged((from, to) =>
        service
          .from("tower_material_events")
          .select(
            "id,project_id,docket_id,tower_id,event_type,source_tower_id,destination_tower_id,occurred_at,affected_work,work_outcome,affected_activity,affected_section,current_effect,notes,urgency,required_by,issue_status,created_by_user_id,client_mutation_id,tower_material_event_items(id,event_id,bundle_id,bundle_no,bundle_section,source_table,source_record_id,material_type,bolt_size,item_reference,item_description,quantity,unit,notes,issue_key,source_issue_key,material_category,specification,segment,member_number,drawing_number)",
          )
          .eq("project_id", projectId)
          .order("occurred_at", { ascending: false })
          .range(from, to),
      ),
      paged((from, to) =>
        service
          .from("tower_material_transfers")
          .select("id,project_id,source_tower_id,destination_tower_id,source_bundle_id,destination_bundle_id,bundle_no,bundle_section,quantity,status,transferred_by,transferred_by_name,transferred_at,received_by,received_by_name,received_at,cancelled_by,cancelled_by_name,cancelled_at,notes,source_issue_key,destination_issue_key,item_snapshot,create_client_mutation_id,receive_client_mutation_id")
          .eq("project_id", projectId)
          .order("transferred_at", { ascending: false })
          .range(from, to),
      ),
    ]);

    if (bundleBootstrap.error) throw new Error(bundleBootstrap.error.message);
    const bundles = bundleBootstrap.data ?? [];

    return NextResponse.json({
      cacheVersion: 2,
      snapshotMode: "summary",
      projectId,
      generatedAt: new Date().toISOString(),
      towers: towers ?? [],
      bundles,

      // Intentionally empty. These large catalogues are searched on demand.
      members: [],
      bolts: [],

      bundleChecks,
      memberChecks,
      deliveries,
      materialEvents: events,
      transfers,
    }, { headers: { "Server-Timing": `bootstrap;dur=${(performance.now() - started).toFixed(1)}` } });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
