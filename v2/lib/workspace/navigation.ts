import type { WorkspaceSection } from "./types";

const sectionPermissions: Record<string, string> = {
  workspace_projects: "projects.view",
  workspace_people: "people.view",
  workspace_assets: "assets.view",
  workspace_settings: "organisation.settings.view",
};

export function canShowWorkspaceSection(
  section: Pick<WorkspaceSection, "key" | "moduleKey">,
  modules: Set<string>,
  permissions: Record<string, boolean>,
) {
  const permission = sectionPermissions[section.key];
  const permissionAllowed =
    section.key === "workspace_people"
      ? Object.entries(permissions).some(
          ([key, allowed]) =>
            allowed &&
            (key.startsWith("people.") || key.startsWith("training.")),
        )
      : !permission || permissions[permission] === true;
  return (
    (!section.moduleKey || modules.has(section.moduleKey)) && permissionAllowed
  );
}

export function workspaceHref(organisationId: string, segment = "") {
  return `/workspace${segment ? `/${segment}` : ""}?organisation=${encodeURIComponent(organisationId)}`;
}
