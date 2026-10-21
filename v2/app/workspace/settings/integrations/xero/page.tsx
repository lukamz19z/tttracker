import { resolveOrganisationEntitlement } from "@/lib/integrations/entitlements";
import {integrationContext} from "@/lib/integrations/server";
import {PageHeading} from "@/components/workspace/workspace-navigation";
import {XeroSettings} from "@/components/integrations/xero-settings";
export default async function Page({searchParams}:{searchParams:Promise<{organisation?:string;result?:string;person?:string;project?:string}>}){
  const query=await searchParams;const {org,context}=await integrationContext(query.organisation??null,"xero","view");
  const entitlement=await resolveOrganisationEntitlement(org,"xero");
  if(!entitlement.enabled) return <div><PageHeading title="Xero"/><p>Not included in the current plan.</p><p>Previous connection history is retained. Provider operations are suspended; external files and records remain unchanged. Contact TTTracker to enable this integration.</p></div>;
  return <div><PageHeading title="Xero" subtitle="Connect your Xero organisation for configured workforce, timesheet and commercial workflows."/><XeroSettings organisation={org} permissions={context.permissions??{}} result={query.result} initialPerson={query.person} initialProject={query.project}/></div>;
}
