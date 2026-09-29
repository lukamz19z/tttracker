import { NextRequest, NextResponse } from "next/server";

import { requireProjectContext } from "@/lib/projects/project-context";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type Context = {
  params: Promise<{
    projectId: string;
  }>;
};

function text(value: unknown) {
  const output = String(
    value ?? "",
  ).trim();

  return output || null;
}

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

    const context =
      await requireProjectContext(
        projectId,
        organisationId,
      );

    const towerIdentifier =
      text(
        body.towerIdentifier,
      );

    if (!towerIdentifier) {
      return NextResponse.json(
        {
          error:
            "Tower identifier is required.",
        },
        { status: 400 },
      );
    }

    const admin =
      createSupabaseAdmin();

    let towerTypeId =
      text(body.towerTypeId);

    const newTypeName =
      text(
        body.newTowerTypeName,
      );

    if (!towerTypeId && newTypeName) {
      const {
        data: created,
        error,
      } = await admin
        .from("v2_tower_types")
        .insert({
          organisation_id:
            context.workspace
              .organisation
              .organisationId,
          project_id:
            projectId,
          name: newTypeName,
          type_code:
            text(
              body.newTowerTypeCode,
            ),
        })
        .select("id")
        .single();

      if (error || !created) {
        throw new Error(
          error?.message ??
            "Could not create tower type.",
        );
      }

      towerTypeId = created.id;
    }

    const { data: tower, error } =
      await admin
        .from("v2_towers")
        .insert({
          organisation_id:
            context.workspace
              .organisation
              .organisationId,
          project_id:
            projectId,
          tower_identifier:
            towerIdentifier,
          tower_type_id:
            towerTypeId,
          line:
            text(body.line),
          sequence_number:
            body.sequenceNumber
              ? Number(
                  body.sequenceNumber,
                )
              : null,
          tower_weight_t:
            body.towerWeight
              ? Number(
                  body.towerWeight,
                )
              : null,
          status:
            "not_started",
        })
        .select("id")
        .single();

    if (error || !tower) {
      throw new Error(
        error?.message ??
          "Could not create tower.",
      );
    }

    return NextResponse.json(
      {
        ok: true,
        towerId: tower.id,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create tower.",
      },
      { status: 400 },
    );
  }
}
