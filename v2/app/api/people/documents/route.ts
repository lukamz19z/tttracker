import { randomUUID,createHash } from "node:crypto";
import {
  resolveDocumentRule,
  type DocumentRule,
} from "@/lib/people/document-rules";
import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import {
  peopleError,
  peopleRead,
  requirePeopleContext,
} from "@/lib/people/server";

const bucket = "v2-people-evidence";
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const context = await requirePeopleContext(params.get("organisation"));
    const result = await peopleRead(
      context.organisation.organisationId,
      "document_access",
      { filter: { id: params.get("id") ?? "" } },
    );
    const document = result?.rows?.[0] as
      { storage_key: string; provider: string } | undefined;
    if (!document || document.provider !== "internal")
      throw new Error("PEOPLE_RECORD_NOT_FOUND");
    const { data, error } = await createSupabaseAdmin()
      .storage.from(bucket)
      .createSignedUrl(document.storage_key, 60);
    if (error) throw new Error("TRAINING_DOCUMENT_UNAVAILABLE");
    return NextResponse.json(
      { url: data.signedUrl },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    unstable_rethrow(error);
    const result = peopleError(error);
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
}

export async function POST(request: NextRequest) {
  let key: string | undefined;
  try {
    const form = await request.formData();
    const context = await requirePeopleContext(
      String(form.get("organisation") ?? ""),
    );
    if (!context.permissions?.["training.edit"])
      throw new Error("PEOPLE_PERMISSION_DENIED");
    const person = String(form.get("person_id") ?? "");
    const file = form.get("file");
    const record = String(form.get("record_id") ?? "");
    const scope = await peopleRead(
      context.organisation.organisationId,
      "document_scope",
      { personId: person, filter: { id: record } },
    );
    const revision = randomUUID();
    const display = String(scope.person.display_name);
    const names = display.trim().split(/\s+/);
    const resolved = resolveDocumentRule(
      scope.rules as DocumentRule[],
      "training",
      scope.person.relationship_type_id,
      {
        person_id: person,
        person_display_name: display,
        first_name: names[0] ?? "",
        last_name: names.slice(1).join(" "),
        employee_number: String(scope.person.employee_number ?? ""),
        training_type: String(scope.training.name),
        training_option: String(scope.training.option_name ?? ""),
        category: String(scope.training.category ?? ""),
        document_type: "Training evidence",
        document_category: "training",
        year: String(new Date().getFullYear()),
        issue_date: String(scope.training.issue_date ?? ""),
        expiry_date: String(scope.training.expiry_date ?? ""),
      },
      revision,
      scope.training.category_id ? String(scope.training.category_id) : null,
    );
    let destinationId:string|undefined;
    if (resolved.provider === "sharepoint") {
      const org=context.organisation.organisationId,admin=createSupabaseAdmin();
      const rule=(scope.rules as DocumentRule[]).find(r=>r.id===resolved.ruleId);
      const connection=await admin.from("v2_integrations").select("status").eq("organisation_id",org).eq("provider","sharepoint").maybeSingle();
      const destination=await admin.from("v2_document_destinations").select("id,access_profile_id").eq("organisation_id",org).eq("id",rule?.library_reference??"00000000-0000-0000-0000-000000000000").eq("context","training").eq("is_active",true).maybeSingle();
      const profile=destination.data?await admin.from("v2_integration_access_profiles").select("classification").eq("organisation_id",org).eq("id",destination.data.access_profile_id).single():null;
      if(connection.data?.status!=="connected"||!destination.data||profile?.data?.classification!=="operational")throw new Error("TRAINING_STORAGE_NOT_CONNECTED");
      destinationId=destination.data.id;
    }
    if (
      !(file instanceof File) ||
      file.size < 1 ||
      file.size > 10 * 1024 * 1024 ||
      !["application/pdf", "image/jpeg", "image/png"].includes(file.type)
    )
      throw new Error("TRAINING_FILE_INVALID");
    const prefix = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const validSignature =
      file.type === "application/pdf"
        ? new TextDecoder().decode(prefix).startsWith("%PDF-")
        : file.type === "image/jpeg"
          ? prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff
          : prefix[0] === 0x89 &&
            new TextDecoder().decode(prefix.slice(1, 4)) === "PNG";
    if (!validSignature) throw new Error("TRAINING_FILE_INVALID");
    key = `${context.organisation.organisationId}/${person}/${revision}`;
    const admin = createSupabaseAdmin();
    const { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(key, file, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error("TRAINING_UPLOAD_FAILED");
    const session = await createSupabaseServer();
    const { data, error } = await session.rpc("tttracker_v2_people_write", {
      p_organisation_id: context.organisation.organisationId,
      p_action: "document",
      p_data: {
        person_id: person,
        record_id: record,
        name: file.name.slice(0, 200),
        resolved_folder: resolved.folder,
        resolved_filename: resolved.filename,
        side: String(form.get("side") ?? "single"),
        storage_key: key,
        content_type: file.type,
        size_bytes: file.size,
      },
    });
    if (error) throw new Error(error.message);
    if(destinationId){
      const org=context.organisation.organisationId;
      const fingerprint=createHash("sha256").update(`${data.id}:${destinationId}:${key}`).digest("hex");
      const queued=await admin.from("v2_document_provider_jobs").insert({organisation_id:org,destination_id:destinationId,document_id:data.id,fingerprint});
      await admin.from("v2_people_documents").update({sync_status:queued.error?"failed":"pending"}).eq("organisation_id",org).eq("id",data.id);
      // Evidence remains securely persisted even if the remote queue is unavailable.
      // An authorised operator can retry sync without resubmitting the training record.
    }
    key = undefined;
    return NextResponse.json(data);
  } catch (error) {
    if (key) await createSupabaseAdmin().storage.from(bucket).remove([key]);
    unstable_rethrow(error);
    const result = peopleError(error);
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
}
