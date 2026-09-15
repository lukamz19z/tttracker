import { NextResponse } from "next/server";

import {
  canManageSitePrestarts,
  requireSitePrestartUser,
  sitePrestartApiError,
  SITE_PRESTART_DECLARATION,
} from "@/lib/site-prestarts/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { service, identity } = await requireSitePrestartUser(request);

    if (!canManageSitePrestarts(identity.role)) {
      throw new Error("MANAGE_FORBIDDEN");
    }

    const [projectsResult, employeesResult] = await Promise.all([
      service
        .from("projects")
        .select(
          "id,name,project_number,status,sharepoint_site_id,sharepoint_drive_id,sharepoint_folder_id",
        )
        .order("project_number"),
      service
        .from("employees")
        .select("id,payroll_id,full_name,role,crew_id,active")
        .eq("active", true)
        .order("full_name"),
    ]);

    if (projectsResult.error) throw new Error(projectsResult.error.message);
    if (employeesResult.error) throw new Error(employeesResult.error.message);

    return NextResponse.json({
      projects: projectsResult.data ?? [],
      employees: employeesResult.data ?? [],
      declaration: SITE_PRESTART_DECLARATION,
      identity,
    });
  } catch (error) {
    const apiError = sitePrestartApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
