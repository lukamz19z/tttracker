import type { AccessService } from "@/lib/access/server";
import { userHasAccess } from "@/lib/access/server";

export type MatchedRouteRule = {
  id: string;
  name: string;
  route_pattern: string;
  match_type: "exact" | "prefix";
  access_area_id: string;
  access_code: string;
};

type RouteRuleRow = {
  id: string;
  name: string;
  route_pattern: string;
  match_type: "exact" | "prefix";
  priority: number | null;
  access_area_id: string;
  access_areas: { code: string } | { code: string }[] | null;
};

type Candidate = MatchedRouteRule & { priority: number };

function normalisePath(pathname: string) {
  const clean = pathname.split("?")[0]?.split("#")[0] ?? "/";
  if (clean.length > 1) return clean.replace(/\/+$/, "");
  return clean || "/";
}

function accessCode(value: RouteRuleRow["access_areas"]) {
  if (!value) return "";
  return Array.isArray(value) ? value[0]?.code ?? "" : value.code;
}

export async function matchAccessRuleForPath(
  service: AccessService,
  pathname: string,
): Promise<MatchedRouteRule | null> {
  const path = normalisePath(pathname);
  const { data, error } = await service
    .from("access_route_rules")
    .select(`
      id,name,route_pattern,match_type,priority,access_area_id,
      access_areas!inner(code)
    `)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as RouteRuleRow[];
  const candidates: Candidate[] = rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      route_pattern: normalisePath(row.route_pattern),
      match_type: row.match_type,
      access_area_id: row.access_area_id,
      access_code: accessCode(row.access_areas),
      priority: Number(row.priority ?? 100),
    }))
    .filter((row) => {
      if (!row.access_code) return false;
      if (row.match_type === "exact") return path === row.route_pattern;
      return path === row.route_pattern || path.startsWith(`${row.route_pattern}/`);
    })
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.route_pattern.length - a.route_pattern.length;
    });

  const match = candidates[0];
  if (!match) return null;

  return {
    id: match.id,
    name: match.name,
    route_pattern: match.route_pattern,
    match_type: match.match_type,
    access_area_id: match.access_area_id,
    access_code: match.access_code,
  };
}

export async function userCanOpenPath(
  service: AccessService,
  userId: string,
  pathname: string,
) {
  const rule = await matchAccessRuleForPath(service, pathname);
  if (!rule) return { allowed: true, rule: null };
  return {
    allowed: await userHasAccess(service, userId, rule.access_code),
    rule,
  };
}
