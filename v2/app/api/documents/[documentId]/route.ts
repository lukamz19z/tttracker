import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { resolvePersonPhoto } from "@/lib/people/profile-photo";
import { peopleRead } from "@/lib/people/server";
import { requireProjectContext } from "@/lib/projects/project-context";
import { getDocumentMetadata, downloadDocument, documentError } from "@/lib/documents/service";
import { readLegacyDocument } from "@/lib/documents/legacy-storage";
import { documentHeaders } from "@/lib/documents/preview";

export async function GET(request: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const workspace = await requireWorkspaceContext(request.nextUrl.searchParams.get("organisation"));
    const org = workspace.organisation.organisationId, { documentId } = await params;
    const document = await getDocumentMetadata(org, documentId);
    if (document.document_context === "profile_photos" && document.person_id) {
      const photo = await resolvePersonPhoto(org, document.person_id);
      if (photo?.document_id !== document.id) throw new Error("DOCUMENT_ACCESS_DENIED");
    } else if (document.document_context === "training") {
      if (!workspace.enabledModules.has("people") || document.classification !== "operational") throw new Error("DOCUMENT_ACCESS_DENIED");
      const access = await peopleRead(org, "document_access", { filter: { id: documentId } });
      if (!access?.rows?.length) throw new Error("DOCUMENT_ACCESS_DENIED");
    } else if (document.document_context === "projects" && document.project_id) {
      const context = await requireProjectContext(document.project_id, org);
      if (!context.access.permissions["projects.view"]) throw new Error("DOCUMENT_ACCESS_DENIED");
    } else {
      throw new Error("DOCUMENT_ACCESS_DENIED");
    }
    const bytes = document.provider === "internal"
      ? await readLegacyDocument(org, document.storage_key)
      : await downloadDocument({ organisationId: org, actorId: workspace.userId, permissions: workspace.permissions ?? {} }, document);
    return new NextResponse(new Uint8Array(bytes), { headers: documentHeaders(document.content_type, document.name, request.nextUrl.searchParams.get("mode") !== "download") });
  } catch (error) {
    unstable_rethrow(error);
    const code = error instanceof Error ? error.message : "";
    console.error("Document preview failed", { code: /^(DOCUMENT_|PEOPLE_|INTEGRATION_)[A-Z_]+$/.test(code) ? code : "DOCUMENT_PREVIEW_FAILED" });
    const status = code.includes("NOT_FOUND") ? 404 : code.includes("ACCESS_DENIED") || code.includes("PERMISSION_DENIED") ? 403 : 422;
    return NextResponse.json(documentError(error, "preview"), { status, headers: { "Cache-Control": "no-store" } });
  }
}
