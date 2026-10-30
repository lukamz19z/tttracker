import { getNetworkStateAsync, NetworkStateType } from "expo-network";
import { File } from "expo-file-system";
import type { QualityRevisionDetailPayload } from "@/types/quality";
import { downloadQualityFile } from "@/lib/api/quality";
import { cacheEntriesWithPrefix, getCache, queueRows, removeCache, setCache } from "./db";
import { removeOfflineFile } from "./files";
import { listRevisionWorkspaces } from "./revision-workspaces";

export type QualityOfflineSettings = {
  autoCacheOnOpen:boolean;
  manualOnly:boolean;
  cacheBeforePreviews:boolean;
  wifiOnly:boolean;
  maxCacheMb:number;
  completedRetentionDays:number;
  previewQuality:number;
};
export type QualityOfflinePack = {
  projectId:string;
  revisionId:string;
  status:"preparing"|"ready"|"partial";
  findings:number;
  cachedFindings:number;
  previews:number;
  cachedPreviews:number;
  failedFileIds:string[];
  previewFiles:Array<{id:string;uri:string;bytes:number}>;
  updatedAt:string;
};
const SETTINGS_DEFAULTS:QualityOfflineSettings={autoCacheOnOpen:true,manualOnly:false,cacheBeforePreviews:true,wifiOnly:false,maxCacheMb:1024,completedRetentionDays:30,previewQuality:78};
const settingsKey=(projectId:string)=>`quality:offline-settings:${projectId}`;
const packKey=(projectId:string,revisionId:string)=>`quality:offline-pack:${projectId}:${revisionId}`;
const previewPrefix=(fileId:string)=>`quality:preview:${fileId}`;
const active=new Map<string,Promise<QualityOfflinePack>>();
const progressListeners=new Map<string,Set<(pack:QualityOfflinePack)=>void>>();

export async function qualityOfflineSettings(projectId:string) {
  return {...SETTINGS_DEFAULTS,...((await getCache<Partial<QualityOfflineSettings>>(settingsKey(projectId)))?.value || {})};
}
export async function saveQualityOfflineSettings(projectId:string,value:Partial<QualityOfflineSettings>) {
  const current=await qualityOfflineSettings(projectId);
  const next={...current,...value,maxCacheMb:Math.max(64,Math.min(8192,Number(value.maxCacheMb ?? current.maxCacheMb))),completedRetentionDays:Math.max(1,Math.min(365,Number(value.completedRetentionDays ?? current.completedRetentionDays))),previewQuality:Math.max(45,Math.min(88,Math.round(Number(value.previewQuality ?? current.previewQuality))))};
  await setCache(settingsKey(projectId),next);return next;
}
export async function cachedQualityOfflinePack(projectId:string,revisionId:string) {
  const pack=(await getCache<QualityOfflinePack>(packKey(projectId,revisionId)))?.value || null;
  if(!pack)return null;
  const available=await Promise.all(pack.previewFiles.map(file=>fileInfo(file.id)));
  pack.previewFiles=available.filter((file):file is NonNullable<typeof file>=>Boolean(file));
  pack.cachedPreviews=pack.previewFiles.length;
  if(pack.status==="ready" && pack.cachedPreviews!==pack.previews)pack.status="partial";
  await setCache(packKey(projectId,revisionId),pack);
  return pack;
}
async function fileInfo(fileId:string) {
  const entry=await getCache<string>(previewPrefix(fileId));
  if(!entry?.value)return null;
  try {const file=new File(entry.value);return file.exists?{id:fileId,uri:file.uri,bytes:file.size}:null;}catch{return null;}
}
async function writePack(pack:QualityOfflinePack,key:string,onProgress?:(pack:QualityOfflinePack)=>void) {
  pack.updatedAt=new Date().toISOString();
  await setCache(key,pack);
  const snapshot={...pack,failedFileIds:[...pack.failedFileIds],previewFiles:[...pack.previewFiles]};
  onProgress?.(snapshot);
  for(const listener of progressListeners.get(key) || [])if(listener!==onProgress)listener(snapshot);
}
async function withinWifiOnly(projectId:string) {
  const settings=await qualityOfflineSettings(projectId);
  if(!settings.wifiOnly)return true;
  const network=await getNetworkStateAsync();
  return network.type===NetworkStateType.WIFI || network.type===NetworkStateType.ETHERNET;
}
async function runBounded<T>(rows:T[],limit:number,work:(row:T)=>Promise<void>) {
  let cursor=0;
  const workers=Array.from({length:Math.min(limit,rows.length)},async()=>{while(cursor<rows.length){const row=rows[cursor++];await work(row);}});
  await Promise.all(workers);
}

export async function prepareQualityOfflinePack(input:{projectId:string;revisionId:string;detail:QualityRevisionDetailPayload;explicit?:boolean;onProgress?:(pack:QualityOfflinePack)=>void}) {
  const key=packKey(input.projectId,input.revisionId);
  if(input.onProgress){const listeners=progressListeners.get(key) || new Set();listeners.add(input.onProgress);progressListeners.set(key,listeners);}
  const existing=active.get(key);if(existing)return existing;
  const task=(async()=>{
    const settings=await qualityOfflineSettings(input.projectId);
    await setCache(`quality:revision:${input.projectId}:${input.revisionId}`,input.detail);
    const prior=await cachedQualityOfflinePack(input.projectId,input.revisionId);
    if(!input.explicit && (!settings.autoCacheOnOpen || settings.manualOnly || !settings.cacheBeforePreviews))return prior || {
      projectId:input.projectId,revisionId:input.revisionId,status:"partial",findings:input.detail.items.length,cachedFindings:input.detail.items.length,previews:0,cachedPreviews:0,failedFileIds:[],previewFiles:[],updatedAt:new Date().toISOString(),
    };
    if(!await withinWifiOnly(input.projectId))return prior || {
      projectId:input.projectId,revisionId:input.revisionId,status:"partial",findings:input.detail.items.length,cachedFindings:input.detail.items.length,previews:0,cachedPreviews:0,failedFileIds:[],previewFiles:[],updatedAt:new Date().toISOString(),
    };
    const required=input.detail.files.filter(file=>file.file_role==="before_photo");
    const cached=await Promise.all(required.map(file=>fileInfo(file.id)));
    const fileMap=new Map(cached.filter((file):file is NonNullable<typeof file>=>Boolean(file)).map(file=>[file.id,file]));
    const missing=required.filter(file=>!fileMap.has(file.id));
    const pack:QualityOfflinePack={projectId:input.projectId,revisionId:input.revisionId,status:"preparing",findings:input.detail.items.length,cachedFindings:input.detail.items.length,previews:required.length,cachedPreviews:fileMap.size,failedFileIds:[],previewFiles:Array.from(fileMap.values()),updatedAt:new Date().toISOString()};
    await writePack(pack,key,input.onProgress);
    let projectedBytes=(await offlineQualityStorage(input.projectId)).bytes;
    await runBounded(missing,3,async file=>{
      try {
        const uri=await downloadQualityFile(file.id,file.file_name,true,true,settings.previewQuality);
        const local=new File(uri);const bytes=local.size;
        if(projectedBytes+bytes>settings.maxCacheMb*1024*1024){local.delete();await removeCache(previewPrefix(file.id));throw new Error("Offline preview cache limit reached.");}
        projectedBytes+=bytes;fileMap.set(file.id,{id:file.id,uri,bytes});
      } catch {
        pack.failedFileIds=Array.from(new Set([...pack.failedFileIds,file.id]));
      }
      pack.previewFiles=Array.from(fileMap.values());pack.cachedPreviews=fileMap.size;
      await writePack(pack,key,input.onProgress);
    });
    pack.previewFiles=Array.from(fileMap.values());pack.cachedPreviews=fileMap.size;
    pack.status=pack.cachedPreviews===pack.previews?"ready":"partial";
    await writePack(pack,key,input.onProgress);
    return pack;
  })().finally(()=>{active.delete(key);progressListeners.delete(key);});
  active.set(key,task);return task;
}

export async function offlineQualityStorage(projectId:string) {
  const entries=await cacheEntriesWithPrefix<QualityOfflinePack>(`quality:offline-pack:${projectId}:`);
  const packs=(await Promise.all(entries.map(entry=>cachedQualityOfflinePack(projectId,entry.value.revisionId)))).filter((pack):pack is QualityOfflinePack=>Boolean(pack));
  const bytes=packs.reduce((sum,pack)=>sum+pack.previewFiles.reduce((total,file)=>total+file.bytes,0),0);
  return {packs,bytes,megabytes:Math.round(bytes/1024/1024*10)/10};
}
async function hasQueuedWork(projectId:string,revisionId:string) {
  const queue=await queueRows();
  if(queue.some(row=>row.kind.startsWith("quality_") && (row.payload as {projectId?:string;revisionId?:string}).projectId===projectId && (row.payload as {revisionId?:string}).revisionId===revisionId))return true;
  const workspaces=await listRevisionWorkspaces(projectId);
  return workspaces.some(row=>(row.serverRevisionId || row.routeKey)===revisionId && (row.findings.length>0 || row.pendingUpdates.length>0 || row.finaliseRequested));
}
export async function removeSafeQualityOfflinePack(projectId:string,revisionId:string) {
  const pack=await cachedQualityOfflinePack(projectId,revisionId);
  if(!pack || pack.status!=="ready")throw new Error("Only a completed offline pack can be removed safely.");
  if(await hasQueuedWork(projectId,revisionId))throw new Error("This Punchlist has queued or unresolved work and its offline pack is protected.");
  for(const preview of pack.previewFiles){await removeOfflineFile(preview.uri);await removeCache(previewPrefix(preview.id));}
  await removeCache(packKey(projectId,revisionId));
}
export async function cleanupExpiredQualityOfflinePacks(projectId:string,now=Date.now()) {
  const settings=await qualityOfflineSettings(projectId),entries=await cacheEntriesWithPrefix<QualityOfflinePack>(`quality:offline-pack:${projectId}:`);
  const cutoff=now-settings.completedRetentionDays*86400000;let removed=0;
  for(const entry of entries){if(entry.value.status!=="ready" || Date.parse(entry.value.updatedAt)>cutoff)continue;try{await removeSafeQualityOfflinePack(projectId,entry.value.revisionId);removed++;}catch{/* queued work and unresolved errors keep the pack */}}
  return removed;
}
