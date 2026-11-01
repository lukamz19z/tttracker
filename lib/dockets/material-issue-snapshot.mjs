const HISTORICAL_DOCKET_STATUSES = new Set([
  "submitted",
  "submitted_bc",
  "approved",
  "bc_approved",
  "client_pending",
  "final",
  "finalised",
  "finalized",
  "legacy_final",
]);

/**
 * Select immutable saved material state for historical dockets, otherwise
 * date-cutoff/live data. An empty saved array is still a valid snapshot.
 * @template T
 * @param {unknown} status
 * @param {unknown} savedSnapshot
 * @param {T[]} fallback
 * @returns {T[]}
 */
export function selectDocketMaterialSnapshot(status, savedSnapshot, fallback) {
  const normalizedStatus = String(status ?? "").trim().toLowerCase();
  return HISTORICAL_DOCKET_STATUSES.has(normalizedStatus) && Array.isArray(savedSnapshot)
    ? /** @type {T[]} */ (savedSnapshot)
    : fallback;
}
