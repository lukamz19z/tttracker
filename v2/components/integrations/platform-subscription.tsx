"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SubscriptionWorkspace } from "@/lib/platform/subscription";
import { integrationStatus } from "@/lib/integrations/presentation";
import { xeroFeatures } from "@/lib/integrations/xero-catalogue";
import { previewEnabled } from "@/lib/platform/subscription-preview";
import { ConfigurationSurface } from "@/components/people/configuration-surface";
import { formatPeopleDate } from "@/lib/people/dates";
import styles from "@/components/people/people.module.css";
export function PlatformSubscription({ data, canManage }: { data: SubscriptionWorkspace; canManage: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = useState<string | null>(null);
  const [editor, setEditor] = useState<string | null>(null);
  const [plan, setPlan] = useState(data.subscription?.plan_version_id ?? "");
  const [override, setOverride] = useState("default");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const current = data.subscription?.plan_version_id ?? null;
  const feature = data.features.find(f => f.id === editor);
  const differences = data.features.filter(f => previewEnabled(f,current,data.assignments,data.overrides) !== previewEnabled(f,plan,data.assignments,data.overrides));
  async function save() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/platform/organisations/${data.organisation.id}/subscription`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: editor === "plan" ? "plan" : "override", target: editor === "plan" ? plan : editor, override: editor === "plan" ? null : override }) });
      if (!response.ok) throw new Error("The change could not be saved. Retry or check your platform permissions.");
      setEditor(null); setNotice("Subscription settings saved."); router.refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to save."); } finally { setBusy(false); }
  }
  return <section className={`${styles.page} tt-card`} style={{ padding: 20, marginBottom: 20 }}>
    <h2>Subscription & Integrations</h2><p>Plan: <strong>{data.versions.find(v=>v.id===current)?.name ?? "None"}</strong></p>
    {canManage && <button type="button" onClick={()=>{setPlan(current ?? "");setEditor("plan");}}>Change Plan</button>}
    <p>Subscription availability and tenant user permissions are separate. Platform administration does not grant access to external files or payroll.</p>
    <table><thead><tr><th>Integration</th><th>Plan</th><th>Override</th><th>Effective</th><th>Platform / Organisation</th><th /></tr></thead><tbody>{data.features.filter(f=>['sharepoint','xero'].includes(f.feature_key)).map(f=>{
      const value=data.overrides.find(o=>o.feature_id===f.id);
      const connection=data.connections.find(c=>c.provider===f.feature_key);
      const effective=previewEnabled(f,current,data.assignments,data.overrides);
      return <tr key={f.id}><td>{f.name}</td><td>{previewEnabled(f,current,data.assignments,[]) ? "Included" : "Not included"}</td><td>{value ? value.enabled ? "Force Enabled" : "Force Disabled" : "Use Plan Default"}</td><td>{effective ? "Enabled" : "Disabled"}</td><td>Platform: {data.readiness[f.feature_key as 'sharepoint'|'xero'] ? "Ready" : "Platform Setup Required"}<br/>Organisation: {integrationStatus(connection?.status,true,connection?.error_category)}{!effective&&<small> - Operations suspended</small>}{connection?.entitlement_check_required&&<small> - Connection Check Required</small>}{connection?.last_checked_at && <small> — {formatPeopleDate(connection.last_checked_at,true)}</small>}</td><td>{canManage && <button type="button" onClick={()=>{setOverride(value ? value.enabled ? "enabled" : "disabled" : "default");setEditor(f.id);}}>Manage Entitlement</button>}<button type="button" className="tt-button-secondary" onClick={()=>setSetup(f.feature_key)}>View Setup Status</button></td></tr>;
    })}</tbody></table>
    {notice && <p role="status">{notice}</p>}
    {data.audit.map(a=><small key={a.id} style={{display:'block'}}>{a.action==='plan'?'Plan changed':'Entitlement override changed'} — {formatPeopleDate(a.occurred_at,true)}</small>)}
    {setup && <ConfigurationSurface title="Integration Setup Status" size="small" onClose={()=>setSetup(null)} footer={<button type="button" onClick={()=>setSetup(null)}>Close</button>}>
      <p>{setup==='sharepoint'?'SharePoint':'Xero'}</p><p>TTTracker Platform Readiness: {data.readiness[setup as 'sharepoint'|'xero']?'Ready':'Setup required'}</p><p>Organisation Connection: {data.connections.find(c=>c.provider===setup)?.status==='connected'?'Connected':'Not connected / setup required'}</p>
      <p>Microsoft/Xero organisation: {data.connections.find(c=>c.provider===setup)?.tenant_name??"Not available"}</p><p>Tenant reference: {data.connections.find(c=>c.provider===setup)?.tenant_id??"Not connected"}</p><p>Last health check: {formatPeopleDate(data.connections.find(c=>c.provider===setup)?.last_checked_at??null,true)}</p>
      {setup==='xero'&&<p>Enabled Features: {data.xeroFeatures?.map(key=>xeroFeatures[key as keyof typeof xeroFeatures]?.label??"Configured feature").join(", ")||"None"}</p>}
      <p>Health: {data.connections.find(c=>c.provider===setup)?.error_category?"Attention Required":"No reported issue"}</p>
      {setup==='sharepoint'&&data.sharepointSetup.sites?.map((site,index)=><p key={index}>SharePoint Site: {site.name} / {site.library??"Library not configured"}<br/>{site.url}</p>)}
      {setup==='sharepoint'&&<><p>Site configured: {data.sharepointSetup.siteConfigured?'Yes':'No'}</p><p>Site permission previously verified: {data.sharepointSetup.siteVerified?'Yes':'No'}</p><p>Library configured: {data.sharepointSetup.libraryConfigured?'Yes':'No'}</p></>}
      <p>Customer consent and tenant permissions are required. Platform authority does not grant access to provider records or credentials.</p>
    </ConfigurationSurface>}
    {editor && <ConfigurationSurface title={editor==='plan'?'Change Subscription Plan':feature?.name ?? 'Integration Entitlement'} size="medium" dirty={editor==='plan'?plan!==current:override!==(data.overrides.find(o=>o.feature_id===editor)?.enabled===true?'enabled':data.overrides.some(o=>o.feature_id===editor)?'disabled':'default')} busy={busy} onClose={()=>setEditor(null)} footer={<><button type="button" onClick={()=>setEditor(null)} disabled={busy}>Cancel</button><button type="button" className="tt-button-primary" onClick={save} disabled={busy || (editor==='plan' && (!plan || plan===current))}>{busy?'Saving…':editor==='plan'?'Change Plan':'Save Entitlement'}</button></>}>
      <p>Organisation: {data.organisation.name}</p>{notice && <p role="alert">{notice}</p>}
      {editor==='plan'?<><p>Current Plan: {data.versions.find(v=>v.id===current)?.name ?? 'None'}</p><label>New Plan<select value={plan} onChange={e=>setPlan(e.target.value)}><option value="">Select plan</option>{data.versions.map(v=><option key={v.id} value={v.id}>{v.name} — Version {v.version}</option>)}</select></label><h3>Entitlement Changes</h3>{differences.length ? differences.map(f=><p key={f.id}>{previewEnabled(f,plan,data.assignments,data.overrides)?'Added: ':'Removed: '}{f.name}</p>):<p>No effective entitlement changes.</p>}<p>Confirm this plan change. Removed integrations stop syncing. Existing external files/data and connection history will not be deleted. Restored integrations require a connection check.</p></>:<><p>Plan entitlement: {feature && previewEnabled(feature,current,data.assignments,[]) ? 'Included':'Not included'}</p><label>Override<select value={override} onChange={e=>setOverride(e.target.value)}><option value="default">Use Plan Default</option><option value="enabled">Force Enabled</option><option value="disabled">Force Disabled</option></select></label><p>Effective: {feature && (override==='enabled' || (override==='default' && previewEnabled(feature,current,data.assignments,[]))) && feature.lifecycle_status!=='disabled'?'Enabled':'Disabled'}</p><p>Disabling stops provider operations and retains connection history. Re-enabling requires a connection check. This does not grant tenant user permissions.</p></>}
    </ConfigurationSurface>}
  </section>;
}
