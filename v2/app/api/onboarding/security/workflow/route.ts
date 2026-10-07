import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { tokenHash } from "@/lib/people/confidential";
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
  let uploaded: string | undefined;
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
      uploaded = `${scope.organisation_id}/onboarding/${scope.instance_id}/${crypto.randomUUID()}`;
      const { error: uploadError } = await admin.storage
        .from("v2-people-evidence")
        .upload(uploaded, file, { upsert: false, contentType: file.type });
      if (uploadError) throw new Error("ONBOARDING_UPLOAD_FAILED");
      const { data, error } = await admin.rpc(
        "tttracker_v2_onboarding_external",
        {
          p_session_hash: hash,
          p_action: "document",
          p_field: field,
          p_value: {
            storage_key: uploaded,
            name: file.name.slice(0, 200),
            side: String(form.get("side") ?? "single"),
            content_type: file.type,
            size_bytes: file.size,
          },
        },
      );
      if (error) throw new Error("ONBOARDING_UPLOAD_FAILED");
      uploaded = undefined;
      return NextResponse.json(data, { headers });
    }
    const body = write
      ? ((await request.json()) as {
          action?: string;
          field?: string;
          value?: unknown;
        })
      : { action: "read" };
    if (
      !["read", "save", "submit", "document_access"].includes(body.action ?? "")
    )
      throw new Error("ONBOARDING_INVALID_REQUEST");
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
    if (body.action === "document_access") {
      const urls = await Promise.all(
        (data.rows ?? []).map(
          async (d: {
            id: string;
            name: string;
            side: string;
            storage_key: string;
          }) => {
            const { data: signed, error: failed } = await admin.storage
              .from("v2-people-evidence")
              .createSignedUrl(d.storage_key, 60);
            if (failed) throw new Error("ONBOARDING_DOCUMENT_UNAVAILABLE");
            return {
              id: d.id,
              name: d.name,
              side: d.side,
              url: signed.signedUrl,
            };
          },
        ),
      );
      return NextResponse.json({ rows: urls }, { headers });
    }
    return NextResponse.json(data, { headers });
  } catch (e) {
    if (uploaded)
      await createSupabaseAdmin()
        .storage.from("v2-people-evidence")
        .remove([uploaded]);
    const code =
      e instanceof Error && /^ONBOARDING_[A-Z_]+$/.test(e.message)
        ? e.message
        : "ONBOARDING_UNAVAILABLE";
    return NextResponse.json(
      { error: code },
      { status: code === "ONBOARDING_SESSION_INVALID" ? 401 : 422, headers },
    );
  }
}
