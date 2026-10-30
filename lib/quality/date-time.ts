/** V1 project fallback; explicit IANA zones keep device/server timezone irrelevant. */
export const DEFAULT_QUALITY_TIME_ZONE = "Australia/Sydney";
export function validQualityTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try { new Intl.DateTimeFormat("en-AU", { timeZone: value }).format(0); return true; }
  catch { return false; }
}
export function qualityTimeZone(projectZone?: unknown, defaultZone?: unknown) {
  const zone=validQualityTimeZone(projectZone) ? projectZone : validQualityTimeZone(defaultZone) ? defaultZone : DEFAULT_QUALITY_TIME_ZONE;
  return new Intl.DateTimeFormat("en-AU",{timeZone:zone}).resolvedOptions().timeZone;
}
/** Reject wall-clock strings without an offset; never replace capture time with now. */
export function canonicalCaptureTime(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const [year,month,day]=value.slice(0,10).split("-").map(Number),calendar=new Date(Date.UTC(year,month-1,day));
  if(calendar.getUTCFullYear()!==year || calendar.getUTCMonth()!==month-1 || calendar.getUTCDate()!==day)return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
export function formatQualityDateTime(value: unknown, timeZone?: unknown) {
  const iso = canonicalCaptureTime(value);
  if (!iso) return "-";
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: qualityTimeZone(timeZone), day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit", hourCycle:"h23" }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}
/** Legacy recorded/upload time is labelled, never claimed as capture. */
export function qualityCaptureLabel(capturedAt: unknown, timeZone?: unknown, recordedAt?: unknown) {
  if (canonicalCaptureTime(capturedAt)) return formatQualityDateTime(capturedAt,timeZone);
  return canonicalCaptureTime(recordedAt) ? `Recorded ${formatQualityDateTime(recordedAt,timeZone)} (capture time unavailable)` : "Capture time unavailable";
}
/** Convert an explicitly supplied project-local wall clock, including DST. */
export function projectLocalCaptureTime(value: string, timeZone?: unknown) {
  const input=value.trim().replace(/^(\d{2})\/(\d{2})\/(\d{4})(?=\s)/,(_,day,month,year)=>`${year}-${month}-${day}`);
  const match=/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(input);
  if(!match) return null;
  const [,year,month,day,hour,minute,second="00"]=match;
  const wall=Date.UTC(+year,+month-1,+day,+hour,+minute,+second);
  const calendar=new Date(wall);
  if(calendar.getUTCFullYear()!==+year || calendar.getUTCMonth()!==+month-1 || calendar.getUTCDate()!==+day || +hour>23 || +minute>59 || +second>59)return null;
  let instant=wall;
  const formatter=new Intl.DateTimeFormat("en-GB",{timeZone:qualityTimeZone(timeZone),year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
  for(let i=0;i<4;i++) {
    const parts=formatter.formatToParts(new Date(instant));
    const get=(key:Intl.DateTimeFormatPartTypes)=>Number(parts.find(p=>p.type===key)?.value);
    const represented=Date.UTC(get("year"),get("month")-1,get("day"),get("hour"),get("minute"),get("second"));
    const delta=wall-represented;
    if(!delta) return new Date(instant).toISOString();
    instant+=delta;
  }
  return null; // Invalid/nonexistent local clock, such as the spring DST gap.
}
export function captureTimeFromExif(exif:Record<string,unknown>|null|undefined,timeZone?:unknown) {
  const value=String(exif?.DateTimeOriginal || exif?.DateTimeDigitized || exif?.DateTime || "");
  const offset=String(exif?.OffsetTimeOriginal || exif?.OffsetTime || "");
  const stamp=value.replace(/^(\d{4}):(\d{2}):(\d{2}) /,"$1-$2-$3T");
  return canonicalCaptureTime(stamp) || (offset ? canonicalCaptureTime(`${stamp}${offset}`) : projectLocalCaptureTime(value,timeZone));
}
