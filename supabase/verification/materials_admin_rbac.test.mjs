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
const migration = await source("supabase/migrations/20261101170000_v1_materials_permissions.sql");
const require = createRequire(import.meta.url);
const ts = require("../../node_modules/typescript");

function loadEligibleModule(projectUsers, permissions, fullIds) {
  const file = new URL("../../lib/materials/eligible-users.ts", import.meta.url);
  const js = ts.transpileModule(require("node:fs").readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const tables = [];
  const service = { from(table) {
    tables.push(table);
    const query = { select() { return this; }, eq() { return this; }, in() { return this; },
      then(resolve) { return Promise.resolve({ data: table === "project_access" ? projectUsers : permissions, error: null }).then(resolve); } };
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
    assert.ok(migration.includes(`'${permission}'`), `${permission} should be registered`);
  }
  assert.match(migration, /insert into public\.access_areas/);
  assert.doesNotMatch(migration, /v2_permissions|v2_role_permissions/);
});

test("settings and evidence storage use the same project/configuration authorization path", () => {
  assert.match(settingsRoute, /requireMaterialsConfiguration\(request, projectId\)/);
  assert.match(storageRoute, /requireMaterialsConfiguration\(request,projectId\)/);
  assert.match(qualityServer, /MATERIALS_CONFIGURATION_FORBIDDEN/);
  assert.match(page, /error\?.*Retry/);
  assert.match(page, /No eligible Materials managers or configured recipients/);
  assert.doesNotMatch(page, /No project users are available/);
  assert.match(webUsersRoute, /assertQualityProjectAccess\(\{/);
  assert.match(mobileUsersRoute, /hasV1FullAccess\(service, identity\.userId\)/);
});

test("100-member project returns only effective Materials managers, including full-access Admin", async () => {
  const members = Array.from({ length: 100 }, (_, i) => ({ user_id: `person-${i}` }));
  const permissions = [
    { user_id: "person-95", code: "materials.manage_issues", allowed: true },
    { user_id: "person-96", code: "materials.configure", allowed: true },
    { user_id: "person-97", code: "materials.manage_issues", allowed: true },
    { user_id: "person-98", code: "materials.configure", allowed: true },
    { user_id: "person-99", code: "materials.manage_issues", allowed: true },
  ];
  const { eligibleMaterialUsers, service, tables } = loadEligibleModule(members, permissions, ["person-95"]);
  const result = await eligibleMaterialUsers(service, "project-1");
  assert.deepEqual(result.assignmentUsers.map(row => row.id), ["person-95", "person-96", "person-97", "person-98", "person-99"]);
  assert.deepEqual(result.notifyUsers.map(row => row.id), result.assignmentUsers.map(row => row.id));
  assert.equal(result.assignmentUsers.length, 5);
  assert.ok(result.assignmentUsers.every(row => row.name.startsWith("Name person-")));
  assert.equal(tables.includes("project_material_notification_rules"), false);
});
