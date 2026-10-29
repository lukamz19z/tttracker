import { getCache } from "@/lib/offline/db";
// Persist a tombstone before changing queues or caches. Stale screens must never
// resurrect a removed photo when saving their older workspace snapshot.
export async function photoDeleted(id:string) {return Boolean((await getCache(`quality:photo-deleted:${id}`))?.value);}
export async function withoutDeletedPhotos<T>(value:T):Promise<T> {
  const deleted=new Map<string,boolean>();
  async function isDeleted(id:string){if(!deleted.has(id))deleted.set(id,await photoDeleted(id));return deleted.get(id);}
  async function visit(value:unknown):Promise<unknown> {
    if(Array.isArray(value)){const result=[];for(const row of value){if(row && typeof row==="object" && "id" in row && await isDeleted(String(row.id)))continue;result.push(await visit(row));}return result;}
    if(value && typeof value==="object"){const result:Record<string,unknown>={};for(const [key,row] of Object.entries(value))result[key]=await visit(row);return result;}
    return value;
  }
  return await visit(value) as T;
}
