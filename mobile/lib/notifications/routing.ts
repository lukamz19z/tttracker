import type { Href } from "expo-router";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function params(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

function withQuery(route: string, values: Record<string, unknown>): Href {
  const query = Object.entries(values)
    .filter(([, value]) => value !== null && value !== undefined && typeof value !== "object")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  return `${route}${query ? `${route.includes("?") ? "&" : "?"}${query}` : ""}` as Href;
}

export function mobileRouteForNotification(data: Record<string, unknown>): Href | null {
  const actionParams = params(data.action_params ?? data.actionParams);

  const trainingRecordId = clean(
    actionParams.training_record_id ?? data.training_record_id ?? data.trainingRecordId,
  );
  if (trainingRecordId) {
    return `/training/${encodeURIComponent(trainingRecordId)}` as Href;
  }

  const docketId = clean(actionParams.docket_id ?? data.docket_id ?? data.docketId);
  if (docketId) {
    return `/approvals/dockets/${encodeURIComponent(docketId)}` as Href;
  }

  const submissionId = clean(
    actionParams.submission_id ?? data.submission_id ?? data.submissionId,
  );
  const submissionType = clean(
    actionParams.submission_type ?? data.submission_type ?? data.submissionType,
  );
  if (submissionId && submissionType === "invoice") {
    return `/approvals/invoices/${encodeURIComponent(submissionId)}` as Href;
  }
  if (submissionId && (submissionType === "expense_claim" || submissionType === "expense")) {
    return `/approvals/expenses/${encodeURIComponent(submissionId)}` as Href;
  }

  const defectId = clean(actionParams.defect_id ?? data.defect_id ?? data.defectId);
  if (defectId) {
    return `/defects/${encodeURIComponent(defectId)}` as Href;
  }

  const revisionId = clean(actionParams.revision_id ?? data.revision_id ?? data.revisionId);
  if (revisionId) {
    return `/revisions/${encodeURIComponent(revisionId)}` as Href;
  }

  const mobileRoute = clean(actionParams.mobile_route ?? data.mobile_route);
  if (mobileRoute.startsWith("/")) {
    return withQuery(mobileRoute, actionParams);
  }

  // Existing notification producers may already set action_route. Reuse it
  // when it is a mobile-compatible path, rather than hard-coding an event list.
  const actionRoute = clean(data.action_route ?? data.actionRoute);
  if (actionRoute.startsWith("/")) {
    // Web-only project routes are intentionally not opened in Expo. Known
    // workflow identifiers above are converted to their native mobile route.
    if (!actionRoute.startsWith("/project/")) {
      return withQuery(actionRoute, actionParams);
    }
  }

  return "/(drawer)/notifications" as Href;
}
