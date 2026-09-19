import { NextResponse } from "next/server";

import {
  cleanMaterialValue,
  mobileMaterialApiError,
  requireMobileMaterialUser,
} from "@/lib/materials/mobile-material-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchKind = "all" | "member" | "bundle" | "bolt";
type MemberField = "all" | "mark" | "pn" | "drawing" | "bundle" | "segment";

type SearchResult = {
  kind: Exclude<SearchKind, "all">;
  id: string;
  towerId: string;
  towerName: string;
  title: string;
  subtitle: string;
  meta: string;
  record: Record<string, unknown>;
};

function safeSearch(value: string) {
  return value.replace(/[,%()"']/g, " ").replace(/\s+/g, " ").trim();
}

function requestedKind(value: string | null): SearchKind {
  const clean = cleanMaterialValue(value).toLowerCase();
  return clean === "member" || clean === "bundle" || clean === "bolt"
    ? clean
    : "all";
}

function requestedMemberField(value: string | null): MemberField {
  const clean = cleanMaterialValue(value).toLowerCase();
  return clean === "mark" ||
    clean === "pn" ||
    clean === "drawing" ||
    clean === "bundle" ||
    clean === "segment"
    ? clean
    : "all";
}

function displayTowerName(row: Record<string, unknown>) {
  return cleanMaterialValue(row.name) || cleanMaterialValue(row.line) || "Tower";
}

function searchableScore(result: SearchResult, query: string) {
  const q = query.toLowerCase();
  const title = result.title.toLowerCase();
  const subtitle = result.subtitle.toLowerCase();
  const meta = result.meta.toLowerCase();

  if (title === q) return 0;
  if (title.startsWith(q)) return 1;
  if (title.includes(q)) return 2;
  if (subtitle.startsWith(q)) return 3;
  if (subtitle.includes(q)) return 4;
  if (meta.includes(q)) return 5;
  return 6;
}

function memberFilterExpression(pattern: string, field: MemberField) {
  if (field === "mark") return [`mark_no.ilike.${pattern}`];
  if (field === "pn") return [`pn_final.ilike.${pattern}`];
  if (field === "drawing") return [`drawing_number.ilike.${pattern}`];
  if (field === "bundle") return [`bundle_reference.ilike.${pattern}`];
  if (field === "segment") {
    return [`section.ilike.${pattern}`, `tower_segment.ilike.${pattern}`];
  }

  return [
    `mark_no.ilike.${pattern}`,
    `pn_final.ilike.${pattern}`,
    `bundle_reference.ilike.${pattern}`,
    `drawing_number.ilike.${pattern}`,
    `section.ilike.${pattern}`,
    `tower_segment.ilike.${pattern}`,
  ];
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = cleanMaterialValue(url.searchParams.get("projectId"));
    const requestedTowerId = cleanMaterialValue(url.searchParams.get("towerId"));
    const rawQuery = cleanMaterialValue(url.searchParams.get("q"));
    const query = safeSearch(rawQuery);
    const kind = requestedKind(url.searchParams.get("kind"));
    const memberField = requestedMemberField(url.searchParams.get("memberField"));
    const requestedLimit = Number(url.searchParams.get("limit") ?? 60);
    const limit = Math.max(
      1,
      Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 60, 80),
    );

    if (!projectId) {
      return NextResponse.json({ error: "Project ID is required." }, { status: 400 });
    }

    if (query.length < 2) {
      return NextResponse.json({
        query: rawQuery,
        kind,
        towerId: requestedTowerId,
        memberField,
        results: [],
      });
    }

    const { service } = await requireMobileMaterialUser(request, projectId);

    let towersQuery = service
      .from("towers")
      .select("id,name,line")
      .eq("project_id", projectId);

    if (requestedTowerId) {
      towersQuery = towersQuery.eq("id", requestedTowerId);
    }

    const { data: towers, error: towersError } = await towersQuery;
    if (towersError) throw new Error(towersError.message);

    const towerRows = (towers ?? []) as Array<Record<string, unknown>>;
    const towerIds = towerRows
      .map((row) => cleanMaterialValue(row.id))
      .filter(Boolean);

    if (requestedTowerId && !towerIds.includes(requestedTowerId)) {
      return NextResponse.json(
        { error: "The selected tower is not available in this project." },
        { status: 400 },
      );
    }

    if (!towerIds.length) {
      return NextResponse.json({
        query: rawQuery,
        kind,
        towerId: requestedTowerId,
        memberField,
        results: [],
      });
    }

    const towerNames = new Map(
      towerRows.map((row) => [cleanMaterialValue(row.id), displayTowerName(row)]),
    );

    const pattern = `%${query}%`;
    const perKindLimit = kind === "all" ? Math.min(limit, 40) : limit;

    const memberPromise =
      kind === "all" || kind === "member"
        ? service
            .from("tower_material_members")
            .select(
              "id,tower_id,bundle_id,bundle_reference,drawing_number,mark_no,pn_final,qty_per_tower,section,tower_segment",
            )
            .in("tower_id", towerIds)
            .or(memberFilterExpression(pattern, memberField).join(","))
            .limit(perKindLimit)
        : Promise.resolve({ data: [], error: null });

    const bundlePromise =
      kind === "all" || kind === "bundle"
        ? service
            .from("tower_required_bundles")
            .select(
              "id,tower_id,bundle_no,section,qty_required,total_weight,member_qty",
            )
            .in("tower_id", towerIds)
            .or([`bundle_no.ilike.${pattern}`, `section.ilike.${pattern}`].join(","))
            .limit(perKindLimit)
        : Promise.resolve({ data: [], error: null });

    const boltPromise =
      kind === "all" || kind === "bolt"
        ? service
            .from("tower_material_bolts")
            .select("id,tower_id,tower_segment,bolt_diameter,dn_sn,length,qty")
            .in("tower_id", towerIds)
            .or(
              [
                `bolt_diameter.ilike.${pattern}`,
                `dn_sn.ilike.${pattern}`,
                `length.ilike.${pattern}`,
                `tower_segment.ilike.${pattern}`,
              ].join(","),
            )
            .limit(perKindLimit)
        : Promise.resolve({ data: [], error: null });

    const [members, bundles, bolts] = await Promise.all([
      memberPromise,
      bundlePromise,
      boltPromise,
    ]);

    const firstError = members.error || bundles.error || bolts.error;
    if (firstError) throw new Error(firstError.message);

    const results: SearchResult[] = [];

    for (const raw of (members.data ?? []) as Array<Record<string, unknown>>) {
      const towerId = cleanMaterialValue(raw.tower_id);
      const mark =
        cleanMaterialValue(raw.mark_no) ||
        cleanMaterialValue(raw.pn_final) ||
        "Member";

      results.push({
        kind: "member",
        id: cleanMaterialValue(raw.id),
        towerId,
        towerName: towerNames.get(towerId) ?? "Tower",
        title: mark,
        subtitle: [
          cleanMaterialValue(raw.pn_final) && `PN ${cleanMaterialValue(raw.pn_final)}`,
          cleanMaterialValue(raw.bundle_reference) &&
            `Bundle ${cleanMaterialValue(raw.bundle_reference)}`,
          cleanMaterialValue(raw.drawing_number) &&
            `Drawing ${cleanMaterialValue(raw.drawing_number)}`,
          cleanMaterialValue(raw.tower_segment) || cleanMaterialValue(raw.section),
        ]
          .filter(Boolean)
          .join(" · "),
        meta: [
          towerNames.get(towerId) ?? "Tower",
          raw.qty_per_tower != null
            ? `Qty/Tower ${cleanMaterialValue(raw.qty_per_tower)}`
            : "",
        ]
          .filter(Boolean)
          .join(" · "),
        record: raw,
      });
    }

    for (const raw of (bundles.data ?? []) as Array<Record<string, unknown>>) {
      const towerId = cleanMaterialValue(raw.tower_id);
      const bundleNo = cleanMaterialValue(raw.bundle_no) || "—";

      results.push({
        kind: "bundle",
        id: cleanMaterialValue(raw.id),
        towerId,
        towerName: towerNames.get(towerId) ?? "Tower",
        title: `Bundle ${bundleNo}`,
        subtitle: [
          cleanMaterialValue(raw.section),
          raw.qty_required != null ? `Qty ${cleanMaterialValue(raw.qty_required)}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        meta: [
          towerNames.get(towerId) ?? "Tower",
          raw.member_qty != null
            ? `${cleanMaterialValue(raw.member_qty)} members`
            : "",
        ]
          .filter(Boolean)
          .join(" · "),
        record: raw,
      });
    }

    for (const raw of (bolts.data ?? []) as Array<Record<string, unknown>>) {
      const towerId = cleanMaterialValue(raw.tower_id);
      const diameter = cleanMaterialValue(raw.bolt_diameter);
      const length = cleanMaterialValue(raw.length);

      results.push({
        kind: "bolt",
        id: cleanMaterialValue(raw.id),
        towerId,
        towerName: towerNames.get(towerId) ?? "Tower",
        title: [diameter, length].filter(Boolean).join(" × ") || "Bolt",
        subtitle: [
          cleanMaterialValue(raw.dn_sn),
          cleanMaterialValue(raw.tower_segment),
        ]
          .filter(Boolean)
          .join(" · "),
        meta: [
          towerNames.get(towerId) ?? "Tower",
          raw.qty != null ? `Qty ${cleanMaterialValue(raw.qty)}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        record: raw,
      });
    }

    results.sort((a, b) => {
      const score = searchableScore(a, query) - searchableScore(b, query);
      if (score !== 0) return score;

      const tower = a.towerName.localeCompare(b.towerName, undefined, {
        numeric: true,
      });
      if (tower !== 0) return tower;

      return a.title.localeCompare(b.title, undefined, { numeric: true });
    });

    return NextResponse.json({
      query: rawQuery,
      kind,
      towerId: requestedTowerId,
      memberField,
      results: results.slice(0, limit),
    });
  } catch (error) {
    const apiError = mobileMaterialApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
