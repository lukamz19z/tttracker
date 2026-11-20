import { NextResponse } from "next/server";
import { exactChartConfigurationKey, type ManufacturerChartConfiguration } from "@/lib/lift-engineering/chart-configuration";
import { LIFT_ACCESS, liftApiError, requireLiftAccess } from "@/lib/lift-engineering/server";

type ImportRow = { configuration: ManufacturerChartConfiguration; radiusM: number; capacityT: number; sourcePage?: string | number | null; sourceDocument?: string | null; sourceRows?: number[] };
type ChartRow = { id: string; status: string; manufacturer_configuration: ManufacturerChartConfiguration; source_document: Record<string, unknown> };
type ImportConflict = { configurationKey: string; chartId: string; radiusM: number; capacitiesT: number[]; sourceRows: number[]; selectedCapacityT: number };
type DbFailure = { message: string; code?: string };

class ChartImportFailure extends Error {
  constructor(message: string, readonly stage: string, readonly code?: string, readonly status = 500) { super(message); }
}

function dbFailure(stage: string, error: DbFailure): ChartImportFailure {
  return new ChartImportFailure(error.message.replace(/bearer\s+[a-z0-9._~-]+/ig, "Bearer [redacted]").slice(0, 600), stage, error.code, 500);
}

function fail(message: string, stage: string, status = 400): never { throw new ChartImportFailure(message, stage, undefined, status); }

export async function GET(request: Request) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const [cranes, configurations, revisions] = await Promise.all([
      service.from("lift_crane_profiles").select("id,name,manufacturer,model").eq("active", true).order("name"),
      service.from("lift_crane_configurations").select("id,crane_profile_id,name").eq("active", true).order("name"),
      service.from("lift_crane_configuration_revisions").select("id,configuration_id,revision,status,counterweight_t,outrigger_state,boom_configuration,data").order("created_at", { ascending: false }),
    ]);
    for (const result of [cranes, configurations, revisions]) if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ cranes: cranes.data ?? [], configurations: configurations.data ?? [], configurationRevisions: revisions.data ?? [] });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

function validConfiguration(value: unknown): value is ManufacturerChartConfiguration {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const config = value as Record<string, unknown>;
  return ["manufacturer", "chartFamily", "counterweightT", "outriggerLengthM", "outriggerWidthM", "slewRange", "mainBoomLengthM", "flyJibFitted"]
    .every((key) => config[key] !== undefined && config[key] !== "");
}

export async function POST(request: Request) {
  let batchMetadata: { batchNumber: number | null; totalBatches: number | null; rowStart: number | null; rowEnd: number | null } = { batchNumber: null, totalBatches: null, rowStart: null, rowEnd: null };
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const body = await request.json() as Record<string, unknown>;
    const mode = body.mode === "data-only" ? "data-only" : body.mode === "chart-book" ? "chart-book" : null;
    const craneProfileId = typeof body.craneProfileId === "string" ? body.craneProfileId.trim() : "";
    const configurationRevisionId = typeof body.configurationRevisionId === "string" ? body.configurationRevisionId.trim() : "";
    const revision = typeof body.revision === "string" ? body.revision.trim() : "";
    const batchNumber = Number.isInteger(body.batchNumber) ? Number(body.batchNumber) : 1;
    const totalBatches = Number.isInteger(body.totalBatches) ? Number(body.totalBatches) : 1;
    const rowStart = Number.isInteger(body.rowStart) ? Number(body.rowStart) : null;
    const rowEnd = Number.isInteger(body.rowEnd) ? Number(body.rowEnd) : null;
    batchMetadata = { batchNumber, totalBatches, rowStart, rowEnd };
    const sourceDocument = body.sourceDocument && typeof body.sourceDocument === "object" && !Array.isArray(body.sourceDocument)
      ? body.sourceDocument as Record<string, unknown> : {};
    const rows = Array.isArray(body.rows) ? body.rows as ImportRow[] : [];
    const pointConflicts = Array.isArray(body.pointConflicts) ? body.pointConflicts as ImportConflict[] : [];
    if (!mode || !craneProfileId || !revision || !rows.length || rows.length > 2_000) {
      fail("Choose an import mode, crane, chart revision and provide up to 2,000 chart rows per request.", "request validation");
    }
    if (batchNumber < 1 || totalBatches < batchNumber || (rowStart !== null && rowEnd !== null && rowEnd < rowStart)) fail("Batch progress metadata is invalid.", "request validation");
    if (configurationRevisionId) {
      const { data: configuration, error: configurationError } = await service.from("lift_crane_configuration_revisions")
        .select("id,configuration_id,lift_crane_configurations(crane_profile_id)").eq("id", configurationRevisionId).maybeSingle();
      if (configurationError) throw dbFailure("configuration revision lookup", configurationError);
      const parentConfiguration = Array.isArray(configuration?.lift_crane_configurations) ? configuration.lift_crane_configurations[0] : configuration?.lift_crane_configurations;
      if (!configuration || parentConfiguration?.crane_profile_id !== craneProfileId) fail("The selected configuration revision does not belong to the selected crane.", "configuration validation");
    }
    const uniqueRows = new Map<string, ImportRow>();
    let skippedDuplicatePointCount = 0;
    const conflictKeys = new Set<string>();
    for (const [index, row] of rows.entries()) {
      const sourceRow = Number(row.sourceRows?.[0] ?? index + 1);
      if (!validConfiguration(row.configuration)) fail(`Chart row ${sourceRow} is missing required manufacturer configuration fields.`, "row validation");
      const radiusM = Number(row.radiusM); const capacityT = Number(row.capacityT);
      if (!Number.isFinite(radiusM) || radiusM < 0 || !Number.isFinite(capacityT) || capacityT <= 0) fail(`Chart row ${sourceRow} has an invalid radius or capacity.`, "row validation");
      const key = `${exactChartConfigurationKey(row.configuration)}|${radiusM}`;
      const current = uniqueRows.get(key);
      if (!current) uniqueRows.set(key, { ...row, radiusM, capacityT });
      else {
        skippedDuplicatePointCount += 1;
        if (Number(current.capacityT) !== capacityT) conflictKeys.add(key);
        if (capacityT < Number(current.capacityT)) uniqueRows.set(key, { ...row, radiusM, capacityT });
      }
    }
    const groups = new Map<string, { configuration: ManufacturerChartConfiguration; points: ImportRow[]; sourceDocuments: Set<string> }>();
    for (const row of uniqueRows.values()) {
      const radiusM = Number(row.radiusM); const capacityT = Number(row.capacityT);
      const configuration = { ...row.configuration };
      const identityKey = exactChartConfigurationKey(configuration);
      configuration.identityKey = identityKey;
      const current = groups.get(identityKey) ?? { configuration, points: [], sourceDocuments: new Set<string>() };
      current.points.push({ ...row, radiusM, capacityT });
      if (typeof row.sourceDocument === "string" && row.sourceDocument.trim()) current.sourceDocuments.add(row.sourceDocument.trim());
      groups.set(identityKey, current);
    }
    const { data: existingRows, error: existingError } = await service.from("lift_load_charts")
      .select("id,status,manufacturer_configuration,source_document")
      .eq("crane_profile_id", craneProfileId).eq("revision", revision)
      .limit(20_000);
    if (existingError) throw dbFailure("chart configuration lookup", existingError);
    const existing = (existingRows ?? []) as ChartRow[];
    const chartsByIdentity = new Map<string, ChartRow>();
    for (const chart of existing) {
      const key = chart.manufacturer_configuration?.identityKey;
      if (typeof key !== "string") continue;
      if (chartsByIdentity.has(key)) fail("Duplicate exact chart configurations already exist for this crane revision. Resolve the duplicate records before importing.", "chart configuration lookup", 409);
      chartsByIdentity.set(key, chart);
    }
    const chartRows: Array<Record<string, unknown>> = [];
    const pointRows: Array<Record<string, unknown>> = [];
    const draftChartIdsToImport: string[] = [];
    const chartIdsByIdentity = new Map([...chartsByIdentity].map(([identityKey, chart]) => [identityKey, chart.id]));
    const sourceDocumentsByIdentity = new Map([...chartsByIdentity].map(([identityKey, chart]) => [identityKey, chart.source_document ?? {}]));
    let reused = 0;
    for (const [identityKey, group] of groups) {
      const chart = chartsByIdentity.get(identityKey);
      if (mode === "data-only" && !chart) fail(`No exact chart configuration exists for ${String(group.configuration.manufacturerChartId ?? group.configuration.chartFamily)}. Data-only import will not create or fall back to another configuration.`, "data-only validation", 409);
      if (chart && ["Verified", "Superseded"].includes(chart.status)) {
        fail(`Chart ${String(group.configuration.manufacturerChartId ?? identityKey)} is ${chart.status}; create a new chart revision instead of editing it.`, "chart status validation", 409);
      }
      if (chart) { reused += 1; if (chart.status === "Draft") draftChartIdsToImport.push(chart.id); }
      else {
        const chartSourceDocument = { ...sourceDocument, sourcePdfLinked: Boolean(sourceDocument.sourcePdfUrl), sourcePdfPending: !sourceDocument.sourcePdfUrl, documents: [...group.sourceDocuments], manufacturer: group.configuration.manufacturer, chartId: group.configuration.manufacturerChartId ?? null,
          duplicatePointConflicts: pointConflicts.filter((conflict) => conflict.configurationKey === identityKey),
          sourcePageRange: [...new Set(group.points.map((point) => point.sourcePage).filter((page) => page != null).map(String))] };
        sourceDocumentsByIdentity.set(identityKey, chartSourceDocument);
        chartRows.push({ crane_profile_id: craneProfileId, configuration_revision_id: configurationRevisionId || null,
          name: String(group.configuration.manufacturerChartId ?? group.configuration.chartFamily), revision,
          counterweight_t: Number(group.configuration.counterweightT), outrigger_state: `${group.configuration.outriggerLengthM} × ${group.configuration.outriggerWidthM} m`,
          slew_sector: String(group.configuration.slewRange), boom_configuration: String(group.configuration.boomType ?? group.configuration.chartFamily),
          boom_length_m: Number(group.configuration.mainBoomLengthM), fly_jib: group.configuration.flyJibFitted ? String(group.configuration.flyJibType ?? "Fitted") : null,
          manufacturer_configuration: group.configuration, status: "Imported", active: true,
          source_document: chartSourceDocument,
          notes: "Imported data. This chart is not Verified until checked against the controlled manufacturer chart." });
      }
      for (const point of group.points) pointRows.push({ load_chart_id: chart?.id ?? null, configuration_key: identityKey,
        radius_m: point.radiusM, rated_capacity_t: point.capacityT, source_page: point.sourcePage == null ? null : String(point.sourcePage) });
    }
    if (chartRows.length) {
      const { data, error } = await service.from("lift_load_charts").insert(chartRows).select("id,manufacturer_configuration");
      if (error) throw dbFailure("chart configuration insert", error);
      for (const chart of data ?? []) {
        const identityKey = String((chart.manufacturer_configuration as Record<string, unknown> | null)?.identityKey ?? "");
        chartIdsByIdentity.set(identityKey, chart.id);
      }
      for (const point of pointRows) if (point.load_chart_id === null) point.load_chart_id = chartIdsByIdentity.get(String(point.configuration_key)) ?? null;
    }
    if (pointRows.some((point) => typeof point.load_chart_id !== "string")) throw new ChartImportFailure("A manufacturer chart configuration was not created for every imported point.", "chart point mapping", "LIFT_CHART_MAPPING", 500);
    let upsertedPointCount = 0;
    for (let index = 0; index < pointRows.length; index += 5_000) {
      const { data, error } = await service.from("lift_load_chart_points").upsert(pointRows.slice(index, index + 5_000), { onConflict: "load_chart_id,configuration_key,radius_m" }).select("id");
      if (error) throw dbFailure("chart point upsert", error);
      upsertedPointCount += data?.length ?? 0;
    }
    if (draftChartIdsToImport.length) {
      const { error } = await service.from("lift_load_charts").update({ status: "Imported" }).in("id", [...new Set(draftChartIdsToImport)]).eq("status", "Draft");
      if (error) throw dbFailure("chart status update", error);
    }
    const conflictsByIdentity = new Map<string, ImportConflict[]>();
    for (const conflict of pointConflicts) {
      const current = conflictsByIdentity.get(conflict.configurationKey) ?? [];
      if (!current.some((item) => item.radiusM === conflict.radiusM && item.selectedCapacityT === conflict.selectedCapacityT)) current.push(conflict);
      conflictsByIdentity.set(conflict.configurationKey, current);
    }
    for (const [identityKey, conflicts] of conflictsByIdentity) {
      if (!chartsByIdentity.has(identityKey)) continue;
      const createdId = chartIdsByIdentity.get(identityKey);
      if (!createdId) continue;
      const previous = sourceDocumentsByIdentity.get(identityKey) ?? {};
      const existingConflicts = Array.isArray(previous.duplicatePointConflicts) ? previous.duplicatePointConflicts as ImportConflict[] : [];
      const mergedConflicts = [...existingConflicts];
      for (const conflict of conflicts) if (!mergedConflicts.some((item) => item.radiusM === conflict.radiusM && item.selectedCapacityT === conflict.selectedCapacityT)) mergedConflicts.push(conflict);
      const { error } = await service.from("lift_load_charts").update({ source_document: { ...previous, duplicatePointConflicts: mergedConflicts } }).eq("id", createdId);
      if (error) throw dbFailure("duplicate point conflict annotation", error);
    }
    return NextResponse.json({ mode, configurationCount: groups.size, createdConfigurationCount: chartRows.length,
      reusedConfigurationCount: reused, matchedConfigurationCount: reused, importedPointCount: pointRows.length, upsertedPointCount,
      skippedDuplicatePointCount, conflictingDuplicatePointCount: conflictKeys.size, batchNumber: batchMetadata.batchNumber,
      totalBatches: batchMetadata.totalBatches, rowStart: batchMetadata.rowStart, rowEnd: batchMetadata.rowEnd,
      sourcePdfLinked: Boolean(sourceDocument.sourcePdfUrl), status: "Imported; verification required" }, { status: 201 });
  } catch (error) {
    if (error instanceof ChartImportFailure) return NextResponse.json({ error: error.message, code: error.code ?? null, stage: error.stage, ...batchMetadata }, { status: error.status });
    const result = liftApiError(error);
    return NextResponse.json({ error: result.message, code: null, stage: "request authorization or processing", ...batchMetadata }, { status: result.status });
  }
}
