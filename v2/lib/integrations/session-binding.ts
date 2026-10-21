import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function integrationSessionHash(actor: string) {
  const session = await createSupabaseServer();
  const { data, error } = await session.auth.getClaims();
  const claims = data?.claims;
  if (error || claims?.sub !== actor || typeof claims.session_id !== "string" || !/^[a-f0-9-]{36}$/i.test(claims.session_id)) throw new Error("INTEGRATION_SESSION_INVALID");
  // Supabase verifies these claims. Only the scoped session digest is persisted;
  // no authentication JWT or browser session cookie is stored in integration state.
  return createHash("sha256").update(`sharepoint-setup:${actor}:${claims.session_id}`).digest("hex");
}
