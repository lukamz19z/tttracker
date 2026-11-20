import { NextResponse } from "next/server";
import { exactChartConfigurationKey, type ManufacturerChartConfiguration } from "@/lib/lift-engineering/chart-configuration";
import { LIFT_ACCESS, liftApiError, liftInvalid, requireLiftAccess } from "@/lib/lift-engineering/server";

type ImportRow = { configuration: ManufacturerChartConfiguration; radiusM: number; capacityT: number; sourcePage?: string | number | null; sourceDocument?: string | null };
type ChartRow = { id: string; status: string; manufacturer_configuration: ManufacturerChartConfiguration; source_document: Record<string, unknown> };

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
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const body = await request.json() as Record<string, unknown>;
    const mode = body.mode === "data-only" ? "data-only" : body.mode === "chart-book" ? "chart-book" : null;
    const craneProfileId = typeof body.craneProfileId === "string" ? body.craneProfileId.trim() : "";
    const configurationRevisionId = typeof body.configurationRevisionId === "string" ? body.configurationRevisionId.trim() : "";
    const revision = typeof body.revision === "string" ? body.revision.trim() : "";
    const sourceDocument = body.sourceDocument && typeof body.sourceDocument === "object" && !Array.isArray(body.sourceDocument)
      ? body.sourceDocument as Record<string, unknown> : {};
    const rows = Array.isArray(body.rows) ? body.rows as ImportRow[] : [];
    if (!mode || !craneProfileId || !revision || !rows.length || rows.length > 100_000) {
      liftInvalid("Choose an import mode, crane, chart revision and provide up to 100,000 chart rows.");
    }
    if (configurationRevisionId) {
      const { data: configuration, error: configurationError } = await service.from("lift_crane_configuration_revisions")
        .select("id,configuration_id,lift_crane_configurations(crane_profile_id)").eq("id", configurationRevisionId).maybeSingle();
      if (configurationError) throw new Error(configurationError.message);
      const parentConfiguration = Array.isArray(configuration?.lift_crane_configurations) ? configuration.lift_crane_configurations[0] : configuration?.lift_crane_configurations;
      if (!configuration || parentConfiguration?.crane_profile_id !== craneProfileId) liftInvalid("The selected configuration revision does not belong to the selected crane.");
    }
    const groups = new Map<string, { configuration: ManufacturerChartConfiguration; points: ImportRow[]; sourceDocuments: Set<string> }>();
    for (const [index, row] of rows.entries()) {
      if (!validConfiguration(row.configuration)) liftInvalid(`Chart row ${index + 1} is missing required manufacturer configuration fields.`);
      const radiusM = Number(row.radiusM); const capacityT = Number(row.capacityT);
      if (!Number.isFinite(radiusM) || radiusM < 0 || !Number.isFinite(capacityT) || capacityT <= 0) liftInvalid(`Chart row ${index + 1} has an invalid radius or capacity.`);
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
    if (existingError) throw new Error(existingError.message);
    const existing = (existingRows ?? []) as ChartRow[];
    const chartsByIdentity = new Map<string, ChartRow>();
    for (const chart of existing) {
      const key = chart.manufacturer_configuration?.identityKey;
      if (typeof key !== "string") continue;
      if (chartsByIdentity.has(key)) liftInvalid("Duplicate exact chart configurations already exist for this crane revision. Resolve the duplicate records before importing.");
      chartsByIdentity.set(key, chart);
    }
    const chartRows: Array<Record<string, unknown>> = [];
    const pointRows: Array<Record<string, unknown>> = [];
    const draftChartIdsToImport: string[] = [];
    let reused = 0;
    for (const [identityKey, group] of groups) {
      const chart = chartsByIdentity.get(identityKey);
      if (mode === "data-only" && !chart) liftInvalid(`No exact chart configuration exists for ${String(group.configuration.manufacturerChartId ?? group.configuration.chartFamily)}. Data-only import will not create or fall back to another configuration.`);
      if (chart && ["Verified", "Superseded"].includes(chart.status)) {
        liftInvalid(`Chart ${String(group.configuration.manufacturerChartId ?? identityKey)} is ${chart.status}; create a new chart revision instead of editing it.`);
      }
      if (chart) { reused += 1; if (chart.status === "Draft") draftChartIdsToImport.push(chart.id); }
      else {
        chartRows.push({ crane_profile_id: craneProfileId, configuration_revision_id: configurationRevisionId || null,
          name: String(group.configuration.manufacturerChartId ?? group.configuration.chartFamily), revision,
          counterweight_t: Number(group.configuration.counterweightT), outrigger_state: `${group.configuration.outriggerLengthM} × ${group.configuration.outriggerWidthM} m`,
          slew_sector: String(group.configuration.slewRange), boom_configuration: String(group.configuration.boomType ?? group.configuration.chartFamily),
          boom_length_m: Number(group.configuration.mainBoomLengthM), fly_jib: group.configuration.flyJibFitted ? String(group.configuration.flyJibType ?? "Fitted") : null,
          manufacturer_configuration: group.configuration, status: "Imported", active: true,
          source_document: { ...sourceDocument, documents: [...group.sourceDocuments], manufacturer: group.configuration.manufacturer, chartId: group.configuration.manufacturerChartId ?? null,
            sourcePageRange: [...new Set(group.points.map((point) => point.sourcePage).filter((page) => page != null).map(String))] },
          notes: "Imported data. This chart is not Verified until checked against the controlled manufacturer chart." });
      }
      for (const point of group.points) pointRows.push({ load_chart_id: chart?.id ?? null, configuration_key: identityKey,
        radius_m: point.radiusM, rated_capacity_t: point.capacityT, source_page: point.sourcePage == null ? null : String(point.sourcePage) });
    }
    if (chartRows.length) {
      const { data, error } = await service.from("lift_load_charts").insert(chartRows).select("id,manufacturer_configuration");
      if (error) throw new Error(`Chart metadata import failed: ${error.message}`);
      for (const chart of data ?? []) {
        const identityKey = String((chart.manufacturer_configuration as Record<string, unknown> | null)?.identityKey ?? "");
        for (const point of pointRows) if (point.load_chart_id === null && point.configuration_key === identityKey) point.load_chart_id = chart.id;
      }
    }
    if (pointRows.some((point) => typeof point.load_chart_id !== "string")) throw new Error("A manufacturer chart configuration was not created for every imported point.");
    for (let index = 0; index < pointRows.length; index += 5_000) {
      const { error } = await service.from("lift_load_chart_points").upsert(pointRows.slice(index, index + 5_000), { onConflict: "load_chart_id,configuration_key,radius_m" });
      if (error) throw new Error(`Chart point import failed: ${error.message}`);
    }
    if (draftChartIdsToImport.length) {
      const { error } = await service.from("lift_load_charts").update({ status: "Imported" }).in("id", [...new Set(draftChartIdsToImport)]).eq("status", "Draft");
      if (error) throw new Error(`Chart points were saved, but import status could not be updated: ${error.message}`);
    }
    return NextResponse.json({ mode, configurationCount: groups.size, createdConfigurationCount: chartRows.length,
      reusedConfigurationCount: reused, importedPointCount: pointRows.length, status: "Imported; verification required" }, { status: 201 });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
