import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  BackendResilience,
  BackendRequestTimeoutError,
  classifyBackendFailure,
  createRequestResilientFetch,
  retryDelayMs,
} from "../lib/backend-resilience.ts";

test("classifies only transient gateway, PostgREST outage and network failures", () => {
  for (const status of [502, 503, 504]) assert.equal(classifyBackendFailure({ status }).transient, true);
  for (const code of ["PGRST000", "PGRST001", "PGRST002"]) {
    assert.equal(classifyBackendFailure({ code, message: "PostgREST unavailable" }).transient, true);
  }
  assert.equal(classifyBackendFailure(new TypeError("Failed to fetch")).transient, true);
  assert.equal(classifyBackendFailure(new BackendRequestTimeoutError(1000)).transient, true);
  for (const status of [400, 401, 403, 404]) assert.equal(classifyBackendFailure({ status }).transient, false);
  assert.equal(classifyBackendFailure({ status: 401, message: "fetch failed" }).transient, false);
  assert.equal(classifyBackendFailure({ status: 403, message: "timeout" }).transient, false);
  assert.equal(classifyBackendFailure({ status: 500, code: "PGRST116", message: "no rows" }).transient, false);
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

test("browser-like native fetch is invoked with its required global receiver through retries", async () => {
  let attempts = 0;
  const expectedGlobal = globalThis;
  function browserFetch(input, init) {
    assert.equal(this, expectedGlobal, "fetch must be called with the browser global receiver");
    assert.ok(input);
    assert.ok(init);
    attempts++;
    return Promise.resolve(attempts === 1
      ? new Response("temporary", { status: 503 })
      : new Response("ok", { status: 200 }));
  }
  const policy = new BackendResilience({ fetchImpl: browserFetch, sleep: async () => {}, log: () => {} });
  const response = await policy.fetch("https://example.test/rest/v1/projects");
  assert.equal(response.status, 200);
  assert.equal(attempts, 2);
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

test("healthy requests and one 503 followed by success never open the circuit", async () => {
  let attempts = 0;
  const policy = new BackendResilience({
    fetchImpl: async () => {
      attempts++;
      return attempts === 1 ? new Response("temporary", { status: 503 }) : new Response("ok", { status: 200 });
    },
    sleep: async () => {},
    log: () => {},
  });
  assert.equal((await policy.fetch("https://example.test/rest/v1/projects")).status, 200);
  assert.equal((await policy.fetch("https://example.test/rest/v1/towers")).status, 200);
  assert.equal(attempts, 3);
  assert.equal(policy.circuitOpen, false);
});

test("three separate transient failures open a client circuit without throwing a global outage error", async () => {
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
  assert.equal(policy.circuitOpen, false);
  await policy.fetch("https://example.test/read");
  assert.equal(policy.circuitOpen, true);
  const callsWhileOpen = calls;
  const deferred = await policy.fetch("https://example.test/read");
  assert.equal(deferred.status, 503);
  assert.equal(deferred.headers.get("x-tttracker-transient-failure"), "circuit-open");
  assert.equal(calls, callsWhileOpen);
  now += 21_000;
  policy["fetchImpl"] = async () => { calls++; return new Response("ok", { status: 200 }); };
  const response = await policy.fetch("https://example.test/read");
  assert.equal(response.status, 200);
  assert.equal(calls, callsWhileOpen + 1);
  assert.equal(recovered, 1);
  assert.equal(policy.circuitOpen, false);
});

test("auth, permission, not-found and PGRST116 responses never increment the circuit", async () => {
  for (const response of [
    new Response("auth", { status: 401 }),
    new Response("forbidden", { status: 403 }),
    new Response("not found", { status: 404 }),
    new Response(JSON.stringify({ code: "PGRST116", message: "no rows" }), { status: 500 }),
  ]) {
    const policy = new BackendResilience({ fetchImpl: async () => response.clone(), log: () => {} });
    for (let n = 0; n < 4; n++) await policy.fetch("https://example.test/rest/v1/optional");
    assert.equal(policy.circuitOpen, false);
  }
});

test("an optional endpoint circuit does not block unrelated project data", async () => {
  const policy = new BackendResilience({
    fetchImpl: async (input) => String(input).includes("notifications")
      ? new Response("unavailable", { status: 503 })
      : new Response("ok", { status: 200 }),
    sleep: async () => {},
    log: () => {},
  });
  for (let n = 0; n < 3; n++) await policy.fetch("https://example.test/rest/v1/notifications");
  assert.equal(policy.circuitOpen, true);
  assert.equal((await policy.fetch("https://example.test/rest/v1/towers")).status, 200);
});

test("Next server request clients have no circuit and do not block the next request", async () => {
  const makeFetch = () => createRequestResilientFetch({
    fetchImpl: async () => new Response("unavailable", { status: 503 }),
    sleep: async () => {},
    log: () => {},
    circuitBreaker: false,
  });
  const userA = makeFetch();
  let userBCalls = 0;
  const userB = createRequestResilientFetch({ fetchImpl: async () => { userBCalls++; return new Response("ok", { status: 200 }); }, log: () => {}, circuitBreaker: false });
  for (let n = 0; n < 4; n++) assert.equal((await userA("https://example.test/rest/v1/projects")).status, 503);
  assert.equal((await userB("https://example.test/rest/v1/projects")).status, 200);
  assert.equal(userBCalls, 1);
});

test("exhausted network reads preserve the original thrown error", async () => {
  const original = new TypeError("fetch failed");
  const policy = new BackendResilience({ fetchImpl: async () => { throw original; }, sleep: async () => {}, log: () => {} });
  await assert.rejects(policy.fetch("https://example.test/read"), (error) => error === original);
});

test("PGRST002 exhausted optional read stays a local response failure", async () => {
  const policy = new BackendResilience({
    fetchImpl: async () => new Response(JSON.stringify({ code: "PGRST002", message: "schema cache unavailable" }), { status: 500 }),
    sleep: async () => {},
    log: () => {},
  });
  const response = await policy.fetch("https://example.test/rest/v1/notifications");
  assert.equal(response.status, 500);
  assert.equal((await response.json()).code, "PGRST002");
  assert.equal(policy.circuitOpen, false);
});

test("server mode leaves circuit state disabled and the following request recovers", async () => {
  let calls = 0;
  const fetch = createRequestResilientFetch({
    circuitBreaker: false,
    fetchImpl: async () => ++calls <= 4 ? new Response("temporary", { status: 503 }) : new Response("ok", { status: 200 }),
    sleep: async () => {},
    log: () => {},
  });
  assert.equal((await fetch("https://example.test/rest/v1/projects")).status, 503);
  assert.equal((await fetch("https://example.test/rest/v1/projects")).status, 200);
  assert.equal(calls, 5);
});

test("optional notification failure does not prevent a healthy towers request", async () => {
  const policy = new BackendResilience({
    fetchImpl: async (input) => String(input).includes("notifications") ? new Response("down", { status: 503 }) : new Response("ok", { status: 200 }),
    sleep: async () => {},
    log: () => {},
  });
  const notifications = await policy.fetch("https://example.test/rest/v1/notifications");
  const towers = await policy.fetch("https://example.test/rest/v1/towers");
  assert.equal(notifications.status, 503);
  assert.equal(towers.status, 200);
});

test("critical website bootstrap handles transient session verification locally", () => {
  const layout = fs.readFileSync(path.resolve("app/(protected)/layout.tsx"), "utf8");
  assert.match(layout, /if \(!user\)[\s\S]*?if \(error && isTransientBackendFailure\(error\)\)[\s\S]*?return <main/);
  assert.match(layout, /redirect\("\/login"\)/);
  assert.doesNotMatch(layout, /BackendUnavailableError/);
  const provider = fs.readFileSync(path.resolve("components/access/access-provider.tsx"), "utf8");
  assert.match(provider, /keeping the current access snapshot/);
  assert.match(provider, /finally \{[\s\S]*?setLoading\(false\)/);
});

test("timeout is reported as timeout rather than backend unavailable", async () => {
  const policy = new BackendResilience({
    fetchImpl: (_input, init) => new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => reject(new TypeError("fetch failed")), { once: true });
    }),
    timeoutMs: 5,
    sleep: async () => {},
    log: () => {},
  });
  await assert.rejects(policy.fetch("https://example.test/hang"), BackendRequestTimeoutError);
});

test("server request-local fetch does not retain failure state between invocations", async () => {
  let calls = 0;
  const serverFetch = createRequestResilientFetch({
    circuitBreaker: false,
    fetchImpl: async () => ++calls <= 4 ? new Response("down", { status: 503 }) : new Response("ok", { status: 200 }),
    sleep: async () => {},
    log: () => {},
  });
  assert.equal((await serverFetch("https://example.test/rest/v1/projects")).status, 503);
  assert.equal((await serverFetch("https://example.test/rest/v1/projects")).status, 200);
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

test("request timeout terminates a hanging request with timeout metadata", async () => {
  const policy = new BackendResilience({
    fetchImpl: (_input, init) => new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => reject(new TypeError("fetch failed")), { once: true });
    }),
    timeoutMs: 5,
    sleep: async () => {},
    log: () => {},
  });
  await assert.rejects(policy.fetch("https://example.test/hang"), BackendRequestTimeoutError);
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
