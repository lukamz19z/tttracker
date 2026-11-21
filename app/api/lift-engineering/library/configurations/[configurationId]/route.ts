import { NextResponse } from "next/server";
import { LIFT_ACCESS, liftApiError, requireLiftAccess } from "@/lib/lift-engineering/server";

type Context = { params: Promise<{ configurationId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.view);
    const { configurationId } = await context.params;
    const { data: configuration, error: configurationError } = await service.from("lift_crane_configurations")
      .select("id,crane_profile_id,name,active,created_at")
      .eq("id", configurationId).maybeSingle();
    if (configurationError) throw new Error(configurationError.message);
    if (!configuration) return NextResponse.json({ error: "Crane configuration was not found." }, { status: 404 });
    const [profileResult, revisionsResult, profileChartsResult] = await Promise.all([
      service.from("lift_crane_profiles").select("id,name,manufacturer,model,active").eq("id", configuration.crane_profile_id).maybeSingle(),
      service.from("lift_crane_configuration_revisions").select("*").eq("configuration_id", configurationId).order("created_at", { ascending: false }),
      service.from("lift_load_charts").select("id", { count: "exact", head: true }).eq("crane_profile_id", configuration.crane_profile_id),
    ]);
    if (profileResult.error) throw new Error(profileResult.error.message);
    if (revisionsResult.error) throw new Error(revisionsResult.error.message);
    if (profileChartsResult.error) throw new Error(profileChartsResult.error.message);
    const revisions = revisionsResult.data ?? [];
    const currentRevision = revisions.find((revision) => ["verified", "active", "current"].includes(String(revision.status).toLowerCase())) ?? revisions[0] ?? null;
    let matchingChartCount = 0;
    if (currentRevision) {
      const matching = await service.from("lift_load_charts").select("id", { count: "exact", head: true }).eq("configuration_revision_id", currentRevision.id);
      if (matching.error) throw new Error(matching.error.message);
      matchingChartCount = matching.count ?? 0;
    }
    return NextResponse.json({ configuration, profile: profileResult.data, revisions, currentRevision, matchingChartCount, profileChartCount: profileChartsResult.count ?? 0 });
  } catch (error) {
    const result = liftApiError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
