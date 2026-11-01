import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRequire } from "node:module";

const root = new URL("../../", import.meta.url);
const source = async path => readFile(new URL(path, root), "utf8");
const accessServer = await source("lib/access/server.ts");
const qualityServer = await source("lib/quality/server.ts");
const settingsRoute = await source("app/api/materials/missing/notification-settings/route.ts");
const storageRoute = await source("app/api/materials/missing/storage-settings/route.ts");
const webUsersRoute = await source("app/api/materials/missing/users/route.ts");
const mobileUsersRoute = await source("app/api/mobile/materials/users/route.ts");
const settingsPage = await source("app/(protected)/project/[projectId]/materials/notifications/page.tsx");
const permissionMigration = await source("supabase/migrations/20261101170000_v1_materials_permissions.sql");
const selectionMigration = await source("supabase/migrations/20261101173000_v1_material_notification_selection.sql");
const configuredSource = await source("lib/materials/configured-users.ts");
const reportRoute = await source("app/api/materials/missing/route.ts");
const mobileReportRoute = await source("app/api/mobile/materials/missing/route.ts");
const notifier = await source("lib/materials/missing-notifications.ts");
const websiteForm = await source("components/materials/ReportMissingMaterialForm.tsx");
const websiteDetail = await source("components/materials/MissingMaterialCanonicalPanel.tsx");
const mobileForm = await source("mobile/app/materials/report-missing.tsx");
const mobileDetail = await source("mobile/app/materials/missing.tsx");
const mobileActionsRoute = await source("app/api/mobile/materials/missing/actions/route.ts");
const mobileApi = await source("mobile/lib/api/materials.ts");
const require = createRequire(import.meta.url);
const ts = require("../../node_modules/typescript");

function loadConfiguredModule(projectMembers, configuredIds) {
  const file = new URL("../../lib/materials/configured-users.ts", import.meta.url);
  const js = ts.transpileModule(require("node:fs").readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const tables = [];
  const service = { from(table) {
    tables.push(table);
    const rows = table === "project_access" ? projectMembers : configuredIds.map(user_id => ({ user_id }));
    const query = { select() { return this; }, eq() { return this; }, then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); } };
    return query;
  } };
  const exports = {};
  new Function("require", "exports", js)(name => {
    if (name === "@/lib/materials/project-users") return { resolveProjectUserLabels: async (_service, ids) => ids.map(id => ({ id, name: `Person ${id}`, role: "Project User" })) };
    throw new Error(`Unexpected import ${name}`);
  }, exports);
  return { configuredMaterialUsers: exports.configuredMaterialUsers, service, tables };
}

test("full-access Admin inheritance remains shared with Materials configuration and Quality", () => {
  assert.match(accessServer, /export async function hasV1FullAccess/);
  assert.match(accessServer, /return hasV1FullAccess\(service, userId\)/);
  assert.match(qualityServer, /isQualityAdminRole\(role\) \|\| await hasV1FullAccess/);
  assert.match(settingsRoute, /requireMaterialsConfiguration/);
  assert.match(storageRoute, /requireMaterialsConfiguration/);
});

test("V1 permission catalogue and project selection flag use additive migrations", () => {
  for (const permission of ["materials.view", "materials.issues.view", "materials.manage_issues", "materials.configure", "mobile.materials"]) assert.ok(permissionMigration.includes(`'${permission}'`));
  assert.match(selectionMigration, /available_for_selection boolean not null default true/);
  assert.doesNotMatch(selectionMigration, /v2_permissions|v2_role_permissions/);
});

test("website settings manage an explicit project user list without permission-derived recipients", () => {
  assert.match(settingsRoute, /project_access/);
  assert.match(settingsRoute, /Recipient must be a member of this project/);
  assert.match(settingsRoute, /onConflict: "project_id,user_id"/);
  assert.match(settingsRoute, /available_for_selection: false/);
  assert.match(settingsPage, /Notification Users/);
  assert.match(settingsPage, /Add User/);
  assert.match(settingsPage, /Search project users by name or role/);
  assert.match(settingsPage, /Remove/);
  assert.match(settingsPage, /Optional automatic notifications/);
  assert.match(settingsPage, /No notification users configured/);
  assert.match(webUsersRoute, /configuredMaterialUsers/);
  assert.match(mobileUsersRoute, /configuredMaterialUsers/);
});

test("Assign To and Also Notify return the same configured list: 3 of 100 users", async () => {
  const members = Array.from({ length: 100 }, (_, index) => ({ user_id: `user-${index}` }));
  const configured = ["user-7", "user-35", "user-92"];
  const { configuredMaterialUsers, service, tables } = loadConfiguredModule(members, configured);
  const users = await configuredMaterialUsers(service, "project-a");
  assert.deepEqual(users.map(row => row.id), ["user-35", "user-7", "user-92"]);
  assert.equal(users.length, 3);
  assert.deepEqual(tables.sort(), ["project_access", "project_material_notification_rules"]);
  assert.doesNotMatch(configuredSource, /materials\.manage_issues|materials\.configure|fullAccessUserIds|roles\.grants_all/);
});

test("empty list stays empty and configured lists are isolated by project", async () => {
  const members = Array.from({ length: 100 }, (_, index) => ({ user_id: `user-${index}` }));
  const emptyModule = loadConfiguredModule(members, []);
  assert.deepEqual(await emptyModule.configuredMaterialUsers(emptyModule.service, "project-c"), []);
  const projectA = loadConfiguredModule(members, ["user-1", "user-2"]);
  const projectB = loadConfiguredModule(members, ["user-70"]);
  assert.deepEqual((await projectA.configuredMaterialUsers(projectA.service, "project-a")).map(row => row.id), ["user-1", "user-2"]);
  assert.deepEqual((await projectB.configuredMaterialUsers(projectB.service, "project-b")).map(row => row.id), ["user-70"]);
});

test("website and mobile Missing/Excess forms use one materialUsers array for both controls", () => {
  assert.match(websiteForm, /setMaterialUsers\(payload\.materialUsers\|\|\[\]\)/);
  assert.match(websiteForm, /Assign To[\s\S]*materialUsers\.map/);
  assert.match(websiteForm, /Also Notify[\s\S]*materialUsers\.map/);
  assert.match(mobileForm, /setMaterialUsers\(choices\.materialUsers\)/);
  assert.match(mobileForm, /Assign To[\s\S]*materialUsers\.map/);
  assert.match(mobileForm, /Also Notify[\s\S]*materialUsers\.map/);
  assert.match(mobileDetail, /setMaterialUsers\(users\.materialUsers\)/);
  assert.match(websiteDetail, /setMaterialUsers\(available\.materialUsers\|\|\[\]\)/);
});

test("server create/reassignment validates both controls against the same configured set", () => {
  for (const route of [reportRoute, mobileReportRoute]) {
    assert.match(route, /configuredMaterialUsers/);
    assert.match(route, /eligibleIds/);
    assert.doesNotMatch(route, /assignmentUsers|notifyUsers/);
  }
  assert.match(mobileActionsRoute, /materialUsers\.some\(row=>row\.id===assignedToUserId\)/);
  assert.match(mobileActionsRoute, /assignedToUserId!==previousAssigneeId/);
  assert.match(mobileActionsRoute, /assigned_to_label/);
});

test("saved assignee and selected recipients are deduplicated and reused for follow-up events", () => {
  assert.match(notifier, /const channels=new Map/);
  assert.match(notifier, /const directAssignee=/);
  assert.match(notifier, /event\.notify_user_ids/);
  assert.match(notifier, /channels\.set\(clean\(id\)/);
  assert.match(notifier, /channels\.delete\(args\.actorUserId\)/);
  assert.match(mobileActionsRoute, /previouslySelected\.has\(id\)/);
  assert.match(mobileDetail, /assigned_to_label/);
});

test("mobile uses one locally cached configured-user array and refreshes it from the project API", () => {
  assert.match(mobileApi, /materials:configured-users:v2:/);
  assert.match(mobileApi, /setCache\(key, choices\)/);
  assert.match(mobileApi, /getCache<MaterialUserChoices>/);
  assert.match(mobileApi, /legacy\.value\.notifyUsers/);
  assert.doesNotMatch(mobileApi, /legacy\.value\.assignmentUsers/);
  assert.match(mobileForm, /cachedMaterialProjectUsers/);
  assert.match(mobileForm, /if\(!online\)/);
  assert.doesNotMatch(mobileApi, /assignmentUsers/);
});
