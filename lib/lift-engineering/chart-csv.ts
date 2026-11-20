import type { ManufacturerChartConfiguration } from "./chart-configuration.ts";
import { exactChartConfigurationKey } from "./chart-configuration.ts";

export const CHART_IMPORT_BATCH_SIZE = 1000;

export const CHART_CSV_FIELDS = [
  { key: "manufacturerChartId", label: "Manufacturer chart ID", required: false },
  { key: "manufacturer", label: "Manufacturer", required: true },
  { key: "craneModel", label: "Crane model", required: false },
  { key: "sourceDocument", label: "Source document", required: true },
  { key: "chartFamily", label: "Chart family", required: true },
  { key: "configurationCode", label: "Configuration code / LK code", required: false },
  { key: "boomType", label: "Boom type", required: true },
  { key: "mainBoomLengthM", label: "Main boom length (m)", required: true, numeric: true },
  { key: "telescopeConfiguration", label: "Telescope configuration", required: false },
  { key: "counterweightT", label: "Counterweight (t)", required: true, numeric: true },
  { key: "outriggerLengthM", label: "Outrigger length / span (m)", required: true, numeric: true },
  { key: "outriggerWidthM", label: "Outrigger width / span (m)", required: true, numeric: true },
  { key: "slewRange", label: "Slew range", required: false },
  { key: "flyJibFitted", label: "Fly / jib fitted", required: false, boolean: true },
  { key: "flyJibType", label: "Fly / jib type", required: false },
  { key: "flyJibLengthM", label: "Fly / jib length (m)", required: false, numeric: true },
  { key: "flyJibAngleMode", label: "Fly / jib angle mode", required: false },
  { key: "flyJibAngleDeg", label: "Fly / jib angle (°)", required: false, numeric: true },
  { key: "flyJibAngleMinDeg", label: "Fly / jib minimum angle (°)", required: false, numeric: true },
  { key: "flyJibAngleMaxDeg", label: "Fly / jib maximum angle (°)", required: false, numeric: true },
  { key: "boomExtensionM", label: "Boom extension (m)", required: false, numeric: true },
  { key: "windSpeedMps", label: "Wind speed limit (m/s)", required: false, numeric: true },
  { key: "reeving", label: "Reeving configuration", required: false },
  { key: "singleHookBlock", label: "Single hook block", required: false },
  { key: "radiusM", label: "Radius (m)", required: true, numeric: true },
  { key: "capacityT", label: "Rated capacity (t)", required: true, numeric: true },
  { key: "sourcePage", label: "Source page", required: true },
] as const;

export type CsvRecord = Record<string, string> & { __sourceRowNumber?: number };
export type ChartCsvRow = { configuration: ManufacturerChartConfiguration; radiusM: number; capacityT: number; sourcePage: string; sourceDocument: string; sourceRows: number[] };
export type ChartCsvConflict = { configurationKey: string; chartId: string; radiusM: number; capacitiesT: number[]; sourceRows: number[]; selectedCapacityT: number };
export type DeduplicatedChartCsvRows = { rows: ChartCsvRow[]; skippedDuplicateRows: number; conflicts: ChartCsvConflict[] };
export type ChartCsvBatch = { rows: ChartCsvRow[]; rowStart: number; rowEnd: number };

/** Batches contain only unique points for the request; source row ranges remain available for diagnostics. */
export function buildChartCsvBatches(rows: ChartCsvRow[], batchSize = CHART_IMPORT_BATCH_SIZE): ChartCsvBatch[] {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("Chart import batch size must be a positive integer.");
  const batches: ChartCsvBatch[] = [];
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batchRows = rows.slice(offset, offset + batchSize);
    const sourceRows = batchRows.flatMap((row) => row.sourceRows);
    batches.push({ rows: batchRows, rowStart: Math.min(...sourceRows), rowEnd: Math.max(...sourceRows) });
  }
  return batches;
}

export function parseChartCsv(text: string, filter?: { manufacturer?: string; craneModel?: string }): { headers: string[]; records: CsvRecord[] } {
  let headers: string[] = [];
  const records: CsvRecord[] = [];
  let row: string[] = []; let cell = ""; let quoted = false;
  let sourceRowNumber = 0;
  const source = text.replace(/^\uFEFF/, "");
  const commitRow = () => {
    sourceRowNumber += 1;
    row.push(cell); cell = "";
    if (!headers.length) { headers = row.map((header) => header.trim()); row = []; return; }
    if (!row.some((value) => value.trim() !== "")) { row = []; return; }
    const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const manufacturerIndex = headers.findIndex((header) => ["manufacturer", "make"].includes(normalizeHeader(header)));
    const modelIndex = headers.findIndex((header) => ["cranemodel", "model"].includes(normalizeHeader(header)));
    if (filter?.manufacturer && manufacturerIndex >= 0 && (row[manufacturerIndex] ?? "").trim().toLowerCase() !== filter.manufacturer.trim().toLowerCase()) { row = []; return; }
    if (filter?.craneModel && modelIndex >= 0 && (row[modelIndex] ?? "").trim().toLowerCase() !== filter.craneModel.trim().toLowerCase()) { row = []; return; }
    records.push(Object.assign(Object.fromEntries(headers.map((header, index) => [header, (row[index] ?? "").trim()])), { __sourceRowNumber: sourceRowNumber }));
    row = [];
  };
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      commitRow();
    } else cell += character;
  }
  if (cell.length || row.length) commitRow();
  if (!headers.length || headers.every((header) => !header)) throw new Error("CSV has no header row.");
  return { headers, records };
}

export function suggestCsvMappings(headers: string[]): Record<string, string> {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, string[]> = {
    manufacturerChartId: ["manufacturerchartid", "chartid", "chartnumber", "chartno"], manufacturer: ["manufacturer", "make"], craneModel: ["cranemodel", "model"], sourceDocument: ["sourcedocument", "sourcefile", "sourcepdf", "document"],
    chartFamily: ["chartfamily", "family", "chartmode"], configurationCode: ["configurationcode", "lkcode", "lk"],
    boomType: ["boomtype", "boommode"], mainBoomLengthM: ["mainboomlengthm", "boomlengthm", "boomlength"],
    telescopeConfiguration: ["telescopeconfiguration", "telescopeconfig", "teleconfiguration", "teleconfig", "telescope"], counterweightT: ["counterweightt", "counterweight", "cw"],
    outriggerLengthM: ["outriggerlengthm", "outriggerlength", "outriggerlongitudinalm", "outriggerlongitudinal"],
    outriggerWidthM: ["outriggerwidthm", "outriggerwidth", "outriggertransversem", "outriggertransverse"],
    slewRange: ["slewrange", "slewsector", "slew"], flyJibFitted: ["flyjibfitted", "accessoryfitted", "jibfitted"],
    flyJibType: ["flyjibtype", "jibtype", "accessorytype"], flyJibLengthM: ["flyjiblengthm", "flyjiblength", "jiblength"],
    flyJibAngleMode: ["flyjibanglemode", "jibanglemode", "anglefamily"], flyJibAngleDeg: ["flyjibangledeg", "jibangledeg", "angledeg", "angle"],
    flyJibAngleMinDeg: ["flyjibanglemindeg", "jibanglemindeg", "anglemin"], flyJibAngleMaxDeg: ["flyjibanglemaxdeg", "jibanglemaxdeg", "anglemax"],
    boomExtensionM: ["boomextensionm", "boomextension"], windSpeedMps: ["windspeedmps", "windspeed", "windlimit"], reeving: ["reeving", "falls"],
    singleHookBlock: ["singlehookblock", "hookblock"],
    radiusM: ["radiusm", "radius"], capacityT: ["capacityt", "capacity", "ratedcapacityt", "ratedcapacity"],
    sourcePage: ["sourcepage", "page", "pdfpage"],
  };
  const normalizedHeaders = new Map(headers.map((header) => [normalize(header), header]));
  return Object.fromEntries(CHART_CSV_FIELDS.map((field) => {
    const source = (aliases[field.key] ?? [normalize(field.key)]).map(normalize).map((alias) => normalizedHeaders.get(alias)).find(Boolean) ?? "";
    return [field.key, source];
  }));
}

function parseBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "fitted", "with", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "none", "not fitted", "without", "n"].includes(normalized)) return false;
  throw new Error(`Fly/Jib fitted value “${value}” is not a recognized true/false value.`);
}

export function mapChartCsvRecords(records: CsvRecord[], mapping: Record<string, string>): ChartCsvRow[] {
  return records.map((record, index) => {
    const get = (key: string) => mapping[key] ? record[mapping[key]]?.trim() ?? "" : "";
    const configuration: Record<string, unknown> = {};
    for (const field of CHART_CSV_FIELDS) {
      if (["radiusM", "capacityT", "sourcePage", "sourceDocument"].includes(field.key)) continue;
      const value = get(field.key);
      if (field.required && !value) throw new Error(`CSV row ${index + 2} is missing ${field.label}.`);
      if (!value) { configuration[field.key] = null; continue; }
      if ("numeric" in field && field.numeric) {
        const number = Number(value);
        if (!Number.isFinite(number)) throw new Error(`CSV row ${index + 2}: ${field.label} must be numeric.`);
        configuration[field.key] = number;
      } else if ("boolean" in field && field.boolean) configuration[field.key] = parseBoolean(value);
      else configuration[field.key] = value;
    }
    if (configuration.flyJibFitted == null) configuration.flyJibFitted = Boolean(configuration.flyJibType || configuration.flyJibLengthM != null || configuration.flyJibAngleDeg != null);
    const radiusM = Number(get("radiusM")); const capacityT = Number(get("capacityT")); const sourcePage = get("sourcePage"); const sourceDocument = get("sourceDocument");
    if (!Number.isFinite(radiusM) || radiusM < 0 || !Number.isFinite(capacityT) || capacityT <= 0 || !sourcePage) throw new Error(`CSV row ${index + 2} needs valid radius, capacity and source page.`);
    if (!sourceDocument) throw new Error(`CSV row ${index + 2} is missing source document.`);
    return { configuration: configuration as ManufacturerChartConfiguration, radiusM, capacityT, sourcePage, sourceDocument, sourceRows: [record.__sourceRowNumber ?? index + 2] };
  });
}

/** Collapse duplicate chart/radius source rows before batching. Conflicting values use the lower capacity and are reported for review. */
export function deduplicateChartCsvRows(rows: ChartCsvRow[]): DeduplicatedChartCsvRows {
  const byPoint = new Map<string, ChartCsvRow>();
  const capacitySets = new Map<string, Set<number>>();
  let skippedDuplicateRows = 0;
  for (const row of rows) {
    const configurationKey = exactChartConfigurationKey(row.configuration);
    const key = `${configurationKey}|${row.radiusM}`;
    const current = byPoint.get(key);
    if (!current) {
      byPoint.set(key, { ...row, sourceRows: [...row.sourceRows] });
      capacitySets.set(key, new Set([row.capacityT]));
      continue;
    }
    skippedDuplicateRows += 1;
    capacitySets.get(key)?.add(row.capacityT);
    current.sourceRows = [...new Set([...current.sourceRows, ...row.sourceRows])];
    if (row.capacityT < current.capacityT) {
      current.capacityT = row.capacityT;
      current.sourcePage = row.sourcePage;
      current.sourceDocument = row.sourceDocument;
    }
  }
  const conflicts: ChartCsvConflict[] = [];
  for (const [key, capacities] of capacitySets) {
    if (capacities.size <= 1) continue;
    const row = byPoint.get(key)!;
    conflicts.push({
      configurationKey: exactChartConfigurationKey(row.configuration),
      chartId: String(row.configuration.manufacturerChartId ?? row.configuration.chartFamily ?? "Unknown chart"),
      radiusM: row.radiusM,
      capacitiesT: [...capacities].sort((a, b) => a - b),
      sourceRows: row.sourceRows,
      selectedCapacityT: row.capacityT,
    });
  }
  return { rows: [...byPoint.values()], skippedDuplicateRows, conflicts };
}
