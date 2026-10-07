import "server-only";

import { cookies } from "next/headers";
import { canShowWorkspaceSection } from "./navigation";
import { isPlatformAdmin } from "@/lib/platform/server";
import { notFound, redirect } from "next/navigation";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import type {
  WorkspaceContext,
  WorkspaceMembership,
  WorkspaceSection,
} from "@/lib/workspace/types";

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export async function requireWorkspaceContext(
  requestedOrganisationId?: string | null,
  purpose: "workspace" | "personal" = "workspace",
): Promise<WorkspaceContext> {
  const session = await createSupabaseServer();

  const { data: claimsData, error: claimsError } =
    await session.auth.getClaims();

  const userId =
    typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;

  const email =
    typeof claimsData?.claims?.email === "string"
      ? claimsData.claims.email
      : null;

  if (claimsError || !userId || !email) {
    redirect("/login");
  }

  const admin = createSupabaseAdmin();

  const { data: membershipRows, error: membershipError } = await admin
    .from("organisation_users")
    .select(
      `
        organisation_id,
        organisations (
          id,
          code,
          name
        )
      `,
    )
    .eq("user_id", userId)
    .eq("status", "active");

  if (membershipError) {
    throw new Error(
      `WORKSPACE_MEMBERSHIP_LOOKUP_FAILED: ${membershipError.message}`,
    );
  }

  const memberships: WorkspaceMembership[] = (membershipRows ?? [])
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
    .filter((value): value is WorkspaceMembership => Boolean(value));

  if (memberships.length === 0) {
    throw new Error("NO_ACTIVE_ORGANISATION_MEMBERSHIP");
  }

  if (
    requestedOrganisationId &&
    !memberships.some((item) => item.organisationId === requestedOrganisationId)
  ) {
    throw new Error("WORKSPACE_ORGANISATION_ACCESS_DENIED");
  }

  const preferredOrganisationId =
    requestedOrganisationId ??
    (await cookies()).get("tttracker-workspace")?.value;
  const organisation =
    memberships.find(
      (item) => item.organisationId === preferredOrganisationId,
    ) ?? memberships[0];

  const { data: setupState, error: setupError } = await admin
    .from("v2_organisation_setup_state")
    .select("status")
    .eq("organisation_id", organisation.organisationId)
    .maybeSingle();

  if (setupError)
    throw new Error(`WORKSPACE_SETUP_LOOKUP_FAILED: ${setupError.message}`);
  if (purpose === "workspace" && setupState?.status !== "completed") {
    redirect(
      `/setup?organisation=${encodeURIComponent(organisation.organisationId)}`,
    );
  }

  const { data: access, error: accessError } = await session.rpc(
    "tttracker_v2_workspace_access",
    { p_organisation_id: organisation.organisationId },
  );
  if (accessError)
    throw new Error(`WORKSPACE_ACCESS_LOOKUP_FAILED: ${accessError.message}`);
  if (
    !access ||
    typeof access !== "object" ||
    !Array.isArray(access.modules) ||
    !access.permissions ||
    typeof access.permissions !== "object"
  ) {
    throw new Error("WORKSPACE_ACCESS_INVALID_RESPONSE");
  }
  const permissions: Record<string, boolean> = Object.fromEntries(
    Object.entries(access.permissions).map(([key, value]) => [
      key,
      value === true,
    ]),
  );
  const enabledModules = new Set<string>(
    access.modules.filter(
      (key: unknown): key is string => typeof key === "string",
    ),
  );

  const [
    { data: definitions, error: definitionsError },
    { data: overrides, error: overridesError },
  ] = await Promise.all([
    admin
      .from("v2_section_definitions")
      .select(
        `
        section_key,
        label,
        route_segment,
        module_key,
        sort_order,
        implementation_status,
        default_enabled
      `,
      )
      .eq("scope", "workspace")
      .neq("implementation_status", "disabled")
      .order("sort_order"),

    admin
      .from("v2_organisation_section_settings")
      .select(
        `
        section_key,
        enabled,
        label_override,
        sort_order_override
      `,
      )
      .eq("organisation_id", organisation.organisationId),
  ]);

  if (definitionsError || overridesError) {
    throw new Error(
      definitionsError?.message ??
        overridesError?.message ??
        "Could not resolve workspace navigation.",
    );
  }

  const overrideMap = new Map(
    (overrides ?? []).map((row) => [row.section_key, row]),
  );

  const sections: WorkspaceSection[] = (definitions ?? [])
    .filter((definition) => {
      const override = overrideMap.get(definition.section_key);

      const enabled = override?.enabled ?? definition.default_enabled;

      const moduleAllowed =
        !definition.module_key || enabledModules.has(definition.module_key);

      return (
        enabled &&
        moduleAllowed &&
        canShowWorkspaceSection(
          { key: definition.section_key, moduleKey: definition.module_key },
          enabledModules,
          permissions,
        ) &&
        definition.implementation_status === "ready"
      );
    })
    .map((definition) => {
      const override = overrideMap.get(definition.section_key);

      return {
        key: definition.section_key,
        label: override?.label_override ?? definition.label,
        routeSegment: definition.route_segment ?? "",
        moduleKey: definition.module_key,
        sortOrder: override?.sort_order_override ?? definition.sort_order,
        implementationStatus: definition.implementation_status,
      } as WorkspaceSection;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    contextKind: "organisation",
    permissions,
    platformAdmin: await isPlatformAdmin(userId),
    userId,
    email,
    organisation,
    memberships: await workspaceMembershipChoices(memberships),
    enabledModules,
    sections,
  };
}

// A party workspace is project-only: it never grants membership in the host organisation.
export async function requirePartyWorkspaceContext(
  access: import("@/lib/projects/access").ProjectAccess,
  party: import("@/lib/projects/access").ProjectAccess["parties"][number],
): Promise<WorkspaceContext> {
  const session = await createSupabaseServer();
  const { data, error } = await session.auth.getClaims();
  const userId = data?.claims?.sub;
  const email = data?.claims?.email;
  if (error || typeof userId !== "string" || typeof email !== "string")
    redirect("/login");
  const admin = createSupabaseAdmin();
  const { data: modules, error: moduleError } = await admin
    .from("organisation_modules")
    .select("module_key")
    .eq("organisation_id", access.hostOrganisationId)
    .eq("enabled", true);
  if (moduleError) throw new Error(moduleError.message);
  const organisation = {
    organisationId: party.organisationId ?? party.id,
    organisationName: party.name,
    organisationCode: "Project participant",
  };
  const { listAccessibleProjects } = await import("@/lib/projects/list");
  const projects = await listAccessibleProjects();
  const { data: ownRows, error: ownError } = await admin
    .from("organisation_users")
    .select("organisations(id,code,name)")
    .eq("user_id", userId)
    .eq("status", "active");
  if (ownError)
    throw new Error(`WORKSPACE_MEMBERSHIP_LOOKUP_FAILED: ${ownError.message}`);
  const ownMemberships = (ownRows ?? []).flatMap((row) => {
    const org = firstRelation(
      row.organisations as
        | { id: string; code: string; name: string }
        | Array<{ id: string; code: string; name: string }>
        | null,
    );
    return org
      ? [
          {
            organisationId: org.id,
            organisationName: org.name,
            organisationCode: org.code,
          },
        ]
      : [];
  });
  const participantMemberships = await workspaceMembershipChoices(
    [...ownMemberships, organisation],
    projects,
  );
  return {
    contextKind: "client",
    platformAdmin: await isPlatformAdmin(userId),
    permissions: {},
    userId,
    email,
    organisation,
    memberships: participantMemberships,
    enabledModules: new Set(
      (modules ?? []).map((row) => String(row.module_key)),
    ),
    sections: [
      {
        key: "workspace_home",
        label: "Home",
        routeSegment: "",
        moduleKey: null,
        sortOrder: 10,
        implementationStatus: "ready",
      },
      {
        key: "workspace_projects",
        label: "Projects",
        routeSegment: "projects",
        moduleKey: null,
        sortOrder: 20,
        implementationStatus: "ready",
      },
    ],
    projectOnly: true,
  };
}

export async function requireWorkspacePermission(
  organisationId: string | null | undefined,
  permission: string,
) {
  const context = await requireWorkspaceContext(organisationId);
  if (!context.permissions?.[permission])
    throw new Error("WORKSPACE_PERMISSION_DENIED");
  return context;
}

async function workspaceMembershipChoices(
  existing: WorkspaceMembership[],
  knownProjects?: import("@/lib/projects/list").AccessibleProject[],
) {
  const { listAccessibleProjects } = await import("@/lib/projects/list");
  const projects = knownProjects ?? (await listAccessibleProjects());
  const choices = new Map(existing.map((m) => [m.organisationId, m]));
  for (const project of projects)
    if (project.party && !choices.has(project.organisationId)) {
      choices.set(project.organisationId, {
        organisationId: project.organisationId,
        organisationName: project.participantName ?? "Project participant",
        organisationCode: "Client workspace",
      });
    }
  return [...choices.values()];
}

export async function requireWorkspaceSection(
  organisationId: string | null | undefined,
  sectionKey: string,
) {
  let context;
  try {
    context = await requireWorkspaceContext(organisationId);
  } catch (error) {
    if (
      error instanceof Error &&
      [
        "NO_ACTIVE_ORGANISATION_MEMBERSHIP",
        "WORKSPACE_ORGANISATION_ACCESS_DENIED",
      ].includes(error.message)
    )
      notFound();
    throw error;
  }
  if (!context.sections.some((section) => section.key === sectionKey))
    notFound();
  return context;
}
