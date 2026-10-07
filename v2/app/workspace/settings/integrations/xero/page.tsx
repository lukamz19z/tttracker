import {integrationContext} from "@/lib/integrations/server";
import {BackLink} from "@/components/people/people-ui";
import {XeroSettings} from "@/components/integrations/xero-settings";
export default async function Page({searchParams}:{searchParams:Promise<{organisation?:string;result?:string}>}){
  const query=await searchParams;const {org,context}=await integrationContext(query.organisation??null,"xero","view");
  return <div><BackLink href={`/workspace/settings/integrations?organisation=${org}`} label="Back to Integrations"/><h1>Xero</h1><p>Connect your Xero organisation for configured workforce, timesheet and commercial workflows.</p><XeroSettings organisation={org} permissions={context.permissions??{}} result={query.result}/></div>;
}
