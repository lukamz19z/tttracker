import type { SupabaseClient } from "@supabase/supabase-js";

import {
  docketEmailShell,
  sendDailyDocketEmail,
} from "@/lib/email/daily-dockets";
import { filterAppNotificationUserIds } from "@/lib/notifications/preferences";
import { defectRequiredByDisplay } from "@/lib/quality/defect-dates";

export type DefectNotificationKind =
  | "created"
  | "critical"
  | "assigned"
  | "status_changed"
  | "action_added"
  | "closed";

type DefectNotificationRule = {
  user_id: string;
  notify_new: boolean;
  notify_status_change: boolean;
  notify_action: boolean;
  notify_closed: boolean;
  notify_critical: boolean;
  notify_assignment?: boolean;
  receives_email: boolean;
  receives_in_app: boolean;
  receives_push: boolean;
};

type DefectForNotification = {
  id: string;
  project_id: string;
  tower_id: string;
  defect_number: string | null;
  severity: string | null;
  status: string | null;
  segment: string | null;
  member_number: string | null;
  description: string | null;
  assigned_to_user_id?: string | null;
  assigned_to_label?: string | null;
  required_by?: string | null;
  work_impact?: string | null;
  affected_activity?: string | null;
  urgency_note?: string | null;
  notify_user_ids?: string[] | null;
};

type Recipient = {
  userId: string;
  email: string | null;
  name: string;
  receivesEmail: boolean;
  receivesInApp: boolean;
  receivesPush: boolean;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function appUrl() {
  let value = clean(
    process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
  );

  if (value && !/^https?:\/\//i.test(value)) value = `https://${value}`;
  return value.replace(/\/$/, "");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function notificationSeverity(
  kind: DefectNotificationKind,
  defectSeverity: string | null,
) {
  if (kind === "closed") return "success";
  if (kind === "critical" || clean(defectSeverity).toLowerCase() === "critical") {
    return "critical";
  }
  if (clean(defectSeverity).toLowerCase() === "major") return "warning";
  return "info";
}

function ruleApplies(
  rule: DefectNotificationRule,
  kind: DefectNotificationKind,
) {
  switch (kind) {
    case "created":
      return rule.notify_new;
    case "critical":
      return rule.notify_critical;
    case "assigned":
      return rule.notify_assignment !== false;
    case "status_changed":
      return rule.notify_status_change;
    case "action_added":
      return rule.notify_action;
    case "closed":
      return rule.notify_closed;
  }
}

async function userIdentity(
  service: SupabaseClient,
  userId: string,
): Promise<{ email: string | null; name: string }> {
  const { data } = await service.auth.admin.getUserById(userId);
  const user = data.user;

  const email = user?.email ?? null;
  const name =
    clean(
      user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        user?.email,
    ) || "TTTracker User";

  return { email, name };
}

function eventTitle(
  kind: DefectNotificationKind,
  defectNumber: string,
  towerLabel?: string | null,
) {
  switch (kind) {
    case "created":
      return `New Defect · ${defectNumber}`;
    case "critical":
      return `CRITICAL DEFECT · ${clean(towerLabel) || "Tower"} · ${defectNumber}`;
    case "assigned":
      return `Defect Assigned · ${clean(towerLabel) || "Tower"} · ${defectNumber}`;
    case "status_changed":
      return `Defect Updated · ${defectNumber}`;
    case "action_added":
      return `Defect Action · ${defectNumber}`;
    case "closed":
      return `Defect Closed · ${defectNumber}`;
  }
}

function eventType(kind: DefectNotificationKind) {
  switch (kind) {
    case "created":
      return "defect_created";
    case "critical":
      return "defect_critical";
    case "assigned":
      return "defect_assigned";
    case "status_changed":
      return "defect_status_changed";
    case "action_added":
      return "defect_action_added";
    case "closed":
      return "defect_closed";
  }
}

export async function notifyDefectEvent({
  service,
  defect,
  kind,
  actorUserId,
  actorLabel,
  issueTypeName,
  projectLabel,
  towerLabel,
  detail,
  docketId,
}: {
  service: SupabaseClient;
  defect: DefectForNotification;
  kind: DefectNotificationKind;
  actorUserId: string | null;
  actorLabel: string;
  issueTypeName?: string | null;
  projectLabel?: string | null;
  towerLabel?: string | null;
  detail?: string | null;
  docketId?: string | null;
}) {
  const { data: rawRules, error: rulesError } = await service
    .from("project_defect_notification_rules")
    .select(
      "user_id,notify_new,notify_status_change,notify_action,notify_closed,notify_critical,notify_assignment,receives_email,receives_in_app,receives_push",
    )
    .eq("project_id", defect.project_id)
    .eq("active", true);

  if (rulesError) throw new Error(rulesError.message);

  const rules = (rawRules ?? []) as DefectNotificationRule[];
  const channels = new Map<
    string,
    { email: boolean; inApp: boolean; push: boolean }
  >();

  for (const rule of rules) {
    if (!ruleApplies(rule, kind)) continue;

    const existing = channels.get(rule.user_id) ?? {
      email: false,
      inApp: false,
      push: false,
    };

    channels.set(rule.user_id, {
      email: existing.email || rule.receives_email,
      inApp: existing.inApp || rule.receives_in_app,
      push: existing.push || rule.receives_push,
    });
  }

  // The assigned person and explicitly selected additional recipients receive
  // direct visibility even when they are not general project recipients.
  if (defect.assigned_to_user_id) {
    const configured = channels.get(defect.assigned_to_user_id);
    channels.set(defect.assigned_to_user_id, {
      // In-app and push are direct assignment channels; email follows the
      // project's configured email preference for this user/event.
      email: configured?.email ?? false,
      inApp: true,
      push: true,
    });
  }

  for (const userId of defect.notify_user_ids || []) {
    if (!clean(userId)) continue;
    const existing = channels.get(userId) ?? { email: false, inApp: false, push: false };
    channels.set(userId, { email: existing.email, inApp: true, push: true });
  }

  if (actorUserId) {
    channels.delete(actorUserId);
  }

  const category = eventType(kind);
  const actionRoute = `/project/${defect.project_id}/tower/${defect.tower_id}/defects`;
  const appEligible = new Set(await filterAppNotificationUserIds(service, [...channels.keys()], category, actionRoute));
  const recipients: Recipient[] = await Promise.all([...channels.entries()].map(async ([userId, selectedChannels]) => {
    const identity = await userIdentity(service, userId);
    return {
      userId,
      email: identity.email,
      name: identity.name,
      receivesEmail: selectedChannels.email,
      receivesInApp: selectedChannels.inApp && appEligible.has(userId),
      receivesPush: selectedChannels.push && appEligible.has(userId),
    };
  }));

  if (recipients.length === 0) {
    return {
      recipients: 0,
      inApp: 0,
      email: 0,
      pushRequested: 0,
    };
  }

  const defectNumber = clean(defect.defect_number) || "Defect";
  const issue = clean(issueTypeName) || "Site issue";
  const location = [
    clean(towerLabel),
    clean(defect.segment),
    clean(defect.member_number)
      ? `Member ${clean(defect.member_number)}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const message = [
    issue,
    location,
    defect.work_impact,
    defect.required_by ? `Required ${defectRequiredByDisplay(defect.required_by)}` : null,
    defect.urgency_note,
    clean(detail) ||
      clean(defect.description) ||
      clean(defect.status),
  ]
    .filter(Boolean)
    .join(" — ");

  const title = eventTitle(kind, defectNumber,towerLabel);
  const severity = notificationSeverity(kind, defect.severity);
  const now = new Date().toISOString();

  const inAppRows = recipients
    .filter((recipient) => recipient.receivesInApp)
    .map((recipient) => ({
      user_id: recipient.userId,
      event_type: eventType(kind),
      title,
      message: ["assigned","created","critical"].includes(kind) && recipient.userId === defect.assigned_to_user_id
        ? `${message} · Assigned to you by ${actorLabel}`
        : message,
      severity,
      read_at: null,
      archived_at: null,
      project_id: defect.project_id,
      fleet_job_id: null,
      asset_type: null,
      asset_id: null,
      docket_id: docketId ?? null,
      action_route: actionRoute,
      action_params: {
        project_id: defect.project_id,
        tower_id: defect.tower_id,
        defect_id: defect.id,
        defect_number: defect.defect_number,
        open: defect.id,
      },
      source_table: "tower_defects",
      source_record_id: defect.id,
      created_at: now,
    }));

  if (inAppRows.length > 0) {
    const { error } = await service
      .from("user_notifications")
      .insert(inAppRows);

    if (error) {
      throw new Error(`Defect in-app notification failed: ${error.message}`);
    }
  }

  const emailRecipients = [
    ...new Set(
      recipients
        .filter(
          (recipient) =>
            recipient.receivesEmail && Boolean(recipient.email),
        )
        .map((recipient) => recipient.email as string),
    ),
  ];

  if (emailRecipients.length > 0) {
    const base = appUrl();
    const defectUrl = base ? `${base}${actionRoute}` : "";

    await sendDailyDocketEmail({
      to: emailRecipients,
      subject: `${title}${towerLabel ? ` · ${towerLabel}` : ""}`,
      html: docketEmailShell(
        title,
        `
          <p>A TTTracker Defect record requires visibility.</p>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;border-collapse:collapse;">
            <tr>
              <td style="padding:7px 0;color:#64748b;width:150px;">Defect</td>
              <td style="padding:7px 0;font-weight:700;color:#0f172a;">${escapeHtml(defectNumber)}</td>
            </tr>
            <tr>
              <td style="padding:7px 0;color:#64748b;">Project</td>
              <td style="padding:7px 0;color:#0f172a;">${escapeHtml(projectLabel || defect.project_id)}</td>
            </tr>
            <tr>
              <td style="padding:7px 0;color:#64748b;">Tower</td>
              <td style="padding:7px 0;color:#0f172a;">${escapeHtml(towerLabel || defect.tower_id)}</td>
            </tr>
            <tr>
              <td style="padding:7px 0;color:#64748b;">Issue</td>
              <td style="padding:7px 0;color:#0f172a;">${escapeHtml(issue)}</td>
            </tr>
            <tr>
              <td style="padding:7px 0;color:#64748b;">Severity</td>
              <td style="padding:7px 0;color:#0f172a;">${escapeHtml(defect.severity || "Minor")}</td>
            </tr>
            <tr>
              <td style="padding:7px 0;color:#64748b;">Status</td>
              <td style="padding:7px 0;color:#0f172a;">${escapeHtml(defect.status || "Open")}</td>
            </tr>
            ${
              location
                ? `<tr><td style="padding:7px 0;color:#64748b;">Location</td><td style="padding:7px 0;color:#0f172a;">${escapeHtml(location)}</td></tr>`
                : ""
            }
            ${
              defect.assigned_to_label
                ? `<tr><td style="padding:7px 0;color:#64748b;">Assigned To</td><td style="padding:7px 0;color:#0f172a;">${escapeHtml(defect.assigned_to_label)}</td></tr>`
                : ""
            }
            <tr>
              <td style="padding:7px 0;color:#64748b;">Updated By</td>
              <td style="padding:7px 0;color:#0f172a;">${escapeHtml(actorLabel)}</td>
            </tr>
          </table>

          ${
            clean(detail)
              ? `<p><strong>Update:</strong> ${escapeHtml(detail)}</p>`
              : ""
          }

          ${
            defectUrl
              ? `
                <p style="margin:24px 0;">
                  <a href="${escapeHtml(defectUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">
                    Open Defect Register
                  </a>
                </p>
              `
              : ""
          }
        `,
      ),
    });
  }

  const pushUserIds = recipients.filter((recipient) => recipient.receivesPush).map((recipient) => recipient.userId);
  let push = 0;
  if (pushUserIds.length) {
    const { data: tokenRows, error: tokenError } = await service.from("user_push_tokens").select("user_id,expo_push_token").in("user_id", pushUserIds).eq("active", true);
    if (tokenError) throw new Error(`Defect push token lookup failed: ${tokenError.message}`);
    const tokens = [...new Map((tokenRows || []).map(row => [clean(row.expo_push_token), row.user_id])).entries()].filter(([token]) => token);
    if (tokens.length) {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "Accept-Encoding": "gzip, deflate" },
        body: JSON.stringify(tokens.map(([to, userId]) => ({
          to, sound: "default", title,
          body: `${message}${["assigned","created","critical"].includes(kind) && userId === defect.assigned_to_user_id ? ` · Assigned to you by ${actorLabel}` : ""}`,
          data: { action_route: "/defects", action_params: { defect_id: defect.id, project_id: defect.project_id, tower_id: defect.tower_id }, defect_id: defect.id, project_id: defect.project_id, tower_id: defect.tower_id },
        }))),
      });
      if (!response.ok) throw new Error(`Defect Expo push failed (${response.status}).`);
      const result = await response.json() as { data?: Array<{status?:string;message?:string}> };
      const failed = (result.data || []).filter(ticket => ticket.status === "error");
      if (failed.length) throw new Error(`Defect Expo push failed: ${failed.map(ticket=>ticket.message).filter(Boolean).join("; ")}`);
      push = tokens.length;
    }
  }

  return {
    recipients: recipients.length,
    inApp: inAppRows.length,
    email: emailRecipients.length,
    push,
  };
}
