import "server-only";
import { readMaterialsPages } from "./read-pages";
import { canReadMaterialRecord } from "./access-policy";
import { filterMaterialsPayload } from "./visibility";
import type { requireMaterialsContext } from "./security";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { MaterialDeliveryItem, MaterialIssueEvent, MaterialsControlPayload } from "@/lib/materials/types";

export async function getMaterialsControl(context: Awaited<ReturnType<typeof requireMaterialsContext>>): Promise<MaterialsControlPayload> {
  const projectId = context.project.id;
  const organisationId = context.workspace.organisation.organisationId;
  const admin = createSupabaseAdmin();
  const { data: actor } = await admin.auth.admin.getUserById(context.workspace.userId);
  const recordedBy = String(actor.user?.user_metadata?.full_name ?? actor.user?.user_metadata?.name ?? actor.user?.email ?? context.workspace.email);

  const [
    towersRes,
    bundlesRes,
    checksRes,
    memberChecksRes,
    itemKindsRes,
    issuesRes,
    issueEventsRes,
    movementsRes,
    deliveriesRes,
    deliveryItemsRes,
    locationsRes,
    reservationsRes,
    amendmentsRes,
    findingsRes,
    docketsRes,
    optionsRes,
    deliveryFeatureRes,
  ] = await Promise.all([
    admin
      .from("v2_towers")
      .select("id,tower_identifier,line,tower_type_id,v2_tower_types(name,type_code)")
      .eq("project_id", projectId)
      .order("tower_identifier"),
    readMaterialsPages((from, to) => admin.from("v2_material_bundles").select("id,tower_id,tower_type,bundle_reference,segment,package_context,required_quantity,supplied_quantity,total_weight_t,source_document,source_revision").eq("project_id", projectId).eq("is_active", true).order("bundle_reference").order("id").range(from, to)),
    admin.from("v2_material_bundle_checks").select("bundle_id,status,quantity_received,checked_by,checked_at,notes").eq("project_id", projectId),
    admin.from("v2_material_member_checks").select("material_item_id,member_reference,status,checked_at,notes").eq("project_id", projectId).limit(25000),
    readMaterialsPages((from, to) => admin.from("v2_material_register").select("id,material_kind,tower_id,bundle_id").eq("project_id", projectId).eq("is_active", true).order("id").range(from, to)),
    admin.from("v2_material_issues").select("id,issue_number,tower_id,material_item_id,bundle_id,issue_type_key,item_reference,description,quantity_affected,quantity_resolved,unit,status,raised_docket_id,raised_at,affected_work,work_outcome_key,affected_activity,affected_segment,current_effect,current_location_id,current_tower_id,client_reference").eq("project_id", projectId).order("raised_at", { ascending: false }).limit(5000),
    admin.from("v2_material_issue_events").select("id,issue_id,event_type_key,quantity,unit,source_type_key,source_tower_id,source_location_id,destination_tower_id,destination_location_id,docket_id,reference,notes,occurred_at").eq("project_id", projectId).order("occurred_at", { ascending: true }).limit(25000),
    admin.from("v2_material_movements").select("id,material_item_id,bundle_id,issue_id,movement_type_key,quantity,unit,source_type_key,source_tower_id,source_location_id,destination_tower_id,destination_location_id,docket_id,status,reference,notes,moved_at,received_at,created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(10000),
    readMaterialsPages((from, to) => admin.from("v2_material_deliveries").select("id,delivery_number,status,driver_user_id,driver_name,vehicle_reference,supplier_reference,scheduled_for,departed_at,delivered_at,completed_at,completed_by,completed_by_name,notes,created_at").eq("project_id", projectId).order("created_at", { ascending: false }).order("id").range(from, to)),
    readMaterialsPages((from, to) => admin.from("v2_material_delivery_items").select("id,delivery_id,tower_id,bundle_id,expected_quantity,delivered_quantity,status,driver_checked_by,driver_checked_by_name,driver_checked_at,notes").eq("project_id", projectId).order("id").range(from, to)),
    admin.from("v2_material_locations").select("id,location_type_key,code,name,tower_id").eq("project_id", projectId).eq("is_active", true).order("name"),
    admin.from("v2_material_reservations").select("id,material_item_id,bundle_id,issue_id,source_tower_id,source_location_id,destination_tower_id,destination_location_id,quantity,unit,status,reserved_at,expires_at,released_at").eq("project_id", projectId).order("reserved_at", { ascending: false }).limit(5000),
    admin.from("v2_material_amendments").select("id,amendment_number,title,reference_type_key,reference_number,scope_key,tower_id,tower_type,drawing_reference,drawing_revision,segment,reason,status_key,effective_from,document_url,created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(3000),
    readMaterialsPages((from, to) => admin.from("v2_material_reconciliation_findings").select("id,finding_type_key,severity,status,tower_id,item_reference,bundle_reference,drawing_reference,segment,message,details").eq("project_id", projectId).eq("status", "open").order("created_at", { ascending: false }).order("id").range(from, to)),
    admin.from("v2_daily_dockets").select("id,docket_date,primary_tower_id,crew_label,leading_hand_name,approval_status").eq("project_id", projectId).order("docket_date", { ascending: false }).limit(750),
    admin.from("v2_project_option_definitions").select("id,option_group,option_key,label,settings").eq("project_id", projectId).eq("is_active", true).like("option_group", "material_%").order("option_group").order("sort_order"),
    admin.from("v2_project_option_definitions").select("id,is_active").eq("project_id", projectId).eq("option_group", "material_feature").eq("option_key", "deliveries").maybeSingle(),
  ]);

  const queryErrors = [
    ["towers", towersRes.error],
    ["bundles", bundlesRes.error],
    ["bundle checks", checksRes.error],
    ["member checks", memberChecksRes.error],
    ["material register", itemKindsRes.error],
    ["material issues", issuesRes.error],
    ["material issue events", issueEventsRes.error],
    ["material movements", movementsRes.error],
    ["material deliveries", deliveriesRes.error],
    ["material delivery items", deliveryItemsRes.error],
    ["material locations", locationsRes.error],
    ["material reservations", reservationsRes.error],
    ["material amendments", amendmentsRes.error],
    ["reconciliation findings", findingsRes.error],
    ["daily dockets", docketsRes.error],
    ["material options", optionsRes.error],
    ["material feature settings", deliveryFeatureRes.error],
  ] as const;

  const failedQuery = queryErrors.find(([, queryError]) => Boolean(queryError));
  if (failedQuery?.[1]) {
    throw new Error(`Materials Control ${failedQuery[0]} query failed: ${failedQuery[1].message}`);
  }

  const normaliseTower = (row: Record<string, unknown>) => {
    const relation = row.v2_tower_types;
    const towerType =
      Array.isArray(relation)
        ? (relation[0] as Record<string, unknown> | undefined)
        : (relation as Record<string, unknown> | null | undefined);

    return {
      id: String(row.id ?? ""),
      tower_identifier: String(row.tower_identifier ?? ""),
      line: row.line == null ? null : String(row.line),
      tower_type:
        towerType?.type_code != null && String(towerType.type_code).trim()
          ? String(towerType.type_code)
          : towerType?.name != null && String(towerType.name).trim()
            ? String(towerType.name)
            : null,
    };
  };

  const towers = ((towersRes.data ?? []) as Array<Record<string, unknown>>).map(normaliseTower);

  const checkMap = new Map((checksRes.data ?? []).filter(Boolean).map((row) => [row.bundle_id, row]));
  const eventsByIssue = new Map<string, MaterialIssueEvent[]>();
  for (const row of (issueEventsRes.data ?? []).filter(Boolean)) {
    const list = eventsByIssue.get(row.issue_id) ?? [];
    list.push(row);
    eventsByIssue.set(row.issue_id, list);
  }

  const physicalTowers = new Map((bundlesRes.data ?? []).map((bundle) => [bundle.id, bundle.tower_id]));
  const memberCounts = new Map<string, number>();
  for (const item of itemKindsRes.data ?? []) {
    if (item.material_kind === "member" && item.bundle_id && physicalTowers.get(item.bundle_id) === item.tower_id && canReadMaterialRecord(context.access, "v2_material_register", item.id)) {
      memberCounts.set(item.bundle_id, (memberCounts.get(item.bundle_id) ?? 0) + 1);
    }
  }
  const bundles = (bundlesRes.data ?? []).filter((row) => Boolean(row?.id)).map((row) => ({ ...row, member_count: memberCounts.get(row.id) ?? 0, check: checkMap.get(row.id) ?? null }));

  const deliveryItemsByDelivery = new Map<string, MaterialDeliveryItem[]>();
  for (const row of (deliveryItemsRes.data ?? []).filter((row) => Boolean(row?.id && row?.delivery_id))) {
    const list = deliveryItemsByDelivery.get(row.delivery_id) ?? [];
    list.push(row);
    deliveryItemsByDelivery.set(row.delivery_id, list);
  }
  const deliveries = (deliveriesRes.data ?? []).filter((row) => Boolean(row?.id)).map((row) => ({
    ...row,
    items: deliveryItemsByDelivery.get(row.id) ?? [],
  }));

  const issues = (issuesRes.data ?? []).filter((row) => Boolean(row?.id)).map((row) => ({ ...row, events: eventsByIssue.get(row.id) ?? [] }));
  const openIssues = issues.filter((issue) => !["resolved", "closed"].includes(issue.status));
  const itemKinds = itemKindsRes.data ?? [];

  return filterMaterialsPayload({
    permissions: { view: false, import: false, check_bundles: false, manage_deliveries: false, manage_issues: false, manage_movements: false, manage_reservations: false, manage_amendments: false, configure: false },
    projectId,
    organisationId,
    recordedBy,
    towers,
    bundles,
    issues,
    movements: movementsRes.data ?? [],
    deliveries,
    locations: locationsRes.data ?? [],
    reservations: reservationsRes.data ?? [],
    amendments: amendmentsRes.data ?? [],
    findings: findingsRes.data ?? [],
    dockets: docketsRes.data ?? [],
    options: optionsRes.data ?? [],
    settings: {
      deliveriesEnabled: deliveryFeatureRes.data?.is_active !== false,
    },
    metrics: {
      bundleCount: bundles.length,
      checkedBundles: bundles.filter((bundle) => bundle.check && bundle.check.status !== "not_checked").length,
      memberCount: itemKinds.filter((item) => item.material_kind === "member").length,
      boltCount: itemKinds.filter((item) => item.material_kind === "bolt").length,
      packerCount: itemKinds.filter((item) => item.material_kind === "packer").length,
      openMissing: openIssues.filter((issue) => issue.issue_type_key === "missing").length,
      openExcess: openIssues.filter((issue) => issue.issue_type_key === "excess").length,
      outstandingMissingQty: openIssues.filter((issue) => issue.issue_type_key === "missing").reduce((sum, issue) => sum + Math.max(Number(issue.quantity_affected ?? 0) - Number(issue.quantity_resolved ?? 0), 0), 0),
      inTransit: (movementsRes.data ?? []).filter((movement) => movement.status === "in_transit").length,
      deliveryItemsDelivered: (deliveryItemsRes.data ?? []).filter((item) => item.status === "delivered").length,
      awaitingSiteVerification: (deliveryItemsRes.data ?? []).filter((item) => {
        if (item.status !== "delivered") return false;
        const bundleCheck = checkMap.get(item.bundle_id);
        return !bundleCheck || !["arrived", "full", "complete", "completed"].includes(String(bundleCheck.status ?? "").toLowerCase());
      }).length,
      activeReservations: (reservationsRes.data ?? []).filter((reservation) => reservation.status === "reserved").length,
      openReconciliation: (findingsRes.data ?? []).filter(row => row.severity !== "info").length,
    },
  }, context.access);
}
