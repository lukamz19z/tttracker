import { integrationContext } from "@/lib/integrations/server";
import { BackLink } from "@/components/people/people-ui";
import { SharePointSettings } from "@/components/integrations/sharepoint-settings";
export default async function Page({searchParams}:{searchParams:Promise<{organisation?:string;result?:string}>}){
  const query=await searchParams;const {org,context}=await integrationContext(query.organisation??null,"sharepoint","view");
  return <div><BackLink href={`/workspace/settings/integrations?organisation=${org}`} label="Back to Integrations"/><h1>SharePoint</h1><p>TTTracker only accesses sites explicitly authorised for this organisation.</p><SharePointSettings organisation={org} manage={!!context.permissions?.["integrations.sharepoint.manage"]} result={query.result}/></div>;
}
