import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Defect selection is project-scoped and only returns explicitly configured users", async () => {
  const [route, validator, migration] = await Promise.all([
    read("app/api/quality/defects/notification-settings/route.ts"),
    read("lib/quality/defect-recipients.ts"),
    read("supabase/migrations/20261102110000_v1_defect_user_selection.sql"),
  ]);
  assert.match(route, /available_for_selection/);
  assert.match(route, /project_access/);
  assert.match(route, /const users = projectUserOptions\.filter\(\(option\) => selectedIds\.has\(option\.id\)\)/);
  assert.match(validator, /eq\("available_for_selection", true\)/);
  assert.doesNotMatch(validator, /user_roles|role ===|administrator/);
  assert.match(migration, /available_for_selection boolean not null default true/);
});

test("explicit Defect assignees and Also Notify users get one private direct email each", async () => {
  const dispatcher = await read("lib/quality/defect-notifications.ts");
  assert.match(dispatcher, /for \(const userId of defect\.notify_user_ids/);
  assert.match(dispatcher, /channels\.set\(userId, \{ email: true, inApp: true, push: true \}\)/);
  assert.match(dispatcher, /channels\.delete\(actorUserId\)/);
  assert.match(dispatcher, /emailRecipients\.map\(\(recipient\) => sendDailyDocketEmail/);
  assert.match(dispatcher, /to: \[recipient\.email!\]/);
  assert.match(dispatcher, /defects\?defectId=.*defect\.id/);
  assert.match(dispatcher, /View Defect/);
});

test("website notification link opens the requested canonical Defect", async () => {
  const page = await read("app/(protected)/project/[projectId]/tower/[towerId]/defects/page.tsx");
  assert.match(page, /searchParams\.get\("defectId"\)/);
  assert.match(page, /openActions\(row\)/);
});
