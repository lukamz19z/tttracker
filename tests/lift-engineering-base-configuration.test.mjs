import assert from "node:assert/strict";
import test from "node:test";
import { baseConfigurationIdentity, baseSetupOptions, chartMatchesBaseSetup } from "../lib/lift-engineering/base-configuration.ts";
import { chartFacetOptions } from "../lib/lift-engineering/chart-configuration.ts";

const base = { chartFamily: "Main Boom", counterweightT: 41, outriggerLengthM: 8.55, outriggerWidthM: 8.1, slewRange: "360°", boomType: "Telescopic", mainBoomLengthM: 45.36 };
const charts = [
  { id: "main", crane_profile_id: "grove", status: "Imported", active: true, manufacturer_configuration: { ...base, flyJibFitted: false } },
  { id: "swing", crane_profile_id: "grove", status: "Verified", active: true, manufacturer_configuration: { ...base, chartFamily: "Swingaway", flyJibFitted: true, flyJibType: "Swingaway", flyJibLengthM: 12, flyJibAngleMode: "fixed", flyJibAngleDeg: 5 } },
  { id: "other-base-swing", crane_profile_id: "grove", status: "Imported", active: true, manufacturer_configuration: { ...base, counterweightT: 60, chartFamily: "Swingaway", flyJibFitted: true, flyJibType: "Swingaway", flyJibLengthM: 10, flyJibAngleMode: "fixed", flyJibAngleDeg: 5 } },
  { id: "other-span", crane_profile_id: "grove", status: "Imported", active: true, manufacturer_configuration: { ...base, counterweightT: 41, outriggerLengthM: 6.3, outriggerWidthM: 6.2, slewRange: "360°" } },
  { id: "other-cw", crane_profile_id: "grove", status: "Imported", active: true, manufacturer_configuration: { ...base, counterweightT: 60, outriggerLengthM: 8.55, outriggerWidthM: 8.1, slewRange: "180°" } },
  { id: "draft", crane_profile_id: "grove", status: "Draft", active: true, manufacturer_configuration: { ...base, counterweightT: 80 } },
  { id: "other-crane", crane_profile_id: "liebherr", status: "Imported", active: true, manufacturer_configuration: { ...base, counterweightT: 80 } },
];

test("configuration dropdown counterweights come only from imported charts for selected crane", () => {
  assert.deepEqual(baseSetupOptions(charts, "grove").counterweights, [41, 60]);
});

test("outrigger setup options cascade after counterweight selection", () => {
  const options = baseSetupOptions(charts, "grove", { counterweightT: 41 });
  assert.deepEqual(options.outriggers.map((item) => item.label), ["6.30 × 6.20 m", "8.55 × 8.10 m"]);
});

test("slew options cascade after counterweight and outrigger setup", () => {
  const options = baseSetupOptions(charts, "grove", { counterweightT: 41, outriggerLengthM: 8.55, outriggerWidthM: 8.1 });
  assert.deepEqual(options.slewRanges, ["360°"]);
});

test("base configuration identity excludes lift-level fly and boom choices", () => {
  const main = { ...base, flyJibFitted: false, mainBoomLengthM: 45.36 };
  const fly = { ...base, flyJibFitted: true, flyJibType: "Swingaway", flyJibLengthM: 12, flyJibAngleDeg: 5, mainBoomLengthM: 45.36 };
  const identity = (config) => baseConfigurationIdentity("grove", { counterweightT: config.counterweightT, outriggerLengthM: config.outriggerLengthM, outriggerWidthM: config.outriggerWidthM, slewRange: config.slewRange });
  assert.equal(identity(main), identity(fly));
});

test("lift-level accessory charts are constrained to the selected base setup", () => {
  const matches = charts.filter((chart) => chartMatchesBaseSetup(chart, "grove", { counterweightT: 41, outriggerLengthM: 8.55, outriggerWidthM: 8.1, slewRange: "360°" }));
  assert.deepEqual(matches.map((chart) => chart.id), ["main", "swing"]);
  assert.equal(matches.find((chart) => chart.id === "main")?.manufacturer_configuration.flyJibFitted, false);
  assert.equal(matches.find((chart) => chart.id === "swing")?.manufacturer_configuration.flyJibFitted, true);
  assert.deepEqual(chartFacetOptions(matches, "flyJibLengthM", { chartFamily: "Swingaway", counterweightT: "41", outriggerLengthM: "8.55", outriggerWidthM: "8.1", slewRange: "360°", boomType: "Telescopic", mainBoomLengthM: "45.36", flyJibFitted: "true", flyJibType: "Swingaway" }, "grove"), ["12"]);
});

test("main-boom and fly lifts may use separate charts under the same base setup", () => {
  const main = charts.find((chart) => chart.id === "main"); const swing = charts.find((chart) => chart.id === "swing");
  const setup = { counterweightT: 41, outriggerLengthM: 8.55, outriggerWidthM: 8.1, slewRange: "360°" };
  assert.ok(chartMatchesBaseSetup(main, "grove", setup)); assert.ok(chartMatchesBaseSetup(swing, "grove", setup));
  assert.notEqual(main.id, swing.id);
});

test("changing base setup excludes prior incompatible accessory charts", () => {
  const previous = { counterweightT: 41, outriggerLengthM: 8.55, outriggerWidthM: 8.1, slewRange: "360°" };
  const changed = { counterweightT: 60, outriggerLengthM: 8.55, outriggerWidthM: 8.1, slewRange: "180°" };
  const oldChart = charts.find((chart) => chart.id === "swing");
  assert.equal(chartMatchesBaseSetup(oldChart, "grove", previous), true);
  assert.equal(chartMatchesBaseSetup(oldChart, "grove", changed), false);
});
