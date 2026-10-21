import { requireWorkspacePermission } from "@/lib/workspace/context";
import { IntegrationHub } from "@/components/integrations/integration-hub";
import { PageHeading } from "@/components/workspace/workspace-navigation";
export default async function Page({searchParams}:{searchParams:Promise<{organisation?:string}>}){
  const query=await searchParams;const context=await requireWorkspacePermission(query.organisation,"organisation.settings.view");const org=context.organisation.organisationId;
  return <div><PageHeading title="Integrations" subtitle="Connect the services your organisation uses with TTTracker."/><IntegrationHub organisation={org} permissions={context.permissions??{}}/></div>;
}
