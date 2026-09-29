import "server-only";

import { redirect } from "next/navigation";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import type {
  OrganisationSetupStep,
  SetupFormSchema,
  SetupStatus,
  TenantSetupContext,
} from "@/lib/setup/types";

type MembershipRow = {
  organisation_id: string;
  organisations:
    | {
        id: string;
        code: string;
        name: string;
        legal_name: string | null;
        abn: string | null;
      }
    | Array<{
        id: string;
        code: string;
        name: string;
        legal_name: string | null;
        abn: string | null;
      }>
    | null;
};

function firstRelation<T>(
  value: T | T[] | null | undefined,
): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function normaliseSchema(value: unknown): SetupFormSchema {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray(
      (value as { fields?: unknown[] }).fields,
    )
  ) {
    return value as SetupFormSchema;
  }

  return {
    fields: [],
  };
}

function normaliseObject(
  value: unknown,
): Record<string, unknown> {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  return {};
}

export async function requireTenantSetupContext(
  requestedOrganisationId?: string | null,
): Promise<TenantSetupContext> {
  const sessionClient = await createSupabaseServer();

  const { data: claimsData, error: claimsError } =
    await sessionClient.auth.getClaims();

  const userId =
    typeof claimsData?.claims?.sub === "string"
      ? claimsData.claims.sub
      : null;

  if (claimsError || !userId) {
    redirect("/login");
  }

  const admin = createSupabaseAdmin();

  const {
    data: membershipsRaw,
    error: membershipsError,
  } = await admin
    .from("organisation_users")
    .select(`
      organisation_id,
      organisations (
        id,
        code,
        name,
        legal_name,
        abn
      )
    `)
    .eq("user_id", userId)
    .eq("status", "active");

  if (membershipsError) {
    throw new Error(
      `SETUP_MEMBERSHIP_LOOKUP_FAILED: ${membershipsError.message}`,
    );
  }

  const memberships = (membershipsRaw ?? [])
    .map((row) => {
      const typed = row as MembershipRow;

      const organisation = firstRelation(
        typed.organisations,
      );

      if (!organisation) {
        return null;
      }

      return {
        organisationId: organisation.id,
        organisationName: organisation.name,
        organisationCode: organisation.code,
        organisation,
      };
    })
    .filter(
      (
        item,
      ): item is NonNullable<typeof item> =>
        Boolean(item),
    );

  if (memberships.length === 0) {
    throw new Error(
      "NO_ACTIVE_ORGANISATION_MEMBERSHIP",
    );
  }

  const selected =
    memberships.find(
      (item) =>
        item.organisationId ===
        requestedOrganisationId,
    ) ?? memberships[0];

  const organisation = selected.organisation;

  const {
    data: moduleRows,
    error: modulesError,
  } = await admin
    .from("organisation_modules")
    .select(`
      module_key,
      enabled
    `)
    .eq(
      "organisation_id",
      organisation.id,
    )
    .eq("enabled", true);

  if (modulesError) {
    throw new Error(
      `SETUP_MODULE_LOOKUP_FAILED: ${modulesError.message}`,
    );
  }

  const enabledModules = new Set(
    (moduleRows ?? []).map(
      (row) => row.module_key,
    ),
  );

  const {
    data: definitions,
    error: definitionsError,
  } = await admin
    .from("v2_setup_step_definitions")
    .select(`
      step_key,
      name,
      description,
      module_key,
      handler_key,
      required_by_default,
      sort_order,
      form_schema,
      default_values
    `)
    .eq("is_active", true)
    .order("sort_order", {
      ascending: true,
    });

  if (definitionsError) {
    throw new Error(
      `SETUP_DEFINITION_LOOKUP_FAILED: ${definitionsError.message}`,
    );
  }

  const applicableDefinitions = (
    definitions ?? []
  ).filter(
    (definition) =>
      !definition.module_key ||
      enabledModules.has(
        definition.module_key,
      ),
  );

  const {
    data: existingSteps,
    error: existingStepsError,
  } = await admin
    .from("v2_organisation_setup_steps")
    .select(`
      step_key,
      status,
      is_required,
      values
    `)
    .eq(
      "organisation_id",
      organisation.id,
    );

  if (existingStepsError) {
    throw new Error(
      `SETUP_STEP_LOOKUP_FAILED: ${existingStepsError.message}`,
    );
  }

  const existingByKey = new Map(
    (existingSteps ?? []).map((step) => [
      step.step_key,
      step,
    ]),
  );

  const missingRows =
    applicableDefinitions
      .filter(
        (definition) =>
          !existingByKey.has(
            definition.step_key,
          ),
      )
      .map((definition) => ({
        organisation_id:
          organisation.id,

        step_key:
          definition.step_key,

        status:
          "not_started",

        is_required:
          definition.required_by_default,

        values:
          definition.default_values ?? {},
      }));

  if (missingRows.length > 0) {
    const { error: insertError } =
      await admin
        .from(
          "v2_organisation_setup_steps",
        )
        .insert(missingRows);

    if (insertError) {
      throw new Error(
        `SETUP_STEP_INITIALISE_FAILED: ${insertError.message}`,
      );
    }

    for (const row of missingRows) {
      existingByKey.set(
        row.step_key,
        row,
      );
    }
  }

  const steps: OrganisationSetupStep[] =
    applicableDefinitions.map(
      (definition) => {
        const state = existingByKey.get(
          definition.step_key,
        );

        const defaultValues =
          normaliseObject(
            definition.default_values,
          );

        const storedValues =
          normaliseObject(
            state?.values,
          );

        let resolvedValues: Record<
          string,
          unknown
        > = {
          ...defaultValues,
          ...storedValues,
        };

        /*
         * Company details already exist
         * because Platform Admin entered them
         * when creating the organisation.
         *
         * Tenant Setup should therefore
         * confirm/edit those values instead
         * of asking the customer to type
         * them again.
         */
        if (
          definition.handler_key ===
          "organisation_profile"
        ) {
          resolvedValues = {
            ...resolvedValues,

            name:
              storedValues.name ??
              organisation.name ??
              "",

            legal_name:
              storedValues.legal_name ??
              organisation.legal_name ??
              "",

            abn:
              storedValues.abn ??
              organisation.abn ??
              "",
          };
        }

        return {
          stepKey:
            definition.step_key,

          name:
            definition.name,

          description:
            definition.description,

          moduleKey:
            definition.module_key,

          handlerKey:
            definition.handler_key,

          requiredByDefault:
            definition.required_by_default,

          sortOrder:
            definition.sort_order,

          formSchema:
            normaliseSchema(
              definition.form_schema,
            ),

          defaultValues,

          status:
            (state?.status as OrganisationSetupStep["status"]) ??
            "not_started",

          isRequired:
            state?.is_required ??
            definition.required_by_default,

          values:
            resolvedValues,
        };
      },
    );

  const requiredSteps = steps.filter(
    (step) => step.isRequired,
  );

  const completedRequired =
    requiredSteps.filter(
      (step) =>
        step.status === "completed",
    ).length;

  const requiredComplete =
    requiredSteps.length ===
    completedRequired;

  const {
    data: existingState,
  } = await admin
    .from(
      "v2_organisation_setup_state",
    )
    .select(`
      status,
      current_step_key,
      started_at,
      completed_at
    `)
    .eq(
      "organisation_id",
      organisation.id,
    )
    .maybeSingle();

  const firstIncomplete =
    steps.find(
      (step) =>
        step.status !== "completed" &&
        step.status !== "skipped",
    ) ?? null;

  let status: SetupStatus =
    (existingState?.status as SetupStatus) ??
    "not_started";

  if (
    requiredComplete &&
    requiredSteps.length > 0
  ) {
    status = "completed";
  } else if (
    status === "completed" ||
    status === "not_started"
  ) {
    status = "in_progress";
  }

  const currentStepKey =
    requiredComplete
      ? null
      : existingState?.current_step_key &&
          steps.some(
            (step) =>
              step.stepKey ===
              existingState.current_step_key,
          )
        ? existingState.current_step_key
        : firstIncomplete?.stepKey ??
          null;

  await admin
    .from(
      "v2_organisation_setup_state",
    )
    .upsert(
      {
        organisation_id:
          organisation.id,

        status,

        current_step_key:
          currentStepKey,

        started_at:
          existingState?.started_at ??
          new Date().toISOString(),

        completed_at:
          status === "completed"
            ? existingState?.completed_at ??
              new Date().toISOString()
            : null,
      },
      {
        onConflict:
          "organisation_id",
      },
    );

  return {
    userId,

    organisation: {
      id:
        organisation.id,

      code:
        organisation.code,

      name:
        organisation.name,

      legalName:
        organisation.legal_name,

      abn:
        organisation.abn,
    },

    memberships:
      memberships.map(
        (membership) => ({
          organisationId:
            membership.organisationId,

          organisationName:
            membership.organisationName,

          organisationCode:
            membership.organisationCode,
        }),
      ),

    status,

    currentStepKey,

    steps,

    completedRequired,

    totalRequired:
      requiredSteps.length,
  };
}