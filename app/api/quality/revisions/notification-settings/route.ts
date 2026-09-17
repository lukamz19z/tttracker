import { NextResponse } from "next/server";

import {
  assertQualityProjectAccess,
  qualityApiError,
  requireQualityUser,
} from "@/lib/quality/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

async function getUsers(service: Awaited<ReturnType<typeof requireQualityUser>>["service"]) {
  const { data: userRows, error } = await service
    .from("user_roles")
    .select("user_id,role");

  if (error) throw new Error(error.message);

  const userIds = Array.from(
    new Set((userRows ?? []).map((row) => clean(row.user_id)).filter(Boolean)),
  );

  const users = await Promise.all(
    userIds.map(async (userId) => {
      const { data } = await service.auth.admin.getUserById(userId);
      const user = data.user;
      if (!user) return null;
      const name =
        clean(user.user_metadata?.full_name) ||
        clean(user.user_metadata?.name) ||
        clean(user.email) ||
        userId;

      return {
        id: userId,
        name,
        email: clean(user.email),
        role:
          clean((userRows ?? []).find((row) => row.user_id === userId)?.role) ||
          "user",
      };
    }),
  );

  return users.filter(Boolean);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = clean(url.searchParams.get("projectId"));
    if (!projectId) {
      return NextResponse.json({ error: "Project ID is required." }, { status: 400 });
    }

    const { service, user, role } = await requireQualityUser(request);
    await assertQualityProjectAccess({
      service,
      userId: user.id,
      role,
      projectId,
    });

    const [{ data: rules, error }, users] = await Promise.all([
      service
        .from("project_revision_notification_rules")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at"),
      getUsers(service),
    ]);

    if (error) throw new Error(error.message);

    return NextResponse.json({ users, rules: rules ?? [] });
  } catch (error) {
    const apiError = qualityApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const projectId = clean(body.projectId);
    const userId = clean(body.userId);

    if (!projectId || !userId) {
      return NextResponse.json(
        { error: "Project ID and user are required." },
        { status: 400 },
      );
    }

    const { service, user, role } = await requireQualityUser(request);
    await assertQualityProjectAccess({
      service,
      userId: user.id,
      role,
      projectId,
    });

    const row = {
      project_id: projectId,
      user_id: userId,
      notify_created: body.notifyCreated !== false,
      notify_submitted: body.notifySubmitted !== false,
      receives_email: body.receivesEmail !== false,
      receives_in_app: body.receivesInApp !== false,
      receives_push: body.receivesPush === true,
      active: body.active !== false,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await service
      .from("project_revision_notification_rules")
      .upsert(row, { onConflict: "project_id,user_id" })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ rule: data });
  } catch (error) {
    const apiError = qualityApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const projectId = clean(body.projectId);
    const userId = clean(body.userId);

    if (!projectId || !userId) {
      return NextResponse.json(
        { error: "Project ID and user are required." },
        { status: 400 },
      );
    }

    const { service, user, role } = await requireQualityUser(request);
    await assertQualityProjectAccess({
      service,
      userId: user.id,
      role,
      projectId,
    });

    const { error } = await service
      .from("project_revision_notification_rules")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", userId);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error) {
    const apiError = qualityApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
