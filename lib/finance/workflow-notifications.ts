
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  docketEmailShell,
  sendDailyDocketEmail,
} from "@/lib/email/daily-dockets";

export type FinanceSubmissionType = "expense_claim" | "invoice";

type FinanceSettings = {
  approval_email_enabled: boolean | null;
  approval_in_app_enabled: boolean | null;
  approval_push_enabled: boolean | null;
};

type FinanceRuleRow = {
  user_id: string | null;
  receives_email: boolean | null;
  receives_in_app: boolean | null;
  receives_push: boolean | null;
  can_review_edit: boolean | null;
  can_approve: boolean | null;
};

type ReviewerChannels = {
  userId: string;
  email: boolean;
  inApp: boolean;
  push: boolean;
};

type GenericPushTokenRow = {
  user_id: string;
  expo_push_token: string | null;
  active: boolean | null;
};

type LegacyPushTokenRow = {
  user_id: string;
  expo_push_token: string | null;
  phone_enabled: boolean | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function unique(values: (string | null | undefined)[]) {
  return Array.from(
    new Set(values.map((value) => clean(value)).filter(Boolean)),
  );
}

function chunks<T>(items: T[], size: number) {
  const output: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }

  return output;
}

function appUrl() {
  let value = clean(
    process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
  );

  if (value && !/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  if (!value) {
    throw new Error("Set NEXT_PUBLIC_APP_URL for TTTracker.");
  }

  const url = new URL(value);

  if (url.hostname.toLowerCase() === "tttracker.com.au") {
    url.hostname = "www.tttracker.com.au";
  }

  return url.toString().replace(/\/$/, "");
}

function financeOpenUrl(
  submissionType: FinanceSubmissionType,
  submissionId: string,
) {
  const kind = submissionType === "invoice" ? "invoice" : "expense";

  return `${appUrl()}/open/approvals/${kind}/${encodeURIComponent(
    submissionId,
  )}`;
}

function mobileApprovalRoute(
  submissionType: FinanceSubmissionType,
  submissionId: string,
) {
  return submissionType === "invoice"
    ? `/approvals/invoices/${encodeURIComponent(submissionId)}`
    : `/approvals/expenses/${encodeURIComponent(submissionId)}`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadSettings(
  service: SupabaseClient,
): Promise<FinanceSettings> {
  const { data, error } = await service
    .from("financial_settings")
    .select(
      "approval_email_enabled,approval_in_app_enabled,approval_push_enabled",
    )
    .eq("id", true)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    approval_email_enabled: data?.approval_email_enabled ?? true,
    approval_in_app_enabled: data?.approval_in_app_enabled ?? true,
    approval_push_enabled: data?.approval_push_enabled ?? true,
  };
}

export async function getConfiguredFinanceReviewers(
  service: SupabaseClient,
  submissionType: FinanceSubmissionType,
): Promise<ReviewerChannels[]> {
  const { data, error } = await service
    .from("financial_access_rules")
    .select(
      "user_id,receives_email,receives_in_app,receives_push,can_review_edit,can_approve",
    )
    .eq("active", true)
    .eq("principal_type", "user")
    .or(`applies_to.eq.all,applies_to.eq.${submissionType}`);

  if (error) throw new Error(error.message);

  const byUser = new Map<string, ReviewerChannels>();

  for (const row of (data ?? []) as FinanceRuleRow[]) {
    const userId = clean(row.user_id);

    if (!userId || (!row.can_review_edit && !row.can_approve)) {
      continue;
    }

    const existing = byUser.get(userId) ?? {
      userId,
      email: false,
      inApp: false,
      push: false,
    };

    existing.email ||= row.receives_email !== false;
    existing.inApp ||= row.receives_in_app !== false;
    existing.push ||= row.receives_push !== false;

    byUser.set(userId, existing);
  }

  return Array.from(byUser.values());
}

async function emailAddressesForUsers(
  service: SupabaseClient,
  userIds: string[],
) {
  const addresses: string[] = [];

  for (const userId of unique(userIds)) {
    const {
      data: { user },
      error,
    } = await service.auth.admin.getUserById(userId);

    if (error) {
      console.warn(
        `Could not resolve Finance reviewer email for ${userId}:`,
        error.message,
      );
      continue;
    }

    const email = clean(user?.email).toLowerCase();
    if (email) addresses.push(email);
  }

  return unique(addresses);
}

async function pushTokensForUsers(
  service: SupabaseClient,
  userIds: string[],
) {
  const ids = unique(userIds);
  if (!ids.length) return [];

  const tokens = new Set<string>();

  const { data: genericData, error: genericError } = await service
    .from("user_push_tokens")
    .select("user_id,expo_push_token,active")
    .in("user_id", ids)
    .eq("active", true);

  if (genericError) {
    console.warn(
      "Could not load generic TTTracker push tokens:",
      genericError.message,
    );
  }

  for (const row of (genericData ?? []) as GenericPushTokenRow[]) {
    const token = clean(row.expo_push_token);
    if (token) tokens.add(token);
  }

  const { data: legacyData, error: legacyError } = await service
    .from("fleet_job_notification_preferences")
    .select("user_id,expo_push_token,phone_enabled")
    .in("user_id", ids)
    .eq("phone_enabled", true);

  if (legacyError) {
    console.warn(
      "Could not load legacy TTTracker push tokens:",
      legacyError.message,
    );
  }

  for (const row of (legacyData ?? []) as LegacyPushTokenRow[]) {
    const token = clean(row.expo_push_token);
    if (token) tokens.add(token);
  }

  return Array.from(tokens);
}

async function createInAppNotifications({
  service,
  userIds,
  eventType,
  title,
  message,
  actionRoute,
  actionParams,
}: {
  service: SupabaseClient;
  userIds: string[];
  eventType: string;
  title: string;
  message: string;
  actionRoute: string;
  actionParams: Record<string, unknown>;
}) {
  const recipients = unique(userIds);

  if (!recipients.length) return 0;

  const now = new Date().toISOString();

  // Deliberately keep this insert to the notification columns already used
  // by TTTracker's established notification pipeline. Finance record IDs live
  // in action_params, avoiding legacy event/source foreign-key conflicts.
  const rows = recipients.map((userId) => ({
    user_id: userId,
    event_type: eventType,
    title,
    message,
    severity: "info",
    read_at: null,
    archived_at: null,
    action_route: actionRoute,
    action_params: actionParams,
    created_at: now,
  }));

  const { error } = await service
    .from("user_notifications")
    .insert(rows);

  if (error) {
    throw new Error(error.message);
  }

  return rows.length;
}

async function sendExpoPush({
  service,
  userIds,
  title,
  message,
  actionRoute,
  actionParams,
}: {
  service: SupabaseClient;
  userIds: string[];
  title: string;
  message: string;
  actionRoute: string;
  actionParams: Record<string, unknown>;
}) {
  const tokens = await pushTokensForUsers(service, userIds);

  if (!tokens.length) {
    return { attempted: 0, tokenCount: 0 };
  }

  let attempted = 0;

  for (const group of chunks(tokens, 100)) {
    const body = group.map((token) => ({
      to: token,
      sound: "default",
      title,
      body: message,
      data: {
        action_route: actionRoute,
        action_params: actionParams,
        module: "finance",
      },
    }));

    const response = await fetch(
      "https://exp.host/--/api/v2/push/send",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const responseText = await response.text();

      throw new Error(
        `Expo push request failed (${response.status}): ${responseText}`,
      );
    }

    attempted += group.length;
  }

  return {
    attempted,
    tokenCount: tokens.length,
  };
}

export async function notifyFinanceUsers({
  service,
  userIds,
  eventType,
  title,
  message,
  submissionType,
  submissionId,
}: {
  service: SupabaseClient;
  userIds: string[];
  eventType: string;
  title: string;
  message: string;
  submissionType: FinanceSubmissionType;
  submissionId: string;
}) {
  const settings = await loadSettings(service);
  const recipients = unique(userIds);
  const actionRoute = mobileApprovalRoute(
    submissionType,
    submissionId,
  );
  const actionParams = {
    submission_id: submissionId,
    submission_type: submissionType,
  };

  let inAppCreated = 0;
  let pushAttempted = 0;
  const warnings: string[] = [];

  if (
    settings.approval_in_app_enabled !== false &&
    recipients.length
  ) {
    try {
      inAppCreated = await createInAppNotifications({
        service,
        userIds: recipients,
        eventType,
        title,
        message,
        actionRoute,
        actionParams,
      });
    } catch (error) {
      console.error("Finance in-app notification failed:", error);
      warnings.push(
        `In-app notification could not be created${
          error instanceof Error ? `: ${error.message}` : "."
        }`,
      );
    }
  }

  if (
    settings.approval_push_enabled !== false &&
    recipients.length
  ) {
    try {
      const push = await sendExpoPush({
        service,
        userIds: recipients,
        title,
        message,
        actionRoute,
        actionParams,
      });

      pushAttempted = push.attempted;

      if (push.tokenCount === 0) {
        warnings.push(
          "Push is enabled, but none of the recipient accounts currently has a registered TTTracker app device.",
        );
      }
    } catch (error) {
      console.error("Finance push notification failed:", error);
      warnings.push(
        `Push notification could not be sent${
          error instanceof Error ? `: ${error.message}` : "."
        }`,
      );
    }
  }

  return {
    inAppCreated,
    pushAttempted,
    warning: warnings.length ? warnings.join(" ") : null,
  };
}

export async function notifyFinanceReviewers({
  service,
  submissionType,
  submissionId,
  submissionNumber,
  projectId,
  title,
  message,
  emailHeading,
  emailBodyHtml,
}: {
  service: SupabaseClient;
  submissionType: FinanceSubmissionType;
  submissionId: string;
  submissionNumber: string;
  projectId: string | null;
  title: string;
  message: string;
  emailHeading: string;
  emailBodyHtml: string;
}) {
  void projectId;

  const [settings, reviewers] = await Promise.all([
    loadSettings(service),
    getConfiguredFinanceReviewers(service, submissionType),
  ]);

  if (!reviewers.length) {
    throw new Error(
      `No ${
        submissionType === "invoice"
          ? "Invoice"
          : "Expense Claim"
      } reviewers are configured in Finance Settings.`,
    );
  }

  const actionRoute = mobileApprovalRoute(
    submissionType,
    submissionId,
  );

  const actionParams = {
    submission_id: submissionId,
    submission_type: submissionType,
  };

  const inAppIds =
    settings.approval_in_app_enabled === false
      ? []
      : reviewers
          .filter((reviewer) => reviewer.inApp)
          .map((reviewer) => reviewer.userId);

  const emailIds =
    settings.approval_email_enabled === false
      ? []
      : reviewers
          .filter((reviewer) => reviewer.email)
          .map((reviewer) => reviewer.userId);

  const pushIds =
    settings.approval_push_enabled === false
      ? []
      : reviewers
          .filter((reviewer) => reviewer.push)
          .map((reviewer) => reviewer.userId);

  const warnings: string[] = [];
  let inAppCreated = 0;
  let emailsSent = 0;
  let pushAttempted = 0;

  if (inAppIds.length) {
    try {
      inAppCreated = await createInAppNotifications({
        service,
        userIds: inAppIds,
        eventType:
          submissionType === "invoice"
            ? "finance_invoice_submitted"
            : "finance_expense_submitted",
        title,
        message,
        actionRoute,
        actionParams,
      });
    } catch (error) {
      console.error("Finance in-app notification failed:", error);
      warnings.push(
        `In-app approval notification could not be created${
          error instanceof Error ? `: ${error.message}` : "."
        }`,
      );
    }
  }

  if (emailIds.length) {
    try {
      const emails = await emailAddressesForUsers(
        service,
        emailIds,
      );

      if (emails.length) {
        const reviewUrl = financeOpenUrl(
          submissionType,
          submissionId,
        );

        await sendDailyDocketEmail({
          to: emails,
          subject: `${emailHeading} · ${submissionNumber}`,
          html: docketEmailShell(
            emailHeading,
            `${emailBodyHtml}
             <p style="margin:24px 0;">
               <a href="${escapeHtml(
                 reviewUrl,
               )}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">
                 Open in TTTracker
               </a>
             </p>
             <p style="color:#64748b;font-size:12px;">
               If the TTTracker app is installed, this button opens the native approval. Otherwise it falls back to the website.
             </p>`,
          ),
        });

        emailsSent = emails.length;
      }
    } catch (error) {
      console.error("Finance reviewer email failed:", error);
      warnings.push("Reviewer email could not be sent.");
    }
  }

  if (pushIds.length) {
    try {
      const push = await sendExpoPush({
        service,
        userIds: pushIds,
        title,
        message,
        actionRoute,
        actionParams,
      });

      pushAttempted = push.attempted;

      if (push.tokenCount === 0) {
        warnings.push(
          "Push is enabled, but none of the configured reviewer accounts currently has a registered TTTracker app device.",
        );
      }
    } catch (error) {
      console.error("Finance push notification failed:", error);
      warnings.push(
        `Push notification could not be sent${
          error instanceof Error ? `: ${error.message}` : "."
        }`,
      );
    }
  }

  return {
    reviewers: reviewers.length,
    channels: {
      inAppCreated,
      emailsSent,
      pushAttempted,
    },
    warning: warnings.length ? warnings.join(" ") : null,
  };
}
