import { NextResponse } from "next/server";
import { LIFT_ACCESS, liftApiError, requireLiftAccess } from "@/lib/lift-engineering/server";

type Context = { params: Promise<{ configurationId: string }> };
async function readAll<T>(readPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await readPage(from, from + 999);
    if (error) throw new Error(error.message);
    const page = data ?? []; rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

// This legacy path collides with the dynamic configuration detail segment
// (/configurations/{configurationId}). Keep its failure explicit and JSON
// instead of relying on Next's empty framework-generated 405 response.
export async function POST() {
  return NextResponse.json({ error: "Use POST /api/lift-engineering/library/configurations/{configurationId}/revisions to create a technical revision.", code: "use_configuration_revision_endpoint" }, { status: 405 });
}

export async function GET(request: Request, context: Context) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.view);
    const { configurationId } = await context.params;
    const { data: configuration, error: configurationError } = await service.from("lift_crane_configurations")
      .select("id,crane_profile_id,name,active,created_at")
      .eq("id", configurationId).maybeSingle();
    if (configurationError) throw new Error(configurationError.message);
    if (!configuration) return NextResponse.json({ error: "Crane configuration was not found." }, { status: 404 });
    const [profileResult, revisionsResult, profileChartsResult, chartOptions] = await Promise.all([
      service.from("lift_crane_profiles").select("id,name,manufacturer,model,active").eq("id", configuration.crane_profile_id).maybeSingle(),
      service.from("lift_crane_configuration_revisions").select("*").eq("configuration_id", configurationId).order("created_at", { ascending: false }),
      service.from("lift_load_charts").select("id", { count: "exact", head: true }).eq("crane_profile_id", configuration.crane_profile_id),
      readAll((from, to) => service.from("lift_load_charts").select("id,crane_profile_id,status,active,manufacturer_configuration").eq("crane_profile_id", configuration.crane_profile_id).in("status", ["Imported", "Verified"]).eq("active", true).range(from, to)),
    ]);
    if (profileResult.error) throw new Error(profileResult.error.message);
    if (revisionsResult.error) throw new Error(revisionsResult.error.message);
    if (profileChartsResult.error) throw new Error(profileChartsResult.error.message);
    const revisions = await Promise.all((revisionsResult.data ?? []).map(async (revision) => {
      const [studyUse, chartUse] = await Promise.all([
        service.from("lift_study_revisions").select("id", { count: "exact", head: true }).eq("configuration_revision_id", revision.id),
        service.from("lift_load_charts").select("id", { count: "exact", head: true }).eq("configuration_revision_id", revision.id),
      ]);
      if (studyUse.error) throw new Error(studyUse.error.message);
      if (chartUse.error) throw new Error(chartUse.error.message);
      return { ...revision, studyReferenceCount: studyUse.count ?? 0, chartReferenceCount: chartUse.count ?? 0 };
    }));
    const currentRevision = revisions.find((revision) => ["verified", "active", "current"].includes(String(revision.status).toLowerCase())) ?? revisions[0] ?? null;
    let matchingChartCount = 0;
    if (currentRevision) {
      const matching = await service.from("lift_load_charts").select("id", { count: "exact", head: true }).eq("configuration_revision_id", currentRevision.id);
      if (matching.error) throw new Error(matching.error.message);
      matchingChartCount = matching.count ?? 0;
    }
    return NextResponse.json({ configuration, profile: profileResult.data, revisions, currentRevision, matchingChartCount, profileChartCount: profileChartsResult.count ?? 0, chartOptions });
  } catch (error) {
    const result = liftApiError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
