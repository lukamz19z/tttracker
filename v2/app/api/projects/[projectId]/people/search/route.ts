import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireProjectContext } from "@/lib/projects/project-context";

type Context = {
  params: Promise<{ projectId: string }>;
};

export async function GET(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const url = new URL(request.url);
    const organisationId = url.searchParams.get("organisation");
    const q = (url.searchParams.get("q") ?? "").trim();

    const project = await requireProjectContext(
      projectId,
      organisationId,
    );

    const admin = createSupabaseAdmin();

    let query = admin
      .from("v2_people")
      .select("id, display_name, employee_number, email")
      .eq(
        "organisation_id",
        project.workspace.organisation.organisationId,
      )
      .eq("employment_status", "active")
      .order("display_name")
      .limit(30);

    if (q) {
      const escaped = q.replaceAll(",", " ");
      query = query.or(
        `display_name.ilike.%${escaped}%,employee_number.ilike.%${escaped}%,email.ilike.%${escaped}%`,
      );
    }

    const { data, error } = await query;

    if (error) throw new Error(error.message);

    return NextResponse.json({
      people: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Employee search failed.",
      },
      { status: 400 },
    );
  }
}
