import { NextResponse } from "next/server";
import { LIFT_ACCESS, liftApiError, liftInvalid, requireLiftAccess } from "@/lib/lift-engineering/server";

type Context = { params: Promise<{ templateId: string }> };
const sectionFields = ["parent_section_id", "name", "section_code", "category", "description", "quantity", "unit_weight_kg", "height_m", "width_m", "length_m", "cg_x_m", "cg_y_m", "cg_z_m", "drawing_reference", "notes", "sequence_no", "active", "metadata"] as const;

function sectionValues(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) liftInvalid("Each section must be a structured object.");
  const body = value as Record<string, unknown>;
  const values = Object.fromEntries(Object.entries(body).filter(([key]) => sectionFields.includes(key as typeof sectionFields[number])));
  if (typeof values.name !== "string" || !values.name.trim()) liftInvalid("Section name is required.");
  values.name = (values.name as string).trim();
  for (const key of ["quantity", "unit_weight_kg"] as const) {
    const number = Number(values[key] ?? (key === "quantity" ? 1 : 0));
    if (!Number.isFinite(number) || (key === "quantity" ? number <= 0 : number < 0)) liftInvalid(`${key === "quantity" ? "Quantity must be greater than zero." : "Unit weight must be zero or greater."}`);
    values[key] = number;
  }
  for (const key of ["height_m", "width_m", "length_m", "cg_x_m", "cg_y_m", "cg_z_m"] as const) {
    if (values[key] === "" || values[key] === null) values[key] = null;
    else if (values[key] !== undefined) {
      const number = Number(values[key]);
      if (!Number.isFinite(number)) liftInvalid(`${key} must be a valid number.`);
      values[key] = number;
    }
  }
  return values;
}

async function getDraftRevision(service: Awaited<ReturnType<typeof requireLiftAccess>>["service"], templateId: string, revisionId: string) {
  const { data: revision, error } = await service.from("lift_tower_template_revisions").select("id,template_id,status").eq("id", revisionId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!revision || revision.template_id !== templateId) liftInvalid("Tower revision does not belong to this template.");
  if (revision.status !== "draft") liftInvalid("Physical sections can only be changed on a Draft tower revision.");
  return revision;
}

export async function GET(request: Request, context: Context) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.view);
    const { templateId } = await context.params;
    const revisionId = new URL(request.url).searchParams.get("revisionId");
    if (!revisionId) liftInvalid("Tower revision ID is required.");
    const { data: revision, error: revisionError } = await service.from("lift_tower_template_revisions").select("id,template_id").eq("id", revisionId).maybeSingle();
    if (revisionError) throw new Error(revisionError.message);
    if (!revision || revision.template_id !== templateId) liftInvalid("Tower revision does not belong to this template.");
    const { data, error } = await service.from("lift_tower_template_sections").select("*").eq("tower_template_revision_id", revisionId).order("sequence_no");
    if (error) throw new Error(error.message);
    return NextResponse.json({ sections: data ?? [] });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

export async function POST(request: Request, context: Context) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const { templateId } = await context.params;
    const body = await request.json() as { towerTemplateRevisionId?: unknown; sections?: unknown; section?: unknown };
    const revisionId = typeof body.towerTemplateRevisionId === "string" ? body.towerTemplateRevisionId : "";
    if (!revisionId) liftInvalid("Tower Template revision is required.");
    await getDraftRevision(service, templateId, revisionId);
    const entries = Array.isArray(body.sections) ? body.sections : [body.section];
    if (!entries.length || entries.some((entry) => entry === undefined)) liftInvalid("Provide one or more tower sections.");
    const parsed = entries.map(sectionValues);
    const parentIds = [...new Set(parsed.map((section) => typeof section.parent_section_id === "string" ? section.parent_section_id : "").filter(Boolean))];
    if (parentIds.length) {
      const { data: parents, error: parentError } = await service.from("lift_tower_template_sections").select("id").eq("tower_template_revision_id", revisionId).in("id", parentIds);
      if (parentError) throw new Error(parentError.message);
      if ((parents ?? []).length !== parentIds.length) liftInvalid("Parent sections must belong to the same physical Tower Template revision.");
    }
    const rows = parsed.map((section, index) => ({ ...section, tower_template_revision_id: revisionId, sequence_no: Number(section.sequence_no ?? index + 1) }));
    const { data, error } = await service.from("lift_tower_template_sections").insert(rows).select("*");
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, sections: data ?? [], inserted: data?.length ?? 0 }, { status: 201 });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const { templateId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) liftInvalid("Tower section ID is required.");
    const { data: current, error: currentError } = await service.from("lift_tower_template_sections").select("id,tower_template_revision_id").eq("id", id).maybeSingle();
    if (currentError) throw new Error(currentError.message);
    if (!current) return NextResponse.json({ error: "Tower section was not found." }, { status: 404 });
    await getDraftRevision(service, templateId, current.tower_template_revision_id);
    const values = sectionValues({ ...body, name: body.name ?? "" });
    if (typeof values.parent_section_id === "string" && values.parent_section_id) {
      if (values.parent_section_id === id) liftInvalid("A section cannot be its own parent.");
      const { data: parent, error: parentError } = await service.from("lift_tower_template_sections").select("id").eq("id", values.parent_section_id).eq("tower_template_revision_id", current.tower_template_revision_id).maybeSingle();
      if (parentError) throw new Error(parentError.message);
      if (!parent) liftInvalid("Parent section must belong to the same physical Tower Template revision.");
    }
    const { data, error } = await service.from("lift_tower_template_sections").update(values).eq("id", id).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Tower section was not found." }, { status: 404 });
    return NextResponse.json({ ok: true, section: data });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const { templateId } = await context.params;
    const body = await request.json() as { id?: unknown };
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) liftInvalid("Tower section ID is required.");
    const { data: current, error: currentError } = await service.from("lift_tower_template_sections").select("id,tower_template_revision_id").eq("id", id).maybeSingle();
    if (currentError) throw new Error(currentError.message);
    if (!current) return NextResponse.json({ error: "Tower section was not found." }, { status: 404 });
    await getDraftRevision(service, templateId, current.tower_template_revision_id);
    const { count: referenceCount, error: referenceError } = await service.from("lift_erection_template_lift_sections").select("id", { count: "exact", head: true }).eq("tower_template_section_id", id);
    if (referenceError) throw new Error(referenceError.message);
    if ((referenceCount ?? 0) > 0) return NextResponse.json({ error: "This section is referenced by a Lift Template. Deactivate it or revise the Lift Template before deleting it.", code: "section_in_use" }, { status: 409 });
    const { data, error } = await service.from("lift_tower_template_sections").delete().eq("id", id).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Tower section was not deleted." }, { status: 409 });
    return NextResponse.json({ ok: true, deletedId: data.id });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
