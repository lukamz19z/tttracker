import { redirect } from "next/navigation";

export default async function LegacyPeopleSettings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const target = new URLSearchParams();
  if (query.organisation) target.set("organisation", query.organisation);
  if (query.section === "templates") redirect(`/workspace/settings/people/onboarding/templates?${target}`);
  if (query.section === "types") redirect(`/workspace/settings/people/employment?${target}`);
  if (query.section === "document_rules") redirect(`/workspace/settings/people/documents?${target}`);
  redirect(`/workspace/settings/people?${target}`);
}
