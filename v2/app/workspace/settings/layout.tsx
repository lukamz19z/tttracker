import { headers } from "next/headers";
import SettingsWorkspaceShell from "@/components/workspace/settings-workspace-shell";
import { requireWorkspacePermission } from "@/lib/workspace/context";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const organisationId = (await headers()).get("x-tttracker-organisation-id") ?? undefined;
  const context = await requireWorkspacePermission(organisationId, "organisation.settings.view");
  const sections = [
    { key: "organisation", label: "Organisation" },
    { key: "modules", label: "Modules & Subscription" },
    ...(context.permissions?.["organisation.users.view"] ? [{ key: "users", label: "Users & Access" }] : []),
    { key: "projects", label: "Project Defaults" },
    ...((context.permissions?.["people.configure"] || context.permissions?.["training.configure"]) && context.enabledModules.has("people") ? [{ key: "people", label: "People" }] : []),
    { key: "integrations", label: "Integrations" },
  ];
  return <SettingsWorkspaceShell organisationId={context.organisation.organisationId} sections={sections}>{children}</SettingsWorkspaceShell>;
}
