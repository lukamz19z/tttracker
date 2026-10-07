import "server-only";
import {
  KMSClient,
  GenerateDataKeyCommand,
  DecryptCommand,
  DescribeKeyCommand,
} from "@aws-sdk/client-kms";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { getVercelOidcToken, verifyVercelOidcToken } from "@vercel/oidc";
import {
  confidentialKmsConfig,
  type ConfidentialKmsConfig,
} from "./confidential-kms-config";
import type { ConfidentialContext } from "./confidential-crypto";

export type ConfidentialEnvelope = {
  encrypted_dek: string;
  kms_key_reference: string;
  crypto_format_version: 2;
  environment: string;
};
function fail(error: unknown): never {
  const name =
    error && typeof error === "object" && "name" in error ? error.name : "";
  if (name === "AccessDeniedException")
    throw new Error("CONFIDENTIAL_ACCESS_DENIED");
  if (
    ["InvalidCiphertextException", "IncorrectKeyException"].includes(
      String(name),
    )
  )
    throw new Error("CONFIDENTIAL_DATA_INTEGRITY_FAILED");
  throw new Error("CONFIDENTIAL_KEY_SERVICE_UNAVAILABLE");
}
export async function requireConfidentialWorkload(
  config: ConfidentialKmsConfig,
) {
  try {
    const token = await getVercelOidcToken();
    const verified = await verifyVercelOidcToken(token, {
      issuer: `https://oidc.vercel.com/${config.team}`,
      audience: `https://vercel.com/${config.team}`,
      ownerId: config.ownerId,
      projectId: config.projectId,
      environment: config.environment,
      algorithms: ["RS256"],
      subject: `owner:${config.team}:project:${config.project}:environment:${config.environment}`,
    });
    if (!verified.payload.exp || verified.payload.exp * 1000 <= Date.now())
      throw new Error();
  } catch {
    throw new Error("CONFIDENTIAL_KEY_SERVICE_UNAVAILABLE");
  }
}
export function confidentialEncryptionContext(
  context: ConfidentialContext,
  config: ConfidentialKmsConfig,
): Record<string, string> {
  if (
    context.crypto_format_version !== 2 ||
    context.environment !== config.environment ||
    !context.kms_key_reference ||
    !config.readKeyArns.includes(context.kms_key_reference)
  )
    throw new Error("CONFIDENTIAL_DATA_INTEGRITY_FAILED");
  // Public identifiers only: AWS logs EncryptionContext in CloudTrail.
  return {
    purpose: "tttracker.people.confidential",
    environment: config.environment,
    organisation_id: context.organisation_id,
    person_id: context.person_id ?? "none",
    instance_id: context.instance_id ?? "none",
    field_id: context.field_id,
    record_id: context.record_id,
    revision: String(context.revision),
    key_version: String(context.key_version),
    semantic_type: context.semantic_type,
    kind: context.kind,
    crypto_format_version: "2",
  };
}
function client(config: ConfidentialKmsConfig) {
  // Explicit OIDC provider: never fall back to environment/static AWS credentials.
  return new KMSClient({
    region: config.region,
    maxAttempts: 2,
    credentials: awsCredentialsProvider({
      roleArn: config.roleArn,
      durationSeconds: 900,
      roleSessionName: "tttracker-confidential",
      clientConfig: { region: config.region },
    }),
  });
}
export async function describeConfidentialKmsKey(
  config = confidentialKmsConfig(),
) {
  await requireConfidentialWorkload(config);
  const kms = client(config);
  try {
    const result = await kms.send(
      new DescribeKeyCommand({ KeyId: config.keyArn }),
    );
    if (
      result.KeyMetadata?.Arn !== config.keyArn ||
      result.KeyMetadata.KeyState !== "Enabled" ||
      result.KeyMetadata.KeyUsage !== "ENCRYPT_DECRYPT" ||
      result.KeyMetadata.KeySpec !== "SYMMETRIC_DEFAULT"
    )
      throw new Error();
  } catch (error) {
    fail(error);
  } finally {
    kms.destroy();
  }
}
export async function generateConfidentialDataKey(
  context: ConfidentialContext,
  config = confidentialKmsConfig(),
) {
  const encryptionContext = confidentialEncryptionContext(context, config);
  if (context.kms_key_reference !== config.keyArn)
    throw new Error("CONFIDENTIAL_DATA_INTEGRITY_FAILED");
  await requireConfidentialWorkload(config);
  const kms = client(config);
  try {
    const result = await kms.send(
      new GenerateDataKeyCommand({
        KeyId: config.keyArn,
        KeySpec: "AES_256",
        EncryptionContext: encryptionContext,
      }),
    );
    try {
      if (
        result.KeyId !== config.keyArn ||
        result.Plaintext?.length !== 32 ||
        !result.CiphertextBlob?.length ||
        result.CiphertextBlob.length > 6144
      )
        throw new Error();
      return {
        plaintextKey: Buffer.from(result.Plaintext),
        envelope: {
          encrypted_dek: Buffer.from(result.CiphertextBlob).toString("base64"),
          kms_key_reference: config.keyArn,
          crypto_format_version: 2 as const,
          environment: config.environment,
        },
      };
    } finally {
      result.Plaintext?.fill(0);
    }
  } catch (error) {
    fail(error);
  } finally {
    kms.destroy();
  }
}
export async function decryptConfidentialDataKey(
  envelope: ConfidentialEnvelope,
  context: ConfidentialContext,
  config = confidentialKmsConfig(),
) {
  const encryptionContext = confidentialEncryptionContext(context, config);
  if (
    envelope.crypto_format_version !== 2 ||
    envelope.environment !== config.environment ||
    envelope.kms_key_reference !== context.kms_key_reference ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.encrypted_dek)
  )
    throw new Error("CONFIDENTIAL_DATA_INTEGRITY_FAILED");
  const blob = Buffer.from(envelope.encrypted_dek, "base64");
  if (
    blob.length > 6144 ||
    blob.length < 32 ||
    blob.toString("base64") !== envelope.encrypted_dek
  )
    throw new Error("CONFIDENTIAL_DATA_INTEGRITY_FAILED");
  await requireConfidentialWorkload(config);
  const kms = client(config);
  try {
    const result = await kms.send(
      new DecryptCommand({
        KeyId: envelope.kms_key_reference,
        CiphertextBlob: blob,
        EncryptionContext: encryptionContext,
        EncryptionAlgorithm: "SYMMETRIC_DEFAULT",
      }),
    );
    try {
      if (
        result.KeyId !== envelope.kms_key_reference ||
        result.Plaintext?.length !== 32
      )
        throw new Error();
      return Buffer.from(result.Plaintext);
    } finally {
      result.Plaintext?.fill(0);
    }
  } catch (error) {
    fail(error);
  } finally {
    kms.destroy();
  }
}
