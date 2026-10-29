import { NextResponse } from "next/server";
import { assertQualityProjectAccess, qualityApiError, requireQualityUser } from "@/lib/quality/server";
import { atomicQualityError } from "@/lib/quality/atomic-error";
import { userHasAccess } from "@/lib/access/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{revisionId:string}>}) {
  const started=Date.now();
  try {
    const {service,user,role}=await requireQualityUser(request);
    const {revisionId}=await context.params;
    const allowed=await Promise.all([userHasAccess(service,user.id,"tt.rectifications"),userHasAccess(service,user.id,"mobile.rectifications")]);
    if(!allowed.some(Boolean))return NextResponse.json({error:"You do not have access to Rectifications."},{status:403});
    let body;
    try {body=await request.json();}catch{return NextResponse.json({error:"Finding data must be valid JSON."},{status:400});}
    if(!body || typeof body!=="object" || typeof body.clientMutationId!=="string" || !body.clientMutationId.trim())return NextResponse.json({error:"A stable finding mutation ID is required."},{status:400});
    const parent=await service.from("tower_revisions").select("project_id").eq("id",revisionId).maybeSingle();
    if(parent.error)throw new Error(parent.error.message);
    if(!parent.data)return NextResponse.json({error:"This Rectification has been deleted or is no longer available."},{status:404});
    await assertQualityProjectAccess({service,userId:user.id,role,projectId:parent.data.project_id});
    const fields=Object.fromEntries(["issueTypeId","otherIssueText","leg","assignedFlag","towerSegment","memberNumber","drawingNumber","finding","rectificationComment"].map(key=>[key,typeof body[key]==="string"?body[key].trim():null]));
    const {data,error}=await service.rpc("create_v1_revision_item_atomic",{p_revision_id:revisionId,p_project_id:parent.data.project_id,p_actor_id:user.id,p_mutation_id:body.clientMutationId.trim(),p_fields:fields});
    if(error){const result=atomicQualityError(error);console.warn("FLI allocation failed",{revisionId,code:error.code,duration:Date.now()-started});return NextResponse.json({error:result.message},{status:result.status});}
    if(data?.item?.id && !data.item.source_type) {
      const tagged=await service.from("tower_revision_items").update({source_type:"manual"}).eq("id",data.item.id);if(tagged.error)throw new Error(tagged.error.message);
      data.item.source_type="manual";
    }
    if(!data?.item?.id || !data.item.fli_number)throw new Error("Atomic finding creation returned no canonical FLI.");
    if(process.env.NODE_ENV!=="production")console.debug("FLI allocated",{revisionId,clientMutationId:body.clientMutationId,allocatorScope:revisionId,itemNumber:data.item.item_number,fli:data.item.fli_number,idempotentHit:data.idempotentHit,duration:Date.now()-started});
    return NextResponse.json(data);
  }catch(error){const result=qualityApiError(error);return NextResponse.json({error:result.message},{status:result.status});}
}
