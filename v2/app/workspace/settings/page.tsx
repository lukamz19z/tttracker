import { IntegrationHub } from "@/components/integrations/integration-hub";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProjectIdentifierSettings from "./project-identifier-settings";
import { requireWorkspacePermission } from "@/lib/workspace/context";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getProjectNumberConfig } from "@/lib/projects/numbering";
import { workspaceHref } from "@/lib/workspace/navigation";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    organisation?: string;
    section?: string;
    page?: string;
  }>;
}) {
  const query = await searchParams;
  let context;
  try {
    context = await requireWorkspacePermission(
      query.organisation,
      "organisation.settings.view",
    );
  } catch (e) {
    if (
      e instanceof Error &&
      [
        "WORKSPACE_PERMISSION_DENIED",
        "NO_ACTIVE_ORGANISATION_MEMBERSHIP",
        "WORKSPACE_ORGANISATION_ACCESS_DENIED",
      ].includes(e.message)
    )
      return (
        <div>
          <h1>Organisation Settings</h1>
          <p>You do not have permission to view organisation settings.</p>
        </div>
      );
    throw e;
  }
  const admin = createSupabaseAdmin();
  const orgId = context.organisation.organisationId;
  const sections = [
    { key: "organisation", label: "Organisation" },
    { key: "modules", label: "Modules & Subscription" },
    ...(context.permissions?.["organisation.users.view"]
      ? [{ key: "users", label: "Users & Access" }]
      : []),
    { key: "projects", label: "Project Defaults" },
    ...((context.permissions?.["people.configure"] ||
      context.permissions?.["training.configure"]) &&
    context.enabledModules.has("people")
      ? [{ key: "people", label: "People & Onboarding" }]
      : []),
    { key: "integrations", label: "Integrations" },
  ];
  const selected = query.section ?? "projects";
  if (!sections.some((s) => s.key === selected)) notFound();
  const rawPage = Number(query.page ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const canConfigure =
    context.permissions?.["organisation.settings.configure"] === true;
  const config =
    selected === "projects" ? await getProjectNumberConfig(admin, orgId) : null;
  const {
    data: users,
    error: usersError,
    count: userCount,
  } = selected === "users"
    ? await admin
        .from("organisation_users")
        .select("user_id,status", { count: "exact" })
        .eq("organisation_id", orgId)
        .neq("status", "removed")
        .order("user_id")
        .range((page - 1) * 20, page * 20 - 1)
    : { data: null, error: null, count: null };
  const identities = await Promise.all(
    (users ?? []).map(async (membership) => {
      const { data, error } = await admin.auth.admin.getUserById(
        membership.user_id,
      );
      if (error) throw new Error("SETTINGS_USER_IDENTITY_LOOKUP_FAILED");
      return {
        id: membership.user_id,
        status: membership.status,
        name: String(
          data.user?.user_metadata?.full_name ??
            data.user?.user_metadata?.name ??
            data.user?.email ??
            "TTTracker user",
        ),
        email: data.user?.email,
      };
    }),
  );
  const { data: roleRows, error: roleError } =
    selected === "users" && context.permissions?.["organisation.roles.view"]
      ? await admin
          .from("v2_roles")
          .select("id,name,is_active")
          .eq("organisation_id", orgId)
          .order("sort_order")
      : { data: null, error: null };
  if (roleError) throw new Error("SETTINGS_ROLE_LOOKUP_FAILED");
  const { data: invitations, error: invitationsError } =
    selected === "users"
      ? await admin
          .from("v2_organisation_invitations")
          .select("id,email,status")
          .eq("organisation_id", orgId)
          .eq("status", "pending")
      : { data: null, error: null };
  if (usersError || invitationsError)
    throw new Error("SETTINGS_ACCESS_REGISTER_LOOKUP_FAILED");
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Organisation Settings</h1>
      <p style={{ color: "#94a3b8" }}>
        {context.organisation.organisationName}
      </p>
      <div
        style={{
          display: "flex",
          gap: 20,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <nav
          aria-label="Settings navigation"
          style={{ display: "grid", gap: 4, minWidth: 190 }}
        >
          {sections.map((s) => (
            <Link
              key={s.key}
              aria-current={selected === s.key ? "page" : undefined}
              className="tt-button"
              style={{
                textAlign: "left",
                background: selected === s.key ? "#164e63" : undefined,
              }}
              href={`${workspaceHref(orgId, "settings")}&section=${s.key}`}
            >
              {s.label}
            </Link>
          ))}
        </nav>
        <section style={{ flex: "1 1 440px", minWidth: 0 }}>
          <h2 style={{ marginTop: 0, fontSize: 20 }}>
            {sections.find((s) => s.key === selected)?.label}
          </h2>
          {selected === "people" && (
            <div className="tt-card" style={{ padding: 16 }}>
              <p>
                Configure relationship types and training requirements for your
                organisation.
              </p>
              <Link
                className="tt-button"
                href={`${workspaceHref(orgId, "people/settings")}`}
              >
                Open People &amp; Onboarding Settings
              </Link>
              <p style={{ color: "#94a3b8" }}>
                Configurable onboarding templates will be available in the next
                phase.
              </p>
            </div>
          )}
          {selected === "organisation" && (
            <div className="tt-card" style={{ padding: 16 }}>
              <strong>{context.organisation.organisationName}</strong>
              <p>Organisation code: {context.organisation.organisationCode}</p>
              <p>
                Organisation profile changes are managed through tenant setup.
              </p>
            </div>
          )}
          {selected === "projects" &&
            config &&
            (canConfigure ? (
              <ProjectIdentifierSettings
                organisationId={orgId}
                initial={config}
              />
            ) : (
              <p>
                Project numbering is read-only. Configuration permission is
                required to edit it.
              </p>
            ))}
          {selected === "modules" && (
            <div className="tt-card" style={{ padding: 16 }}>
              <p>
                Enabled and entitled modules:{" "}
                {[...context.enabledModules].join(", ") || "None"}
              </p>
              <p>
                Subscription and entitlement changes are managed through
                Platform Administration.
              </p>
            </div>
          )}
          {selected === "users" && (
            <>
              <p>
                TTTracker login access is separate from the People workforce
                register.
              </p>
              <div className="tt-card" style={{ padding: 16 }}>
                {userCount ?? 0} organisation user memberships /{" "}
                {invitations?.length ?? 0} pending invitations
              </div>
              <h3>TTTracker users</h3>
              {identities.map((u) => (
                <div
                  key={u.id}
                  style={{
                    padding: "8px 0",
                    borderBottom: "1px solid #1e293b",
                    display: "flex",
                    gap: 12,
                    justifyContent: "space-between",
                  }}
                >
                  <span>
                    {u.name}
                    <small style={{ display: "block", color: "#94a3b8" }}>
                      {u.email}
                    </small>
                  </span>
                  <span>{u.status}</span>
                </div>
              ))}
              <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
                {page > 1 && (
                  <Link
                    href={`${workspaceHref(orgId, "settings")}&section=users&page=${page - 1}`}
                  >
                    Previous users
                  </Link>
                )}
                {page * 20 < (userCount ?? 0) && (
                  <Link
                    href={`${workspaceHref(orgId, "settings")}&section=users&page=${page + 1}`}
                  >
                    Next users
                  </Link>
                )}
              </div>
              {roleRows && (
                <details style={{ marginTop: 16 }}>
                  <summary>Configured access roles / {roleRows.length}</summary>
                  {roleRows.map((r) => (
                    <p key={r.id}>
                      {r.name} / {r.is_active ? "Active" : "Inactive"}
                    </p>
                  ))}
                </details>
              )}
              <h3>Pending invitations</h3>
              {invitations?.length ? (
                invitations.map((i) => (
                  <div key={i.id} style={{ padding: "8px 0" }}>
                    {i.email} / Pending
                  </div>
                ))
              ) : (
                <p>No pending invitations.</p>
              )}
              <p>
                Role assignments and project membership remain governed by the
                existing dynamic access model. Tenant editing controls are not
                implemented here yet.
              </p>
            </>
          )}
          {selected === "integrations" && <IntegrationHub organisation={orgId} permissions={context.permissions ?? {}} />}
        </section>
      </div>
    </div>
  );
}
