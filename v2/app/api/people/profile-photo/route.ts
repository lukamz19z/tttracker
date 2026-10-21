import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { requirePeopleContext, peopleError } from "@/lib/people/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { resolvePersonPhoto, photoDocumentInput, personPhotoThumbnail, publishPendingProfilePhotos } from "@/lib/people/profile-photo";
import { uploadDocument, getDocumentMetadata, documentError } from "@/lib/documents/service";
import { createHash } from "node:crypto";
export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };
export async function GET(request: NextRequest) {
 try {
  const context = await requirePeopleContext(request.nextUrl.searchParams.get("organisation"));
  const org = context.organisation.organisationId;
  const photo = await resolvePersonPhoto(org, request.nextUrl.searchParams.get("person"));
  if (!request.nextUrl.searchParams.has("image")) return NextResponse.json(photo, { headers: noStore });
  if (!photo?.document_id) return new NextResponse(null, { status: 404, headers: noStore });
  const document = await getDocumentMetadata(org, photo.document_id);
  const etag = `"${createHash("sha256").update(`${org}:${photo.document_id}:${document.sharepoint_etag ?? ""}:small`).digest("hex")}"`;
  // Revalidate tenant and photo permission on every network request, including 304.
  const headers = { "Cache-Control": "private, max-age=300, must-revalidate", ETag: etag, Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
  if (request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
  const image = await personPhotoThumbnail({ organisationId: org, actorId: context.userId, permissions: context.permissions ?? {} }, document);
  return new NextResponse(new Uint8Array(image.bytes), { headers: { ...headers, "Content-Type": image.mime } });
 } catch(error) { unstable_rethrow(error); return failure(error); }
}
export async function POST(request: NextRequest) {
 let bytes: Uint8Array | undefined;
 try {
  if (request.headers.get("origin") !== request.nextUrl.origin) throw new Error("PEOPLE_PERMISSION_DENIED");
  const form = await request.formData();
  const context = await requirePeopleContext(String(form.get("organisation") ?? ""));
  const org = context.organisation.organisationId, person = String(form.get("person") ?? "") || null;
  const session = await createSupabaseServer();
  const scope = await session.rpc("tttracker_v2_person_photo", { p_org: org, p_person: person, p_action: "scope" });
  if (scope.error) throw new Error(scope.error.message);
  if (!scope.data?.id) throw new Error("PEOPLE_RECORD_NOT_FOUND");
  const action = String(form.get("action") ?? "upload");
  if (action === "retry") {
    if (!context.permissions?.["people.profile_photo.manage"]) throw new Error("PEOPLE_PERMISSION_DENIED");
    const result = await publishPendingProfilePhotos({ organisation: org, person: scope.data.id });
    return NextResponse.json(result, { headers: noStore });
  }
  let id: string | null = null;
  if (action === "upload") {
    const file = form.get("file");
    if (!(file instanceof File) || !["image/jpeg","image/png"].includes(file.type) || !file.size || file.size > 10485760) throw new Error("PEOPLE_PHOTO_FILE_INVALID");
    bytes = new Uint8Array(await file.arrayBuffer());
    const document = await uploadDocument({ organisationId: org, actorId: context.userId, permissions: context.permissions ?? {} }, photoDocumentInput(scope.data), { name: file.name, mime: file.type, bytes });
    const source = await createSupabaseAdmin().from("v2_people_documents").update({ photo_source: scope.data.source }).eq("organisation_id",org).eq("id",document.id);
    if (source.error) throw new Error("PEOPLE_PHOTO_METADATA_SAVE_FAILED");
    id = document.id;
  } else if (action !== "remove") throw new Error("PEOPLE_INVALID_ACTION");
  const assigned = await session.rpc("tttracker_v2_person_photo", { p_org: org, p_person: scope.data.id, p_action: action === "remove" ? "remove" : "assign", p_document: id });
  if (assigned.error || !assigned.data) throw new Error(assigned.error?.message ?? "PEOPLE_PHOTO_ASSIGNMENT_FAILED");
  return NextResponse.json(assigned.data, { headers: noStore });
 } catch(error) { unstable_rethrow(error); return failure(error); }
 finally { bytes?.fill(0); }
}
function failure(error: unknown) {
 const code = error instanceof Error ? error.message : "";
 const safe = code.startsWith("PEOPLE_") ? peopleError(error) : { error: documentError(error).error, status: code.includes("ACCESS_DENIED") ? 403 : 422 };
 return NextResponse.json({ error: code === "PEOPLE_PHOTO_FILE_INVALID" ? "Choose a JPG, JPEG or PNG photo no larger than 10 MB." : safe.error }, { status: safe.status, headers: noStore });
}
