import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  requireAccessAdmin,
  type AccessService,
} from "@/lib/access/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EmployeeRow = {
  id: string;
  full_name: string;
  role: string | null;
  user_id: string | null;
  active: boolean | null;
};

type MappingRow = {
  user_id: string;
  microsoft_email: string | null;
  is_enabled: boolean;
};

type AssignmentRow = {
  user_id: string;
  role_id: string;
};

type ProjectAccessRow = {
  user_id: string;
  project_id: string;
  role: string | null;
};

async function listAllAuthUsers(service: AccessService): Promise<User[]> {
  const users: User[] = [];
  let page = 1;

  while (true) {
    const result = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw new Error(result.error.message);
    users.push(...result.data.users);
    if (result.data.users.length < 1000) break;
    page += 1;
  }

  return users;
}

export async function GET(request: NextRequest) {
  try {
    const { service } = await requireAccessAdmin(request);

    const [
      authUsers,
      roles,
      assignments,
      employees,
      projects,
      projectAccess,
      mappings,
    ] = await Promise.all([
      listAllAuthUsers(service),
      service
        .from("roles")
        .select(
          "id,code,name,description,is_active,is_system,grants_all,sort_order",
        )
        .eq("is_active", true)
        .order("sort_order")
        .order("name"),
      service.from("user_role_assignments").select("user_id,role_id"),
      service
        .from("employees")
        .select("id,full_name,role,user_id,active")
        .not("user_id", "is", null),
      service
        .from("projects")
        .select("id,name,project_number,location,status")
        .order("name"),
      service.from("project_access").select("user_id,project_id,role"),
      service
        .from("sharepoint_user_mappings")
        .select("user_id,microsoft_email,is_enabled"),
    ]);

    for (const result of [
      roles,
      assignments,
      employees,
      projects,
      projectAccess,
      mappings,
    ]) {
      if (result.error) throw new Error(result.error.message);
    }

    const employeeRows = (employees.data ?? []) as EmployeeRow[];
    const assignmentRows = (assignments.data ?? []) as AssignmentRow[];
    const projectAccessRows = (projectAccess.data ?? []) as ProjectAccessRow[];
    const mappingRows = (mappings.data ?? []) as MappingRow[];

    const employeeByUser = new Map<string, EmployeeRow>();
    for (const row of employeeRows) {
      if (row.user_id) employeeByUser.set(row.user_id, row);
    }

    const roleIdsByUser = new Map<string, string[]>();
    const projectIdsByUser = new Map<string, string[]>();
    const mappingByUser = new Map<string, MappingRow>();

    for (const row of assignmentRows) {
      const current = roleIdsByUser.get(row.user_id) ?? [];
      current.push(row.role_id);
      roleIdsByUser.set(row.user_id, current);
    }

    for (const row of projectAccessRows) {
      const current = projectIdsByUser.get(row.user_id) ?? [];
      current.push(row.project_id);
      projectIdsByUser.set(row.user_id, current);
    }

    for (const row of mappingRows) {
      mappingByUser.set(row.user_id, row);
    }

    return NextResponse.json({
      roles: roles.data ?? [],
      projects: projects.data ?? [],
      users: authUsers.map((user) => ({
        user_id: user.id,
        email: user.email ?? null,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at ?? null,
        is_active: user.banned_until
          ? new Date(user.banned_until) <= new Date()
          : true,
        employee: employeeByUser.get(user.id) ?? null,
        role_ids: roleIdsByUser.get(user.id) ?? [],
        project_ids: projectIdsByUser.get(user.id) ?? [],
        sharepoint: mappingByUser.get(user.id) ?? null,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load users.";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
