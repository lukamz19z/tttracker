import PeopleClient from "@/components/people/people-client";
import { requirePeopleContext } from "@/lib/people/server";
export default async function TrainingConfiguration({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const context = await requirePeopleContext(query.organisation);
  if (!context.permissions?.["training.configure"])
    return <p>You do not have permission to configure Training.</p>;
  const section = [
    "overview",
    "training_categories",
    "training_options",
    "training_types",
    "document_rules",
    "file_naming",
  ].includes(query.section ?? "")
    ? query.section
    : "overview";
  return (
    <PeopleClient
      key={section}
      organisationId={context.organisation.organisationId}
      organisationName={context.organisation.organisationName}
      permissions={context.permissions ?? {}}
      settings
      from="training"
      section={section}
      initialListState={query}
    />
  );
}
