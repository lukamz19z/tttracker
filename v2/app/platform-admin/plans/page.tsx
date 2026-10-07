import { requirePlatformPage } from "@/lib/platform/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
export default async function PlansPage() {
  await requirePlatformPage();
  const db = createSupabaseAdmin();
  const [{ data: plans, error: pError }, { data: features, error: fError }] =
    await Promise.all([
      db
        .from("v2_subscription_plans")
        .select("id,name,plan_key,status")
        .order("name"),
      db
        .from("v2_features")
        .select("id,name,feature_key,feature_type,lifecycle_status")
        .order("name"),
    ]);
  if (pError || fError) throw new Error("PLATFORM_CATALOGUE_LOOKUP_FAILED");
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
