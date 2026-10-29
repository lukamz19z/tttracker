import { revisionEvidenceContext } from "@/lib/quality/evidence-context";
import { loadQualityProject } from "@/lib/quality/server";
import { qualityTimeZone } from "@/lib/quality/date-time";
export { deleteFinding as DELETE } from "@/lib/quality/delete-finding";
import { revisionItemFli, revisionReference } from "@/lib/quality/fli";
import { NextRequest, NextResponse } from "next/server";
import { assertMobileProjectAccess, qualityRouteError } from "@/lib/mobile/quality";
import { requireMobilePermission } from "@/lib/mobile/server";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
type Context = { params: Promise<{ revisionId: string; itemId: string }> };
export { PATCH } from "@/app/api/quality/revisions/[revisionId]/items/[itemId]/route";

export async function GET(request: NextRequest, context: Context) {
  try {
    const { revisionId,itemId } = await context.params;
    const { service,identity } = await requireMobilePermission(request,"mobile.rectifications");
    const current = await service.from("tower_revision_items").select("*").eq("id",itemId).eq("revision_id",revisionId).maybeSingle();
    if (current.error) throw new Error(current.error.message);
    if (!current.data) return NextResponse.json({error:"Finding not found."},{status:404});
    const item=current.data;
    await assertMobileProjectAccess(service,identity.userId,item.project_id);
    const [parent,tower,issue] = await Promise.all([
      service.from("tower_revisions").select("revision_number,fli_number,sequence_no").eq("id",revisionId).eq("project_id",item.project_id).single(),
      service.from("towers").select("name").eq("id",item.tower_id).eq("project_id",item.project_id).single(),
      item.issue_type_id ? service.from("project_field_issue_types").select("name").eq("id",item.issue_type_id).maybeSingle() : Promise.resolve({data:null,error:null}),
    ]);
    for(const result of [parent,tower,issue]) if(result.error) throw new Error(result.error.message);
    if (!parent.data || !tower.data) return NextResponse.json({error:"Revision or tower not found."},{status:404});
    const reference=revisionReference(parent.data),fli=revisionItemFli(item);
    if(!reference || !fli) return NextResponse.json({error:"Finding identifiers are not ready."},{status:409});
    const project=await loadQualityProject(service,item.project_id);
    return NextResponse.json({ item, evidenceContext:{...revisionEvidenceContext(parent.data,item,tower.data.name,issue.data?.name),project:project.project_number,timeZone:qualityTimeZone(project.timezone)} });
  }catch(error){ const result=qualityRouteError(error);return NextResponse.json({error:result.message},{status:result.status}); }
}
