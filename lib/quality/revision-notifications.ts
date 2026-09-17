import type { SupabaseClient } from "@supabase/supabase-js";

import {
  docketEmailShell,
  sendDailyDocketEmail,
} from "@/lib/email/daily-dockets";

type RevisionEvent = "created" | "submitted";

type RevisionRow = {
  id: string;
  project_id: string;
  tower_id: string;
  revision_number?: string | null;
  sequence_no?: number | null;
};

type RuleRow = {
  user_id: string;
  notify_created: boolean;
  notify_submitted: boolean;
  receives_email: boolean;
  receives_in_app: boolean;
  receives_push: boolean;
  active: boolean;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function esc(value: unknown) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://www.tttracker.com.au")
    .replace(/\/+$/, "");
}

function rectCode(revision: RevisionRow) {
  return (
    clean(revision.revision_number) ||
    `RECT-${String(Number(revision.sequence_no ?? 1)).padStart(2, "0")}`
  );
}

async function userEmailMap(
  service: SupabaseClient,
  userIds: string[],
) {
  const map = new Map<string, string>();

  await Promise.all(
    userIds.map(async (userId) => {
      const { data } = await service.auth.admin.getUserById(userId);
      const email = clean(data.user?.email);
      if (email) map.set(userId, email);
    }),
  );

  return map;
}

async function sendPush({
  service,
  userIds,
  title,
  message,
  actionParams,
}: {
  service: SupabaseClient;
  userIds: string[];
  title: string;
  message: string;
  actionParams: Record<string, string>;
}) {
  if (!userIds.length) return 0;

  const { data, error } = await service
    .from("user_push_tokens")
    .select("user_id,expo_push_token")
    .in("user_id", userIds)
    .eq("active", true);

  if (error) throw new Error(error.message);

  const tokens = Array.from(
    new Set(
      (data ?? [])
        .map((row) => clean(row.expo_push_token))
        .filter(Boolean),
    ),
  );

  if (!tokens.length) return 0;

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    body: JSON.stringify(
      tokens.map((to) => ({
        to,
        sound: "default",
        title,
        body: message,
        data: {
          action_route: "/revisions",
          action_params: actionParams,
          revision_id: actionParams.revision_id,
          project_id: actionParams.project_id,
          tower_id: actionParams.tower_id,
        },
      })),
    ),
  });

  if (!response.ok) {
    throw new Error(`Expo push failed (${response.status}).`);
  }

  return tokens.length;
}

export async function notifyRevisionEvent({
  service,
  revision,
  event,
  actorLabel,
}: {
  service: SupabaseClient;
  revision: RevisionRow;
  event: RevisionEvent;
  actorLabel?: string | null;
}) {
  const [{ data: project }, { data: tower }, { data: rules, error: ruleError }] =
    await Promise.all([
      service
        .from("projects")
        .select("id,name,project_number")
        .eq("id", revision.project_id)
        .maybeSingle(),
      service
        .from("towers")
        .select("id,name")
        .eq("id", revision.tower_id)
        .maybeSingle(),
      service
        .from("project_revision_notification_rules")
        .select(
          "user_id,notify_created,notify_submitted,receives_email,receives_in_app,receives_push,active",
        )
        .eq("project_id", revision.project_id)
        .eq("active", true),
    ]);

  if (ruleError) throw new Error(ruleError.message);

  const interested = ((rules ?? []) as RuleRow[]).filter((rule) =>
    event === "created" ? rule.notify_created : rule.notify_submitted,
  );

  if (!interested.length) {
    return {
      recipients: 0,
      inApp: 0,
      email: 0,
      push: 0,
      warning: null as string | null,
    };
  }

  const projectCode =
    clean(project?.project_number) || clean(project?.name) || "Project";
  const towerLabel = clean(tower?.name) || "Tower";
  const code = rectCode(revision);
  const titleLabel = `${projectCode} ${towerLabel} ${code}`;

  const title =
    event === "created"
      ? `Revision created · ${titleLabel}`
      : `Revision submitted for review · ${titleLabel}`;

  const message =
    event === "created"
      ? `${titleLabel} was created${actorLabel ? ` by ${actorLabel}` : ""}.`
      : `${titleLabel} is ready for review${actorLabel ? ` and was submitted by ${actorLabel}` : ""}.`;

  const actionParams = {
    revision_id: revision.id,
    project_id: revision.project_id,
    tower_id: revision.tower_id,
  };

  const warnings: string[] = [];
  let inApp = 0;
  let email = 0;
  let push = 0;

  const inAppIds = interested
    .filter((rule) => rule.receives_in_app)
    .map((rule) => rule.user_id);

  if (inAppIds.length) {
    const now = new Date().toISOString();
    const { error } = await service.from("user_notifications").insert(
      inAppIds.map((userId) => ({
        user_id: userId,
        event_type:
          event === "created"
            ? "revision_created"
            : "revision_submitted_for_review",
        title,
        message,
        severity: "info",
        read_at: null,
        archived_at: null,
        action_route: "/revisions",
        action_params: actionParams,
        created_at: now,
      })),
    );

    if (error) {
      warnings.push(`In-app notification failed: ${error.message}`);
    } else {
      inApp = inAppIds.length;
    }
  }

  const emailIds = interested
    .filter((rule) => rule.receives_email)
    .map((rule) => rule.user_id);

  if (emailIds.length) {
    try {
      const emailsById = await userEmailMap(service, emailIds);
      const emails = Array.from(new Set(emailsById.values()));

      if (emails.length) {
        const reviewUrl =
          `${appUrl()}/project/${encodeURIComponent(revision.project_id)}` +
          `/tower/${encodeURIComponent(revision.tower_id)}/revisions`;

        await sendDailyDocketEmail({
          to: emails,
          subject: title,
          html: docketEmailShell(
            event === "created" ? "Revision created" : "Revision ready for review",
            `
              <p>${esc(message)}</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;border-collapse:collapse;">
                <tr><td style="padding:8px 0;color:#64748b;width:150px;">Project</td><td style="padding:8px 0;font-weight:600;">${esc(projectCode)}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;">Tower</td><td style="padding:8px 0;font-weight:600;">${esc(towerLabel)}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;">Revision</td><td style="padding:8px 0;font-weight:600;">${esc(code)}</td></tr>
              </table>
              <p style="margin:24px 0;">
                <a href="${esc(reviewUrl)}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">
                  Open Revision in TTTracker
                </a>
              </p>
            `,
          ),
        });
        email = emails.length;
      }
    } catch (error) {
      warnings.push(
        `Email notification failed${error instanceof Error ? `: ${error.message}` : "."}`,
      );
    }
  }

  const pushIds = interested
    .filter((rule) => rule.receives_push)
    .map((rule) => rule.user_id);

  if (pushIds.length) {
    try {
      push = await sendPush({
        service,
        userIds: pushIds,
        title,
        message,
        actionParams,
      });
    } catch (error) {
      warnings.push(
        `Push notification failed${error instanceof Error ? `: ${error.message}` : "."}`,
      );
    }
  }

  return {
    recipients: interested.length,
    inApp,
    email,
    push,
    warning: warnings.length ? warnings.join(" ") : null,
  };
}
