import { getCache,setCache } from "@/lib/offline/db";
import type { QueueRecord } from "./db";
export type RevisionDeletion={projectId:string;aliases:string[];state:"deleting"|"deleted";serverRevisionId?:string|null;revisionNumber?:string|null;records?:QueueRecord[]};
const key=(projectId:string,id:string)=>`quality:revision-deletion:${projectId}:${id}`;
export async function revisionDeletion(projectId:string,...ids:(string|null|undefined)[]) {
  for(const id of ids.filter(Boolean)) {const found=await getCache<RevisionDeletion>(key(projectId,String(id)));if(found?.value)return found.value;}
  return null;
}
export async function markRevisionDeletion(marker:RevisionDeletion) {
  for(const id of new Set(marker.aliases.filter(Boolean)))await setCache(key(marker.projectId,id),marker);
}
export async function filterDeletedRevisions<T extends {id:string;mobile_client_mutation_id?:string|null}>(projectId:string,rows:T[]) {
  const flags=await Promise.all(rows.map(row=>revisionDeletion(projectId,row.id,row.mobile_client_mutation_id)));
  return rows.filter((_,i)=>flags[i]?.state!=="deleted");
}
