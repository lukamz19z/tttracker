import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { configurationBaseIdentityKey, sameConfigurationBase } from "../lib/lift-engineering/configuration-identity.ts";

const base = {
  craneProfileId: "crane-a",
  counterweightT: 41,
  outriggerState: "Full outriggers",
  outriggerLengthM: 8.557,
  outriggerWidthM: 8.1,
  slewRange: "360°",
};

test("base configuration identity ignores editable name and normalizes dimensions", () => {
  const equivalent = { ...base, outriggerLengthM: 8.5570001, outriggerState: "renamed label" };
  assert.equal(sameConfigurationBase(base, equivalent), true);
  assert.equal(configurationBaseIdentityKey(base), configurationBaseIdentityKey(equivalent));
});

test("base configuration identity distinguishes crane, counterweight, outrigger setup and slew", () => {
  assert.equal(sameConfigurationBase(base, { ...base, craneProfileId: "crane-b" }), false);
  assert.equal(sameConfigurationBase(base, { ...base, counterweightT: 50 }), false);
  assert.equal(sameConfigurationBase(base, { ...base, outriggerWidthM: 7.2 }), false);
  assert.equal(sameConfigurationBase(base, { ...base, slewRange: "180°" }), false);
});

test("custom setup uses its setup label when dimensions are unavailable", () => {
  const custom = { ...base, outriggerState: "Rear only", outriggerLengthM: null, outriggerWidthM: null };
  assert.equal(sameConfigurationBase(custom, { ...custom, outriggerState: "rear only" }), true);
  assert.equal(sameConfigurationBase(custom, { ...custom, outriggerState: "full span" }), false);
});

test("configuration create is single-submit, idempotent by base setup and opens returned record", async () => {
  const route = await readFile(new URL("../app/api/lift-engineering/library/[resource]/route.ts", import.meta.url), "utf8");
  const form = await readFile(new URL("../app/(protected)/lift-engineering/library/[resource]/CraneConfigurationsLibrary.tsx", import.meta.url), "utf8");
  assert.match(route, /sameConfigurationBase\(currentIdentity, requestedIdentity\)/);
  assert.match(route, /existing: true/);
  assert.match(form, /if \(submitting\.current\) return/);
  assert.match(form, /router\.push\(`\/lift-engineering\/library\/configurations/);
  assert.match(form, /configurationRevision/);
});

test("configuration deletion only permits unused single-draft setup and returns archive guidance", async () => {
  const route = await readFile(new URL("../app/api/lift-engineering/library/[resource]/route.ts", import.meta.url), "utf8");
  const detail = await readFile(new URL("../app/(protected)/lift-engineering/library/[resource]/CraneConfigurationDetail.tsx", import.meta.url), "utf8");
  assert.match(route, /lift_study_revisions/);
  assert.match(route, /lift_load_charts/);
  assert.match(route, /revisions\?\.length === 1 && String\(revisions\[0\]\.status\)\.toLowerCase\(\) === "draft"/);
  assert.match(route, /archiveAvailable: true/);
  assert.match(detail, /Delete crane configuration\?/);
  assert.match(detail, /Archive Configuration/);
});
