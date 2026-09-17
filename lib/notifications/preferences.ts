import type { SupabaseClient } from "@supabase/supabase-js";

export type AppNotificationCategory =
  | "expenses"
  | "invoices"
  | "training"
  | "prestarts"
  | "fleet_jobs"
  | "daily_dockets"
  | "defects"
  | "rectifications"
  | "deliveries"
  | "materials"
  | "projects"
  | "general";

type PreferenceRow = {
  user_id: string;
  notifications_enabled: boolean | null;
  expenses_enabled: boolean | null;
  invoices_enabled: boolean | null;
  training_enabled: boolean | null;
  prestarts_enabled: boolean | null;
  fleet_jobs_enabled: boolean | null;
  daily_dockets_enabled: boolean | null;
  defects_enabled: boolean | null;
  rectifications_enabled: boolean | null;
  deliveries_enabled: boolean | null;
  materials_enabled: boolean | null;
  projects_enabled: boolean | null;
  general_enabled: boolean | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => clean(value)).filter(Boolean)),
  );
}

export function notificationCategoryFor(
  eventType: string | null | undefined,
  actionRoute?: string | null,
): AppNotificationCategory {
  const event = clean(eventType).toLowerCase();
  const route = clean(actionRoute).toLowerCase();
  const value = `${event} ${route}`;

  if (value.includes("invoice")) return "invoices";

  if (
    value.includes("expense") ||
    event.startsWith("finance_expense")
  ) {
    return "expenses";
  }

  if (
    value.includes("training") ||
    value.includes("licence") ||
    value.includes("license") ||
    value.includes("voc")
  ) {
    return "training";
  }

  if (value.includes("prestart")) return "prestarts";

  if (
    value.includes("fleet_job") ||
    value.includes("fleet-job") ||
    route.includes("fleet_jobs")
  ) {
    return "fleet_jobs";
  }

  if (
    value.includes("daily_docket") ||
    value.includes("daily-docket") ||
    value.includes("docket") ||
    value.includes("daywork")
  ) {
    return "daily_dockets";
  }

  if (
    value.includes("rectification") ||
    value.includes("revision") ||
    event.startsWith("rec_")
  ) {
    return "rectifications";
  }

  if (value.includes("defect")) return "defects";

  if (
    value.includes("delivery") ||
    value.includes("truck_delivery") ||
    value.includes("truck-delivery")
  ) {
    return "deliveries";
  }

  if (
    value.includes("material") ||
    value.includes("bundle") ||
    value.includes("member")
  ) {
    return "materials";
  }

  if (
    value.includes("project") ||
    value.includes("tower_progress") ||
    value.includes("tower-progress")
  ) {
    return "projects";
  }

  return "general";
}

function categoryEnabled(
  row: PreferenceRow,
  category: AppNotificationCategory,
) {
  if (row.notifications_enabled === false) return false;

  switch (category) {
    case "expenses":
      return row.expenses_enabled !== false;
    case "invoices":
      return row.invoices_enabled !== false;
    case "training":
      return row.training_enabled !== false;
    case "prestarts":
      return row.prestarts_enabled !== false;
    case "fleet_jobs":
      return row.fleet_jobs_enabled !== false;
    case "daily_dockets":
      return row.daily_dockets_enabled !== false;
    case "defects":
      return row.defects_enabled !== false;
    case "rectifications":
      return row.rectifications_enabled !== false;
    case "deliveries":
      return row.deliveries_enabled !== false;
    case "materials":
      return row.materials_enabled !== false;
    case "projects":
      return row.projects_enabled !== false;
    case "general":
      return row.general_enabled !== false;
  }
}

/**
 * Filters APP notification recipients only:
 *   - in-app Notification Centre
 *   - Expo phone push
 *
 * Email recipients are intentionally not passed through this helper.
 *
 * Missing row = enabled for backward compatibility.
 * Query failure = fail open so an issue with the preferences table does not
 * break the underlying TTTracker workflow.
 */
export async function filterAppNotificationUserIds(
  service: SupabaseClient,
  userIds: Array<string | null | undefined>,
  eventType: string | null | undefined,
  actionRoute?: string | null,
) {
  const ids = unique(userIds);

  if (ids.length === 0) return [];

  const category = notificationCategoryFor(
    eventType,
    actionRoute,
  );

  const { data, error } = await service
    .from("user_notification_preferences")
    .select(
      "user_id,notifications_enabled,expenses_enabled,invoices_enabled,training_enabled,prestarts_enabled,fleet_jobs_enabled,daily_dockets_enabled,defects_enabled,rectifications_enabled,deliveries_enabled,materials_enabled,projects_enabled,general_enabled",
    )
    .in("user_id", ids);

  if (error) {
    console.warn(
      "TTTracker notification preferences could not be loaded. Existing notification behaviour will be retained:",
      error.message,
    );
    return ids;
  }

  // Supabase's generated generic result type can become GenericStringError[]
  // when this helper is compiled against a project without a generated Database
  // type containing user_notification_preferences. The query shape above is
  // fixed and the runtime table is created by our migration, so narrow through
  // unknown explicitly rather than relying on an unsafe direct assertion.
  const preferenceRows =
    (data ?? []) as unknown as PreferenceRow[];

  const byUser = new Map(
    preferenceRows.map((row) => [
      row.user_id,
      row,
    ]),
  );

  return ids.filter((userId) => {
    const row = byUser.get(userId);

    if (!row) return true;

    return categoryEnabled(row, category);
  });
}
