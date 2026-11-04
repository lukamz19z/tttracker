import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require(path.resolve("node_modules/typescript"));
const page = fs.readFileSync("app/(protected)/assets/equipment/lifting-gear/page.tsx", "utf8");
const helper = fs.readFileSync("lib/assets/lifting-gear-bulk.ts", "utf8");
const exports = {};
const output = ts.transpileModule(helper, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function("exports", output)(exports);

const { buildLiftingGearBulkPatch, getBulkCrewSelection, MULTIPLE_LIFTING_GEAR_CREWS, UNASSIGNED_LIFTING_GEAR_CREW } = exports;
const crews = [
  { id: "crew-b", crew_number: "B", crew_name: "Crew B" },
  { id: "crew-c", crew_number: "C", crew_name: "Crew C" },
];
const values = {
  tag: "Blue",
  inspected_on: "2026-11-04",
  next_inspection_due: "2027-11-04",
  event_type: "Visual Inspection",
  comment: "unchanged unless selected",
  status: "Passed",
  crew_id: "crew-b",
};

test("same-crew selected items initialise one canonical crew value", () => {
  const selection = getBulkCrewSelection(Array.from({ length: 5 }, () => ({ crew_id: "crew-a" })));
  assert.equal(selection, "crew-a");
});

test("mixed crews show Multiple crews and all-unassigned shows Unassigned", () => {
  assert.equal(getBulkCrewSelection([{ crew_id: "crew-a" }, { crew_id: "crew-b" }]), MULTIPLE_LIFTING_GEAR_CREWS);
  assert.equal(getBulkCrewSelection([{ crew_id: null }, { crew_id: null }]), UNASSIGNED_LIFTING_GEAR_CREW);
});

test("crew-only update patches canonical crew ID and label without touching other fields", () => {
  const original = { status: "Failed", tag: "Red", serial_id: "CB-01", crew_id: "crew-a", crew_label: "A" };
  const patch = buildLiftingGearBulkPatch({ fields: new Set(["crew_id"]), values, crews, updatedAt: "now" });
  assert.deepEqual(patch, { updated_at: "now", crew_id: "crew-b", crew_label: "B - Crew B" });
  assert.deepEqual({ ...original, ...patch }, { ...original, crew_id: "crew-b", crew_label: "B - Crew B", updated_at: "now" });
});

test("multiple selected fields are patched together without adding unselected columns", () => {
  const patch = buildLiftingGearBulkPatch({ fields: new Set(["crew_id", "status"]), values, crews, updatedAt: "now" });
  assert.deepEqual(patch, { updated_at: "now", crew_id: "crew-b", crew_label: "B - Crew B", status: "Passed" });
});

test("Unassigned clears nullable crew ID and label; mixed value cannot be applied", () => {
  const patch = buildLiftingGearBulkPatch({ fields: new Set(["crew_id"]), values: { ...values, crew_id: UNASSIGNED_LIFTING_GEAR_CREW }, crews, updatedAt: "now" });
  assert.equal(patch.crew_id, null);
  assert.equal(patch.crew_label, null);
  assert.throws(() => buildLiftingGearBulkPatch({ fields: new Set(["crew_id"]), values: { ...values, crew_id: MULTIPLE_LIFTING_GEAR_CREWS }, crews, updatedAt: "now" }), /Choose a configured crew or Unassigned/);
});

test("bulk UI requires selected rows and updates only their IDs through the existing table patch", () => {
  assert.match(page, /selectedGearIds/);
  assert.match(page, /disabled=\{selectedItems\.length === 0\}/);
  assert.match(page, /items\.filter\(\(item\) => bulkItemIds\.includes\(item\.id\)\)/);
  assert.match(page, /\.from\("equipment_lifting_gear"\)[\s\S]*?\.update\(update\)[\s\S]*?\.in\("id", ids\)/);
  assert.match(page, /getBulkCrewSelection\(selectedItems\)/);
});
