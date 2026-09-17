
import { NextRequest, NextResponse } from "next/server";

import {
  mobileApiError,
  requireMobileUser,
} from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(request: NextRequest) {
  try {
    const { service, identity } = await requireMobileUser(request);

    const body = (await request.json()) as {
      expoPushToken?: string;
      platform?: string;
      deviceLabel?: string;
    };

    const token = clean(body.expoPushToken);

    if (!token) {
      return NextResponse.json(
        { error: "Expo push token is required." },
        { status: 400 },
      );
    }

    const { error } = await service
      .from("user_push_tokens")
      .upsert(
        {
          user_id: identity.userId,
          expo_push_token: token,
          platform: clean(body.platform) || null,
          device_label: clean(body.deviceLabel) || null,
          active: true,
          last_seen_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,expo_push_token",
        },
      );

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      registered: true,
    });
  } catch (error) {
    const apiError = mobileApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { service, identity } = await requireMobileUser(request);

    const body = (await request.json()) as {
      expoPushToken?: string;
    };

    const token = clean(body.expoPushToken);

    if (!token) {
      return NextResponse.json(
        { error: "Expo push token is required." },
        { status: 400 },
      );
    }

    const { error } = await service
      .from("user_push_tokens")
      .update({
        active: false,
        last_seen_at: new Date().toISOString(),
      })
      .eq("user_id", identity.userId)
      .eq("expo_push_token", token);

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      registered: false,
    });
  } catch (error) {
    const apiError = mobileApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
