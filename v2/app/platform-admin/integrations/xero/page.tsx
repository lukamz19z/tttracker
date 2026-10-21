import { BackLink } from "@/components/people/people-ui";
import { requirePlatformPage } from "@/lib/platform/server";
import { platformIntegrationWorkspace } from "@/lib/platform/integrations";
import { PlatformIntegrations } from "@/components/integrations/platform-integrations";
export default async function Page() {
 const actor = await requirePlatformPage();
 const data = await platformIntegrationWorkspace();
 return <main><BackLink href="/platform-admin/integrations" label="Back to Platform Integrations"/><h1>Xero Platform Setup</h1><p>Configure the external applications TTTracker uses to connect customer organisations.</p><PlatformIntegrations data={data} provider="xero" canCheck={["owner","admin"].includes(actor.role)}/></main>;
}
