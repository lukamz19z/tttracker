import { NextRequest, NextResponse } from "next/server";

import { requireWorkspaceContext } from "@/lib/workspace/context";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const body =
      await request.json();

    const organisationId = String(
      body.organisationId ?? "",
    ).trim();

    const context =
      await requireWorkspaceContext(
        organisationId,
      );

    const mode = String(
      body.mode ?? "automatic",
    );

    if (
      ![
        "manual",
        "automatic",
        "optional",
      ].includes(mode)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid numbering mode.",
        },
        { status: 400 },
      );
    }

    const template = String(
      body.template ??
        "P-{CLIENT}-{YY}-{SEQ:3}",
    ).trim();

    const admin =
      createSupabaseAdmin();

    const { error } =
      await admin
        .from(
          "v2_project_identifier_configs",
        )
        .upsert(
          {
            organisation_id:
              context.organisation
                .organisationId,
            label:
              String(
                body.label ??
                  "Project number",
              ).trim() ||
              "Project number",
            mode,
            required:
              body.required !==
              false,
            require_unique:
              body.requireUnique !==
              false,
            template,
          },
          {
            onConflict:
              "organisation_id",
          },
        );

    if (error) {
      throw new Error(
        error.message,
      );
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save project numbering.",
      },
      { status: 400 },
    );
  }
}
