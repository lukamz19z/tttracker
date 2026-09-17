import type { SupabaseClient } from "@supabase/supabase-js";

type NotificationInput = {
  userId: string;
  eventType: string;
  title: string;
  message: string;
  projectId: string;
  docketId: string;
  actionRoute: string;
  actionParams?: Record<string, unknown>;
  severity?: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

/**
 * Creates one actionable Daily Docket notification for a user.
 *
 * The helper deliberately treats notification delivery as non-blocking for the
 * business workflow: a failed notification is logged, but must not undo a
 * successful docket submission/review.
 *
 * Push delivery remains centralised in the existing TTTracker notification
 * pipeline. This function only writes the canonical user_notifications row.
 */
export async function createDailyDocketNotification(
  service: SupabaseClient,
  input: NotificationInput,
) {
  const userId = clean(input.userId);
  const docketId = clean(input.docketId);
  const eventType = clean(input.eventType);

  if (!userId || !docketId || !eventType) return;

  try {
    const { data: existing, error: existingError } = await service
      .from("user_notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("event_type", eventType)
      .eq("docket_id", docketId)
      .is("archived_at", null)
      .limit(1);

    if (existingError) {
      console.error(
        "Daily Docket notification duplicate check failed",
        existingError,
      );
      return;
    }

    if ((existing ?? []).length > 0) return;

    const { error } = await service.from("user_notifications").insert({
      user_id: userId,
      event_type: eventType,
      title: clean(input.title) || "Daily Docket",
      message: clean(input.message) || "Daily Docket update",
      severity: clean(input.severity) || "info",
      project_id: clean(input.projectId) || null,
      docket_id: docketId,
      action_route: clean(input.actionRoute) || null,
      action_params: input.actionParams ?? {},
      read_at: null,
      archived_at: null,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Daily Docket notification insert failed", error);
    }
  } catch (error) {
    console.error("Daily Docket notification failed", error);
  }
}

/**
 * Removes a completed BC-review item from reviewers' active notification list.
 */
export async function archiveDailyDocketBcReviewNotifications(
  service: SupabaseClient,
  docketId: string,
  archivedAt = new Date().toISOString(),
) {
  const cleanDocketId = clean(docketId);
  if (!cleanDocketId) return;

  try {
    const { error } = await service
      .from("user_notifications")
      .update({ archived_at: archivedAt })
      .eq("docket_id", cleanDocketId)
      .eq("event_type", "daily_docket_bc_review_required")
      .is("archived_at", null);

    if (error) {
      console.error("Daily Docket notification archive failed", error);
    }
  } catch (error) {
    console.error("Daily Docket notification archive failed", error);
  }
}
