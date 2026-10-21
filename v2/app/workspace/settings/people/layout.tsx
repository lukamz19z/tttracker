import { headers } from "next/headers";
import { requirePeopleContext } from "@/lib/people/server";
import PeopleSettingsNavigation from "@/components/people/people-settings-navigation";

export default async function PeopleSettingsLayout({ children }: { children: React.ReactNode }) {
  const organisation = (await headers()).get("x-tttracker-organisation-id") ?? undefined;
  const context = await requirePeopleContext(organisation);
  const permissions = context.permissions ?? {};
  const canConfigurePeople = permissions["people.configure"] === true;
  const canConfigureTraining = permissions["training.configure"] === true;
  if (!canConfigurePeople && !canConfigureTraining) return <p>You do not have permission to configure People.</p>;
  return <PeopleSettingsNavigation organisation={context.organisation.organisationId} canConfigurePeople={canConfigurePeople} canConfigureTraining={canConfigureTraining}>{children}</PeopleSettingsNavigation>;
}
