import { NextRequest,NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { integrationContext,integrationAudit,integrationError,loadIntegration } from "@/lib/integrations/server";
import { graphForSite } from "@/lib/integrations/sharepoint";
import { peopleRead } from "@/lib/people/server";
// Initial operational adapter uses the existing canonical People document identity.
// Other module adapters must provide their own canonical record authorization.
export async function GET(request:NextRequest){
  try{
    const {org,admin,context}=await integrationContext(request.nextUrl.searchParams.get("organisation"),"sharepoint","view");
    const connection=await loadIntegration(org,"sharepoint");if(connection?.status!=="connected")throw new Error("INTEGRATION_SETUP_REQUIRED");
    const documentId=request.nextUrl.searchParams.get("document");
    if(!documentId)throw new Error("INTEGRATION_SCOPE_INVALID");
    await peopleRead(org,"document_access",{filter:{id:documentId}});
    const {data:job}=await admin.from("v2_document_provider_jobs").select("*").eq("organisation_id",org).eq("document_id",documentId).eq("status","synced").order("synced_at",{ascending:false}).limit(1).single();
    if(!job?.drive_item_id)throw new Error("INTEGRATION_SCOPE_INVALID");
    const {data:destination}=await admin.from("v2_document_destinations").select("*").eq("organisation_id",org).eq("id",job.destination_id).eq("is_active",true).single();
    const {data:profile}=await admin.from("v2_integration_access_profiles").select("*").eq("organisation_id",org).eq("id",destination?.access_profile_id).single();
    if(!profile || profile.classification!=="operational" || !context.permissions?.[profile.read_capability])throw new Error("INTEGRATION_ACCESS_DENIED");
    const {data:site}=await admin.from("v2_sharepoint_sites").select("*").eq("organisation_id",org).eq("integration_id",connection.id).eq("id",destination.site_id).single();
    if(!site || site.site_id!==job.site_id || site.drive_id!==job.drive_id)throw new Error("INTEGRATION_SCOPE_INVALID");
    await integrationAudit(org,connection.id,context.userId,"document_read_requested",documentId??undefined);
    const graph=await graphForSite({tenant_id:connection.tenant_id,site_id:site.site_id,drive_id:site.drive_id});
    if(!(await graph.drives()).some(d=>d.id===site.drive_id))throw new Error("INTEGRATION_SCOPE_INVALID");
    const bytes=await graph.download(job.drive_item_id);
    await integrationAudit(org,connection.id,context.userId,"document_read",documentId??undefined);
    return new NextResponse(new Uint8Array(bytes),{headers:{"Content-Type":"application/octet-stream","Content-Disposition":"attachment","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  }catch(error){return NextResponse.json(integrationError(error),{status:403});}
}
export async function POST(request:NextRequest){
  let jobId:string|undefined;let orgId:string|undefined;let leaseId:string|undefined;let attempts=0;
  try{
    if(request.headers.get("origin")!==request.nextUrl.origin)throw new Error("INTEGRATION_ACCESS_DENIED");
    const body=await request.json();const {org,admin,context}=await integrationContext(body.organisation,"sharepoint","manage");orgId=org;
    const connection=await loadIntegration(org,"sharepoint");if(connection?.status!=="connected")throw new Error("INTEGRATION_SETUP_REQUIRED");
    // Existing session RPC authenticates document and person ownership/read permission.
    await peopleRead(org,"document_access",{filter:{id:body.document_id}});
    const {data:doc}=await admin.from("v2_people_documents").select("*").eq("organisation_id",org).eq("id",body.document_id).single();if(!doc || doc.provider!=="internal")throw new Error("INTEGRATION_SCOPE_INVALID");
    const {data:destination}=await admin.from("v2_document_destinations").select("*").eq("organisation_id",org).eq("id",body.destination_id).eq("is_active",true).single();
    if(!destination || destination.context!=="training")throw new Error("INTEGRATION_SCOPE_INVALID");
    if(destination.conflict_policy!=="version")throw new Error("INTEGRATION_POLICY_UNAVAILABLE");
    const {data:profile}=await admin.from("v2_integration_access_profiles").select("*").eq("organisation_id",org).eq("id",destination.access_profile_id).single();
    if(!profile || profile.classification!=="operational" || !context.permissions?.[profile.manage_capability] || !context.permissions?.["training.edit"])throw new Error("INTEGRATION_ACCESS_DENIED");
    if(destination.review_storage==="after_approval"){
      const records=await admin.from("v2_training_records").select("review_status").eq("organisation_id",org).eq("person_id",doc.person_id).eq("evidence_group_id",doc.evidence_group_id);
      if(!records.data?.length || records.data.some(r=>r.review_status!=="approved"))throw new Error("INTEGRATION_REVIEW_REQUIRED");
    }
    const {data:site}=await admin.from("v2_sharepoint_sites").select("*").eq("organisation_id",org).eq("integration_id",connection.id).eq("id",destination.site_id).single();if(!site?.drive_id)throw new Error("INTEGRATION_SCOPE_INVALID");
    // Paths come from the central People resolver snapshot, never browser path values.
    const folder=[destination.root_path,doc.resolved_folder].filter(Boolean).join("/");
    if(/[{}]/.test(destination.root_path) || folder.includes("..") || folder.startsWith("/") || folder.includes("\\"))throw new Error("INTEGRATION_PATH_INVALID");
    const fingerprint=createHash("sha256").update(`${doc.id}:${destination.id}:${doc.storage_key}`).digest("hex");
    const saved=await admin.from("v2_document_provider_jobs").upsert({organisation_id:org,destination_id:destination.id,document_id:doc.id,fingerprint},{onConflict:"organisation_id,document_id,fingerprint",ignoreDuplicates:true});if(saved.error)throw new Error("INTEGRATION_ACTION_FAILED");
    const {data:existing}=await admin.from("v2_document_provider_jobs").select("*").eq("organisation_id",org).eq("document_id",doc.id).eq("fingerprint",fingerprint).single();if(!existing)throw new Error("INTEGRATION_ACTION_FAILED");if(existing.status==="synced")return NextResponse.json({ok:true,status:"synced"});jobId=existing.id;
    const claim=await admin.rpc("tttracker_v2_claim_document_job",{p_org:org,p_id:jobId});if(claim.error||!claim.data?.lease_id)throw new Error("INTEGRATION_JOB_BUSY");leaseId=claim.data.lease_id;attempts=claim.data.attempts;
    await integrationAudit(org,connection.id,context.userId,"document_sync_started",doc.id);
    const stored=await admin.storage.from("v2-people-evidence").download(doc.storage_key);if(stored.error||!stored.data)throw new Error("INTEGRATION_FILE_UNAVAILABLE");
    if(stored.data.size>10*1024*1024)throw new Error("INTEGRATION_FILE_INVALID");
    const bytes=new Uint8Array(await stored.data.arrayBuffer());
    const graph=await graphForSite({tenant_id:connection.tenant_id,site_id:site.site_id,drive_id:site.drive_id});
    // Verify library membership again before the operation, preventing stale/replaced IDs.
    if(!(await graph.drives()).some(d=>d.id===site.drive_id))throw new Error("INTEGRATION_SCOPE_INVALID");
    const folders=folder.split("/").filter(Boolean);if(folders.length>8)throw new Error("INTEGRATION_PATH_INVALID");
    let parent=(await graph.root()).id;for(const part of folders)parent=(await graph.ensureFolder(parent,part)).id;
    // Unique revision identifier prevents silent replacement even when no prior remote ID exists.
    const extension=({"application/pdf":"pdf","image/jpeg":"jpg","image/png":"png"} as Record<string,string>)[doc.content_type];
    if(!extension)throw new Error("INTEGRATION_FILE_INVALID");
    const base=doc.resolved_filename||`${doc.id}_${doc.name}`;
    const filename=/\.(pdf|jpe?g|png)$/i.test(base)?base:`${base}.${extension}`;
    let item=await graph.child(parent,filename);
    if(item){
      if(item.folder)throw new Error("INTEGRATION_CONFLICT");
      const remote=await graph.download(item.id);
      const matches=createHash("sha256").update(remote).digest("hex")===createHash("sha256").update(bytes).digest("hex");remote.fill(0);
      if(!matches)throw new Error("INTEGRATION_CONFLICT");
    }else item=await graph.upload(parent,filename,bytes);
    bytes.fill(0);
    const finished=await admin.from("v2_document_provider_jobs").update({status:"synced",drive_id:site.drive_id,site_id:site.site_id,drive_item_id:item.id,etag:item.eTag,web_url:item.webUrl,path_snapshot:folder,filename,synced_at:new Date().toISOString(),last_error:null,lease_until:null,lease_id:null}).eq("organisation_id",org).eq("id",jobId).eq("lease_id",leaseId).select("id");if(finished.error||!finished.data?.length)throw new Error("INTEGRATION_STATUS_SAVE_FAILED");
    await admin.from("v2_people_documents").update({sync_status:"synced"}).eq("organisation_id",org).eq("id",doc.id);
    await integrationAudit(org,connection.id,context.userId,"document_synced",doc.id);return NextResponse.json({ok:true,status:"synced"});
  }catch(error){
    const safe=integrationError(error);
    if(jobId&&orgId&&leaseId&&safe.code!=="INTEGRATION_JOB_BUSY"){
      const {createSupabaseAdmin}=await import("@/lib/supabase/admin");
      const providerDelay=error&&typeof error==="object"&&"retryAfter" in error?Number(error.retryAfter):60;
      const retryAfter=Math.max(providerDelay||60,15*2**Math.min(attempts,7));
      await createSupabaseAdmin().from("v2_document_provider_jobs").update({status:safe.code==="INTEGRATION_SITE_PERMISSION_REQUIRED"?"permission_lost":"failed",last_error:safe.code,available_at:new Date(Date.now()+Math.min(3600,Math.max(60,retryAfter||60))*1000).toISOString(),lease_until:null,lease_id:null}).eq("organisation_id",orgId).eq("id",jobId).eq("lease_id",leaseId);
    }
    return NextResponse.json(safe,{status:400});
  }
}
