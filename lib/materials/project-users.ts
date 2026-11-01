import type { SupabaseClient } from "@supabase/supabase-js";

const clean = (value: unknown) => String(value ?? "").trim();
const metadataName = (user: { user_metadata?: Record<string, unknown> | null; app_metadata?: Record<string, unknown> | null } | null | undefined) => {
  const metadata = user?.user_metadata;
  return clean(metadata?.full_name) || clean(metadata?.name) || clean(metadata?.display_name) || clean([metadata?.first_name, metadata?.last_name].map(clean).filter(Boolean).join(" ")) || clean(user?.app_metadata?.name);
};

export type ProjectUserLabel = { id: string; name: string; role: string };

export async function resolveProjectUserLabels(service: SupabaseClient, userIds: string[]): Promise<ProjectUserLabel[]> {
  const ids = [...new Set(userIds.map(clean).filter(Boolean))];
  if (!ids.length) return [];
  const [{ data: employees, error: employeeError }, { data: roles, error: roleError }] = await Promise.all([
    service.from("employees").select("user_id,full_name").in("user_id", ids),
    service.from("user_roles").select("user_id,role").in("user_id", ids),
  ]);
  if (employeeError || roleError) throw new Error(employeeError?.message || roleError?.message);
  const employeeNames = new Map((employees || []).map(row => [clean(row.user_id), clean(row.full_name)]));
  const roleNames = new Map((roles || []).map(row => [clean(row.user_id), clean(row.role)]));
  return Promise.all(ids.map(async id => {
    const { data, error } = await service.auth.admin.getUserById(id);
    if (error) throw new Error(`Could not resolve project user identity: ${error.message}`);
    const name = employeeNames.get(id) || metadataName(data.user) || "Project User";
    return { id, name, role: roleNames.get(id) || clean(data.user?.user_metadata?.role) || clean(data.user?.app_metadata?.role) };
  }));
}

export async function resolveUserDisplayName(service: SupabaseClient, userId: string | null | undefined): Promise<string> {
  if (!userId) return "Project user";
  const [label] = await resolveProjectUserLabels(service, [userId]);
  return label?.name || "Project user";
}
