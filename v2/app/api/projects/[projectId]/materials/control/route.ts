import { NextRequest, NextResponse } from "next/server";

import { getMaterialsControl } from "@/lib/materials/server";
import { requireMaterialsContext, materialsErrorResponse } from "@/lib/materials/security";

type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const organisation = request.nextUrl.searchParams.get("organisation");
    const project = await requireMaterialsContext(projectId, organisation, "view");
    return NextResponse.json(await getMaterialsControl(project));
  } catch (error) {
    return materialsErrorResponse(error);
  }
}
