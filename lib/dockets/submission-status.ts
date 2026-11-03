export const ACTIVE_DOCKET_SUBMISSION_STATUSES = new Set([
  "submitted_bc",
  "client_pending",
  "final",
  "legacy_final",
  "approved",
  "bc_approved",
]);

const NOT_SUBMITTED_DOCKET_STATUSES = new Set([
  "not_found",
  "draft",
  "legacy",
  "bc_changes_requested",
  "client_changes_requested",
]);

export function isSubmittedDailyDocketStatus(status: unknown) {
  return ACTIVE_DOCKET_SUBMISSION_STATUSES.has(String(status ?? "").trim().toLowerCase());
}

export async function reconcileDailyDocketSubmissionStatus<T extends { status: string; submitted: boolean }>(
  readStatus: () => Promise<T>,
): Promise<
  | { state: "submitted"; result: T }
  | { state: "not_submitted"; result: T }
  | { state: "unknown"; error?: unknown }
> {
  try {
    const result = await readStatus();
    if (result.submitted && isSubmittedDailyDocketStatus(result.status)) {
      return { state: "submitted", result };
    }
    if (NOT_SUBMITTED_DOCKET_STATUSES.has(String(result.status ?? "").trim().toLowerCase())) {
      return { state: "not_submitted", result };
    }
    return { state: "unknown" };
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error
      ? Number(error.status)
      : undefined;
    if (status === 401 || status === 403) throw error;
    return { state: "unknown", error };
  }
}
