import Link from "next/link";
import { requirePlatformPage } from "@/lib/platform/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
export default async function PlatformAdminPage() {
  await requirePlatformPage();
  const admin = createSupabaseAdmin();
  const definitions = [
    { label: "Organisations", table: "organisations", href: "organisations" },
    {
      label: "Active organisations",
      table: "organisations",
      status: "active",
      href: "organisations",
    },
    {
      label: "Setup in progress",
      table: "v2_organisation_setup_state",
      status: "in_progress",
      href: "organisations",
    },
    {
      label: "Pending invitations",
      table: "v2_organisation_invitations",
      status: "pending",
      href: "invitations",
    },
    {
      label: "Active platform administrators",
      table: "v2_platform_admins",
      status: "active",
      href: "users",
    },
  ];
  const metrics = await Promise.all(
    definitions.map(async (d) => {
      let query = admin
        .from(d.table)
        .select("*", { count: "exact", head: true });
      if (d.status) query = query.eq("status", d.status);
      const { count, error } = await query;
      if (error)
        throw new Error(`PLATFORM_OVERVIEW_LOOKUP_FAILED: ${error.message}`);
      return { ...d, count };
    }),
  );
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Platform overview</h1>
      <p style={{ color: "#94a3b8" }}>
        Manage TTTracker organisations, subscriptions and invitations. Tenant
        data access remains separate.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {metrics.map((m) => (
          <Link
            className="tt-card"
            key={m.label}
            href={`/platform-admin/${m.href}`}
            style={{ padding: 16, minWidth: 170 }}
          >
            <strong style={{ fontSize: 26 }}>{m.count}</strong>
            <div>{m.label}</div>
          </Link>
        ))}
      </div>
      <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
        <Link className="tt-button" href="/platform-admin/organisations">
          Manage organisations
        </Link>
        <Link className="tt-button" href="/platform-admin/plans">
          View plans & modules
        </Link>
      </div>
    </div>
  );
}
