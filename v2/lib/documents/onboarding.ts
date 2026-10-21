import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { downloadDocument, type DocumentAuthority, type DocumentRecord } from "./service";
import { readLegacyDocument } from "./legacy-storage";
import { documentHeaders } from "./preview";

/** Called only with a row returned by the existing field/session-authorised
 * onboarding RPC. Keys/IDs supplied by the browser are not storage authority. */
export async function previewOnboardingDocument(authority: DocumentAuthority, row: { storage_key: string; name: string }) {
  const org = authority.organisationId;
  if (!row.storage_key.startsWith(`${org}/onboarding/`)) throw new Error("DOCUMENT_ACCESS_DENIED");
  const canonical = await createSupabaseAdmin().from("v2_people_documents").select("*").eq("organisation_id", org).eq("storage_key", row.storage_key).in("document_context", ["onboarding", "profile_photos"]).limit(1).maybeSingle();
  if (canonical.error) throw new Error("DOCUMENT_NOT_FOUND");
  if (canonical.data) {
    const document = canonical.data as DocumentRecord;
    // The field-aware RPC has already enforced private domain permissions.
    // It cannot authorise confidential files.
    if (!["operational", "private"].includes(document.classification)) throw new Error("DOCUMENT_CONFIDENTIAL_BLOCKED");
    const bytes = await downloadDocument(authority, document);
    return { bytes, headers: documentHeaders(document.content_type, document.name, true) };
  }
  const bytes = await readLegacyDocument(org, row.storage_key);
  // Historical rows lack MIME in the RPC. Detect the supported legacy formats.
  const mime = new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-" ? "application/pdf" : bytes[0] === 137 ? "image/png" : "image/jpeg";
  return { bytes, headers: documentHeaders(mime, row.name, true) };
}
