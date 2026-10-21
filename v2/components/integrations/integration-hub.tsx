import Link from "next/link";
import { loadIntegration } from "@/lib/integrations/server";
import { formatPeopleDate } from "@/lib/people/dates";
import peopleStyles from "@/components/people/people.module.css";
import styles from "./integrations.module.css";
import { providerReadiness } from "@/lib/integrations/readiness";
import { integrationStatus } from "@/lib/integrations/presentation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { xeroFeatures } from "@/lib/integrations/xero-catalogue";
import { integrationProviders, canViewIntegrationCatalogue } from "@/lib/integrations/catalogue";
import { RetryIntegrationStatus } from "@/components/integrations/retry-status";
import { resolveOrganisationEntitlement } from "@/lib/integrations/entitlements";

export async function IntegrationHub({ organisation, permissions }: { organisation: string; permissions: Record<string, boolean> }) {
  if (!canViewIntegrationCatalogue(permissions)) return <p>You do not have permission to view integrations.</p>;
  const cards = await Promise.all(integrationProviders.map(async provider => {
    const view = permissions[`integrations.${provider.key}.view`] === true;
    const manage = view && permissions[`integrations.${provider.key}.manage`] === true;
    const header = <><div className={styles.header}><h2>{provider.name}</h2><span className={styles.icon} aria-hidden="true">{provider.icon}</span></div><p className={styles.description}>{provider.description}</p></>;
    try {
      const entitlement = await resolveOrganisationEntitlement(organisation, provider.key);
      const readiness = await providerReadiness(provider.key, true);
      // Catalogue visibility never authorises tenant provider queries.
      const connection = view ? await loadIntegration(organisation, provider.key) : null;
      const platformReady = readiness.configured && (provider.key !== "xero" || readiness.kmsReady === true);
      const admin = view ? createSupabaseAdmin() : null;
      const sites = provider.key === "sharepoint" && admin ? await admin.from("v2_sharepoint_sites").select("site_name,drive_name,verified_at,drive_id").eq("organisation_id", organisation).limit(3) : null;
      const locations = provider.key === "sharepoint" && admin ? await admin.from("v2_sharepoint_locations").select("name,drive_name,root_path",{count:"exact"}).eq("organisation_id",organisation).eq("is_active",true).limit(3) : null;
      const destinations = provider.key === "sharepoint" && admin ? await admin.from("v2_document_destinations").select("id", { count: "exact", head: true }).eq("organisation_id", organisation) : null;
      const settings = provider.key === "xero" && admin ? await admin.from("v2_xero_settings").select("features").eq("organisation_id", organisation).maybeSingle() : null;
      if (sites?.error || locations?.error || destinations?.error || settings?.error) throw new Error("INTEGRATION_STATUS_UNAVAILABLE");
      return <section className={styles.card} key={provider.key}>
        {header}
        <span className={styles.badge}>{!entitlement.enabled ? "Not Included in Current Plan" : !platformReady ? "Platform Setup Required" : !view ? "Connection Details Restricted" : connection?.entitlement_check_required ? "Connection Check Required" : integrationStatus(connection?.status, true, connection?.error_category)}</span>
        {!entitlement.enabled && <p className={styles.detail}>Contact TTTracker to enable this integration. Previous connection history is retained; external files and records remain unchanged.</p>}
        {!platformReady && <p className={styles.detail}>{!readiness.configured ? `Your organisation cannot connect yet because the TTTracker ${provider.key === "sharepoint" ? "Microsoft" : "Xero"} platform integration has not been configured by the platform operator.` : "Secure Xero credential storage is not ready in this environment."}</p>}
        {!view && <p className={styles.detail}>Provider connection details require additional integration access. Contact your organisation access manager.</p>}
        {view && <p className={styles.detail}>Organisation Connection: {connection?.status === "connected" ? "Connected" : connection?.tenant_id ? "Setup in progress" : "Not Connected"}</p>}
        {connection?.tenant_name && <p className={styles.detail}>{provider.key === "sharepoint" ? "Microsoft tenant" : "Xero organisation"}: {connection.tenant_name}</p>}
        {sites?.data?.map((site, index) => <p className={styles.detail} key={index}>{site.site_name}</p>)}
        {locations && <small>{locations.count ?? 0} SharePoint Locations</small>}
        {destinations && <small>{destinations.count ?? 0} destinations configured</small>}
        {settings?.data?.features?.map((key: string) => <small key={key}>{xeroFeatures[key as keyof typeof xeroFeatures]?.label ?? "Configured feature"}</small>)}
        {connection?.last_success_at && <small>Last checked: {formatPeopleDate(connection.last_success_at, true)}</small>}
        {connection?.last_sync_at && <small>Last sync: {formatPeopleDate(connection.last_sync_at, true)}</small>}
        <div className={styles.actions}>{!entitlement.enabled ? <span className={styles.description}>Unavailable under current subscription</span> : manage ? <Link className={platformReady && !connection?.tenant_id && connection?.status !== "connected" ? "tt-button-primary" : "tt-button-secondary"} href={`/workspace/settings/integrations/${provider.key}?organisation=${organisation}`}>{!platformReady ? "Setup Information" : connection?.status === "connected" ? "Manage" : provider.key === "sharepoint" && connection?.microsoft_tenant_verified_at ? !!locations?.count ? "Configure Destinations" : sites?.data?.some(s=>s.verified_at) ? "Select Document Library" : "Configure SharePoint Site" : provider.key === "xero" && connection?.status === "setup_required" ? "Choose Xero Organisation" : provider.key === "sharepoint" ? "Connect Microsoft 365" : "Connect Xero"}</Link> : <span className={styles.description}>Read-only</span>}</div>
      </section>;
    } catch {
      return <section className={styles.card} key={provider.key}>{header}<span className={styles.badge}>Status Unavailable</span><p className={styles.detail}>We could not check the integration configuration. Try again.</p><div className={styles.actions}><RetryIntegrationStatus /></div></section>;
    }
  }));
  return <div className={peopleStyles.page}><div className={styles.grid}>{cards}</div><p className={styles.description}>Integration access is controlled separately from People, private data and payroll permissions.</p></div>;
}
