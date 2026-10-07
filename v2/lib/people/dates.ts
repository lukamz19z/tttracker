export function formatPeopleDate(
  value: unknown,
  withTime = false,
  timeZone?: string,
): string {
  if (value == null || value === "") return "\u2014";
  const raw = String(value);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "\u2014";
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime
      ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const }
      : {}),
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")}${withTime ? ` ${get("hour")}:${get("minute")}` : ""}`;
}
export function parsePeopleDate(
  input: string,
  withTime = false,
): string | null {
  const m = (
    withTime
      ? /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/
      : /^(\d{2})\/(\d{2})\/(\d{4})$/
  ).exec(input.trim());
  if (!m) return null;
  const [, day, month, year, hour = "00", minute = "00"] = m;
  const d = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  if (
    Number(year) < 1900 ||
    Number(year) > 2200 ||
    d.getFullYear() !== Number(year) ||
    d.getMonth() !== Number(month) - 1 ||
    d.getDate() !== Number(day) ||
    d.getHours() !== Number(hour) ||
    d.getMinutes() !== Number(minute)
  )
    return null;
  return withTime ? d.toISOString() : `${year}-${month}-${day}`;
}
export function peopleDateValue(
  row: Record<string, unknown>,
  key: string,
): string {
  return /(?:_date|_at)$/.test(key)
    ? formatPeopleDate(row[key], key.endsWith("_at"))
    : row[key] == null
      ? ""
      : String(row[key]);
}
