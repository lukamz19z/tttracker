import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { type DocumentAuthority, type DocumentInput, type DocumentRecord, resolveDocumentSetup, uploadDocument, resolveDocumentReadScope } from "@/lib/documents/service";
import { locationScope } from "@/lib/integrations/sharepoint-locations";
import { ensureFolderPath } from "@/lib/integrations/sharepoint";

export type PersonPhoto = { person_id: string; name: string; document_id: string | null; version: string | null; can_manage: boolean; pending: boolean };
/** Canonical resolver for People, linked-account avatars, future project onboarding and ID cards.
 * Session RPC enforces module/tenant/capability access; IDs are never folder-derived. */
export async function resolvePersonPhoto(org: string, person: string | null = null): Promise<PersonPhoto | null> {
  const result = await (await createSupabaseServer()).rpc("tttracker_v2_person_photo", { p_org: org, p_person: person });
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
export function photoDocumentInput(person: { id: string; display_name: string; employee_number?: string | null; relationship_type_id?: string | null }): DocumentInput {
  const now = new Date(), names = person.display_name.trim().split(/\s+/);
  return { context: "profile_photos", entityType: "person_profile_photo", entityId: person.id, personId: person.id,
    relationshipTypeId: person.relationship_type_id, classification: "operational", side: "single",
    values: { person_id: person.id, person_display_name: person.display_name, employee_number: person.employee_number ?? "", first_name: names[0] ?? "", last_name: names.slice(1).join(" "), document_type: "Profile Photo", document_category: "Profile Photos", upload_date: now.toISOString().slice(0,10), year: String(now.getUTCFullYear()), month: String(now.getUTCMonth()+1).padStart(2,"0") } };
}
/** Thumbnail access follows canonical document scope and stable item IDs, never paths. */
export async function personPhotoThumbnail(authority: DocumentAuthority, document: DocumentRecord) {
  if (document.organisation_id !== authority.organisationId || document.document_context !== "profile_photos" || !authority.permissions["people.profile_photo.view"] || document.classification !== "operational") throw new Error("DOCUMENT_ACCESS_DENIED");
  const { scope } = await resolveDocumentReadScope(authority, document);
  return scope.graph.thumbnail(document.sharepoint_item_id);
}

/** Durable pending metadata is written by the completion trigger. Only a server
 * worker calls this; no external-session or browser-supplied storage authority. */
export async function publishPendingProfilePhotos(filter: { organisation?: string; instance?: string; person?: string } = {}) {
  const db = createSupabaseAdmin();
  let query = db.from("v2_people_documents").select("*").eq("photo_publication_pending", true).lte("photo_retry_after", new Date().toISOString()).order("photo_retry_after").limit(3);
  if (filter.organisation) query = query.eq("organisation_id", filter.organisation);
  if (filter.instance) query = query.eq("entity_id", filter.instance);
  if (filter.person) query = query.eq("person_id", filter.person);
  const pending = await query;
  if (pending.error) throw new Error("PEOPLE_PHOTO_PUBLICATION_UNAVAILABLE");
  let published = 0, deferred = 0;
  for (const row of pending.data ?? []) {
    try {
      // Claim by compare-and-set; retries after interruption are idempotent.
      const claim = await db.from("v2_people_documents").update({ photo_retry_after: new Date(Date.now()+300000).toISOString() }).eq("organisation_id", row.organisation_id).eq("id", row.id).eq("photo_publication_pending", true).eq("photo_retry_after",row.photo_retry_after).select("id");
      if (claim.error || !claim.data?.length) continue;
      const proof = await db.rpc("tttracker_v2_onboarding_photo_authority", { p_org: row.organisation_id, p_document: row.id });
      if (proof.error || !proof.data?.actor_id) throw new Error("PEOPLE_PERMISSION_DENIED");
      const person = await db.from("v2_people").select("id,display_name,employee_number,relationship_type_id").eq("organisation_id", row.organisation_id).eq("id", row.person_id).single();
      if (person.error || !person.data) throw new Error("PEOPLE_RECORD_NOT_FOUND");
      const input = photoDocumentInput(person.data);
      // Completion's durable relationship is the authority for this server-only publication.
      const scope = await resolveDocumentSetup({ organisationId: row.organisation_id, actorId: null, permissions: { "people.profile_photo.manage": true } }, input);
      if (scope.location.drive_id !== row.sharepoint_drive_id || scope.site.site_id !== row.sharepoint_site_id) {
        // Graph preserves item IDs for moves within a library. Across libraries,
        // retain the onboarding source and publish one idempotent canonical
        // derivative through the same central service, with explicit provenance.
        const sourceScope = await locationScope(row.organisation_id, row.destination_id);
        if (sourceScope.site.site_id !== row.sharepoint_site_id || sourceScope.location.drive_id !== row.sharepoint_drive_id) throw new Error("DOCUMENT_ACCESS_DENIED");
        const bytes = await sourceScope.graph.download(row.sharepoint_item_id);
        let copy: DocumentRecord;
        try {
          const hex = createHash("sha256").update(`onboarding-profile-photo:${row.organisation_id}:${row.id}`).digest("hex");
          const copyId = `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
          copy = await uploadDocument({ organisationId: row.organisation_id, actorId: null, permissions: { "people.profile_photo.manage": true } }, { ...input, entityId: row.entity_id }, { name: row.name, mime: row.content_type, bytes }, copyId);
        } finally { bytes.fill(0); }
        const linked = await db.from("v2_people_documents").update({ photo_source: "onboarding", photo_publication_pending: true, source_document_id: row.id, photo_retry_after: new Date(Date.now()+300000).toISOString() }).eq("organisation_id",row.organisation_id).eq("id",copy.id);
        if (linked.error) throw new Error("DOCUMENT_METADATA_SAVE_FAILED");
        const assigned = await db.rpc("tttracker_v2_finish_onboarding_photo", { p_org: row.organisation_id, p_document: copy.id });
        if (assigned.error || !assigned.data) throw new Error("PEOPLE_PHOTO_ASSIGNMENT_FAILED");
        published++; continue;
      }
      const parent = await ensureFolderPath(scope.graph, scope.resolved.folderSegments);
      const extension = row.content_type === "image/png" ? "png" : "jpg";
      const base = scope.resolved.filename.replace(/\.[a-z0-9]{1,8}$/i, "");
      let name = `${base}.${extension}`;
      const existing = await scope.graph.child(parent.id, name);
      if (existing && existing.id !== row.sharepoint_item_id) name = `${base}_${row.id}.${extension}`;
      const item = await scope.graph.metadata(row.sharepoint_item_id);
      if (!item.eTag) throw new Error("DOCUMENT_PROVIDER_RESPONSE_INVALID");
      const moved = await scope.graph.move(item.id, parent.id, name, item.eTag);
      const saved = await db.from("v2_people_documents").update({ document_context: "profile_photos", destination_id: scope.location.id, setup_rule_id: scope.rule.id, resolved_folder: scope.resolved.folderSegments.join("/"), resolved_filename: name, sharepoint_parent_item_id: parent.id, sharepoint_etag: moved.eTag ?? item.eTag, updated_at: new Date().toISOString() }).eq("organisation_id",row.organisation_id).eq("id",row.id).eq("photo_publication_pending",true);
      if (saved.error) throw new Error("DOCUMENT_METADATA_SAVE_FAILED");
      const assigned = await db.rpc("tttracker_v2_finish_onboarding_photo", { p_org: row.organisation_id, p_document: row.id });
      if (assigned.error || !assigned.data) throw new Error("PEOPLE_PHOTO_ASSIGNMENT_FAILED");
      published++;
    } catch (error) {
      deferred++;
      console.error("Profile photo publication deferred", { documentId: row.id, code: error instanceof Error && /^(PEOPLE_|DOCUMENT_|INTEGRATION_)[A-Z_]+$/.test(error.message) ? error.message : "PEOPLE_PHOTO_PUBLICATION_FAILED" });
    }
  }
  return { published, deferred };
}
