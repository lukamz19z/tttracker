import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mergeDefectRecipientIds } from "../lib/quality/defect-recipient-channels.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Defect Notify merges configured manual recipients and automatic subscribers once", () => {
  const recipients = mergeDefectRecipientIds(["a", "c"], ["a", "b", "b"], "owner", "created");
  assert.deepEqual(recipients.sort(), ["a", "b", "c"]);
  assert.ok(!recipients.includes("owner"), "responsible person is not implicitly notified on Defect Raised");
});

test("responsible person is notified for assignment events without duplicating Notify selection", () => {
  const recipients = mergeDefectRecipientIds(["a"], ["a", "b"], "b", "assigned");
  assert.deepEqual(recipients.sort(), ["a", "b"]);
});

test("responsible person retains follow-up visibility while Defect Raised does not implicitly notify them", () => {
  const recipients = mergeDefectRecipientIds([], [], "owner", "status_changed");
  assert.deepEqual(recipients, ["owner"]);
});

test("Defect API keeps Notify IDs project scoped and persisted; Notify is not required", async () => {
  const [route, recipients, notification] = await Promise.all([
    read("app/api/quality/defects/route.ts"),
    read("lib/quality/defect-recipients.ts"),
    read("lib/quality/defect-notifications.ts"),
  ]);
  assert.match(route, /assertProjectDefectRecipients\(service, projectId, \[\.\.\.notifyUserIds/);
  assert.match(route, /notify_user_ids: notifyUserIds/);
  assert.match(recipients, /\.eq\("project_id", projectId\)/);
  assert.match(recipients, /available_for_selection/);
  assert.match(notification, /mergeDefectRecipientIds/);
  assert.match(notification, /email: true, inApp: true, push: true/);
  assert.match(notification, /to: \[recipient\.email!\]/);
  assert.match(notification, /defectId=\$\{encodeURIComponent\(defect\.id\)\}/);
});

test("Defect web and mobile forms expose Notify checkboxes without the Assign To / Also Notify split", async () => {
  const [web, mobileNew, mobileDetail, multi] = await Promise.all([
    read("app/(protected)/project/[projectId]/tower/[towerId]/defects/page.tsx"),
    read("mobile/app/defects/new.tsx"),
    read("mobile/app/defects/[defectId].tsx"),
    read("mobile/components/quality/QualityMultiSelect.tsx"),
  ]);
  for (const source of [web, mobileNew, mobileDetail]) {
    assert.match(source, /Notify/);
    assert.match(source, /notify_user_ids|notifyUserIds/);
    assert.doesNotMatch(source, /Also notify/i);
  }
  assert.match(web, /type="checkbox"/);
  assert.match(multi, /accessibilityRole="checkbox"/);
  assert.match(multi, />Done</);
  assert.match(mobileNew, /Responsible person/);
  assert.match(mobileDetail, /Responsible person/);
});

test("Materials receipt Notify is optional, project configured, persisted on receipt event and sent directly", async () => {
  const [screen, route, helper, users, types, queue] = await Promise.all([
    read("mobile/app/materials/missing.tsx"),
    read("app/api/mobile/materials/missing/receive/route.ts"),
    read("lib/materials/missing-notifications.ts"),
    read("lib/materials/configured-users.ts"),
    read("mobile/types/materials.ts"),
    read("mobile/lib/offline/materialsQueue.ts"),
  ]);
  assert.match(screen, /<Text style=\{styles\.fieldLabel\}>Notify/);
  assert.match(screen, /QualityMultiSelect visible=\{userPicker==="receipt_notify"\}/);
  assert.match(screen, /notifyUserIds:receiveNotifyUserIds/);
  assert.match(types, /notifyUserIds\?: string\[\]/);
  assert.match(queue, /input:\s*RecordMissingReceiptInput/);
  assert.match(route, /configuredMaterialUsers\(service, parent\.project_id\)/);
  assert.match(route, /notify_user_ids: notifyUserIds/);
  assert.match(route, /includeIssueRecipients: false/);
  assert.match(helper, /args\.notifyUserIds/);
  assert.match(helper, /mergeExplicitMaterialRecipientChannels/);
  assert.match(users, /project_material_notification_rules/);
});

test("Materials receipt direct selection is deduped with automatic rules and actor suppression remains", async () => {
  const helper = await read("lib/materials/missing-notifications.ts");
  assert.match(helper, /channels\.set\(rule\.user_id/);
  assert.match(helper, /includeIssueRecipients === false/);
  assert.match(helper, /args\.notifyUserIds/);
  assert.match(helper, /channels\.delete\(args\.actorUserId\)/);
  assert.match(helper, /\.\.\.explicitRecipientIds/);
  assert.match(helper, /material_notification_deliveries/);
  assert.match(helper, /to:\[identity\.email!\]/);
  assert.match(helper, /buildMaterialIssueUrl/);
});
