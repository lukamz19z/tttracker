import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isSafeMobileTraceId, PROFILE_MOBILE_TRACE_PATH, shouldTraceMobileClientRequest, shouldTraceMobileRequest } from "../lib/mobile/perf-trace-policy.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("production tracing is disabled by default and enabled only by the public flag for Profile", () => {
  assert.equal(shouldTraceMobileRequest(false, undefined, PROFILE_MOBILE_TRACE_PATH), false);
  assert.equal(shouldTraceMobileRequest(false, "0", PROFILE_MOBILE_TRACE_PATH), false);
  assert.equal(shouldTraceMobileRequest(false, "1", PROFILE_MOBILE_TRACE_PATH), true);
});

test("production trace flag does not trace ordinary mobile API requests", () => {
  for (const path of ["/api/mobile/materials/bootstrap", "/api/mobile/quality/bootstrap", "/api/mobile/dashboard-summary"]) {
    assert.equal(shouldTraceMobileRequest(false, "1", path), false);
  }
  assert.equal(shouldTraceMobileRequest(true, undefined, "/api/mobile/materials/bootstrap"), true, "development keeps broader diagnostics");
});

test("production client trace flag covers all mobile API routes while default remains off", () => {
  assert.equal(shouldTraceMobileClientRequest(false, undefined), false);
  assert.equal(shouldTraceMobileClientRequest(false, "0"), false);
  assert.equal(shouldTraceMobileClientRequest(false, "1"), true);
  assert.equal(shouldTraceMobileClientRequest(true, undefined), true);
});

test("mobile Supabase and legacy fetch transports share sanitized opt-in tracing", async () => {
  const [transport, supabase, legacy] = await Promise.all([
    read("mobile/lib/perf-trace.ts"), read("mobile/lib/supabase.ts"), read("mobile/lib/site-prestarts-api.ts"),
  ]);
  assert.match(transport, /EXPO_PUBLIC_TTTRACKER_PERF_TRACE === "1"/);
  assert.match(transport, /request-start/);
  assert.match(transport, /request-complete/);
  assert.match(transport, /request-failed/);
  assert.match(supabase, /tracedMobileFetch\(resilientFetch/);
  assert.match(legacy, /tracedMobileFetch\(fetch/);
  for (const source of [transport, supabase, legacy]) {
    assert.doesNotMatch(source, /console\.(?:debug|info|warn|error)\([^;\n]*(?:Authorization|access_token|refresh_token|body|signatureStrokes)/i);
  }
  assert.match(transport, /content-range/);
  assert.doesNotMatch(transport, /url\.searchParams\.toString|console\.[^(]+\([^\n]*url\.href/);
});

test("trace IDs use a safe portable character set", () => {
  assert.equal(isSafeMobileTraceId("trace_abcd1234_efgh5678"), true);
  assert.equal(isSafeMobileTraceId("bearer eyJ.secret.token"), false);
  assert.equal(isSafeMobileTraceId("short"), false);
});

test("client propagates one trace ID in the request header and server consumes that same header", async () => {
  const [client, server, resilience] = await Promise.all([
    read("mobile/lib/api/client.ts"),
    read("lib/mobile/perf-trace.ts"),
    read("lib/backend-resilience.ts"),
  ]);
  assert.match(client, /headers\.set\("x-tttracker-trace-id", trace\)/);
  assert.match(server, /headers\.get\("x-tttracker-trace-id"\)/);
  assert.match(server, /x-tttracker-trace-attempt/);
  assert.match(resilience, /get\("x-tttracker-trace-id"\)/);
  assert.match(resilience, /x-tttracker-trace-attempt/);
});

test("trace logging never emits credential headers or request bodies", async () => {
  const [client, access, bootstrap, traceHelper, resilience] = await Promise.all([
    read("mobile/lib/api/client.ts"),
    read("lib/access/server.ts"),
    read("app/api/mobile/bootstrap/route.ts"),
    read("lib/mobile/perf-trace.ts"),
    read("lib/backend-resilience.ts"),
  ]);
  for (const source of [client, access, bootstrap, traceHelper, resilience]) {
    assert.doesNotMatch(source, /console\.(?:debug|info|warn|error)\([^;\n]*(?:Authorization|refresh_token|requestInit\.body)/i);
  }
  assert.match(client, /hasAuthorization: Boolean\(session\?\.access_token\)/);
  assert.match(client, /tokenExpiryDeltaSeconds/);
  assert.doesNotMatch(client, /console\.(?:debug|info|warn)\([^\n]*access_token:/);
});

test("production server trace requires its own flag and only accepts the Profile route with valid trace ID", async () => {
  const [helper, policy] = await Promise.all([
    read("lib/mobile/perf-trace.ts"),
    read("lib/mobile/perf-trace-policy.ts"),
  ]);
  assert.match(helper, /process\.env\.TTTRACKER_PERF_TRACE/);
  assert.match(helper, /x-tttracker-trace-id/);
  assert.match(helper, /isSafeMobileTraceId\(id\)/);
  assert.match(policy, /pathname === PROFILE_MOBILE_TRACE_PATH/);
  assert.match(policy, /PROFILE_MOBILE_TRACE_PATH = "\/api\/mobile\/bootstrap"/);
});

test("Profile route logs safe phases and returns the matching trace header", async () => {
  const route = await read("app/api/mobile/bootstrap/route.ts");
  for (const phase of ["handler-start", "identity-ready", "parallel-bootstrap-queries", "access-ok", "current-project-resolution", "response-serialization", "handler-end", "error"]) {
    assert.ok(route.includes(`"${phase}"`), `missing trace phase ${phase}`);
  }
  for (const query of ["effective_user_permissions", "user_role_assignments", "project_access", "mobile_navigation_items", "system_app_settings", "financial_access_rules", "project_docket_approval_users"]) {
    assert.ok(route.includes(`"${query}"`), `missing query timing for ${query}`);
  }
  assert.match(route, /trace\?\.log\("db-query"/);
  assert.match(route, /operation: name/);
  assert.match(route, /durationMs: Date\.now\(\) - startedAt,[\s\S]*rowCount: resultRowCount\(result\)/);
  const profileServer = await read("lib/mobile/server.ts");
  assert.match(profileServer, /operation: "employees\.by_user_id_with_crew_join"/);
  assert.match(profileServer, /profile-lookup-failed/);
  assert.match(route, /set\("x-tttracker-trace-id", trace\.id\)/);
  assert.match(route, /set\("x-tttracker-trace-attempt", trace\.attemptId\)/);
});
