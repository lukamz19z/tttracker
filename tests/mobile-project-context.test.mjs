import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isCurrentProjectGeneration, resolveInitialProjectId } from "../mobile/lib/project-context.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const projects = [
  { id: "east", projectNumber: "P-HLE-26-003", name: "HumeLink East", status: "Active" },
  { id: "west", projectNumber: "P-UGL-26-002", name: "HumeLink West", status: "Active" },
  { id: "maragle", projectNumber: "P-MAR-26-001", name: "Maragle", status: "Active" },
];

test("initial selection prefers authorized local project, then persisted server project", () => {
  assert.equal(resolveInitialProjectId(projects, "west", "east"), "west");
  assert.equal(resolveInitialProjectId(projects, "not-authorized", "east"), "east");
  assert.equal(resolveInitialProjectId(projects.slice(1), null, "not-authorized"), "west");
});

test("late profile and switch responses are accepted only for the latest generation", () => {
  assert.equal(isCurrentProjectGeneration(1, 2), false);
  assert.equal(isCurrentProjectGeneration(3, 3), true);
  const rapidSwitches = [{ generation: 1, projectId: "west" }, { generation: 2, projectId: "maragle" }];
  assert.equal(rapidSwitches.filter((request) => isCurrentProjectGeneration(request.generation, 2))[0].projectId, "maragle");
});

test("project switch commits locally before persistence and ambiguous failures do not roll back", async () => {
  const auth = await read("mobile/contexts/AuthContext.tsx");
  const switchBlock = auth.slice(auth.indexOf("const previous = currentProfile;"), auth.indexOf("const value = useMemo"));
  assert.ok(switchBlock.indexOf("applyProfile(next)") < switchBlock.indexOf("apiJson<"));
  assert.match(switchBlock, /selectedProjectKey\(session\.user\.id\)/);
  assert.match(switchBlock, /definiteRejection/);
  assert.match(switchBlock, /Timeout\/network errors are ambiguous; keep local selection/);
  assert.match(switchBlock, /persistenceQueueRef\.current\.catch/);
});

test("server selection validates project access and treats zero updated employees as failure", async () => {
  const route = await read("app/api/mobile/project-selection/route.ts");
  assert.match(route, /requireMobileUser\(request\)/);
  assert.match(route, /from\("project_access"\).*eq\("user_id", identity\.userId\).*eq\("project_id", projectId\)/s);
  assert.match(route, /\.eq\("id", identity\.employeeId\)\s*\.eq\("user_id", identity\.userId\)/s);
  assert.match(route, /if \(!updated\.data \|\| updated\.data\.current_project_id !== projectId\)/);
  assert.match(route, /projectNumber: row\.project_number/);
});

test("project-scoped loaders use canonical context and isolate stale project data", async () => {
  const [home, dockets, materials, quality, progress, towerProgress] = await Promise.all([
    read("mobile/app/(drawer)/index.tsx"), read("mobile/app/(drawer)/daily-dockets.tsx"),
    read("mobile/contexts/MaterialsContext.tsx"), read("mobile/contexts/QualityContext.tsx"),
    read("mobile/app/(drawer)/project-progress.tsx"), read("mobile/app/(drawer)/tower-progress.tsx"),
  ]);
  for (const source of [home, dockets, materials, quality, progress, towerProgress]) assert.match(source, /currentProjectId/);
  assert.match(dockets, /setSelectedTowerId\(""\)/);
  assert.match(progress, /activeProjectIdRef\.current !== projectId/);
  assert.match(towerProgress, /activeProjectIdRef\.current !== selectedProjectId/);
  assert.match(home, /projectDashboardCacheKey\(userId, projectId\)/);
  assert.match(materials, /materialCacheKey\(projectId\)/);
});

test("project selection is cached per user and stale profile refresh cannot reset it", async () => {
  const auth = await read("mobile/contexts/AuthContext.tsx");
  assert.match(auth, /tttracker:mobile-selected-project:v1:/);
  assert.match(auth, /tttracker:mobile-server-project:v1:/);
  assert.match(auth, /AsyncStorage\.getItem\(selectedProjectKey\(userId\)\)/);
  assert.match(auth, /localChoice\.id !== lastPersistedId/);
  assert.match(auth, /AppState\.addEventListener\("change"/);
  assert.match(auth, /stale profile selection ignored/);
  assert.match(auth, /resolveInitialProjectId\(/);
  assert.match(auth, /profileProjectId|savedProjectId/);
});
