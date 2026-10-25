import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteDriveItem, graphRequest } from "@/lib/sharepoint/graph";

/** Pending transfers stay associated durably even if the app dies after PUT. */
export async function cleanupQualityUploadSessions(service:SupabaseClient,filter:{revisionId?:string;itemId?:string;defectId?:string;sessionId?:string;preservePublished?:boolean}) {
  let query=service.from("tower_quality_upload_sessions").select("id,drive_id,folder_id,staging_name,published_item_id,annotated_item_id");
  if(filter.sessionId) query=query.eq("id",filter.sessionId);
  else if(filter.itemId) query=query.eq("revision_item_id",filter.itemId);
  else if(filter.defectId) query=query.eq("defect_id",filter.defectId);
  else if(filter.revisionId) query=query.eq("revision_id",filter.revisionId);
  else throw new Error("Quality upload cleanup requires a record scope.");
  const result=await query;
  if(result.error) throw new Error(result.error.message);
  for(const row of result.data || []) {
    try {
      const item=await graphRequest<{id:string}>(`/drives/${encodeURIComponent(row.drive_id)}/items/${encodeURIComponent(row.folder_id)}:/${encodeURIComponent(row.staging_name)}`);
      await deleteDriveItem({driveId:row.drive_id,itemId:item.id});
    }catch(error){if(!/\(404\b/.test(error instanceof Error?error.message:"")) throw error;}
    if(!filter.preservePublished) for(const itemId of new Set([row.published_item_id,row.annotated_item_id].filter(Boolean))) {
      try {await deleteDriveItem({driveId:row.drive_id,itemId});}
      catch(error){if(!/\(404\b/.test(error instanceof Error?error.message:"")) throw error;}
    }
    const removed=await service.from("tower_quality_upload_sessions").delete().eq("id",row.id);
    if(removed.error) throw new Error(removed.error.message);
  }
}
