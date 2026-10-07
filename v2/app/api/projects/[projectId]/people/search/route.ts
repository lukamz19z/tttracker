import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { requireProjectContext } from "@/lib/projects/project-context";
import { peopleError, peopleRead } from "@/lib/people/server";
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const params = request.nextUrl.searchParams;
    const project = await requireProjectContext(
      projectId,
      params.get("organisation"),
    );
    if (project.access.kind !== "host")
      throw new Error("PEOPLE_PERMISSION_DENIED");
    const result = await peopleRead(project.dataOrganisationId, "people", {
      query: (params.get("q") ?? "").slice(0, 120),
      filter: { status: "active" },
    });
    return NextResponse.json({ people: result.rows });
  } catch (error) {
    unstable_rethrow(error);
    const result = peopleError(error);
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
}
