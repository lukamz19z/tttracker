/** Local calendar date, deliberately independent of UTC day boundaries. */
export function localCalendarDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function isFutureDocketDate(date: string, now = new Date()) {
  return date.slice(0, 10) > localCalendarDate(now);
}
