import {
  calculateProgressTotals,
  SECTION_V2_DEFS,
  SECTION_PROGRESS_WEIGHTS,
} from "@/lib/dockets/calculations";

type TowerRecord = { extra_data?: Record<string, unknown> | null };
export type TowerProgressDocket = {
  id: string;
  docket_date?: string | null;
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

// Parent docket date defines activity chronology; a row timestamp breaks ties
// within a day. An old docket edited later must not override a newer work date.
export function calculateTowerSectionProgress(
  towerId: string,
  history: TowerProgressHistoryRow[],
  dockets: TowerProgressDocket[],
  hasBodyExtension: boolean,
) {
  const docketById = new Map(dockets.map((docket) => [docket.id, docket]));
  const rows = history.filter((row) =>
    row.tower_id === towerId &&
    (row.progress_model || docketById.get(row.docket_id)?.progress_model) !== "legacy"
  ).sort((a, b) => {
    const dateOrder = (docketById.get(b.docket_id)?.docket_date || "")
      .localeCompare(docketById.get(a.docket_id)?.docket_date || "");
    return dateOrder || (b.created_at || "").localeCompare(a.created_at || "");
  });
  let hasUsableProgress = false;
  const sectionV2Rows = SECTION_V2_DEFS.map(([section_code, section_label]) => {
    const sectionRows = rows.filter((row) =>
      String(row.section_code || row.section_label || "").trim().toUpperCase().replace(/\s+/g, "_") === section_code
    );
    const latestValue = (phase: "assembly" | "erection") => {
      if (section_code === "BE" && !hasBodyExtension) return "";
      for (const row of sectionRows) {
        const value = phase === "assembly"
          ? row.assembly_overall ?? row.assembly_today ?? row.assembled_qty
          : row.erection_overall ?? row.erection_today ?? row.erected_qty;
        if (value == null || String(value).trim() === "" || !Number.isFinite(Number(value))) continue;
        hasUsableProgress = true;
        return value;
      }
      return "";
    };
    return {
      section_code, section_label,
      assembly_today: latestValue("assembly"),
      erection_today: latestValue("erection"),
      assembly_weight: SECTION_PROGRESS_WEIGHTS[section_code] ?? 0,
      erection_weight: SECTION_PROGRESS_WEIGHTS[section_code] ?? 0,
    };
  });
  if (!hasUsableProgress) return null;
  return calculateProgressTotals({
    progressModel: "section_v2", sectionV2Rows, legacyRows: [], hasBodyExtension,
  });
}
