import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const fixturePath = new URL("../../tests/fixtures/lift-engineering/vsl-plus-9-gmk5220-full.json", import.meta.url);
const dataset = JSON.parse(await readFile(fixturePath, "utf8"));
const marker = dataset.datasetKey;
const apply = process.argv.includes("--apply");
const confirmArgIndex = process.argv.indexOf("--confirm-project-ref");
const confirmedProjectRef = confirmArgIndex >= 0 ? process.argv[confirmArgIndex + 1] : "";

if (!apply) {
  console.log(JSON.stringify({ mode: "dry-run", dataset: marker, lifts: dataset.lifts.length,
    charts: dataset.charts.length, chartPoints: dataset.charts.reduce((sum, chart) => sum + chart.points.length, 0),
    externalReferenceReactionRows: dataset.lifts.reduce((sum, lift) => sum + lift.externalReferenceReactions.length, 0),
    createsProjectStudy: false, instruction: "Pass --apply --confirm-project-ref <Supabase project ref> to write reusable reference records." }, null, 2));
  process.exit(0);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseUrl || !serviceKey || !confirmedProjectRef) throw new Error("Apply requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and --confirm-project-ref.");
const actualProjectRef = new URL(supabaseUrl).hostname.split(".")[0];
if (actualProjectRef !== confirmedProjectRef) throw new Error(`Target confirmation mismatch: URL project ref is ${actualProjectRef}.`);
const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const sourceMarker = { importKey: marker, importDate: new Date().toISOString(), classification: "BC lift-study validation source; not a standalone manufacturer publication" };
const sourceDocuments = dataset.sourceDocuments.map((document) => ({ ...document, importDate: sourceMarker.importDate }));

async function findOne(table, filters, columns = "*") {
  let query = supabase.from(table).select(columns);
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  const { data, error } = await query.limit(2);
  if (error) throw new Error(`${table} natural-key lookup failed: ${error.message}`);
  if ((data ?? []).length > 1) throw new Error(`${table} has multiple rows for natural key ${JSON.stringify(filters)}; refusing an ambiguous import.`);
  return data?.[0] ?? null;
}

async function writeByNaturalKey(table, filters, values, isOwned) {
  const existing = await findOne(table, filters);
  if (existing) {
    if (!isOwned(existing)) throw new Error(`${table} natural key already exists without this import's source marker; refusing to overwrite it.`);
    const { data, error } = await supabase.from(table).update(values).eq("id", existing.id).select("*").single();
    if (error || !data) throw new Error(`${table} update failed: ${error?.message ?? "row was not returned"}`);
    return data;
  }
  const { data, error } = await supabase.from(table).insert(values).select("*").single();
  if (error || !data) throw new Error(`${table} insert failed: ${error?.message ?? "row was not returned"}`);
  return data;
}

function hasMarker(value) { return JSON.stringify(value ?? {}).includes(marker); }
const profile = await writeByNaturalKey("lift_crane_profiles", { name: "Grove GMK5220", manufacturer: "Grove", model: "GMK5220" }, {
  name: "Grove GMK5220", manufacturer: "Grove", model: "GMK5220",
  notes: `${sourceMarker.classification}; importKey=${marker}`,
}, (row) => String(row.notes ?? "").includes(marker));

const craneRevision = await writeByNaturalKey("lift_crane_profile_revisions", { crane_profile_id: profile.id, revision: "BC-REV-A" }, {
  crane_profile_id: profile.id, revision: "BC-REV-A", status: "draft",
  source_document: sourceDocuments,
  technical_data: { ...sourceMarker, craneType: "Grove All Terrain 220T", counterweightT: 41,
    supportSpanWorkbookM: dataset.studyReference.workbookOutriggerSpanM,
    supportSpanPdfChartM: dataset.studyReference.pdfChartOutriggerSpanM,
    supportGeometryStatus: dataset.studyReference.coordinateGeometryStatus,
    mainHookCapacityT: 32, auxiliaryHookCapacityT: 12,
    mainLinePullT: 9.35, mainFalls: 3, mainReevedWllT: 28.05,
    auxiliaryLinePullT: 9.35, auxiliaryFalls: 1, auxiliaryReevedWllT: 9.35,
    ropeDiameterMm: 21, ropeMassKgPerM: 1.65,
    caveat: "Carriage/upperworks/counterweight/boom/fly mass and CG values are not provided by the supplied study; no Romanello calculation is enabled." },
  coordinate_convention: "Support span is retained as source dimensions only. OR1-OR4 and slew-centre coordinates are unknown and intentionally unset.",
}, (row) => hasMarker(row.technical_data));

const configurationName = `GMK5220 · 41 t · full outriggers · VSL+9 validation [${marker}]`;
const configuration = await writeByNaturalKey("lift_crane_configurations", { crane_profile_id: profile.id, name: configurationName }, {
  crane_profile_id: profile.id, name: configurationName, active: true,
}, (row) => row.name === configurationName);
const configurationRevision = await writeByNaturalKey("lift_crane_configuration_revisions", { configuration_id: configuration.id, revision: "VSL9-REV-A" }, {
  configuration_id: configuration.id, revision: "VSL9-REV-A", status: "draft", counterweight_t: 41,
  outrigger_state: "Full outriggers; source span 8.557 x 8.1 m (workbook); chart appendix states 8.550 x 8.100 m.",
  boom_configuration: "Variable; select the matched source chart for each lift.",
  source_document: sourceDocuments,
  data: { ...sourceMarker, supportSpanWorkbookM: dataset.studyReference.workbookOutriggerSpanM,
    supportSpanPdfChartM: dataset.studyReference.pdfChartOutriggerSpanM,
    padM: dataset.studyReference.padM, allowableGroundPressureKpa: 160,
    chartConfigurations: dataset.charts.map(({ key, boomLengthM, flyJib, windRestriction }) => ({ key, boomLengthM, flyJib, windRestriction })),
    romanelloGeometryComplete: false },
}, (row) => hasMarker(row.data));

const hookSpecs = [
  { name: "Main single-sheave hook", mass_kg: 600, hook_type: "Single sheave hook", source_document: { ...sourceMarker, source: dataset.sourceDocuments[0].fileName, sheet: "Info Sum." } },
  { name: "Auxiliary headache ball", mass_kg: 300, hook_type: "Headache ball", source_document: { ...sourceMarker, source: dataset.sourceDocuments[0].fileName, sheet: "Info Sum." } },
];
const ropeSpecs = [
  { name: "Main reeved rope tare · study condition", mass_kg: 180, rope_type: "21 mm; 1.65 kg/m; three falls in source study", source_document: { ...sourceMarker, source: dataset.sourceDocuments[0].fileName, sheet: "Info Sum." } },
  { name: "Auxiliary reeved rope tare · study condition", mass_kg: 90, rope_type: "21 mm; 1.65 kg/m; one fall in source study", source_document: { ...sourceMarker, source: dataset.sourceDocuments[0].fileName, sheet: "Info Sum." } },
];
const attachmentSpecs = [{ name: "Auxiliary single-sheave boom-top attachment", mass_kg: 60,
  source_document: { ...sourceMarker, source: dataset.sourceDocuments[0].fileName, sheet: "Info Sum." } }];
const hooks = [];
for (const spec of hookSpecs) hooks.push(await writeByNaturalKey("lift_crane_hooks", { crane_profile_revision_id: craneRevision.id, name: spec.name }, { crane_profile_revision_id: craneRevision.id, ...spec }, (row) => hasMarker(row.source_document)));
const ropes = [];
for (const spec of ropeSpecs) ropes.push(await writeByNaturalKey("lift_crane_ropes", { crane_profile_revision_id: craneRevision.id, name: spec.name }, { crane_profile_revision_id: craneRevision.id, ...spec }, (row) => hasMarker(row.source_document)));
const attachments = [];
for (const spec of attachmentSpecs) attachments.push(await writeByNaturalKey("lift_crane_attachments", { crane_profile_revision_id: craneRevision.id, name: spec.name }, { crane_profile_revision_id: craneRevision.id, ...spec }, (row) => hasMarker(row.source_document)));

async function ensureRigging(name, massKg, sourceSheet) {
  const item = await writeByNaturalKey("lift_rigging_items", { description: name }, {
    description: name, category: "Study aggregate rigging tare", notes: `${sourceMarker.classification}; workbook gives aggregate tare but not a component breakdown; importKey=${marker}`,
  }, (row) => String(row.notes ?? "").includes(marker));
  return writeByNaturalKey("lift_rigging_item_revisions", { rigging_item_id: item.id, revision: "BC-REV-A" }, {
    rigging_item_id: item.id, revision: "BC-REV-A", status: "draft", mass_kg: massKg, wll_t: null,
    source_document: { ...sourceMarker, source: dataset.sourceDocuments[0].fileName, sheet: sourceSheet,
      note: "Aggregate tare from the BC lift-study workbook; underlying rigging component mass breakdown was not supplied." },
  }, (row) => hasMarker(row.source_document));
}
const mainRiggingRevision = await ensureRigging("Validation study main-hook rigging set · aggregate tare", 140, "Info Sum.");
const auxiliaryRiggingRevision = await ensureRigging("Validation study auxiliary-hook rigging set · aggregate tare", 120, "Info Sum.");

async function ensureArrangement(name, revision) {
  const arrangement = await writeByNaturalKey("lift_rigging_arrangements", { name }, {
    name, description: `${sourceMarker.classification}; aggregate rigging tare only, component breakdown unavailable; importKey=${marker}`,
  }, (row) => String(row.description ?? "").includes(marker));
  const existingLines = await supabase.from("lift_rigging_arrangement_items").select("id,rigging_item_revision_id,quantity,mass_override_kg,override_reason").eq("arrangement_id", arrangement.id).limit(3);
  if (existingLines.error) throw new Error(`Rigging arrangement lookup failed: ${existingLines.error.message}`);
  if ((existingLines.data ?? []).length > 1) throw new Error(`Rigging arrangement ${name} has unexpected duplicate lines; refusing the import.`);
  const line = { arrangement_id: arrangement.id, rigging_item_revision_id: revision.id, quantity: 1, mass_override_kg: null, override_reason: null };
  if (existingLines.data?.length) {
    const old = existingLines.data[0];
    const { error } = await supabase.from("lift_rigging_arrangement_items").update(line).eq("id", old.id);
    if (error) throw new Error(`Rigging arrangement line update failed: ${error.message}`);
  } else {
    const { error } = await supabase.from("lift_rigging_arrangement_items").insert(line);
    if (error) throw new Error(`Rigging arrangement line insert failed: ${error.message}`);
  }
  return arrangement;
}
const mainArrangement = await ensureArrangement("GMK5220 41 t validation · main-hook arrangement", mainRiggingRevision);
const auxiliaryArrangement = await ensureArrangement("GMK5220 41 t validation · auxiliary arrangement", auxiliaryRiggingRevision);

const charts = [];
for (const spec of dataset.charts) {
  const chart = await writeByNaturalKey("lift_load_charts", { crane_profile_id: profile.id, name: `${spec.key} · 41 t full outriggers`, revision: "BC-REV-B" }, {
    crane_profile_id: profile.id, configuration_revision_id: configurationRevision.id,
    name: `${spec.key} · 41 t full outriggers`, revision: "BC-REV-B", counterweight_t: 41,
    outrigger_state: "Full outriggers; chart source states 8.550 x 8.100 m",
    slew_sector: "360 degrees", boom_configuration: spec.key, boom_length_m: spec.boomLengthM,
    boom_sequence: null, fly_jib: spec.flyJib, wind_restriction: spec.windRestriction,
    source_document: { ...sourceMarker, fileName: dataset.sourceDocuments[1].fileName, revision: "B", page: spec.sourcePage,
      sourceClassification: "Chart data reproduced in BC lift-study PDF; verify against controlled manufacturer chart before operational issue." },
    notes: "Only conservative points needed for the supplied VSL+9 study's maximum radii are seeded; no interpolation is performed.",
  }, (row) => hasMarker(row.source_document));
  const points = spec.points.map((point) => ({ load_chart_id: chart.id, configuration_key: spec.key,
    radius_m: point.radiusM, rated_capacity_t: point.capacityT, source_page: spec.sourcePage }));
  const { error } = await supabase.from("lift_load_chart_points").upsert(points, { onConflict: "load_chart_id,configuration_key,radius_m" });
  if (error) throw new Error(`Load chart point import failed (${spec.key}): ${error.message}`);
  charts.push(chart);
}

const template = await writeByNaturalKey("lift_tower_templates", { name: "VSL +9 · HumeLink tower template" }, {
  name: "VSL +9 · HumeLink tower template", structure_type: "VSL +9", description: `${sourceMarker.classification}; importKey=${marker}`,
}, (row) => String(row.description ?? "").includes(marker));
const templateRevision = await writeByNaturalKey("lift_tower_template_revisions", { template_id: template.id, revision: "BC-REV-A" }, {
  template_id: template.id, revision: "BC-REV-A", status: "draft", source_documents: sourceDocuments,
  notes: `Method data from source workbook: Box factor 0.75; Pick 60%/60%; Rotate 60%/60%; Upend/Place main 100%, auxiliary 0%. These are template values, not global calculation rules. importKey=${marker}`,
}, (row) => hasMarker(row.source_documents));

for (const lift of dataset.lifts) {
  const notes = JSON.stringify({ importKey: marker, auxiliaryArrangementId: auxiliaryArrangement.id,
    sourceWorkbook: dataset.sourceDocuments[0].fileName, sourceSheet: lift.sourceSheet,
    sourceDescription: lift.sourceDescription ?? lift.description,
    externalReferenceReactionCount: lift.externalReferenceReactions.length,
    externalReferenceReactions: lift.externalReferenceReactions,
    note: "Reactions are retained as external_reference study-source data only; they are not a calculated Romanello/CSP result." });
  const liftRow = await writeByNaturalKey("lift_template_lifts", { template_revision_id: templateRevision.id, lift_number: lift.liftNumber }, {
    template_revision_id: templateRevision.id, lift_number: lift.liftNumber, sequence_no: lift.sequenceNo,
    description: lift.description, lift_type: lift.liftType,
    dimensions: { ...lift.dimensions, towerSegments: lift.towerSegments }, installed_height_m: lift.installedHeightM,
    boom_configuration: lift.boomConfiguration, boom_length_m: lift.boomLengthM, boom_sequence: lift.boomSequence,
    default_radius_m: lift.nominalRadiusM, maximum_radius_m: lift.maximumRadiusM,
    effective_load_factor: lift.effectiveLoadFactor, default_rigging_arrangement_id: mainArrangement.id,
    hook_nomination: lift.hookNomination, notes,
    drawing_references: [],
  }, (row) => String(row.notes ?? "").includes(marker));
  const childTables = [
    ["lift_template_lift_elements", "sequence_no", lift.elements.map((element) => ({ template_lift_id: liftRow.id,
      description: element.description, mass_kg: element.massKg, dimensions: {}, sequence_no: element.sequenceNo }))],
    ["lift_template_lift_phases", "sequence_no", lift.phases.map((phase) => ({ template_lift_id: liftRow.id,
      phase_key: phase.key, phase_name: phase.name, main_load_share: phase.mainLoadShare,
      auxiliary_load_share: phase.auxiliaryLoadShare, radius_m: phase.radiusM, notes: null, sequence_no: phase.sequenceNo }))],
  ];
  for (const [table, sequenceColumn, rows] of childTables) {
    const { data: priorRows, error: readError } = await supabase.from(table).select(`id,${sequenceColumn}`).eq("template_lift_id", liftRow.id);
    if (readError) throw new Error(`${table} lookup failed: ${readError.message}`);
    const bySequence = new Map();
    for (const prior of priorRows ?? []) {
      const sequence = prior[sequenceColumn];
      if (bySequence.has(sequence)) throw new Error(`${table} contains duplicate sequence ${sequence} on imported lift ${lift.liftNumber}.`);
      bySequence.set(sequence, prior.id);
    }
    for (const row of rows) {
      const existingId = bySequence.get(row[sequenceColumn]);
      const values = { ...row }; delete values.sequenceNo;
      if (existingId) {
        const { error } = await supabase.from(table).update(values).eq("id", existingId);
        if (error) throw new Error(`${table} update failed: ${error.message}`);
        bySequence.delete(row[sequenceColumn]);
      } else {
        const { error } = await supabase.from(table).insert(values);
        if (error) throw new Error(`${table} insert failed: ${error.message}`);
      }
    }
    for (const staleId of bySequence.values()) {
      const { error } = await supabase.from(table).delete().eq("id", staleId);
      if (error) throw new Error(`${table} stale imported child cleanup failed: ${error.message}`);
    }
  }
}

console.log(JSON.stringify({ mode: "applied", targetProjectRef: actualProjectRef, dataset: marker,
  craneProfileId: profile.id, craneProfileRevisionId: craneRevision.id,
  configurationId: configuration.id, configurationRevisionId: configurationRevision.id,
  hookIds: hooks.map((row) => row.id), ropeIds: ropes.map((row) => row.id), attachmentIds: attachments.map((row) => row.id),
  mainRiggingArrangementId: mainArrangement.id, auxiliaryRiggingArrangementId: auxiliaryArrangement.id,
  chartIds: charts.map((row) => row.id), templateId: template.id, templateRevisionId: templateRevision.id,
  liftGroups: dataset.lifts.length, createdProjectStudy: false }, null, 2));
