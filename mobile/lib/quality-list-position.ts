import { logMobilePerf } from "@/lib/perf-trace";

type Position = { offset: number; scope: string; anchorId?: string; index?: number };
const positions = new Map<string, Position>();

export function saveQualityListPosition(key: string, scope: string, offset: number) {
  if (!key || !Number.isFinite(offset)) return;
  positions.set(key, { scope, offset: Math.max(0, offset) });
}

export function saveQualityListAnchor(key: string, scope: string, anchorId: string, index: number, offset: number) {
  if (!key || !anchorId || !Number.isInteger(index) || index < 0 || !Number.isFinite(offset)) return;
  positions.set(key, { scope, offset: Math.max(0, offset), anchorId, index });
}

export function qualityListAnchor(key: string, scope: string) {
  const value=positions.get(key);
  return value?.scope===scope?{anchorId:value.anchorId,index:value.index}:null;
}

export function qualityListPosition(key: string, scope: string) {
  const value = positions.get(key);
  return value?.scope === scope ? value.offset : 0;
}

export function logQualityListRestore(fields: { projectId: string; module: string; offset: number; outcome: string }) {
  logMobilePerf("quality.list.restore-position", { operation: "quality.list.restore-position", ...fields });
}
