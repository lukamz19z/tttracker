import { requireWorkspacePermission } from "@/lib/workspace/context";
import { IntegrationHub } from "@/components/integrations/integration-hub";
import { BackLink } from "@/components/people/people-ui";
export default async function Page({searchParams}:{searchParams:Promise<{organisation?:string}>}){
  const query=await searchParams;const context=await requireWorkspacePermission(query.organisation,"organisation.settings.view");const org=context.organisation.organisationId;
  return <div><BackLink href={`/workspace/settings?organisation=${org}`} label="Back to Settings"/><h1>Integrations</h1><IntegrationHub organisation={org} permissions={context.permissions??{}}/></div>;
}
