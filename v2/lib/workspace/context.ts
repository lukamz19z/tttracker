import "server-only";

import { redirect } from "next/navigation";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import type {
  WorkspaceContext,
  WorkspaceMembership,
  WorkspaceSection,
} from "@/lib/workspace/types";

function firstRelation<T>(
  value: T | T[] | null | undefined,
): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export async function requireWorkspaceContext(
  requestedOrganisationId?: string | null,
): Promise<WorkspaceContext> {
  const session = await createSupabaseServer();

  const { data: claimsData, error: claimsError } =
    await session.auth.getClaims();

  const userId =
    typeof claimsData?.claims?.sub === "string"
      ? claimsData.claims.sub
      : null;

  const email =
    typeof claimsData?.claims?.email === "string"
      ? claimsData.claims.email
      : null;

  if (claimsError || !userId || !email) {
    redirect("/login");
  }

  const admin = createSupabaseAdmin();

  const { data: membershipRows, error: membershipError } =
    await admin
      .from("organisation_users")
      .select(`
        organisation_id,
        organisations (
          id,
          code,
          name
        )
      `)
      .eq("user_id", userId)
      .eq("status", "active");

  if (membershipError) {
    throw new Error(
      `WORKSPACE_MEMBERSHIP_LOOKUP_FAILED: ${membershipError.message}`,
    );
  }

  const memberships: WorkspaceMembership[] =
    (membershipRows ?? [])
      .map((row) => {
        const organisation = firstRelation(
          row.organisations as
            | {
                id: string;
                code: string;
                name: string;
              }
            | Array<{
                id: string;
                code: string;
                name: string;
              }>
            | null,
        );

        if (!organisation) {
          return null;
        }

        return {
          organisationId: organisation.id,
          organisationCode: organisation.code,
          organisationName: organisation.name,
        };
      })
      .filter(
        (
          value,
        ): value is WorkspaceMembership =>
          Boolean(value),
      );

  if (memberships.length === 0) {
    throw new Error(
      "NO_ACTIVE_ORGANISATION_MEMBERSHIP",
    );
  }

  const organisation =
    memberships.find(
      (item) =>
        item.organisationId ===
        requestedOrganisationId,
    ) ?? memberships[0];

  const { data: setupState } = await admin
    .from("v2_organisation_setup_state")
    .select("status")
    .eq(
      "organisation_id",
      organisation.organisationId,
    )
    .maybeSingle();

  if (setupState?.status !== "completed") {
    redirect(
      `/setup?organisation=${encodeURIComponent(
        organisation.organisationId,
      )}`,
    );
  }

  const { data: moduleRows, error: moduleError } =
    await admin
      .from("organisation_modules")
      .select("module_key, enabled")
      .eq(
        "organisation_id",
        organisation.organisationId,
      )
      .eq("enabled", true);

  if (moduleError) {
    throw new Error(
      `WORKSPACE_MODULE_LOOKUP_FAILED: ${moduleError.message}`,
    );
  }

  const enabledModules = new Set(
    (moduleRows ?? []).map(
      (row) => row.module_key,
    ),
  );

  const [
    { data: definitions, error: definitionsError },
    { data: overrides, error: overridesError },
  ] = await Promise.all([
    admin
      .from("v2_section_definitions")
      .select(`
        section_key,
        label,
        route_segment,
        module_key,
        sort_order,
        implementation_status,
        default_enabled
      `)
      .eq("scope", "workspace")
      .neq("implementation_status", "disabled")
      .order("sort_order"),

    admin
      .from("v2_organisation_section_settings")
      .select(`
        section_key,
        enabled,
        label_override,
        sort_order_override
      `)
      .eq(
        "organisation_id",
        organisation.organisationId,
      ),
  ]);

  if (definitionsError || overridesError) {
    throw new Error(
      definitionsError?.message ??
        overridesError?.message ??
        "Could not resolve workspace navigation.",
    );
  }

  const overrideMap = new Map(
    (overrides ?? []).map((row) => [
      row.section_key,
      row,
    ]),
  );

  const sections: WorkspaceSection[] =
    (definitions ?? [])
      .filter((definition) => {
        const override = overrideMap.get(
          definition.section_key,
        );

        const enabled =
          override?.enabled ??
          definition.default_enabled;

        const moduleAllowed =
          !definition.module_key ||
          enabledModules.has(
            definition.module_key,
          );

        return (
          enabled &&
          moduleAllowed &&
          definition.implementation_status ===
            "ready"
        );
      })
      .map((definition) => {
        const override = overrideMap.get(
          definition.section_key,
        );

        return {
          key: definition.section_key,
          label:
            override?.label_override ??
            definition.label,
          routeSegment:
            definition.route_segment ?? "",
          moduleKey:
            definition.module_key,
          sortOrder:
            override?.sort_order_override ??
            definition.sort_order,
          implementationStatus:
            definition.implementation_status,
        } as WorkspaceSection;
      })
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder,
      );

  return {
    userId,
    email,
    organisation,
    memberships,
    enabledModules,
    sections,
  };
}
