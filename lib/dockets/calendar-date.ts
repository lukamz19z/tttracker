/** Local calendar date, deliberately independent of UTC day boundaries. */
export function localCalendarDate(now = new Date(), timeZone?: string | null) {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
      const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
      return `${part("year")}-${part("month")}-${part("day")}`;
    } catch { /* Unknown device zone: use the server's local calendar. */ }
  }
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function isFutureDocketDate(date: string, now = new Date(), timeZone?: string | null) {
  return date.slice(0, 10) > localCalendarDate(now, timeZone);
}
