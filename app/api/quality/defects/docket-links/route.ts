import { NextResponse } from "next/server";

import {
  assertQualityProjectAccess,
  qualityApiError,
  requireQualityUser,
} from "@/lib/quality/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

async function validateRecords({
  service,
  projectId,
  towerId,
  docketId,
  defectId,
}: {
  service: Awaited<ReturnType<typeof requireQualityUser>>["service"];
  projectId: string;
  towerId: string;
  docketId: string;
  defectId: string;
}) {
  const [{ data: docket }, { data: defect }] = await Promise.all([
    service
      .from("tower_daily_dockets")
      .select("id,project_id,tower_id")
      .eq("id", docketId)
      .eq("project_id", projectId)
      .eq("tower_id", towerId)
      .maybeSingle(),
    service
      .from("tower_defects")
      .select("id,project_id,tower_id")
      .eq("id", defectId)
      .eq("project_id", projectId)
      .eq("tower_id", towerId)
      .maybeSingle(),
  ]);

  if (!docket) throw new Error("Daily Docket could not be found.");
  if (!defect) throw new Error("Defect could not be found.");
}

export async function POST(request: Request) {
  try {
    const { service, user, role } = await requireQualityUser(request);
    const body = (await request.json()) as {
      projectId?: string;
      towerId?: string;
      docketId?: string;
      defectId?: string;
      linkType?: "raised" | "referenced";
    };

    const projectId = clean(body.projectId);
    const towerId = clean(body.towerId);
    const docketId = clean(body.docketId);
    const defectId = clean(body.defectId);

    if (!projectId || !towerId || !docketId || !defectId) {
      return NextResponse.json(
        {
          error:
            "Project, Tower, Daily Docket and Defect are required.",
        },
        { status: 400 },
      );
    }

    await assertQualityProjectAccess({
      service,
      userId: user.id,
      role,
      projectId,
    });

    await validateRecords({
      service,
      projectId,
      towerId,
      docketId,
      defectId,
    });

    const { data, error } = await service
      .from("tower_docket_defects")
      .upsert(
        {
          docket_id: docketId,
          project_id: projectId,
          tower_id: towerId,
          defect_id: defectId,
          link_type:
            body.linkType === "raised" ? "raised" : "referenced",
          created_by: user.id,
        },
        { onConflict: "docket_id,defect_id" },
      )
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ link: data });
  } catch (error) {
    const apiError = qualityApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { service, user, role } = await requireQualityUser(request);
    const body = (await request.json()) as {
      projectId?: string;
      towerId?: string;
      docketId?: string;
      defectId?: string;
    };

    const projectId = clean(body.projectId);
    const towerId = clean(body.towerId);
    const docketId = clean(body.docketId);
    const defectId = clean(body.defectId);

    if (!projectId || !towerId || !docketId || !defectId) {
      return NextResponse.json(
        {
          error:
            "Project, Tower, Daily Docket and Defect are required.",
        },
        { status: 400 },
      );
    }

    await assertQualityProjectAccess({
      service,
      userId: user.id,
      role,
      projectId,
    });

    const { error } = await service
      .from("tower_docket_defects")
      .delete()
      .eq("docket_id", docketId)
      .eq("project_id", projectId)
      .eq("tower_id", towerId)
      .eq("defect_id", defectId);

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (error) {
    const apiError = qualityApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
