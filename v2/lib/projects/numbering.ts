import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ProjectNumberConfig = {
  label: string;
  mode: "manual" | "automatic" | "optional";
  required: boolean;
  requireUnique: boolean;
  template: string;
  prefix: string | null;
  separator: string;
  padding: number;
  nextNumber: number;
};

export async function getProjectNumberConfig(
  admin: SupabaseClient,
  organisationId: string,
): Promise<ProjectNumberConfig> {
  const { data, error } = await admin
    .from("v2_project_identifier_configs")
    .select(`
      label,
      mode,
      required,
      require_unique,
      template,
      prefix,
      separator,
      padding,
      next_number
    `)
    .eq("organisation_id", organisationId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    label: data?.label ?? "Project number",
    mode:
      (data?.mode as
        | "manual"
        | "automatic"
        | "optional") ?? "manual",
    required: data?.required ?? false,
    requireUnique: data?.require_unique ?? true,
    template:
      data?.template ??
      "P-{CLIENT}-{YY}-{SEQ:3}",
    prefix: data?.prefix ?? null,
    separator: data?.separator ?? "-",
    padding: Number(data?.padding ?? 3),
    nextNumber: Number(data?.next_number ?? 1),
  };
}

function padSequence(
  value: number,
  padding: number,
) {
  return String(value).padStart(
    Math.max(1, Math.min(12, padding)),
    "0",
  );
}

export function renderProjectNumberTemplate(input: {
  template: string;
  clientCode?: string | null;
  year?: number | null;
  sequence?: number | null;
  prefix?: string | null;
  padding?: number;
}) {
  const year = input.year ?? new Date().getFullYear();
  const sequence = input.sequence ?? 1;
  const client = String(
    input.clientCode ?? "",
  )
    .trim()
    .toUpperCase();

  const padding = input.padding ?? 3;

  let output = input.template || "{SEQ:3}";

  output = output.replaceAll(
    "{CLIENT}",
    client,
  );

  output = output.replaceAll(
    "{YYYY}",
    String(year),
  );

  output = output.replaceAll(
    "{YY}",
    String(year).slice(-2),
  );

  output = output.replaceAll(
    "{PREFIX}",
    input.prefix ?? "",
  );

  output = output.replace(
    /\{SEQ:(\d+)\}/g,
    (_, width) =>
      padSequence(
        sequence,
        Number(width) || padding,
      ),
  );

  output = output.replaceAll(
    "{SEQ}",
    padSequence(sequence, padding),
  );

  return output
    .replace(/--+/g, "-")
    .replace(/__+/g, "_")
    .replace(/^-+|-+$/g, "")
    .trim();
}
