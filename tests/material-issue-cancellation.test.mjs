import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { remainingMaterialIssueQuantity } from "../lib/materials/issue-quantity.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("open and partial cancellation close actionable quantity without changing receipt history", () => {
  assert.equal(remainingMaterialIssueQuantity("outstanding", 30, 0), 30);
  assert.equal(remainingMaterialIssueQuantity("partially_received", 30, 10), 20);
  assert.equal(remainingMaterialIssueQuantity("cancelled", 30, 10), 0);
  assert.equal(remainingMaterialIssueQuantity("cancelled", 30, 10, 5), 0);
});

test("canonical cancellation is locked, audited, retained and idempotent for Missing and Excess", async () => {
  const migration = await read("supabase/migrations/20261104120000_v1_material_issue_cancellation.sql");
  assert.match(migration, /event_type in \('missing','excess'\)/);
  assert.match(migration, /for update of e/);
  assert.match(migration, /issue_status='cancelled',cancelled_by_user_id=p_user_id/);
  assert.match(migration, /cancelled_at=now\(\),cancellation_reason=nullif\(trim\(p_body\),''\)/);
  assert.match(migration, /insert into public\.tower_material_event_actions/);
  assert.match(migration, /v_event\.issue_status='cancelled' and p_action_type='cancel'[\s\S]*already_cancelled/);
  assert.match(migration, /v_event\.issue_status='resolved'[\s\S]*raise exception/);
  assert.doesNotMatch(migration, /delete from public\.tower_material_(events|event_items|event_actions|receipt)/i);
});

test("cancel API reconciles ambiguous writes and dispatches one cancellation notification attempt", async () => {
  const route = await read("app/api/mobile/materials/missing/actions/route.ts");
  assert.match(route, /actionType==="cancel"&&existingStatus==="cancelled"[\s\S]*alreadyCancelled:true/);
  assert.match(route, /if\(actionType==="cancel"\)[\s\S]*issue_status[\s\S]*==="cancelled"[\s\S]*alreadyCancelled:true/);
  assert.match(route, /const notifyUserIds=actionType==="cancel"\?null/);
  assert.match(route, /alreadyCancelled:true[\s\S]*const materialUsers=actionType==="assignment"\|\|notifyUserIds\?\.length/);
  assert.match(route, /if\(!action\.duplicate&&row\.action_type==="cancel"\)/);
  assert.match(route, /catch\(notificationError\)[\s\S]*Material cancellation notification dispatch failed/);
  assert.match(route, /tttracker_v1_missing_material_action/);
});

test("mobile cancellation confirms, coalesces taps, reconciles status and updates cached issue state", async () => {
  const [screen, context] = await Promise.all([
    read("mobile/app/materials/missing.tsx"),
    read("mobile/contexts/MaterialsContext.tsx"),
  ]);
  assert.match(screen, /Cancel this material issue\?/);
  assert.match(screen, /actionInFlight\.current/);
  assert.match(screen, /Cancellation could not be confirmed/);
  assert.match(screen, /markMissingMaterialCancelled\(issue\.id,text\)/);
  assert.match(context, /issue_status: "cancelled"/);
  assert.match(context, /persist\(next\)/);
});

test("website cancellation confirms, uses returned lifecycle state and refreshes summary data", async () => {
  const [panel, page] = await Promise.all([
    read("components/materials/MissingMaterialCanonicalPanel.tsx"),
    read("app/(protected)/project/[projectId]/tower/[towerId]/materials/page.tsx"),
  ]);
  assert.match(panel, /window\.confirm\("Cancel this material issue\?/);
  assert.match(panel, /actionInFlight\.current/);
  assert.match(panel, /clean\(current\.event\.issue_status\)==="cancelled"/);
  assert.match(panel, /currentStatus!=="cancelled"&&currentStatus!=="resolved"/);
  assert.match(page, /remainingMaterialIssueQuantity\(event\.issue_status, originalQty, deliveredQty\)/);
  assert.match(page, /onChanged=\{data\.refresh\}/);
  assert.match(page, /filter === "cancelled"\s*\? excessEvents\.filter\(\(event\) => event\.issue_status === "cancelled"\)/);
});

test("mobile/web issue status and outstanding quantity exclude cancelled rows", async () => {
  const [screen, page] = await Promise.all([
    read("mobile/app/materials/missing.tsx"),
    read("app/(protected)/project/[projectId]/tower/[towerId]/materials/page.tsx"),
  ]);
  assert.match(screen, /remainingMaterialIssueQuantity\(event\.issue_status,originalQty,receivedQty\)/);
  assert.match(screen, /row\.status==="cancelled"/);
  assert.match(page, /remainingMaterialIssueQuantity\(event\.issue_status, originalQty, deliveredQty\)/);
  assert.match(page, /const cancelled = missingIssues\.filter\(\(row\) => row\.status === "cancelled"\)/);
});
