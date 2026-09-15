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

async function availableProjectUsers(
  service: Awaited<ReturnType<typeof requireQualityUser>>["service"],
  projectId: string,
  currentUserId: string,
) {
  const [{ data: accessRows }, { data: roleRows }, { data: ruleRows }] =
    await Promise.all([
      service
        .from("project_access")
        .select("user_id")
        .eq("project_id", projectId),
      service
        .from("user_roles")
        .select("user_id,role"),
      service
        .from("project_defect_notification_rules")
        .select("user_id")
        .eq("project_id", projectId),
    ]);

  const roleMap = new Map(
    (roleRows ?? []).map((row) => [
      String(row.user_id),
      clean(row.role).toLowerCase(),
    ]),
  );

  const ids = new Set<string>([currentUserId]);

  for (const row of accessRows ?? []) {
    if (row.user_id) ids.add(String(row.user_id));
  }

  for (const row of roleRows ?? []) {
    const role = clean(row.role).toLowerCase();
    if (
      ["admin", "administrator", "site_admin"].includes(role) &&
      row.user_id
    ) {
      ids.add(String(row.user_id));
    }
  }

  for (const row of ruleRows ?? []) {
    if (row.user_id) ids.add(String(row.user_id));
  }

  const userIds = [...ids];

  const { data: employeeRows } =
    userIds.length > 0
      ? await service
          .from("employees")
          .select("user_id,full_name")
          .in("user_id", userIds)
      : { data: [] };

  const employeeMap = new Map(
    (employeeRows ?? []).map((row) => [
      String(row.user_id),
      clean(row.full_name),
    ]),
  );

  const users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
  }> = [];

  for (const userId of userIds) {
    const { data } = await service.auth.admin.getUserById(userId);
    if (!data.user) continue;

    const email = clean(data.user.email);
    const name =
      employeeMap.get(userId) ||
      clean(
        data.user.user_metadata?.full_name ||
          data.user.user_metadata?.name ||
          email,
      ) ||
      "TTTracker User";

    users.push({
      id: userId,
      name,
      email,
      role: roleMap.get(userId) || "user",
    });
  }

  return users.sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = clean(url.searchParams.get("projectId"));

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required." },
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

    const [{ data: rules, error: ruleError }, users] = await Promise.all([
      service
        .from("project_defect_notification_rules")
        .select(
          "id,project_id,user_id,notify_new,notify_status_change,notify_action,notify_closed,notify_critical,receives_email,receives_in_app,receives_push,active,created_at,updated_at",
        )
        .eq("project_id", projectId)
        .order("created_at"),
      availableProjectUsers(service, projectId, user.id),
    ]);

    if (ruleError) throw new Error(ruleError.message);

    return NextResponse.json({
      users,
      rules: rules ?? [],
    });
  } catch (error) {
    const apiError = qualityApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { service, user, role } = await requireQualityUser(request);
    const body = (await request.json()) as {
      projectId?: string;
      userId?: string;
      notifyNew?: boolean;
      notifyStatusChange?: boolean;
      notifyAction?: boolean;
      notifyClosed?: boolean;
      notifyCritical?: boolean;
      receivesEmail?: boolean;
      receivesInApp?: boolean;
      receivesPush?: boolean;
      active?: boolean;
    };

    const projectId = clean(body.projectId);
    const userId = clean(body.userId);

    if (!projectId || !userId) {
      return NextResponse.json(
        { error: "Project and user are required." },
        { status: 400 },
      );
    }

    await assertQualityProjectAccess({
      service,
      userId: user.id,
      role,
      projectId,
    });

    const payload = {
      project_id: projectId,
      user_id: userId,
      notify_new: body.notifyNew !== false,
      notify_status_change: body.notifyStatusChange !== false,
      notify_action: body.notifyAction === true,
      notify_closed: body.notifyClosed !== false,
      notify_critical: body.notifyCritical !== false,
      receives_email: body.receivesEmail !== false,
      receives_in_app: body.receivesInApp !== false,
      receives_push: body.receivesPush === true,
      active: body.active !== false,
      created_by: user.id,
    };

    const { data, error } = await service
      .from("project_defect_notification_rules")
      .upsert(payload, { onConflict: "project_id,user_id" })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ rule: data });
  } catch (error) {
    const apiError = qualityApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { service, user, role } = await requireQualityUser(request);
    const body = (await request.json()) as {
      projectId?: string;
      userId?: string;
    };

    const projectId = clean(body.projectId);
    const targetUserId = clean(body.userId);

    if (!projectId || !targetUserId) {
      return NextResponse.json(
        { error: "Project and user are required." },
        { status: 400 },
      );
    }

    await assertQualityProjectAccess({
      service,
      userId: user.id,
      role,
      projectId,
    });

    const { error } = await service
      .from("project_defect_notification_rules")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", targetUserId);

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (error) {
    const apiError = qualityApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
