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
const page = await source("app/(protected)/project/[projectId]/materials/notifications/page.tsx");
const materialsMigration = await source("supabase/migrations/20261101170000_v1_materials_permissions.sql");
const selectionMigration = await source("supabase/migrations/20261101173000_v1_material_notification_selection.sql");
const eligibleSource = await source("lib/materials/eligible-users.ts");
const reportRoute = await source("app/api/materials/missing/route.ts");
const mobileReportRoute = await source("app/api/mobile/materials/missing/route.ts");
const notifier = await source("lib/materials/missing-notifications.ts");
const websiteForm = await source("components/materials/ReportMissingMaterialForm.tsx");
const mobileForm = await source("mobile/app/materials/report-missing.tsx");
const mobileActionsRoute = await source("app/api/mobile/materials/missing/actions/route.ts");
const require = createRequire(import.meta.url);
const ts = require("../../node_modules/typescript");

function loadEligibleModule(projectUsers, permissions, fullIds, notifyIds = []) {
  const file = new URL("../../lib/materials/eligible-users.ts", import.meta.url);
  const js = ts.transpileModule(require("node:fs").readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const tables = [];
  const service = { from(table) {
    tables.push(table);
    const query = { select() { return this; }, eq() { return this; }, in() { return this; },
      then(resolve) { const data = table === "project_access" ? projectUsers : table === "effective_user_permissions" ? permissions : notifyIds.map(user_id => ({ user_id })); return Promise.resolve({ data, error: null }).then(resolve); } };
    return query;
  } };
  const exports = {};
  new Function("require", "exports", js)(name => {
    if (name === "@/lib/access/server") return { fullAccessUserIds: async () => fullIds };
    if (name === "@/lib/materials/project-users") return { resolveProjectUserLabels: async (_service, ids) => ids.map(id => ({ id, name: `Name ${id}`, role: "Materials Manager" })) };
    throw new Error(`Unexpected import ${name}`);
  }, exports);
  return { eligibleMaterialUsers: exports.eligibleMaterialUsers, service, tables };
}

test("V1 full-access Admin inheritance is shared with Quality and effective permission checks", () => {
  assert.match(accessServer, /export async function hasV1FullAccess/);
  assert.match(accessServer, /roles"\)\.select\("grants_all"\)/);
  assert.match(accessServer, /return hasV1FullAccess\(service, userId\)/);
  assert.match(qualityServer, /isQualityAdminRole\(role\) \|\| await hasV1FullAccess/);
});

test("V1 permission catalogue includes Materials manage/configure and mobile capabilities", () => {
  for (const permission of ["materials.view", "materials.issues.view", "materials.manage_issues", "materials.configure", "mobile.materials"]) {
    assert.ok(materialsMigration.includes(`'${permission}'`), `${permission} should be registered`);
  }
  assert.match(materialsMigration, /insert into public\.access_areas/);
  assert.doesNotMatch(materialsMigration, /v2_permissions|v2_role_permissions/);
  assert.match(selectionMigration, /available_for_selection boolean not null default true/);
});

test("settings and evidence storage use the same project/configuration authorization path", () => {
  assert.match(settingsRoute, /requireMaterialsConfiguration\(request, projectId\)/);
  assert.match(storageRoute, /requireMaterialsConfiguration\(request,projectId\)/);
  assert.match(qualityServer, /MATERIALS_CONFIGURATION_FORBIDDEN/);
  assert.match(page, /void refresh\(\)/);
  assert.match(page, /No notification users configured/);
  assert.match(page, /Add User/);
  assert.match(page, /available_for_selection/);
  assert.match(settingsRoute, /project_access/);
  assert.doesNotMatch(settingsRoute, /eligibleMaterialUsers/);
  assert.match(settingsRoute, /available_for_selection: typeof body\.availableForSelection/);
  assert.match(settingsRoute, /Recipient must be a member of this project/);
  assert.match(webUsersRoute, /assertQualityProjectAccess\(\{/);
  assert.match(mobileUsersRoute, /hasV1FullAccess\(service, identity\.userId\)/);
});

test("100-member project picker returns only explicitly configured users, independently of permissions", async () => {
  const members = Array.from({ length: 100 }, (_, i) => ({ user_id: `person-${i}` }));
  const permissions = [
    { user_id: "person-95", code: "materials.manage_issues", allowed: true },
    { user_id: "person-96", code: "materials.configure", allowed: true },
    { user_id: "person-97", code: "materials.manage_issues", allowed: true },
    { user_id: "person-98", code: "materials.configure", allowed: true },
    { user_id: "person-99", code: "materials.manage_issues", allowed: true },
  ];
  const { eligibleMaterialUsers, service, tables } = loadEligibleModule(members, permissions, ["person-95"], ["person-4", "person-6", "person-80"]);
  const result = await eligibleMaterialUsers(service, "project-1");
  assert.deepEqual(result.assignmentUsers.map(row => row.id), ["person-95", "person-96", "person-97", "person-98", "person-99"]);
  assert.deepEqual(result.notifyUsers.map(row => row.id), ["person-4", "person-6", "person-80"]);
  assert.equal(result.assignmentUsers.length, 5);
  assert.ok(result.assignmentUsers.every(row => row.name.startsWith("Name person-")));
  assert.equal(tables.includes("project_material_notification_rules"), true);
  assert.equal(result.notifyUsers.some(row => permissions.some(permission => permission.user_id === row.id)), false);
});

test("empty and separate-project notification lists never fall back to RBAC or all project users", async () => {
  const members = Array.from({ length: 100 }, (_, i) => ({ user_id: `person-${i}` }));
  const permissions = [{ user_id: "person-1", code: "materials.manage_issues", allowed: true }];
  const empty = loadEligibleModule(members, permissions, [], []).eligibleMaterialUsers;
  const result = await empty(loadEligibleModule(members, permissions, [], []).service, "project-c");
  assert.deepEqual(result.notifyUsers, []);
  const projectB = loadEligibleModule(members, permissions, [], ["person-70", "person-71"]);
  const projectBUsers = await projectB.eligibleMaterialUsers(projectB.service, "project-b");
  assert.deepEqual(projectBUsers.notifyUsers.map(row => row.id), ["person-70", "person-71"]);
  assert.equal(projectBUsers.notifyUsers.some(row => ["person-4", "person-6", "person-80"].includes(row.id)), false);
});

test("recipient add/remove is project-membership scoped, while report and follow-up notifications use saved IDs", () => {
  assert.match(settingsRoute, /Recipient must be a member of this project/);
  assert.match(settingsRoute, /onConflict: "project_id,user_id"/);
  assert.match(settingsRoute, /available_for_selection: false/);
  assert.match(reportRoute, /notify_user_ids:notifyUserIds/);
  assert.match(mobileReportRoute, /notify_user_ids: notifyUserIds/);
  assert.match(notifier, /event\.notify_user_ids/);
  assert.match(notifier, /for\(const rule of rules\).*applies\(rule,kind\)/);
  assert.match(notifier, /rule\.active!==true/);
  assert.doesNotMatch(notifier, /project_defect_notification_rules/);
  assert.match(eligibleSource, /eq\("available_for_selection", true\)/);
  assert.match(page, /Optional automatic notifications/);
  assert.match(page, /available_for_selection: true, notify_raised: false/);
  assert.match(page, /available_for_selection: false/);
  assert.match(reportRoute, /notifiable\.has\(id\)/);
  assert.match(mobileReportRoute, /notifyIds\.has\(id\)/);
  assert.match(notifier, /const channels=new Map<string/);
  assert.match(mobileActionsRoute, /previouslySelected\.has\(id\)/);
  assert.match(notifier, /event\.notify_user_ids/);
  assert.match(notifier, /channels\.set\(clean\(id\)/);
  assert.match(notifier, /const directAssignee=/);
  assert.match(notifier, /const configured=channels\.get\(clean\(id\)\)/);
  assert.match(websiteForm, /payload\.notifyUsers/);
  assert.match(mobileForm, /setNotifyUsers\(choices\.notifyUsers\)/);
  assert.match(page, /projectUsers\.filter\(person => rules\[person\.id\]\?\.available_for_selection === true\)/);
  assert.match(page, /setRules\(current => \(\{ \.\.\.current, \[id\]: \{ \.\.\.\(current\[id\] \|\| base\(id\)\), available_for_selection: false \} \}\)\)/);
  assert.match(settingsRoute, /available_for_selection: false, active: false/);
});
