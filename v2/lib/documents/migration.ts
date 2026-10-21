import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDocumentMetadata, uploadDocument, type DocumentAuthority } from "./service";
import { readLegacyDocument } from "./legacy-storage";

/** An explicit, one-record migration. The route has already checked training
 * record access; the service checks current routing/profile/entitlement again.
 * Supabase source bytes are retained after verified SharePoint publication. */
export async function migrateLegacyTraining(authority: DocumentAuthority, id: string) {
  if (!authority.permissions["training.edit"]) throw new Error("DOCUMENT_ACCESS_DENIED");
  const org = authority.organisationId, db = createSupabaseAdmin();
  const document = await getDocumentMetadata(org, id);
  if (document.provider === "sharepoint") return document;
  if (document.document_context !== "training" || !document.person_id || document.classification !== "operational") throw new Error("DOCUMENT_ACCESS_DENIED");
  const record = await db.from("v2_training_records").select("id,training_type_id,issue_date,expiry_date,option_id").eq("organisation_id", org).eq("person_id", document.person_id).eq("evidence_group_id", document.evidence_group_id).order("created_at").limit(1).single();
  const person = await db.from("v2_people").select("id,display_name,employee_number,relationship_type_id").eq("organisation_id", org).eq("id", document.person_id).single();
  if (record.error || person.error || !record.data || !person.data) throw new Error("DOCUMENT_NOT_FOUND");
  const training = await db.from("v2_training_types").select("name,category").eq("organisation_id", org).eq("id", record.data.training_type_id).single();
  const option = record.data.option_id ? await db.from("v2_training_options").select("name").eq("organisation_id", org).eq("id", record.data.option_id).single() : null;
  if (training.error || !training.data || option?.error) throw new Error("DOCUMENT_NOT_FOUND");
  const names = person.data.display_name.trim().split(/\s+/);
  const bytes = await readLegacyDocument(org, document.storage_key);
  try {
    return await uploadDocument(authority, { context: "training", entityType: "training", entityId: record.data.id,
      personId: document.person_id, relationshipTypeId: person.data.relationship_type_id, side: document.side,
      values: { person_id: document.person_id, person_display_name: person.data.display_name, employee_number: person.data.employee_number ?? "",
        first_name: names[0] ?? "", last_name: names.slice(1).join(" "), training_type: training.data.name,
        training_category: training.data.category ?? "", training_option: option?.data?.name ?? "",
        issue_date: record.data.issue_date ?? "", expiry_date: record.data.expiry_date ?? "", document_type: "Training evidence",
        document_category: "Training", year: String(new Date().getUTCFullYear()), month: String(new Date().getUTCMonth() + 1).padStart(2, "0") },
    }, { name: document.name, mime: document.content_type, bytes }, id);
  } finally { bytes.fill(0); }
}
