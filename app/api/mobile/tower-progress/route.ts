import { NextResponse } from "next/server";
import { requireMobileDocketUser, mobileDocketApiError, clean } from "@/lib/dockets/mobile-docket-server";
import { mobileProgressContext } from "@/lib/dockets/mobile-progress-context";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const projectId = clean(new URL(request.url).searchParams.get("projectId"));
    if (!projectId) return NextResponse.json({ error: "Project is required." }, { status: 400 });
    const { service } = await requireMobileDocketUser(request, projectId);
    const project = await service.from("projects").select("id").eq("id", projectId).maybeSingle();
    if (project.error) throw new Error(project.error.message);
    if (!project.data) return NextResponse.json({ error: "Project could not be found." }, { status: 404 });
    const { data, error } = await service.from("towers").select("id,extra_data").eq("project_id", projectId);
    if (error) throw new Error(error.message);
    const { resolved } = await mobileProgressContext(service, projectId, data || []);
    return NextResponse.json({ progress: Object.fromEntries(resolved) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const result = mobileDocketApiError(error);
    const status = [400, 401, 403, 404, 500].includes(result.status) ? result.status : 500;
    return NextResponse.json({ error: result.message }, { status });
  }
}
