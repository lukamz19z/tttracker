import { NextRequest, NextResponse } from "next/server";

import { mobileApiError, requireMobileUser } from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProjectRow = {
  id: string;
  name: string;
  project_number: string | null;
  status: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const { service, identity } = await requireMobileUser(request);
    const body = (await request.json()) as { projectId?: unknown };
    const projectId = String(body.projectId ?? "").trim();
    if (!projectId) return NextResponse.json({ error: "Project ID is required." }, { status: 400 });
    if (!identity.employeeId) return NextResponse.json({ error: "No employee profile is linked to this login." }, { status: 409 });

    const [access, project] = await Promise.all([
      service.from("project_access").select("project_id").eq("user_id", identity.userId).eq("project_id", projectId).maybeSingle(),
      service.from("projects").select("id,name,project_number,status").eq("id", projectId).maybeSingle(),
    ]);
    if (access.error) throw new Error(`Project access could not be verified: ${access.error.message}`);
    if (project.error) throw new Error(`Selected project could not be loaded: ${project.error.message}`);
    if (!access.data || !project.data) {
      return NextResponse.json({ error: "You do not have access to that project." }, { status: 403 });
    }

    const updated = await service
      .from("employees")
      .update({ current_project_id: projectId })
      .eq("id", identity.employeeId)
      .eq("user_id", identity.userId)
      .select("current_project_id")
      .maybeSingle();
    if (updated.error) throw new Error(`Selected project could not be persisted: ${updated.error.message}`);
    if (!updated.data || updated.data.current_project_id !== projectId) {
      return NextResponse.json({ error: "The employee project setting was not updated." }, { status: 409 });
    }

    const row = project.data as ProjectRow;
    return NextResponse.json({
      persisted: true,
      project: { id: row.id, name: row.name, projectNumber: row.project_number, status: row.status },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const result = mobileApiError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
