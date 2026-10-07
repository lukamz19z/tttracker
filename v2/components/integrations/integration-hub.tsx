import Link from "next/link";
import { loadIntegration } from "@/lib/integrations/server";
import { formatPeopleDate } from "@/lib/people/dates";
import styles from "@/components/people/people.module.css";
export async function IntegrationHub({organisation,permissions}:{organisation:string;permissions:Record<string,boolean>}) {
  return <div className={styles.page} style={{display:"grid",gap:12}}>{await Promise.all((["sharepoint","xero"] as const).map(async provider=>{
    if(!permissions[`integrations.${provider}.view`])return null;
    let connection;try{connection=await loadIntegration(organisation,provider);}catch{}
    const name=provider==="sharepoint"?"SharePoint":"Xero";
    const labels:Record<string,string>={connected:"Connected",setup_required:"Setup Required",attention_required:"Attention Required",disconnected:"Not Connected",not_connected:"Not Connected"};
    return <section className="tt-card" key={provider} style={{padding:18,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
      <div><strong>{name}</strong><p style={{margin:"5px 0",color:"#94a3b8"}}>{provider==="sharepoint"?"Microsoft 365 document storage":"Accounting, payroll and commercial integration"}</p><span>{labels[connection?.status]??"Not Connected"}</span>{connection?.last_success_at&&<small> · Last checked {formatPeopleDate(connection.last_success_at,true)}</small>}</div>
      <Link className="tt-button-secondary" href={`/workspace/settings/integrations/${provider}?organisation=${organisation}`}>{connection?.status==="connected"?"Manage":`Connect ${name}`}</Link>
    </section>;
  }))}<p style={{color:"#94a3b8"}}>Integration access is controlled separately from People, private data and payroll permissions.</p></div>;
}
