import { isFutureDocketDate } from "@/lib/dockets/calendar-date";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateProgressTotals,
  buildTowerProgressStatus,
  SECTION_V2_DEFS,
  SECTION_PROGRESS_WEIGHTS,
} from "@/lib/dockets/calculations";

export type TowerProgressTower = { id: string; extra_data?: Record<string, unknown> | null };
type TowerRecord = Pick<TowerProgressTower, "extra_data">;
export type TowerProgressDocket = {
  id: string;
  tower_id?: string | null;
  assembly_percent?: number | null;
  erection_percent?: number | null;
  docket_date?: string | null;
  approval_status?: string | null;
  progress_model?: string | null;
};
export type TowerProgressHistoryRow = {
  docket_id: string;
  tower_id: string | null;
  progress_model?: string | null;
  section_code?: string | null;
  section_label?: string | null;
  assembly_today?: number | string | null;
  assembly_overall?: number | string | null;
  erection_today?: number | string | null;
  erection_overall?: number | string | null;
  assembled_qty?: number | string | null;
  erected_qty?: number | string | null;
  assembly_weight?: number | null;
  erection_weight?: number | null;
  created_at?: string | null;
};

function toStringValue(value: unknown) {
  return value == null ? "" : String(value);
}

// Match the current Daily Docket's CSV/extra_data interpretation, including its
// include-BE default when the tower has no explicit configuration.
function normaliseText(value: unknown) {
  return toStringValue(value)
    .trim()
    .toLowerCase()
    .replace(/[_\-.()/]+/g, " ")
    .replace(/\s+/g, " ");
}

function parsePositiveIndicator(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value > 0;

  const text = normaliseText(value);
  if (!text) return null;

  if (["yes", "y", "true", "included", "include", "required", "req", "body extension"].includes(text)) {
    return true;
  }

  if (["no", "n", "false", "none", "nil", "na", "n a", "not required", "not included"].includes(text)) {
    return false;
  }

  const match = text.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (match) {
    const n = Number(match[0]);
    if (Number.isFinite(n)) return n > 0;
  }

  return null;
}

function readExtraBodyExtensionValue(extra: Record<string, unknown>) {
  const bodyExtensionKeys = [
    "Body Extension",
    "Body Extensions",
    "Body Extension Height",
    "Body Extension Length",
    "Body Extension Qty",
    "Body Extension Required",
    "Body Ext (m)",
    "BODY EXT (M)",
    "Body Ext",
    "Body Ext.",
    "BE",
    "BE Height",
    "Extension",
    "Extension Height",
    "body_extension",
    "body_extensions",
    "body_extension_height",
    "body_ext_m",
    "body_ext",
  ].map(normaliseText);

  const normalisedExtra = Object.entries(extra).map(([key, value]) => ({
    key,
    normalisedKey: normaliseText(key),
    value,
  }));

  for (const expectedKey of bodyExtensionKeys) {
    const found = normalisedExtra.find((entry) => entry.normalisedKey === expectedKey);
    if (!found) continue;
    const parsed = parsePositiveIndicator(found.value);
    if (parsed !== null) return parsed;
  }

  for (const entry of normalisedExtra) {
    const key = entry.normalisedKey;
    const looksLikeBodyExtensionKey =
      (key.includes("body") && (key.includes("ext") || key.includes("extension"))) ||
      key === "be" ||
      key === "b e";

    if (!looksLikeBodyExtensionKey) continue;
    const parsed = parsePositiveIndicator(entry.value);
    if (parsed !== null) return parsed;
  }

  const joinedExtra = Object.values(extra).map(normaliseText).join(" ");
  if (/\bbody\s*(ext|extension)\b/.test(joinedExtra)) return true;

  return null;
}

export function inferTowerHasBodyExtension(tower: TowerRecord | null) {
  const extra = tower?.extra_data || {};
  const value = readExtraBodyExtensionValue(extra);
  if (value !== null) return value;
  return true;
}

// Changes-requested records retain their submitted operational progress.
function isOperationalDocket(docket: TowerProgressDocket | undefined) {
  if (!docket) return false;
  return !docket.approval_status || [
    "legacy", "submitted_bc", "client_pending", "final", "legacy_final",
    "bc_changes_requested", "client_changes_requested",
  ].includes(docket.approval_status);
}

// Current construction progress is monotonic per section/phase, not date-led.
export function calculateTowerSectionProgress(
  towerId: string,
  history: TowerProgressHistoryRow[],
  dockets: TowerProgressDocket[],
  hasBodyExtension: boolean,
) {
  const docketById = new Map(dockets.map((docket) => [docket.id, docket]));
  const rows = history.filter((row) =>
    row.tower_id === towerId && isOperationalDocket(docketById.get(row.docket_id)) &&
    (row.progress_model || docketById.get(row.docket_id)?.progress_model) !== "legacy"
  );
  let hasUsableProgress = false;
  const sectionV2Rows = SECTION_V2_DEFS.map(([section_code, section_label]) => {
    const sectionRows = rows.filter((row) =>
      String(row.section_code || row.section_label || "").trim().toUpperCase().replace(/\s+/g, "_") === section_code
    );
    const maximumValue = (phase: "assembly" | "erection") => {
      if (section_code === "BE" && !hasBodyExtension) return "";
      let maximum: number | null = null;
      for (const row of sectionRows) {
        const value = phase === "assembly"
          ? row.assembly_overall ?? row.assembly_today ?? row.assembled_qty
          : row.erection_overall ?? row.erection_today ?? row.erected_qty;
        if (value == null || String(value).trim() === "" || !Number.isFinite(Number(value))) continue;
        hasUsableProgress = true;
        maximum = Math.max(maximum ?? 0, Math.max(0, Math.min(100, Number(value))));
      }
      return maximum ?? "";
    };
    return {
      section_code, section_label,
      assembly_today: maximumValue("assembly"),
      erection_today: maximumValue("erection"),
      assembly_weight: SECTION_PROGRESS_WEIGHTS[section_code] ?? 0,
      erection_weight: SECTION_PROGRESS_WEIGHTS[section_code] ?? 0,
    };
  });
  if (!hasUsableProgress) return null;
  return calculateProgressTotals({
    progressModel: "section_v2", sectionV2Rows, legacyRows: [], hasBodyExtension,
  });
}

export type ResolvedTowerProgress = {
  assemblyPercent: number;
  erectionPercent: number;
  totalProgressPercent: number;
  status: ReturnType<typeof buildTowerProgressStatus>;
  latestDocketDate: string | null;
  source: "section_v2" | "legacy";
};

/** Resolve current construction progress, not daily production or manhour allocation. */
export function resolveTowerProgress(
  tower: TowerProgressTower,
  history: TowerProgressHistoryRow[],
  dockets: TowerProgressDocket[],
): ResolvedTowerProgress {
  const towerRows = history.filter((row) => row.tower_id === tower.id);
  const primaryDockets = dockets.filter((docket) => docket.tower_id === tower.id && isOperationalDocket(docket));
  const workedDocketIds = new Set(towerRows.map((row) => row.docket_id));
  const latestDocketDate = dockets
    .filter((docket) => isOperationalDocket(docket) &&
      (docket.tower_id === tower.id || workedDocketIds.has(docket.id)))
    .map((docket) => docket.docket_date)
    .filter((date): date is string => typeof date === "string" && date.length > 0 && !isFutureDocketDate(date))
    .sort().at(-1) || null;
  const sectionTotals = calculateTowerSectionProgress(
    tower.id, towerRows, dockets, inferTowerHasBodyExtension(tower),
  );
  if (sectionTotals) return {
    assemblyPercent: sectionTotals.assemblyPercent,
    erectionPercent: sectionTotals.erectionPercent,
    totalProgressPercent: sectionTotals.totalProgressPercent,
    status: buildTowerProgressStatus(sectionTotals.totalProgressPercent),
    latestDocketDate, source: "section_v2",
  };

  // Preserve the existing primary-docket legacy fallback and 50/50 formula.
  let assemblyPercent = 0, erectionPercent = 0, totalProgressPercent = 0;
  for (const docket of primaryDockets) {
    const assembly = Number(docket.assembly_percent || 0);
    const erection = Number(docket.erection_percent || 0);
    const overall = Math.round(assembly * 0.5 + erection * 0.5);
    if (Number.isFinite(overall) && overall >= totalProgressPercent) {
      assemblyPercent = Math.round(assembly);
      erectionPercent = Math.round(erection);
      totalProgressPercent = overall;
    }
  }
  return {
    assemblyPercent, erectionPercent, totalProgressPercent,
    status: buildTowerProgressStatus(totalProgressPercent),
    latestDocketDate, source: "legacy",
  };
}

/** Group once rather than scan the project's entire history for every tower. */
export function resolveTowerProgressBatch(
  towers: TowerProgressTower[],
  history: TowerProgressHistoryRow[],
  dockets: TowerProgressDocket[],
): Map<string, ResolvedTowerProgress> {
  const rowsByTower = new Map<string, TowerProgressHistoryRow[]>();
  const primaryByTower = new Map<string, TowerProgressDocket[]>();
  const docketById = new Map(dockets.map((docket) => [docket.id, docket]));
  for (const row of history) {
    if (!row.tower_id) continue;
    const rows = rowsByTower.get(row.tower_id) || [];
    rows.push(row); rowsByTower.set(row.tower_id, rows);
  }
  for (const docket of dockets) {
    if (!docket.tower_id) continue;
    const rows = primaryByTower.get(docket.tower_id) || [];
    rows.push(docket); primaryByTower.set(docket.tower_id, rows);
  }
  return new Map(towers.map((tower) => {
    const rows = rowsByTower.get(tower.id) || [];
    const related = new Map((primaryByTower.get(tower.id) || []).map((docket) => [docket.id, docket]));
    for (const row of rows) {
      const parent = docketById.get(row.docket_id);
      if (parent) related.set(parent.id, parent);
    }
    return [tower.id, resolveTowerProgress(tower, rows, [...related.values()])];
  }));
}

/** Fetch by receiving tower IDs, regardless of the parent docket's primary
 * tower. Batched IN queries and paged rows avoid per-tower calls and truncation.
 * Existing primary-docket arrays remain separate for callers' hours/history. */
export async function loadTowerProgressForTowers(
  supabase: SupabaseClient,
  towers: TowerProgressTower[],
  primaryDockets: TowerProgressDocket[],
): Promise<Map<string, ResolvedTowerProgress>> {
  const towerIds = [...new Set(towers.map((tower) => tower.id))];
  const history: TowerProgressHistoryRow[] = [];
  for (let start = 0; start < towerIds.length; start += 200) {
    for (let offset = 0; ; offset += 1000) {
      const result = await supabase.from("tower_docket_progress").select("*")
        .in("tower_id", towerIds.slice(start, start + 200))
        .order("tower_id").order("docket_id").order("section_code")
        .range(offset, offset + 999);
      if (result.error) throw new Error(`Tower progress history could not be loaded: ${result.error.message}`);
      const page = (result.data || []) as TowerProgressHistoryRow[];
      history.push(...page);
      if (page.length < 1000) break;
    }
  }
  const docketsById = new Map(primaryDockets.map((docket) => [docket.id, docket]));
  const parentIds = [...new Set([...primaryDockets.map((docket) => docket.id), ...history.map((row) => row.docket_id)])];
  for (let start = 0; start < parentIds.length; start += 200) {
    const result = await supabase.from("tower_daily_dockets")
      .select("id,tower_id,docket_date,approval_status,progress_model,assembly_percent,erection_percent")
      .in("id", parentIds.slice(start, start + 200));
    if (result.error) throw new Error(`Tower progress docket dates could not be loaded: ${result.error.message}`);
    for (const docket of (result.data || []) as TowerProgressDocket[]) docketsById.set(docket.id, docket);
  }
  if (parentIds.some((id) => !docketsById.has(id))) throw new Error("A parent docket for tower progress is unavailable.");
  return resolveTowerProgressBatch(towers, history, [...docketsById.values()]);
}
