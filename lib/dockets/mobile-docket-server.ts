/* eslint-disable @typescript-eslint/no-explicit-any */

// lib/dockets/mobile-docket-server.ts

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

import {
  SECTION_PROGRESS_WEIGHTS,
  SECTION_V2_DEFS,
} from "@/lib/dockets/calculations";

type ServiceClient = SupabaseClient;

export type MobileDocketIdentity = {
  userId: string;
  employeeId: string | null;
  name: string;
  email: string;
  display: string;
};

export type MobileDocketContext = {
  service: ServiceClient;
  user: User;
  identity: MobileDocketIdentity;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function clean(value: unknown) {
  return String(value ?? "").trim();
}

export function num(value: unknown) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

export function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];

  return Array.from(
    new Set(
      values
        .map((value) => clean(value))
        .filter(Boolean),
    ),
  );
}

function authorizationToken(request: Request) {
  return (request.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

async function hasFullAccessRole(
  service: ServiceClient,
  userId: string,
) {
  const { data: assignments, error: assignmentError } =
    await service
      .from("user_role_assignments")
      .select("role_id")
      .eq("user_id", userId);

  if (assignmentError) {
    // Dynamic RBAC migration may not be fully deployed in a legacy environment.
    // Do not silently grant access if role lookup fails.
    return false;
  }

  const roleIds = (assignments ?? [])
    .map((row: any) => clean(row.role_id))
    .filter(Boolean);

  if (roleIds.length === 0) return false;

  const { data: roles, error: roleError } = await service
    .from("roles")
    .select("id,grants_all")
    .in("id", roleIds);

  if (roleError) return false;

  return (roles ?? []).some(
    (role: any) => role.grants_all === true,
  );
}

async function requirePermission(
  service: ServiceClient,
  userId: string,
) {
  const { data, error } = await service
    .from("effective_user_permissions")
    .select("allowed")
    .eq("user_id", userId)
    .eq("code", "mobile.daily_dockets")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Daily Docket permission could not be verified: ${error.message}`,
    );
  }

  const permission =
    data as { allowed?: boolean | null } | null;

  if (permission?.allowed !== true) {
    const err = new Error(
      "You do not have permission to use Daily Dockets.",
    );
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
}

async function requireProjectAccess(
  service: ServiceClient,
  userId: string,
  projectId: string,
) {
  const { data, error } = await service
    .from("project_access")
    .select("project_id")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Project access could not be verified: ${error.message}`,
    );
  }

  if (data) return;

  if (await hasFullAccessRole(service, userId)) {
    return;
  }

  const err = new Error(
    "You do not have access to this project.",
  );
  (err as Error & { status?: number }).status = 403;
  throw err;
}

async function resolveIdentity(
  service: ServiceClient,
  user: MobileDocketContext["user"],
): Promise<MobileDocketIdentity> {
  const email = clean(user.email);

  const { data: employee, error } = await service
    .from("employees")
    .select("id,full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Your employee identity could not be loaded: ${error.message}`,
    );
  }

  const metadataName =
    clean(user.user_metadata?.full_name) ||
    clean(user.user_metadata?.name);

  const name =
    clean((employee as any)?.full_name) ||
    metadataName ||
    email ||
    "TTTracker User";

  return {
    userId: user.id,
    employeeId: clean((employee as any)?.id) || null,
    name,
    email,
    display: email ? `${name} · ${email}` : name,
  };
}

export async function requireMobileDocketUser(
  request: Request,
  projectId: string,
): Promise<MobileDocketContext> {
  const token = authorizationToken(request);

  if (!token) {
    const err = new Error("Your TTTracker session has expired. Sign in again.");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }

  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const authClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);

  if (userError || !user) {
    const err = new Error("Your TTTracker session has expired. Sign in again.");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }

  const service: ServiceClient = createClient(
    supabaseUrl,
    serviceKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  await requirePermission(service, user.id);
  await requireProjectAccess(service, user.id, projectId);

  return {
    service,
    user,
    identity: await resolveIdentity(service, user),
  };
}

export function mobileDocketApiError(error: unknown) {
  const status =
    error &&
    typeof error === "object" &&
    "status" in error &&
    Number.isFinite(Number((error as any).status))
      ? Number((error as any).status)
      : 500;

  return {
    status,
    message:
      error instanceof Error
        ? error.message
        : "Daily Docket request failed.",
  };
}

export function inferBodyExtension(tower: any) {
  const extra =
    tower?.extra_data &&
    typeof tower.extra_data === "object"
      ? tower.extra_data
      : {};

  for (const [rawKey, rawValue] of Object.entries(extra)) {
    const key = rawKey
      .toLowerCase()
      .replace(/[_\-.()/]+/g, " ");

    const bodyExtensionKey =
      (key.includes("body") &&
        (key.includes("ext") ||
          key.includes("extension"))) ||
      key.trim() === "be";

    if (!bodyExtensionKey) continue;

    if (typeof rawValue === "number") {
      return rawValue > 0;
    }

    const value = clean(rawValue).toLowerCase();

    if (
      ["no", "false", "none", "0", "not required"].includes(
        value,
      )
    ) {
      return false;
    }

    if (value) return true;
  }

  return true;
}

export function blankSectionV2Rows() {
  return SECTION_V2_DEFS.map(
    ([section_code, section_label]) => ({
      section_code,
      section_label,
      assembly_today: "",
      erection_today: "",
      assembly_weight:
        SECTION_PROGRESS_WEIGHTS[section_code] ?? 0,
      erection_weight:
        SECTION_PROGRESS_WEIGHTS[section_code] ?? 0,
    }),
  );
}

export function timeFromIso(value: unknown) {
  const match = clean(value).match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "";
}

export function parseMobilisation(
  comments: unknown,
  docketMobilisationHours: unknown,
) {
  const line = clean(comments)
    .split("\n")
    .find((row) => row.startsWith("MOBILISATION|"));

  const empty = {
    enabled: false,
    from_tower_id: "",
    to_tower_id: "",
    status: "planning",
    percent_complete: "",
    started_date: "",
    target_move_date: "",
    completed_date: "",
    notes: "",
    worker_names: [] as string[],
  };

  if (!line) {
    if (num(docketMobilisationHours) > 0) {
      return {
        ...empty,
        enabled: true,
      };
    }

    return empty;
  }

  const values = Object.fromEntries(
    line
      .split("|")
      .slice(1)
      .map((part) => {
        const [key, ...rest] = part.split("=");
        return [key, rest.join("=")];
      }),
  );

  return {
    enabled: true,
    from_tower_id: clean(values.from),
    to_tower_id: clean(values.to),
    status: clean(values.status) || "planning",
    percent_complete: clean(values.progress),
    started_date: clean(values.started),
    target_move_date: clean(values.target),
    completed_date: clean(values.completed),
    notes: clean(values.notes),
    worker_names: clean(values.workers)
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
  };
}

export function stripMobilisationLine(comments: unknown) {
  return clean(comments)
    .split("\n")
    .filter((row) => !row.startsWith("MOBILISATION|"))
    .join("\n")
    .trim();
}

export function buildMobilisationLine(args: {
  mobilisation: any;
  mobilisationHours: unknown;
}) {
  const { mobilisation } = args;

  if (!mobilisation?.enabled) return "";

  const hours = Math.max(0, num(args.mobilisationHours));
  const minutes = hours * 60;

  return [
    "MOBILISATION",
    `from=${clean(mobilisation.from_tower_id)}`,
    `to=${clean(mobilisation.to_tower_id)}`,
    `status=${clean(mobilisation.status) || "planning"}`,
    `progress=${Math.max(
      0,
      Math.min(100, num(mobilisation.percent_complete)),
    )}`,
    `started=${clean(mobilisation.started_date)}`,
    `target=${clean(mobilisation.target_move_date)}`,
    `completed=${clean(mobilisation.completed_date)}`,
    `minutes=${minutes}`,
    `hours=${hours}`,
    `workers=${uniqueStrings(mobilisation.worker_names)
      .map((name) => name.replace(/[|,]/g, " "))
      .join(",")}`,
    `notes=${clean(mobilisation.notes)
      .replace(/\|/g, "/")
      .replace(/\n/g, " ")}`,
  ].join("|");
}

export function dateTimeIso(
  docketDate: string,
  time: unknown,
) {
  const value = clean(time);

  if (!/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  return `${docketDate}T${value}:00`;
}

export function docketLocked(docket: any) {
  const status =
    clean(docket?.approval_status) || "legacy";

  if (
    clean(docket?.client_rep_name) &&
    clean(docket?.signed_date)
  ) {
    return true;
  }

  return [
    "submitted_bc",
    "client_pending",
    "final",
    "legacy_final",
  ].includes(status);
}
