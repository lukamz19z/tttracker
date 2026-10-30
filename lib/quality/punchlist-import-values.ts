export function towerKey(value: string) {
  const raw=value.trim().toLowerCase().replace(/^tower(?:[\s-]+)?|^t(?:[\s-]+)?/i, "").replace(/[\s-]+/g, "");
  return /^\d+$/.test(raw) ? String(BigInt(raw)) : raw;
}
export function resolveProjectTower(value: string, towers: {id:string;name:string|null}[], override?: string) {
  if (override) {
    const selected=towers.find(tower=>tower.id===override);
    return selected ? {tower:selected,state:"matched" as const} : {tower:null,state:"invalid selection" as const};
  }
  const key=towerKey(value);
  const matches=towers.filter(tower=>tower.id===value || (key && towerKey(tower.name || "")===key));
  return matches.length===1?{tower:matches[0],state:"matched" as const}:{tower:null,state:matches.length>1?"ambiguous" as const:"not found" as const};
}
export function sourceDateToDb(value: string, allowIso=false) {
  const raw=value.trim();
  if (!raw) return "";
  const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  const iso=allowIso && /^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:match?`${match[3]}-${match[2]}-${match[1]}`:null;
  if (!iso) return null;
  const [year,month,day]=iso.split("-").map(Number);
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year && date.getUTCMonth()===month-1 && date.getUTCDate()===day ? iso : null;
}
export function sourceDateDisplay(value: string | null | undefined) {
  if (!value) return "";
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match?`${match[3]}/${match[2]}/${match[1]}`:value;
}
export function excelCalendarDate(serial: number, date1904=false) {
  const days=Math.floor(serial);
  if(!Number.isFinite(days) || days<0 || days>2958465)return null;
  const offset=date1904?1462:0;
  const date=new Date(Date.UTC(1899,11,30+days+offset));
  return `${String(date.getUTCDate()).padStart(2,"0")}/${String(date.getUTCMonth()+1).padStart(2,"0")}/${date.getUTCFullYear()}`;
}
