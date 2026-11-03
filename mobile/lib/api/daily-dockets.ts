// mobile/lib/api/daily-dockets.ts
//
// Batch 1 API contract for the rebuilt Daily Docket editor.
//
// IMPORTANT:
// These API endpoints are installed in Batch 2.
// Nothing in the current Daily Dockets screen imports this file yet, so adding
// Batch 1 does not change the existing app behaviour.

import { apiFetch } from "@/lib/api/client";
import { classifyBackendFailure } from "../../../lib/backend-resilience";
import type {
  DailyDocketDraft,
  DailyDocketEditorPayload,
  SaveDailyDocketResult,
  SubmitDailyDocketResult,
} from "@/types/daily-dockets";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

async function readJson<T>(
  response: Response,
  fallback: string,
): Promise<T> {
  const raw = await response.text();

  let payload: unknown = null;

  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload
        ? clean(
            (
              payload as {
                error?: unknown;
              }
            ).error,
          )
        : "";

    throw new Error(
      message ||
        clean(raw) ||
        `${fallback} (${response.status})`,
    );
  }

  return (payload ?? {}) as T;
}

function queryString(
  values: Record<
    string,
    string | null | undefined
  >,
) {
  const entries = Object.entries(values)
    .filter(([, value]) => clean(value))
    .map(
      ([key, value]) =>
        `${encodeURIComponent(
          key,
        )}=${encodeURIComponent(
          clean(value),
        )}`,
    );

  return entries.length
    ? `?${entries.join("&")}`
    : "";
}

export async function getDailyDocketEditor(
  params: {
    projectId: string;
    towerId: string;
    docketId?: string | null;
    docketDate?: string | null;
    copyPrevious?: boolean;
  },
) {
  const response = await apiFetch(
    `/api/mobile/daily-dockets/editor${queryString(
      {
        projectId: params.projectId,
        towerId: params.towerId,
        docketId: params.docketId,
        docketDate: params.docketDate,
        copyPrevious:
          params.copyPrevious
            ? "1"
            : "",
      },
    )}`,
  );

  return readJson<DailyDocketEditorPayload>(
    response,
    "Daily Docket editor data could not be loaded.",
  );
}

export async function saveDailyDocket(
  draft: DailyDocketDraft,
) {
  const response = await apiFetch(
    "/api/mobile/daily-dockets/save",
    {
      method: "POST",
      timeoutMs: 60_000,
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        draft,
      }),
    },
  );

  return readJson<SaveDailyDocketResult>(
    response,
    "Daily Docket could not be saved.",
  );
}

export async function submitDailyDocketForBc(
  docketId: string,
) {
  const id = clean(docketId);

  if (!id) {
    throw new Error(
      "Daily Docket ID is required.",
    );
  }

  const response = await apiFetch(
    `/api/daily-dockets/${encodeURIComponent(
      id,
    )}/submit-bc`,
    {
      method: "POST",
      timeoutMs: 60_000,
    },
  );

  return readJson<SubmitDailyDocketResult>(
    response,
    "Daily Docket could not be submitted for BC approval.",
  );
}

export type DailyDocketSubmissionStatus = {
  docketId: string;
  status: string;
  revision: number;
  submittedAt: string | null;
  submitted: boolean;
};

export async function getDailyDocketSubmissionStatus(
  projectId: string,
  docketId: string,
): Promise<DailyDocketSubmissionStatus | { docketId: string; status: "not_found"; revision: number; submittedAt: null; submitted: false }> {
  const id = clean(docketId);
  const project = clean(projectId);
  const response = await apiFetch(
    `/api/mobile/daily-dockets/${encodeURIComponent(id)}/status?projectId=${encodeURIComponent(project)}`,
    { method: "GET", dedupe: false },
  );
  if (response.status === 404) {
    await response.text();
    return { docketId: id, status: "not_found", revision: 0, submittedAt: null, submitted: false };
  }
  return readJson<DailyDocketSubmissionStatus>(response, "Daily Docket submission status could not be checked.");
}

export function isAmbiguousDailyDocketMutationFailure(error: unknown) {
  return classifyBackendFailure(error).transient;
}

export async function runDailyDocketLifecycleAction(docketId: string, action: "retract" | "delete") {
  const response = await apiFetch(`/api/daily-dockets/${encodeURIComponent(clean(docketId))}/lifecycle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  return readJson<{ success: boolean; result?: { status: string } }>(response, "Daily Docket action failed.");
}
