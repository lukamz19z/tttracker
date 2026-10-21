import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { integrationContext } from "@/lib/integrations/server";
import { peopleRead } from "@/lib/people/server";
import { documentError } from "@/lib/documents/service";

export async function GET(request: NextRequest) {
  try {
    const { org, context, admin } = await integrationContext(request.nextUrl.searchParams.get("organisation"), "sharepoint", "manage");
    if (!context.permissions?.["training.view"]) throw new Error("DOCUMENT_ACCESS_DENIED");
    const records = await admin.from("v2_people_documents").select("id,name,content_type,size_bytes", { count: "exact" }).eq("organisation_id", org).eq("provider", "internal").eq("classification", "operational").eq("document_context", "training").limit(50);
    const rules = await admin.from("v2_document_destinations").select("id,location_id").eq("organisation_id", org).eq("context", "training").eq("is_active", true);
    if (records.error || rules.error) throw new Error("DOCUMENT_NOT_FOUND");
    return NextResponse.json({ total: records.count ?? 0, rows: records.data ?? [], configured: !!rules.data?.some(r => r.location_id), sourceCleanupEnabled: false,
      message: "Preview only. Each selected document will be revalidated by the worker. Original files are retained.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json(documentError(error), { status: 403 }); }
}
export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new Error("DOCUMENT_ACCESS_DENIED");
    const body = await request.json();
    const { org, context, admin } = await integrationContext(body.organisation, "sharepoint", "manage");
    if (!context.permissions?.["training.edit"] || !context.permissions?.["training.view"] || !Array.isArray(body.documents) || !body.documents.length || body.documents.length > 10) throw new Error("DOCUMENT_ACCESS_DENIED");
    const rule = await admin.from("v2_document_destinations").select("id").eq("organisation_id", org).eq("context", "training").eq("is_active", true).order("priority", { ascending: false }).limit(1).single();
    if (rule.error || !rule.data) throw new Error("DOCUMENT_STORAGE_NOT_CONFIGURED");
    let queued = 0;
    for (const id of [...new Set(body.documents)] as string[]) {
      const access = await peopleRead(org, "document_access", { filter: { id } });
      if (!access?.rows?.length) throw new Error("DOCUMENT_ACCESS_DENIED");
      const source = await admin.from("v2_people_documents").select("id").eq("organisation_id", org).eq("id", id).eq("provider", "internal").eq("document_context", "training").eq("classification", "operational").single();
      if (source.error || !source.data) throw new Error("DOCUMENT_ACCESS_DENIED");
      const fingerprint = createHash("sha256").update(`${org}:${id}:sharepoint-migration-v1`).digest("hex");
      const job = await admin.from("v2_document_provider_jobs").upsert({ organisation_id: org, destination_id: rule.data.id, document_id: id, source_kind: "migration", actor_id: context.userId, fingerprint }, { onConflict: "organisation_id,document_id,fingerprint", ignoreDuplicates: true });
      if (job.error) throw new Error("DOCUMENT_PUBLICATION_QUEUE_FAILED");
      queued++;
    }
    return NextResponse.json({ queued, sourceRetained: true });
  } catch (error) { return NextResponse.json(documentError(error), { status: 422 }); }
}
