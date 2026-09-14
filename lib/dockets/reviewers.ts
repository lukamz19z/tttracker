import type { SupabaseClient } from "@supabase/supabase-js";

export type DailyDocketReviewerRecipient = {
  userId: string;
  email: string;
  name: string;
  role: string;
};

type ApprovalUserRow = {
  user_id: string | null;
  receives_bc_review?: boolean | null;
};

type UserRoleRow = {
  user_id: string;
  role: string | null;
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

  const metadataName = String(
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

/**
 * Returns the exact TTTracker user IDs configured to receive/review
 * Daily Dockets for this project.
 *
 * This is the source of truth for BC reviewer selection.
 *
 * Reviewer selection is deliberately independent of:
 * - the user's global website role;
 * - their project_access role;
 * - Commercial/Admin/HSEQ role groups.
 *
 * If an Administrator explicitly selects a user in Approval Settings,
 * that user is a configured BC Daily Docket reviewer for the project.
 */
export async function getConfiguredBcReviewerUserIds(
  service: SupabaseClient,
  projectId: string,
): Promise<string[]> {
  const { data, error } = await service
    .from("project_docket_approval_users")
    .select("user_id, receives_bc_review")
    .eq("project_id", projectId)
    .eq("receives_bc_review", true);

  if (error) {
    throw new Error(
      `Daily Docket reviewers could not be loaded: ${error.message}`,
    );
  }

  return Array.from(
    new Set(
      ((data || []) as ApprovalUserRow[])
        .filter((row) => row.receives_bc_review !== false)
        .map((row) => String(row.user_id || "").trim())
        .filter(Boolean),
    ),
  );
}

/**
 * Backwards-compatible export.
 *
 * The approval workflow is no longer role-driven, however older pages/helpers
 * may still import getConfiguredBcReviewerRoles(). Rather than breaking those
 * callers immediately, this returns the actual website roles of the explicitly
 * configured reviewers.
 *
 * IMPORTANT:
 * Do not use this function to decide who is allowed to review a docket.
 * Use isConfiguredBcReviewer() for authorisation.
 */
export async function getConfiguredBcReviewerRoles(
  service: SupabaseClient,
  projectId: string,
): Promise<string[]> {
  const reviewerUserIds = await getConfiguredBcReviewerUserIds(
    service,
    projectId,
  );

  if (reviewerUserIds.length === 0) return [];

  const { data, error } = await service
    .from("user_roles")
    .select("user_id, role")
    .in("user_id", reviewerUserIds);

  if (error) {
    throw new Error(
      `Configured Daily Docket reviewer roles could not be loaded: ${error.message}`,
    );
  }

  return Array.from(
    new Set(
      ((data || []) as UserRoleRow[])
        .map((row) => normalizeDailyDocketRole(row.role))
        .filter(Boolean),
    ),
  );
}

/**
 * Checks whether a specific signed-in user was explicitly selected as a
 * Daily Docket reviewer for the project.
 *
 * This replaces the old logic:
 *   configured roles -> user's role -> project_access
 *
 * with:
 *   project_docket_approval_users -> exact user_id
 */
export async function isConfiguredBcReviewer(
  service: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<boolean> {
  const cleanUserId = String(userId || "").trim();

  if (!projectId || !cleanUserId) return false;

  const { data, error } = await service
    .from("project_docket_approval_users")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("user_id", cleanUserId)
    .eq("receives_bc_review", true)
    .maybeSingle();

  if (error) {
    throw new Error(
      `The Daily Docket reviewer assignment could not be checked: ${error.message}`,
    );
  }

  return Boolean(data?.user_id);
}

/**
 * Resolves the exact people configured in Approval Settings into email
 * recipients for the BC review notification.
 *
 * Only users listed in project_docket_approval_users are returned.
 *
 * Project access is NOT required here because the Approval Settings page allows
 * an Administrator to deliberately configure an active TTTracker user as a
 * project-specific reviewer independently of their normal role.
 *
 * The BC Review route itself should also call isConfiguredBcReviewer() before
 * allowing the reviewer to action the docket.
 */
export async function getBcReviewerRecipients(
  service: SupabaseClient,
  projectId: string,
): Promise<DailyDocketReviewerRecipient[]> {
  const reviewerUserIds = await getConfiguredBcReviewerUserIds(
    service,
    projectId,
  );

  if (reviewerUserIds.length === 0) {
    return [];
  }

  // Role is retained in the returned shape for compatibility with existing
  // email templates / audit information, but it no longer determines whether
  // somebody is a reviewer.
  const { data: roleData, error: roleError } = await service
    .from("user_roles")
    .select("user_id, role")
    .in("user_id", reviewerUserIds);

  if (roleError) {
    console.warn(
      "Configured Daily Docket reviewer roles could not be loaded. Reviewers will still be resolved by user ID.",
      roleError,
    );
  }

  const roleByUserId = new Map(
    ((roleData || []) as UserRoleRow[]).map((row) => [
      String(row.user_id || "").trim(),
      normalizeDailyDocketRole(row.role),
    ]),
  );

  const recipients: DailyDocketReviewerRecipient[] = [];

  for (const reviewerUserId of reviewerUserIds) {
    const { data, error } = await service.auth.admin.getUserById(
      reviewerUserId,
    );

    if (error) {
      console.warn(
        `Daily Docket reviewer ${reviewerUserId} could not be loaded from Supabase Auth`,
        error,
      );
      continue;
    }

    const user = data.user;
    const email = String(user?.email || "").trim().toLowerCase();

    if (!user || !email) {
      console.warn(
        `Daily Docket reviewer ${reviewerUserId} does not have an email address and will not receive the review notification.`,
      );
      continue;
    }

    recipients.push({
      userId: reviewerUserId,
      email,
      name: displayNameFromAuthUser(user),
      role: roleByUserId.get(reviewerUserId) || "reviewer",
    });
  }

  return Array.from(
    new Map(
      recipients.map((recipient) => [
        recipient.email.toLowerCase(),
        recipient,
      ]),
    ).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));
}
