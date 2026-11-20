import { NextResponse } from "next/server";
import { LIFT_ACCESS, liftApiError, liftInvalid, requireLiftAccess } from "@/lib/lift-engineering/server";

const revisionTables = {
  cranes: { table: "lift_crane_profile_revisions", parent: "crane_profile_id", fields: ["revision","status","source_document","technical_data","coordinate_convention","carrier_mass_kg","carrier_cg_x_m","carrier_cg_y_m","upperworks_mass_kg","upperworks_cg_x_m","upperworks_cg_y_m","boom_pivot_x_m","boom_pivot_y_m","counterweight_mass_kg","counterweight_cg_x_m","counterweight_cg_y_m"] },
  configurations: { table: "lift_crane_configuration_revisions", parent: "configuration_id", fields: ["revision","status","data","counterweight_t","outrigger_state","boom_configuration","boom_length_m","fly_jib","wind_restriction","source_document","counterweight_cg_x_m","counterweight_cg_y_m","boom_mass_kg","boom_cg_x_m","boom_cg_y_m","fly_jib_mass_kg","fly_jib_cg_x_m","fly_jib_cg_y_m"] },
  rigging: { table: "lift_rigging_item_revisions", parent: "rigging_item_id", fields: ["revision","status","mass_kg","wll_t","source_document"] },
  templates: { table: "lift_tower_template_revisions", parent: "template_id", fields: ["revision","status","source_documents","notes"] },
} as const;
type Resource = keyof typeof revisionTables;
type Context = { params: Promise<{ resource: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.view);
    const { resource } = await context.params;
    if (!Object.hasOwn(revisionTables, resource)) return NextResponse.json({ error: "Revision library was not found." }, { status: 404 });
    const spec = revisionTables[resource as Resource];
    const parentId = new URL(request.url).searchParams.get("parentId");
    if (!parentId) liftInvalid("Parent record is required.");
    const { data, error } = await service.from(spec.table).select("*").eq(spec.parent, parentId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ revisions: data ?? [] });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

export async function POST(request: Request, context: Context) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const { resource } = await context.params;
    if (!Object.hasOwn(revisionTables, resource)) return NextResponse.json({ error: "Revision library was not found." }, { status: 404 });
    const spec = revisionTables[resource as Resource];
    const body = await request.json() as Record<string, unknown>;
    const parentId = typeof body.parentId === "string" ? body.parentId.trim() : "";
    const revision = typeof body.revision === "string" ? body.revision.trim() : "";
    if (!parentId || !revision) liftInvalid("Parent record and revision label are required.");
    const editableFields: readonly string[] = spec.fields;
    const values = Object.fromEntries(Object.entries(body).filter(([key, value]) => editableFields.includes(key) && value !== undefined));
    const { data, error } = await service.from(spec.table).insert({ ...values, [spec.parent]: parentId }).select("*").single();
    if (error || !data) throw new Error(error?.message || "Revision record was not returned.");
    return NextResponse.json({ revision: data }, { status: 201 });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
