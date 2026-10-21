import { requirePlatformPage } from "@/lib/platform/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
export default async function PlansPage() {
  await requirePlatformPage();
  const db = createSupabaseAdmin();
  const [{ data: plans, error: pError }, { data: features, error: fError }, {data: versions,error:vError}, {data: assignments,error:aError}] =
    await Promise.all([
      db
        .from("v2_subscription_plans")
        .select("id,name,plan_key,status")
        .order("name"),
      db
        .from("v2_features")
        .select("id,name,feature_key,feature_type,lifecycle_status")
        .order("name"),
      db.from("v2_subscription_plan_versions").select("id,plan_id,version,status").eq("status","active"),
      db.from("v2_subscription_plan_entitlements").select("plan_version_id,feature_id,enabled"),
    ]);
  if (pError || fError || vError || aError) throw new Error("PLATFORM_CATALOGUE_LOOKUP_FAILED");
  return (
    <div>
      <h1>Plans & Modules</h1>
      <p>
        Current platform catalogue. Plan names do not determine navigation;
        effective entitlements do.
      </p>
      <h2>Plans</h2>
      {plans?.map((p) => (
        <div
          key={p.id}
          style={{ padding: "10px 0", borderBottom: "1px solid #334155" }}
        >
          {p.name} / {p.plan_key} / {p.status}
        </div>
      ))}
      <h2>Features</h2>
      <h3>Integration Entitlements by Plan Version</h3>
      <table><thead><tr><th>Plan</th><th>Version</th>{features?.filter(f=>f.feature_type==='integration').map(f=><th key={f.id}>{f.name}</th>)}</tr></thead><tbody>{versions?.map(v=><tr key={v.id}><td>{plans?.find(p=>p.id===v.plan_id)?.name}</td><td>{v.version}</td>{features?.filter(f=>f.feature_type==='integration').map(f=><td key={f.id}>{f.lifecycle_status!=='disabled' && assignments?.some(a=>a.plan_version_id===v.id && a.feature_id===f.id && a.enabled) ? 'Included':'Not included'}</td>)}</tr>)}</tbody></table>
      {features?.map((f) => (
        <div
          key={f.id}
          style={{ padding: "8px 0", borderBottom: "1px solid #334155" }}
        >
          {f.name} / {f.feature_type} / {f.lifecycle_status}
        </div>
      ))}
    </div>
  );
}
