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
  eventType: string;
  title: string;
  message: string;
  severity?: "info" | "success" | "warning" | "critical";
  actionRoute?: string | null;
  actionParams?: Record<string, unknown> | null;
  sourceTable?: string | null;
  sourceRecordId?: string | null;
};

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
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
    const token = String(row.expo_push_token ?? "").trim();

    if (token) tokens.add(token);
  }

  // Compatibility with the existing TTTracker Fleet notification settings.
  // Users who already enabled Fleet phone notifications can therefore receive
  // Training pushes before the mobile app has registered the generic token.
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
    const token = String(row.expo_push_token ?? "").trim();

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

export async function createTrainingNotifications({
  service,
  userIds,
  inAppUserIds,
  pushUserIds,
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

  if (
    recipients.length === 0 &&
    inAppRecipients.length === 0 &&
    pushRecipients.length === 0
  ) {
    return {
      inApp: 0,
      pushAttempted: 0,
    };
  }

  const now = new Date().toISOString();

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
    source_table: sourceTable,
    source_record_id: sourceRecordId,
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

  return {
    inApp: rows.length,
    pushAttempted: push.attempted,
  };
}
