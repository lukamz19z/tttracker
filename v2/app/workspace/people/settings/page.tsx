import PeopleClient from "@/components/people/people-client";
import { requirePeopleContext } from "@/lib/people/server";
export default async function PeopleSettings({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const context = await requirePeopleContext(query.organisation);
  if (
    !context.permissions?.["people.configure"] &&
    !context.permissions?.["training.configure"]
  )
    return <p>You do not have permission to configure People.</p>;
  return (
    <PeopleClient
      key={`${context.organisation.organisationId}:${query.section ?? "types"}`}
      organisationId={context.organisation.organisationId}
      organisationName={context.organisation.organisationName}
      permissions={context.permissions ?? {}}
      settings
      initialListState={query}
      backTo={query.backTo}
      from={query.from}
      section={query.section}
    />
  );
}
