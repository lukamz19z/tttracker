export const PROFILE_MOBILE_TRACE_PATH = "/api/mobile/bootstrap";
export const DASHBOARD_SUMMARY_MOBILE_TRACE_PATH = "/api/mobile/dashboard-summary";

export function shouldTraceMobileRequest(
  development: boolean,
  flag: string | undefined,
  pathname: string,
) {
  return development || (flag === "1" && [PROFILE_MOBILE_TRACE_PATH, DASHBOARD_SUMMARY_MOBILE_TRACE_PATH].includes(pathname));
}

/** Client production diagnostics are opt-in and cover every mobile request. */
export function shouldTraceMobileClientRequest(
  development: boolean,
  flag: string | undefined,
) {
  return development || flag === "1";
}

export function isSafeMobileTraceId(value: string) {
  return /^[a-zA-Z0-9_-]{8,120}$/.test(value);
}
