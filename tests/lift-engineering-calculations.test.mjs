import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calculateLift } from "../lib/lift-engineering/calculations/study.ts";
import { effectiveElementMassKg } from "../lib/lift-engineering/calculations/effective-load.ts";
import { totalRiggingTareKg } from "../lib/lift-engineering/calculations/rigging.ts";
import { suspendedLoadByHook } from "../lib/lift-engineering/calculations/suspended-load.ts";
import { utilisationPercent } from "../lib/lift-engineering/calculations/capacity.ts";
import { externalReferencePadPressure } from "../lib/lift-engineering/calculations/verification.ts";
import { mapTemplateLiftsToStudyInputs } from "../lib/lift-engineering/template-study-input.ts";

const chartPoints = [
  { configurationKey: "68m-main", radiusM: 25, capacityT: 12.1 },
  { configurationKey: "68m-main", radiusM: 26, capacityT: 11.4 },
  { configurationKey: "68m-main", radiusM: 30, capacityT: 9.2 },
];
const validation = JSON.parse(await readFile(new URL("./fixtures/lift-engineering/vsl-plus-9-gmk5220-checkpoints.json", import.meta.url), "utf8"));
const fullValidation = JSON.parse(await readFile(new URL("./fixtures/lift-engineering/vsl-plus-9-gmk5220-full.json", import.meta.url), "utf8"));
const simpleLift = ({ liftNumber, massKg, radius, chartKey = "68m-main" }) => ({
  liftNumber, elementMassKg: massKg, effectiveLoadFactor: 1,
  mainRiggingTareKg: validation.workbookMethodInputs.mainOverheadT.rigging * 1000,
  auxiliaryRiggingTareKg: validation.workbookMethodInputs.auxiliaryOverheadT.rigging * 1000,
  mainHookOverheadKg: validation.workbookMethodInputs.mainOverheadT.total * 1000,
  auxiliaryHookOverheadKg: validation.workbookMethodInputs.auxiliaryOverheadT.total * 1000,
  phases: [{ key: "main-place", name: "Main Upend / Place", loadShare: { main: 1, auxiliary: 0 }, radiusM: radius }],
  chartKey,
});

test("VSL+9 checkpoints: Lift 1A/1B uses next radius and reproduces 4.42t / 38.77%", () => {
  const checkpoint = validation.checkpoints[0];
  const lift = simpleLift({ liftNumber: checkpoint.liftNumber, massKg: checkpoint.effectiveElementMassKg, radius: checkpoint.requiredRadiusM });
  const result = calculateLift(lift, chartPoints, "68m-main");
  assert.equal(result.phases[0].chartRadiusM, checkpoint.chartRadiusM);
  assert.ok(Math.abs(result.phases[0].mainTotalLoadT - checkpoint.governingMainTotalLoadT) < 1e-9);
  assert.ok(Math.abs(result.governingUtilisationPct - checkpoint.utilisationPct) < 0.01);
});

test("VSL+9 checkpoints: Lift 7 load and utilisation parity without inventing its radius", () => {
  const checkpoint = validation.checkpoints[1];
  const input = simpleLift({ liftNumber: checkpoint.liftNumber, massKg: checkpoint.effectiveElementMassKg, radius: 0 });
  const load = suspendedLoadByHook(input, input.phases[0]);
  assert.ok(Math.abs(load.mainTotalLoadT - checkpoint.governingMainTotalLoadT) < 1e-9);
  assert.ok(Math.abs(utilisationPercent(load.mainTotalLoadT, checkpoint.chartCapacityT) - checkpoint.utilisationPct) < 0.01);
});

test("VSL+9 checkpoints: Lift 12 load and utilisation parity for the supplied boom/fly configuration", () => {
  const checkpoint = validation.checkpoints[2];
  const input = simpleLift({ liftNumber: checkpoint.liftNumber, massKg: checkpoint.effectiveElementMassKg, radius: 0 });
  const load = suspendedLoadByHook(input, input.phases[0]);
  assert.ok(Math.abs(load.mainTotalLoadT - checkpoint.governingMainTotalLoadT) < 1e-9);
  assert.ok(Math.abs(utilisationPercent(load.mainTotalLoadT, checkpoint.chartCapacityT) - checkpoint.utilisationPct) < 0.01);
  assert.equal(checkpoint.boomConfiguration, "68 m boom + 12 m fly");
});

test("effective factor, rigging composition and two-hook shares are data driven", () => {
  assert.equal(effectiveElementMassKg(4000, validation.workbookMethodInputs.boxEffectiveLoadFactor), 3000);
  assert.equal(totalRiggingTareKg([{ id: "a", revisionId: "r1", description: "sling", quantity: 2, massKg: 35 }]), 70);
  const input = { liftNumber: "Pick", elementMassKg: 1000, effectiveLoadFactor: 1, mainRiggingTareKg: 140, auxiliaryRiggingTareKg: 120,
    mainHookOverheadKg: 980, auxiliaryHookOverheadKg: 570,
    phases: [{ key: "pick", name: "Pick", loadShare: validation.workbookMethodInputs.pickLoadShare, radiusM: 26 }] };
  const result = calculateLift(input, [{ configurationKey: "main", radiusM: 26, capacityT: 4 }, { configurationKey: "aux", radiusM: 26, capacityT: 2 }], "main", "aux");
  assert.equal(result.phases[0].mainTotalLoadT, 1.58);
  assert.equal(result.phases[0].auxiliaryTotalLoadT, 1.17);
  assert.equal(result.phases[0].governingHook, "auxiliary");
});

test("phase selection governs the lift and does not interpolate chart capacities", () => {
  const result = calculateLift({ ...simpleLift({ liftNumber: "L1", massKg: 3440, radius: 25.517 }), phases: [
    { key: "pick", name: "Pick", loadShare: { main: 0.6, auxiliary: 0.6 }, radiusM: 25.517 },
    { key: "place", name: "Place", loadShare: { main: 1, auxiliary: 0 }, radiusM: 25.517 },
  ] }, [...chartPoints, { configurationKey: "68m-main:auxiliary", radiusM: 26, capacityT: 6 }], "68m-main");
  assert.equal(result.phases[0].chartRadiusM, 26);
  assert.equal(result.governingPhaseKey, "pick");
});

test("all 14 VSL+9 lift groups reproduce workbook effective mass, conservative chart pick and governing load", () => {
  const points = fullValidation.charts.flatMap((chart) => chart.points.map((point) => ({
    configurationKey: chart.key, radiusM: point.radiusM, capacityT: point.capacityT,
  })));
  assert.equal(fullValidation.lifts.length, 14);
  for (const source of fullValidation.lifts) {
    const chart = fullValidation.charts.find((candidate) => candidate.key === source.boomConfiguration);
    assert.ok(chart, `${source.liftNumber}: source chart is present`);
    const main = fullValidation.method.overheadKg.main;
    const auxiliary = fullValidation.method.overheadKg.auxiliary;
    const result = calculateLift({
      liftNumber: source.liftNumber,
      elementMassKg: source.rawElementMassKg,
      effectiveLoadFactor: source.effectiveLoadFactor,
      mainRiggingTareKg: main.rigging,
      auxiliaryRiggingTareKg: auxiliary.rigging,
      mainHookOverheadKg: main.total,
      auxiliaryHookOverheadKg: auxiliary.total,
      phases: source.phases.map((phase) => ({ key: phase.key, name: phase.name,
        loadShare: { main: phase.mainLoadShare, auxiliary: phase.auxiliaryLoadShare }, radiusM: phase.radiusM })),
    }, points, chart.key);
    const governing = result.phases.find((phase) => phase.phaseKey === result.governingPhaseKey);
    assert.ok(governing, `${source.liftNumber}: governing phase exists`);
    assert.ok(Math.abs(governing.effectiveElementMassKg - source.expectedEffectiveElementMassKg) <= 0.01,
      `${source.liftNumber}: effective mass ${governing.effectiveElementMassKg}kg matches ${source.expectedEffectiveElementMassKg}kg`);
    assert.equal(governing.requiredRadiusM, source.maximumRadiusM, `${source.liftNumber}: maximum radius drives the check`);
    assert.equal(governing.chartRadiusM, source.chartRadiusM, `${source.liftNumber}: conservative radius matches workbook`);
    assert.equal(governing.chartCapacityT, source.chartCapacityT, `${source.liftNumber}: capacity matches cited source chart`);
    assert.ok(Math.abs(governing.mainTotalLoadT - source.summary.totalLoadT) <= 0.005,
      `${source.liftNumber}: governing main load ${governing.mainTotalLoadT}t matches ${source.summary.totalLoadT}t`);
    assert.ok(Math.abs(governing.utilisationPct - source.summary.capacityPct) <= 0.02,
      `${source.liftNumber}: utilisation ${governing.utilisationPct}% matches ${source.summary.capacityPct}%`);
    assert.equal(result.assessment, "calculable");
  }
});

test("reference dataset keeps source provenance and supplied outrigger values external-only", () => {
  assert.equal(fullValidation.lifts.length, 14);
  assert.equal(fullValidation.lifts.reduce((sum, lift) => sum + lift.externalReferenceReactions.length, 0), 224);
  assert.ok(fullValidation.lifts.every((lift) => lift.externalReferenceReactions.every((reaction) => reaction.origin === "external_reference")));
  assert.equal(fullValidation.studyReference.coordinateGeometryStatus, "incomplete; no OR1-OR4 or slew-centre coordinates inferred");
  assert.ok(fullValidation.sourceDocuments.some((source) => source.revision === "A" && source.fileName.endsWith(".xlsm")));
  assert.ok(fullValidation.sourceDocuments.some((source) => source.revision === "B" && source.fileName.endsWith(".pdf")));
});

test("VSL+9 template rows map to study inputs without losing configured factors, phases, or chart scope", () => {
  const templateLifts = fullValidation.lifts.map((lift, index) => ({
    id: `template-${index}`, lift_number: lift.liftNumber, sequence_no: lift.sequenceNo,
    description: lift.description, lift_type: lift.liftType, boom_configuration: lift.boomConfiguration,
    maximum_radius_m: lift.maximumRadiusM, effective_load_factor: lift.effectiveLoadFactor,
    default_rigging_arrangement_id: "main-arrangement",
    notes: JSON.stringify({ auxiliaryArrangementId: "aux-arrangement", externalReferenceReactions: lift.externalReferenceReactions }),
    elements: lift.elements.map((element) => ({ mass_kg: element.massKg })),
    phases: lift.phases.map((phase) => ({ phase_key: phase.key, phase_name: phase.name,
      main_load_share: phase.mainLoadShare, auxiliary_load_share: phase.auxiliaryLoadShare, radius_m: phase.radiusM })),
  }));
  const configurationRevisionId = "configuration-revision";
  const options = {
    charts: fullValidation.charts.map((chart, index) => ({ id: `chart-${index}`, boom_configuration: chart.key, configuration_revision_id: configurationRevisionId })),
    hooks: [{ id: "main-hook", name: "Main single-sheave hook" }, { id: "aux-hook", name: "Auxiliary headache ball" }],
    ropes: [{ id: "main-rope", name: "Main reeved rope tare · study condition" }, { id: "aux-rope", name: "Auxiliary reeved rope tare · study condition" }],
    attachments: [{ id: "attachment", name: "Auxiliary single-sheave boom-top attachment" }],
  };
  const mapped = mapTemplateLiftsToStudyInputs(templateLifts, options, configurationRevisionId);
  assert.equal(mapped.length, 14);
  for (const [index, row] of mapped.entries()) {
    const source = fullValidation.lifts[index];
    assert.equal(row.elementMassKg, source.rawElementMassKg);
    assert.equal(row.effectiveLoadFactor, source.effectiveLoadFactor);
    assert.equal(row.liftType, source.liftType);
    assert.equal(row.chartId, options.charts.find((chart) => chart.boom_configuration === source.boomConfiguration).id);
    assert.equal(row.mainAttachmentId, "attachment");
    assert.equal(row.auxiliaryRiggingArrangementId, "aux-arrangement");
    assert.deepEqual(row.externalReferenceReactions, source.externalReferenceReactions);
    assert.deepEqual(row.phases.map((phase) => phase.loadShare), source.phases.map((phase) => ({ main: phase.mainLoadShare, auxiliary: phase.auxiliaryLoadShare })));
  }
  assert.throws(() => mapTemplateLiftsToStudyInputs(templateLifts, { ...options, charts: [] }, configurationRevisionId), /missing a matched chart/);
});

test("external reaction pressure is labelled reference-only and rejects negative reaction", () => {
  const output = externalReferencePadPressure({ support: "OR1", reactionKn: 640, reference: "accepted external study" }, 2, 2);
  assert.equal(output.pressureKpa, 160);
  assert.equal(output.origin, "external_reference");
  assert.equal(output.independentlyVerified, false);
  const negative = externalReferencePadPressure({ support: "OR1", reactionKn: -1, reference: "ref" }, 2, 2);
  assert.equal(negative.pressureKpa, -0.25);
  assert.match(negative.warnings[0], /negative support reaction/);
});

test("issued study snapshots and project access stay server enforced", async () => {
  const [migration, routes] = await Promise.all([
    readFile(new URL("../supabase/migrations/20261120120000_v1_lift_engineering.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/lift-engineering/server.ts", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /v1_lift_study_revision_guard/);
  assert.match(migration, /Issued Lift Study snapshots are immutable/);
  assert.match(migration, /v1_lift_study_save_calculation/);
  assert.match(routes, /from\("project_access"\)/);
  assert.match(routes, /\.eq\("project_id", projectId\)\.eq\("user_id", userId\)/);
});
