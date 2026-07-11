import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

function getServerConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  }

  if (!supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
    serviceRoleKey,
  };
}

export function createSupabaseAdmin() {
  const { supabaseUrl, serviceRoleKey } = getServerConfig();

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function requireWebsiteAdmin(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Missing authentication token.");
  }

  const token = authorization.slice("Bearer ".length);

  const {
    supabaseUrl,
    supabaseAnonKey,
  } = getServerConfig();

  const supabaseAuth = createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const {
    data: { user },
    error: userError,
  } = await supabaseAuth.auth.getUser(token);

  if (userError || !user) {
    throw new Error("Invalid or expired session.");
  }

  const supabaseAdmin = createSupabaseAdmin();

  const { data: roleRow, error: roleError } =
    await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

  if (roleError) {
    throw roleError;
  }

  if (roleRow?.role !== "admin") {
    throw new Error("Administrator access required.");
  }

  return user;
}