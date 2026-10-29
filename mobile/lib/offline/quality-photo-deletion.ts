import { enqueue, getCache, setCache, queueRows, replaceQueuePayload, removeCache } from "./db";
import { withQualityOperation } from "./quality-operation-lock";
import { removeOfflineFile } from "@/lib/offline/files";
import { apiJson } from "@/lib/api/client";
import type { LocalQualityPhoto, QualityFile } from "@/types/quality";

import { withoutDeletedPhotos } from "./quality-photo-tombstones";
export async function deleteLocalQualityPhoto(photo:LocalQualityPhoto) {
  return withQualityOperation(async()=>{
    await setCache(`quality:photo-deleted:${photo.id}`,true);
    const server=(await getCache<QualityFile>(`quality:photo-server:${photo.id}`))?.value;
    if(server?.id && server.revision_id){await enqueue("quality_evidence_delete",{fileId:server.id,projectId:server.project_id,revisionId:server.revision_id,itemId:server.revision_item_id},`delete-photo:${server.id}`);await setCache(`quality:photo-deleted:${server.id}`,true);}
    // An upload may have finished while this screen still showed a local copy.
    for(const row of await queueRows()) {
      if(!row.kind.startsWith("quality_"))continue;
      await replaceQueuePayload(row.id,await withoutDeletedPhotos(row.payload));
    }
    await (await import("@/lib/quality-evidence")).waitQualityAnnotations();
    const annotation=(await getCache<LocalQualityPhoto>(`quality:photo-annotation:${photo.id}`))?.value;
    for(const uri of [photo.uri,photo.originalUri,photo.annotatedUri,annotation?.annotatedUri])await removeOfflineFile(uri);
    await removeCache(`quality:photo-annotation:${photo.id}`);
  });
}
export async function queueQualityPhotoDelete(file:QualityFile) {
  if(!file.revision_id || !file.revision_item_id)throw new Error("This photo is not attached to a finding.");
  return withQualityOperation(async()=>{
    const payload={fileId:file.id,projectId:file.project_id,revisionId:file.revision_id,itemId:file.revision_item_id};
    await enqueue("quality_evidence_delete",payload,`delete-photo:${file.id}`);
    await setCache(`quality:photo-deleted:${file.id}`,true);
    await removeOfflineFile((await getCache<string>(`quality:preview:${file.id}`))?.value);
    await removeCache(`quality:preview:${file.id}`);
  });
}
export async function syncQualityPhotoDelete(payload:{fileId:string}) {
  await apiJson(`/api/quality/files/${encodeURIComponent(payload.fileId)}`,{method:"DELETE",body:JSON.stringify({confirm:true,reason:"Duplicate or unwanted evidence removed by field user."})});
}
