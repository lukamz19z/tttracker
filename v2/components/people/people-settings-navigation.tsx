"use client";

import { usePathname } from "next/navigation";
import { ConfigurationLayout } from "@/components/workspace/workspace-navigation";
import type { NavigationItem } from "@/components/workspace/workspace-navigation";

export default function PeopleSettingsNavigation({
  children,
  organisation,
  canConfigurePeople,
  canConfigureTraining,
}: {
  children: React.ReactNode;
  organisation: string;
  canConfigurePeople: boolean;
  canConfigureTraining: boolean;
}) {
  const pathname = usePathname();
  const query = `organisation=${encodeURIComponent(organisation)}`;
  const overview = `/workspace/settings/people?${query}`;
  const items: Array<NavigationItem & { key: string }> = [
    { key: "overview", label: "Overview", href: overview },
    ...(canConfigurePeople ? [
      { key: "employment", label: "Employment / Engagement", href: `/workspace/settings/people/employment?${query}` },
      { key: "onboarding", label: "Onboarding Templates", href: `/workspace/settings/people/onboarding/templates?${query}` },
    ] : []),
    ...((canConfigurePeople || canConfigureTraining) ? [{ key: "documents", label: "Documents", href: `/workspace/settings/people/documents?${query}` }] : []),
    ...(canConfigureTraining ? [{ key: "training", label: "Training Configuration", href: `/workspace/people/training/configuration?${query}` }] : []),
  ];
  const activeKey = pathname.endsWith("/employment") ? "employment" : pathname.endsWith("/documents") ? "documents" : pathname.includes("/onboarding") ? "onboarding" : pathname === "/workspace/settings/people" ? "overview" : "";
  return <div style={{ display: "grid", gap: 10 }}>
    <ConfigurationLayout items={items} activeKey={activeKey} label="People settings sections">{children}</ConfigurationLayout>
  </div>;
}
