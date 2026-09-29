import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeHeader } from "@/lib/towers/csv";

export type ImportField = {
  fieldKey: string;
  label: string;
  targetKind:
    | "core"
    | "extra_data"
    | "ignore";
  targetKey: string;
  aliases: string[];
  required: boolean;
  dataType:
    | "text"
    | "number"
    | "integer"
    | "boolean";
  sortOrder: number;
};

export async function getTowerImportFields(
  organisationId: string,
) {
  const admin = createSupabaseAdmin();

  const { data, error } =
    await admin
      .from(
        "v2_tower_import_field_definitions",
      )
      .select(`
        organisation_id,
        field_key,
        label,
        target_kind,
        target_key,
        aliases,
        required,
        data_type,
        sort_order
      `)
      .or(
        `organisation_id.is.null,organisation_id.eq.${organisationId}`,
      )
      .eq("is_active", true)
      .order("sort_order");

  if (error) {
    throw new Error(error.message);
  }

  const merged =
    new Map<string, ImportField>();

  for (const row of data ?? []) {
    const value: ImportField = {
      fieldKey: row.field_key,
      label: row.label,
      targetKind:
        row.target_kind as
          | "core"
          | "extra_data"
          | "ignore",
      targetKey: row.target_key,
      aliases: Array.isArray(
        row.aliases,
      )
        ? row.aliases.map(String)
        : [],
      required: row.required,
      dataType:
        row.data_type as
          | "text"
          | "number"
          | "integer"
          | "boolean",
      sortOrder:
        row.sort_order,
    };

    if (
      row.organisation_id ===
      organisationId
    ) {
      merged.set(
        row.field_key,
        value,
      );
    } else if (
      !merged.has(
        row.field_key,
      )
    ) {
      merged.set(
        row.field_key,
        value,
      );
    }
  }

  return Array.from(
    merged.values(),
  ).sort(
    (a, b) =>
      a.sortOrder -
      b.sortOrder,
  );
}

export function suggestMapping(
  headers: string[],
  fields: ImportField[],
) {
  const mapping: Record<
    string,
    string
  > = {};

  for (const field of fields) {
    const candidates = [
      field.label,
      field.fieldKey,
      field.targetKey,
      ...field.aliases,
    ].map(normalizeHeader);

    const match =
      headers.find((header) =>
        candidates.includes(
          normalizeHeader(header),
        ),
      );

    if (match) {
      mapping[field.fieldKey] =
        match;
    }
  }

  return mapping;
}
