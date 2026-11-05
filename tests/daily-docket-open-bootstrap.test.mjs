import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createLocalDailyDocketShell, mergeNewDailyDocketHydration } from "../mobile/lib/dockets/local-editor-shell.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

function blankDraft({ projectId, towerId, docketDate }) {
  return {
    mode: "create", docketId: null, projectId, towerId, docketDate,
    prestartMinutes: "", lunchBreakMinutes: "", travelInMinutes: "", travelOutMinutes: "",
    rateType: "tonnage_rate", hasBodyExtension: true, sectionV2Rows: [{ section_code: "A", assembly_today: "", erection_today: "" }],
    outstandingMaterials: [], activeBundleTransfers: [], bundleReplacementStatus: [], bundleReplacementDrafts: {},
    bcRepName: "", bcRepEmail: "", bcRepUserId: "", selectedCrewId: "", labourRows: [],
  };
}

function shell() {
  return createLocalDailyDocketShell({
    projectId: "p1", projectName: "Project One", projectNumber: "P-1",
    tower: { id: "t1", project_id: "p1", name: "Tower 18", line: "L1", status: "In Progress", progress: 12, has_body_extension: true },
    docketDate: "2026-11-04", docketId: "stable-docket-id",
    identity: { userId: "u1", employeeId: "e1", name: "Crew Lead", email: "lead@example.test", display: "Crew Lead" },
    defaults: { prestartMinutes: "15", lunchBreakMinutes: "60" }, createBlankDraft: blankDraft,
  });
}

test("new editor shell is built locally with cached project, tower, identity, defaults and stable ID", () => {
  const payload = shell();
  assert.equal(payload.draft.docketId, "stable-docket-id");
  assert.equal(payload.draft.projectId, "p1");
  assert.equal(payload.draft.towerId, "t1");
  assert.equal(payload.draft.docketDate, "2026-11-04");
  assert.equal(payload.draft.prestartMinutes, "15");
  assert.equal(payload.draft.lunchBreakMinutes, "60");
  assert.equal(payload.draft.bcRepUserId, "u1");
  assert.equal(payload.project.name, "Project One");
  assert.equal(payload.towers[0].name, "Tower 18");
  assert.deepEqual(payload.crews, []);
});

test("hydration updates untouched fields while preserving user edits and canonical draft identity", () => {
  const currentPayload = shell();
  const currentDraft = { ...currentPayload.draft, docketDate: "2026-11-05", lunchBreakMinutes: "45" };
  const hydrated = {
    ...shell(),
    crews: [{ id: "c1", crew_number: "1", crew_name: "Crew A", leading_hand: null, active: true }],
    employees: [{ id: "e2", full_name: "Worker", role: null, crew_id: "c1", active: true }],
  };
  hydrated.draft = { ...hydrated.draft, docketId: null, docketDate: "2026-11-06", lunchBreakMinutes: "60", prestartMinutes: "20" };
  const merged = mergeNewDailyDocketHydration({
    currentPayload, currentDraft, hydrated,
    editedFields: new Set(["docketDate", "lunchBreakMinutes"]), expectedDocketId: "stable-docket-id",
  });
  assert.ok(merged);
  assert.equal(merged.draft.docketId, "stable-docket-id");
  assert.equal(merged.draft.docketDate, "2026-11-05");
  assert.equal(merged.payload.draft.docketDate, "2026-11-06");
  assert.equal(merged.draft.lunchBreakMinutes, "45");
  assert.equal(merged.draft.prestartMinutes, "20");
  assert.equal(merged.payload.crews.length, 1);
  assert.equal(merged.payload.employees.length, 1);
});

test("stale hydration for a closed/replaced docket or different tower is ignored", () => {
  const currentPayload = shell();
  assert.equal(mergeNewDailyDocketHydration({
    currentPayload, currentDraft: currentPayload.draft, hydrated: shell(), editedFields: new Set(), expectedDocketId: "old-docket-id",
  }), null);
  const otherTower = shell();
  otherTower.draft = { ...otherTower.draft, towerId: "t2" };
  assert.equal(mergeNewDailyDocketHydration({
    currentPayload, currentDraft: currentPayload.draft, hydrated: otherTower, editedFields: new Set(), expectedDocketId: "stable-docket-id",
  }), null);
});

test("plus opens local editor before starting detached hydration; offline failure stays inside the editor", async () => {
  const [screen, api, route] = await Promise.all([
    read("mobile/app/(drawer)/daily-dockets.tsx"),
    read("mobile/lib/api/daily-dockets.ts"),
    read("app/api/mobile/daily-dockets/editor/route.ts"),
  ]);
  const shellIndex = screen.indexOf("setEditorPayload(localPayload)");
  const requestIndex = screen.indexOf("void getDailyDocketEditor({", shellIndex);
  assert.ok(shellIndex >= 0 && requestIndex > shellIndex);
  assert.match(screen, /createLocalDailyDocketShell\(/);
  assert.match(screen, /visible=\{Boolean\(draft && editorPayload\)\}/);
  assert.match(screen, /hydration-unavailable/);
  assert.match(screen, /Some docket setup data could not be refreshed/);
  assert.doesNotMatch(screen, /bootstrap:\s*"core"/);
  assert.match(screen, /editorOpenInFlight\.current\s*\|\|\s*editorLoading\s*\|\|\s*draftRef\.current\s*\|\|\s*editorPayloadRef\.current/);
  assert.match(screen, /if \(generation !== editorOpenGeneration\.current\) return/);
  assert.doesNotMatch(api, /timeoutMs:\s*30_000/);
  assert.match(route, /logPhase\("auth_access"\)/);
  assert.match(route, /logPhase\("configuration_queries"\)/);
  assert.match(route, /logPhase\("previous_progress"\)/);
  assert.match(route, /logPhase\("materials_context"\)/);
  assert.match(route, /logPhase\("progress_baseline"\)/);
  assert.match(route, /\[docket-open\] failed[\s\S]*phase: currentPhase[\s\S]*phaseDurationMs/);
  const serverHelper = await read("lib/dockets/mobile-docket-server.ts");
  assert.match(serverHelper, /service\.rpc\("user_has_access"/);
  assert.doesNotMatch(serverHelper.slice(serverHelper.indexOf("async function requirePermission"), serverHelper.indexOf("async function requireProjectAccess")), /effective_user_permissions/);
});

test("copy previous remains explicit and opening a blank docket does not request it", async () => {
  const screen = await read("mobile/app/(drawer)/daily-dockets.tsx");
  const createBranch = screen.slice(screen.indexOf('if (args.mode === "create"'), screen.indexOf("setEditorLoading(true);"));
  assert.doesNotMatch(createBranch, /copyPrevious/);
  const copyBranch = screen.slice(screen.indexOf("const copyPrevious = async"), screen.indexOf("const saveDraft = async"));
  assert.match(copyBranch, /getPreviousDailyDocketSnapshot\(/);
  assert.doesNotMatch(copyBranch, /getDailyDocketEditor\(/);
  assert.match(copyBranch, /current\.docketId !== draftId/);
});

test("docket list paints cached project/tower rows before scoped server refresh and keeps stale list on failure", async () => {
  const screen = await read("mobile/app/(drawer)/daily-dockets.tsx");
  assert.match(screen, /tttracker:daily-dockets:list:v1:/);
  assert.match(screen, /AsyncStorage\.getItem\(docketListCacheKey\(userId, projectId\)\)/);
  assert.ok(screen.indexOf("applyList(cached.towers, cached.dockets)") < screen.indexOf("const [towerResult, docketResult]"));
  assert.match(screen, /setListRefreshError\(hasCache \? "Showing saved Daily Dockets/);
  assert.match(screen, /tttracker:tower-progress:\$\{projectId\}/);
  assert.match(screen, /listRequest\.current\?\.projectId === projectId/);
  assert.match(screen, /\[dockets-list\] queries/);
  assert.match(screen, /\[dockets-list\] total/);
  assert.match(screen, /if \(!accessLoading && !canAccess\("mobile\.daily_dockets"\)\)/);
  assert.match(screen, /Access state is restored from cache on mobile[\s\S]*permission server-side/);
  assert.doesNotMatch(screen.slice(screen.indexOf("if (loading) {", screen.indexOf("const editorLocked")), screen.indexOf("return (\n    <SafeAreaView style=\{styles.safe\}")), /<PermissionScreen/);
});

test("new docket local shell does not depend on list loading or a network bootstrap request", async () => {
  const screen = await read("mobile/app/(drawer)/daily-dockets.tsx");
  const createBranch = screen.slice(screen.indexOf('if (args.mode === "create"'), screen.indexOf("setEditorLoading(true);"));
  assert.ok(createBranch.indexOf("createLocalDailyDocketShell(") < createBranch.indexOf("setEditorPayload(localPayload)"));
  assert.ok(createBranch.indexOf("setEditorPayload(localPayload)") < createBranch.indexOf("void getDailyDocketEditor({"));
  assert.match(screen, /editorOpenInFlight\.current\s*\|\|\s*editorLoading\s*\|\|\s*draftRef\.current/);
  assert.match(screen, /setEditorHydrationError\("Some docket setup data could not be refreshed/);
});
