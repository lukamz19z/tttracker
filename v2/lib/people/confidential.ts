import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getSecurityStatus } from "@/lib/security/status";
import { confidentialKmsConfig } from "./confidential-kms-config";
import {
  generateConfidentialDataKey,
  decryptConfidentialDataKey,
  type ConfidentialEnvelope,
} from "./confidential-kms";
import { requireConfidentialReadiness } from "./confidential-readiness";
import {
  encryptConfidential,
  decryptConfidential,
  encodeConfidentialDocument,
  decodeConfidentialDocument,
  type ConfidentialContext,
  type EncryptedPayload,
} from "./confidential-crypto";

export type ConfidentialOwner = {
  organisationId: string;
  personId?: string;
  instanceId?: string;
  fieldId: string;
  recordId: string;
};
export type ConfidentialPurpose =
  | "person_review"
  | "onboarding_review"
  | "payroll_review"
  | "document_review"
  | "key_rotation";
type Released = {
  context: ConfidentialContext;
  payload:
    | (EncryptedPayload &
        ConfidentialEnvelope & { object_key: string | null; provider: string })
    | null;
};
const bucket = "v2-people-confidential";
export const secureToken = () => randomBytes(32).toString("base64url");
export function tokenHash(token: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new Error("ONBOARDING_LINK_INVALID");
  return createHash("sha256").update(token).digest("hex");
}
function safeFailure(error: { message: string } | null) {
  if (!error) return;
  const allowed = [
    "PEOPLE_PERMISSION_DENIED",
    "CONFIDENTIAL_ACCESS_DENIED",
    "CONFIDENTIAL_FIELD_INVALID",
    "CONFIDENTIAL_KEY_UNAVAILABLE",
    "CONFIDENTIAL_KEY_BOUNDARY_UNAVAILABLE",
    "CONFIDENTIAL_CONCURRENT_UPDATE",
    "CONFIDENTIAL_PAYLOAD_INVALID",
    "ONBOARDING_LINK_INVALID",
    "ONBOARDING_LINK_EXPIRED",
    "ONBOARDING_LINK_REVOKED",
    "ONBOARDING_LINK_USED",
    "ONBOARDING_SESSION_INVALID",
    "ONBOARDING_INVALID_REQUEST",
  ];
  throw new Error(
    allowed.includes(error.message)
      ? error.message
      : "CONFIDENTIAL_UNAVAILABLE",
  );
}
async function internalSession() {
  const session = await createSupabaseServer();
  if (!(await getSecurityStatus(session)).complete)
    throw new Error("SECURITY_CHECK_REQUIRED");
  return session;
}
async function internalTicket(
  owner: ConfidentialOwner,
  action: "read" | "write",
  purpose: ConfidentialPurpose,
  expectedRevision?: number,
) {
  const session = await internalSession();
  const hash = tokenHash(secureToken());
  const { error } = await session.rpc("tttracker_v2_confidential_ticket", {
    p_org: owner.organisationId,
    p_action: action,
    p_ticket_hash: hash,
    p_record: owner.recordId,
    p_person: owner.personId ?? null,
    p_instance: owner.instanceId ?? null,
    p_field: owner.fieldId,
    p_purpose: purpose,
    p_expected_revision: expectedRevision ?? null,
  });
  safeFailure(error);
  return hash;
}
async function redeem(hash: string): Promise<Released> {
  const { data, error } = await createSupabaseAdmin().rpc(
    "tttracker_v2_confidential_redeem",
    { p_ticket_hash: hash },
  );
  safeFailure(error);
  if (!data?.context || data.context.crypto_format_version !== 2)
    throw new Error("CONFIDENTIAL_KEY_UNAVAILABLE");
  return data as Released;
}
async function persist(
  hash: string,
  plaintext: Buffer,
  kind: "value" | "document",
) {
  const released = await redeem(hash);

  let object: string | undefined;
  let cleanupObject = true;
  const admin = createSupabaseAdmin();
  let plaintextKey: Buffer | undefined;
  try {
    if (released.context.kind !== kind)
      throw new Error("CONFIDENTIAL_FIELD_INVALID");
    await requireConfidentialReadiness();
    const generated = await generateConfidentialDataKey(released.context);
    plaintextKey = generated.plaintextKey;
    const encrypted = encryptConfidential(
      plaintext,
      plaintextKey,
      released.context,
    );
    plaintextKey.fill(0);
    if (kind === "document") {
      object = `${released.context.organisation_id}/${released.context.record_id}/${released.context.revision}/${hash}.bin`;
      const uploaded = await admin.storage
        .from(bucket)
        .upload(object, Buffer.from(encrypted.ciphertext, "base64"), {
          contentType: "application/octet-stream",
          upsert: false,
        });
      if (uploaded.error) throw new Error("CONFIDENTIAL_DOCUMENT_UNAVAILABLE");
    }
    cleanupObject = false; // Ambiguous transport failure must not delete a potentially committed document.
    const { data, error } = await admin.rpc(
      "tttracker_v2_confidential_commit_envelope",
      {
        p_ticket_hash: hash,
        p_nonce: encrypted.nonce,
        p_tag: encrypted.tag,
        p_ciphertext: kind === "value" ? encrypted.ciphertext : null,
        p_object_key: object ?? null,
        p_encrypted_dek: generated.envelope.encrypted_dek,
        p_kms_key_reference: generated.envelope.kms_key_reference,
        p_environment: generated.envelope.environment,
        p_crypto_format_version: generated.envelope.crypto_format_version,
      },
    );
    if (error && /^[0-9A-Z]{5}$/.test(error.code)) cleanupObject = true;
    safeFailure(error);
    if (!data?.record_id) throw new Error("CONFIDENTIAL_UNAVAILABLE");
    object = undefined;
    return data as { record_id: string; revision: number; key_version: number };
  } catch (error) {
    await auditOutcome(hash, "failed").catch(() => {});
    throw error;
  } finally {
    plaintextKey?.fill(0);
    plaintext.fill(0);
    if (object && cleanupObject)
      await admin.storage.from(bucket).remove([object]);
  }
}
export async function writeConfidentialValue(
  owner: ConfidentialOwner,
  value: string,
  purpose: ConfidentialPurpose,
) {
  const plaintext = Buffer.from(value, "utf8");
  if (!plaintext.length || plaintext.length > 65536) {
    plaintext.fill(0);
    throw new Error("CONFIDENTIAL_PAYLOAD_INVALID");
  }
  try {
    return await persist(
      await internalTicket(owner, "write", purpose),
      plaintext,
      "value",
    );
  } finally {
    plaintext.fill(0);
  }
}
async function auditOutcome(hash: string, outcome: "success" | "failed") {
  const { error } = await createSupabaseAdmin().rpc(
    "tttracker_v2_confidential_result",
    { p_ticket_hash: hash, p_outcome: outcome },
  );
  safeFailure(error);
}
async function readValueVersion(
  owner: ConfidentialOwner,
  purpose: ConfidentialPurpose,
) {
  const hash = await internalTicket(owner, "read", purpose);
  const released = await redeem(hash);
  let key: Buffer | undefined, bytes: Buffer | undefined;
  try {
    if (released.context.kind !== "value" || !released.payload?.ciphertext)
      throw new Error("CONFIDENTIAL_FIELD_INVALID");
    await requireConfidentialReadiness();
    key = await decryptConfidentialDataKey(released.payload, released.context);
    bytes = decryptConfidential(released.payload, key, released.context);
    await auditOutcome(hash, "success");
    return {
      value: bytes.toString("utf8"),
      revision: released.context.revision,
    };
  } catch (error) {
    await auditOutcome(hash, "failed").catch(() => {});
    throw error;
  } finally {
    key?.fill(0);
    bytes?.fill(0);
  }
}
export async function readConfidentialValue(
  owner: ConfidentialOwner,
  purpose: ConfidentialPurpose,
): Promise<string> {
  return (await readValueVersion(owner, purpose)).value;
}
export async function writeConfidentialDocument(
  owner: ConfidentialOwner,
  file: { name: string; contentType: string; bytes: Buffer },
  purpose: ConfidentialPurpose,
) {
  const encoded = encodeConfidentialDocument(
    file.name,
    file.contentType,
    file.bytes,
  );
  try {
    return await persist(
      await internalTicket(owner, "write", purpose),
      encoded,
      "document",
    );
  } finally {
    encoded.fill(0);
  }
}
async function downloadEncryptedDocument(object: string): Promise<Buffer> {
  try {
    const { data, error } = await createSupabaseAdmin()
      .storage.from(bucket)
      .createSignedUrl(object, 30);
    if (error || !data?.signedUrl)
      throw new Error("CONFIDENTIAL_DOCUMENT_UNAVAILABLE");
    const expected = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (
      !expected ||
      new URL(data.signedUrl).origin !== new URL(expected).origin
    )
      throw new Error("CONFIDENTIAL_DOCUMENT_UNAVAILABLE");
    const response = await fetch(data.signedUrl, {
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok || !response.body)
      throw new Error("CONFIDENTIAL_DOCUMENT_UNAVAILABLE");
    const reader = response.body.getReader(),
      chunks: Buffer[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 10 * 1024 * 1024 + 1024) {
          await reader.cancel();
          throw new Error("CONFIDENTIAL_DOCUMENT_INVALID");
        }
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks);
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "CONFIDENTIAL_DOCUMENT_INVALID"
    )
      throw error;
    throw new Error("CONFIDENTIAL_DOCUMENT_UNAVAILABLE");
  }
}
export async function readConfidentialDocument(
  owner: ConfidentialOwner,
  purpose: ConfidentialPurpose,
) {
  const hash = await internalTicket(owner, "read", purpose);
  const released = await redeem(hash);
  let key: Buffer | undefined, decrypted: Buffer | undefined;
  try {
    if (
      released.context.kind !== "document" ||
      !released.payload?.object_key ||
      released.payload.provider !== "internal"
    )
      throw new Error("CONFIDENTIAL_FIELD_INVALID");
    await requireConfidentialReadiness();
    const encrypted = await downloadEncryptedDocument(
      released.payload.object_key,
    );
    key = await decryptConfidentialDataKey(released.payload, released.context);
    decrypted = decryptConfidential(
      { ...released.payload, ciphertext: encrypted.toString("base64") },
      key,
      released.context,
    );
    const file = decodeConfidentialDocument(decrypted);
    await auditOutcome(hash, "success");
    return {
      ...file,
      bytes: Buffer.from(file.bytes),
      revision: released.context.revision,
    };
  } catch (error) {
    await auditOutcome(hash, "failed").catch(() => {});
    throw error;
  } finally {
    key?.fill(0);
    decrypted?.fill(0);
  }
}
export async function rotateConfidentialKey(
  organisationId: string,
): Promise<number> {
  const session = await internalSession();
  // Authorise key management before readiness performs any KMS operation.
  const authority = await session.rpc("tttracker_v2_secure_configuration", {
    p_org: organisationId,
    p_action: "key_authority",
    p_data: {},
  });
  safeFailure(authority.error);
  await requireConfidentialReadiness();
  const config = confidentialKmsConfig();
  const { data, error } = await session.rpc(
    "tttracker_v2_secure_configuration",
    {
      p_org: organisationId,
      p_action: "rotate_kms_generation",
      p_data: {
        kms_key_reference: config.keyArn,
        environment: config.environment,
      },
    },
  );
  safeFailure(error);
  if (!Number.isSafeInteger(data?.version))
    throw new Error("CONFIDENTIAL_KEY_SERVICE_UNAVAILABLE");
  return data.version;
}
export async function reencryptConfidentialValue(owner: ConfidentialOwner) {
  const { value, revision } = await readValueVersion(owner, "key_rotation");
  const bytes = Buffer.from(value, "utf8");
  try {
    return await persist(
      await internalTicket(owner, "write", "key_rotation", revision),
      bytes,
      "value",
    );
  } finally {
    bytes.fill(0);
  }
}
export async function reencryptConfidentialDocument(owner: ConfidentialOwner) {
  const file = await readConfidentialDocument(owner, "key_rotation");
  try {
    return await persist(
      await internalTicket(owner, "write", "key_rotation", file.revision),
      encodeConfidentialDocument(file.name, file.contentType, file.bytes),
      "document",
    );
  } finally {
    file.bytes.fill(0);
  }
}
export async function createSecureField(
  organisationId: string,
  field: { semanticType: string; label: string; kind: "value" | "document" },
) {
  const session = await internalSession();
  const { data, error } = await session.rpc(
    "tttracker_v2_secure_configuration",
    {
      p_org: organisationId,
      p_action: "field",
      p_data: {
        semantic_type: field.semanticType,
        label: field.label,
        kind: field.kind,
        classification: "confidential",
      },
    },
  );
  safeFailure(error);
  return data as { id: string };
}
export async function createSecureOnboarding(
  organisationId: string,
  fieldIds: string[],
  expiresAt: string,
  personId?: string,
) {
  const token = secureToken();
  const session = await internalSession();
  const { data, error } = await session.rpc(
    "tttracker_v2_secure_configuration",
    {
      p_org: organisationId,
      p_action: "instance",
      p_data: {
        field_ids: fieldIds,
        expires_at: expiresAt,
        person_id: personId ?? null,
        token_hash: tokenHash(token),
      },
    },
  );
  safeFailure(error);
  return { instanceId: String(data.id), token };
}
export async function exchangeSecureOnboardingToken(token: string) {
  const sessionToken = secureToken();
  const { data, error } = await createSupabaseAdmin().rpc(
    "tttracker_v2_onboarding_exchange",
    { p_token_hash: tokenHash(token), p_session_hash: tokenHash(sessionToken) },
  );
  safeFailure(error);
  return {
    instanceId: String(data.instance_id),
    sessionToken,
    expiresAt: String(data.expires_at),
  };
}
export async function revokeSecureOnboarding(
  organisationId: string,
  instanceId: string,
) {
  const session = await internalSession();
  const { error } = await session.rpc("tttracker_v2_secure_configuration", {
    p_org: organisationId,
    p_action: "revoke",
    p_data: { instance_id: instanceId },
  });
  safeFailure(error);
}
async function externalTicket(
  sessionToken: string,
  instanceId: string,
  fieldId: string,
  recordId: string,
) {
  const hash = tokenHash(secureToken());
  const { error } = await createSupabaseAdmin().rpc(
    "tttracker_v2_external_confidential_ticket",
    {
      p_session_hash: tokenHash(sessionToken),
      p_instance: instanceId,
      p_field: fieldId,
      p_record: recordId,
      p_ticket_hash: hash,
    },
  );
  safeFailure(error);
  return hash;
}
export async function writeExternalConfidentialValue(
  sessionToken: string,
  instanceId: string,
  fieldId: string,
  value: string,
  recordId = randomUUID(),
) {
  const plaintext = Buffer.from(value, "utf8");
  if (!plaintext.length || plaintext.length > 65536) {
    plaintext.fill(0);
    throw new Error("CONFIDENTIAL_PAYLOAD_INVALID");
  }
  try {
    return await persist(
      await externalTicket(sessionToken, instanceId, fieldId, recordId),
      plaintext,
      "value",
    );
  } finally {
    plaintext.fill(0);
  }
}
export async function writeExternalConfidentialDocument(
  sessionToken: string,
  instanceId: string,
  fieldId: string,
  file: { name: string; contentType: string; bytes: Buffer },
  recordId = randomUUID(),
) {
  const plaintext = encodeConfidentialDocument(
    file.name,
    file.contentType,
    file.bytes,
  );
  try {
    return await persist(
      await externalTicket(sessionToken, instanceId, fieldId, recordId),
      plaintext,
      "document",
    );
  } finally {
    plaintext.fill(0);
  }
}
