import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { providerReadiness } from "@/lib/integrations/readiness";
export async function subscriptionWorkspace(org: string) {
  const db = createSupabaseAdmin();
  const now = new Date().toISOString();
  const results = await Promise.all([
    db.from("organisations").select("id,name").eq("id", org).single(),
    db.from("v2_features").select("id,feature_key,name,lifecycle_status,feature_type"),
    db.from("v2_subscription_plan_versions").select("id,version,v2_subscription_plans(id,name,status)").eq("status", "active"),
    db.from("v2_subscription_plan_entitlements").select("plan_version_id,feature_id,enabled"),
    db.from("v2_organisation_subscriptions").select("id,plan_version_id,status").eq("organisation_id", org).in("status", ["active", "trial"]).lte("starts_at", now).or(`ends_at.is.null,ends_at.gt.${now}`).order("starts_at", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("v2_organisation_entitlement_overrides").select("feature_id,enabled").eq("organisation_id", org).lte("starts_at", now).or(`ends_at.is.null,ends_at.gt.${now}`),
    // Explicit control-plane metadata projections; never credentials or provider content.
    db.from("v2_integrations").select("provider,status,error_category,last_checked_at,entitlement_check_required,tenant_id,tenant_name").eq("organisation_id", org),
    db.from("v2_subscription_audit").select("id,action,occurred_at").eq("organisation_id", org).order("occurred_at", { ascending: false }).limit(8),
    db.from("v2_sharepoint_sites").select("verified_at,drive_id,site_name,site_url,drive_name").eq("organisation_id", org),
    db.from("v2_xero_settings").select("features").eq("organisation_id", org).maybeSingle(),
  ]);
  if (results.some(r => r.error)) throw new Error("SUBSCRIPTION_LOOKUP_FAILED");
  const [organisation, features, versions, assignments, subscription, overrides, connections, audit, sites, xero] = results;
  const configuredXeroFeatures: string[] = Array.isArray(xero.data?.features) ? xero.data.features.filter((key: unknown): key is string => typeof key === "string") : [];
  const readiness = await Promise.all([providerReadiness("sharepoint", true), providerReadiness("xero", true)]);
  return { organisation: organisation.data!, features: features.data ?? [], versions: (versions.data ?? []).filter(v => { const p = Array.isArray(v.v2_subscription_plans) ? v.v2_subscription_plans[0] : v.v2_subscription_plans; return p?.status === "active"; }).map(v => { const p = Array.isArray(v.v2_subscription_plans) ? v.v2_subscription_plans[0] : v.v2_subscription_plans; return { id: v.id, name: p?.name ?? "Plan", version: v.version }; }), assignments: assignments.data ?? [], subscription: subscription.data, overrides: overrides.data ?? [], connections: connections.data ?? [], audit: audit.data ?? [], xeroFeatures: configuredXeroFeatures, sharepointSetup: { sites: (sites.data??[]).map(s=>({name:s.site_name,url:s.site_url,library:s.drive_name})), siteConfigured: !!sites.data?.length, siteVerified: sites.data?.some(s=>!!s.verified_at) ?? false, libraryConfigured: sites.data?.some(s=>!!s.drive_id) ?? false }, readiness: { sharepoint: readiness[0].connectReady, xero: readiness[1].connectReady } };
}
export type SubscriptionWorkspace = Awaited<ReturnType<typeof subscriptionWorkspace>>;
