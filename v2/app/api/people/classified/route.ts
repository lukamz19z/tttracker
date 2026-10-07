import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { peopleError, requirePeopleContext } from "@/lib/people/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const context = await requirePeopleContext(params.get("organisation"));
    const session = await createSupabaseServer();
    const { data, error } = await session.rpc(
      "tttracker_v2_people_classified",
      {
        p_organisation_id: context.organisation.organisationId,
        p_person_id: params.get("person"),
        p_area: params.get("area"),
      },
    );
    if (error) throw new Error(error.message);
    return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    unstable_rethrow(error);
    const result = peopleError(error);
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: {
      organisation?: string;
      person?: string;
      data?: Record<string, string>;
    } = await request.json();
    const context = await requirePeopleContext(body.organisation);
    const session = await createSupabaseServer();
    const { data, error } = await session.rpc(
      "tttracker_v2_people_classified",
      {
        p_organisation_id: context.organisation.organisationId,
        p_person_id: body.person,
        p_area: "private",
        p_data: body.data ?? {},
      },
    );
    if (error) throw new Error(error.message);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    unstable_rethrow(error);
    const result = peopleError(error);
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
}
