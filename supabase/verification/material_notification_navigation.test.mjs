import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routing = await readFile(new URL("../../mobile/lib/notifications/routing.ts", import.meta.url), "utf8");
const missingScreen = await readFile(new URL("../../mobile/app/materials/missing.tsx", import.meta.url), "utf8");
const notificationService = await readFile(new URL("../../lib/materials/missing-notifications.ts", import.meta.url), "utf8");
const receiptsRoute = await readFile(new URL("../../app/api/mobile/push/material-receipts/route.ts", import.meta.url), "utf8");
const materialApi = await readFile(new URL("../../mobile/lib/api/materials.ts", import.meta.url), "utf8");
const materialContext = await readFile(new URL("../../mobile/contexts/MaterialsContext.tsx", import.meta.url), "utf8");
const receiptMigration = await readFile(new URL("../migrations/20261101140000_v1_material_push_receipts.sql", import.meta.url), "utf8");

test("Missing Material notifications route by explicit IDs and never seed visible search", () => {
  assert.match(notificationService, /type:"missing_material",eventId:event\.id,issueKey:item\.issue_key,projectId,towerId:event\.tower_id/);
  assert.match(routing, /material_event_id: materialEventId/);
  assert.match(routing, /material_issue_key: issueKey/);
  assert.doesNotMatch(routing, /issue_key:\s*materialEventId|search:\s*materialEventId/);
  assert.match(missingScreen, /setQuery\(""\)/);
  assert.match(missingScreen, /loadMissingMaterialDetails\(deepProjectId,deepIssueKey\|\|undefined,deepEventId\|\|undefined\)/);
  assert.match(missingScreen, /loadMaterialProjectUsers\(deepProjectId\)/);
});

test("Expo ticket and receipt outcomes remain separate from canonical in-app notification rows", () => {
  assert.match(notificationService, /delivery_status:"ticket_accepted",expo_ticket_id:ticket\.id/);
  assert.match(notificationService, /material_push_delivery_attempts/);
  assert.match(notificationService, /expo_token_hash:tokenHash/);
  assert.match(receiptMigration, /unique\(source_event_id,event_type,user_id,expo_token_hash\)/);
  assert.match(receiptsRoute, /push\/getReceipts/);
  assert.match(receiptsRoute, /delivery_status: "delivered"/);
  assert.match(receiptsRoute, /Releasing this channel claim permits a later canonical retry/);
  assert.match(receiptsRoute, /material_push_delivery_attempts"\)\.delete\(\)\.eq\("id", row\.id\)/);
});

test("Materials refresh avoids eager full register loading and exposes scoped search", () => {
  assert.match(materialApi, /\/api\/mobile\/materials\/search\?/);
  assert.match(materialApi, /kind,towerId,q:value/);
  assert.doesNotMatch(materialApi, /cataloguePending/);
  assert.doesNotMatch(materialContext, /refreshMaterials\(projectId,\s*[^)]*,/);
});
