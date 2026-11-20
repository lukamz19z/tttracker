import assert from "node:assert/strict";
import test from "node:test";
import { chartConfigurationMatches, chartDimensionValue, chartFacetOptions, clearDownstreamChartSelections, exactChartConfigurationKey, selectNextChartPoint } from "../lib/lift-engineering/chart-configuration.ts";
import { buildChartCsvBatches, deduplicateChartCsvRows, mapChartCsvRecords, parseChartCsv, suggestCsvMappings } from "../lib/lift-engineering/chart-csv.ts";

function chart(id, config, crane = "grove") {
  return { id, crane_profile_id: crane, configuration_revision_id: null, status: "Imported", manufacturer_configuration: { manufacturer: crane, craneModel: crane, ...config } };
}
const groveMain = chart("main-45", { chartFamily: "Main Boom", counterweightT: 41, outriggerLengthM: 8.55, outriggerWidthM: 8.1, slewRange: "360°", boomType: "Telescopic", mainBoomLengthM: 45.36, flyJibFitted: false, flyJibType: null, flyJibLengthM: null, flyJibAngleMode: null, flyJibAngleDeg: null, flyJibAngleMinDeg: null, flyJibAngleMaxDeg: null });
const groveSwingFixed = chart("swing-fixed", { ...groveMain.manufacturer_configuration, chartFamily: "Swingaway", flyJibFitted: true, flyJibType: "Swingaway", flyJibLengthM: 12, flyJibAngleMode: "fixed", flyJibAngleDeg: 5 });
const groveSwingRange = chart("swing-range", { ...groveMain.manufacturer_configuration, chartFamily: "Swingaway", flyJibFitted: true, flyJibType: "Swingaway", flyJibLengthM: 12, flyJibAngleMode: "intermediate", flyJibAngleDeg: null, flyJibAngleMinDeg: 5, flyJibAngleMaxDeg: 20 });
const liebherrAngles = [0, 22.5, 45].map((angle) => chart(`liebherr-${angle}`, { ...groveMain.manufacturer_configuration, manufacturer: "Liebherr", craneModel: "LTM1220-5.2", chartFamily: "Folding fly jib", flyJibFitted: true, flyJibType: "Folding fly jib", flyJibLengthM: 10.5, flyJibAngleMode: "fixed", flyJibAngleDeg: angle }, "liebherr"));
const demagA = chart("demag-a", { ...groveMain.manufacturer_configuration, manufacturer: "Demag", craneModel: "AC220-5", chartFamily: "Main Boom", configurationCode: "LK 1", telescopeConfiguration: "T1", mainBoomLengthM: 60, flyJibFitted: false }, "demag");
const demagB = chart("demag-b", { ...demagA.manufacturer_configuration, configurationCode: "LK 2", telescopeConfiguration: "T2" }, "demag");

test("Grove 41 t, full span, 360 degree 45.36 m main boom selects 18.8 t at 20 m", () => {
  const point = selectNextChartPoint([{ radiusM: 20, capacityT: 18.8 }, { radiusM: 22, capacityT: 15.3 }], 20);
  assert.equal(chartDimensionValue(groveMain, "mainBoomLengthM"), "45.36");
  assert.equal(point.capacityT, 18.8);
});

test("None fitted excludes swingaway, while fitted 12 m fixed 5 degree selects only its exact chart", () => {
  const charts = [groveMain, groveSwingFixed, groveSwingRange];
  const base = { chartFamily: "Main Boom", counterweightT: "41", outriggerLengthM: "8.55", outriggerWidthM: "8.1", slewRange: "360°", boomType: "Telescopic", mainBoomLengthM: "45.36", flyJibFitted: "false" };
  assert.deepEqual(chartFacetOptions(charts, "mainBoomLengthM", base, "grove"), ["45.36"]);
  assert.equal(charts.filter((item) => chartDimensionValue(item, "flyJibFitted") === base.flyJibFitted && chartDimensionValue(item, "chartFamily") === base.chartFamily).length, 1);
  const fitted = { ...base, chartFamily: "swingaway", flyJibFitted: "true", flyJibType: "swingaway", flyJibLengthM: "12", flyJibAngleMode: "fixed", flyJibAngleDeg: "5" };
  assert.ok(chartConfigurationMatches(groveSwingFixed, Object.fromEntries(Object.entries(groveSwingFixed.manufacturer_configuration).filter(([key]) => key !== "identityKey"))));
  assert.notEqual(exactChartConfigurationKey(groveSwingFixed.manufacturer_configuration), exactChartConfigurationKey(groveSwingRange.manufacturer_configuration));
  assert.equal(chartFacetOptions(charts, "flyJibAngleMode", fitted, "grove")[0], "fixed");
});

test("Liebherr 0, 22.5 and 45 degree folding-fly charts remain separate", () => {
  assert.deepEqual(liebherrAngles.map((item) => chartDimensionValue(item, "flyJibAngleDeg")), ["0", "22.5", "45"]);
  assert.equal(new Set(liebherrAngles.map((item) => exactChartConfigurationKey(item.manufacturer_configuration))).size, 3);
});

test("changing counterweight or outrigger span clears every dependent selection", () => {
  const selection = { chartFamily: "main boom", counterweightT: "41", outriggerLengthM: "8.55", outriggerWidthM: "8.1", slewRange: "360°", mainBoomLengthM: "45.36", flyJibFitted: "false" };
  assert.deepEqual(clearDownstreamChartSelections(selection, "counterweightT"), { chartFamily: "main boom", counterweightT: "41" });
  assert.deepEqual(clearDownstreamChartSelections(selection, "outriggerLengthM"), { chartFamily: "main boom", counterweightT: "41", outriggerLengthM: "8.55" });
});

test("required radius 20.4 selects 22 without interpolation and no exact capacity returns null", () => {
  const points = [{ radiusM: 20, capacityT: 18.8 }, { radiusM: 22, capacityT: 15.3 }, { radiusM: 24, capacityT: 12.1 }];
  assert.deepEqual(selectNextChartPoint(points, 20.4), points[1]);
  assert.equal(selectNextChartPoint(points, 24.1), null);
  assert.throws(() => selectNextChartPoint(points, -1), /non-negative/);
});

test("Demag LK and telescope configuration codes isolate otherwise equal boom lengths", () => {
  assert.equal(chartDimensionValue(demagA, "mainBoomLengthM"), chartDimensionValue(demagB, "mainBoomLengthM"));
  assert.notEqual(exactChartConfigurationKey(demagA.manufacturer_configuration), exactChartConfigurationKey(demagB.manufacturer_configuration));
  assert.deepEqual(chartFacetOptions([demagA, demagB], "telescopeConfiguration", { chartFamily: "Main Boom", counterweightT: "41", outriggerLengthM: "8.55", outriggerWidthM: "8.1", slewRange: "360°", boomType: "Telescopic", mainBoomLengthM: "60" }, "demag"), ["T1", "T2"]);
});

test("actual manufacturer CSV columns map accessory ranges and source traceability", () => {
  const { headers, records } = parseChartCsv("manufacturer,crane_model,source_document,source_page,chart_family,manufacturer_chart_id,configuration_code,boom_type,main_boom_length_m,radius_m,capacity_t,counterweight_t,outrigger_length_m,outrigger_width_m,slew_range,tele_configuration,jib_type,jib_length_m,jib_angle_deg,jib_angle_min_deg,jib_angle_max_deg,jib_angle_mode\nGrove,GMK5220,GMK5220.pdf,384,Swingaway,3 118 084,,Telescopic,45.36,20,18.8,41,8.55,8.1,360°,T1,Swingaway,12,,5,20,intermediate\n");
  const rows = mapChartCsvRecords(records, suggestCsvMappings(headers));
  assert.equal(rows[0].configuration.flyJibFitted, true);
  assert.equal(rows[0].configuration.flyJibAngleMinDeg, 5);
  assert.equal(rows[0].configuration.flyJibAngleMaxDeg, 20);
  assert.equal(rows[0].configuration.telescopeConfiguration, "T1");
  assert.equal(rows[0].sourcePage, "384");
  assert.equal(rows[0].sourceDocument, "GMK5220.pdf");
});

test("chart importer collapses duplicate configuration/radius points conservatively before batching", () => {
  const { headers, records } = parseChartCsv("manufacturer,crane_model,source_document,source_page,chart_family,boom_type,main_boom_length_m,radius_m,capacity_t,counterweight_t,outrigger_length_m,outrigger_width_m,slew_range\nGrove,GMK5220,chart.pdf,1,Main Boom,Telescopic,45.36,20,18.8,41,8.55,8.1,360\nGrove,GMK5220,chart.pdf,1,Main Boom,Telescopic,45.36,20,18.6,41,8.55,8.1,360\nGrove,GMK5220,chart.pdf,1,Main Boom,Telescopic,45.36,22,15.3,41,8.55,8.1,360\n");
  const mapped = mapChartCsvRecords(records, suggestCsvMappings(headers));
  const deduplicated = deduplicateChartCsvRows(mapped);
  assert.equal(deduplicated.rows.length, 2);
  assert.equal(deduplicated.skippedDuplicateRows, 1);
  assert.equal(deduplicated.rows[0].capacityT, 18.6);
  assert.deepEqual(deduplicated.conflicts[0].capacitiesT, [18.6, 18.8]);
  assert.equal(deduplicated.conflicts[0].selectedCapacityT, 18.6);
  const batches = buildChartCsvBatches(deduplicated.rows, 1);
  assert.equal(batches.length, 2);
  assert.equal(batches[0].rows.length, 1);
  assert.equal(batches[0].rowStart, 2);
  assert.equal(batches[0].rowEnd, 3);
  assert.equal(batches[1].rows[0].radiusM, 22);
});

