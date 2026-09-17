import { NextResponse } from "next/server";

import {
  permittedSitePrestartProjectIds,
  requireSitePrestartUser,
  sitePrestartApiError,
  SITE_PRESTART_DECLARATION,
} from "@/lib/site-prestarts/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { service, identity } = await requireSitePrestartUser(request);
    const projectIds = await permittedSitePrestartProjectIds(
      service,
      identity.userId,
    );

    const [projectResult, employeeResult] = await Promise.all([
      projectIds.length
        ? service
            .from("projects")
            .select(
              "id,name,project_number,status,sharepoint_drive_id,sharepoint_folder_id",
            )
            .in("id", projectIds)
            .order("name")
        : Promise.resolve({ data: [], error: null }),
      service
        .from("employees")
        .select("id,payroll_id,full_name,role,crew_id,active")
        .eq("active", true)
        .order("full_name"),
    ]);

    if (projectResult.error) throw new Error(projectResult.error.message);
    if (employeeResult.error) throw new Error(employeeResult.error.message);

    return NextResponse.json({
      projects: projectResult.data ?? [],
      employees: employeeResult.data ?? [],
      declaration: SITE_PRESTART_DECLARATION,
    });
  } catch (error) {
    const apiError = sitePrestartApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
