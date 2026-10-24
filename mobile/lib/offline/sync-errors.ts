export class DependencyBlockedError extends Error {
  readonly code = "BLOCKED_BY_DEPENDENCY";
}

/** Only operational transport/service failures receive automatic retries. */
export function classifySyncError(error: unknown): "blocked_by_dependency" | "retryable_failure" | "requires_reconciliation" {
  const value = error && typeof error === "object" ? error as { code?: string; status?: number; message?: string } : {};
  const message = value.message || String(error || "");
  if (value.code === "BLOCKED_BY_DEPENDENCY" || /must sync before|waiting for all findings/i.test(message)) return "blocked_by_dependency";
  if (value.code === "RECONCILIATION_REQUIRED" || /unique constraint|duplicate key|validation|invalid state/i.test(message)) return "requires_reconciliation";
  if (value.status) return [408, 429, 502, 503, 504].includes(value.status) ? "retryable_failure" : "requires_reconciliation";
  return /timed? out|timeout|network|fetch failed|failed to fetch|connection|offline|internet|aborted/i.test(message) ? "retryable_failure" : "requires_reconciliation";
}

export function automaticRetryDue(record: { status: string; attempts: number; updatedAt: string; lastError: string | null }, now = Date.now()) {
  if (record.status === "requires_reconciliation") return false;
  if (record.status === "failed" && classifySyncError(new Error(record.lastError || "")) === "blocked_by_dependency") return true;
  if (["failed", "retryable_failure"].includes(record.status)) {
    if ((record.status === "failed" && classifySyncError(new Error(record.lastError || "")) !== "retryable_failure") || record.attempts > 2) return false;
    return now - new Date(record.updatedAt).getTime() >= (record.attempts > 1 ? 30_000 : 5_000);
  }
  return true;
}

export function safeSyncMessage(message: string | null) {
  return message && /duplicate key|unique constraint/i.test(message)
    ? "Quality numbering requires reconciliation. Update the website service before retrying."
    : message;
}
