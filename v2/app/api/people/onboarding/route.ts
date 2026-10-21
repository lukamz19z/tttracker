import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { requirePeopleContext, peopleError } from "@/lib/people/server";
import { secureToken, tokenHash } from "@/lib/people/confidential";
import { sendEmail } from "@/lib/email/send";
import { getEmailConfig } from "@/lib/email/config";

import { publishPendingProfilePhotos } from "@/lib/people/profile-photo";
import { onboardingEmail } from "@/lib/people/onboarding-email";

const headers = { "Cache-Control": "no-store" };
export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    if (
      ![
        "templates",
        "template",
        "versions",
        "list",
        "detail",
        "review",
      ].includes(p.get("action") ?? "list")
    )
      return NextResponse.json(
        { error: "PEOPLE_INVALID_ACTION" },
        { status: 422, headers },
      );
    const context = await requirePeopleContext(p.get("organisation"));
    if (p.get("action") === "versions") {
      const { data, error } = await (
        await createSupabaseServer()
      ).rpc("tttracker_v2_onboarding_versions", {
        p_org: context.organisation.organisationId,
        p_template: p.get("id"),
        p_page: Math.max(1, Number(p.get("page")) || 1),
      });
      if (error) throw new Error(error.message);
      return NextResponse.json(data, { headers });
    }
    const { data, error } = await (
      await createSupabaseServer()
    ).rpc("tttracker_v2_onboarding_admin", {
      p_org: context.organisation.organisationId,
      p_action: p.get("action") ?? "list",
      p_id: p.get("id"),
      p_page: Math.max(1, Number(p.get("page")) || 1),
      p_query: (p.get("q") ?? "").slice(0, 120),
      p_data: {
        person_id: p.get("person") ?? "",
        status: p.get("status") ?? "",
      },
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { headers });
  } catch (e) {
    unstable_rethrow(e);
    const r = peopleError(e);
    return NextResponse.json({ error: r.error }, { status: r.status, headers });
  }
}
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      organisation?: string;
      action: string;
      id?: string;
      data?: Record<string, unknown>;
    };
    if (["sent", "send_failed"].includes(body.action))
      return NextResponse.json(
        { error: "PEOPLE_INVALID_ACTION" },
        { status: 422, headers },
      );
    const context = await requirePeopleContext(body.organisation);
    const session = await createSupabaseServer();
    const send = ["start", "resend"].includes(body.action);
    const token = send ? secureToken() : undefined;
    const { data, error } = await session.rpc("tttracker_v2_onboarding_admin", {
      p_org: context.organisation.organisationId,
      p_action: body.action,
      p_id: body.id ?? null,
      p_data: {
        ...body.data,
        ...(token ? { token_hash: tokenHash(token) } : {}),
      },
    });
    if (error) throw new Error(error.message);
    let photoPublicationPending = false;
    if (body.action === "complete" && body.id) {
      try { photoPublicationPending = (await publishPendingProfilePhotos({ organisation: context.organisation.organisationId, instance: body.id })).deferred > 0; }
      catch { photoPublicationPending = true; console.error("Onboarding completed with pending profile photo publication"); }
    }
    if (send && token) {
      try {
        const url = `${getEmailConfig().appUrl}/secure-onboarding#token=${encodeURIComponent(token)}`;
        await sendEmail({
          to: data.email,
          subject: `${context.organisation.organisationName}: onboarding invitation`,
          html: onboardingEmail({
            organisation: context.organisation.organisationName,
            title: String(data.title),
            url,
            expiresAt: data.expires_at,
          }),
        });
        const { error: sentError } = await session.rpc(
          "tttracker_v2_onboarding_admin",
          {
            p_org: context.organisation.organisationId,
            p_action: "sent",
            p_id: data.id,
          },
        );
        if (sentError) throw new Error("PEOPLE_SEND_STATUS_FAILED");
      } catch {
        await session.rpc("tttracker_v2_onboarding_admin", {
          p_org: context.organisation.organisationId,
          p_action: "send_failed",
          p_id: data.id,
        });
        return NextResponse.json(
          { error: "PEOPLE_ONBOARDING_SEND_FAILED", id: data.id },
          { status: 503, headers },
        );
      }
    }
    return NextResponse.json({ id: data.id, photo_publication_pending: photoPublicationPending }, { headers });
  } catch (e) {
    unstable_rethrow(e);
    const r = peopleError(e);
    return NextResponse.json({ error: r.error }, { status: r.status, headers });
  }
}
