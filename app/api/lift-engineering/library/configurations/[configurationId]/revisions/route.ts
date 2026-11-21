import { NextResponse } from "next/server";
import { sameConfigurationDraftRevision } from "@/lib/lift-engineering/configuration-revision-identity";
import { LIFT_ACCESS, liftApiError, liftInvalid, requireLiftAccess } from "@/lib/lift-engineering/server";

type Context = { params: Promise<{ configurationId: string }> };
const fields = ["revision", "status", "data", "counterweight_t", "outrigger_state", "boom_configuration", "boom_length_m", "fly_jib", "wind_restriction", "source_document", "counterweight_cg_x_m", "counterweight_cg_y_m", "boom_mass_kg", "boom_cg_x_m", "boom_cg_y_m", "fly_jib_mass_kg", "fly_jib_cg_x_m", "fly_jib_cg_y_m"] as const;

function editable(body: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(body).filter(([key, value]) => fields.includes(key as typeof fields[number]) && value !== undefined));
}

export async function POST(request: Request, context: Context) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const { configurationId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const revision = typeof body.revision === "string" ? body.revision.trim() : "";
    if (!revision) liftInvalid("A technical revision label is required.");
    const { data: configuration, error: configurationError } = await service.from("lift_crane_configurations").select("id").eq("id", configurationId).maybeSingle();
    if (configurationError) throw new Error(configurationError.message);
    if (!configuration) return NextResponse.json({ error: "Crane configuration was not found.", code: "configuration_not_found" }, { status: 404 });

    const values = { ...editable(body), revision, status: "draft" };
    const { data: revisions, error: revisionsError } = await service.from("lift_crane_configuration_revisions").select("*").eq("configuration_id", configurationId);
    if (revisionsError) throw new Error(revisionsError.message);
    const duplicateDraft = (revisions ?? []).find((item) => sameConfigurationDraftRevision(item, values));
    if (duplicateDraft) return NextResponse.json({ ok: true, revision: duplicateDraft, existing: true });
    const labelConflict = (revisions ?? []).find((item) => item.revision === revision);
    if (labelConflict) return NextResponse.json({ error: `Revision ${revision} already exists with different technical data. Choose a new revision label.`, code: "revision_label_conflict" }, { status: 409 });

    const { data, error } = await service.from("lift_crane_configuration_revisions").insert({ ...values, configuration_id: configurationId }).select("*").single();
    if (error) {
      if (error.code === "23505") {
        const { data: racedRevision } = await service.from("lift_crane_configuration_revisions").select("*").eq("configuration_id", configurationId).eq("revision", revision).maybeSingle();
        if (racedRevision && sameConfigurationDraftRevision(racedRevision, values)) return NextResponse.json({ ok: true, revision: racedRevision, existing: true });
        return NextResponse.json({ error: `Revision ${revision} was created by another request. Refresh the revision list before trying again.`, code: "revision_conflict" }, { status: 409 });
      }
      throw new Error(error.message);
    }
    if (!data) throw new Error("Configuration revision was not returned after creation.");
    return NextResponse.json({ ok: true, revision: data, existing: false }, { status: 201 });
  } catch (error) {
    const result = liftApiError(error);
    return NextResponse.json({ error: result.message, code: "configuration_revision_create_failed" }, { status: result.status });
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const { configurationId } = await context.params;
    const body = await request.json() as { revisionId?: unknown };
    const revisionId = typeof body.revisionId === "string" ? body.revisionId.trim() : "";
    if (!revisionId) liftInvalid("Technical revision ID is required.");
    const { data: revision, error: revisionError } = await service.from("lift_crane_configuration_revisions")
      .select("id,configuration_id,revision,status").eq("id", revisionId).eq("configuration_id", configurationId).maybeSingle();
    if (revisionError) throw new Error(revisionError.message);
    if (!revision) return NextResponse.json({ error: "Configuration revision was not found.", code: "revision_not_found" }, { status: 404 });
    if (String(revision.status).toLowerCase() !== "draft") return NextResponse.json({ error: "Only Draft technical revisions can be deleted. Verified, Active and Superseded revisions are retained for engineering history.", code: "revision_not_draft" }, { status: 409 });

    const { data: revisions, error: listError } = await service.from("lift_crane_configuration_revisions").select("id").eq("configuration_id", configurationId);
    if (listError) throw new Error(listError.message);
    if ((revisions ?? []).length <= 1) return NextResponse.json({ error: "This is the configuration's only revision. Delete the unused configuration instead.", code: "last_configuration_revision" }, { status: 409 });

    const [studyUse, chartUse] = await Promise.all([
      service.from("lift_study_revisions").select("id", { count: "exact", head: true }).eq("configuration_revision_id", revisionId),
      service.from("lift_load_charts").select("id", { count: "exact", head: true }).eq("configuration_revision_id", revisionId),
    ]);
    if (studyUse.error) throw new Error(studyUse.error.message);
    if (chartUse.error) throw new Error(chartUse.error.message);
    if ((studyUse.count ?? 0) > 0) return NextResponse.json({ error: "This Draft revision is referenced by a Lift Study snapshot and cannot be deleted.", code: "revision_in_study" }, { status: 409 });
    if ((chartUse.count ?? 0) > 0) return NextResponse.json({ error: "This Draft revision is referenced by a load chart and cannot be deleted.", code: "revision_in_chart" }, { status: 409 });

    const { data, error } = await service.from("lift_crane_configuration_revisions").delete().eq("id", revisionId).eq("configuration_id", configurationId).eq("status", revision.status).select("id").maybeSingle();
    if (error) {
      if (error.code === "23503") return NextResponse.json({ error: "This revision gained a protected engineering reference and was not deleted.", code: "revision_referenced" }, { status: 409 });
      throw new Error(error.message);
    }
    if (!data) return NextResponse.json({ error: "The Draft revision changed before deletion. Refresh and try again.", code: "revision_changed" }, { status: 409 });
    return NextResponse.json({ ok: true, deletedRevisionId: data.id });
  } catch (error) {
    const result = liftApiError(error);
    return NextResponse.json({ error: result.message, code: "configuration_revision_delete_failed" }, { status: result.status });
  }
}
