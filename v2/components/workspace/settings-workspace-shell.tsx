"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Breadcrumbs, WorkspaceHeading, WorkspaceTabs } from "@/components/workspace/workspace-navigation";

export type SettingsSection = { key: string; label: string };

export default function SettingsWorkspaceShell({ children, organisationId, sections }: { children: React.ReactNode; organisationId: string; sections: SettingsSection[] }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const query = `organisation=${encodeURIComponent(organisationId)}`;
  const inIntegrations = pathname.startsWith("/workspace/settings/integrations");
  const inPeopleSettings = pathname.startsWith("/workspace/settings/people");
  const items = sections.map(section => ({
    label: section.label,
    href: section.key === "integrations" ? `/workspace/settings/integrations?${query}` : section.key === "people" ? `/workspace/settings/people?${query}` : `/workspace/settings?${query}&section=${section.key}`,
    active: section.key === "integrations" ? inIntegrations : section.key === "people" ? inPeopleSettings : pathname === "/workspace/settings" && (search.get("section") ?? "projects") === section.key,
  }));
  const crumbs = inPeopleSettings ? [
    { label: "Settings", href: `/workspace/settings?${query}` },
    { label: "People", href: `/workspace/settings/people?${query}`, active: pathname === "/workspace/settings/people" },
    ...(pathname.includes("/onboarding") ? [{ label: "Onboarding", href: `/workspace/settings/people/onboarding?${query}`, active: pathname.endsWith("/onboarding") }, ...(pathname.endsWith("/templates") ? [{ label: "Templates", href: `/workspace/settings/people/onboarding/templates?${query}`, active: true }] : [])] : pathname.endsWith("/employment") ? [{ label: "Employment / Engagement", href: pathname, active: true }] : pathname.endsWith("/documents") ? [{ label: "Documents", href: pathname, active: true }] : []),
  ] : inIntegrations ? [
    { label: "Settings", href: `/workspace/settings?${query}` },
    { label: "Integrations", href: `/workspace/settings/integrations?${query}`, active: pathname === "/workspace/settings/integrations" },
    ...(pathname.includes("/sharepoint") ? [{ label: "SharePoint", href: pathname, active: true }] : pathname.includes("/xero") ? [{ label: "Xero", href: pathname, active: true }] : []),
  ] : [];
  return <div style={{ display: "grid", gap: 12 }}>
    <WorkspaceHeading title="Settings" subtitle="Organisation configuration and connected services." />
    <WorkspaceTabs items={items} label="Settings navigation" />
    {crumbs.length > 0 && <Breadcrumbs items={crumbs} />}
    {children}
  </div>;
}
