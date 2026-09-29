import Link from "next/link";

import { requireWorkspaceContext } from "@/lib/workspace/context";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type Props = {
  searchParams: Promise<{
    organisation?: string;
  }>;
};

export default async function WorkspacePage({
  searchParams,
}: Props) {
  const query = await searchParams;

  const context =
    await requireWorkspaceContext(
      query.organisation ?? null,
    );

  const admin = createSupabaseAdmin();

  const [
    { count: projectCount },
    { count: towerCount },
  ] = await Promise.all([
    admin
      .from("v2_projects")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq(
        "organisation_id",
        context.organisation.organisationId,
      )
      .neq("status", "archived"),

    admin
      .from("v2_towers")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq(
        "organisation_id",
        context.organisation.organisationId,
      ),
  ]);

  return (
    <div style={{ maxWidth: 1100 }}>
      <h1 style={{ marginTop: 0 }}>
        {context.organisation.organisationName}
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(2, minmax(0, 220px))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <Metric
          label="Projects"
          value={projectCount ?? 0}
        />

        <Metric
          label="Towers"
          value={towerCount ?? 0}
        />
      </div>

      <div
        className="tt-card"
        style={{
          marginTop: 20,
          padding: 20,
        }}
      >
        <Link
          href={`/workspace/projects?organisation=${encodeURIComponent(
            context.organisation.organisationId,
          )}`}
          style={{ color: "#7dd3fc" }}
        >
          Projects
        </Link>
      </div>
    </div>
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
    <div className="tt-card" style={{ padding: 18 }}>
      <div
        style={{
          color: "#64748b",
          fontSize: 11,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 26,
          fontWeight: 900,
          marginTop: 6,
        }}
      >
        {value}
      </div>
    </div>
  );
}
