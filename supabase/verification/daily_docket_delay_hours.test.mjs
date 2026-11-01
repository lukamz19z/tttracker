import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const calculationSource = await readFile(new URL("../../lib/dockets/calculations.ts", import.meta.url), "utf8");
const websiteSource = await readFile(new URL("../../components/dockets/DailyDocketForm.tsx", import.meta.url), "utf8");
const mobileSaveSource = await readFile(new URL("../../app/api/mobile/daily-dockets/save/route.ts", import.meta.url), "utf8");

const transpiled = ts.transpileModule(calculationSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const calculationModule = { exports: {} };
new Function("exports", "module", transpiled)(calculationModule.exports, calculationModule);
const { calculateLabourTotals, calculateProductionHours, validateDelayHoursAgainstRawShifts } = calculationModule.exports;

const row = (worker_name, total_hours, extras = {}) => ({
  worker_name,
  time_in: "07:00",
  time_out: "15:00",
  total_hours,
  prestart_minutes: 0,
  lunch_minutes: 0,
  travel_in_minutes: 0,
  travel_out_minutes: 0,
  mobilisation_hours: 0,
  delay_hours: 0,
  delay_reason: "",
  production_hours: 0,
  ...extras,
});
const delay = (hours, overrides = {}) => ({
  delay_type: "weather",
  delay_reason: "",
  delay_hours: hours,
  applies_to: "entire_crew",
  worker_names: [],
  delay_applies_mode: "labour_only",
  plant_names: [],
  ...overrides,
});

test("full-shift delay can exceed production after normal deductions without reducing production again", () => {
  const labour = [row("Worker A", 8, { lunch_minutes: 60, travel_in_minutes: 30, prestart_minutes: 30 })];
  const delays = [delay(8)];
  const totals = calculateLabourTotals(labour, delays, { enabled: false, durationMinutes: 0, workerNames: [] });
  assert.equal(totals.rows[0].total_hours, 8);
  assert.equal(totals.rows[0].production_hours, "6.00");
  assert.equal(totals.rows[0].delay_hours, "8.00");
  assert.equal(totals.rawManhours, 8);
  assert.equal(totals.productionManhours, 6);
  assert.equal(validateDelayHoursAgainstRawShifts(labour, delays), "");
});

test("delay equal to production and greater than production but within raw shift are accepted", () => {
  const labour = [row("Worker A", 8, { lunch_minutes: 120 })];
  assert.equal(validateDelayHoursAgainstRawShifts(labour, [delay(6)]), "");
  assert.equal(validateDelayHoursAgainstRawShifts(labour, [delay(8)]), "");
  assert.equal(calculateProductionHours(labour[0]), "6.00");
});

test("delay beyond raw shift is rejected and multiple delay rows accumulate per affected worker", () => {
  const labour = [row("Worker A", 8)];
  assert.match(validateDelayHoursAgainstRawShifts(labour, [delay(9)]), /exceed the raw shift duration/);
  assert.match(validateDelayHoursAgainstRawShifts(labour, [delay(4), delay(4.1)]), /exceed the raw shift duration/);
  assert.match(validateDelayHoursAgainstRawShifts(labour, [delay(-1)]), /cannot be negative/);
  assert.match(validateDelayHoursAgainstRawShifts(labour, [delay("not-a-number")]), /valid number/);
});

test("crew delays validate against each worker raw shift, not the shortest worker production", () => {
  const labour = [
    row("Worker A", 8, { lunch_minutes: 120 }),
    row("Worker B", 10, { lunch_minutes: 240 }),
  ];
  assert.equal(validateDelayHoursAgainstRawShifts(labour, [delay(8)]), "");
});

test("production remains clamped at zero and plant delay uses plant shift duration", () => {
  assert.equal(calculateProductionHours(row("Worker A", 8, { lunch_minutes: 600, mobilisation_hours: 1 })), "0.00");
  const labour = [row("Worker A", 8, { lunch_minutes: 120 })];
  const plant = [{ plant_name: "Crane", time_in: "07:00", time_out: "15:00", total_hours: 8 }];
  const plantDelay = delay(8, { delay_applies_mode: "labour_and_plant", plant_names: ["Crane"] });
  assert.equal(validateDelayHoursAgainstRawShifts(labour, [plantDelay], plant), "");
  assert.match(validateDelayHoursAgainstRawShifts(labour, [delay(9, { delay_applies_mode: "labour_and_plant", plant_names: ["Crane"] })], plant), /exceed the raw shift duration/);
});

test("website and mobile save use the same shared raw-shift validation", () => {
  assert.match(websiteSource, /validateDelayHoursAgainstRawShifts\(labourRows, delayRows, plantRowsWithTotals\)/);
  assert.match(mobileSaveSource, /validateDelayHoursAgainstRawShifts\(/);
  assert.match(mobileSaveSource, /if \(delayValidation\) return NextResponse\.json\(\{ error: delayValidation \}, \{ status: 400 \}\)/);
});

