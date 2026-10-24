// Mobile fallback defaults, resolved once by the server bootstrap. Existing
// docket/copy values are retained; no V2 configuration schema is assumed.
export const MOBILE_DOCKET_DEFAULTS = { prestartMinutes: "15", lunchBreakMinutes: "60" };

export function recommendedDocketDate(previous: string | null, today: string) {
  if (!previous || previous > today) return today;
  const [year, month, day] = previous.split("-").map(Number);
  const next = new Date(year, month - 1, day + 1, 12);
  const date = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  return date > today ? today : date;
}
