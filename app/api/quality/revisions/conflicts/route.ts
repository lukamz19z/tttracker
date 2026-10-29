import { NextResponse } from "next/server";
import { qualityWorkflowAccess } from "@/lib/quality/workflow-access";
import { qualityApiError } from "@/lib/quality/server";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const projectId = params.get("projectId") || "", towerId = params.get("towerId") || "";
    if (!projectId || !towerId) return NextResponse.json({error:"Project and tower are required."},{status:400});
    const { service } = await qualityWorkflowAccess(request, projectId);
    const parents = await service.from("tower_revisions").select("id,revision_number,status,source_type").eq("project_id",projectId).eq("tower_id",towerId).in("status",["Draft","Open","In Progress","Ready for Review"]);
    if (parents.error) throw new Error(parents.error.message);
    const rows = await Promise.all((parents.data || []).map(async parent => {
      const count = await service.from("tower_revision_items").select("id",{count:"exact",head:true}).eq("revision_id",parent.id).not("status","in","(Rectified,Verified)");
      if(count.error) throw new Error(count.error.message);
      return {...parent,openCount:count.count || 0};
    }));
    return NextResponse.json({revisions:rows});
  } catch(error) {const result=qualityApiError(error);return NextResponse.json({error:result.message},{status:result.status});}
}
