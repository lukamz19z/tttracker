import type { SupabaseClient } from "@supabase/supabase-js";

/** Only return provider item IDs that no other active evidence row references. */
export async function unreferencedQualityDriveItems(
  service: SupabaseClient,
  driveId: string,
  candidateIds: string[],
  excludedFileIds: string[],
) {
  const { data, error } = await service
    .from("tower_quality_files")
    .select("id,sharepoint_item_id,annotated_sharepoint_item_id")
    .eq("deletion_pending", false)
    .eq("sharepoint_drive_id", driveId);
  if (error) throw new Error(`Evidence references could not be checked: ${error.message}`);
  const excluded = new Set(excludedFileIds);
  const referenced = new Set((data ?? [])
    .filter((row) => !excluded.has(row.id))
    .flatMap((row) => [row.sharepoint_item_id, row.annotated_sharepoint_item_id].filter((id): id is string => Boolean(id))));
  return [...new Set(candidateIds)].filter((id) => !referenced.has(id));
}
