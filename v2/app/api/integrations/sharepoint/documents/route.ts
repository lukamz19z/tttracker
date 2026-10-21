import { NextRequest, NextResponse } from "next/server";
import { integrationContext } from "@/lib/integrations/server";
import { peopleRead } from "@/lib/people/server";
import { migrateLegacyTraining } from "@/lib/documents/migration";
import { documentError } from "@/lib/documents/service";

// Compatibility endpoint: new uploads use the central document service directly.
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("document") ?? "";
  const org = request.nextUrl.searchParams.get("organisation") ?? "";
  return NextResponse.redirect(new URL(`/api/documents/${encodeURIComponent(id)}?organisation=${encodeURIComponent(org)}&mode=preview`,request.nextUrl.origin));
}
export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new Error("DOCUMENT_ACCESS_DENIED");
    const body = await request.json();
    const { org, context } = await integrationContext(body.organisation,"sharepoint","manage");
    const access = await peopleRead(org,"document_access",{filter:{id:String(body.document_id??"")}});
    if(!access?.rows?.length)throw new Error("DOCUMENT_ACCESS_DENIED");
    const document=await migrateLegacyTraining({organisationId:org,actorId:context.userId,permissions:context.permissions??{}},String(body.document_id??""));
    return NextResponse.json({ok:true,status:"synced",id:document.id,sourceRetained:true});
  } catch(error) { return NextResponse.json(documentError(error),{status:422}); }
}
