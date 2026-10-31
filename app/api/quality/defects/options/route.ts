import { NextResponse } from "next/server";
import { assertQualityProjectAccess, qualityApiError, requireQualityUser } from "@/lib/quality/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULTS = {
  workImpactOptions: ["No Immediate Impact", "May Delay Work", "Blocks Work"],
  affectedActivityOptions: ["Assembly", "Erection", "Revision", "Stringing", "Delivery", "Inspection", "Other"],
};
const clean = (value: unknown) => String(value ?? "").trim();
function options(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const result = [...new Set(value.map(clean).filter(Boolean))].slice(0, 50);
  return result.length ? result : fallback;
}

export async function GET(request: Request) {
  try {
    const projectId = clean(new URL(request.url).searchParams.get("projectId"));
    if (!projectId) return NextResponse.json({ error: "Project ID is required." }, { status: 400 });
    const { service, user, role } = await requireQualityUser(request);
    await assertQualityProjectAccess({ service, userId: user.id, role, projectId });
    const { data, error } = await service.from("project_defect_workflow_settings").select("work_impact_options,affected_activity_options").eq("project_id", projectId).maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json({
      workImpactOptions: options(data?.work_impact_options, DEFAULTS.workImpactOptions),
      affectedActivityOptions: options(data?.affected_activity_options, DEFAULTS.affectedActivityOptions),
    });
  } catch (error) {
    const apiError = qualityApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

export async function PUT(request: Request) {
  try {
    const { service, user, role } = await requireQualityUser(request);
    const body = await request.json() as { projectId?: string; workImpactOptions?: unknown; affectedActivityOptions?: unknown };
    const projectId = clean(body.projectId);
    if (!projectId) return NextResponse.json({ error: "Project ID is required." }, { status: 400 });
    await assertQualityProjectAccess({ service, userId: user.id, role, projectId });
    const payload = {
      project_id: projectId,
      work_impact_options: options(body.workImpactOptions, DEFAULTS.workImpactOptions),
      affected_activity_options: options(body.affectedActivityOptions, DEFAULTS.affectedActivityOptions),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };
    const { error } = await service.from("project_defect_workflow_settings").upsert(payload, { onConflict: "project_id" });
    if (error) throw new Error(error.message);
    return NextResponse.json(payload);
  } catch (error) {
    const apiError = qualityApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
