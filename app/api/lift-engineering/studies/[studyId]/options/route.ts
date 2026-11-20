import { NextResponse } from "next/server";
import { assertLiftProjectAccess, liftApiError, requireLiftAccess, LIFT_ACCESS } from "@/lib/lift-engineering/server";

export async function GET(request: Request, context: { params: Promise<{ studyId: string }> }) {
  try {
    const { user, service } = await requireLiftAccess(request, LIFT_ACCESS.view);
    const { studyId } = await context.params;
    const { data: study, error } = await service.from("lift_studies").select("project_id").eq("id", studyId).maybeSingle();
    if (error) throw new Error(error.message); if (!study) return NextResponse.json({ error: "Lift Study was not found." }, { status: 404 });
    await assertLiftProjectAccess(service, user.id, study.project_id);
    const [cranes, craneRevisions, configurations, configurationRevisions, templates, templateRevisions, charts, arrangements, hooks, ropes, attachments] = await Promise.all([
      service.from("lift_crane_profiles").select("id,name,manufacturer,model").eq("active", true).order("name"),
      service.from("lift_crane_profile_revisions").select("id,crane_profile_id,revision,status").order("created_at", { ascending: false }),
      service.from("lift_crane_configurations").select("id,crane_profile_id,name").eq("active", true).order("name"),
      service.from("lift_crane_configuration_revisions").select("id,configuration_id,revision,status").order("created_at", { ascending: false }),
      service.from("lift_tower_templates").select("id,name,structure_type").eq("active", true).order("name"),
      service.from("lift_tower_template_revisions").select("id,template_id,revision,status").order("created_at", { ascending: false }),
      service.from("lift_load_charts").select("id,crane_profile_id,name,revision,status,configuration_revision_id,counterweight_t,outrigger_state,slew_sector,boom_configuration,boom_length_m,fly_jib,manufacturer_configuration,source_document").eq("active", true).neq("status", "Superseded").order("name"),
      service.from("lift_rigging_arrangements").select("id,name").eq("active", true).order("name"),
      service.from("lift_crane_hooks").select("id,name,mass_kg,crane_profile_revision_id").order("name"),
      service.from("lift_crane_ropes").select("id,name,mass_kg,crane_profile_revision_id").order("name"),
      service.from("lift_crane_attachments").select("id,name,mass_kg,crane_profile_revision_id").order("name"),
    ]);
    for (const result of [cranes, craneRevisions, configurations, configurationRevisions, templates, templateRevisions, charts, arrangements, hooks, ropes, attachments]) if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ cranes: cranes.data ?? [], craneRevisions: craneRevisions.data ?? [], configurations: configurations.data ?? [], configurationRevisions: configurationRevisions.data ?? [], templates: templates.data ?? [], templateRevisions: templateRevisions.data ?? [], charts: charts.data ?? [], arrangements: arrangements.data ?? [], hooks: hooks.data ?? [], ropes: ropes.data ?? [], attachments: attachments.data ?? [] });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
