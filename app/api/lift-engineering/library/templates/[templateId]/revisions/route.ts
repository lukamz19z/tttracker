import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { LIFT_ACCESS, liftApiError, liftInvalid, requireLiftAccess } from "@/lib/lift-engineering/server";

type Context = { params: Promise<{ templateId: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const { templateId } = await context.params;
    const body = await request.json() as { revision?: unknown; sourceRevisionId?: unknown; notes?: unknown };
    const label = typeof body.revision === "string" ? body.revision.trim() : "";
    if (!label) liftInvalid("Tower revision label is required.");
    const { data: parent, error: parentError } = await service.from("lift_tower_templates").select("id").eq("id", templateId).maybeSingle();
    if (parentError) throw new Error(parentError.message);
    if (!parent) return NextResponse.json({ error: "Tower Template was not found." }, { status: 404 });
    const { data: conflict, error: conflictError } = await service.from("lift_tower_template_revisions").select("id").eq("template_id", templateId).eq("revision", label).maybeSingle();
    if (conflictError) throw new Error(conflictError.message);
    if (conflict) return NextResponse.json({ error: `Revision ${label} already exists for this Tower Template.`, code: "revision_conflict" }, { status: 409 });
    let sourceRevisionId: string | null = null;
    if (typeof body.sourceRevisionId === "string" && body.sourceRevisionId) {
      const { data: source, error: sourceError } = await service.from("lift_tower_template_revisions").select("id,template_id").eq("id", body.sourceRevisionId).maybeSingle();
      if (sourceError) throw new Error(sourceError.message);
      if (!source || source.template_id !== templateId) liftInvalid("Source revision must belong to this Tower Template.");
      sourceRevisionId = source.id;
    }
    const { data: revision, error } = await service.from("lift_tower_template_revisions").insert({ template_id: templateId, revision: label, status: "draft", notes: typeof body.notes === "string" ? body.notes : null, source_documents: [] }).select("*").single();
    if (error || !revision) throw new Error(error?.message || "Tower Template revision was not returned.");
    if (sourceRevisionId) {
      const { data: sourceSections, error: readError } = await service.from("lift_tower_template_sections").select("*").eq("tower_template_revision_id", sourceRevisionId);
      if (readError) { await service.from("lift_tower_template_revisions").delete().eq("id", revision.id); throw new Error(readError.message); }
      if (sourceSections?.length) {
        const idMap = new Map(sourceSections.map((section) => [section.id, randomUUID()]));
        const rows = sourceSections.map(({ id, ...section }) => ({ ...section, id: idMap.get(id), parent_section_id: section.parent_section_id ? idMap.get(section.parent_section_id) ?? null : null, tower_template_revision_id: revision.id }));
        const { error: copyError } = await service.from("lift_tower_template_sections").insert(rows);
        if (copyError) { await service.from("lift_tower_template_revisions").delete().eq("id", revision.id); throw new Error(copyError.message); }
      }
    }
    return NextResponse.json({ ok: true, revision }, { status: 201 });
  } catch (error) {
    const result = liftApiError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
