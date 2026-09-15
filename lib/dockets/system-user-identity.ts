import type { SupabaseClient, User } from "@supabase/supabase-js";

export type SystemUserIdentity = {
  userId: string;
  name: string;
  email: string;
  display: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function cleanEmail(value: unknown) {
  return clean(value).toLowerCase();
}

function usableName(value: unknown, email: string) {
  const raw = clean(value);
  if (!raw) return "";

  const withoutEmail = raw
    .split(/\s+/)
    .filter((part) => part.toLowerCase() !== email)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!withoutEmail) return "";
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(withoutEmail)) return "";

  return withoutEmail;
}

/**
 * Resolves one internal TTTracker user to a canonical sign-off identity.
 *
 * Name priority:
 *  1. employees.full_name
 *  2. auth user_metadata.full_name
 *  3. auth user_metadata.name
 *
 * Email always comes from the authenticated Supabase user.
 *
 * We deliberately reject a missing name/email rather than inventing a label,
 * because approval/sign-off records must identify a real TTTracker account.
 */
export async function resolveSystemUserIdentity(
  client: SupabaseClient,
  user: User,
): Promise<SystemUserIdentity> {
  const email = cleanEmail(user.email);

  if (!email) {
    throw new Error(
      "Your TTTracker account does not have an email address. Update the user account before signing.",
    );
  }

  let employeeFullName = "";

  const { data: employee, error: employeeError } = await client
    .from("employees")
    .select("full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (employeeError) {
    console.warn(
      "TTTracker sign-off identity could not read the employee profile; auth profile will be used instead.",
      employeeError,
    );
  } else {
    employeeFullName = clean(employee?.full_name);
  }

  const candidates = [
    employeeFullName,
    user.user_metadata?.full_name,
    user.user_metadata?.name,
  ];

  const name =
    candidates
      .map((candidate) => usableName(candidate, email))
      .find(Boolean) || "";

  if (!name) {
    throw new Error(
      "Your TTTracker user profile does not have a valid full name. Add the employee/user full name before signing.",
    );
  }

  return {
    userId: user.id,
    name,
    email,
    display: `${name} · ${email}`,
  };
}

export async function resolveSystemUserIdentityById(
  client: SupabaseClient,
  userId: string,
): Promise<SystemUserIdentity | null> {
  const id = clean(userId);
  if (!id) return null;

  const { data, error } = await client.auth.admin.getUserById(id);

  if (error || !data.user) {
    if (error) {
      console.warn("TTTracker user identity could not be loaded", error);
    }
    return null;
  }

  try {
    return await resolveSystemUserIdentity(client, data.user);
  } catch (error) {
    console.warn("TTTracker user identity is incomplete", error);
    return null;
  }
}
