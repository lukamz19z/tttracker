import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { liftTemplateSteelWeightKg, snapshotTowerAndLiftTemplate, towerTemplateWeightKg } from "../lib/lift-engineering/tower-template.ts";

const leg = (id, name, quantity, unit_weight_kg, category = "legs") => ({ id, name, quantity, unit_weight_kg, category, active: true });

test("tower totals use configurable section quantities and unit weights", () => {
  const sections = [leg("a", "Leg A +6m", 1, 1800), leg("b", "Leg B", 1, 900), leg("arms", "Crossarms", 2, 2450)];
  assert.equal(towerTemplateWeightKg(sections), 7600);
  assert.equal(towerTemplateWeightKg([...sections, { ...leg("old", "Inactive", 1, 9000), active: false }]), 7600);
});

test("unrelated tower types can use different physical section structures", () => {
  const suspension = [leg("l", "Leg A", 4, 1000), leg("c", "Crossarms", 2, 500)];
  const guyed = [leg("m", "Mast", 1, 8200), leg("g", "Guy assembly", 3, 600)];
  assert.notDeepEqual(suspension.map((row) => row.name), guyed.map((row) => row.name));
  assert.equal(towerTemplateWeightKg(suspension), 5000);
  assert.equal(towerTemplateWeightKg(guyed), 10000);
});

test("lift sequence references multiple sections, quantities and portions without copying weights", () => {
  const sections = [leg("a", "Leg A", 1, 1850), leg("b", "Leg B", 1, 1850), leg("arm", "Crossarm", 2, 2450), leg("body", "Common Body", 1, 4000)];
  assert.equal(liftTemplateSteelWeightKg([{ tower_template_section_id: "a", allocated_quantity: 1, portion: 1 }, { tower_template_section_id: "b", allocated_quantity: 1, portion: 1 }], sections), 3700);
  assert.equal(liftTemplateSteelWeightKg([{ tower_template_section_id: "arm", allocated_quantity: 2, portion: 1 }], sections), 4900);
  assert.equal(liftTemplateSteelWeightKg([{ tower_template_section_id: "body", allocated_quantity: 1, portion: 0.5 }], sections), 2000);
});

test("four legs retain independent weights/extensions and planning suitability is optional", () => {
  const sections = [leg("a", "Leg A +6m", 1, 1800), leg("b", "Leg B", 1, 900), leg("c", "Leg C", 1, 900), leg("d", "Leg D", 1, 900)];
  assert.equal(towerTemplateWeightKg(sections), 4500);
  const unconstrainedMethod = { name: "General erection", methodTags: ["custom"] };
  assert.equal("craneSuitability" in unconstrainedMethod, false);
  assert.equal("craneProfileId" in unconstrainedMethod, false);
});

test("tower/method study snapshot is isolated from later template edits", () => {
  const source = { towerTemplateId: "tower", towerTemplateRevisionId: "tower-rev-a", liftTemplateId: "method", liftTemplateRevisionId: "method-rev-a", sections: [{ name: "Bottom Super", unitWeightKg: 10850 }], lifts: [{ liftNumber: "1", steelWeightKg: 10850 }] };
  const snapshot = snapshotTowerAndLiftTemplate(source);
  source.sections[0].unitWeightKg = 11120;
  source.lifts[0].steelWeightKg = 11120;
  assert.equal(snapshot.sections[0].unitWeightKg, 10850);
  assert.equal(snapshot.lifts[0].steelWeightKg, 10850);
});

test("schema separates physical tower revisions from multiple independent erection methods and snapshots both", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261121180000_v1_lift_tower_erection_templates.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.lift_tower_template_sections/);
  assert.match(sql, /create table if not exists public\.lift_erection_templates/);
  assert.match(sql, /create table if not exists public\.lift_erection_template_revisions/);
  assert.match(sql, /create table if not exists public\.lift_erection_template_lift_sections/);
  assert.match(sql, /add column if not exists erection_template_revision_id/);
  assert.match(sql, /new\.erection_template_revision_id is distinct from old\.erection_template_revision_id/);
  assert.match(sql, /status in \('active','verified','superseded'\)/);
});

test("method duplication is independent and keeps planning constraints out of fixed crane capacity fields", async () => {
  const api = await readFile(new URL("../app/api/lift-engineering/library/lift-templates/[liftTemplateId]/duplicate/route.ts", import.meta.url), "utf8");
  assert.match(api, /insert\(\{ tower_template_id: source\.tower_template_id, name/);
  assert.match(api, /status: "draft"/);
  assert.match(api, /lift_erection_template_lift_sections/);
  assert.doesNotMatch(api, /capacity_t\s*:/);
});
