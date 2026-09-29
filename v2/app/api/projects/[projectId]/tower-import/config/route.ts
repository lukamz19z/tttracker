import { NextRequest, NextResponse } from "next/server";

import { requireProjectContext } from "@/lib/projects/project-context";
import {
  getTowerImportFields,
  suggestMapping,
} from "@/lib/towers/import-config";

type Context = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function POST(
  request: NextRequest,
  routeContext: Context,
) {
  try {
    const { projectId } =
      await routeContext.params;

    const body =
      await request.json();

    const organisationId = String(
      body.organisationId ?? "",
    ).trim();

    const headers = Array.isArray(
      body.headers,
    )
      ? body.headers.map(String)
      : [];

    const context =
      await requireProjectContext(
        projectId,
        organisationId,
      );

    const fields =
      await getTowerImportFields(
        context.workspace.organisation
          .organisationId,
      );

    return NextResponse.json({
      fields,
      suggestedMapping:
        suggestMapping(
          headers,
          fields,
        ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load import configuration.",
      },
      { status: 400 },
    );
  }
}
