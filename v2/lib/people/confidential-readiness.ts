import "server-only";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { confidentialKmsConfig } from "./confidential-kms-config";
import {
  requireConfidentialWorkload,
  describeConfidentialKmsKey,
  generateConfidentialDataKey,
  decryptConfidentialDataKey,
} from "./confidential-kms";
import {
  encryptConfidential,
  decryptConfidential,
  type ConfidentialContext,
} from "./confidential-crypto";

export type ConfidentialReadiness = {
  ready: boolean;
  cryptoReady: boolean;
  reason: string;
};
const cache = new Map<
  string,
  { until: number; result: Promise<ConfidentialReadiness> }
>();
// Server-only health helper. A caller must authenticate/authorise BEFORE invoking it.
// Probe permits an infrastructure self-test while collection stays disabled.
export async function getConfidentialReadiness(
  probe = false,
): Promise<ConfidentialReadiness> {
  try {
    const config = confidentialKmsConfig();
    if (!probe && config.collectionMode === "disabled")
      return {
        ready: false,
        cryptoReady: false,
        reason: "CONFIDENTIAL_COLLECTION_DISABLED",
      };
    // Recheck the request workload even when the expensive self-test is cached.
    await requireConfidentialWorkload(config);
    const id = JSON.stringify(config),
      existing = cache.get(id);
    if (existing && existing.until > Date.now()) return existing.result;
    const result = (async (): Promise<ConfidentialReadiness> => {
      const { data, error } = await createSupabaseAdmin().rpc(
        "tttracker_v2_confidential_schema",
      );
      if (
        error ||
        data?.crypto_format_version !== 2 ||
        data?.legacy_versions !== 0 ||
        data?.browser_key_release !== false
      )
        throw new Error("CONFIDENTIAL_SCHEMA_UNAVAILABLE");
      await describeConfidentialKmsKey(config);
      const context: ConfidentialContext = {
        organisation_id: randomUUID(),
        person_id: null,
        instance_id: randomUUID(),
        field_id: randomUUID(),
        record_id: randomUUID(),
        revision: 1,
        key_version: 1,
        semantic_type: "self_test",
        kind: "value",
        crypto_format_version: 2,
        kms_key_reference: config.keyArn,
        environment: config.environment,
      };
      const synthetic = randomBytes(32),
        generated = await generateConfidentialDataKey(context, config);
      let unwrapped: Buffer | undefined, decrypted: Buffer | undefined;
      try {
        const payload = encryptConfidential(
          synthetic,
          generated.plaintextKey,
          context,
        );
        generated.plaintextKey.fill(0);
        unwrapped = await decryptConfidentialDataKey(
          generated.envelope,
          context,
          config,
        );
        decrypted = decryptConfidential(payload, unwrapped, context);
        if (!timingSafeEqual(synthetic, decrypted))
          throw new Error("CONFIDENTIAL_DATA_INTEGRITY_FAILED");
      } finally {
        synthetic.fill(0);
        generated.plaintextKey.fill(0);
        unwrapped?.fill(0);
        decrypted?.fill(0);
      }
      return {
        ready: config.collectionMode === "synthetic",
        cryptoReady: true,
        reason:
          config.collectionMode === "synthetic"
            ? "READY_FOR_SYNTHETIC_VERIFICATION"
            : "CONFIDENTIAL_COLLECTION_DISABLED",
      };
    })().catch(() => ({
      ready: false,
      cryptoReady: false,
      reason: "CONFIDENTIAL_KEY_SERVICE_UNAVAILABLE",
    }));
    cache.set(id, { until: Date.now() + 300000, result });
    // No plaintext keys or OIDC/STS credentials are cached here.
    const resolved = await result;
    if (!resolved.cryptoReady) cache.delete(id);
    return resolved;
  } catch {
    return {
      ready: false,
      cryptoReady: false,
      reason: "CONFIDENTIAL_KEY_SERVICE_UNAVAILABLE",
    };
  }
}
export async function requireConfidentialReadiness() {
  const status = await getConfidentialReadiness();
  if (!status.ready) throw new Error(status.reason);
}
