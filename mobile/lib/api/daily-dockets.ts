// mobile/lib/api/daily-dockets.ts
//
// Batch 1 API contract for the rebuilt Daily Docket editor.
//
// IMPORTANT:
// These API endpoints are installed in Batch 2.
// Nothing in the current Daily Dockets screen imports this file yet, so adding
// Batch 1 does not change the existing app behaviour.

import { apiFetch } from "@/lib/api/client";
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
    },
  );

  return readJson<SubmitDailyDocketResult>(
    response,
    "Daily Docket could not be submitted for BC approval.",
  );
}
