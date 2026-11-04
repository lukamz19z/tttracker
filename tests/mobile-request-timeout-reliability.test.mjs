import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("mobile API has one resilience-owned timeout per request and separates read/mutation budgets", async () => {
  const [client, resilience] = await Promise.all([
    read("mobile/lib/api/client.ts"),
    read("lib/backend-resilience.ts"),
  ]);
  assert.match(client, /timeoutMs = isRead \? 15_000 : 30_000/);
  assert.doesNotMatch(client, /new AbortController\(|setTimeout\(\(\) => controller\.abort/);
  assert.match(client, /resilienceTimeoutMs: timeoutMs/);
  assert.match(resilience, /DEFAULT_TIMEOUT_MS = 15_000/);
  assert.match(resilience, /DEFAULT_MUTATION_TIMEOUT_MS = 30_000/);
  assert.match(resilience, /const retries = safeRead && !authRequest \? RETRY_DELAYS_MS\.length : 0/);
  assert.match(resilience, /circuitProtected = this\.circuitBreaker && safeRead && !authRequest/);
});

test("Materials report remains idempotent and reconciles a lost response before the user retries", async () => {
  const [screen, api, context, route, statusRoute, queue] = await Promise.all([
    read("mobile/app/materials/report-missing.tsx"),
    read("mobile/lib/api/materials.ts"),
    read("mobile/contexts/MaterialsContext.tsx"),
    read("app/api/mobile/materials/missing/route.ts"),
    read("app/api/mobile/materials/missing/status/route.ts"),
    read("mobile/lib/offline/materialsQueue.ts"),
  ]);
  assert.match(screen, /const reportMutationId=useRef\(createClientId\(\)\)/);
  assert.match(screen, /submitInFlight\.current/);
  assert.match(api, /missing\/status/);
  assert.match(context, /getMissingMaterialMutationStatus/);
  assert.match(context, /We couldn't confirm whether this material report was saved/);
  assert.match(queue, /status\?: "pending" \| "failed" \| "manual_retry"/);
  assert.match(route, /client_mutation_id/);
  assert.match(route, /after\(async \(\) =>/);
  assert.match(statusRoute, /\.eq\("client_mutation_id", clientMutationId\)/);
});

test("Home keeps Vehicle Prestart optional and fetches one matching latest record", async () => {
  const home = await read("mobile/app/(drawer)/index.tsx");
  assert.match(home, /\.ilike\("inspected_by_name", fullName\)[\s\S]*?\.limit\(1\)\.maybeSingle\(\)/);
  assert.match(home, /Vehicle summary unavailable/);
  assert.match(home, /personalLoadActive\.current/);
  assert.match(home, /Promise\.all\(tasks\)/);
  assert.doesNotMatch(home, /\.limit\(50\)/);
});

test("Materials keeps complete project bundles and emits query-family timing", async () => {
  const [bootstrap, api, provider] = await Promise.all([
    read("app/api/mobile/materials/bootstrap/route.ts"),
    read("mobile/lib/api/materials.ts"),
    read("mobile/contexts/MaterialsContext.tsx"),
  ]);
  assert.match(bootstrap, /const PAGE_SIZE = 1000/);
  assert.match(bootstrap, /paged\("required_bundles"/);
  assert.match(bootstrap, /Materials bootstrap query timing/);
  assert.doesNotMatch(bootstrap, /BUNDLE_BOOTSTRAP_LIMIT|pageSize:\s*20/);
  assert.match(api, /timeoutMs: 20_000/);
  assert.match(provider, /Materials cached render ready/);
  assert.match(provider, /Showing cached materials/);
});

test("Daily Docket save and submit expose phase timings while post-commit email is scheduled", async () => {
  const [save, submit, mobileApi] = await Promise.all([
    read("app/api/mobile/daily-dockets/save/route.ts"),
    read("app/api/daily-dockets/[docketId]/submit-bc/route.ts"),
    read("mobile/lib/api/daily-dockets.ts"),
  ]);
  assert.match(save, /Daily Docket save timing/);
  assert.match(save, /Server-Timing/);
  assert.match(submit, /logSubmitPhase\("material_snapshot"\)/);
  assert.match(submit, /logSubmitPhase\("approval_and_workflow_records"\)/);
  assert.match(submit, /after\(async \(\) =>/);
  assert.doesNotMatch(mobileApi, /timeoutMs:\s*60_000/);
});
