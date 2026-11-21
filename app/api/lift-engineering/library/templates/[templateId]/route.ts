import { NextResponse } from "next/server";
import { LIFT_ACCESS, liftApiError, liftInvalid, requireLiftAccess } from "@/lib/lift-engineering/server";

type Context = { params: Promise<{ templateId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.view);
    const { templateId } = await context.params;
    const { data: template, error } = await service.from("lift_tower_templates")
      .select("id,name,structure_type,tower_family,extension_configuration,description,nominal_height_m,metadata,active,created_at").eq("id", templateId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!template) return NextResponse.json({ error: "Tower Template was not found." }, { status: 404 });
    const [revisionsResult, liftTemplatesResult] = await Promise.all([
      service.from("lift_tower_template_revisions").select("id,template_id,revision,status,source_documents,notes,created_at").eq("template_id", templateId).order("created_at", { ascending: false }),
      service.from("lift_erection_templates").select("id,tower_template_id,name,description,method_tags,crane_suitability,active,created_at,updated_at").eq("tower_template_id", templateId).order("name"),
    ]);
    if (revisionsResult.error) throw new Error(revisionsResult.error.message);
    if (liftTemplatesResult.error) throw new Error(liftTemplatesResult.error.message);
    const revisions = revisionsResult.data ?? [];
    const currentRevision = revisions.find((revision) => ["active", "verified"].includes(String(revision.status).toLowerCase())) ?? revisions[0] ?? null;
    const sectionsResult = currentRevision
      ? await service.from("lift_tower_template_sections").select("*").eq("tower_template_revision_id", currentRevision.id).order("sequence_no")
      : { data: [], error: null };
    if (sectionsResult.error) throw new Error(sectionsResult.error.message);
    const sections = sectionsResult.data ?? [];
    return NextResponse.json({ template, revisions, currentRevision, sections, totalWeightKg: sections.filter((section) => section.active).reduce((total, section) => total + Number(section.quantity) * Number(section.unit_weight_kg), 0), liftTemplates: liftTemplatesResult.data ?? [] });
  } catch (error) {
    const result = liftApiError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const { templateId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const allowed = ["name", "structure_type", "tower_family", "extension_configuration", "description", "nominal_height_m", "metadata", "active"];
    const changes = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
    if (!Object.keys(changes).length) liftInvalid("Provide at least one editable Tower Template field.");
    if (typeof changes.name === "string" && !changes.name.trim()) liftInvalid("Tower Template name is required.");
    const { data, error } = await service.from("lift_tower_templates").update(changes).eq("id", templateId).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Tower Template was not found." }, { status: 404 });
    return NextResponse.json({ ok: true, template: data });
  } catch (error) {
    const result = liftApiError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
