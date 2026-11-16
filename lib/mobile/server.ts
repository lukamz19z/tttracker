import type { NextRequest } from "next/server";

import {
  createServiceClient,
  effectivePermissionsForUser,
  getRequestUser,
  userHasAccess,
  type AccessService,
} from "@/lib/access/server";
import { mobilePerfTrace } from "@/lib/mobile/perf-trace";
import { mobileAuthErrorResponse } from "@/lib/mobile/auth-validation";

export type MobileIdentity = {
  userId: string;
  email: string;
  employeeId: string | null;
  fullName: string;
  employeeRole: string | null;
  crewId: string | null;
  crewNumber: string | null;
  crewName: string | null;
  currentProjectId: string | null;
};

type EmployeeRow = {
  id: string;
  full_name: string | null;
  role: string | null;
  crew_id: string | null;
  current_project_id: string | null;
  crews:
    | { id: string; crew_number: string | null; crew_name: string | null }
    | Array<{ id: string; crew_number: string | null; crew_name: string | null }>
    | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function fallbackName(email: string) {
  const local = email.split("@")[0] || "TTTracker User";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export async function mobileIdentityForUser(
  service: AccessService,
  userId: string,
  emailValue?: string | null,
  trace?: ReturnType<typeof mobilePerfTrace>,
): Promise<MobileIdentity> {
  const email = clean(emailValue).toLowerCase();
  const queryStartedAt = Date.now();

  const { data, error } = await service
    .from("employees")
    .select(`
      id,
      full_name,
      role,
      crew_id,
      current_project_id,
      crews(id,crew_number,crew_name)
    `)
    .eq("user_id", userId)
    .maybeSingle();

  trace?.log(error ? "profile-lookup-failed" : "profile-lookup", {
    operation: "employees.by_user_id_with_crew_join",
    userId,
    rowCount: data ? 1 : 0,
    errorCode: error?.code ?? null,
    durationMs: Date.now() - queryStartedAt,
  });
  if (error) throw new Error(error.message);

  const employee = (data ?? null) as EmployeeRow | null;
  const crew = relationOne(employee?.crews);

  return {
    userId,
    email,
    employeeId: employee?.id ?? null,
    fullName: clean(employee?.full_name) || fallbackName(email),
    employeeRole: clean(employee?.role) || null,
    crewId: crew?.id ?? employee?.crew_id ?? null,
    crewNumber: clean(crew?.crew_number) || null,
    crewName: clean(crew?.crew_name) || null,
    currentProjectId: employee?.current_project_id ?? null,
  };
}

export async function requireMobileUser(request: NextRequest) {
  const trace = mobilePerfTrace(request);
  const user = await getRequestUser(request);
  const serviceStartedAt = Date.now();
  const service = createServiceClient();
  trace?.log("service-client-ready", { durationMs: Date.now() - serviceStartedAt });
  const identity = await mobileIdentityForUser(service, user.id, user.email, trace);
  return { user, service, identity };
}

export async function requireMobilePermission(
  request: NextRequest,
  permissionCode: string,
) {
  const trace = mobilePerfTrace(request);
  const auth = await requireMobileUser(request);
  const accessStartedAt = Date.now();
  const allowed = await userHasAccess(
    auth.service,
    auth.identity.userId,
    permissionCode,
  );

  if (!allowed) {
    trace?.log("access-failed", { userId: auth.identity.userId, category: "permission_denied", durationMs: Date.now() - accessStartedAt });
    const error = new Error("MOBILE_PERMISSION_DENIED");
    (error as Error & { permissionCode?: string }).permissionCode = permissionCode;
    throw error;
  }

  trace?.log("access-ok", { userId: auth.identity.userId, durationMs: Date.now() - accessStartedAt });

  return auth;
}

export async function mobilePermissions(service: AccessService, userId: string) {
  const rows = await effectivePermissionsForUser(service, userId);
  return rows
    .filter((row) => row.type === "mobile" && row.allowed === true)
    .map((row) => row.code);
}

export function mobileApiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected mobile API error.";

  const authResponse = mobileAuthErrorResponse(error);
  if (authResponse) return authResponse;

  if (message === "MOBILE_PERMISSION_DENIED") {
    return { status: 403, message: "You do not have permission to use this mobile feature." };
  }

  return { status: 500, message };
}
