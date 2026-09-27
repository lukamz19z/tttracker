import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import InvitationManager from "./invitation-manager";
import { requirePlatformAdmin } from "@/lib/platform/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type Props = {
  params: Promise<{
    organisationId: string;
  }>;
};

function firstRelation<T>(
  value: T | T[] | null | undefined,
): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default async function OrganisationDetailPage({
  params,
}: Props) {
  try {
    await requirePlatformAdmin();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "UNKNOWN_ERROR";

    if (message === "UNAUTHENTICATED") {
      redirect("/login");
    }

    throw error;
  }

  const { organisationId } = await params;
  const supabase = createSupabaseAdmin();

  const { data: organisation } = await supabase
    .from("organisations")
    .select("id, code, name, legal_name, abn, status, created_at")
    .eq("id", organisationId)
    .maybeSingle();

  if (!organisation) {
    notFound();
  }

  const [
    { count: userCount },
    { count: projectCount },
    { data: subscription },
    { data: overrides },
    { data: invitations },
    { data: roles },
    { data: deliveryAttempts },
  ] = await Promise.all([
    supabase
      .from("organisation_users")
      .select("*", { count: "exact", head: true })
      .eq("organisation_id", organisationId)
      .neq("status", "removed"),

    supabase
      .from("v2_projects")
      .select("*", { count: "exact", head: true })
      .eq("organisation_id", organisationId)
      .neq("status", "archived"),

    supabase
      .from("v2_organisation_subscriptions")
      .select(`
        id,
        status,
        billing_cycle,
        starts_at,
        ends_at,
        v2_subscription_plan_versions (
          version,
          v2_subscription_plans (
            plan_key,
            name
          )
        )
      `)
      .eq("organisation_id", organisationId)
      .in("status", ["trial", "active"])
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("v2_organisation_entitlement_overrides")
      .select(`
        id,
        enabled,
        value,
        reason,
        starts_at,
        ends_at,
        v2_features (
          feature_key,
          name,
          feature_type
        )
      `)
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false }),

    supabase
      .from("v2_organisation_invitations")
      .select(`
        id,
        email,
        status,
        intended_role_code,
        last_sent_at,
        send_count,
        last_error,
        provider,
        provider_message_id,
        created_at
      `)
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false }),

    supabase
      .from("v2_roles")
      .select("code, name")
      .eq("organisation_id", organisationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),

    supabase
      .from("v2_invitation_delivery_attempts")
      .select(`
        id,
        invitation_id,
        provider,
        status,
        provider_message_id,
        error_message,
        attempted_at
      `)
      .eq("organisation_id", organisationId)
      .order("attempted_at", { ascending: false }),
  ]);

  const versionRow = firstRelation(
    subscription?.v2_subscription_plan_versions,
  );

  const planRow = versionRow
    ? firstRelation(versionRow.v2_subscription_plans)
    : null;

  const attemptsByInvitation = new Map<
    string,
    Array<{
      id: string;
      status: string;
      provider: string;
      providerMessageId: string | null;
      errorMessage: string | null;
      attemptedAt: string;
    }>
  >();

  for (const attempt of deliveryAttempts ?? []) {
    const existing =
      attemptsByInvitation.get(attempt.invitation_id) ?? [];

    existing.push({
      id: attempt.id,
      status: attempt.status,
      provider: attempt.provider,
      providerMessageId: attempt.provider_message_id,
      errorMessage: attempt.error_message,
      attemptedAt: attempt.attempted_at,
    });

    attemptsByInvitation.set(attempt.invitation_id, existing);
  }

  const invitationRows = (invitations ?? []).map((invitation) => ({
    id: invitation.id,
    email: invitation.email,
    status: invitation.status,
    roleCode: invitation.intended_role_code,
    lastSentAt: invitation.last_sent_at,
    sendCount: invitation.send_count ?? 0,
    lastError: invitation.last_error,
    provider: invitation.provider,
    providerMessageId: invitation.provider_message_id,
    attempts: attemptsByInvitation.get(invitation.id) ?? [],
  }));

  const roleOptions = (roles ?? []).map((role) => ({
    code: role.code,
    name: role.name,
  }));

  return (
    <main style={{ minHeight: "100vh", padding: "32px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Link
          href="/platform-admin"
          style={{ color: "#7dd3fc", fontSize: 14 }}
        >
          ← Organisations
        </Link>

        <div style={{ marginTop: 18, marginBottom: 24 }}>
          <h1 style={{ marginBottom: 6 }}>
            {organisation.name}
          </h1>

          <div style={{ color: "#94a3b8" }}>
            {organisation.code}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 14,
            marginBottom: 20,
          }}
        >
          <Metric label="Users" value={userCount ?? 0} />
          <Metric label="Projects" value={projectCount ?? 0} />
          <Metric label="Plan" value={planRow?.name ?? "None"} />
        </div>

        <InvitationManager
          organisationId={organisationId}
          roles={roleOptions}
          invitations={invitationRows}
        />

        <section
          className="tt-card"
          style={{ padding: 20, marginBottom: 20 }}
        >
          <h2 style={{ marginTop: 0 }}>Subscription</h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 14,
            }}
          >
            <Metric label="Plan" value={planRow?.name ?? "None"} />
            <Metric label="Version" value={versionRow?.version ?? "-"} />
            <Metric label="Status" value={subscription?.status ?? "-"} />
          </div>
        </section>

        <section className="tt-card" style={{ padding: 20 }}>
          <h2 style={{ marginTop: 0 }}>
            Feature overrides
          </h2>

          {!overrides?.length ? (
            <div style={{ color: "#94a3b8" }}>
              No overrides.
            </div>
          ) : (
            <div>
              {overrides.map((override) => {
                const feature = firstRelation(
                  override.v2_features,
                );

                return (
                  <div
                    key={override.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr 2fr",
                      gap: 12,
                      padding: "12px 0",
                      borderBottom: "1px solid #1e293b",
                    }}
                  >
                    <div>
                      {feature?.name ??
                        feature?.feature_key ??
                        "Feature"}
                    </div>

                    <div>
                      {override.enabled === null
                        ? "Value override"
                        : override.enabled
                          ? "Enabled"
                          : "Disabled"}
                    </div>

                    <div style={{ color: "#94a3b8" }}>
                      {override.reason ?? "-"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="tt-card" style={{ padding: 16 }}>
      <div
        style={{
          color: "#64748b",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 6,
          fontWeight: 800,
          fontSize: 18,
        }}
      >
        {value}
      </div>
    </div>
  );
}
