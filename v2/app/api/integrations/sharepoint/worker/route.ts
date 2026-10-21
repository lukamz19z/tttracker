import { NextRequest,NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { processFolderBatch } from "@/lib/integrations/sharepoint-locations";
import { microsoftConfig } from "@/lib/integrations/sharepoint";
import { publishPendingProfilePhotos } from "@/lib/people/profile-photo";
import { processPublicationJob } from "@/lib/documents/publication";
export const runtime = "nodejs";
export const maxDuration = 240;
export async function GET(request:NextRequest){
 const secret=process.env.CRON_SECRET,supplied=request.headers.get("authorization")?.replace(/^Bearer /,"")??"";
 const expected=Buffer.from(secret??""),provided=Buffer.from(supplied);
 if(expected.length<32||expected.length!==provided.length||!timingSafeEqual(expected,provided))return NextResponse.json({error:"Worker authorization required."},{status:403});
 try{microsoftConfig();}catch{return NextResponse.json({error:"Microsoft platform setup required."},{status:503});}
 const now=new Date().toISOString();
 const db=createSupabaseAdmin();const due=await db.from("v2_sharepoint_folder_jobs").select("id,organisation_id,entity_kind").or(`status.in.(pending,failed),and(status.eq.provisioning,lease_until.lt.${now})`).lte("available_at",now).order("available_at").limit(1);
 if(due.error)return NextResponse.json({error:"Folder queue unavailable."},{status:503});
 let processed=0,deferred=0;for(const row of due.data??[]){if(row.entity_kind!=="person"&&row.entity_kind!=="project")continue;try{processed+=(await processFolderBatch(row.organisation_id,row.entity_kind,null)).processed;}catch(error){
 deferred++;
 // Cool down suspended/unavailable work so it cannot starve other organisations.
 const code=error instanceof Error&&/^INTEGRATION_[A-Z_]+$/.test(error.message)?error.message:"INTEGRATION_ACTION_FAILED";
 await db.from("v2_sharepoint_folder_jobs").update({last_error:code,available_at:new Date(Date.now()+300000).toISOString()}).eq("organisation_id",row.organisation_id).eq("id",row.id).in("status",["pending","failed"]);
 }}
 const publications=await db.from("v2_document_provider_jobs").select("id,organisation_id,source_kind").in("source_kind",["migration","generated"]).or(`status.in.(pending,failed),and(status.eq.syncing,lease_until.lt.${now})`).lte("available_at",now).order("available_at").limit(1);
 if(publications.error)return NextResponse.json({error:"Document publication queue unavailable."},{status:503});
 for(const job of publications.data??[]){
  if(!["migration","generated"].includes(job.source_kind))continue;
  // Register real canonical revision renderers here as modules implement their
  // PDF engines. Unsupported contexts fail explicitly rather than fake a PDF.
  try{const result=await processPublicationJob(job.organisation_id,job.id,{});if(result.status==="synced")processed++;else deferred++;}catch{deferred++;}
 }
 const photos=await publishPendingProfilePhotos();processed+=photos.published;deferred+=photos.deferred;
 return NextResponse.json({processed,deferred},{headers:{"Cache-Control":"no-store"}});
}
