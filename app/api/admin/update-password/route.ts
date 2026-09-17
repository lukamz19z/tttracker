import { NextRequest, NextResponse } from "next/server";

import { requireAccessAdmin } from "@/lib/access/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { service } = await requireAccessAdmin(request);
    const body = (await request.json()) as {
      user_id?: string;
      password?: string;
    };

    const userId = String(body.user_id ?? "").trim();
    const password = String(body.password ?? "");

    if (!userId) {
      return NextResponse.json({ error: "user_id is required." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "The password must be at least 8 characters." },
        { status: 400 },
      );
    }

    const { data, error } = await service.auth.admin.updateUserById(userId, {
      password,
    });

    if (error || !data.user) {
      throw new Error(error?.message ?? "Could not update the password.");
    }

    return NextResponse.json({ success: true, user_id: userId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update password.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
