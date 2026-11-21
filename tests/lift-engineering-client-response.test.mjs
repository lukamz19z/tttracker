import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readLiftJson } from "../lib/lift-engineering/client-response.ts";
import { baseSetupOptions } from "../lib/lift-engineering/base-configuration.ts";

test("reads a successful JSON response", async () => {
  const response = Response.json({ configurations: [], profiles: [], configurationOptions: [] });
  assert.deepEqual(await readLiftJson(response, "summary"), { configurations: [], profiles: [], configurationOptions: [] });
});

test("successful 204 no-content response resolves to null", async () => {
  const response = new Response(null, { status: 204 });
  assert.equal(await readLiftJson(response, "delete"), null);
});

test("failed JSON response reports HTTP status and backend error", async () => {
  const response = Response.json({ error: "project access denied", code: "forbidden" }, { status: 403 });
  await assert.rejects(readLiftJson(response, "study options"), /study options failed \(403\): project access denied/);
});

test("failed empty response reports the empty-body condition and status", async () => {
  const response = new Response(null, { status: 500 });
  await assert.rejects(readLiftJson(response, "configuration summary"), /configuration summary failed \(500\): The server returned an empty response/);
});

test("successful unexpected empty response is not treated as a JSON parse crash", async () => {
  const response = new Response(null, { status: 200 });
  await assert.rejects(readLiftJson(response, "chart points"), /chart points failed \(200\): The server returned an empty response/);
});

test("invalid non-empty body includes status and a bounded body preview", async () => {
  const response = new Response("upstream gateway unavailable", { status: 502 });
  await assert.rejects(readLiftJson(response, "profile lookup"), /profile lookup failed \(502\): The server returned invalid JSON: upstream gateway unavailable/);
});

test("configuration create and update JSON payloads are returned to callers", async () => {
  assert.deepEqual(await readLiftJson(Response.json({ record: { id: "config-1" } }, { status: 201 }), "create"), { record: { id: "config-1" } });
  assert.deepEqual(await readLiftJson(Response.json({ record: { id: "config-1" } }), "update"), { record: { id: "config-1" } });
  const route = await readFile(new URL("../app/api/lift-engineering/library/[resource]/route.ts", import.meta.url), "utf8");
  assert.match(route, /return NextResponse\.json\(\{ record: data \}, \{ status: 201 \}\)/);
  assert.match(route, /return NextResponse\.json\(\{ record: data \}\)/);
});

test("zero manufacturer dropdown options remain an explicit JSON array", async () => {
  const options = baseSetupOptions([], "crane-without-imported-charts");
  const payload = await readLiftJson(Response.json({ options }), "base configuration options");
  assert.deepEqual(payload, { options: { counterweights: [], outriggers: [], slewRanges: [] } });
  const route = await readFile(new URL("../app/api/lift-engineering/library/configurations/summary/route.ts", import.meta.url), "utf8");
  assert.match(route, /return NextResponse\.json\(\{ configurations: records, profiles: profileOptions, configurationOptions \}\)/);
});

test("client parser uses response.text and never calls Response.json", async () => {
  let jsonCalled = false;
  const response = { status: 502, ok: false, text: async () => "", json: async () => { jsonCalled = true; throw new SyntaxError("Unexpected end of JSON input"); } };
  await assert.rejects(readLiftJson(response, "study options"), /empty response/);
  assert.equal(jsonCalled, false);
});
