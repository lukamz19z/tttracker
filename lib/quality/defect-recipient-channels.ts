import type { DefectNotificationKind } from "./defect-notifications";

/** Explicit Notify users override automatic channel opt-outs and deduplicate with subscriptions. */
export function mergeDefectRecipientIds(
  automaticIds: Iterable<string>,
  notifyUserIds: Array<string | null | undefined>,
  responsibleUserId: string | null | undefined,
  kind: DefectNotificationKind,
) {
  const recipients = new Set([...automaticIds].map(value => String(value || "").trim()).filter(Boolean));
  for (const value of notifyUserIds) {
    const id = String(value || "").trim();
    if (id) recipients.add(id);
  }
  if (kind !== "created" && kind !== "critical") {
    const id = String(responsibleUserId || "").trim();
    if (id) recipients.add(id);
  }
  return [...recipients];
}
