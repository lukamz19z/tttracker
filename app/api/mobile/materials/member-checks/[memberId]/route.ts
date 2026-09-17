import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  mobileApiError,
  requireMobilePermission,
} from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MemberStatus =
  | "not_checked"
  | "arrived"
  | "not_here"
  | "missing"
  | "issue";

type RouteContext = {
  params: Promise<{ memberId: string }>;
};

const VALID_STATUSES = new Set<MemberStatus>([
  "not_checked",
  "arrived",
  "not_here",
  "missing",
  "issue",
]);

function clean(value: unknown) {
  return String(value ?? "").trim();
}

async function loadMemberContext(
  service: SupabaseClient,
  userId: string,
  memberId: string,
) {
  const { data: member, error: memberError } = await service
    .from("tower_material_members")
    .select(
      "id,tower_id,bundle_id,bundle_reference,mark_no,tower_segment",
    )
    .eq("id", memberId)
    .maybeSingle();

  if (memberError) throw new Error(memberError.message);
  if (!member) throw new Error("Member not found.");

  const { data: tower, error: towerError } = await service
    .from("towers")
    .select("id,project_id")
    .eq("id", member.tower_id)
    .maybeSingle();

  if (towerError) throw new Error(towerError.message);
  if (!tower) throw new Error("Tower not found.");

  const { data: access, error: accessError } = await service
    .from("project_access")
    .select("project_id")
    .eq("project_id", tower.project_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (accessError) throw new Error(accessError.message);
  if (!access) throw new Error("You do not have access to this project.");

  if (!member.bundle_id) {
    throw new Error(
      `TTTracker cannot safely resolve the bundle for member ${clean(member.mark_no)}. Check the member's Tower Segment in Data & Imports.`,
    );
  }

  return { member, tower };
}

export async function PUT(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { service, identity } = await requireMobilePermission(
      request,
      "mobile.materials",
    );

    const { memberId } = await context.params;
    const cleanMemberId = clean(memberId);

    if (!cleanMemberId) {
      return NextResponse.json(
        { error: "Member ID is required." },
        { status: 400 },
      );
    }

    const { member } = await loadMemberContext(
      service,
      identity.userId,
      cleanMemberId,
    );

    const body = (await request.json().catch(() => ({}))) as {
      status?: unknown;
      notes?: unknown;
    };

    const status = clean(body.status) as MemberStatus;

    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json(
        { error: "A valid member status is required." },
        { status: 400 },
      );
    }

    const { data: existing, error: existingError } = await service
      .from("tower_material_member_checks")
      .select("notes")
      .eq("bundle_id", member.bundle_id)
      .eq("mark_no", clean(member.mark_no))
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);

    const payload = {
      tower_id: member.tower_id,
      bundle_id: member.bundle_id,
      bundle_no: clean(member.bundle_reference),
      mark_no: clean(member.mark_no),
      status,
      notes:
        body.notes !== undefined
          ? clean(body.notes)
          : clean(existing?.notes),
      checked_by: clean(identity.fullName) || "TTTracker Mobile",
      checked_at: new Date().toISOString(),
    };

    const { data: check, error } = await service
      .from("tower_material_member_checks")
      .upsert(payload, { onConflict: "bundle_id,mark_no" })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ check });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { service, identity } = await requireMobilePermission(
      request,
      "mobile.materials",
    );

    const { memberId } = await context.params;
    const cleanMemberId = clean(memberId);

    if (!cleanMemberId) {
      return NextResponse.json(
        { error: "Member ID is required." },
        { status: 400 },
      );
    }

    const { member } = await loadMemberContext(
      service,
      identity.userId,
      cleanMemberId,
    );

    const { error } = await service
      .from("tower_material_member_checks")
      .delete()
      .eq("bundle_id", member.bundle_id)
      .eq("mark_no", clean(member.mark_no));

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
