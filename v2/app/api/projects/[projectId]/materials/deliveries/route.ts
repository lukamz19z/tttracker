import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireMaterialsContext, validateMaterialsRequest, materialsErrorResponse } from "@/lib/materials/security";
import { readMaterialsPages } from "@/lib/materials/read-pages";
import { deliveryAvailability } from "@/lib/materials/delivery-planning";
import { materialActorUserId } from "@/lib/materials/project-actor";

type Context = { params: Promise<{ projectId: string }> };

async function materialActorName(
  admin: ReturnType<typeof createSupabaseAdmin>,
  userId: string | null,
) {
  if (!userId) return null;

  const { data } = await admin.auth.admin.getUserById(userId);
  const user = data.user;
  if (!user) return null;

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = String(
    metadata.full_name ?? metadata.name ?? metadata.display_name ?? "",
  ).trim();

  return fullName || user.email || "TTTracker user";
}


export async function POST(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const body = await request.json();
    const project = await requireMaterialsContext(
      projectId,
      String(body.organisationId ?? "") || null,
      "manage_deliveries",
    );
    await validateMaterialsRequest(project, body);
    const admin = createSupabaseAdmin();
    const organisationId = project.dataOrganisationId;
    const action = String(body.action ?? "create");

    const { data: deliveryFeature, error: deliveryFeatureError } = await admin
      .from("v2_project_option_definitions")
      .select("is_active")
      .eq("project_id", projectId)
      .eq("option_group", "material_feature")
      .eq("option_key", "deliveries")
      .maybeSingle();

    if (deliveryFeatureError) throw new Error(deliveryFeatureError.message);
    if (deliveryFeature?.is_active === false) {
      throw new Error("Material delivery management is disabled for this project.");
    }

    if (action === "create" || action === "create_docket") {
      const bundleIds = Array.isArray(body.bundleIds)
        ? body.bundleIds.map(String).filter(Boolean)
        : [];

      if (!body.towerId) throw new Error("Select a destination tower.");
      if (bundleIds.length === 0) throw new Error("Select at least one bundle.");

      const { data: bundles, error: bundleError } = await admin
        .from("v2_material_bundles")
        .select("id,tower_id,required_quantity")
        .eq("project_id", projectId)
        .in("id", bundleIds)
        .eq("is_active", true);

      if (bundleError) throw new Error(bundleError.message);
      if ((bundles ?? []).length !== bundleIds.length) {
        throw new Error("One or more selected bundles could not be found.");
      }

      const wrongTower = (bundles ?? []).find(
        (bundle) => bundle.tower_id !== body.towerId,
      );
      if (wrongTower) {
        throw new Error("Every selected bundle must belong to the selected tower.");
      }

      const allocations = await readMaterialsPages((from, to) => admin.from("v2_material_delivery_items")
        .select("*").eq("project_id", projectId).in("bundle_id", bundleIds).order("id").range(from, to));
      const headerIds = [...new Set(allocations.data.map((item) => item.delivery_id))];
      const headers = await readMaterialsPages((from, to) => admin.from("v2_material_deliveries")
        .select("id,delivery_number,status").eq("project_id", projectId).in("id", headerIds).order("id").range(from, to));
      const deliveries = headers.data.map((header) => ({ ...header, items: allocations.data.filter((item) => item.delivery_id === header.id) }));
      const unavailable = (bundles ?? []).find((bundle) => !deliveryAvailability(bundle, deliveries).eligible);
      if (unavailable) return NextResponse.json({ ok: false, error: "A selected bundle is already planned, delivered or partly delivered. Refresh the delivery selector." }, { status: 409 });

      const { data: deliveryNumber, error: numberError } = await admin.rpc(
        "tttracker_v2_next_material_delivery_number",
        { p_project_id: projectId },
      );
      if (numberError) throw new Error(numberError.message);

      const now = new Date().toISOString();
      const { data: delivery, error: deliveryError } = await admin
        .from("v2_material_deliveries")
        .insert({
          organisation_id: organisationId,
          project_id: projectId,
          delivery_number: deliveryNumber,
          status: action === "create_docket" ? "in_transit" : "planned",
          departed_at: action === "create_docket" ? now : null,
          driver_user_id: body.driverUserId || null,
          driver_name: String(body.driverName ?? "").trim() || null,
          vehicle_reference: String(body.vehicleReference ?? "").trim() || null,
          supplier_reference: String(body.supplierReference ?? "").trim() || null,
          scheduled_for: body.scheduledFor || null,
          notes: String(body.notes ?? "").trim() || null,
          created_by: materialActorUserId(project),
          created_at: now,
          updated_at: now,
        })
        .select("id,delivery_number")
        .single();

      if (deliveryError) throw new Error(deliveryError.message);

      const itemRows = (bundles ?? []).map((bundle) => ({
        organisation_id: organisationId,
        project_id: projectId,
        delivery_id: delivery.id,
        tower_id: bundle.tower_id,
        bundle_id: bundle.id,
        expected_quantity: Math.max(Number(bundle.required_quantity ?? 1), 0),
        delivered_quantity: 0,
        status: "planned",
        created_at: now,
        updated_at: now,
      }));

      const { error: itemError } = await admin
        .from("v2_material_delivery_items")
        .insert(itemRows);

      if (itemError) {
        await admin.from("v2_material_deliveries").delete().eq("id", delivery.id);
        throw new Error(itemError.message);
      }

      return NextResponse.json({ ok: true, delivery });
    }

    if (action === "bulk_driver_check") {
      if(!body.deliveryId)throw new Error("Delivery ID is required.");
      const status=String(body.status??"delivered");
      if(!["delivered","rejected"].includes(status))throw new Error("Invalid bulk delivery outcome.");
      const pending=await readMaterialsPages((from,to)=>admin.from("v2_material_delivery_items")
        .select("id,delivery_id,bundle_id,tower_id").eq("project_id",projectId).eq("organisation_id",organisationId)
        .eq("delivery_id",body.deliveryId).eq("status","planned").order("id").range(from,to));
      // Authorize every relationship, including party record sharing, before any write.
      for(const item of pending.data)await validateMaterialsRequest(project,{
        deliveryId:body.deliveryId,deliveryItemId:item.id,
      });
      const actorId=materialActorUserId(project);
      const {data,error}=await admin.rpc("tttracker_v2_delivery_bulk_outcome",{
        p_project_id:projectId,p_delivery_id:body.deliveryId,p_item_ids:pending.data.map(item=>item.id),
        p_status:status,p_actor:actorId,p_actor_name:await materialActorName(admin,actorId),
      });
      if(error)return NextResponse.json({ok:false,error:error.message},{status:409});
      return NextResponse.json(data);
    }

    if (["start", "driver_check", "correct_outcome"].includes(action)) {
      if (!body.deliveryId || (action !== "start" && !body.deliveryItemId)) throw new Error("Delivery and delivery item IDs are required.");
      const actorId = materialActorUserId(project);
      const quantity = Number(body.deliveredQuantity ?? 0);
      if (!Number.isFinite(quantity) || quantity < 0) throw new Error("Invalid delivery quantity.");
      const { data, error } = await admin.rpc("tttracker_v2_delivery_transition", {
        p_project_id: projectId, p_delivery_id: body.deliveryId, p_item_id: body.deliveryItemId || null,
        p_action: action, p_status: String(body.status ?? "delivered"), p_quantity: quantity,
        p_actor: actorId, p_actor_name: await materialActorName(admin, actorId),
        p_reason: String(body.reason ?? "").trim() || null, p_expected_status: body.expectedStatus || null,
      });
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
      return NextResponse.json(data);
    }

    throw new Error("Unsupported delivery action.");
  } catch (error) {
    return materialsErrorResponse(error);
  }
}
