import { NextResponse } from "next/server";
import { exactChartConfigurationKey, type ManufacturerChartConfiguration } from "@/lib/lift-engineering/chart-configuration";
import { sameConfigurationBase, type ConfigurationBaseIdentity } from "@/lib/lift-engineering/configuration-identity";
import { LIFT_ACCESS, liftApiError, liftInvalid, requireLiftAccess } from "@/lib/lift-engineering/server";

const resources = {
  cranes: { table: "lift_crane_profiles", columns: "id,name,manufacturer,model,notes,active,created_at", fields: ["name","manufacturer","model","notes","active"] },
  configurations: { table: "lift_crane_configurations", columns: "id,crane_profile_id,name,active,created_at", fields: ["crane_profile_id","name","active"] },
  rigging: { table: "lift_rigging_items", columns: "id,description,category,manufacturer,model,notes,active,created_at", fields: ["description","category","manufacturer","model","notes","active"] },
  arrangements: { table: "lift_rigging_arrangements", columns: "id,name,description,active,created_at", fields: ["name","description","active"] },
  templates: { table: "lift_tower_templates", columns: "id,name,structure_type,tower_family,extension_configuration,description,nominal_height_m,metadata,active,created_at", fields: ["name","structure_type","tower_family","extension_configuration","description","nominal_height_m","metadata","active"] },
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
    if (resource === "configurations") {
      const profileId = typeof values.crane_profile_id === "string" ? values.crane_profile_id.trim() : "";
      const configurationRevision = body.configurationRevision;
      if (!profileId || !values.name || !configurationRevision || typeof configurationRevision !== "object" || Array.isArray(configurationRevision)) {
        liftInvalid("Crane profile, configuration name and base setup revision are required.");
      }
      const draft = configurationRevision as Record<string, unknown>;
      const revisionLabel = typeof draft.revision === "string" ? draft.revision.trim() : "";
      const counterweight = typeof draft.counterweight_t === "number" ? draft.counterweight_t : null;
      const outriggerState = typeof draft.outrigger_state === "string" ? draft.outrigger_state.trim() : "";
      const data = draft.data && typeof draft.data === "object" && !Array.isArray(draft.data) ? draft.data as Record<string, unknown> : {};
      const length = typeof data.outriggerLengthM === "number" ? data.outriggerLengthM : null;
      const width = typeof data.outriggerWidthM === "number" ? data.outriggerWidthM : null;
      const slewRange = typeof data.slewRange === "string" ? data.slewRange.trim().toLocaleLowerCase("en-AU") : "";
      if (!revisionLabel || counterweight == null || !Number.isFinite(counterweight) || !outriggerState || !slewRange) liftInvalid("A valid revision label, counterweight, outrigger setup and slew range are required.");
      if ((length !== null && (!Number.isFinite(length) || length <= 0)) || (width !== null && (!Number.isFinite(width) || width <= 0))) liftInvalid("Outrigger dimensions must be positive numbers.");

      // The V1 engineering library has no organisation/tenant column. The crane profile is
      // therefore the applicable ownership scope for an equivalent base configuration.
      const { data: profile, error: profileError } = await service.from("lift_crane_profiles").select("id").eq("id", profileId).maybeSingle();
      if (profileError) throw new Error(profileError.message);
      if (!profile) liftInvalid("Choose an existing crane profile.");
      const { data: parents, error: parentsError } = await service.from("lift_crane_configurations").select("id,crane_profile_id,name,active").eq("crane_profile_id", profileId);
      if (parentsError) throw new Error(parentsError.message);
      let existing: { id: string; crane_profile_id: string; name: string; active: boolean } | null = null;
      let existingRevision: Record<string, unknown> | null = null;
      const requestedIdentity: ConfigurationBaseIdentity = { craneProfileId: profileId, counterweightT: counterweight, outriggerState, outriggerLengthM: length, outriggerWidthM: width, slewRange };
      for (const parent of parents ?? []) {
        const { data: revisions, error: revisionsError } = await service.from("lift_crane_configuration_revisions")
          .select("id,revision,status,counterweight_t,outrigger_state,data").eq("configuration_id", parent.id);
        if (revisionsError) throw new Error(revisionsError.message);
        const match = (revisions ?? []).find((revision) => {
          const revisionData = revision.data && typeof revision.data === "object" ? revision.data as Record<string, unknown> : {};
          const currentIdentity: ConfigurationBaseIdentity = {
            craneProfileId: parent.crane_profile_id,
            counterweightT: typeof revision.counterweight_t === "number" ? revision.counterweight_t : null,
            outriggerState: typeof revision.outrigger_state === "string" ? revision.outrigger_state : null,
            outriggerLengthM: typeof revisionData.outriggerLengthM === "number" ? revisionData.outriggerLengthM : null,
            outriggerWidthM: typeof revisionData.outriggerWidthM === "number" ? revisionData.outriggerWidthM : null,
            slewRange: typeof revisionData.slewRange === "string" ? revisionData.slewRange : null,
          };
          return sameConfigurationBase(currentIdentity, requestedIdentity);
        });
        if (match) { existing = parent; existingRevision = match; break; }
      }
      if (existing) {
        return NextResponse.json({ record: existing, revision: existingRevision, existing: true, message: "An equivalent crane configuration already exists." });
      }
      const { data: created, error: createError } = await service.from("lift_crane_configurations").insert(values).select(item.columns).single();
      if (createError || !created) throw new Error(createError?.message || "Crane configuration was not returned.");
      const createdConfigurationId = (created as unknown as { id: string }).id;
      const revisionValues = Object.fromEntries(Object.entries(draft).filter(([key]) => ["revision","status","data","counterweight_t","outrigger_state","boom_configuration","boom_length_m","fly_jib","wind_restriction","source_document","counterweight_cg_x_m","counterweight_cg_y_m","boom_mass_kg","boom_cg_x_m","boom_cg_y_m","fly_jib_mass_kg","fly_jib_cg_x_m","fly_jib_cg_y_m"].includes(key)));
      revisionValues.status = "draft";
      const { data: createdRevision, error: revisionError } = await service.from("lift_crane_configuration_revisions")
        .insert({ ...revisionValues, configuration_id: createdConfigurationId }).select("*").single();
      if (revisionError || !createdRevision) throw new Error(revisionError?.message || "Configuration was created but its draft revision was not returned. Retry safely; the existing configuration will be reused.");
      return NextResponse.json({ record: created, revision: createdRevision, existing: false }, { status: 201 });
    }
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

export async function DELETE(request: Request, context: Context) {
  try {
    const { resource } = await context.params;
    if (resource !== "configurations") return NextResponse.json({ error: "Deletion is not supported for this library." }, { status: 405 });
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const body = await request.json() as { id?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) liftInvalid("Configuration ID is required.");
    const { data: configuration, error: configurationError } = await service.from("lift_crane_configurations").select("id").eq("id", id).maybeSingle();
    if (configurationError) throw new Error(configurationError.message);
    if (!configuration) return NextResponse.json({ error: "Crane configuration was not found." }, { status: 404 });
    const { data: revisions, error: revisionsError } = await service.from("lift_crane_configuration_revisions").select("id,status").eq("configuration_id", id);
    if (revisionsError) throw new Error(revisionsError.message);
    const revisionIds = (revisions ?? []).map((revision) => revision.id as string);
    let referenced = false;
    if (revisionIds.length) {
      const [studyReference, chartReference] = await Promise.all([
        service.from("lift_study_revisions").select("id", { count: "exact", head: true }).in("configuration_revision_id", revisionIds),
        service.from("lift_load_charts").select("id", { count: "exact", head: true }).in("configuration_revision_id", revisionIds),
      ]);
      if (studyReference.error) throw new Error(studyReference.error.message);
      if (chartReference.error) throw new Error(chartReference.error.message);
      referenced = (studyReference.count ?? 0) > 0 || (chartReference.count ?? 0) > 0;
    }
    const deletable = !referenced && revisions?.length === 1 && String(revisions[0].status).toLowerCase() === "draft";
    if (!deletable) return NextResponse.json({ error: referenced ? "This configuration is referenced by a lift study or load chart and cannot be deleted. Archive it instead." : "Only an unused configuration with its single automatically created draft revision can be deleted. Archive it instead.", code: "configuration_protected", archiveAvailable: true }, { status: 409 });
    const { data: deleted, error: deleteError } = await service.from("lift_crane_configurations").delete().eq("id", id).select("id").maybeSingle();
    if (deleteError) {
      if (deleteError.code === "23503") return NextResponse.json({ error: "A protected engineering record started referencing this configuration. It was not deleted; archive it instead.", code: "configuration_protected", archiveAvailable: true }, { status: 409 });
      throw new Error(deleteError.message);
    }
    if (!deleted) return NextResponse.json({ error: "Configuration was not deleted." }, { status: 409 });
    return NextResponse.json({ ok: true, deletedId: deleted.id });
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
