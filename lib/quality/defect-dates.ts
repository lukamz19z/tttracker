import { sourceDateDisplay, sourceDateToDb } from "./punchlist-import-values";

export function defectRequiredByToDb(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return { value: null as string | null, error: null as string | null };
  const parsed = sourceDateToDb(raw, false);
  return parsed
    ? { value: parsed, error: null as string | null }
    : { value: null as string | null, error: "Required By must be DD/MM/YYYY." };
}

export function defectRequiredByDisplay(value: string | null | undefined) {
  return sourceDateDisplay(value);
}

function localToday(timeZone?: string | null, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function defectRequiredByState(
  requiredBy: string | null | undefined,
  status: string | null | undefined,
  timeZone?: string | null,
  now = new Date(),
) {
  if (!requiredBy || !/^\d{4}-\d{2}-\d{2}$/.test(requiredBy)) return null;
  if (["Fixed", "Closed"].includes(String(status || ""))) return null;
  const today = localToday(timeZone, now);
  const offset = new Date(`${today}T00:00:00.000Z`).getTime();
  const target = new Date(`${requiredBy}T00:00:00.000Z`).getTime();
  const dayDifference = Math.round((target - offset) / 86_400_000);
  return {
    overdue: dayDifference < 0,
    relative: dayDifference < 0 ? "Overdue" : dayDifference === 0 ? "Required Today" : dayDifference === 1 ? "Required Tomorrow" : null,
    display: defectRequiredByDisplay(requiredBy),
  };
}
