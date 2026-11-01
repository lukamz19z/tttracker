import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../../lib/materials/recipient-channels.ts", import.meta.url), "utf8");
const dispatcher = await readFile(new URL("../../lib/materials/missing-notifications.ts", import.meta.url), "utf8");

function loadMerge() {
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("exports", "module", output)(loaded.exports, loaded);
  return loaded.exports.mergeExplicitMaterialRecipientChannels;
}

test("assignee and Also Notify users each receive one explicit email delivery", () => {
  const merge = loadMerge();
  const channels = new Map([[
    "john", { inApp: true, push: true, email: true },
  ], ["sarah", { inApp: false, push: false, email: false }], ["michael", { inApp: true, push: true, email: false }]]);
  merge(channels, ["john", "sarah"]);
  assert.equal(channels.get("john").email, true);
  assert.equal(channels.get("sarah").email, true);
  assert.equal(channels.get("sarah").inApp, true);
  assert.equal(channels.get("sarah").push, true);
  assert.equal(channels.get("michael").email, false);
  assert.equal([...channels].filter(([, prefs]) => prefs.email).length, 2);
});

test("overlapping assignment, selected, and automatic recipient remains one email recipient", () => {
  const merge = loadMerge();
  const channels = new Map([[
    "john", { inApp: true, push: true, email: false },
  ], ["sarah", { inApp: true, push: true, email: false }]]);
  merge(channels, ["john", "john", "sarah"]);
  assert.deepEqual([...channels.keys()], ["john", "sarah"]);
  assert.equal([...channels.values()].filter(value => value.email).length, 2);
});

test("dispatch uses the unique channel map for one private email per user and stable issue links", () => {
  assert.match(dispatcher, /const emailIds=\[\.\.\.channels\]\.filter\(\(\[,selected\]\)=>selected\.email\)\.map\(\(\[id\]\)=>id\)/);
  assert.match(dispatcher, /to:\[identity\.email!\]/);
  assert.match(dispatcher, /channel:"email"/);
  assert.match(dispatcher, /event\.notify_user_ids/);
  assert.match(dispatcher, /mergeExplicitMaterialRecipientChannels\(channels, \[directAssignee/);
  assert.match(dispatcher, /buildMaterialIssueUrl/);
});
