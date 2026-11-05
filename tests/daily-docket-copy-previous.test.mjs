import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { applyPreviousDocketSnapshot } from "../mobile/lib/dockets/copy-previous.ts";
import { mergeNewDailyDocketHydration } from "../mobile/lib/dockets/local-editor-shell.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const prior = "2026-11-04";
const today = "2026-11-05";

function fixture() {
  const docket = { id: "old-id", project_id: "p1", tower_id: "t1", docket_date: prior, approval_status: "final", deleted_at: null,
    crew: "Crew A", leading_hand: "Lead", weather: "Fine", rate_type: "tonnage_rate", progress_model: "section_v2",
    prestart_minutes: 15, lunch_break_minutes: 60, travel_in_minutes: 20, travel_out_minutes: 20, mobilisation_hours: 1 };
  return {
    towers: [{ id: "t1", project_id: "p1", extra_data: { has_body_extension: true } }],
    tower_daily_dockets: [docket, { ...docket, id: "other-tower", tower_id: "t2" }, { ...docket, id: "other-project", project_id: "p2" },
      { ...docket, id: "same-day", docket_date: today }, { ...docket, id: "deleted", deleted_at: today }],
    tower_docket_labour: [
      { docket_id: "old-id", worker_name: "Lead", time_in: "07:00", time_out: "17:00", total_hours: 10, prestart_minutes: 15, lunch_minutes: 60, travel_in_minutes: 20, travel_out_minutes: 20, mobilisation_hours: 0, delay_hours: 1, delay_reason: "Rain", production_hours: 8 },
      { docket_id: "old-id", worker_name: "Worker 2", time_in: "07:00", time_out: "17:00", total_hours: 10, prestart_minutes: 15, lunch_minutes: 60, travel_in_minutes: 20, travel_out_minutes: 20, mobilisation_hours: 0, delay_hours: 0, delay_reason: "", production_hours: 9 },
      { docket_id: "old-id", worker_name: "Worker 3", time_in: "08:00", time_out: "16:00", total_hours: 8, prestart_minutes: 15, lunch_minutes: 60, travel_in_minutes: 20, travel_out_minutes: 20, mobilisation_hours: 0, delay_hours: 0, delay_reason: "", production_hours: 7 },
    ],
    tower_docket_plant: [{ docket_id: "old-id", plant_name: "Crane", plant_type: "Plant", asset_number: "CR-1", operator_name: "Lead", time_in: "07:00", time_out: "17:00", total_hours: 10, notes: "" }],
    tower_docket_progress: [{ docket_id: "old-id", tower_id: "t1", section_code: "A", section_label: "Section A", progress_model: "section_v2", assembly_overall: 40, erection_overall: 30 }],
    tower_docket_hour_allocations: [{ docket_id: "old-id", allocation_type: "production", target_tower_id: "t1", activity: "assembly", reason: "Steel work", hours: 8, worker_names: ["Lead", "Worker 2"] }],
  };
}

function serviceFor(data, calls) {
  return { from(table) {
    calls.push(table);
    const filters = [];
    let limit = Infinity;
    let descending = false;
    const builder = {
      select(columns) { calls.push(`${table}:columns:${columns}`); return builder; },
      eq(field, value) { filters.push((row) => row[field] === value); return builder; },
      lt(field, value) { filters.push((row) => row[field] < value); return builder; },
      is(field, value) { filters.push((row) => row[field] === value); return builder; },
      or() { filters.push((row) => row.approval_status == null || ["legacy", "submitted_bc", "client_pending", "final", "legacy_final"].includes(row.approval_status)); return builder; },
      in(field, values) { filters.push((row) => values.includes(row[field])); return builder; },
      order(field, options) { descending = options?.ascending === false; return builder; },
      limit(count) { limit = count; return builder; },
      async maybeSingle() { const rows = evaluate(); return { data: rows[0] ?? null, error: null }; },
      then(resolve, reject) { return Promise.resolve({ data: evaluate(), error: null }).then(resolve, reject); },
    };
    function evaluate() {
      let rows = (data[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
      if (descending) rows = rows.sort((a, b) => String(b.docket_date).localeCompare(String(a.docket_date)));
      return rows.slice(0, limit);
    }
    return builder;
  } };
}

async function routeFor(data) {
  const source = await read("app/api/mobile/daily-dockets/copy-previous/route.ts");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const calls = [];
  const service = serviceFor(data, calls);
  const exports = {};
  const mocks = {
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    "@/lib/dockets/mobile-docket-server": {
      blankSectionV2Rows: () => [{ section_code: "A", section_label: "Section A", assembly_today: "", erection_today: "", assembly_weight: 1, erection_weight: 1 }],
      clean: (value) => String(value ?? "").trim(), inferBodyExtension: (row) => row?.extra_data?.has_body_extension ?? true,
      parseMobilisation: () => ({ enabled: true, status: "mobilising", from_tower_id: "t1", to_tower_id: "t2", notes: "Move crew", worker_names: ["Lead"] }),
      mobileDocketApiError: (error) => ({ message: error.message, status: 500 }), num: (value) => Number(value) || 0,
      requireMobileDocketUser: async () => { calls.push("auth_access"); return { service }; },
    },
    "@/lib/dockets/calculations": { SECTION_PROGRESS_WEIGHTS: { A: 1 } },
  };
  new Function("require", "exports", compiled)((name) => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`);
    return mocks[name];
  }, exports);
  const get = (extra = "") => exports.GET(new Request(`https://example.test/api/mobile/daily-dockets/copy-previous?projectId=p1&towerId=t1&docketDate=${today}${extra}`));
  return { get, calls, source };
}

function currentDraft() {
  return { mode: "create", docketId: "new-stable-uuid", projectId: "p1", towerId: "t1", docketDate: today,
    approvalStatus: "draft", approvalRevision: 0, crewName: "My edit", dailySiteSummary: "Today's note", delayRows: [],
    materialEvents: [], linkedDefects: [], newDefects: [], bcRepName: "Current User", bcSignatureDataUrl: "", bcSignedAt: "" };
}

test("production-shaped copy reads only scoped core, labour, plant, progress and allocations", async () => {
  const { get, calls } = await routeFor(fixture());
  const result = await get("&previousDocketId=old-id");
  assert.equal(result.status, 200);
  assert.equal(result.body.found, true);
  assert.equal(result.body.previousDocketDate, prior);
  assert.equal(result.body.copy.labourRows.length, 3);
  assert.equal(result.body.copy.plantRows.length, 1);
  assert.equal(result.body.copy.sectionV2Rows[0].assembly_today, "40");
  assert.equal(result.body.copy.labourRows[0].delay_hours, "");
  assert.deepEqual(calls.filter((call) => !call.includes(":columns:")), ["auth_access", "towers", "tower_daily_dockets", "tower_docket_labour", "tower_docket_plant", "tower_docket_progress", "tower_docket_hour_allocations"]);
  assert.ok(!calls.filter((call) => !call.includes(":columns:")).some((call) => /material|defect|employee|crew|reviewer/i.test(call)));
  assert.ok(calls.find((call) => call.startsWith("tower_daily_dockets:columns:")).includes("id,project_id,tower_id,docket_date"));
  assert.ok(!calls.find((call) => call.startsWith("tower_daily_dockets:columns:")).includes("signature"));
});

test("prior-date lookup finds newest eligible docket; supplied ID cannot cross tower, project or date", async () => {
  const { get } = await routeFor(fixture());
  assert.equal((await get()).body.previousDocketId, "old-id");
  for (const id of ["other-tower", "other-project", "same-day", "deleted"]) {
    assert.deepEqual((await get(`&previousDocketId=${id}`)).body, { found: false }, id);
  }
});

test("no earlier docket is a clean business result", async () => {
  const data = fixture(); data.tower_daily_dockets = [];
  assert.deepEqual((await (await routeFor(data)).get()).body, { found: false });
});

test("copy atomically keeps today's date, draft ID, status, identity, events and signatures", async () => {
  const response = (await (await routeFor(fixture())).get()).body;
  const original = currentDraft();
  const copied = applyPreviousDocketSnapshot(original, response);
  assert.equal(copied.docketDate, today);
  assert.equal(copied.docketId, "new-stable-uuid");
  assert.equal(copied.projectId, "p1");
  assert.equal(copied.towerId, "t1");
  assert.equal(copied.approvalStatus, "draft");
  assert.equal(copied.bcRepName, "Current User");
  assert.equal(copied.bcSignatureDataUrl, "");
  assert.equal(copied.dailySiteSummary, "Today's note");
  assert.deepEqual(copied.delayRows, []);
  assert.equal(copied.crewName, "Crew A");
  assert.equal(copied.weather, "Fine");
  assert.equal(original.crewName, "My edit");
  assert.ok(!("docketId" in response.copy));
  assert.ok(!("approvalStatus" in response.copy));
  assert.ok(!("materialEvents" in response.copy));
  assert.ok(!("linkedDefects" in response.copy));
});

test("invalid or incomplete snapshot cannot partially change the current draft", () => {
  const original = currentDraft();
  assert.throws(() => applyPreviousDocketSnapshot(original, { found: true, previousDocketId: "old", previousDocketDate: prior, copy: {} }));
  assert.equal(original.crewName, "My edit");
});

test("late editor hydration cannot overwrite copied crew, work or progress values", async () => {
  const response = (await (await routeFor(fixture())).get()).body;
  const copied = applyPreviousDocketSnapshot(currentDraft(), response);
  const payload = { draft: copied, crews: [], employees: [] };
  const hydrated = { draft: { ...currentDraft(), crewName: "Hydrated crew", sectionV2Rows: [{ section_code: "A", assembly_today: "0" }], prestartMinutes: "0" },
    crews: [{ id: "crew-1", crew_name: "Crew A", crew_number: "1" }], employees: [] };
  const merged = mergeNewDailyDocketHydration({ currentPayload: payload, currentDraft: copied, hydrated,
    editedFields: new Set(["crewName", "sectionV2Rows", "prestartMinutes"]), expectedDocketId: "new-stable-uuid" });
  assert.equal(merged.draft.crewName, "Crew A");
  assert.equal(merged.draft.sectionV2Rows[0].assembly_today, "40");
  assert.equal(merged.draft.prestartMinutes, "15");
  assert.equal(merged.draft.selectedCrewId, "crew-1");
});

test("mobile copy path uses narrow endpoint, cache, synchronous double-tap guard and stale response guard", async () => {
  const [screen, api, shell, route] = await Promise.all([
    read("mobile/app/(drawer)/daily-dockets.tsx"), read("mobile/lib/api/daily-dockets.ts"), read("mobile/lib/dockets/local-editor-shell.ts"), read("app/api/mobile/daily-dockets/copy-previous/route.ts"),
  ]);
  const copy = screen.slice(screen.indexOf("const copyPrevious = async"), screen.indexOf("const saveDraft = async"));
  assert.match(api, /\/api\/mobile\/daily-dockets\/copy-previous/);
  assert.doesNotMatch(copy, /getDailyDocketEditor\(/);
  assert.match(copy, /copyPreviousInFlight\.current/);
  assert.match(copy, /previousSnapshotCache\.current\.get\(cacheKey\)/);
  assert.match(copy, /generation !== editorOpenGeneration\.current/);
  assert.match(copy, /current\.docketId !== draftId/);
  assert.match(copy, /current\.towerId !== towerId/);
  assert.match(copy, /current\.docketDate !== docketDate/);
  assert.match(copy, /Your current draft has not been changed/);
  assert.ok(copy.indexOf("await getPreviousDailyDocketSnapshot(") < copy.indexOf("setDraft(nextDraft)"));
  assert.match(copy, /editorEditedFields\.current\.add\(field\)/);
  assert.match(shell, /editedFields\.has\(field\)/);
  assert.doesNotMatch(route, /mobileProgressContext|loadOutstandingMobileMaterialIssues|loadMobileBundleTransferContext|\.select\("\*"\)/);
  assert.ok(screen.indexOf("setEditorPayload(localPayload)") < screen.indexOf("void getDailyDocketEditor({", screen.indexOf("setEditorPayload(localPayload)")));
});
