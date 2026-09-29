import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProjectIdentifierConfig } from "@/lib/projects/types";

export async function getProjectIdentifierConfig(
  admin: SupabaseClient,
  organisationId: string,
): Promise<ProjectIdentifierConfig> {
  const { data, error } = await admin
    .from("v2_project_identifier_configs")
    .select(`
      label,
      mode,
      required,
      require_unique,
      prefix,
      separator,
      padding,
      next_number,
      validation_regex,
      help_text
    `)
    .eq("organisation_id", organisationId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return {
    label: data?.label ?? "Project number",
    mode:
      (data?.mode as
        | "manual"
        | "automatic"
        | "optional") ??
      "manual",
    required: data?.required ?? false,
    requireUnique:
      data?.require_unique ?? true,
    prefix: data?.prefix ?? null,
    separator: data?.separator ?? "-",
    padding: data?.padding ?? 3,
    nextNumber:
      Number(data?.next_number ?? 1),
    validationRegex:
      data?.validation_regex ?? null,
    helpText: data?.help_text ?? null,
  };
}

export async function resolveProjectNumber(
  admin: SupabaseClient,
  organisationId: string,
  suppliedValue: string | null,
) {
  const config =
    await getProjectIdentifierConfig(
      admin,
      organisationId,
    );

  let value =
    suppliedValue?.trim() || null;

  if (config.mode === "automatic") {
    const numberText =
      String(config.nextNumber).padStart(
        config.padding,
        "0",
      );

    value = config.prefix
      ? `${config.prefix}${config.separator}${numberText}`
      : numberText;
  }

  if (
    config.required &&
    !value
  ) {
    throw new Error(
      `${config.label} is required.`,
    );
  }

  if (
    value &&
    config.validationRegex
  ) {
    const expression = new RegExp(
      config.validationRegex,
    );

    if (!expression.test(value)) {
      throw new Error(
        `${config.label} does not match the organisation's configured format.`,
      );
    }
  }

  if (
    value &&
    config.requireUnique
  ) {
    const { count, error } = await admin
      .from("v2_projects")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq(
        "organisation_id",
        organisationId,
      )
      .eq("project_number", value);

    if (error) {
      throw new Error(error.message);
    }

    if ((count ?? 0) > 0) {
      throw new Error(
        `${config.label} is already in use.`,
      );
    }
  }

  return {
    value,
    config,
  };
}
