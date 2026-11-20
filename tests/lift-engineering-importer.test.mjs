import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("VSL+9 reference import defaults to read-only dry-run without creating a project study", () => {
  const output = execFileSync(process.execPath, ["scripts/lift-engineering/import-vsl9-gmk5220-reference.mjs"], { encoding: "utf8" });
  const report = JSON.parse(output);
  assert.equal(report.mode, "dry-run");
  assert.equal(report.lifts, 14);
  assert.equal(report.charts, 3);
  assert.equal(report.chartPoints, 6);
  assert.equal(report.externalReferenceReactionRows, 224);
  assert.equal(report.createsProjectStudy, false);
});
