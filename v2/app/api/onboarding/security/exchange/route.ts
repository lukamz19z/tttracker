import { NextResponse } from "next/server";
import { exchangeSecureOnboardingToken } from "@/lib/people/confidential";

export const runtime = "nodejs";

// Narrow external surface: no TTTracker login, organisation enumeration or answer reads.
export async function POST(request: Request) {
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (
    !configured ||
    request.headers.get("origin") !== new URL(configured).origin
  )
    return NextResponse.json(
      { error: "ONBOARDING_ORIGIN_DENIED" },
      { status: 403, headers },
    );
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return NextResponse.json(
      { error: "ONBOARDING_LINK_INVALID" },
      { status: 400, headers },
    );
  try {
    const text = await request.text();
    if (text.length > 512)
      return NextResponse.json(
        { error: "ONBOARDING_LINK_INVALID" },
        { status: 400, headers },
      );
    const body: unknown = JSON.parse(text);
    if (
      !body ||
      typeof body !== "object" ||
      !("token" in body) ||
      typeof body.token !== "string"
    )
      return NextResponse.json(
        { error: "ONBOARDING_LINK_INVALID" },
        { status: 400, headers },
      );
    const context = await exchangeSecureOnboardingToken(body.token);
    const response = NextResponse.json(
      { instanceId: context.instanceId, expiresAt: context.expiresAt },
      { headers },
    );
    response.cookies.set("tttracker_onboarding", context.sessionToken, {
      httpOnly: true,
      secure: new URL(configured).protocol === "https:",
      sameSite: "strict",
      path: "/api/onboarding/security",
      expires: new Date(context.expiresAt),
    });
    return response;
  } catch (error) {
    const code =
      error instanceof Error &&
      [
        "ONBOARDING_LINK_INVALID",
        "ONBOARDING_LINK_EXPIRED",
        "ONBOARDING_LINK_REVOKED",
        "ONBOARDING_LINK_USED",
      ].includes(error.message)
        ? error.message
        : "ONBOARDING_UNAVAILABLE";
    return NextResponse.json(
      { error: code },
      { status: code === "ONBOARDING_UNAVAILABLE" ? 503 : 400, headers },
    );
  }
}
