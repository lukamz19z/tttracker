import { NextRequest, NextResponse } from "next/server";
import { requireAccessAdmin } from "@/lib/access/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AccessGroupRef = {
  id: string;
  code: string;
  name: string;
  sort_order: number | null;
};

type AccessAreaRef = {
  id: string;
  code: string;
  name: string;
  type: string | null;
  permission_level: string | null;
  group_id: string | null;
  access_groups: AccessGroupRef | AccessGroupRef[] | null;
};

type RouteRuleRow = {
  id: string;
  name: string;
  route_pattern: string;
  match_type: string;
  priority: number;
  is_active: boolean;
  access_area_id: string;
  access_areas: AccessAreaRef | AccessAreaRef[] | null;
};

function firstRelated<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normaliseRoute(value: unknown) {
  let route = String(value ?? "").trim();
  if (!route) return "";
  if (!route.startsWith("/")) route = `/${route}`;
  if (route.length > 1) route = route.replace(/\/+$/, "");
  return route;
}

export async function GET(request: NextRequest) {
  try {
    const { service } = await requireAccessAdmin(request);

    const [rules, areas] = await Promise.all([
      service
        .from("access_route_rules")
        .select(`
          id,name,route_pattern,match_type,priority,is_active,access_area_id,
          access_areas!inner(
            id,code,name,type,permission_level,group_id,
            access_groups(id,code,name,sort_order)
          )
        `)
        .order("priority")
        .order("route_pattern"),
      service
        .from("access_areas")
        .select(`
          id,code,name,type,permission_level,is_active,group_id,
          access_groups(id,code,name,sort_order)
        `)
        .eq("is_active", true)
        .eq("type", "tttracker")
        .order("name"),
    ]);

    if (rules.error) throw new Error(rules.error.message);
    if (areas.error) throw new Error(areas.error.message);

    const ruleRows = (rules.data ?? []) as RouteRuleRow[];

    return NextResponse.json({
      rules: ruleRows.map((row) => {
        const area = firstRelated(row.access_areas);
        const group = firstRelated(area?.access_groups ?? null);

        return {
          id: row.id,
          name: row.name,
          route_pattern: row.route_pattern,
          match_type: row.match_type,
          priority: row.priority,
          is_active: row.is_active,
          access_area_id: row.access_area_id,
          access_code: area?.code ?? "",
          access_name: area?.name ?? "",
          access_type: area?.type ?? null,
          permission_level: area?.permission_level ?? null,
          group_id: group?.id ?? null,
          group_code: group?.code ?? null,
          group_name: group?.name ?? null,
        };
      }),
      accessAreas: areas.data ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load route rules.";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { service } = await requireAccessAdmin(request);
    const body = await request.json();

    const id = String(body.id ?? "").trim();
    const name = String(body.name ?? "").trim();
    const routePattern = normaliseRoute(body.route_pattern);
    const matchType = body.match_type === "exact" ? "exact" : "prefix";
    const accessAreaId = String(body.access_area_id ?? "").trim();
    const priority = Number.isFinite(Number(body.priority)) ? Number(body.priority) : 100;
    const isActive = body.is_active !== false;

    if (!name) return NextResponse.json({ error: "Rule name is required." }, { status: 400 });
    if (!routePattern) return NextResponse.json({ error: "Route is required." }, { status: 400 });
    if (!accessAreaId) return NextResponse.json({ error: "Permission is required." }, { status: 400 });

    const payload = {
      name,
      route_pattern: routePattern,
      match_type: matchType,
      access_area_id: accessAreaId,
      priority,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    };

    const result = id
      ? await service.from("access_route_rules").update(payload).eq("id", id).select("*").single()
      : await service.from("access_route_rules").insert(payload).select("*").single();

    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ rule: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save route rule.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { service } = await requireAccessAdmin(request);
    const id = String(new URL(request.url).searchParams.get("id") ?? "").trim();
    if (!id) return NextResponse.json({ error: "Rule id is required." }, { status: 400 });

    const result = await service.from("access_route_rules").delete().eq("id", id);
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete route rule.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
