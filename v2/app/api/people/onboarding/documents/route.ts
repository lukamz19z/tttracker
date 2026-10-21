import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { requirePeopleContext, peopleError } from "@/lib/people/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { previewOnboardingDocument } from "@/lib/documents/onboarding";
import { documentError } from "@/lib/documents/service";
export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const context = await requirePeopleContext(p.get("organisation"));
    const { data, error } = await (
      await createSupabaseServer()
    ).rpc("tttracker_v2_onboarding_admin", {
      p_org: context.organisation.organisationId,
      p_action: "document",
      p_id: p.get("id"),
      p_data: { field: p.get("field") },
    });
    if (error) throw new Error(error.message);
    const selected = p.get("document");
    if (selected) {
      const row = (data.rows ?? []).find((d:{id:string})=>d.id===selected);
      if(!row)throw new Error("ONBOARDING_DOCUMENT_UNAVAILABLE");
      const preview=await previewOnboardingDocument({organisationId:context.organisation.organisationId,actorId:context.userId,permissions:context.permissions??{}},row);
      return new NextResponse(new Uint8Array(preview.bytes),{headers:preview.headers});
    }
    const rows = (data.rows??[]).map((d:{id:string;name:string;side:string})=>({id:d.id,name:d.name,side:d.side,
      url:`/api/people/onboarding/documents?organisation=${encodeURIComponent(context.organisation.organisationId)}&id=${encodeURIComponent(p.get("id")??"")}&field=${encodeURIComponent(p.get("field")??"")}&document=${encodeURIComponent(d.id)}`}));
    return NextResponse.json(
      { rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    unstable_rethrow(e);
    const r = e instanceof Error && /^(DOCUMENT_|INTEGRATION_)/.test(e.message) ? {error:documentError(e).error,status:422} : peopleError(e);
    return NextResponse.json(
      { error: r.error },
      { status: r.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
