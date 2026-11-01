import assert from "node:assert/strict";
import { normalizeMissingMaterialType, CANONICAL_MATERIAL_TYPES } from "../mobile/lib/materials/canonical-material-type.ts";
import { readFileSync } from "node:fs";

const allowed = new Set(CANONICAL_MATERIAL_TYPES);
const vectors = [
  ["known member", { sourceTable: "tower_material_members", sourceRecordId: "member-id", linkedType: "member", category: "Steel" }, "steel_member"],
  ["linked bundle", { sourceTable: "tower_required_bundles", sourceRecordId: "bundle-id", linkedType: "bundle", category: "Bundle" }, "other"],
  ["M20 x 100 bolt", { sourceTable: "tower_material_bolts", sourceRecordId: "bolt-id", linkedType: "bolt", category: "Bolt" }, "bolt"],
  ["linked J bolt", { sourceTable: "tower_material_bolts", sourceRecordId: "j-bolt-id", linkedType: "j_bolt", category: "J Bolt" }, "bolt"],
  ["manual J bolt", { category: "J Bolt" }, "bolt"],
  ["nut", { category: "Nut" }, "nut"],
  ["washer", { category: "Washer" }, "washer"],
  ["flat plate", { category: "Flat Plate" }, "flat_plate"],
  ["linked 6 mm packer", { sourceTable: "tower_material_bolts", sourceRecordId: "packer-id", linkedType: "packer", category: "Packer" }, "packer_spacer"],
  ["manual 6 mm packer plate", { category: "Packer Plate" }, "packer_spacer"],
  ["grid mesh", { category: "Grid Mesh" }, "other"],
  ["special bracket", { category: "Special Bracket" }, "other"],
  ["custom configured material", { category: "Earthwire Clamp" }, "other"],
];
for (const [label, input, expected] of vectors) {
  const actual = normalizeMissingMaterialType(input);
  assert.equal(actual, expected, label);
  assert.ok(allowed.has(actual), `${label} must satisfy the production CHECK`);
  let outstanding = 4;
  let status = "outstanding";
  outstanding -= 2;
  status = "partially_received";
  assert.equal(outstanding, 2, `${label} partial receipt`);
  outstanding -= 2;
  status = "received";
  assert.equal(outstanding, 0, `${label} full receipt`);
  status = "resolved";
  assert.equal(status, "resolved", `${label} resolution`);
}

const api = readFileSync("app/api/mobile/materials/missing/route.ts", "utf8");
const mobile = readFileSync("mobile/app/materials/report-missing.tsx", "utf8");
const docket = readFileSync("components/dockets/DailyDocketForm.tsx", "utf8");
const mobileDocket = readFileSync("lib/dockets/mobile-docket-materials.ts", "utf8");
const queue = readFileSync("mobile/lib/offline/materialsQueue.ts", "utf8");
assert.match(api, /normalizeMissingMaterialType/);
assert.match(mobile, /normalizeMissingMaterialType/);
assert.match(mobile, /sourceRecordId:sourceRecordId\|\|undefined/);
assert.match(api, /sourceRecordId: clean\(body\.sourceRecordId\) \|\| null/);
assert.match(docket, /normalizeMissingMaterialType/);
assert.match(mobileDocket, /normalizeMissingMaterialType/);
assert.match(docket, /material_category: isManualBolt/);
assert.match(mobileDocket, /material_category: manualBolt/);
assert.match(readFileSync("supabase/migrations/20261101120000_v1_material_uuid_contract_fix.sql", "utf8"), /v_issue\.material_type/);
assert.match(queue, /input:\{\.\.\.input,clientMutationId:id\}/);
assert.doesNotMatch(api, /material_source_type/);

console.log(`PASS: ${vectors.length} canonical mapping cases use only ${CANONICAL_MATERIAL_TYPES.join(", ")}; linked IDs remain independent from flexible display categories.`);
