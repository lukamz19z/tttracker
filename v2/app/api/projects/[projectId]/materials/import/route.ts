import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireProjectContext } from "@/lib/projects/project-context";

type Context = {
  params: Promise<{ projectId: string }>;
};

function clean(value: unknown) {
  const output = String(value ?? "").trim();
  return output || null;
}

function numberOrNull(value: unknown) {
  const cleaned = String(value ?? "")
    .trim()
    .replaceAll(",", "");

  if (!cleaned) return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const body = await request.json();

    const project = await requireProjectContext(
      projectId,
      String(body.organisationId ?? "") || null,
    );

    const rows = Array.isArray(body.rows) ? body.rows : [];
    const mapping =
      body.mapping && typeof body.mapping === "object"
        ? (body.mapping as Record<string, string>)
        : {};

    const admin = createSupabaseAdmin();

    const { data: towers } = await admin
      .from("v2_towers")
      .select("id, tower_identifier")
      .eq("project_id", projectId);

    const towerMap = new Map(
      (towers ?? []).map((tower) => [
        String(tower.tower_identifier).trim().toLowerCase(),
        tower.id,
      ]),
    );

    let imported = 0;
    const errors: Array<{ row: number; message: string }> = [];

    for (let index = 0; index < rows.length; index += 1) {
      const source =
        rows[index] && typeof rows[index] === "object"
          ? (rows[index] as Record<string, unknown>)
          : {};

      try {
        const itemReference = clean(source[mapping.item_reference]);
        if (!itemReference) {
          throw new Error("Item reference is required.");
        }

        const towerIdentifier = mapping.tower_identifier
          ? clean(source[mapping.tower_identifier])
          : null;

        const towerId = towerIdentifier
          ? towerMap.get(towerIdentifier.toLowerCase()) ?? null
          : null;

        if (towerIdentifier && !towerId) {
          throw new Error(`Tower ${towerIdentifier} was not found.`);
        }

        const payload = {
          organisation_id:
            project.workspace.organisation.organisationId,
          project_id: projectId,
          tower_id: towerId,
          material_kind:
            clean(source[mapping.material_kind]) ?? "member",
          item_reference: itemReference,
          description: mapping.description
            ? clean(source[mapping.description])
            : null,
          bundle_reference: mapping.bundle_reference
            ? clean(source[mapping.bundle_reference])
            : null,
          segment: mapping.segment
            ? clean(source[mapping.segment])
            : null,
          drawing_reference: mapping.drawing_reference
            ? clean(source[mapping.drawing_reference])
            : null,
          required_quantity: mapping.required_quantity
            ? numberOrNull(source[mapping.required_quantity])
            : null,
          received_quantity: mapping.received_quantity
            ? numberOrNull(source[mapping.received_quantity]) ?? 0
            : 0,
          unit: mapping.unit
            ? clean(source[mapping.unit]) ?? "ea"
            : "ea",
          metadata: {},
        };

        const { error } = await admin
          .from("v2_material_register")
          .insert(payload);

        if (error) throw new Error(error.message);

        imported += 1;
      } catch (error) {
        errors.push({
          row: index + 2,
          message:
            error instanceof Error
              ? error.message
              : "Unknown import error.",
        });
      }
    }

    return NextResponse.json({
      ok: errors.length === 0,
      imported,
      errorRows: errors.length,
      errors: errors.slice(0, 200),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Materials import failed.",
      },
      { status: 400 },
    );
  }
}
