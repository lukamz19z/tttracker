import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireIntegrationEntitlement } from "@/lib/integrations/entitlements";
/** Historical reads/migration only. The caller first authorises the DB reference.
 * This helper never writes or deletes a source. */
export async function readLegacyDocument(org: string, key: string) {
  if (!key.startsWith(`${org}/`) || key.includes("..")) throw new Error("DOCUMENT_ACCESS_DENIED");
  await requireIntegrationEntitlement(org, "sharepoint");
  const result = await createSupabaseAdmin().storage.from("v2-people-evidence").download(key);
  if (result.error || !result.data || result.data.size > 10485760) throw new Error("DOCUMENT_NOT_FOUND");
  return new Uint8Array(await result.data.arrayBuffer());
}
