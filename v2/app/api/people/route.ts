import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import {
  peopleError,
  peopleRead,
  requirePeopleContext,
} from "@/lib/people/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const context = await requirePeopleContext(params.get("organisation"));
    if (params.get("area") === "training_history") {
      const { data, error } = await (
        await createSupabaseServer()
      ).rpc("tttracker_v2_training_history", {
        p_org: context.organisation.organisationId,
        p_record: params.get("id"),
        p_page: Math.max(1, Number(params.get("page")) || 1),
      });
      if (error) throw new Error(error.message);
      return NextResponse.json(data, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (params.get("area") === "onboarding_template_choices") {
      const session = await createSupabaseServer();
      const { data, error } = await session.rpc(
        "tttracker_v2_onboarding_admin",
        {
          p_org: context.organisation.organisationId,
          p_action: "template_choices",
          p_query: (params.get("q") ?? "").slice(0, 120),
          p_page: Math.max(1, Number(params.get("page")) || 1),
        },
      );
      if (error) throw new Error(error.message);
      return NextResponse.json(data, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const result = await peopleRead(
      context.organisation.organisationId,
      params.get("area") ?? "people",
      {
        query: (params.get("q") ?? "").slice(0, 120),
        page: Math.max(1, Number(params.get("page")) || 1),
        personId: params.get("person") ?? undefined,
        filter: Object.fromEntries(
          [
            "status",
            "relationship_type_id",
            "training_type_id",
            "source_channel",
            "review_status",
            "category",
            "category_id",
            "option_id",
            "gaps",
            "date",
            "from_date",
            "to_date",
            "project_id",
            "crew_id",
            "evidence_group_id",
            "id",
            "detail_page",
          ].flatMap((key) =>
            params.has(key) ? [[key, params.get(key) ?? ""]] : [],
          ),
        ),
      },
    );
    return NextResponse.json(result);
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
      action?: string;
      id?: string;
      data?: Record<string, unknown>;
    } = await request.json();
    const context = await requirePeopleContext(body.organisation);
    const session = await createSupabaseServer();
    const { data, error } = await session.rpc("tttracker_v2_people_write", {
      p_organisation_id: context.organisation.organisationId,
      p_action: body.action,
      p_id: body.id ?? null,
      p_data: body.data ?? {},
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (error) {
    unstable_rethrow(error);
    const result = peopleError(error);
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
}
