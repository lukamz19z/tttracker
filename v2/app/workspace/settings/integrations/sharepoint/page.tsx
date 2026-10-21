import { resolveOrganisationEntitlement } from "@/lib/integrations/entitlements";
import { integrationContext } from "@/lib/integrations/server";
import { PageHeading } from "@/components/workspace/workspace-navigation";
import { SharePointWorkspace } from "@/components/integrations/sharepoint-workspace";
export default async function Page({searchParams}:{searchParams:Promise<{organisation?:string;result?:string;context?:string}>}){
  const query=await searchParams;const {org,context}=await integrationContext(query.organisation??null,"sharepoint","view");
  const entitlement=await resolveOrganisationEntitlement(org,"sharepoint");
  if(!entitlement.enabled) return <div><PageHeading title="SharePoint"/><p>Not included in the current plan.</p><p>Previous connection history is retained. Provider operations are suspended; external files and records remain unchanged. Contact TTTracker to enable this integration.</p></div>;
  return <div><PageHeading title="SharePoint" subtitle="TTTracker only accesses SharePoint sites approved by your Microsoft administrator."/><SharePointWorkspace organisation={org} permissions={context.permissions??{}} manage={!!context.permissions?.["integrations.sharepoint.manage"]} result={query.result} documentContext={query.context}/></div>;
}
