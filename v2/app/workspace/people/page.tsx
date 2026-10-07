import PeopleClient from "@/components/people/people-client";
import { requirePeopleContext } from "@/lib/people/server";
import { unstable_rethrow } from "next/navigation";
export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  let context;
  try {
    context = await requirePeopleContext(query.organisation);
  } catch (error) {
    unstable_rethrow(error);
    if (
      error instanceof Error &&
      [
        "PEOPLE_PERMISSION_DENIED",
        "WORKSPACE_ORGANISATION_ACCESS_DENIED",
        "NO_ACTIVE_ORGANISATION_MEMBERSHIP",
      ].includes(error.message)
    )
      return (
        <div>
          <h1>People</h1>
          <p>You do not have access to People in this organisation.</p>
        </div>
      );
    throw error;
  }
  return (
    <PeopleClient
      key={`${context.organisation.organisationId}:${query.section ?? "overview"}`}
      organisationId={context.organisation.organisationId}
      organisationName={context.organisation.organisationName}
      permissions={context.permissions ?? {}}
      initialListState={query}
      backTo={query.backTo}
      from={query.from}
      section={query.section}
    />
  );
}
