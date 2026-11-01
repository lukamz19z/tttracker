import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { selectDocketMaterialSnapshot } from "../../lib/dockets/material-issue-snapshot.mjs";

const webForm = await readFile(new URL("../../components/dockets/DailyDocketForm.tsx", import.meta.url), "utf8");
const mobileSave = await readFile(new URL("../../app/api/mobile/daily-dockets/save/route.ts", import.meta.url), "utf8");
const mobileEditor = await readFile(new URL("../../app/api/mobile/daily-dockets/editor/route.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/20261101153000_v1_material_excess_lifecycle.sql", import.meta.url), "utf8");
const webSubmit = await readFile(new URL("../../app/api/daily-dockets/[docketId]/submit-bc/route.ts", import.meta.url), "utf8");

test("Day 1 final docket keeps 24 Excess after later collection and transfer", () => {
  const dayOne = [{ issue_type: "excess", original_quantity: 24, received_quantity: 0, remaining_quantity: 24, status: "available", daily_activity: [] }];
  const liveDayThree = [{ issue_type: "excess", original_quantity: 24, received_quantity: 24, remaining_quantity: 0, status: "resolved", daily_activity: [{ action: "transferred", quantity: 12, source_tower_id: "tower-136", destination_tower_id: "tower-140" }] }];
  assert.deepEqual(selectDocketMaterialSnapshot("final", dayOne, liveDayThree), dayOne);
});

test("Day 2 final docket retains 12 collected and 12 remaining after Day 3 transfer", () => {
  const dayTwo = [{ issue_type: "excess", original_quantity: 24, received_quantity: 12, collected_today_quantity: 12, remaining_quantity: 12, status: "partially_collected", daily_activity: [{ action: "collected", quantity: 12, occurred_at: "2026-11-02T08:00:00Z", source_tower_id: "tower-136", destination_tower_id: null, reference: "Docket 5472" }] }];
  const liveDayThree = [{ issue_type: "excess", original_quantity: 24, received_quantity: 24, remaining_quantity: 0, status: "resolved", daily_activity: [{ action: "transferred", quantity: 12, source_tower_id: "tower-136", destination_tower_id: "tower-140" }] }];
  assert.deepEqual(selectDocketMaterialSnapshot("submitted_bc", dayTwo, liveDayThree), dayTwo);
  assert.equal(dayTwo[0].daily_activity[0].quantity, 12);
  assert.equal(dayTwo[0].remaining_quantity, 12);
});

test("Day 3 snapshot preserves transfer quantity and source/destination tower context", () => {
  const dayThree = [{ issue_type: "excess", original_quantity: 24, received_quantity: 24, remaining_quantity: 0, status: "resolved", daily_activity: [{ action: "transferred", quantity: 12, occurred_at: "2026-11-03T07:00:00Z", source_tower_id: "tower-136", destination_tower_id: "tower-140", reference: "Transfer 19" }] }];
  assert.deepEqual(selectDocketMaterialSnapshot("approved", dayThree, []), dayThree);
});

test("Drafts use live fallback and legacy historical dockets fall back safely", () => {
  const live = [{ issue_type: "missing", remaining_quantity: 4 }];
  assert.equal(selectDocketMaterialSnapshot("draft", [{ remaining_quantity: 99 }], live), live);
  assert.equal(selectDocketMaterialSnapshot("final", null, live), live);
  assert.deepEqual(selectDocketMaterialSnapshot("final", [], live), []);
});

test("Website and mobile save/read the same persisted snapshot field without rewriting material records", () => {
  assert.match(migration, /tower_daily_dockets add column if not exists material_issue_snapshot jsonb/);
  assert.match(webForm, /material_issue_snapshot: missingMaterialIssues/);
  assert.match(webSubmit, /material_issue_snapshot: materialIssueSnapshot/);
  assert.match(webSubmit, /loadOutstandingMobileMaterialIssues/);
  assert.match(webForm, /selectDocketMaterialSnapshot/);
  assert.match(mobileSave, /material_issue_snapshot: issueSnapshot/);
  assert.match(mobileEditor, /selectDocketMaterialSnapshot/);
  assert.match(webForm, /using the legacy date-based material history/);
});
