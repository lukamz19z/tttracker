import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  BackendResilience,
  BackendUnavailableError,
  classifyBackendFailure,
  retryDelayMs,
} from "../lib/backend-resilience.ts";

test("classifies only transient gateway, PostgREST outage and network failures", () => {
  for (const status of [502, 503, 504]) assert.equal(classifyBackendFailure({ status }).transient, true);
  for (const code of ["PGRST000", "PGRST001", "PGRST002"]) {
    assert.equal(classifyBackendFailure({ code, message: "PostgREST unavailable" }).transient, true);
  }
  assert.equal(classifyBackendFailure(new TypeError("Failed to fetch")).transient, true);
  assert.equal(classifyBackendFailure(new BackendUnavailableError()).transient, true);
  for (const status of [400, 401, 403, 404]) assert.equal(classifyBackendFailure({ status }).transient, false);
});

test("retry policy is bounded to three jittered retries", async () => {
  let calls = 0;
  const delays = [];
  const policy = new BackendResilience({
    fetchImpl: async () => { calls++; return new Response("unavailable", { status: 503 }); },
    random: () => 0.5,
    sleep: async (ms) => { delays.push(ms); },
    log: () => {},
  });
  const response = await policy.fetch("https://example.test/data");
  assert.equal(response.status, 503);
  assert.equal(calls, 4);
  assert.deepEqual(delays, [1_000, 2_000, 5_000]);
  assert.equal(retryDelayMs(0, () => 0), 800);
  assert.equal(retryDelayMs(2, () => 1), 6_000);
});

test("auth requests are not retried or placed behind the data API circuit", async () => {
  let calls = 0;
  const policy = new BackendResilience({
    fetchImpl: async () => { calls++; return new Response("auth temporarily unavailable", { status: 503 }); },
    sleep: async () => assert.fail("Auth request should not retry"),
    log: () => {},
  });
  const response = await policy.fetch("https://example.test/auth/v1/user");
  assert.equal(response.status, 503);
  assert.equal(calls, 1);
  assert.equal(policy.circuitOpen, false);
});

test("data API outage opens a circuit, suppresses requests, then performs one recovery probe", async () => {
  let calls = 0;
  let now = 10_000;
  let recovered = 0;
  const policy = new BackendResilience({
    fetchImpl: async () => { calls++; return new Response("down", { status: 503 }); },
    sleep: async () => {},
    now: () => now,
    log: () => {},
  });
  policy.subscribeRecovery(() => recovered++);
  await policy.fetch("https://example.test/read");
  await policy.fetch("https://example.test/read");
  assert.equal(policy.circuitOpen, true);
  const callsWhileOpen = calls;
  await assert.rejects(policy.fetch("https://example.test/read"), BackendUnavailableError);
  assert.equal(calls, callsWhileOpen);
  now += 21_000;
  policy["fetchImpl"] = async () => { calls++; return new Response("ok", { status: 200 }); };
  const response = await policy.fetch("https://example.test/read");
  assert.equal(response.status, 200);
  assert.equal(calls, callsWhileOpen + 1);
  assert.equal(recovered, 1);
  assert.equal(policy.circuitOpen, false);
});

test("unsafe mutations are never automatically retried", async () => {
  let calls = 0;
  const policy = new BackendResilience({
    fetchImpl: async () => { calls++; return new Response("unavailable", { status: 503 }); },
    sleep: async () => assert.fail("Mutation should not retry"),
    log: () => {},
  });
  const response = await policy.fetch("https://example.test/write", { method: "POST", body: "{}" });
  assert.equal(response.status, 503);
  assert.equal(calls, 1);
});

test("twenty overlapping identical bootstrap reads share one bounded request", async () => {
  let calls = 0;
  const policy = new BackendResilience({
    fetchImpl: async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Response(JSON.stringify({ projects: [] }), { status: 200 });
    },
    log: () => {},
  });
  const responses = await Promise.all(Array.from({ length: 20 }, () => policy.fetch("https://example.test/api/bootstrap", { headers: { Authorization: "Bearer test-session" } })));
  assert.equal(calls, 1);
  assert.equal(responses.length, 20);
  assert.deepEqual(await responses[0].json(), { projects: [] });
});

test("request timeout terminates a hanging request with a recoverable error", async () => {
  const policy = new BackendResilience({
    fetchImpl: (_input, init) => new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => reject(new TypeError("fetch failed")), { once: true });
    }),
    timeoutMs: 5,
    sleep: async () => {},
    log: () => {},
  });
  await assert.rejects(policy.fetch("https://example.test/hang"), BackendUnavailableError);
});

test("mobile has one user-notification Realtime channel with deterministic cleanup", () => {
  const drawer = path.resolve("mobile/app/(drawer)");
  const sourceFiles = fs.readdirSync(drawer).filter((name) => name.endsWith(".tsx"));
  const subscriptions = sourceFiles.flatMap((name) => {
    const source = fs.readFileSync(path.join(drawer, name), "utf8");
    return [...source.matchAll(/\.channel\(/g)].map(() => ({ name, source }));
  });
  assert.equal(subscriptions.length, 1);
  assert.equal(subscriptions[0].name, "_layout.tsx");
  assert.match(subscriptions[0].source, /table:\s*"user_notifications"/);
  assert.match(subscriptions[0].source, /removeChannel\(channel\)/);
});
