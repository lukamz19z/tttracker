import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { subscriptionWorkspace } from "@/lib/platform/subscription";
type Props = { params: Promise<{ organisationId: string }> };
export async function GET(_request: NextRequest, { params }: Props) {
  try { await requirePlatformAdmin(); return NextResponse.json(await subscriptionWorkspace((await params).organisationId), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Subscription details are unavailable." }, { status: 403 }); }
}
export async function POST(request: NextRequest, { params }: Props) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new Error("FORBIDDEN");
    const actor = await requirePlatformAdmin(["owner", "admin"]);
    const org = (await params).organisationId;
    const body = await request.json();
    if (!['plan','override'].includes(body.action) || !/^[0-9a-f-]{36}$/i.test(String(body.target))) throw new Error("INVALID");
    const { error } = await createSupabaseAdmin().rpc("tttracker_v2_platform_subscription_change", { p_organisation_id: org, p_actor: actor.userId, p_action: body.action, p_target: body.target, p_override: body.override ?? null });
    if (error) throw new Error("CHANGE_FAILED");
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Subscription change could not be applied. Check your authority and selected plan or entitlement, then retry." }, { status: 403 }); }
}
