export const sharePointSteps = ["Tenant", "Site", "Library", "Destinations", "Access", "Test & Finish"] as const;
export type SharePointStep = typeof sharePointSteps[number];
export type WizardSite = { id: string; verified_at?: string | null; drive_id?: string | null; site_url?: string };
export type WizardConnection = { tenant_id?: string | null; microsoft_tenant_verified_at?: string | null; status?: string; setup_site_id?: string | null; error_category?: string | null };
export type WizardDestination = { site_id?: string; access_profile_id?: string; is_active?: boolean | string; filename_template?: string; context?: string };
export type WizardProfile = { id: string; native_mode?: string; read_capability?: string; manage_capability?: string; classification?: string };
export function sharePointGrantCommand(application: string | undefined, tenant: string | null | undefined, siteUrl: string) {
  const guid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if(!application || !tenant || !guid.test(application) || !guid.test(tenant))return null;
  try {
    const url=new URL(siteUrl);
    if(url.protocol!=="https:" || !/^[a-z0-9.-]+\.sharepoint\.com$/i.test(url.hostname) || url.port || url.username || url.password || url.search || url.hash)return null;
    const quote=(value:string)=>`'${value.replace(/'/g,"''")}'`;
    return `# Run separately by a Microsoft administrator using Microsoft Graph PowerShell.\n# Elevated bootstrap permission is not assigned to the TTTracker runtime app.\nConnect-MgGraph -TenantId ${quote(tenant)} -Scopes 'Sites.FullControl.All'\n$site = Get-MgSite -SiteId ${quote(url.hostname+":"+url.pathname)}\n$body = @{ roles = @('write'); grantedToIdentities = @(@{ application = @{ id = ${quote(application)}; displayName = 'TTTracker' } }) }\nNew-MgSitePermission -SiteId $site.Id -BodyParameter $body`;
  } catch {return null;}
}
export function sharePointWizard(data: { configured: boolean; connection: WizardConnection | null; sites: WizardSite[]; destinations: WizardDestination[]; profiles: WizardProfile[] }, requested: string = "Tenant", selectedSite?: string) {
  const tenant = !!(data.connection?.tenant_id && data.connection.microsoft_tenant_verified_at && data.connection.status !== "disconnected" && data.connection.error_category!=="INTEGRATION_RECONNECT_REQUIRED");
  const permissionLost = ["INTEGRATION_SITE_PERMISSION_REQUIRED","INTEGRATION_RESOURCE_NOT_FOUND"].includes(data.connection?.error_category??"");
  const verifiedSites = data.sites.filter(s=>!!s.verified_at && !(permissionLost && (!data.connection?.setup_site_id || s.id===data.connection.setup_site_id)));
  const selected = verifiedSites.find(s=>s.id === (selectedSite || data.connection?.setup_site_id)) ?? (verifiedSites.length === 1 ? verifiedSites[0] : undefined);
  const site = tenant && !!selected;
  const library = site && !!selected?.drive_id;
  const destinations = library ? data.destinations.filter(d=>d.site_id===selected?.id && (d.is_active===true || d.is_active==="true") && !!d.filename_template && !!d.context) : [];
  const access = destinations.length > 0 && destinations.every(d=>data.profiles.some(p=>p.id===d.access_profile_id && p.native_mode==="inherit" && !!p.read_capability && !!p.manage_capability && p.classification!=="confidential"));
  const available = [true,data.configured&&tenant,data.configured&&site,data.configured&&library,data.configured&&library&&destinations.length>0,data.configured&&library&&access];
  const complete = [tenant,site,library,destinations.length>0,access,data.connection?.status==="connected"].map(v=>data.configured&&v);
  const firstIncomplete = sharePointSteps.find((_,i)=>available[i]&&!complete[i]) ?? "Test & Finish";
  const requestedIndex = sharePointSteps.indexOf(requested as SharePointStep);
  const current = requestedIndex>=0 && available[requestedIndex] ? sharePointSteps[requestedIndex] : firstIncomplete;
  const reasons = ["Configure the TTTracker Microsoft integration first.","Connect Microsoft 365 to continue.","Verify SharePoint site permission to continue.","Select and save a document library to continue.","Save an active destination before reviewing access.","Save a destination with a valid inherited access profile to continue."];
  return { tenant, verifiedSites, selected, library, destinations, access, firstIncomplete, current, steps: sharePointSteps.map((key,i)=>({key,available:available[i],complete:complete[i],reason:reasons[i],state:!available[i]?"Locked":key===current?(!data.configured || (key==='Site' && data.connection?.error_category)?"Attention Required":"Current"):complete[i]?"Complete":"Available"})) };
}
