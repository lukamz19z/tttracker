import "server-only";
import { createSupabaseServer } from "@/lib/supabase/server";
import { requireWorkspaceContext } from "@/lib/workspace/context";

export async function requirePeopleContext(organisation?: string | null) {
  const context = await requireWorkspaceContext(organisation);
  const permissions = context.permissions ?? {};
  if (
    !context.enabledModules.has("people") ||
    !Object.entries(permissions).some(
      ([key, allowed]) =>
        allowed && (key.startsWith("people.") || key.startsWith("training.")),
    )
  ) {
    throw new Error("PEOPLE_PERMISSION_DENIED");
  }
  return context;
}

export async function peopleRead(
  organisationId: string,
  area: string,
  options: {
    query?: string;
    page?: number;
    personId?: string;
    filter?: Record<string, string>;
  } = {},
) {
  const session = await createSupabaseServer();
  const { data, error } = await session.rpc("tttracker_v2_people_read", {
    p_organisation_id: organisationId,
    p_area: area,
    p_query: options.query ?? "",
    p_page: options.page ?? 1,
    p_person_id: options.personId ?? null,
    p_filter: options.filter ?? {},
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function getOperationalPerson(
  organisationId: string,
  personId: string,
) {
  return peopleRead(organisationId, "profile", { personId });
}

async function classifiedPerson(
  organisationId: string,
  personId: string,
  area: "private" | "confidential",
) {
  const session = await createSupabaseServer();
  const { data, error } = await session.rpc("tttracker_v2_people_classified", {
    p_organisation_id: organisationId,
    p_person_id: personId,
    p_area: area,
  });
  if (error) throw new Error(error.message);
  return data;
}
export const getPrivatePerson = (organisationId: string, personId: string) =>
  classifiedPerson(organisationId, personId, "private");
export const getConfidentialPerson = (
  organisationId: string,
  personId: string,
) => classifiedPerson(organisationId, personId, "confidential");

export function peopleError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const known = /^(PEOPLE_|TRAINING_|PRESTART_|ONBOARDING_)[A-Z_]+$/.test(message);
  const status =
    message.includes("PERMISSION_DENIED") ||
    message.includes("ORGANISATION_ACCESS_DENIED")
      ? 403
      : message.includes("NOT_FOUND")
        ? 404
        : known
          ? 422
          : 500;
  if (!known)
    console.error("People request failed", { code: "PEOPLE_REQUEST_FAILED" });
  return { status, error: known ? message : "PEOPLE_REQUEST_FAILED" };
}
