// Preview only. Runtime enforcement uses the existing database entitlement resolver.
export function previewEnabled(feature: { id: string; lifecycle_status: string }, version: string | null, assignments: { plan_version_id: string; feature_id: string; enabled: boolean }[], overrides: { feature_id: string; enabled: boolean | null }[]) {
  if (feature.lifecycle_status === "disabled") return false;
  const override = overrides.find(o => o.feature_id === feature.id);
  if (override) return override.enabled === true;
  return assignments.find(a => a.plan_version_id === version && a.feature_id === feature.id)?.enabled === true;
}
