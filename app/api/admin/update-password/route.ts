import { NextRequest, NextResponse } from "next/server";
import { requireAccessAdmin } from "@/lib/access/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { service } = await requireAccessAdmin(request);
    const body = await request.json();
    const userId = String(body.user_id ?? "").trim();
    const password = String(body.password ?? body.new_password ?? "");

    if (!userId) return NextResponse.json({ error: "user_id is required." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

    const result = await service.auth.admin.updateUserById(userId, { password });
    if (result.error) throw new Error(result.error.message);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update password.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
