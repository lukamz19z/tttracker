import type { SupabaseClient } from "@supabase/supabase-js";

export type DailyDocketReviewerRecipient = {
  userId: string;
  email: string;
  name: string;
  role: string;
};

type UserRoleRow = {
  user_id: string;
  role: string | null;
};

type ProjectAccessRow = {
  user_id: string;
};

type ApprovalRoleRow = {
  role: string | null;
  receives_bc_review?: boolean | null;
};

export function normalizeDailyDocketRole(
  value: string | null | undefined,
): string {
  switch (String(value || "").trim().toLowerCase()) {
    case "site_admin":
    case "administrator":
      return "admin";

    case "commercial_manager":
      return "commercial";

    case "safety":
    case "safety_manager":
      return "hseq";

    case "mechanic":
    case "assets":
      return "asset_manager";

    case "leading_hand":
    case "field":
      return "crew";

    default:
      return String(value || "").trim().toLowerCase();
  }
}

function displayNameFromAuthUser(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}) {
  const metadata = user.user_metadata || {};

  const metadataName =
    String(
      metadata.full_name ||
        metadata.name ||
        metadata.display_name ||
        metadata.preferred_name ||
        "",
    ).trim();

  if (metadataName) return metadataName;

  const email = String(user.email || "").trim();
  if (!email) return "TTTracker User";

  const localPart = email.split("@")[0] || email;

  return localPart
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export async function getConfiguredBcReviewerRoles(
  service: SupabaseClient,
  projectId: string,
): Promise<string[]> {
  const { data, error } = await service
    .from("project_docket_approval_roles")
    .select("role, receives_bc_review")
    .eq("project_id", projectId)
    .eq("receives_bc_review", true);

  if (error) {
    throw new Error(
      `Daily Docket approval roles could not be loaded: ${error.message}`,
    );
  }

  return Array.from(
    new Set(
      ((data || []) as ApprovalRoleRow[])
        .filter((row) => row.receives_bc_review !== false)
        .map((row) => normalizeDailyDocketRole(row.role))
        .filter(Boolean),
    ),
  );
}

export async function isConfiguredBcReviewer(
  service: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<boolean> {
  const reviewerRoles = await getConfiguredBcReviewerRoles(service, projectId);

  if (reviewerRoles.length === 0) return false;

  const { data, error } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `The reviewer role could not be checked: ${error.message}`,
    );
  }

  const userRole = normalizeDailyDocketRole(
    (data as { role?: string | null } | null)?.role,
  );

  return reviewerRoles.includes(userRole);
}

export async function getBcReviewerRecipients(
  service: SupabaseClient,
  projectId: string,
): Promise<DailyDocketReviewerRecipient[]> {
  const reviewerRoles = await getConfiguredBcReviewerRoles(service, projectId);

  if (reviewerRoles.length === 0) {
    return [];
  }

  const [{ data: accessData, error: accessError }, { data: roleData, error: roleError }] =
    await Promise.all([
      service
        .from("project_access")
        .select("user_id")
        .eq("project_id", projectId),
      service
        .from("user_roles")
        .select("user_id, role"),
    ]);

  if (accessError) {
    throw new Error(
      `Project reviewer access could not be loaded: ${accessError.message}`,
    );
  }

  if (roleError) {
    throw new Error(
      `Reviewer roles could not be loaded: ${roleError.message}`,
    );
  }

  const projectUserIds = new Set(
    ((accessData || []) as ProjectAccessRow[])
      .map((row) => String(row.user_id || "").trim())
      .filter(Boolean),
  );

  const matchingUsers = ((roleData || []) as UserRoleRow[])
    .map((row) => ({
      userId: String(row.user_id || "").trim(),
      role: normalizeDailyDocketRole(row.role),
    }))
    .filter(
      (row) =>
        row.userId &&
        projectUserIds.has(row.userId) &&
        reviewerRoles.includes(row.role),
    );

  const uniqueMatchingUsers = Array.from(
    new Map(
      matchingUsers.map((row) => [row.userId, row]),
    ).values(),
  );

  const recipients: DailyDocketReviewerRecipient[] = [];

  for (const reviewer of uniqueMatchingUsers) {
    const { data, error } = await service.auth.admin.getUserById(
      reviewer.userId,
    );

    if (error) {
      console.warn(
        `Daily Docket reviewer ${reviewer.userId} could not be loaded from Supabase Auth`,
        error,
      );
      continue;
    }

    const user = data.user;
    const email = String(user?.email || "").trim().toLowerCase();

    if (!user || !email) continue;

    recipients.push({
      userId: reviewer.userId,
      email,
      name: displayNameFromAuthUser(user),
      role: reviewer.role,
    });
  }

  return Array.from(
    new Map(
      recipients.map((recipient) => [recipient.email, recipient]),
    ).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));
}
