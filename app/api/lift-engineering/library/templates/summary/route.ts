import { NextResponse } from "next/server";
import { LIFT_ACCESS, liftApiError, requireLiftAccess } from "@/lib/lift-engineering/server";

export async function GET(request: Request) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.view);
    const [templates, revisions, sections, liftTemplates] = await Promise.all([
      service.from("lift_tower_templates").select("id,name,structure_type,tower_family,extension_configuration,description,nominal_height_m,metadata,active,created_at").order("name"),
      service.from("lift_tower_template_revisions").select("id,template_id,revision,status,notes,created_at").order("created_at", { ascending: false }),
      service.from("lift_tower_template_sections").select("id,tower_template_revision_id,name,quantity,unit_weight_kg,active"),
      service.from("lift_erection_templates").select("id,tower_template_id,name,active"),
    ]);
    for (const result of [templates, revisions, sections, liftTemplates]) if (result.error) throw new Error(result.error.message);
    const records = (templates.data ?? []).map((template) => {
      const ownRevisions = (revisions.data ?? []).filter((revision) => revision.template_id === template.id);
      const currentRevision = ownRevisions.find((revision) => ["active", "verified"].includes(String(revision.status).toLowerCase())) ?? ownRevisions[0] ?? null;
      const ownSections = currentRevision ? (sections.data ?? []).filter((section) => section.tower_template_revision_id === currentRevision.id && section.active) : [];
      return {
        ...template,
        revisions: ownRevisions,
        currentRevision,
        revisionCount: ownRevisions.length,
        sections: ownSections.length,
        totalWeightKg: ownSections.reduce((total, section) => total + Number(section.quantity) * Number(section.unit_weight_kg), 0),
        liftTemplateCount: (liftTemplates.data ?? []).filter((item) => item.tower_template_id === template.id && item.active).length,
      };
    });
    return NextResponse.json({ templates: records });
  } catch (error) {
    const result = liftApiError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
