import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { requireProjectContext } from "@/lib/projects/project-context";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { uploadDocument, documentError } from "@/lib/documents/service";

async function context(request: NextRequest, projectId: string) {
  const result = await requireProjectContext(projectId, request.nextUrl.searchParams.get("organisation"));
  if (result.access.kind !== "host" || !result.access.permissions["projects.view"]) throw new Error("DOCUMENT_ACCESS_DENIED");
  return result;
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const scope = await context(request, (await params).projectId);
    const result = await createSupabaseAdmin().from("v2_people_documents").select("id,name,content_type,size_bytes,created_at,published_at")
      .eq("organisation_id", scope.dataOrganisationId).eq("project_id", scope.project.id).eq("document_context", "projects").eq("classification", "operational").order("created_at", { ascending: false }).limit(50);
    if (result.error) throw new Error("DOCUMENT_NOT_FOUND");
    return NextResponse.json({ rows: result.data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { unstable_rethrow(error); return NextResponse.json(documentError(error), { status: 403 }); }
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  let bytes: Uint8Array | undefined;
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new Error("DOCUMENT_ACCESS_DENIED");
    const scope = await context(request, (await params).projectId);
    if (!scope.access.permissions["projects.edit"]) throw new Error("DOCUMENT_ACCESS_DENIED");
    const form = await request.formData(), file = form.get("file");
    if (!(file instanceof File) || file.size > 10485760) throw new Error("DOCUMENT_FILE_INVALID");
    bytes = new Uint8Array(await file.arrayBuffer());
    const project = scope.project;
    const result = await uploadDocument({ organisationId: scope.dataOrganisationId, actorId: scope.workspace.userId, permissions: scope.workspace.permissions ?? {} }, {
      context: "projects", entityType: "project", entityId: project.id, projectId: project.id,
      values: { project_id: project.id, project_name: project.name, project_number: project.project_number ?? project.code, project_code: project.code,
        client_name: project.client_name ?? "", document_type: "Project document", document_category: "Projects",
        year: String(new Date().getUTCFullYear()), month: String(new Date().getUTCMonth() + 1).padStart(2, "0") },
    }, { name: file.name, mime: file.type, bytes });
    return NextResponse.json({ id: result.id });
  } catch (error) { unstable_rethrow(error); return NextResponse.json(documentError(error), { status: 422 }); }
  finally { bytes?.fill(0); }
}
