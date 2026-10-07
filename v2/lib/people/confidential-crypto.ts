import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type ConfidentialContext = {
  organisation_id: string;
  person_id: string | null;
  instance_id: string | null;
  field_id: string;
  record_id: string;
  revision: number;
  key_version: number;
  semantic_type: string;
  kind: "value" | "document";
  crypto_format_version?: 2;
  kms_key_reference?: string;
  environment?: string;
};
export type EncryptedPayload = {
  ciphertext: string;
  nonce: string;
  tag: string;
};

function associatedData(context: ConfidentialContext): Buffer {
  if (
    !context.organisation_id ||
    !context.record_id ||
    !context.field_id ||
    !Number.isSafeInteger(context.revision) ||
    context.revision < 1 ||
    !Number.isSafeInteger(context.key_version) ||
    context.key_version < 1 ||
    (!context.person_id && !context.instance_id)
  )
    throw new Error("CONFIDENTIAL_CONTEXT_INVALID");
  // Fixed order and domain separation prevent ciphertext substitution across owners/types/versions.
  return Buffer.from(
    JSON.stringify([
      context.crypto_format_version === 2
        ? "tttracker.people.confidential.aes256gcm.v2"
        : "tttracker.people.confidential.aes256gcm.v1",
      context.organisation_id,
      context.person_id,
      context.instance_id,
      context.field_id,
      context.record_id,
      context.revision,
      context.key_version,
      context.semantic_type,
      context.kind,
      ...(context.crypto_format_version === 2
        ? [context.kms_key_reference, context.environment]
        : []),
    ]),
    "utf8",
  );
}
function keyBuffer(hex: string | Buffer): Buffer {
  if (Buffer.isBuffer(hex)) {
    if (hex.length !== 32) throw new Error("CONFIDENTIAL_KEY_UNAVAILABLE");
    return Buffer.from(hex);
  }
  if (!/^[a-f0-9]{64}$/.test(hex))
    throw new Error("CONFIDENTIAL_KEY_UNAVAILABLE");
  return Buffer.from(hex, "hex");
}
function decoded(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value))
    throw new Error("CONFIDENTIAL_INTEGRITY_FAILED");
  const buffer = Buffer.from(value, "base64");
  if (buffer.toString("base64") !== value)
    throw new Error("CONFIDENTIAL_INTEGRITY_FAILED");
  return buffer;
}
export function encryptConfidential(
  bytes: Buffer,
  keyHex: string | Buffer,
  context: ConfidentialContext,
): EncryptedPayload {
  const key = keyBuffer(keyHex);
  try {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, nonce, {
      authTagLength: 16,
    });
    cipher.setAAD(associatedData(context));
    return {
      ciphertext: Buffer.concat([
        cipher.update(bytes),
        cipher.final(),
      ]).toString("base64"),
      nonce: nonce.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
    };
  } finally {
    key.fill(0);
  }
}
export function decryptConfidential(
  payload: EncryptedPayload,
  keyHex: string | Buffer,
  context: ConfidentialContext,
): Buffer {
  const key = keyBuffer(keyHex);
  try {
    const nonce = decoded(payload.nonce),
      tag = decoded(payload.tag),
      ciphertext = decoded(payload.ciphertext);
    if (nonce.length !== 12 || tag.length !== 16)
      throw new Error("CONFIDENTIAL_INTEGRITY_FAILED");
    const decipher = createDecipheriv("aes-256-gcm", key, nonce, {
      authTagLength: 16,
    });
    decipher.setAAD(associatedData(context));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error("CONFIDENTIAL_INTEGRITY_FAILED");
  } finally {
    key.fill(0);
  }
}

export function encodeConfidentialDocument(
  name: string,
  contentType: string,
  bytes: Buffer,
): Buffer {
  if (
    bytes.length < 1 ||
    bytes.length > 10 * 1024 * 1024 ||
    name.length > 200 ||
    !["application/pdf", "image/png", "image/jpeg"].includes(contentType)
  )
    throw new Error("CONFIDENTIAL_DOCUMENT_INVALID");
  const valid =
    contentType === "application/pdf"
      ? bytes.subarray(0, 5).toString() === "%PDF-"
      : contentType === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!valid) throw new Error("CONFIDENTIAL_DOCUMENT_INVALID");
  const metadata = Buffer.from(JSON.stringify({ name, contentType }));
  const size = Buffer.alloc(4);
  size.writeUInt32BE(metadata.length);
  return Buffer.concat([size, metadata, bytes]);
}
export function decodeConfidentialDocument(bytes: Buffer): {
  name: string;
  contentType: string;
  bytes: Buffer;
} {
  if (bytes.length < 5) throw new Error("CONFIDENTIAL_INTEGRITY_FAILED");
  const size = bytes.readUInt32BE();
  if (size > 1024 || size + 4 >= bytes.length)
    throw new Error("CONFIDENTIAL_INTEGRITY_FAILED");
  try {
    const metadata: { name?: unknown; contentType?: unknown } = JSON.parse(
      bytes.subarray(4, size + 4).toString(),
    );
    if (
      typeof metadata.name !== "string" ||
      typeof metadata.contentType !== "string"
    )
      throw new Error();
    const file = bytes.subarray(size + 4);
    encodeConfidentialDocument(metadata.name, metadata.contentType, file);
    return {
      name: metadata.name,
      contentType: metadata.contentType,
      bytes: file,
    };
  } catch {
    throw new Error("CONFIDENTIAL_INTEGRITY_FAILED");
  }
}
