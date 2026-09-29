import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";

type ApplySetupStepInput = {
  organisationId: string;
  handlerKey: string;
  values: Record<string, unknown>;
};

function asNullableString(
  value: unknown,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const result =
    String(value).trim();

  return result || null;
}

export async function applySetupStep(
  input: ApplySetupStepInput,
) {
  const admin =
    createSupabaseAdmin();

  switch (input.handlerKey) {
    case "organisation_profile": {
      /*
       * Pull the current organisation first.
       *
       * This lets TTTracker compare what
       * already exists against what the
       * tenant confirmed during setup.
       *
       * We only update fields that actually
       * changed.
       */
      const {
        data: existingOrganisation,
        error: lookupError,
      } = await admin
        .from("organisations")
        .select(`
          id,
          name,
          legal_name,
          abn
        `)
        .eq(
          "id",
          input.organisationId,
        )
        .maybeSingle();

      if (
        lookupError ||
        !existingOrganisation
      ) {
        throw new Error(
          lookupError?.message ??
            "Organisation could not be found.",
        );
      }

      const name =
        asNullableString(
          input.values.name,
        ) ??
        existingOrganisation.name;

      const legalName =
        asNullableString(
          input.values.legal_name,
        ) ??
        existingOrganisation.legal_name;

      const abn =
        asNullableString(
          input.values.abn,
        ) ??
        existingOrganisation.abn;

      if (!name) {
        throw new Error(
          "Trading name is required.",
        );
      }

      const changes: Record<
        string,
        unknown
      > = {};

      if (
        name !==
        existingOrganisation.name
      ) {
        changes.name = name;
      }

      if (
        legalName !==
        existingOrganisation.legal_name
      ) {
        changes.legal_name =
          legalName;
      }

      if (
        abn !==
        existingOrganisation.abn
      ) {
        changes.abn = abn;
      }

      /*
       * Nothing changed.
       *
       * The tenant simply confirmed the
       * information supplied during
       * organisation creation, so there is
       * no reason to issue another UPDATE.
       */
      if (
        Object.keys(changes).length ===
        0
      ) {
        return;
      }

      const { error } = await admin
        .from("organisations")
        .update(changes)
        .eq(
          "id",
          input.organisationId,
        );

      if (error) {
        throw new Error(
          `Could not update organisation profile: ${error.message}`,
        );
      }

      return;
    }

    case "settings_json":
      /*
       * Generic setup values remain stored
       * against:
       *
       * v2_organisation_setup_steps.values
       *
       * Module-specific handlers can be
       * added later without changing the
       * generic setup wizard.
       */
      return;

    default:
      throw new Error(
        `Unsupported setup handler: ${input.handlerKey}`,
      );
  }
}