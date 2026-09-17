import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { requireAccessAdmin } from "@/lib/access/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function listAllUsers(service: SupabaseClient): Promise<User[]> {
  const users: User[] = [];
  let page = 1;

  while (true) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) throw new Error(error.message);

    const current = data.users ?? [];
    users.push(...current);
    if (current.length < 1000) break;
    page += 1;
  }

  return users;
}

function isActive(user: User) {
  const bannedUntil = (user as User & { banned_until?: string | null }).banned_until;
  if (!bannedUntil) return true;
  const time = new Date(bannedUntil).getTime();
  return !Number.isFinite(time) || time <= Date.now();
}

export async function GET(request: NextRequest) {
  try {
    const { service } = await requireAccessAdmin(request);

    const [
      authUsers,
      rolesResult,
      projectsResult,
      assignmentsResult,
      projectAccessResult,
      employeesResult,
      mappingsResult,
    ] = await Promise.all([
      listAllUsers(service),
      service
        .from("roles")
        .select(
          "id,code,name,description,is_active,is_system,grants_all,sort_order",
        )
        .eq("is_active", true)
        .order("sort_order")
        .order("name"),
      service
        .from("projects")
        .select("id,name,project_number,status")
        .order("name"),
      service.from("user_role_assignments").select("user_id,role_id"),
      service.from("project_access").select("user_id,project_id"),
      service
        .from("employees")
        .select("id,user_id,full_name,role,active")
        .not("user_id", "is", null),
      service
        .from("sharepoint_user_mappings")
        .select("user_id,microsoft_email,is_enabled"),
    ]);

    const failures = [
      rolesResult.error,
      projectsResult.error,
      assignmentsResult.error,
      projectAccessResult.error,
      employeesResult.error,
      mappingsResult.error,
    ].filter(Boolean);

    if (failures.length) throw new Error(failures[0]?.message ?? "Could not load users.");

    const roleIdsByUser = new Map<string, string[]>();
    for (const row of assignmentsResult.data ?? []) {
      const userId = String(row.user_id ?? "");
      const roleId = String(row.role_id ?? "");
      if (!userId || !roleId) continue;
      roleIdsByUser.set(userId, [...(roleIdsByUser.get(userId) ?? []), roleId]);
    }

    const projectIdsByUser = new Map<string, string[]>();
    for (const row of projectAccessResult.data ?? []) {
      const userId = String(row.user_id ?? "");
      const projectId = String(row.project_id ?? "");
      if (!userId || !projectId) continue;
      projectIdsByUser.set(userId, [
        ...(projectIdsByUser.get(userId) ?? []),
        projectId,
      ]);
    }

    const employeeByUser = new Map(
      (employeesResult.data ?? [])
        .filter((row) => row.user_id)
        .map((row) => [String(row.user_id), row]),
    );

    const mappingByUser = new Map(
      (mappingsResult.data ?? []).map((row) => [String(row.user_id), row]),
    );

    const users = authUsers
      .map((authUser) => ({
        user_id: authUser.id,
        email: authUser.email ?? null,
        created_at: authUser.created_at ?? null,
        last_sign_in_at: authUser.last_sign_in_at ?? null,
        is_active: isActive(authUser),
        employee: employeeByUser.get(authUser.id) ?? null,
        role_ids: Array.from(new Set(roleIdsByUser.get(authUser.id) ?? [])),
        project_ids: Array.from(new Set(projectIdsByUser.get(authUser.id) ?? [])),
        sharepoint: mappingByUser.get(authUser.id) ?? null,
      }))
      .sort((a, b) => {
        const aName = a.employee?.full_name || a.email || "";
        const bName = b.employee?.full_name || b.email || "";
        return String(aName).localeCompare(String(bName));
      });

    return NextResponse.json({
      users,
      roles: rolesResult.data ?? [],
      projects: projectsResult.data ?? [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load users.";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
