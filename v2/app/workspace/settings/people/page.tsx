import { PeopleSettingsPage } from "@/components/people/people-settings-page";

export default async function PeopleSettingsOverview({ searchParams }: { searchParams: Promise<{ organisation?: string }> }) {
  const query = await searchParams;
  return <PeopleSettingsPage organisation={query.organisation} section="overview" />;
}
