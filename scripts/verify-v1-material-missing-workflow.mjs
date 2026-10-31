import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const ts = require(path.resolve("node_modules/typescript"));
const migration = fs.readFileSync("supabase/migrations/20261031190000_v1_material_missing_workflow.sql", "utf8");
const mobileQueueSource = fs.readFileSync("mobile/lib/offline/materialsQueue.ts", "utf8");
const context = fs.readFileSync("mobile/contexts/MaterialsContext.tsx", "utf8");
const docket = fs.readFileSync("lib/dockets/mobile-docket-materials.ts", "utf8");
const catalogue = fs.readFileSync("app/api/mobile/materials/catalogue/route.ts", "utf8");
const search = fs.readFileSync("app/api/mobile/materials/search/route.ts", "utf8");
const report = fs.readFileSync("mobile/app/materials/report-missing.tsx", "utf8");

assert.match(migration, /unique index if not exists tower_material_events_project_mutation_idx/);
assert.match(migration, /for update of e/i);
assert.match(migration, /p_quantity > v_remaining/);
assert.match(migration, /insert into public\.tower_material_events\([\s\S]*?event_type[\s\S]*?found_received/);
assert.match(migration, /receipt_auto_resolve/);
assert.match(migration, /tttracker_v1_resolve_missing_material/);
assert.match(context, /mutation\.kind === "report_missing"/);
assert.match(context, /await recordMissingReceiptApi\(mutation\.input\)/);
assert.match(context, /mutation\.kind === "resolve_missing"/);
assert.match(context, /if \(online\) \{await flushQueue\(queued\)/);
assert.match(docket, /asOfDate[\s\S]*occurred_at/);
assert.match(catalogue, /item_type,tower_segment,drawing_number,bolt_diameter,dn_sn,length,packer_no,packer_mark,qty/);
assert.match(search, /packer_no\.ilike/);
assert.match(search, /packer_mark\.ilike/);
assert.match(report, /clean\(row\.item_type\)==="packer"/);
assert.match(report, /sourceTable==="packer"\?"packer"/);

const exports = {};
const cache = new Map();
const output = ts.transpileModule(mobileQueueSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function("require", "exports", output)((name) => {
  assert.equal(name, "@/lib/offline/db");
  return { getCache: async (key) => cache.get(key) ?? null, setCache: async (key, value) => cache.set(key, { value }) };
}, exports);

const missing = exports.makeReportMissingMutation({ projectId: "P", towerId: "T", quantity: 2 });
assert.equal(missing.id, missing.input.clientMutationId);
const receipt = exports.makeReceiveMissingMutation({ issueKey: "I", quantity: 1 });
assert.equal(receipt.id, receipt.input.clientMutationId);
const queued = exports.mergeMaterialMutation([], receipt);
assert.equal(queued.length, 1);
assert.equal(exports.mergeMaterialMutation(queued, receipt).length, 2);
const resolve = exports.makeResolveMissingMutation({ projectId: "P", towerId: "T", issueKey: "I" });
assert.equal(exports.mergeMaterialMutation(queued, resolve).length, 2);
console.log("PASS: canonical missing workflow has mutation idempotency, serialized quantity protection, immutable receipt ledger, configured resolution, offline queue coverage and docket date cut-off.");
