import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import {
  completeInvitationSetup,
  readInvitationSetup,
} from "@/lib/invitations/account-setup";
import { setupError } from "@/lib/auth/setup-errors";

type Context = { params: Promise<{ invitationId: string }> };
const failure = (error: ReturnType<typeof setupError>) =>
  NextResponse.json(
    { error: error.message, code: error.code, retryable: error.retryable },
    {
      status: error.code === "AUTH_SESSION_MISSING" ? 401 : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );

export async function GET(_request: NextRequest, context: Context) {
  try {
    const { invitationId } = await context.params;
    const state = await readInvitationSetup(
      await createSupabaseServer(),
      invitationId,
    );
    if (state.status === "denied") return failure(state.error);
    return NextResponse.json(state, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return failure(setupError("SETUP_RETRY_REQUIRED"));
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const { invitationId } = await context.params;
    const body: unknown = await request.json();
    if (
      !body ||
      typeof body !== "object" ||
      !("password" in body) ||
      !("confirmation" in body) ||
      typeof body.password !== "string" ||
      typeof body.confirmation !== "string"
    )
      return failure({
        code: "PASSWORD_REQUIRED",
        message: "Enter and confirm your password.",
        retryable: true,
      });
    const result = await completeInvitationSetup(
      await createSupabaseServer(),
      invitationId,
      body.password,
      body.confirmation,
    );
    if (!result.ok) return failure(result.error);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return failure(setupError("SETUP_RETRY_REQUIRED"));
  }
}
