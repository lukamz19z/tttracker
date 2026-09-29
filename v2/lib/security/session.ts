import "server-only";

import { createSupabaseServer } from "@/lib/supabase/server";

export type AuthSessionIdentity = {
  userId: string;
  email: string;
  sessionId: string;
};

export async function requireAuthSessionIdentity(): Promise<AuthSessionIdentity> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getClaims();

  const userId =
    typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  const email =
    typeof data?.claims?.email === "string"
      ? data.claims.email.trim().toLowerCase()
      : null;
  const sessionId =
    typeof data?.claims?.session_id === "string"
      ? data.claims.session_id
      : typeof data?.claims?.sid === "string"
        ? data.claims.sid
        : null;

  if (error || !userId || !email || !sessionId) {
    throw new Error("UNAUTHENTICATED");
  }

  return { userId, email, sessionId };
}
