import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export async function createDocketRouteSupabase() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Supabase server configuration is missing.");

  return createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {}
      },
    },
  });
}

export function createDocketAdminSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for the Daily Docket approval workflow.");
  }
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireAuthenticatedProjectUser(projectId: string) {
  const supabase = await createDocketRouteSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("AUTH_REQUIRED");

  const { data: access, error: accessError } = await supabase
    .from("project_access")
    .select("project_id")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (accessError || !access) throw new Error("PROJECT_FORBIDDEN");
  return { supabase, user };
}

export async function getWebsiteRole(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return String(data?.role ?? "").trim().toLowerCase();
}

export function isBcDocketReviewerRole(role: string) {
  return ["admin", "commercial", "commercial_manager", "supervisor"].includes(role);
}

export async function authUserEmailMap(admin: SupabaseClient, userIds: string[]) {
  const wanted = new Set(userIds);
  const result = new Map<string, { email: string; name: string }>();
  let page = 1;
  while (wanted.size && page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) {
      if (!wanted.has(u.id)) continue;
      result.set(u.id, {
        email: String(u.email ?? ""),
        name: String(u.user_metadata?.full_name ?? u.user_metadata?.name ?? u.email ?? "BC Reviewer"),
      });
      wanted.delete(u.id);
    }
    if (data.users.length < 1000) break;
    page += 1;
  }
  return result;
}

export type BcReviewerRecipient = {
  userId: string;
  email: string;
  name: string;
};

export async function getBcReviewerRecipients(
  admin: SupabaseClient,
  projectId: string,
): Promise<BcReviewerRecipient[]> {
  const { data: access, error } = await admin
    .from("project_access")
    .select("user_id")
    .eq("project_id", projectId);
  if (error) throw error;

  const ids = [...new Set((access ?? []).map((r) => String(r.user_id)).filter(Boolean))];
  if (!ids.length) return [];

  const { data: roles, error: roleError } = await admin
    .from("user_roles")
    .select("user_id,role")
    .in("user_id", ids);
  if (roleError) throw roleError;

  const reviewerIds = (roles ?? [])
    .filter((r) => isBcDocketReviewerRole(String(r.role ?? "").toLowerCase()))
    .map((r) => String(r.user_id));

  const emailMap = await authUserEmailMap(admin, reviewerIds);
  return reviewerIds
    .map((id) => ({ userId: id, ...(emailMap.get(id) ?? { email: "", name: "" }) }))
    .filter((r) => r.email);
}

export async function loadDocketPdfBundle(admin: SupabaseClient, docketId: string) {
  const { data: docket, error: docketError } = await admin
    .from("tower_daily_dockets")
    .select("*")
    .eq("id", docketId)
    .single();
  if (docketError || !docket) throw new Error("Daily Docket could not be found.");

  const [
    projectResult, towerResult, labourResult, plantResult,
    delayResult, progressResult, materialEventResult,
  ] = await Promise.all([
    admin.from("projects").select("*").eq("id", docket.project_id).single(),
    admin.from("towers").select("*").eq("id", docket.tower_id).single(),
    admin.from("tower_docket_labour").select("*").eq("docket_id", docketId).order("worker_name"),
    admin.from("tower_docket_plant").select("*").eq("docket_id", docketId),
    admin.from("tower_docket_delays").select("*").eq("docket_id", docketId).order("created_at"),
    admin.from("tower_docket_progress").select("*").eq("docket_id", docketId),
    admin.from("tower_material_events").select(`
      *,
      tower_material_event_items(*),
      tower_material_event_people(*),
      tower_material_event_plant(*)
    `).eq("docket_id", docketId).order("occurred_at"),
  ]);

  if (projectResult.error || !projectResult.data) throw new Error("Project could not be loaded.");
  if (towerResult.error || !towerResult.data) throw new Error("Tower could not be loaded.");
  const childError = labourResult.error || plantResult.error || delayResult.error ||
    progressResult.error || materialEventResult.error;
  if (childError) throw new Error(`Daily Docket details could not be loaded: ${childError.message}`);

  return {
    docket,
    project: projectResult.data,
    tower: towerResult.data,
    labour: labourResult.data ?? [],
    plant: plantResult.data ?? [],
    delays: delayResult.data ?? [],
    progress: progressResult.data ?? [],
    materialEvents: materialEventResult.data ?? [],
  };
}
