import {
  Plus,
  Search,
  Upload,
} from "lucide-react";

import {
  ButtonLink,
  EmptyState,
  Page,
  PageHeader,
  StatusBadge,
  tt,
} from "@/components/ui/tt-ui";
import { requireProjectContext } from "@/lib/projects/project-context";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type Props = {
  params: Promise<{
    projectId: string;
  }>;
  searchParams: Promise<{
    organisation?: string;
    q?: string;
  }>;
};

function natural(
  a: string,
  b: string,
) {
  return a.localeCompare(
    b,
    undefined,
    {
      numeric: true,
      sensitivity: "base",
    },
  );
}

export default async function TowersPage({
  params,
  searchParams,
}: Props) {
  const { projectId } = await params;
  const query = await searchParams;

  const context =
    await requireProjectContext(
      projectId,
      query.organisation ?? null,
    );

  const admin = createSupabaseAdmin();

  const { data: towers, error } =
    await admin
      .from("v2_towers")
      .select(`
        id,
        tower_identifier,
        line,
        sequence_number,
        status,
        tower_weight_t,
        assembly_percent,
        erection_percent,
        v2_tower_types (
          name,
          type_code
        )
      `)
      .eq("project_id", projectId);

  if (error) {
    throw new Error(error.message);
  }

  const search =
    String(query.q ?? "")
      .trim()
      .toLowerCase();

  const filtered =
    (towers ?? [])
      .filter((tower) => {
        if (!search) return true;

        const type = Array.isArray(
          tower.v2_tower_types,
        )
          ? tower.v2_tower_types[0]
          : tower.v2_tower_types;

        return [
          tower.tower_identifier,
          tower.line,
          tower.status,
          type?.name,
          type?.type_code,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search);
      })
      .sort((a, b) =>
        natural(
          a.tower_identifier,
          b.tower_identifier,
        ),
      );

  const orgId =
    context.workspace.organisation.organisationId;

  return (
    <Page>
      <PageHeader
        title="Towers"
        subtitle={`${filtered.length} ${
          filtered.length === 1
            ? "Tower"
            : "Towers"
        } in ${context.project.name}.`}
        actions={
          <>
            <ButtonLink
              href={`/workspace/projects/${projectId}/towers/import?organisation=${encodeURIComponent(
                orgId,
              )}`}
              primary
            >
              <Upload size={16} />
              Import towers
            </ButtonLink>

            <ButtonLink
              href={`/workspace/projects/${projectId}/towers/new?organisation=${encodeURIComponent(
                orgId,
              )}`}
            >
              <Plus size={16} />
              Add tower
            </ButtonLink>
          </>
        }
      />


      <div
        className={tt.toolbar}
        style={{ margin: "18px 0" }}
      >
        <form className={tt.search}>
          <input
            type="hidden"
            name="organisation"
            value={orgId}
          />

          <Search
            size={16}
            className={tt.searchIcon}
          />

          <input
            name="q"
            defaultValue={query.q ?? ""}
            placeholder="Search tower, line, type or status..."
            className={tt.searchInput}
          />
        </form>
      </div>

      {filtered.length > 0 ? (
        <div className={tt.card}>
          <div
            className={`${tt.tableWrap} ${tt.desktopTable}`}
            style={{
              border: 0,
              borderRadius: 16,
            }}
          >
            <table className={tt.table}>
              <thead>
                <tr>
                  <th>Tower</th>
                  <th>Type / Line</th>
                  <th>Weight</th>
                  <th>Assembly</th>
                  <th>Erection</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((tower) => {
                  const type = Array.isArray(
                    tower.v2_tower_types,
                  )
                    ? tower.v2_tower_types[0]
                    : tower.v2_tower_types;

                  return (
                    <tr key={tower.id}>
                      <td>
                        <a
                          href={`/workspace/projects/${projectId}/towers/${tower.id}?organisation=${encodeURIComponent(
                            orgId,
                          )}`}
                          className={tt.tableLink}
                        >
                          {tower.tower_identifier}
                        </a>
                        <div className={tt.secondary}>
                          Sequence{" "}
                          {tower.sequence_number ??
                            "-"}
                        </div>
                      </td>

                      <td>
                        <div
                          style={{
                            color: "#e2e8f0",
                            fontWeight: 700,
                          }}
                        >
                          {type?.type_code ||
                            type?.name ||
                            "-"}
                        </div>
                        <div className={tt.secondary}>
                          {tower.line || "No line set"}
                        </div>
                      </td>

                      <td>
                        {tower.tower_weight_t ??
                          "-"}
                        {tower.tower_weight_t
                          ? " t"
                          : ""}
                      </td>

                      <td>
                        {Number(
                          tower.assembly_percent ??
                            0,
                        ).toFixed(0)}
                        %
                      </td>

                      <td>
                        {Number(
                          tower.erection_percent ??
                            0,
                        ).toFixed(0)}
                        %
                      </td>

                      <td>
                        <StatusBadge
                          status={tower.status}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={tt.mobileList}>
            {filtered.map((tower) => {
              const type = Array.isArray(
                tower.v2_tower_types,
              )
                ? tower.v2_tower_types[0]
                : tower.v2_tower_types;

              return (
                <a
                  key={tower.id}
                  href={`/workspace/projects/${projectId}/towers/${tower.id}?organisation=${encodeURIComponent(
                    orgId,
                  )}`}
                  className={tt.mobileRow}
                >
                  <div className={tt.mobileRowHeader}>
                    <div>
                      <div
                        style={{
                          color: "#f8fafc",
                          fontWeight: 800,
                        }}
                      >
                        {tower.tower_identifier}
                      </div>
                      <div className={tt.secondary}>
                        {type?.type_code ||
                          type?.name ||
                          "Type not set"}
                      </div>
                    </div>

                    <StatusBadge
                      status={tower.status}
                    />
                  </div>

                  <div className={tt.mobileRowMeta}>
                    <Meta
                      label="Line"
                      value={tower.line || "-"}
                    />
                    <Meta
                      label="Weight"
                      value={
                        tower.tower_weight_t
                          ? `${tower.tower_weight_t} t`
                          : "-"
                      }
                    />
                    <Meta
                      label="Assembly"
                      value={`${Number(
                        tower.assembly_percent ??
                          0,
                      ).toFixed(0)}%`}
                    />
                    <Meta
                      label="Erection"
                      value={`${Number(
                        tower.erection_percent ??
                          0,
                      ).toFixed(0)}%`}
                    />
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      ) : (
        <EmptyState title="No towers found">
          {search
            ? "No towers match your search."
            : "Import the tower schedule or add an individual tower."}
        </EmptyState>
      )}
    </Page>
  );
}

function Meta({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className={tt.mobileMetaLabel}>
        {label}
      </div>
      <div className={tt.mobileMetaValue}>
        {value}
      </div>
    </div>
  );
}
