import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireProjectContext } from "@/lib/projects/project-context";

type Context = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const body = await request.json();

    const project = await requireProjectContext(
      projectId,
      String(body.organisationId ?? "") || null,
    );

    const optionGroup = String(body.optionGroup ?? "").trim();
    const options = Array.isArray(body.options) ? body.options : [];

    if (!optionGroup) {
      return NextResponse.json(
        { error: "Option group is required." },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdmin();

    for (const option of options) {
      const key = String(option.optionKey ?? "").trim();
      const label = String(option.label ?? "").trim();

      if (!key || !label) continue;

      const { error } = await admin
        .from("v2_project_option_definitions")
        .upsert(
          {
            organisation_id:
              project.workspace.organisation.organisationId,
            project_id: projectId,
            option_group: optionGroup,
            option_key: key,
            label,
            sort_order: Number(option.sortOrder ?? 100),
            is_active: option.isActive !== false,
            settings:
              option.settings &&
              typeof option.settings === "object"
                ? option.settings
                : {},
          },
          {
            onConflict: "project_id,option_group,option_key",
          },
        );

      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save project options.",
      },
      { status: 400 },
    );
  }
}
