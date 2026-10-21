import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { tokenHash } from "@/lib/people/confidential";
import { uploadDocument, documentError } from "@/lib/documents/service";
import { publishPendingProfilePhotos } from "@/lib/people/profile-photo";
import { previewOnboardingDocument } from "@/lib/documents/onboarding";
export const runtime = "nodejs";
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};
export async function GET(request: NextRequest) {
  return run(request, false);
}
export async function POST(request: NextRequest) {
  return run(request, true);
}
async function run(request: NextRequest, write: boolean) {
  let fileBytes: Uint8Array | undefined;
  try {
    const configured = process.env.NEXT_PUBLIC_APP_URL;
    if (
      !configured ||
      (write && request.headers.get("origin") !== new URL(configured).origin)
    )
      return NextResponse.json(
        { error: "Request not allowed." },
        { status: 403, headers },
      );
    const token = request.cookies.get("tttracker_onboarding")?.value;
    if (!token) throw new Error("ONBOARDING_SESSION_INVALID");
    const admin = createSupabaseAdmin();
    const hash = tokenHash(token);
    if (
      write &&
      request.headers.get("content-type")?.startsWith("multipart/form-data")
    ) {
      const form = await request.formData();
      const field = String(form.get("field") ?? "");
      const file = form.get("file");
      const { data: scope, error: denied } = await admin.rpc(
        "tttracker_v2_onboarding_external",
        { p_session_hash: hash, p_action: "upload_scope", p_field: field },
      );
      if (denied) throw new Error("ONBOARDING_FIELD_INVALID");
      if (
        !(file instanceof File) ||
        !file.size ||
        file.size > 10485760 ||
        !["application/pdf", "image/jpeg", "image/png"].includes(file.type)
      )
        throw new Error("ONBOARDING_FILE_INVALID");
      const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      if (
        !(file.type === "application/pdf"
          ? new TextDecoder().decode(bytes).startsWith("%PDF-")
          : file.type === "image/jpeg"
            ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : bytes[0] === 137 &&
              bytes[1] === 80 &&
              bytes[2] === 78 &&
              bytes[3] === 71)
      )
        throw new Error("ONBOARDING_FILE_INVALID");
      if (!scope || !["operational", "private"].includes(scope.field?.classification)) throw new Error("ONBOARDING_FIELD_INVALID");
      if(scope.field.type === "profile_photo" && !["image/jpeg","image/png"].includes(file.type)) throw new Error("ONBOARDING_FILE_INVALID");
      fileBytes = new Uint8Array(await file.arrayBuffer());
      const person = scope.person_id ? await admin.from("v2_people").select("id,display_name,employee_number").eq("organisation_id",scope.organisation_id).eq("id",scope.person_id).single() : null;
      if (person?.error) throw new Error("ONBOARDING_FIELD_INVALID");
      const side = String(form.get("side") ?? "single");
      if (scope.field.type === "profile_photo" && side !== "single") throw new Error("ONBOARDING_FILE_INVALID");
      if (!["single","front","back"].includes(side)) throw new Error("ONBOARDING_FILE_INVALID");
      const document = await uploadDocument({organisationId:scope.organisation_id,actorId:null,permissions:{},externalClassification:scope.field.classification}, {
        context:"onboarding",entityType:"onboarding",entityId:scope.instance_id,
        relationshipTypeId:scope.relationship_type_id,classification:scope.field.classification,side:side as "single"|"front"|"back",
        values:{onboarding_instance_id:scope.instance_id,recipient_name:scope.recipient_name??"",person_id:person?.data?.id??"",person_display_name:person?.data?.display_name??"",employee_number:person?.data?.employee_number??"",
          document_type:scope.field.label,document_category:"Onboarding",year:String(new Date().getUTCFullYear()),month:String(new Date().getUTCMonth()+1).padStart(2,"0")}
      },{name:file.name,mime:file.type,bytes:fileBytes});
      const { data, error } = await admin.rpc(
        "tttracker_v2_onboarding_external",
        {
          p_session_hash: hash,
          p_action: "document",
          p_field: field,
          p_value: {
            storage_key: document.storage_key,
            name: file.name.slice(0, 200),
            side: String(form.get("side") ?? "single"),
            content_type: file.type,
            size_bytes: file.size,
          },
        },
      );
      if (error) throw new Error("ONBOARDING_UPLOAD_FAILED");

      return NextResponse.json(data, { headers });
    }
    const body = write
      ? ((await request.json()) as {
          action?: string;
          field?: string;
          value?: unknown;
        })
      : { action: request.nextUrl.searchParams.get("document") ? "document_access" : "read", field: request.nextUrl.searchParams.get("field") ?? undefined };
    if (
      !["read", "save", "submit", "document_access"].includes(body.action ?? "")
    )
      throw new Error("ONBOARDING_INVALID_REQUEST");
    const beforeSubmit = body.action === "submit" ? await admin.rpc("tttracker_v2_onboarding_external", { p_session_hash: hash, p_action: "read" }) : null;
    const { data, error } = await admin.rpc(
      "tttracker_v2_onboarding_external",
      {
        p_session_hash: hash,
        p_action: body.action,
        p_field: body.field ?? null,
        p_value: body.value ?? null,
      },
    );
    if (error) throw new Error(error.message);
    let photoPublicationPending = false;
    if (body.action === "submit" && data?.status === "completed" && beforeSubmit?.data?.instance_id) {
      try { photoPublicationPending = (await publishPendingProfilePhotos({ instance: beforeSubmit.data.instance_id })).deferred > 0; }
      catch { photoPublicationPending = true; console.error("Onboarding completed with pending profile photo publication"); }
    }
    if (body.action === "document_access") {
      const selected = request.nextUrl.searchParams.get("document");
      if (selected) {
        const row = (data.rows ?? []).find((d: {id:string}) => d.id === selected);
        if (!row) throw new Error("ONBOARDING_DOCUMENT_UNAVAILABLE");
        const scope = await admin.rpc("tttracker_v2_onboarding_external",{p_session_hash:hash,p_action:"upload_scope",p_field:body.field??null});
        if(scope.error||!scope.data)throw new Error("ONBOARDING_SESSION_INVALID");
        const preview = await previewOnboardingDocument({organisationId:scope.data.organisation_id,actorId:null,permissions:{},externalClassification:scope.data.field.classification},row);
        return new NextResponse(new Uint8Array(preview.bytes),{headers:preview.headers});
      }
      const urls = (data.rows ?? []).map((d:{id:string;name:string;side:string})=>({id:d.id,name:d.name,side:d.side,
        url:`/api/onboarding/security/workflow?field=${encodeURIComponent(body.field??"")}&document=${encodeURIComponent(d.id)}`}));
      return NextResponse.json({ rows: urls }, { headers });
    }
    return NextResponse.json({ ...data, photo_publication_pending: photoPublicationPending }, { headers });
  } catch (e) {
    const code =
      e instanceof Error && /^ONBOARDING_[A-Z_]+$/.test(e.message)
        ? e.message
        : "ONBOARDING_UNAVAILABLE";
    const safe = e instanceof Error && /^(DOCUMENT_|INTEGRATION_)/.test(e.message) ? documentError(e).error : code;
    return NextResponse.json(
      { error: safe },
      { status: code === "ONBOARDING_SESSION_INVALID" ? 401 : 422, headers },
    );
  } finally { fileBytes?.fill(0); }
}
