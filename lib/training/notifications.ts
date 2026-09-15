import {
  docketEmailShell,
  sendDailyDocketEmail,
} from "@/lib/email/daily-dockets";
import { createTrainingServiceClient } from "@/lib/training/server";

type TrainingService = ReturnType<typeof createTrainingServiceClient>;

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

type NotificationInput = {
  userIds: string[];
  inAppUserIds?: string[];
  pushUserIds?: string[];
  emailUserIds?: string[];
  emailAddresses?: string[];
  emailSubject?: string;
  emailHtml?: string | null;
  eventType: string;
  title: string;
  message: string;
  severity?: "info" | "success" | "warning" | "critical";
  actionRoute?: string | null;
  actionParams?: Record<string, unknown> | null;
  sourceTable?: string | null;
  sourceRecordId?: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => clean(value))
        .filter(Boolean),
    ),
  );
}

function uniqueEmails(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => clean(value).toLowerCase())
        .filter(Boolean),
    ),
  );
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }

  return result;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function emailAddressesForUsers(
  service: TrainingService,
  userIds: string[],
) {
  const ids = unique(userIds);

  if (ids.length === 0) return [];

  const addresses: string[] = [];

  for (const userId of ids) {
    const {
      data: { user },
      error,
    } = await service.auth.admin.getUserById(userId);

    if (error) {
      console.warn(
        `Could not resolve email for TTTracker user ${userId}:`,
        error.message,
      );
      continue;
    }

    const email = clean(user?.email).toLowerCase();

    if (email) addresses.push(email);
  }

  return uniqueEmails(addresses);
}

async function pushTokensForUsers(
  service: TrainingService,
  userIds: string[],
) {
  const ids = unique(userIds);

  if (ids.length === 0) return [];

  const tokens = new Set<string>();

  const { data: genericTokenData, error: genericTokenError } =
    await service
      .from("user_push_tokens")
      .select("user_id,expo_push_token,active")
      .in("user_id", ids)
      .eq("active", true);

  if (genericTokenError) {
    console.warn(
      "Could not load generic TTTracker push tokens:",
      genericTokenError.message,
    );
  }

  const genericTokens =
    (genericTokenData ?? []) as GenericPushTokenRow[];

  for (const row of genericTokens) {
    const token = clean(row.expo_push_token);

    if (token) tokens.add(token);
  }

  const { data: legacyTokenData, error: legacyTokenError } =
    await service
      .from("fleet_job_notification_preferences")
      .select("user_id,expo_push_token,phone_enabled")
      .in("user_id", ids)
      .eq("phone_enabled", true);

  if (legacyTokenError) {
    console.warn(
      "Could not load legacy TTTracker push tokens:",
      legacyTokenError.message,
    );
  }

  const legacyTokens =
    (legacyTokenData ?? []) as LegacyPushTokenRow[];

  for (const row of legacyTokens) {
    const token = clean(row.expo_push_token);

    if (token) tokens.add(token);
  }

  return Array.from(tokens);
}

async function sendExpoPush({
  service,
  userIds,
  title,
  message,
  actionRoute,
  actionParams,
}: {
  service: TrainingService;
  userIds: string[];
  title: string;
  message: string;
  actionRoute?: string | null;
  actionParams?: Record<string, unknown> | null;
}) {
  const tokens = await pushTokensForUsers(service, userIds);

  if (tokens.length === 0) {
    return { attempted: 0 };
  }

  let attempted = 0;

  for (const group of chunks(tokens, 100)) {
    const body = group.map((token) => ({
      to: token,
      sound: "default",
      title,
      body: message,
      data: {
        action_route: actionRoute ?? null,
        action_params: actionParams ?? null,
        module: "training",
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

    attempted += group.length;

    if (!response.ok) {
      const responseText = await response.text();

      console.warn(
        `Expo Training push failed (${response.status}): ${responseText}`,
      );
    }
  }

  return { attempted };
}


function appUrl() {
  let value = clean(
    process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      "https://tttracker.com.au",
  );

  if (value && !/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  return value.replace(/\/$/, "");
}

function buildActionUrl(
  actionRoute?: string | null,
  actionParams?: Record<string, unknown> | null,
) {
  const route = clean(actionRoute);

  if (!route) return null;

  const base = appUrl();

  if (!base) return null;

  const url = new URL(route, `${base}/`);

  for (const [key, value] of Object.entries(actionParams ?? {})) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function sendTrainingEmailViaExistingPipeline({
  to,
  subject,
  title,
  message,
  html,
  actionRoute,
  actionParams,
}: {
  to: string[];
  subject: string;
  title: string;
  message: string;
  html?: string | null;
  actionRoute?: string | null;
  actionParams?: Record<string, unknown> | null;
}) {
  const recipients = uniqueEmails(to);

  if (recipients.length === 0) {
    return { sent: 0 };
  }

  const actionUrl = buildActionUrl(actionRoute, actionParams);

  const actionLabel =
    clean(actionRoute) === "/people/training/verification"
      ? "Review Training Record"
      : "Open in TTTracker";

  const emailHtml =
    clean(html) ||
    docketEmailShell(
      title,
      `
        <p>${escapeHtml(message)}</p>

        ${
          actionUrl
            ? `
              <p style="margin:24px 0;">
                <a
                  href="${escapeHtml(actionUrl)}"
                  style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;"
                >
                  ${escapeHtml(actionLabel)}
                </a>
              </p>

              <p style="margin:12px 0 0;color:#64748b;font-size:12px;line-height:18px;">
                If the button does not open, copy this link into your browser:<br />
                <a href="${escapeHtml(actionUrl)}" style="color:#2563eb;word-break:break-all;">
                  ${escapeHtml(actionUrl)}
                </a>
              </p>
            `
            : ""
        }

        <p style="margin-top:20px;color:#64748b;font-size:13px;">
          This notification was generated by TTTracker Training.
        </p>
      `,
    );

  await sendDailyDocketEmail({
    to: recipients,
    subject,
    html: emailHtml,
  });

  return { sent: recipients.length };
}

export async function createTrainingNotifications({
  service,
  userIds,
  inAppUserIds,
  pushUserIds,
  emailUserIds,
  emailAddresses,
  emailSubject,
  emailHtml = null,
  eventType,
  title,
  message,
  severity = "info",
  actionRoute = null,
  actionParams = null,
  sourceTable = "employee_training_records",
  sourceRecordId = null,
}: NotificationInput & { service: TrainingService }) {
  const recipients = unique(userIds);

  const inAppRecipients = unique(
    inAppUserIds === undefined ? recipients : inAppUserIds,
  );

  const pushRecipients = unique(
    pushUserIds === undefined ? recipients : pushUserIds,
  );

  const emailRecipientUserIds = unique(emailUserIds ?? []);
  const directEmailAddresses = uniqueEmails(emailAddresses ?? []);

  if (
    recipients.length === 0 &&
    inAppRecipients.length === 0 &&
    pushRecipients.length === 0 &&
    emailRecipientUserIds.length === 0 &&
    directEmailAddresses.length === 0
  ) {
    return {
      inApp: 0,
      pushAttempted: 0,
      emailSent: 0,
    };
  }

  const now = new Date().toISOString();

  // Do not write Training record IDs into user_notifications.event_id.
  // In the existing TTTracker schema, event_id is a foreign key used by
  // the existing notification-event pipeline. Training navigation data
  // belongs in action_params.
  void sourceTable;
  void sourceRecordId;

  const rows = inAppRecipients.map((userId) => ({
    user_id: userId,
    event_type: eventType,
    title,
    message,
    severity,
    read_at: null,
    archived_at: null,
    action_route: actionRoute,
    action_params: actionParams,
    created_at: now,
  }));

  if (rows.length > 0) {
    const { error } = await service
      .from("user_notifications")
      .insert(rows);

    if (error) {
      throw new Error(
        `Could not create Training notifications: ${error.message}`,
      );
    }
  }

  const push = await sendExpoPush({
    service,
    userIds: pushRecipients,
    title,
    message,
    actionRoute,
    actionParams,
  });

  const resolvedUserEmails = await emailAddressesForUsers(
    service,
    emailRecipientUserIds,
  );

  const emailRecipients = uniqueEmails([
    ...resolvedUserEmails,
    ...directEmailAddresses,
  ]);

  let emailSent = 0;

  if (emailRecipients.length > 0) {
    const result = await sendTrainingEmailViaExistingPipeline({
      to: emailRecipients,
      subject: emailSubject || title,
      title,
      message,
      html: emailHtml,
      actionRoute,
      actionParams,
    });

    emailSent = result.sent;
  }

  return {
    inApp: rows.length,
    pushAttempted: push.attempted,
    emailSent,
  };
}
