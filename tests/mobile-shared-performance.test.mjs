import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BackendResilience } from "../lib/backend-resilience.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("mobile access refresh uses one cached bootstrap rather than two duplicate authorization routes", async () => {
  const [provider, bootstrap] = await Promise.all([read("mobile/lib/access.tsx"), read("app/api/mobile/bootstrap/route.ts")]);
  const refresh = provider.slice(provider.indexOf("const runServerRefresh"), provider.indexOf("const refresh = useCallback"));
  assert.match(refresh, /apiJson<BootstrapPayload>\("\/api\/mobile\/bootstrap"/);
  assert.doesNotMatch(refresh, /\/api\/access\/me/);
  assert.match(refresh, /applyAccess\(access\)/);
  assert.match(provider, /readAccessCache\(userId\)/);
  assert.match(provider, /refreshPromiseRef\.current/);
  assert.match(bootstrap, /effectivePermissionsForUser\(service, identity\.userId\)/);
});

test("runtime single-code permissions use direct RPC; broad view remains for reporting payloads", async () => {
  const [access, materials, prestarts] = await Promise.all([
    read("lib/access/server.ts"), read("lib/materials/mobile-material-server.ts"), read("lib/site-prestarts/server.ts"),
  ]);
  const check = access.slice(access.indexOf("export async function userHasAccess"), access.indexOf("export async function requireAccess"));
  assert.match(check, /\.rpc\("user_has_access"/);
  assert.doesNotMatch(check, /effective_user_permissions/);
  assert.match(access.slice(access.indexOf("export async function effectivePermissionsForUser")), /effective_user_permissions/);
  assert.match(materials, /\.rpc\("user_has_access"/);
  assert.doesNotMatch(materials, /effective_user_permissions/);
  assert.match(prestarts, /\.rpc\("user_has_access"/);
  assert.doesNotMatch(prestarts, /effective_user_permissions/);
});

test("trace events distinguish transport attempts from the total read budget at common latencies", async () => {
  for (const latency of [250, 500, 1_000, 5_000]) {
    let clock = 0;
    const events = [];
    const policy = new BackendResilience({
      now: () => clock,
      fetchImpl: async () => { clock += latency; return new Response("ok", { status: 200 }); },
      log: (event, fields) => events.push({ event, ...fields }),
    });
    assert.equal((await policy.fetch("https://example.test/rest/v1/towers")).status, 200);
    assert.equal(events.filter((row) => row.event === "backend_attempt_started").length, 1);
    assert.equal(events.find((row) => row.event === "backend_attempt_response").durationMs, latency);
    assert.equal(events.find((row) => row.event === "backend_request_finished").durationMs, latency);
    assert.equal(new Set(events.filter((row) => row.trace).map((row) => row.trace)).size, 1);
  }
});

test("one slow failed read retries inside one budget and exposes every attempt", async () => {
  let clock = 0;
  let attempts = 0;
  const events = [];
  const policy = new BackendResilience({
    now: () => clock,
    random: () => 0.5,
    sleep: async (ms) => { clock += ms; },
    fetchImpl: async () => { attempts++; clock += attempts === 1 ? 5_000 : 500; return new Response(attempts === 1 ? "unavailable" : "ok", { status: attempts === 1 ? 503 : 200 }); },
    log: (event, fields) => events.push({ event, ...fields }),
  });
  assert.equal((await policy.fetch("https://example.test/rest/v1/towers")).status, 200);
  assert.equal(attempts, 2);
  assert.equal(events.find((row) => row.event === "backend_request_retry").delayMs, 300);
  assert.equal(events.find((row) => row.event === "backend_request_finished").durationMs, 5_800);
});

test("core and cached content remains visible while secondary reads refresh", async () => {
  const [home, project, tower, notifications, materials, realtime] = await Promise.all([
    read("mobile/app/(drawer)/index.tsx"), read("mobile/app/(drawer)/project-progress.tsx"),
    read("mobile/app/(drawer)/tower-progress.tsx"), read("mobile/app/(drawer)/notifications.tsx"),
    read("mobile/contexts/MaterialsContext.tsx"), read("mobile/app/(drawer)/_layout.tsx"),
  ]);
  assert.match(home, /if \(loading\) \{/);
  const projectFailure = home.slice(home.indexOf("} catch (error) {", home.indexOf("const loadProjectDashboard")), home.indexOf("} finally {", home.indexOf("const loadProjectDashboard")));
  assert.doesNotMatch(projectFailure, /setProjectDashboard\(EMPTY_PROJECT\)/);
  assert.match(project, /AsyncStorage\.getItem\(cacheKey\)/);
  assert.match(project, /setDockets\(loadedDockets\);\s*setLoading\(false\);\s*if \(cacheKey\)/);
  assert.match(tower, /setResolvedProgress\(snapshot\.progress\);\s*setLoading\(false\)/);
  assert.match(notifications, /pageLoading && notifications\.length === 0/);
  assert.match(materials, /Materials cached render ready/);
  assert.equal((realtime.match(/\.channel\(`mobile-notification-badge-/g) ?? []).length, 1);
  assert.match(realtime, /supabase\.removeChannel\(channel\)/);
  assert.match(realtime, /notificationChannelsCreated - notificationChannelsRemoved/);
});

test("Tower Progress reuses server tower and docket reads instead of fetching each twice", async () => {
  const [route, screen, response] = await Promise.all([
    read("app/api/mobile/tower-progress/route.ts"), read("mobile/app/(drawer)/tower-progress.tsx"),
    read("mobile/lib/api/tower-progress.ts"),
  ]);
  assert.match(route, /NextResponse\.json\(\{ progress, towers, dockets:/);
  const load = screen.slice(screen.indexOf("const loadProject = useCallback"), screen.indexOf("const refresh = useCallback"));
  assert.doesNotMatch(load, /supabase\.from\("towers"\)|supabase\.from\("tower_daily_dockets"\)/);
  assert.match(load, /setTowers\(\(result\.towers as Tower\[\]\)/);
  assert.match(response, /Array\.isArray\(payload\.towers\)/);
  assert.match(response, /Array\.isArray\(payload\.dockets\)/);
});
