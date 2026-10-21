import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { uploadDocument, resolveStoredDocumentSetup, type DocumentAuthority, type DocumentInput } from "./service";
import { migrateLegacyTraining } from "./migration";

export type PublicationSource = { organisation_id: string; source_context: string; source_entity_type: string; source_entity_id: string; source_revision: string; actor_id: string };
export type RegeneratedDocument = { authority: DocumentAuthority; input: DocumentInput; revision: string; name: string; mime: string; bytes: Uint8Array };
export type DocumentGenerator = (source: PublicationSource) => Promise<RegeneratedDocument>;

/** Called by an entity-authorised adapter AFTER saving its operational change.
 * This stores configuration/source/revision, not file bytes, and makes no Graph
 * calls. The generator must re-read that exact canonical revision on retry. */
export async function queueGeneratedDocument(authority: DocumentAuthority, input: DocumentInput, revision: string) {
  if (!authority.actorId || authority.externalClassification || input.classification === "confidential" || !revision || revision.length > 120) throw new Error("DOCUMENT_ACCESS_DENIED");
  const rule = await resolveStoredDocumentSetup(authority, input);
  const fingerprint = createHash("sha256").update(`${authority.organisationId}:${input.context}:${input.entityType}:${input.entityId}:${revision}`).digest("hex");
  const result = await createSupabaseAdmin().from("v2_document_provider_jobs").upsert({
    organisation_id: authority.organisationId, destination_id: rule.id, fingerprint,
    source_kind: "generated", source_context: input.context, source_entity_type: input.entityType,
    source_entity_id: input.entityId, source_revision: revision, actor_id: authority.actorId,
  }, { onConflict: "organisation_id,source_context,source_entity_type,source_entity_id,source_revision", ignoreDuplicates: true });
  if (result.error) throw new Error("DOCUMENT_PUBLICATION_QUEUE_FAILED");
  const saved = await createSupabaseAdmin().from("v2_document_provider_jobs").select("id,status").eq("organisation_id", authority.organisationId).eq("fingerprint", fingerprint).eq("source_kind", "generated").single();
  if (saved.error || !saved.data) throw new Error("DOCUMENT_PUBLICATION_QUEUE_FAILED");
  return saved.data as { id: string; status: string };
}

/** Existing provider lease/backoff architecture; regenerators are server-owned,
 * never supplied by a browser/job JSON. No renderer => explicit deferred state. */
export async function processPublicationJob(org: string, id: string, generators: Readonly<Record<string, DocumentGenerator>>) {
  const db = createSupabaseAdmin();
  const claimed = await db.rpc("tttracker_v2_claim_document_job", { p_org: org, p_id: id });
  if (claimed.error || !claimed.data?.lease_id) throw new Error("INTEGRATION_JOB_BUSY");
  const job = claimed.data;
  let bytes: Uint8Array | undefined;
  try {
    if (job.organisation_id !== org || !["generated", "migration"].includes(job.source_kind)) throw new Error("DOCUMENT_ACCESS_DENIED");
    if (job.source_kind === "migration") {
      const rights = await db.rpc("tttracker_v2_document_worker_authority", { p_org: org, p_actor: job.actor_id, p_document: job.document_id });
      if (rights.error || !rights.data) throw new Error("DOCUMENT_ACCESS_DENIED");
      const document = await migrateLegacyTraining({ organisationId: org, actorId: job.actor_id, permissions: rights.data }, job.document_id);
      const saved = await db.from("v2_document_provider_jobs").update({ status: "synced", publication_document_id: document.id,
        site_id: document.sharepoint_site_id, drive_id: document.sharepoint_drive_id, drive_item_id: document.sharepoint_item_id,
        synced_at: new Date().toISOString(), last_error: null, lease_id: null, lease_until: null,
      }).eq("organisation_id", org).eq("id", id).eq("lease_id", job.lease_id).select("id");
      if (saved.error || !saved.data?.length) throw new Error("DOCUMENT_METADATA_SAVE_FAILED");
      return { status: "synced", documentId: document.id };
    }
    const generator = generators[job.source_context];
    if (!generator) throw new Error("DOCUMENT_GENERATOR_NOT_AVAILABLE");
    const currentAuthority = await db.rpc("tttracker_v2_publication_worker_authority", { p_org: org, p_actor: job.actor_id, p_job: job.id });
    if (currentAuthority.error || !currentAuthority.data) throw new Error("DOCUMENT_ACCESS_DENIED");
    const generated = await generator(job as PublicationSource);
    bytes = generated.bytes;
    if (generated.authority.organisationId !== org || generated.authority.actorId !== job.actor_id ||
      generated.input.entityId !== job.source_entity_id || generated.input.entityType !== job.source_entity_type || generated.input.context !== job.source_context || generated.revision !== job.source_revision) throw new Error("DOCUMENT_ACCESS_DENIED");
    generated.authority.permissions = currentAuthority.data;
    const currentRule = await resolveStoredDocumentSetup(generated.authority, generated.input);
    if (currentRule.id !== job.destination_id) throw new Error("DOCUMENT_PUBLICATION_SETUP_CHANGED");
    const document = await uploadDocument(generated.authority, generated.input, generated, job.id);
    const saved = await db.from("v2_document_provider_jobs").update({ status: "synced", publication_document_id: document.id,
      site_id: document.sharepoint_site_id, drive_id: document.sharepoint_drive_id, drive_item_id: document.sharepoint_item_id,
      filename: document.name, synced_at: new Date().toISOString(), last_error: null, lease_id: null, lease_until: null,
    }).eq("organisation_id", org).eq("id", id).eq("lease_id", job.lease_id).select("id");
    if (saved.error || !saved.data?.length) throw new Error("DOCUMENT_METADATA_SAVE_FAILED");
    return { status: "synced", documentId: document.id };
  } catch (error) {
    const code = error instanceof Error && /^(DOCUMENT_|INTEGRATION_)[A-Z_]+$/.test(error.message) ? error.message : "DOCUMENT_PUBLICATION_FAILED";
    const providerDelay = error && typeof error === "object" && "retryAfter" in error ? Number(error.retryAfter) : 0;
    const delay = Math.min(3600, Math.max(60, providerDelay || 0, 15 * 2 ** Math.min(job.attempts, 7)));
    await db.from("v2_document_provider_jobs").update({ status: "failed", last_error: code, available_at: new Date(Date.now() + delay * 1000).toISOString(), lease_id: null, lease_until: null }).eq("organisation_id", org).eq("id", id).eq("lease_id", job.lease_id);
    return { status: "failed", code };
  } finally { bytes?.fill(0); }
}
