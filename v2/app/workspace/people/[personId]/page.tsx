import PeopleClient from "@/components/people/people-client";
import {
  getOperationalPerson,
  requirePeopleContext,
} from "@/lib/people/server";
import { unstable_rethrow } from "next/navigation";
export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ personId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const { personId } = await params;
  let context;
  try {
    context = await requirePeopleContext(query.organisation);
    await getOperationalPerson(context.organisation.organisationId, personId);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof Error && /DENIED|NOT_FOUND/.test(error.message))
      return (
        <div>
          <h1>Person</h1>
          <p>This person is unavailable or you do not have access.</p>
        </div>
      );
    throw error;
  }
  return (
    <PeopleClient
      key={`${context.organisation.organisationId}:${personId}:${query.section ?? "profile"}`}
      organisationId={context.organisation.organisationId}
      organisationName={context.organisation.organisationName}
      permissions={context.permissions ?? {}}
      personId={personId}
      section={query.section ?? "profile"}
    />
  );
}
