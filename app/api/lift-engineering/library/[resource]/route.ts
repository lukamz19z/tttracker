import { NextResponse } from "next/server";
import { exactChartConfigurationKey, type ManufacturerChartConfiguration } from "@/lib/lift-engineering/chart-configuration";
import { LIFT_ACCESS, liftApiError, liftInvalid, requireLiftAccess } from "@/lib/lift-engineering/server";

const resources = {
  cranes: { table: "lift_crane_profiles", columns: "id,name,manufacturer,model,notes,active,created_at", fields: ["name","manufacturer","model","notes","active"] },
  configurations: { table: "lift_crane_configurations", columns: "id,crane_profile_id,name,active,created_at", fields: ["crane_profile_id","name","active"] },
  rigging: { table: "lift_rigging_items", columns: "id,description,category,manufacturer,model,notes,active,created_at", fields: ["description","category","manufacturer","model","notes","active"] },
  arrangements: { table: "lift_rigging_arrangements", columns: "id,name,description,active,created_at", fields: ["name","description","active"] },
  templates: { table: "lift_tower_templates", columns: "id,name,structure_type,description,active,created_at", fields: ["name","structure_type","description","active"] },
  charts: { table: "lift_load_charts", columns: "id,crane_profile_id,configuration_revision_id,name,revision,counterweight_t,outrigger_state,slew_sector,boom_configuration,boom_length_m,boom_sequence,fly_jib,wind_restriction,manufacturer_configuration,status,source_document,notes,active,created_at", fields: ["crane_profile_id","configuration_revision_id","name","revision","counterweight_t","outrigger_state","slew_sector","boom_configuration","boom_length_m","boom_sequence","fly_jib","wind_restriction","manufacturer_configuration","source_document","notes","active"] },
  settings: { table: "lift_calculation_settings", columns: "id,methodology_version,name,settings,is_active,created_at", fields: ["methodology_version","name","settings","is_active"] },
} as const;
type Resource = keyof typeof resources;
type Context = { params: Promise<{ resource: string }> };
function config(raw: string) { return Object.hasOwn(resources, raw) ? resources[raw as Resource] : null; }
function payload(body: Record<string, unknown>, fields: readonly string[]) {
  return Object.fromEntries(Object.entries(body).filter(([key, value]) => fields.includes(key) && value !== undefined));
}

export async function GET(request: Request, context: Context) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.view);
    const { resource } = await context.params; const item = config(resource);
    if (!item) return NextResponse.json({ error: "Lift Engineering library was not found." }, { status: 404 });
    let query = service.from(item.table).select(item.columns).order("created_at", { ascending: false });
    const parentKey = new URL(request.url).searchParams.get("parentKey");
    const parentId = new URL(request.url).searchParams.get("parentId");
    if (parentKey && parentId && ["crane_profile_id","configuration_revision_id"].includes(parentKey)) query = query.eq(parentKey, parentId);
    const { data, error } = await query.limit(250);
    if (error) throw new Error(error.message);
    return NextResponse.json({ records: data ?? [] });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

export async function POST(request: Request, context: Context) {
  try {
    const { resource } = await context.params;
    const { service } = await requireLiftAccess(request, resource === "settings" ? LIFT_ACCESS.manageSettings : LIFT_ACCESS.manageLibrary);
    const item = config(resource);
    if (!item) return NextResponse.json({ error: "Lift Engineering library was not found." }, { status: 404 });
    const body = await request.json() as Record<string, unknown>;
    const values = payload(body, item.fields);
    const nameKey = ["cranes","rigging","templates"].includes(resource) ? "name" : resource === "arrangements" ? "name" : "name";
    if (resource !== "settings" && resource !== "charts" && !String(values[nameKey] ?? values.description ?? "").trim()) liftInvalid("A name or description is required.");
    if (resource === "settings" && (!values.methodology_version || !values.name || typeof values.settings !== "object")) liftInvalid("Methodology version, name and settings are required.");
    if (resource === "charts") {
      if (typeof values.manufacturer_configuration !== "object" || !values.manufacturer_configuration || Array.isArray(values.manufacturer_configuration)) {
        values.manufacturer_configuration = {};
      }
      const manufacturerConfiguration = values.manufacturer_configuration as ManufacturerChartConfiguration;
      const craneProfileId = typeof values.crane_profile_id === "string" ? values.crane_profile_id : "";
      const configurationRevisionId = typeof values.configuration_revision_id === "string" ? values.configuration_revision_id : "";
      const { data: crane, error: craneError } = await service.from("lift_crane_profiles").select("manufacturer,model").eq("id", craneProfileId).maybeSingle();
      if (craneError) throw new Error(craneError.message);
      if (!crane) liftInvalid("Choose an existing crane profile for the chart.");
      if (configurationRevisionId) {
        const { data: configurationRevision, error: configError } = await service.from("lift_crane_configuration_revisions")
          .select("id,lift_crane_configurations(crane_profile_id)").eq("id", configurationRevisionId).maybeSingle();
        if (configError) throw new Error(configError.message);
        const parent = Array.isArray(configurationRevision?.lift_crane_configurations) ? configurationRevision.lift_crane_configurations[0] : configurationRevision?.lift_crane_configurations;
        if (!configurationRevision || parent?.crane_profile_id !== craneProfileId) liftInvalid("The chart configuration revision must belong to the selected crane.");
      }
      if (manufacturerConfiguration.manufacturer !== crane.manufacturer || manufacturerConfiguration.craneModel !== crane.model) liftInvalid("Chart manufacturer and model must match the selected crane profile.");
      const requiredConfig = ["chartFamily", "boomType", "mainBoomLengthM", "counterweightT", "outriggerLengthM", "outriggerWidthM", "flyJibFitted"] as const;
      if (requiredConfig.some((key) => manufacturerConfiguration[key] === undefined || manufacturerConfiguration[key] === null || manufacturerConfiguration[key] === "")) liftInvalid("The chart must contain its exact manufacturer family, boom, counterweight, outrigger and fly/jib state.");
      values.manufacturer_configuration = { ...manufacturerConfiguration, identityKey: exactChartConfigurationKey(manufacturerConfiguration) };
      values.status = "Draft";
    }
    const { data, error } = await service.from(item.table).insert(values).select(item.columns).single();
    if (error || !data) throw new Error(error?.message || "Library record was not returned.");
    return NextResponse.json({ record: data }, { status: 201 });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { resource } = await context.params;
    const { service } = await requireLiftAccess(request, resource === "settings" ? LIFT_ACCESS.manageSettings : LIFT_ACCESS.manageLibrary);
    const item = config(resource);
    if (!item) return NextResponse.json({ error: "Lift Engineering library was not found." }, { status: 404 });
    const body = await request.json() as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const values = payload(body, item.fields);
    if (!id || !Object.keys(values).length) liftInvalid("Record ID and at least one editable field are required.");
    if (resource === "charts") {
      const { data: current, error: currentError } = await service.from("lift_load_charts").select("id,status").eq("id", id).maybeSingle();
      if (currentError) throw new Error(currentError.message);
      if (!current) return NextResponse.json({ error: "Load chart was not found." }, { status: 404 });
      if (["Verified", "Superseded"].includes(String(current.status))) liftInvalid("Verified or superseded load charts are immutable. Create a new draft chart revision.");
      if (values.manufacturer_configuration !== undefined) liftInvalid("Chart configuration identity cannot be edited in place. Create a new draft chart record.");
    }
    const { data, error } = await service.from(item.table).update(values).eq("id", id).select(item.columns).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Library record was not found." }, { status: 404 });
    return NextResponse.json({ record: data });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
