import { readMaterialsPages } from "@/lib/materials/read-pages";
import { NextRequest, NextResponse } from "next/server";

import { requireMaterialRecordAccess, canReadMaterialRecord } from "@/lib/materials/access-policy";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireMaterialsContext, validateMaterialsRequest, materialsErrorResponse } from "@/lib/materials/security";

type Context = { params: Promise<{ projectId: string }> };

function term(value: string) {
  return value.replaceAll("%", "").replaceAll(",", " ").trim();
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const project = await requireMaterialsContext(projectId, request.nextUrl.searchParams.get("organisation"), "view");
    const mode = request.nextUrl.searchParams.get("mode") ?? "members";
    const q = term(request.nextUrl.searchParams.get("q") ?? "");
    const towerId = request.nextUrl.searchParams.get("towerId") || null;
    const admin = createSupabaseAdmin();
    if (towerId) await validateMaterialsRequest(project, { towerId });
    const bundleId = request.nextUrl.searchParams.get("bundleId") || null;
    if (bundleId) {
      await validateMaterialsRequest(project, { bundleId, ...(towerId ? { towerId } : {}) });
      requireMaterialRecordAccess(project.access, "v2_material_bundles", bundleId);
    }
    const requestedOffset = Number(request.nextUrl.searchParams.get("offset"));
    const offset = Number.isFinite(requestedOffset) ? Math.max(0, Math.floor(requestedOffset)) : 0;
    const pageSize = bundleId ? 500 : 20;
    const previousOffset = offset > 0 ? Math.max(0, offset - pageSize) : null;
    const visible = (table: string, id: string) => canReadMaterialRecord(project.access, table, id);

    if (mode === "bundles" && !bundleId) {
      let bundleQuery = admin.from("v2_material_bundles")
        .select("id,tower_id,tower_type,bundle_reference,segment,package_context,required_quantity,supplied_quantity,total_weight_t,source_document,source_revision")
        .eq("project_id", projectId)
        .eq("is_active", true)
        .order("bundle_reference").order("id")
        .range(offset, offset + pageSize - 1);
      if (project.access.kind === "party") bundleQuery = bundleQuery.in("id", project.access.shares.filter((share) => share.type === "v2_material_bundles").map((share) => share.id));
      if (towerId) bundleQuery = bundleQuery.eq("tower_id", towerId);
      if (q) bundleQuery = bundleQuery.or(`bundle_reference.ilike.%${q}%,segment.ilike.%${q}%,package_context.ilike.%${q}%`);
      const { data: bundles, error } = await bundleQuery;
      if (error) throw new Error(error.message);

      const visibleBundles = (bundles ?? []).filter((bundle) => visible("v2_material_bundles", bundle.id));
      const enriched = await Promise.all(visibleBundles.map(async (bundle) => {
        let countQuery = admin.from("v2_material_register").select("id", { count: "exact", head: true })
          .eq("project_id", projectId).eq("tower_id", bundle.tower_id).eq("bundle_id", bundle.id).eq("is_active", true).eq("material_kind", "member");
        if (project.access.kind === "party") countQuery = countQuery.in("id", project.access.shares.filter((share) => share.type === "v2_material_register").map((share) => share.id));
        const counted = await countQuery;
        if (counted.error) throw new Error(counted.error.message);
        return { ...bundle, member_count: counted.count ?? 0 };
      }));
      return NextResponse.json({ items: [], bundles: enriched, previousOffset, nextOffset: visibleBundles.length === pageSize ? offset + pageSize : null });
    }

    const kinds = bundleId ? ["member"] : mode === "fasteners" ? ["bolt", "packer"] : mode === "bolts" ? ["bolt"] : mode === "packers" ? ["packer"] : ["member"];
    let itemQuery = admin.from("v2_material_register")
      .select("id,tower_id,tower_type,bundle_id,material_kind,item_reference,description,bundle_reference,segment,package_context,drawing_reference,drawing_revision,profile,material_code,diameter,length,bolt_type,packer_mark,required_quantity,received_quantity,unit,source_kind,source_role_key,source_document,source_revision")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .in("material_kind", kinds)
      .order("item_reference").order("id")
      .range(offset, offset + pageSize - 1);
    if (project.access.kind === "party") itemQuery = itemQuery.in("id", project.access.shares.filter((share) => share.type === "v2_material_register").map((share) => share.id));
    if (bundleId) itemQuery = itemQuery.eq("bundle_id", bundleId);
    if (towerId) itemQuery = itemQuery.eq("tower_id", towerId);
    if (q) itemQuery = itemQuery.or(`item_reference.ilike.%${q}%,description.ilike.%${q}%,bundle_reference.ilike.%${q}%,segment.ilike.%${q}%,drawing_reference.ilike.%${q}%,profile.ilike.%${q}%,diameter.ilike.%${q}%,length.ilike.%${q}%,packer_mark.ilike.%${q}%`);
    const { data: items, error } = await itemQuery;
    if (error) throw new Error(error.message);

    const resolvedIds = [...new Set((items ?? []).map((item) => item.bundle_id).filter((id): id is string => Boolean(id)))];
    const resolved = resolvedIds.length ? await admin.from("v2_material_bundles").select("id,tower_id,bundle_reference,segment,package_context")
      .eq("project_id", projectId).in("id", resolvedIds) : { data: [], error: null };
    if (resolved.error) throw new Error(resolved.error.message);
    const physicalPacks = new Map((resolved.data ?? []).filter((pack) => visible("v2_material_bundles", pack.id)).map((pack) => [pack.id, pack]));
    const itemIds = (items ?? []).map((item) => item.id);
    const { data: checks, error: checkError } = itemIds.length
      ? await admin.from("v2_material_member_checks").select("material_item_id,member_reference,status,checked_at,notes").eq("project_id", projectId).in("material_item_id", itemIds)
      : { data: [], error: null };
    if (checkError) throw new Error(checkError.message);
    const issues = itemIds.length && (project.access.kind === "host" || project.access.permissions["materials.issues.view"])
      ? await readMaterialsPages((from, to) => admin.from("v2_material_issues").select("id,material_item_id,issue_type_key,status")
        .eq("project_id", projectId).in("material_item_id", itemIds).order("id").range(from, to))
      : { data: [], error: null };
    const issueStatuses = new Map<string, string>();
    for (const issue of issues.data) {
      if (issue.material_item_id && !["closed", "resolved"].includes(issue.status) && visible("v2_material_issues", issue.id)) {
        issueStatuses.set(issue.material_item_id, issue.issue_type_key === "missing" ? "Missing" : "Issue open");
      }
    }
    const checkMap = new Map((checks ?? []).filter((check) => check.material_item_id).map((check) => [check.material_item_id, check]));

    return NextResponse.json({ items: (items ?? []).filter((item) => visible("v2_material_register", item.id)).map((item) => {
      const pack = item.bundle_id ? physicalPacks.get(item.bundle_id) : null;
      return { ...item, resolved_bundle_reference: pack && pack.tower_id === item.tower_id ? pack.bundle_reference : null,
        resolved_bundle_context: pack && pack.tower_id === item.tower_id ? [pack.package_context, pack.segment].filter(Boolean).join(" / ") : null,
        check: checkMap.get(item.id) ?? null, exception_status: issueStatuses.get(item.id) ?? null };
    }), bundles: [], previousOffset, nextOffset: (items?.length ?? 0) === pageSize ? offset + pageSize : null });
  } catch (error) {
    return materialsErrorResponse(error);
  }
}
