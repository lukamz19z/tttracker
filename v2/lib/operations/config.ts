import type { SupabaseClient } from "@supabase/supabase-js";

export type ConfiguredOption = {
  id: string;
  organisation_id: string | null;
  project_id: string | null;
  module_key: string;
  option_group: string;
  code: string;
  label: string;
  behavior: string;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
};

export type DailyDocketReviewSettings = {
  organisationId: string;
  projectId: string | null;
  internalReviewRequired: boolean;
  clientApprovalEnabled: boolean;
  requireSubmitterSignature: boolean;
  clientCanRequestChanges: boolean;
  publishAfterFinalApproval: boolean;
  clientContentKeys: string[];
};

export const DEFAULT_REVIEW_SETTINGS: Omit<
  DailyDocketReviewSettings,
  "organisationId" | "projectId"
> = {
  internalReviewRequired: true,
  clientApprovalEnabled: false,
  requireSubmitterSignature: true,
  clientCanRequestChanges: true,
  publishAfterFinalApproval: true,
  clientContentKeys: [],
};

function normaliseMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function normaliseOption(row: Record<string, unknown>): ConfiguredOption {
  return {
    id: String(row.id || ""),
    organisation_id: row.organisation_id ? String(row.organisation_id) : null,
    project_id: row.project_id ? String(row.project_id) : null,
    module_key: String(row.module_key || ""),
    option_group: String(row.option_group || ""),
    code: String(row.code || ""),
    label: String(row.label || row.code || ""),
    behavior: String(row.behavior || row.code || ""),
    is_active: row.is_active !== false,
    sort_order: Number(row.sort_order || 0),
    metadata: normaliseMetadata(row.metadata),
  };
}

/**
 * Precedence:
 *   1. platform/global default
 *   2. organisation override
 *   3. project override
 *
 * An inactive higher-precedence row hides the lower-precedence row with
 * the same code. That lets a project remove a platform option without
 * editing application code.
 */
export function resolveConfiguredOptions(
  rows: ConfiguredOption[],
  organisationId: string | null,
  projectId: string | null,
): ConfiguredOption[] {
  const relevant = rows.filter((row) => {
    if (!row.organisation_id && !row.project_id) return true;
    if (
      organisationId &&
      row.organisation_id === organisationId &&
      !row.project_id
    ) {
      return true;
    }
    return Boolean(projectId && row.project_id === projectId);
  });

  const precedence = (row: ConfiguredOption) => {
    if (projectId && row.project_id === projectId) return 3;
    if (
      organisationId &&
      row.organisation_id === organisationId &&
      !row.project_id
    ) {
      return 2;
    }
    return 1;
  };

  const byCode = new Map<string, ConfiguredOption>();

  [...relevant]
    .sort((a, b) => precedence(a) - precedence(b))
    .forEach((row) => byCode.set(row.code, row));

  return [...byCode.values()]
    .filter((row) => row.is_active)
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        a.label.localeCompare(b.label, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
    );
}

export async function loadConfiguredOptions(
  supabase: SupabaseClient,
  input: {
    organisationId: string | null;
    projectId: string | null;
    moduleKey: string;
    optionGroup: string;
  },
): Promise<ConfiguredOption[]> {
  const { data, error } = await supabase
    .from("v2_module_options")
    .select("*")
    .eq("module_key", input.moduleKey)
    .eq("option_group", input.optionGroup)
    .order("sort_order");

  if (error) {
    console.warn(
      `Could not load ${input.moduleKey}/${input.optionGroup} configuration`,
      error,
    );
    return [];
  }

  return resolveConfiguredOptions(
    ((data || []) as Record<string, unknown>[]).map(normaliseOption),
    input.organisationId,
    input.projectId,
  );
}

export async function loadDailyDocketReviewSettings(
  supabase: SupabaseClient,
  input: {
    organisationId: string;
    projectId: string | null;
  },
): Promise<DailyDocketReviewSettings> {
  const { data, error } = await supabase
    .from("v2_daily_docket_review_settings")
    .select("*")
    .eq("organisation_id", input.organisationId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.warn("Daily Docket review settings could not be loaded", error);
    return {
      organisationId: input.organisationId,
      projectId: input.projectId,
      ...DEFAULT_REVIEW_SETTINGS,
    };
  }

  const rows = (data || []) as Array<Record<string, unknown>>;
  const projectRow =
    input.projectId
      ? rows.find((row) => String(row.project_id || "") === input.projectId)
      : undefined;
  const organisationRow = rows.find((row) => !row.project_id);
  const row = projectRow || organisationRow;

  if (!row) {
    return {
      organisationId: input.organisationId,
      projectId: input.projectId,
      ...DEFAULT_REVIEW_SETTINGS,
    };
  }

  return {
    organisationId: input.organisationId,
    projectId: row.project_id ? String(row.project_id) : null,
    internalReviewRequired: row.internal_review_required !== false,
    clientApprovalEnabled: Boolean(row.client_approval_enabled),
    requireSubmitterSignature: row.require_submitter_signature !== false,
    clientCanRequestChanges: row.client_can_request_changes !== false,
    publishAfterFinalApproval: row.publish_after_final_approval !== false,
    clientContentKeys: Array.isArray(row.client_content_keys)
      ? row.client_content_keys.map(String)
      : [],
  };
}

export function optionValue(option: ConfiguredOption) {
  return option.behavior || option.code;
}
