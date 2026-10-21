import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireIntegrationEntitlement } from "@/lib/integrations/entitlements";
import { locationScope, connectedMicrosoft } from "@/lib/integrations/sharepoint-locations";
import { ensureFolderPath } from "@/lib/integrations/sharepoint";
import { resolveLocationDestination, resolveTrainingFilenameTemplate, selectRoutingRule, type DocumentContext, type RoutingRule } from "@/lib/integrations/resolver";
import { integrationAudit } from "@/lib/integrations/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export type DocumentAuthority = {
  organisationId: string;
  actorId: string | null;
  permissions: Record<string, boolean>;
  // Only server adapters with a freshly validated external session may supply
  // this authority. Never consume it from request JSON.
  externalClassification?: "operational" | "private";
};
export type DocumentInput = {
  context: DocumentContext;
  entityType: string;
  entityId: string;
  personId?: string;
  projectId?: string;
  relationshipTypeId?: string | null;
  values: Record<string, string>;
  classification?: "operational" | "private" | "confidential";
  side?: "single" | "front" | "back";
};
export type DocumentRecord = {
  id: string; organisation_id: string; evidence_group_id: string | null; person_id: string | null; project_id: string | null;
  name: string; content_type: string; size_bytes: number; provider: string; storage_key: string;
  document_context: DocumentContext; entity_type: string; entity_id: string;
  destination_id: string; setup_rule_id: string; classification: string;
  sharepoint_site_id: string; sharepoint_drive_id: string; sharepoint_item_id: string;
  sharepoint_parent_item_id: string; sharepoint_etag: string | null;
  source_document_id: string | null; published_at: string; side: "single" | "front" | "back";
};

export async function resolveStoredDocumentSetup(authority: DocumentAuthority, input: DocumentInput) {
  const org = authority.organisationId;
  if (authority.externalClassification && (authority.actorId !== null || input.entityType !== "onboarding" || input.context !== "onboarding")) throw new Error("DOCUMENT_ACCESS_DENIED");
  await requireIntegrationEntitlement(org, "sharepoint", true);
  if (input.classification === "confidential") throw new Error("DOCUMENT_CONFIDENTIAL_BLOCKED");
  const db = createSupabaseAdmin();
  const rules = await db.from("v2_document_destinations").select("*").eq("organisation_id", org).eq("context", input.context).eq("is_active", true);
  if (rules.error) throw new Error("DOCUMENT_SETUP_UNAVAILABLE");
  let rule = selectRoutingRule(rules.data as RoutingRule[], org, input.context, input.relationshipTypeId ?? null);
  if (!rule?.location_id) throw new Error("DOCUMENT_STORAGE_NOT_CONFIGURED");
  if (input.context === "training") {
    const record = await db.from("v2_training_records").select("training_type_id").eq("organisation_id", org).eq("id", input.entityId).maybeSingle();
    if (record.error || !record.data) throw new Error("DOCUMENT_RECORD_NOT_FOUND");
    const training = await db.from("v2_training_types").select("filename_template,category_id").eq("organisation_id", org).eq("id", record.data.training_type_id).single();
    if (training.error || !training.data) throw new Error("DOCUMENT_SETUP_UNAVAILABLE");
    let categoryTemplate = "";
    if (!String(training.data.filename_template ?? "").trim() && training.data.category_id) {
      const category = await db.from("v2_training_categories").select("filename_template").eq("organisation_id", org).eq("id", training.data.category_id).maybeSingle();
      if (category.error) throw new Error("DOCUMENT_SETUP_UNAVAILABLE");
      categoryTemplate = String(category.data?.filename_template ?? "").trim();
    }
    const filenameTemplate = resolveTrainingFilenameTemplate(training.data.filename_template, categoryTemplate, rule.filename_template);
    rule = { ...rule, filename_template: filenameTemplate };
  }
  if (rule.conflict_policy !== "version") throw new Error("DOCUMENT_REVISION_POLICY_REQUIRED");
  const profile = await db.from("v2_integration_access_profiles").select("*").eq("organisation_id", org).eq("id", rule.access_profile_id).single();
  const classification = input.classification ?? "operational";
  if (profile.error || profile.data?.classification !== classification || profile.data.native_mode !== "inherit") throw new Error("DOCUMENT_ACCESS_DENIED");
  if (!authority.permissions[profile.data.manage_capability] && authority.externalClassification !== classification) {
    // Self service is a separate explicit capability, restricted to the canonical linked Person.
    if (input.context !== "profile_photos" || !authority.actorId || !authority.permissions["people.profile_photo.self_manage"] || !input.personId) throw new Error("DOCUMENT_ACCESS_DENIED");
    const own = await db.from("v2_people").select("id").eq("organisation_id", org).eq("id", input.personId).eq("auth_user_id", authority.actorId).maybeSingle();
    if (own.error || !own.data) throw new Error("DOCUMENT_ACCESS_DENIED");
  }
  return rule;
}

export async function resolveDocumentSetup(authority: DocumentAuthority, input: DocumentInput) {
  const org = authority.organisationId;
  const rule = await resolveStoredDocumentSetup(authority, input);
  const classification = input.classification ?? "operational";
  const connection = await connectedMicrosoft(org);
  if (connection.status !== "connected") throw new Error("DOCUMENT_SHAREPOINT_UNAVAILABLE");
  const scope = await locationScope(org, rule.location_id!);
  const resolved = resolveLocationDestination(rule, scope.location, org, input.context, input.values, classification);
  return { ...scope, rule, resolved };
}

const types: Record<string, string> = {
  "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
  "text/plain": "txt", "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};
export function validateDocumentBytes(bytes: Uint8Array, mime: string) {
  if (!types[mime] || !bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error("DOCUMENT_FILE_INVALID");
  const head = new TextDecoder().decode(bytes.slice(0, 12));
  const valid = mime === "application/pdf" ? head.startsWith("%PDF-")
    : mime === "image/png" ? bytes.slice(0, 8).every((v, i) => v === [137, 80, 78, 71, 13, 10, 26, 10][i]) && bytes.length >= 8
    : mime === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : mime === "image/webp" ? head.startsWith("RIFF") && head.slice(8, 12) === "WEBP"
    : mime.startsWith("application/vnd.") ? bytes[0] === 80 && bytes[1] === 75
    : !bytes.includes(0);
  if (!valid) throw new Error("DOCUMENT_FILE_INVALID");
}

/** Direct SharePoint publication: no persistent staging, and no record on a
 * provider failure. Server adapters supply canonical entity data/authority. */
export async function uploadDocument(authority: DocumentAuthority, input: DocumentInput, file: { name: string; mime: string; bytes: Uint8Array }, revisionId?: string) {
  validateDocumentBytes(file.bytes, file.mime);
  const id = revisionId ?? randomUUID();
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("DOCUMENT_FILE_INVALID");
  const db = createSupabaseAdmin();
  const previous = revisionId ? await db.from("v2_people_documents").select("*").eq("organisation_id", authority.organisationId).eq("id", id).maybeSingle() : null;
  if (previous?.error) throw new Error("DOCUMENT_METADATA_SAVE_FAILED");
  if (previous?.data?.provider === "internal" && (previous.data.document_context !== input.context ||
    previous.data.person_id !== (input.personId ?? null) || previous.data.project_id !== (input.projectId ?? null) ||
    previous.data.classification !== (input.classification ?? "operational"))) throw new Error("DOCUMENT_ACCESS_DENIED");
  if (previous?.data?.provider === "sharepoint") {
    if (previous.data.entity_type !== input.entityType || previous.data.entity_id !== input.entityId || previous.data.document_context !== input.context) throw new Error("DOCUMENT_ACCESS_DENIED");
    if (input.context === "training" && previous.data.created_by !== authority.actorId) throw new Error("DOCUMENT_ACCESS_DENIED");
  }
  const scope = await resolveDocumentSetup(authority, input);
  if (previous?.data?.provider === "sharepoint") {
    if (input.context === "training") {
      if (previous.data.sharepoint_drive_id !== scope.location.drive_id || previous.data.sharepoint_site_id !== scope.site.site_id) throw new Error("DOCUMENT_ACCESS_DENIED");
      const remote = await scope.graph.download(previous.data.sharepoint_item_id);
      const matches = createHash("sha256").update(remote).digest("hex") === createHash("sha256").update(file.bytes).digest("hex");
      remote.fill(0);
      if (!matches) throw new Error("INTEGRATION_CONFLICT");
    }
    return previous.data as DocumentRecord;
  }
  const parent = await ensureFolderPath(scope.graph, scope.resolved.folderSegments);
  const template = scope.resolved.filename || file.name;
  const extension = types[file.mime];
  const base = template.replace(/\.[a-z0-9]{1,8}$/i, "");
  // Use the configured filename when free. If another physical document uses
  // that name, retain both files under a deterministic per-document suffix.
  // This keeps retries idempotent without silently replacing prior evidence.
  let filename = `${base}.${extension}`;
  let existing = await scope.graph.child(parent.id, filename);
  const matchesBytes = async (item: { id: string }) => {
    const remote = await scope.graph.download(item.id);
    try { return createHash("sha256").update(remote).digest("hex") === createHash("sha256").update(file.bytes).digest("hex"); }
    finally { remote.fill(0); }
  };
  if (existing && (existing.folder || !(await matchesBytes(existing)))) {
    filename = `${base}_${id}.${extension}`;
    existing = await scope.graph.child(parent.id, filename);
  }
  if (existing?.folder || (existing && !(await matchesBytes(existing)))) throw new Error("INTEGRATION_CONFLICT");
  const item = existing ?? await scope.graph.upload(parent.id, filename, file.bytes);
  if (!item?.id) throw new Error("DOCUMENT_PROVIDER_RESPONSE_INVALID");
  const org = authority.organisationId;
  const storageKey = input.entityType === "onboarding"
    ? `${org}/onboarding/${input.entityId}/${id}` : `${org}/${input.personId ?? input.entityId}/${id}`;
  const payload = {
    id, organisation_id: org, person_id: input.personId ?? null, project_id: input.projectId ?? null,
    name: file.name.slice(0, 200), side: input.side ?? "single", provider: "sharepoint", storage_key: previous?.data?.storage_key ?? storageKey,
    content_type: file.mime, size_bytes: file.bytes.byteLength, created_by: previous?.data?.created_by ?? authority.actorId,
    document_context: input.context, entity_type: input.entityType, entity_id: input.entityId,
    destination_id: scope.location.id, setup_rule_id: scope.rule.id, classification: input.classification ?? "operational",
    resolved_folder: scope.resolved.folderSegments.join("/"), resolved_filename: filename,
    sharepoint_site_id: scope.site.site_id, sharepoint_drive_id: scope.location.drive_id,
    sharepoint_item_id: item.id, sharepoint_parent_item_id: parent.id,
    sharepoint_web_url: item.webUrl ?? null, sharepoint_etag: item.eTag ?? null,
    published_at: new Date().toISOString(), sync_status: "synced",
  };
  const saved = previous?.data
    ? await db.from("v2_people_documents").update(payload).eq("organisation_id", org).eq("id", id).eq("provider", "internal").select("*").single()
    : await db.from("v2_people_documents").insert(payload).select("*").single();
  if (saved.error || !saved.data) {
    // Compensate only this newly uploaded file, guarded by its provider etag.
    // Never touch a pre-existing item or unrelated file.
    if (!existing && item.eTag) {
      try { await scope.graph.deleteTestItem(item.id, item.eTag); } catch {
        await integrationAudit(org, scope.connection.id, authority.actorId, "document_cleanup_required", id, "failed");
      }
    }
    throw new Error("DOCUMENT_METADATA_SAVE_FAILED");
  }
  // Audit failure must not turn a committed upload into a misleading failed
  // upload and encourage duplicate retries. Return the persisted identity.
  try { await integrationAudit(org, scope.connection.id, authority.actorId, "document_uploaded", id); }
  catch { console.error("Document audit unavailable", { code: "DOCUMENT_AUDIT_UNAVAILABLE", documentId: id }); }
  return saved.data as DocumentRecord;
}

export async function getDocumentMetadata(org: string, id: string) {
  const result = await createSupabaseAdmin().from("v2_people_documents").select("*").eq("organisation_id", org).eq("id", id).single();
  if (result.error || !result.data) throw new Error("DOCUMENT_NOT_FOUND");
  return result.data as DocumentRecord;
}

/** Invoke only AFTER the adapter verifies entity/session access. Profile checks
 * are additional to the module's record permission, never a replacement. */
export async function resolveDocumentReadScope(authority: DocumentAuthority, document: DocumentRecord) {
  if (document.organisation_id !== authority.organisationId) throw new Error("DOCUMENT_ACCESS_DENIED");
  if (authority.externalClassification && (authority.actorId !== null || document.document_context !== "onboarding")) throw new Error("DOCUMENT_ACCESS_DENIED");
  if (document.classification === "confidential") throw new Error("DOCUMENT_CONFIDENTIAL_BLOCKED");
  await requireIntegrationEntitlement(authority.organisationId, "sharepoint", true);
  const db = createSupabaseAdmin();
  if (document.document_context === "training") {
    if (!authority.permissions["training.view"] && !authority.permissions["training.approve"]) throw new Error("DOCUMENT_ACCESS_DENIED");
    // Operational evidence access belongs to its canonical Training relations,
    // not to configuration permissions on a mutable destination profile.
    const access = await (await createSupabaseServer()).rpc("tttracker_v2_training_document_access", { p_org: authority.organisationId, p_document: document.id });
    if (access.error || !access.data?.id || document.classification !== "operational") throw new Error("DOCUMENT_ACCESS_DENIED");
  }
  const rule = await db.from("v2_document_destinations").select("access_profile_id").eq("organisation_id", authority.organisationId).eq("id", document.setup_rule_id).single();
  const profile = await db.from("v2_integration_access_profiles").select("*").eq("organisation_id", authority.organisationId).eq("id", rule.data?.access_profile_id ?? "").single();
  if (document.document_context !== "training" && (profile.error || !profile.data || profile.data.classification !== document.classification ||
    (!authority.permissions[profile.data.read_capability] && authority.externalClassification !== document.classification))) throw new Error("DOCUMENT_ACCESS_DENIED");
  const connection = await connectedMicrosoft(authority.organisationId);
  if (connection.status !== "connected") throw new Error("DOCUMENT_SHAREPOINT_UNAVAILABLE");
  const scope = await locationScope(authority.organisationId, document.destination_id);
  if (scope.site.site_id !== document.sharepoint_site_id || scope.location.drive_id !== document.sharepoint_drive_id || !document.sharepoint_item_id) throw new Error("DOCUMENT_ACCESS_DENIED");
  return { scope, connection };
}

export async function downloadDocument(authority: DocumentAuthority, document: DocumentRecord) {
  const { scope, connection } = await resolveDocumentReadScope(authority, document);
  const bytes = await scope.graph.download(document.sharepoint_item_id);
  await integrationAudit(authority.organisationId, connection.id, authority.actorId, "document_previewed", document.id);
  return bytes;
}

export function documentError(error: unknown, operation: "upload" | "preview" = "upload") {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    DOCUMENT_STORAGE_NOT_CONFIGURED: "Document storage is not configured. An organisation administrator needs to configure this document type.",
    DOCUMENT_SETUP_UNAVAILABLE: "Training document storage could not be loaded. Check the saved document setup and try again.",
    DOCUMENT_SHAREPOINT_UNAVAILABLE: "Microsoft 365 needs attention before this document can be uploaded.",
    DOCUMENT_ACCESS_DENIED: "You do not have permission to access this document.",
    DOCUMENT_CONFIDENTIAL_BLOCKED: "Confidential document publication remains blocked by the protected-data policy.",
    DOCUMENT_FILE_INVALID: "Choose a supported file no larger than 10 MB.",
    DOCUMENT_REVISION_POLICY_REQUIRED: "This document setup uses an unsupported replacement policy. Choose Version to preserve document and review history.",
    DOCUMENT_NOT_FOUND: "The document could not be found.",
    INTEGRATION_RESOURCE_NOT_FOUND: "The SharePoint document could not be found. Its metadata has been retained.",
    INTEGRATION_SETUP_REQUIRED: "Microsoft 365 is not ready for document uploads. Check the organisation's SharePoint connection status.",
    INTEGRATION_AUTH_FAILED: "The Microsoft 365 connection needs attention before this document can be uploaded.",
    INTEGRATION_RECONNECT_REQUIRED: "The Microsoft 365 connection needs attention before this document can be uploaded.",
    INTEGRATION_RUNTIME_PERMISSIONS_UNSAFE: "The Microsoft 365 connection is not configured for the required SharePoint access.",
    INTEGRATION_SITE_PERMISSION_REQUIRED: "TTTracker does not currently have access to the configured SharePoint site.",
    INTEGRATION_LIBRARY_UNAVAILABLE: "The configured document library could not be found. Choose an available Document Destination.",
    INTEGRATION_TENANT_NOT_CONNECTED: "Connect your organisation's Microsoft 365 account before uploading Training evidence.",
    INTEGRATION_PROVIDER_UNAVAILABLE: "SharePoint temporarily could not accept the upload. Try again.",
    INTEGRATION_RATE_LIMITED: "SharePoint is temporarily busy. Wait a moment, then retry the upload.",
    INTEGRATION_SCOPE_INVALID: "The configured SharePoint destination could not be verified. Check the selected site and document library.",
    INTEGRATION_PATH_INVALID: "The Training folder structure contains a name SharePoint cannot use. Update the document setup and retry.",
    INTEGRATION_FILE_INVALID: "The Training evidence file could not be uploaded. Choose a supported file and try again.",
    INTEGRATION_CONFLICT: "A different file already exists for this upload. Select the original file to retry or start a new submission.",
    DOCUMENT_PROVIDER_RESPONSE_INVALID: "SharePoint did not confirm that the document was saved. Retry the upload.",
    DOCUMENT_DESTINATION_UNAVAILABLE: "The configured document library could not be found. Choose an available Document Destination.",
    DOCUMENT_METADATA_SAVE_FAILED: "The document could not be recorded. The upload was not completed; try again.",
    INTEGRATION_TOKEN_VALUE_MISSING: "This record is missing a field required by its document folder setup.",
    INTEGRATION_EMPLOYEE_NUMBER_MISSING: "People document setup uses Employee Number in its folder or file name, but this person does not have an Employee Number.",
    INTEGRATION_TRAINING_TYPE_MISSING: "Training document setup uses Training Type in its folder or file name, but the Training Type could not be resolved.",
    INTEGRATION_PERSON_NAME_MISSING: "People document setup uses Employee Name in its folder or file name, but the person's name could not be resolved.",
    INTEGRATION_NOT_ENTITLED: "SharePoint document storage is not available for this organisation.",
  };
  const message = messages[code] ?? (operation === "preview" ? "The document could not be opened. Check the Microsoft 365 connection and try again." : "The document could not be uploaded to SharePoint. Try again.");
  const safeCode = /^(DOCUMENT_|INTEGRATION_)[A-Z_]+$/.test(code) ? code : "DOCUMENT_UPLOAD_FAILED";
  return { code: safeCode, error: message, message };
}
