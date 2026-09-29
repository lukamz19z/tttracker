import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireProjectContext } from "@/lib/projects/project-context";
import { getTowerImportFields } from "@/lib/towers/import-config";

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

function convert(
  value: unknown,
  type:
    | "text"
    | "number"
    | "integer"
    | "boolean",
) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return null;
  }

  if (type === "number") {
    const parsed = Number(
      String(value).replace(
        /,/g,
        "",
      ),
    );

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  if (type === "integer") {
    const parsed = Number(
      String(value).replace(
        /,/g,
        "",
      ),
    );

    return Number.isInteger(
      parsed,
    )
      ? parsed
      : null;
  }

  if (type === "boolean") {
    const normalized =
      String(value)
        .trim()
        .toLowerCase();

    return [
      "yes",
      "y",
      "true",
      "1",
    ].includes(normalized);
  }

  return String(value).trim();
}

export async function POST(
  request: NextRequest,
  routeContext: Context,
) {
  const { projectId } =
    await routeContext.params;

  try {
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

    const rows = Array.isArray(
      body.rows,
    )
      ? body.rows
      : [];

    const mapping =
      body.mapping &&
      typeof body.mapping ===
        "object"
        ? (body.mapping as Record<
            string,
            string
          >)
        : {};

    const duplicateMode = [
      "skip",
      "update",
      "error",
    ].includes(
      String(body.duplicateMode),
    )
      ? String(body.duplicateMode)
      : "skip";

    const fields =
      await getTowerImportFields(
        context.workspace.organisation
          .organisationId,
      );

    const fieldByKey =
      new Map(
        fields.map((field) => [
          field.fieldKey,
          field,
        ]),
      );

    const admin =
      createSupabaseAdmin();

    const { data: batch, error: batchError } =
      await admin
        .from(
          "v2_tower_import_batches",
        )
        .insert({
          organisation_id:
            context.workspace.organisation
              .organisationId,
          project_id:
            context.project.id,
          source_file_name:
            text(
              body.sourceFileName,
            ),
          source_headers:
            Array.isArray(
              body.headers,
            )
              ? body.headers
              : [],
          mapping,
          total_rows: rows.length,
          imported_by:
            context.workspace.userId,
          status: "processing",
        })
        .select("id")
        .single();

    if (
      batchError ||
      !batch
    ) {
      throw new Error(
        batchError?.message ??
          "Could not create import batch.",
      );
    }

    let imported = 0;
    let skipped = 0;
    let errorRows = 0;

    const errors: Array<{
      row: number;
      message: string;
    }> = [];

    for (
      let index = 0;
      index < rows.length;
      index += 1
    ) {
      const source =
        rows[index] &&
        typeof rows[index] ===
          "object"
          ? (rows[index] as Record<
              string,
              unknown
            >)
          : {};

      try {
        const core: Record<
          string,
          unknown
        > = {};

        const extraData: Record<
          string,
          unknown
        > = {};

        let towerTypeName:
          | string
          | null = null;

        for (
          const [
            fieldKey,
            header,
          ] of Object.entries(
            mapping,
          )
        ) {
          if (!header) continue;

          const field =
            fieldByKey.get(
              fieldKey,
            );

          if (!field) continue;

          const value = convert(
            source[header],
            field.dataType,
          );

          if (
            field.targetKind ===
            "ignore"
          ) {
            continue;
          }

          if (
            field.targetKind ===
            "extra_data"
          ) {
            if (
              value !== null
            ) {
              extraData[
                field.targetKey
              ] = value;
            }

            continue;
          }

          if (
            field.targetKey ===
            "tower_type"
          ) {
            towerTypeName =
              value === null
                ? null
                : String(value);

            continue;
          }

          core[
            field.targetKey
          ] = value;
        }

        const towerIdentifier =
          text(
            core.tower_identifier,
          );

        if (!towerIdentifier) {
          throw new Error(
            "Tower identifier is missing.",
          );
        }

        let towerTypeId:
          | string
          | null = null;

        if (towerTypeName) {
          const {
            data:
              existingTowerType,
          } = await admin
            .from(
              "v2_tower_types",
            )
            .select("id")
            .eq(
              "project_id",
              context.project.id,
            )
            .ilike(
              "name",
              towerTypeName,
            )
            .maybeSingle();

          if (existingTowerType) {
            towerTypeId =
              existingTowerType.id;
          } else {
            const {
              data:
                createdTowerType,
              error:
                towerTypeError,
            } = await admin
              .from(
                "v2_tower_types",
              )
              .insert({
                organisation_id:
                  context.workspace
                    .organisation
                    .organisationId,
                project_id:
                  context.project.id,
                name:
                  towerTypeName,
                type_code:
                  towerTypeName,
              })
              .select("id")
              .single();

            if (
              towerTypeError ||
              !createdTowerType
            ) {
              throw new Error(
                towerTypeError?.message ??
                  "Tower type could not be created.",
              );
            }

            towerTypeId =
              createdTowerType.id;
          }
        }

        const mappedHeaders = new Set(
          Object.values(mapping).filter(Boolean),
        );

        for (const [header, rawValue] of Object.entries(source)) {
          if (mappedHeaders.has(header)) continue;

          const value = text(rawValue);

          if (value !== null) {
            extraData[header] = value;
          }
        }

        const payload = {
          organisation_id:
            context.workspace
              .organisation
              .organisationId,
          project_id:
            context.project.id,
          tower_identifier:
            towerIdentifier,
          tower_type_id:
            towerTypeId,
          line:
            text(core.line),
          sequence_number:
            core.sequence_number ===
              null ||
            core.sequence_number ===
              undefined
              ? null
              : Number(
                  core.sequence_number,
                ),
          tower_weight_t:
            core.tower_weight_t ===
              null ||
            core.tower_weight_t ===
              undefined
              ? null
              : Number(
                  core.tower_weight_t,
                ),
          extra_data: extraData,
        };

        const {
          data: existing,
          error:
            existingError,
        } = await admin
          .from("v2_towers")
          .select("id")
          .eq(
            "project_id",
            context.project.id,
          )
          .eq(
            "tower_identifier",
            towerIdentifier,
          )
          .maybeSingle();

        if (existingError) {
          throw new Error(
            existingError.message,
          );
        }

        if (existing) {
          if (
            duplicateMode ===
            "skip"
          ) {
            skipped += 1;
            continue;
          }

          if (
            duplicateMode ===
            "error"
          ) {
            throw new Error(
              `Tower ${towerIdentifier} already exists.`,
            );
          }

          const { error } =
            await admin
              .from("v2_towers")
              .update(payload)
              .eq(
                "id",
                existing.id,
              );

          if (error) {
            throw new Error(
              error.message,
            );
          }

          imported += 1;
          continue;
        }

        const { error } =
          await admin
            .from("v2_towers")
            .insert(payload);

        if (error) {
          throw new Error(
            error.message,
          );
        }

        imported += 1;
      } catch (error) {
        errorRows += 1;

        errors.push({
          row: index + 2,
          message:
            error instanceof Error
              ? error.message
              : "Unknown import error.",
        });
      }
    }

    const finalStatus =
      errorRows > 0
        ? imported > 0
          ? "completed_with_errors"
          : "failed"
        : "completed";

    await admin
      .from(
        "v2_tower_import_batches",
      )
      .update({
        imported_rows:
          imported,
        skipped_rows:
          skipped,
        error_rows:
          errorRows,
        errors:
          errors.slice(
            0,
            250,
          ),
        status:
          finalStatus,
        completed_at:
          new Date().toISOString(),
      })
      .eq("id", batch.id);

    return NextResponse.json({
      ok:
        finalStatus !== "failed",
      batchId: batch.id,
      imported,
      skipped,
      errorRows,
      errors,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Tower import failed.",
      },
      { status: 400 },
    );
  }
}
