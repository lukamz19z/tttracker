import { NextResponse } from "next/server";
import { LIFT_ACCESS, liftApiError, liftInvalid, requireLiftAccess } from "@/lib/lift-engineering/server";

type Context = { params: Promise<{ templateId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.view);
    const { templateId } = await context.params;
    const { data, error } = await service.from("lift_erection_templates").select("*").eq("tower_template_id", templateId).order("name");
    if (error) throw new Error(error.message);
    const templates = await Promise.all((data ?? []).map(async (item) => {
      const { data: revisions, error: revisionError } = await service.from("lift_erection_template_revisions").select("id,revision,status,tower_template_revision_id,created_at").eq("lift_template_id", item.id).order("created_at", { ascending: false });
      if (revisionError) throw new Error(revisionError.message);
      const current = (revisions ?? []).find((revision) => ["active", "verified"].includes(String(revision.status).toLowerCase())) ?? revisions?.[0] ?? null;
      const count = current ? await service.from("lift_erection_template_lifts").select("id", { count: "exact", head: true }).eq("lift_template_revision_id", current.id) : { count: 0, error: null };
      if (count.error) throw new Error(count.error.message);
      return { ...item, revisions: revisions ?? [], currentRevision: current, liftCount: count.count ?? 0 };
    }));
    return NextResponse.json({ liftTemplates: templates });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

export async function POST(request: Request, context: Context) {
  try {
    const { user, service } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const { templateId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const revisionLabel = typeof body.revision === "string" ? body.revision.trim() : "Rev A";
    const towerTemplateRevisionId = typeof body.towerTemplateRevisionId === "string" ? body.towerTemplateRevisionId : "";
    if (!name || !towerTemplateRevisionId) liftInvalid("Lift Template name and Tower Template revision are required.");
    const { data: towerRevision, error: towerRevisionError } = await service.from("lift_tower_template_revisions").select("id,template_id").eq("id", towerTemplateRevisionId).maybeSingle();
    if (towerRevisionError) throw new Error(towerRevisionError.message);
    if (!towerRevision || towerRevision.template_id !== templateId) liftInvalid("Select a revision belonging to this Tower Template.");
    const tags = Array.isArray(body.methodTags) ? body.methodTags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0).map((tag) => tag.trim()) : [];
    const suitability = body.craneSuitability && typeof body.craneSuitability === "object" && !Array.isArray(body.craneSuitability) ? body.craneSuitability : {};
    const { data: liftTemplate, error } = await service.from("lift_erection_templates").insert({ tower_template_id: templateId, name, description: typeof body.description === "string" ? body.description.trim() : null, method_tags: tags, crane_suitability: suitability, created_by: user.id }).select("*").single();
    if (error || !liftTemplate) throw new Error(error?.message || "Lift Template was not returned.");
    const { data: revision, error: revisionError } = await service.from("lift_erection_template_revisions").insert({ lift_template_id: liftTemplate.id, tower_template_revision_id: towerTemplateRevisionId, revision: revisionLabel, status: "draft", description: liftTemplate.description, method_tags: tags, crane_suitability: suitability, created_by: user.id }).select("*").single();
    if (revisionError || !revision) {
      await service.from("lift_erection_templates").delete().eq("id", liftTemplate.id);
      throw new Error(revisionError?.message || "Lift Template Draft revision could not be created.");
    }
    return NextResponse.json({ ok: true, liftTemplate, revision }, { status: 201 });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
