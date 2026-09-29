import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import {
  getProjectNumberConfig,
  renderProjectNumberTemplate,
} from "@/lib/projects/numbering";

function text(value: unknown) {
  const output = String(value ?? "").trim();
  return output || null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const organisationId = text(
      body.organisationId,
    );

    if (!organisationId) {
      return NextResponse.json(
        { error: "Organisation is required." },
        { status: 400 },
      );
    }

    const context =
      await requireWorkspaceContext(
        organisationId,
      );

    const name = text(body.name);

    if (!name) {
      return NextResponse.json(
        { error: "Project name is required." },
        { status: 400 },
      );
    }

    const clientName = text(
      body.clientName,
    );

    const clientCode = text(
      body.clientCode,
    )?.toUpperCase() ?? null;

    const location = text(
      body.location,
    );

    const projectYear =
      Number(
        body.projectYear ??
          new Date().getFullYear(),
      );

    if (
      !Number.isInteger(projectYear) ||
      projectYear < 2000 ||
      projectYear > 2100
    ) {
      return NextResponse.json(
        {
          error:
            "Enter a valid project year.",
        },
        { status: 400 },
      );
    }

    const expectedTowerCount =
      body.expectedTowerCount === "" ||
      body.expectedTowerCount === null ||
      body.expectedTowerCount ===
        undefined
        ? null
        : Number(
            body.expectedTowerCount,
          );

    if (
      expectedTowerCount !== null &&
      (!Number.isInteger(
        expectedTowerCount,
      ) ||
        expectedTowerCount < 0)
    ) {
      return NextResponse.json(
        {
          error:
            "Expected towers must be a whole number.",
        },
        { status: 400 },
      );
    }

    const admin =
      createSupabaseAdmin();

    const numberConfig =
      await getProjectNumberConfig(
        admin,
        organisationId,
      );

    const sequence =
      numberConfig.nextNumber;

    let projectNumber =
      text(body.projectNumber);

    if (
      numberConfig.mode ===
      "automatic"
    ) {
      projectNumber =
        renderProjectNumberTemplate({
          template:
            numberConfig.template,
          clientCode,
          year: projectYear,
          sequence,
          prefix:
            numberConfig.prefix,
          padding:
            numberConfig.padding,
        });

      if (
        numberConfig.template.includes(
          "{CLIENT}",
        ) &&
        !clientCode
      ) {
        return NextResponse.json(
          {
            error:
              "Client code is required by this organisation's project-number format.",
          },
          { status: 400 },
        );
      }
    }

    if (
      numberConfig.required &&
      !projectNumber
    ) {
      return NextResponse.json(
        {
          error: `${numberConfig.label} is required.`,
        },
        { status: 400 },
      );
    }

    if (
      projectNumber &&
      numberConfig.requireUnique
    ) {
      const { count, error } =
        await admin
          .from("v2_projects")
          .select("*", {
            count: "exact",
            head: true,
          })
          .eq(
            "organisation_id",
            organisationId,
          )
          .eq(
            "project_number",
            projectNumber,
          );

      if (error) {
        throw new Error(
          error.message,
        );
      }

      if ((count ?? 0) > 0) {
        return NextResponse.json(
          {
            error: `${numberConfig.label} is already in use.`,
          },
          { status: 409 },
        );
      }
    }

    const code =
      projectNumber ||
      `PRJ-${Date.now()}`;

    const { data: project, error } =
      await admin
        .from("v2_projects")
        .insert({
          organisation_id:
            organisationId,
          code,
          project_number:
            projectNumber,
          name,
          client_name:
            clientName,
          client_code:
            clientCode,
          location,
          project_year:
            projectYear,
          expected_tower_count:
            expectedTowerCount,
          description:
            text(body.description),
          status:
            text(body.status) ??
            "active",
          project_type:
            text(body.projectType) ??
            "transmission",
          created_by:
            context.userId,
        })
        .select("id")
        .single();

    if (error || !project) {
      return NextResponse.json(
        {
          error:
            error?.message ??
            "Could not create project.",
        },
        { status: 400 },
      );
    }

    if (
      numberConfig.mode ===
      "automatic"
    ) {
      await admin
        .from(
          "v2_project_identifier_configs",
        )
        .update({
          next_number:
            sequence + 1,
        })
        .eq(
          "organisation_id",
          organisationId,
        );
    }

    return NextResponse.json(
      {
        success: true,
        projectId: project.id,
        projectNumber,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create project.",
      },
      { status: 400 },
    );
  }
}
