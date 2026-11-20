import { NextResponse } from "next/server";
import { LIFT_ACCESS, liftApiError, requireLiftAccess } from "@/lib/lift-engineering/server";

type Context = { params: Promise<{ profileId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { user, service } = await requireLiftAccess(request, LIFT_ACCESS.view);
    const { profileId } = await context.params;
    const [profileResult, revisionsResult, configurationsResult, accessResult] = await Promise.all([
      service.from("lift_crane_profiles").select("id,name,manufacturer,model,notes,active,created_at,updated_at").eq("id", profileId).maybeSingle(),
      service.from("lift_crane_profile_revisions").select("id,crane_profile_id,revision,status,source_document,technical_data,coordinate_convention,carrier_mass_kg,carrier_cg_x_m,carrier_cg_y_m,upperworks_mass_kg,upperworks_cg_x_m,upperworks_cg_y_m,boom_pivot_x_m,boom_pivot_y_m,counterweight_mass_kg,counterweight_cg_x_m,counterweight_cg_y_m,created_by,created_at").eq("crane_profile_id", profileId).order("created_at", { ascending: false }),
      service.from("lift_crane_configurations").select("id,name,active").eq("crane_profile_id", profileId),
      service.from("project_access").select("project_id").eq("user_id", user.id),
    ]);
    for (const result of [profileResult, revisionsResult, configurationsResult, accessResult]) if (result.error) throw new Error(result.error.message);
    if (!profileResult.data) return NextResponse.json({ error: "Crane Profile was not found." }, { status: 404 });
    const revisions = revisionsResult.data ?? [];
    const revisionIds = revisions.map((revision) => revision.id);
    const projectIds = (accessResult.data ?? []).map((row) => row.project_id);
    let usedBy = new Map<string, number>();
    if (revisionIds.length && projectIds.length) {
      const studies = await service.from("lift_studies").select("id").in("project_id", projectIds);
      if (studies.error) throw new Error(studies.error.message);
      const studyIds = (studies.data ?? []).map((study) => study.id);
      if (studyIds.length) {
        const references = await service.from("lift_study_revisions").select("crane_profile_revision_id").in("study_id", studyIds).in("crane_profile_revision_id", revisionIds);
        if (references.error) throw new Error(references.error.message);
        usedBy = new Map<string, number>();
        for (const row of references.data ?? []) {
          if (row.crane_profile_revision_id) usedBy.set(row.crane_profile_revision_id, (usedBy.get(row.crane_profile_revision_id) ?? 0) + 1);
        }
      }
    }
    const charts: Array<{ id: string; status: string; source_document: unknown }> = [];
    let chartConfigurationCount = 0;
    for (let from = 0; ; from += 1000) {
      const page = await service.from("lift_load_charts").select("id,status,source_document", { count: "exact" })
        .eq("crane_profile_id", profileId).range(from, from + 999);
      if (page.error) throw new Error(page.error.message);
      chartConfigurationCount = page.count ?? chartConfigurationCount;
      charts.push(...(page.data ?? []));
      if ((page.data ?? []).length < 1000) break;
    }
    const bookNames = new Set<string>();
    for (const chart of charts) {
      const source = chart.source_document && typeof chart.source_document === "object" ? chart.source_document as Record<string, unknown> : {};
      const documents = Array.isArray(source.documents) ? source.documents : [];
      for (const value of [...documents, source.fileName]) {
        const name = typeof value === "string" ? value : value && typeof value === "object" ? (value as Record<string, unknown>).fileName : null;
        if (typeof name === "string" && name.trim()) bookNames.add(name.trim().toLocaleLowerCase("en-AU"));
      }
    }
    const latestRevision = revisions.find((row) => ["verified", "active", "current"].includes(String(row.status).toLowerCase())) ?? revisions[0] ?? null;
    let componentCount = 0;
    if (latestRevision) {
      const componentResults = await Promise.all(["lift_crane_hooks", "lift_crane_ropes", "lift_crane_attachments", "lift_crane_outriggers"].map((table) =>
        service.from(table).select("id", { count: "exact", head: true }).eq("crane_profile_revision_id", latestRevision.id)));
      for (const result of componentResults) {
        if (result.error) throw new Error(result.error.message);
        componentCount += result.count ?? 0;
      }
    }
    return NextResponse.json({
      profile: profileResult.data,
      revisions: revisions.map((revision) => ({ ...revision, usedByCount: usedBy.get(revision.id) ?? 0 })),
      currentRevisionId: latestRevision?.id ?? null,
      componentCount,
      configurationCount: (configurationsResult.data ?? []).filter((item) => item.active !== false).length,
      chartBookCount: bookNames.size,
      chartConfigurationCount,
      importedChartCount: charts.filter((chart) => chart.status === "Imported").length,
      verifiedChartCount: charts.filter((chart) => chart.status === "Verified").length,
    });
  } catch (error) {
    const result = liftApiError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
