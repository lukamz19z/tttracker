import Link from "next/link";
import PeopleClient from "@/components/people/people-client";
import { PeopleDocumentsHub } from "@/components/people/people-documents-hub";
import { requirePeopleContext } from "@/lib/people/server";
import { PageHeading } from "@/components/workspace/workspace-navigation";

export async function PeopleSettingsPage({
  organisation,
  section,
}: {
  organisation?: string;
  section: "overview" | "types" | "templates" | "documents";
}) {
  const context = await requirePeopleContext(organisation);
  const permissions = context.permissions ?? {};
  if (section === "overview" && !permissions["people.configure"] && !permissions["training.configure"]) return <p>You do not have permission to configure People.</p>;
  if (section !== "overview" && section !== "documents" && !permissions["people.configure"]) return <p>You do not have permission to configure this People area.</p>;
  if (section === "documents" && !permissions["people.configure"] && !permissions["training.configure"]) return <p>You do not have permission to configure People documents.</p>;

  if (section === "overview") return <section style={{ display: "grid", gap: 10 }}>
    <PageHeading title="People Settings" subtitle="Configure workforce, onboarding, Training and document defaults." />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 10 }}>
      {permissions["people.configure"] && <section className="tt-card" style={{ padding: 14 }}><strong>Employment / Engagement</strong><p>Manage the types used by workforce records.</p><Link href={`/workspace/settings/people/employment?organisation=${encodeURIComponent(context.organisation.organisationId)}`}>Configure employment types</Link></section>}
      {permissions["people.configure"] && <section className="tt-card" style={{ padding: 14 }}><strong>Onboarding Templates</strong><p>Open the template list to create or edit onboarding forms.</p><Link href={`/workspace/settings/people/onboarding/templates?organisation=${encodeURIComponent(context.organisation.organisationId)}`}>Manage templates</Link></section>}
      {(permissions["people.configure"] || permissions["training.configure"]) && <section className="tt-card" style={{ padding: 14 }}><strong>People Documents</strong><p>Review People document rules and storage destinations.</p><Link href={`/workspace/settings/people/documents?organisation=${encodeURIComponent(context.organisation.organisationId)}`}>Manage document settings</Link></section>}
      {permissions["training.configure"] && <section className="tt-card" style={{ padding: 14 }}><strong>Training</strong><p>Open the canonical Training Configuration workspace.</p><Link href={`/workspace/people/training/configuration?organisation=${encodeURIComponent(context.organisation.organisationId)}`}>Manage Training Configuration</Link></section>}
    </div>
  </section>;

  if (section === "documents") return <PeopleDocumentsHub organisation={context.organisation.organisationId} permissions={permissions} />;

  return <PeopleClient
    key={`${context.organisation.organisationId}:${section}`}
    organisationId={context.organisation.organisationId}
    organisationName={context.organisation.organisationName}
    permissions={permissions}
    settings
    settingsInWorkspace
    section={section}
    initialListState={{}}
  />;
}
