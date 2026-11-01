import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../migrations/20261102120000_v1_daily_docket_retract_delete.sql", import.meta.url), "utf8");
const route = await readFile(new URL("../../app/api/daily-dockets/[docketId]/lifecycle/route.ts", import.meta.url), "utf8");
const webList = await readFile(new URL("../../app/(protected)/project/[projectId]/tower/[towerId]/dockets/page.tsx", import.meta.url), "utf8");
const mobileList = await readFile(new URL("../../mobile/app/(drawer)/daily-dockets.tsx", import.meta.url), "utf8");
const progress = await readFile(new URL("../../lib/dockets/tower-progress.ts", import.meta.url), "utf8");

test("retraction only accepts pending BC submission and returns it to draft atomically", () => {
  assert.match(migration, /for update/);
  assert.match(migration, /d\.approval_status not in \('submitted_bc','client_pending'\)/);
  assert.match(migration, /approval_status = 'draft', retracted_at = now_at/);
  assert.match(migration, /status = 'superseded'/);
  assert.match(migration, /bc_signature_data_url = null/);
  assert.match(migration, /client_signature_data_url = null/);
  assert.match(migration, /event_name := 'retracted'/);
  assert.match(route, /daily_dockets\.approve/);
  assert.match(route, /isConfiguredBcReviewer/);
  assert.match(route, /ownerId !== user\.id/);
});

test("delete is an audited tombstone and leaves linked commercial records intact", () => {
  assert.match(migration, /set deleted_at = now_at, deleted_by_user_id = p_actor_user_id/);
  assert.doesNotMatch(migration, /set approval_status = 'deleted'/);
  assert.match(migration, /event_name := 'deleted'/);
  assert.doesNotMatch(migration, /delete from public\.tower_docket_/i);
  assert.match(route, /tttracker_v1_daily_docket_lifecycle/);
});

test("website and mobile expose confirmed retract/delete lifecycle actions", () => {
  assert.match(webList, /Retract this submitted Daily Docket for editing\?/);
  assert.match(webList, /Delete this Daily Docket\? This will remove it from active project records\./);
  assert.match(webList, /action: "retract"/);
  assert.match(webList, /action: "delete"/);
  assert.match(mobileList, /Retract this submitted docket for editing\?/);
  assert.match(mobileList, /Delete this Daily Docket\?/);
  assert.match(mobileList, /runDailyDocketLifecycleAction/);
});

test("tombstoned dockets are excluded from tower progress resolution", () => {
  assert.match(progress, /!docket\.deleted_at && docket\.approval_status !== "deleted"/);
  assert.match(webList, /is\("deleted_at", null\)/);
});
