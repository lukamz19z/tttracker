import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Home project snapshot uses one scoped summary request instead of table fan-out", async () => {
  const source = await read("../mobile/app/(drawer)/index.tsx");
  const start = source.indexOf("const loadProjectDashboard = useCallback(");
  const end = source.indexOf("useFocusEffect(", start);
  assert.notEqual(start, -1);
  const loader = source.slice(start, end);
  assert.match(loader, /\/api\/mobile\/dashboard-summary\?projectId=/);
  assert.doesNotMatch(loader, /\.from\(/);
  assert.match(loader, /projectRequestVersion\.current/);
  assert.match(loader, /profile\?\.projectId !== projectId/);
  assert.match(loader, /PROJECT_DASHBOARD_FRESH_MS/);
  assert.match(source, /HOME_CARD_FRESH_MS/);
});

test("dashboard aggregation scopes operational summaries and gates optional metrics", async () => {
  const migration = await read("../supabase/migrations/20261116120000_v1_mobile_dashboard_summary.sql");
  assert.match(migration, /mobile_project_dashboard_summary\(p_project_id uuid, p_user_id uuid\)/);
  assert.match(migration, /d\.project_id = p_project_id/);
  assert.match(migration, /d\.deleted_at is null/);
  assert.match(migration, /join project_towers t on t\.id = b\.tower_id/);
  assert.match(migration, /join project_towers t on t\.id = d\.tower_id/);
  assert.match(migration, /user_has_access\(p_user_id, 'mobile\.deliveries'\)/);
  assert.match(migration, /user_has_access\(p_user_id, 'mobile\.defects'\)/);
  assert.match(migration, /user_has_access\(p_user_id, 'mobile\.daily_dockets'\)/);
  assert.doesNotMatch(migration, /select \*/i);
  assert.match(migration, /mobile_approval_counts\(p_user_id uuid\)/);
});

test("bootstrap no longer waits for approval counts and profile shares the bootstrap request", async () => {
  const bootstrapRoute = await read("../app/api/mobile/bootstrap/route.ts");
  const access = await read("../mobile/lib/access.tsx");
  const auth = await read("../mobile/contexts/AuthContext.tsx");
  const apiClient = await read("../mobile/lib/api/client.ts");
  assert.doesNotMatch(bootstrapRoute, /select\("id", \{ count: "exact", head: true \}\)/);
  assert.match(access, /getMobileBootstrap\(requestedUserId, forceBootstrap\)/);
  assert.match(access, /\/api\/mobile\/bootstrap\/approval-counts/);
  assert.match(auth, /getMobileBootstrap\(userId, force\)/);
  assert.doesNotMatch(auth, /\.from\("employees"\)|\.from\("project_access"\)/);
  assert.match(auth, /setApiSession\(data\.session\)/);
  assert.match(apiClient, /apiSessionInitialized &&/);
});

test("client screens use the AuthContext-fed session cache instead of remote getUser checks", async () => {
  const files = [
    "../mobile/app/(drawer)/fleet-jobs.tsx",
    "../mobile/app/(drawer)/profile.tsx",
    "../mobile/app/(drawer)/prestarts.tsx",
    "../mobile/app/(drawer)/vehicle-prestart.tsx",
    "../mobile/app/notifications-settings.tsx",
    "../mobile/lib/api/finance.ts",
    "../mobile/lib/site-prestarts-api.ts",
    "../mobile/lib/notifications/register-device-push-token.ts",
  ];
  const sources = await Promise.all(files.map(read));
  for (const source of sources) assert.doesNotMatch(source, /supabase\.auth\.getUser\(\)|supabase\.auth\.getSession\(\)/);
  assert.match(await read("../mobile/lib/api/client.ts"), /export function getApiSession\(\)/);
  assert.match(await read("../mobile/lib/api/client.ts"), /export async function getApiSessionUser\(\)/);
});

test("failed project summary stays inside its card and does not gate the dashboard shell", async () => {
  const source = await read("../mobile/app/(drawer)/index.tsx");
  assert.match(source, /if \(loading\)\s*\{[\s\S]*?Loading TTTracker/);
  assert.match(source, /projectError \? \(/);
  assert.match(source, /projectLoading && !projectDashboardLoaded/);
});

test("Project Progress filters active project dockets and parallelises independent summaries", async () => {
  const source = await read("../mobile/app/(drawer)/project-progress.tsx");
  assert.match(source, /\.select\("id,project_id,name,line,status,progress,extra_data"\)/);
  assert.match(source, /\.select\("id,project_id,tower_id,docket_date,deleted_at,assembly_percent,erection_percent,crew,leading_hand,raw_manhours,production_manhours"\)[\s\S]*?\.is\("deleted_at", null\)/);
  assert.match(source, /const \[labourRows, defectsRows, bundleRows, deliveryRows\] = await Promise\.all/);
  assert.doesNotMatch(source, /\.select\("\*"\)/);
});
