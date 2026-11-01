import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { hasV1FullAccess, userHasAccess } from "@/lib/access/server";
import { isConfiguredBcReviewer } from "@/lib/dockets/reviewers";

type Context = { params: Promise<{ docketId: string }> };

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Daily Docket server configuration is missing.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function authenticatedUser(request: Request, service: ReturnType<typeof serviceClient>) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) {
    const { data, error } = await service.auth.getUser(bearer);
    if (error || !data.user) return null;
    return data.user;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Supabase public configuration is missing.");
  const cookieStore = await cookies();
  const client = createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: values => { try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} },
    },
  });
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

export async function POST(request: Request, context: Context) {
  try {
    const { docketId } = await context.params;
    const body = await request.json().catch(() => ({})) as { action?: string };
    if (!docketId || !["retract", "delete"].includes(String(body.action))) {
      return NextResponse.json({ error: "A valid Daily Docket action is required." }, { status: 400 });
    }
    const service = serviceClient();
    const user = await authenticatedUser(request, service);
    if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    const { data: docket, error } = await service.from("tower_daily_dockets")
      .select("id,project_id,tower_id,approval_status,created_by_user_id,bc_rep_user_id,bc_submitted_by,approval_revision,deleted_at")
      .eq("id", docketId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!docket || docket.deleted_at) return NextResponse.json({ error: "Daily Docket not found." }, { status: 404 });

    const [{ data: access, error: accessError }, fullAccess, managePermission, configuredReviewer] = await Promise.all([
      service.from("project_access").select("user_id").eq("project_id", docket.project_id).eq("user_id", user.id).maybeSingle(),
      hasV1FullAccess(service, user.id),
      userHasAccess(service, user.id, "daily_dockets.approve"),
      isConfiguredBcReviewer(service, docket.project_id, user.id),
    ]);
    if (accessError) throw new Error(accessError.message);
    if (!access && !fullAccess) return NextResponse.json({ error: "You do not have access to this project." }, { status: 403 });
    const canManage = fullAccess || managePermission || configuredReviewer;
    const ownerId = docket.created_by_user_id || docket.bc_rep_user_id || docket.bc_submitted_by;
    if (!canManage && ownerId !== user.id) return NextResponse.json({ error: "Only the Daily Docket author or an authorised manager can do this." }, { status: 403 });

    const { data: result, error: actionError } = await service.rpc("tttracker_v1_daily_docket_lifecycle", {
      p_docket_id: docketId,
      p_action: body.action,
      p_actor_user_id: user.id,
      p_actor_name: String(user.user_metadata?.full_name || user.user_metadata?.name || "").trim() || null,
      p_can_manage: canManage,
    });
    if (actionError) {
      const message = actionError.message;
      if (/DAILY_DOCKET_NOT_FOUND/i.test(message)) return NextResponse.json({ error: "Daily Docket not found." }, { status: 404 });
      const conflict = /NOT_RETRACTABLE|NOT_DELETABLE|FORBIDDEN/i.test(message);
      return NextResponse.json({ error: conflict ? "The Daily Docket changed or is locked and this action is no longer allowed." : message }, { status: conflict ? 409 : 500 });
    }
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("DAILY DOCKET LIFECYCLE ERROR", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Daily Docket action failed." }, { status: 500 });
  }
}
