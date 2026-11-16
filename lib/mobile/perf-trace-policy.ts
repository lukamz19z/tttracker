export const PROFILE_MOBILE_TRACE_PATH = "/api/mobile/bootstrap";

export function shouldTraceMobileRequest(
  development: boolean,
  flag: string | undefined,
  pathname: string,
) {
  return development || (flag === "1" && pathname === PROFILE_MOBILE_TRACE_PATH);
}

export function isSafeMobileTraceId(value: string) {
  return /^[a-zA-Z0-9_-]{8,120}$/.test(value);
}
