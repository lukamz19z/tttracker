import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
const nodeRequire = createRequire(import.meta.url);

function loadTs(path, mockedRequire = nodeRequire) {
  const source = fs.readFileSync(path, "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const cjsModule = { exports: {} };
  new Function("require", "module", "exports", js)(mockedRequire, cjsModule, cjsModule.exports);
  return cjsModule.exports;
}

const dateValues = loadTs("lib/quality/punchlist-import-values.ts");
const dateModule = loadTs("lib/quality/defect-dates.ts", (name) => name === "./punchlist-import-values" ? dateValues : nodeRequire(name));
assert.equal(dateModule.defectRequiredByToDb("01/11/2026").value, "2026-11-01");
assert.equal(dateModule.defectRequiredByToDb("").value, null);
assert.equal(dateModule.defectRequiredByToDb("31/13/2026").error, "Required By must be DD/MM/YYYY.");
assert.equal(dateModule.defectRequiredByDisplay("2026-11-01"), "01/11/2026");
assert.equal(dateModule.defectRequiredByState("2026-10-30", "Open", "Australia/Sydney", new Date("2026-10-30T00:00:00Z")).relative, "Required Today");
assert.equal(dateModule.defectRequiredByState("2026-10-30", "In Progress", "Australia/Sydney", new Date("2026-10-31T00:00:00Z")).overdue, true);
assert.equal(dateModule.defectRequiredByState("2026-10-30", "Fixed", "Australia/Sydney", new Date("2026-10-31T00:00:00Z")), null);

const insertedNotifications = [];
const pushMessages = [];
const sentEmails = [];
const service = {
  auth: { admin: { getUserById: async (id) => ({ data: { user: { id, email: `${id}@example.test`, user_metadata: { full_name: `Name ${id}` } } } }) } },
  from(table) {
    const query = {
      select() { return query; },
      eq() { return query; },
      in() { return query; },
      insert(rows) { insertedNotifications.push(...rows); return Promise.resolve({ error: null }); },
      then(resolve, reject) {
        if (table === "project_defect_notification_rules") return Promise.resolve({ data: [{ user_id: "user-b", notify_new: true, notify_status_change: true, notify_action: true, notify_closed: true, notify_critical: true, notify_assignment: true, receives_email: true, receives_in_app: true, receives_push: true },{ user_id: "user-c", notify_new: true, notify_status_change: true, notify_action: true, notify_closed: true, notify_critical: true, notify_assignment: false, receives_email: true, receives_in_app: true, receives_push: true }], error: null }).then(resolve, reject);
        if (table === "user_push_tokens") return Promise.resolve({ data: [{ user_id: "user-b", expo_push_token: "ExponentPushToken[user-b]" }], error: null }).then(resolve, reject);
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      },
    };
    return query;
  },
};
const notifications = loadTs("lib/quality/defect-notifications.ts", (name) => {
  if (name === "@/lib/email/daily-dockets") return { docketEmailShell: (_title, html) => html, sendDailyDocketEmail: async (message) => sentEmails.push(message) };
  if (name === "@/lib/notifications/preferences") return { filterAppNotificationUserIds: async (_service, ids) => ids };
  if (name === "@/lib/quality/defect-dates") return dateModule;
  return nodeRequire(name);
});
global.fetch = async (_url, init) => { pushMessages.push(...JSON.parse(init.body)); return { ok: true, json: async () => ({ data: [{ status: "ok" }] }) }; };
await notifications.notifyDefectEvent({
  service,
  kind: "assigned",
  actorUserId: "user-a",
  actorLabel: "Michael Brown",
  issueTypeName: "Bent Member",
  towerLabel: "Tower 92",
  defect: { id: "defect-14", project_id: "project-1", tower_id: "tower-92", defect_number: "DEF-014", severity: "Critical", status: "Open", segment: "Bottom Crossarm", member_number: "273H", description: "Bent member", assigned_to_user_id: "user-b", assigned_to_label: "John Smith", required_by: "2026-11-01", work_impact: "Blocks Work", urgency_note: "Member required for erection tomorrow.", notify_user_ids: [] },
});
assert.equal(insertedNotifications.length, 1);
assert.equal(insertedNotifications[0].user_id, "user-b");
assert.match(insertedNotifications[0].message, /Blocks Work/);
assert.match(insertedNotifications[0].message, /Required 01\/11\/2026/);
assert.match(insertedNotifications[0].message, /Assigned to you by Michael Brown/);
assert.equal(pushMessages.length, 1);
assert.equal(pushMessages[0].data.defect_id, "defect-14");
assert.match(pushMessages[0].body, /Bottom Crossarm/);
assert.deepEqual(sentEmails.flatMap((email) => email.to), ["user-b@example.test"]);
assert.equal(insertedNotifications.some((row) => row.user_id === "user-c"), false);

const db = new PGlite();
await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create table projects(id uuid primary key); create table tower_defects(id uuid primary key, project_id uuid, tower_id uuid, status text); create table defect_actions(id uuid primary key); create table project_defect_notification_rules(id uuid primary key);");
await db.exec("insert into projects(id) values ('00000000-0000-0000-0000-000000000001')");
const migration = fs.readFileSync("supabase/migrations/20261031170000_v1_defect_operational_urgency.sql", "utf8");
await db.exec(migration);
await db.exec(migration);
const migrated = await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='tower_defects'");
assert.ok(migrated.rows.some((row) => row.column_name === "required_by"));
assert.ok(migrated.rows.some((row) => row.column_name === "notify_user_ids"));
const seeded = await db.query("select count(*)::int as count from project_defect_workflow_settings");
assert.equal(seeded.rows[0].count, 1);
await db.close();

const createRoute = fs.readFileSync("app/api/quality/defects/route.ts", "utf8");
const patchRoute = fs.readFileSync("app/api/quality/defects/[defectId]/route.ts", "utf8");
const actionsRoute = fs.readFileSync("app/api/quality/defects/[defectId]/actions/route.ts", "utf8");
const mobileRegister = fs.readFileSync("mobile/app/defects/index.tsx", "utf8");
const mobileCreate = fs.readFileSync("mobile/app/defects/new.tsx", "utf8");
const mobileDetail = fs.readFileSync("mobile/app/defects/[defectId].tsx", "utf8");
const websiteRegister = fs.readFileSync("app/(protected)/project/[projectId]/tower/[towerId]/defects/page.tsx", "utf8");
assert.match(createRoute, /tower_docket_defects/);
assert.match(createRoute, /notify_user_ids: notifyUserIds/);
assert.match(patchRoute, /required_by: requiredBy\.value/);
assert.match(patchRoute, /created_by_user_id/);
assert.match(actionsRoute, /created_by_user_id/);
assert.match(mobileCreate, /getDefectWorkflowOptions/);
assert.match(mobileCreate, /label="Take defect photo"/);
assert.match(mobileDetail, /Required By · DD\/MM\/YYYY/);
assert.match(mobileRegister, /Assigned to Me/);
assert.match(mobileRegister, /Required Today/);
assert.match(websiteRegister, /Also notify \(optional\)/);
assert.match(websiteRegister, /Required By · DD\/MM\/YYYY/);
console.log("V1 Defect operational dates, direct assignment notification, urgency, additive migration, audit and docket-link checks passed.");
