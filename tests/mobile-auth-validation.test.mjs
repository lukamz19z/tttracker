import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AuthProviderUnavailableError, classifySupabaseAuthFailure, mobileAuthErrorResponse } from "../lib/mobile/auth-validation.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("a genuinely invalid Supabase token remains an HTTP 401", () => {
  const failure = classifySupabaseAuthFailure({ status: 401, code: "invalid_jwt" });
  assert.deepEqual(failure, { category: "invalid_session", status: 401, errorCode: "invalid_jwt" });
  assert.deepEqual(mobileAuthErrorResponse(new Error("You must be logged in.")), { status: 401, message: "You must be signed in." });
});

test("a missing bearer token remains an HTTP 401", () => {
  assert.deepEqual(mobileAuthErrorResponse(new Error("Missing authentication token.")), { status: 401, message: "You must be signed in." });
});

test("Supabase Auth 504 is transient and is never mapped to HTTP 401", () => {
  const failure = classifySupabaseAuthFailure({ status: 504, code: "gateway_timeout" });
  assert.deepEqual(failure, { category: "provider_unavailable", status: 504, errorCode: "gateway_timeout" });
  assert.deepEqual(mobileAuthErrorResponse(new AuthProviderUnavailableError(504, "gateway_timeout")), { status: 504, message: "Authentication provider is temporarily unavailable. Please retry." });
});

test("an Auth timeout/network failure becomes a transient 503 instead of invalid-session 401", () => {
  const failure = classifySupabaseAuthFailure(new TypeError("Failed to fetch"));
  assert.equal(failure.category, "provider_unavailable");
  assert.equal(failure.status, 503);
});

test("mobile API maps the typed Auth provider failure to its transient upstream status", async () => {
  const source = await read("lib/mobile/server.ts");
  assert.match(source, /mobileAuthErrorResponse\(error\)/);
  const helper = await read("lib/mobile/auth-validation.ts");
  assert.match(helper, /Authentication provider is temporarily unavailable/);
  assert.match(helper, /status === 401/);
  assert.doesNotMatch(helper, /status === 504[^\n]*invalid_session/);
});

test("authenticated V1 boundary verifies claims through Supabase JS and times separate phases", async () => {
  const [server, mobileServer, packageJson] = await Promise.all([
    read("lib/access/server.ts"),
    read("lib/mobile/server.ts"),
    read("package.json"),
  ]);
  assert.match(server, /auth\.getClaims\(token\)/);
  assert.doesNotMatch(server, /auth\.getUser\(token\)/);
  assert.match(server, /token-extracted/);
  assert.match(server, /auth-client-ready/);
  assert.match(server, /claims-start/);
  assert.match(server, /claims-verified/);
  assert.match(server, /jwks\/network-start/);
  assert.match(server, /jwks\/network-end/);
  assert.match(mobileServer, /profile-lookup/);
  assert.match(packageJson, /"@supabase\/supabase-js": "\^2\.99\.2"/);
});
