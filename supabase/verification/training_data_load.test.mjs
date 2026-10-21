import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("organisation and person Training pages share the canonical Training read route", () => {
  const registerPage = read("v2/app/workspace/people/page.tsx");
  const personPage = read("v2/app/workspace/people/[personId]/page.tsx");
  const client = read("v2/components/people/people-client.tsx");
  const api = read("v2/app/api/people/route.ts");

  assert.match(registerPage, /from "@\/components\/people\/people-client"/);
  assert.match(personPage, /from "@\/components\/people\/people-client"/);
  assert.match(client, /area,\s*\n\s*q: query/);
  assert.match(client, /if \(personId \|\| \(area === "prestarts"/);
  assert.match(client, /params\.set\("person", personId/);
  assert.match(api, /peopleRead\([\s\S]*?params\.get\("area"\)/);
  assert.match(api, /\.not\("voided_at", "is", null\)/);
});

test("Training status projection failures have a safe specific UI message and diagnostic code", () => {
  const controls = read("v2/components/people/people-controls.tsx");
  const api = read("v2/app/api/people/route.ts");

  assert.match(controls, /TRAINING_RECORD_STATUS_LOAD_FAILED:\s*"Training records could not be loaded/);
  assert.match(api, /code: "TRAINING_RECORD_STATUS_QUERY_FAILED"/);
  assert.match(api, /throw new Error\("TRAINING_RECORD_STATUS_LOAD_FAILED"\)/);
});
