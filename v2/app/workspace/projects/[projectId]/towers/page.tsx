import {
  Plus,
  Search,
  SlidersHorizontal,
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
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    organisation?: string;
    q?: string;
    type?: string;
    line?: string;
    completion?: string;
    sort?: string;
    direction?: string;
    minProgress?: string;
    maxProgress?: string;
  }>;
};

function natural(a: string, b: string) {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function overallProgress(
  assembly: number | null | undefined,
  erection: number | null | undefined,
  assemblyFraction: number,
  erectionFraction: number,
) {
  return (
    Number(assembly ?? 0) * assemblyFraction +
    Number(erection ?? 0) * erectionFraction
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

  const [
    { data: towers, error },
    { data: progressProfile, error: profileError },
  ] = await Promise.all([
    admin
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
        tower_type_id,
        v2_tower_types (
          id,
          name,
          type_code
        )
      `)
      .eq("project_id", projectId),

    admin
      .from("v2_project_progress_profiles")
      .select("assembly_share, erection_share")
      .eq("project_id", projectId)
      .maybeSingle(),
  ]);

  if (error) {
    throw new Error(error.message);
  }

  if (profileError) {
    throw new Error(profileError.message);
  }

  const phaseTotal =
    Math.max(0, Number(progressProfile?.assembly_share ?? 50)) +
    Math.max(0, Number(progressProfile?.erection_share ?? 50));

  const assemblyFraction =
    phaseTotal > 0
      ? Math.max(0, Number(progressProfile?.assembly_share ?? 50)) /
        phaseTotal
      : 0.5;

  const erectionFraction =
    phaseTotal > 0
      ? Math.max(0, Number(progressProfile?.erection_share ?? 50)) /
        phaseTotal
      : 0.5;

  const q = String(query.q ?? "")
    .trim()
    .toLowerCase();

  const typeFilter =
    String(query.type ?? "").trim();
  const lineFilter =
    String(query.line ?? "").trim();
  const completion =
    String(query.completion ?? "").trim();

  const minProgress =
    query.minProgress === undefined ||
    query.minProgress === ""
      ? null
      : Number(query.minProgress);

  const maxProgress =
    query.maxProgress === undefined ||
    query.maxProgress === ""
      ? null
      : Number(query.maxProgress);

  const sort =
    String(query.sort ?? "tower").trim();

  const direction =
    query.direction === "desc"
      ? "desc"
      : "asc";

  const rows = (towers ?? [])
    .filter((tower) => {
      const type = Array.isArray(
        tower.v2_tower_types,
      )
        ? tower.v2_tower_types[0]
        : tower.v2_tower_types;

      const overall = overallProgress(
        tower.assembly_percent,
        tower.erection_percent,
        assemblyFraction,
        erectionFraction,
      );

      if (
        q &&
        ![
          tower.tower_identifier,
          tower.line,
          tower.status,
          type?.name,
          type?.type_code,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }

      if (
        typeFilter &&
        tower.tower_type_id !==
          typeFilter
      ) {
        return false;
      }

      if (
        lineFilter &&
        tower.line !== lineFilter
      ) {
        return false;
      }

      if (
        completion === "not_started" &&
        overall > 0
      ) {
        return false;
      }

      if (
        completion === "in_progress" &&
        (overall <= 0 ||
          overall >= 100)
      ) {
        return false;
      }

      if (
        completion === "complete" &&
        overall < 100
      ) {
        return false;
      }

      if (
        minProgress !== null &&
        Number.isFinite(minProgress) &&
        overall < minProgress
      ) {
        return false;
      }

      if (
        maxProgress !== null &&
        Number.isFinite(maxProgress) &&
        overall > maxProgress
      ) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      const typeA = Array.isArray(
        a.v2_tower_types,
      )
        ? a.v2_tower_types[0]
        : a.v2_tower_types;

      const typeB = Array.isArray(
        b.v2_tower_types,
      )
        ? b.v2_tower_types[0]
        : b.v2_tower_types;

      let result = 0;

      if (sort === "sequence") {
        result =
          Number(
            a.sequence_number ??
              Number.MAX_SAFE_INTEGER,
          ) -
          Number(
            b.sequence_number ??
              Number.MAX_SAFE_INTEGER,
          );
      } else if (sort === "type") {
        result = natural(
          String(
            typeA?.type_code ??
              typeA?.name ??
              "",
          ),
          String(
            typeB?.type_code ??
              typeB?.name ??
              "",
          ),
        );
      } else if (sort === "weight") {
        result =
          Number(a.tower_weight_t ?? 0) -
          Number(b.tower_weight_t ?? 0);
      } else if (sort === "assembly") {
        result =
          Number(
            a.assembly_percent ?? 0,
          ) -
          Number(
            b.assembly_percent ?? 0,
          );
      } else if (sort === "erection") {
        result =
          Number(
            a.erection_percent ?? 0,
          ) -
          Number(
            b.erection_percent ?? 0,
          );
      } else if (
        sort === "progress"
      ) {
        result =
          overallProgress(
            a.assembly_percent,
            a.erection_percent,
            assemblyFraction,
            erectionFraction,
          ) -
          overallProgress(
            b.assembly_percent,
            b.erection_percent,
            assemblyFraction,
            erectionFraction,
          );
      } else {
        result = natural(
          a.tower_identifier,
          b.tower_identifier,
        );
      }

      return direction === "desc"
        ? -result
        : result;
    });

  const typeOptionMap = new Map<string, string>();

  for (const tower of towers ?? []) {
    const type = Array.isArray(
      tower.v2_tower_types,
    )
      ? tower.v2_tower_types[0]
      : tower.v2_tower_types;

    if (type?.id) {
      typeOptionMap.set(
        String(type.id),
        String(
          type.type_code ??
            type.name ??
            "",
        ),
      );
    }
  }

  const typeOptions = Array.from(
    typeOptionMap.entries(),
  ).sort((a, b) =>
    natural(a[1], b[1]),
  );

  const lineOptions = Array.from(
    new Set<string>(
      (towers ?? [])
        .map((tower) => String(tower.line ?? ""))
        .filter(Boolean),
    ),
  ).sort(natural);

  const orgId =
    context.workspace.organisation
      .organisationId;

  const activeFilterCount = [
    q,
    typeFilter,
    lineFilter,
    completion,
    query.minProgress,
    query.maxProgress,
  ].filter(Boolean).length;

  return (
    <Page>
      <PageHeader
        title="Towers"
        subtitle={`${rows.length} of ${
          (towers ?? []).length
        } towers shown.`}
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

      <form
        className={tt.card}
        style={{
          padding: 16,
          marginBottom: 18,
        }}
      >
        <input
          type="hidden"
          name="organisation"
          value={orgId}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(220px,1.4fr) minmax(150px,.8fr) minmax(150px,.8fr) minmax(150px,.8fr) minmax(140px,.8fr) 110px auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <label className={tt.field}>
            <span className={tt.label}>
              Search
            </span>

            <div
              style={{
                position: "relative",
              }}
            >
              <Search
                size={15}
                style={{
                  position: "absolute",
                  left: 11,
                  top: "50%",
                  transform:
                    "translateY(-50%)",
                  color: "#64748b",
                }}
              />

              <input
                className="tt-input"
                style={{
                  paddingLeft: 34,
                }}
                name="q"
                defaultValue={
                  query.q ?? ""
                }
                placeholder="Tower, line, type or status..."
              />
            </div>
          </label>

          <label className={tt.field}>
            <span className={tt.label}>
              Tower type
            </span>

            <select
              className="tt-select"
              name="type"
              defaultValue={typeFilter}
            >
              <option value="">
                All types
              </option>
              {typeOptions.map(
                ([id, label]) => (
                  <option
                    key={id}
                    value={id}
                  >
                    {label}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className={tt.field}>
            <span className={tt.label}>
              Line
            </span>

            <select
              className="tt-select"
              name="line"
              defaultValue={lineFilter}
            >
              <option value="">
                All lines
              </option>
              {lineOptions.map(
                (line) => (
                  <option
                    key={line}
                    value={line}
                  >
                    {line}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className={tt.field}>
            <span className={tt.label}>
              Completion
            </span>

            <select
              className="tt-select"
              name="completion"
              defaultValue={completion}
            >
              <option value="">
                Any progress
              </option>
              <option value="not_started">
                Not started
              </option>
              <option value="in_progress">
                In progress
              </option>
              <option value="complete">
                Complete
              </option>
            </select>
          </label>

          <label className={tt.field}>
            <span className={tt.label}>
              Sort
            </span>

            <select
              className="tt-select"
              name="sort"
              defaultValue={sort}
            >
              <option value="tower">
                Tower
              </option>
              <option value="sequence">
                Sequence
              </option>
              <option value="type">
                Type
              </option>
              <option value="weight">
                Weight
              </option>
              <option value="assembly">
                Assembly %
              </option>
              <option value="erection">
                Erection %
              </option>
              <option value="progress">
                Overall %
              </option>
            </select>
          </label>

          <label className={tt.field}>
            <span className={tt.label}>
              Direction
            </span>

            <select
              className="tt-select"
              name="direction"
              defaultValue={direction}
            >
              <option value="asc">
                Ascending
              </option>
              <option value="desc">
                Descending
              </option>
            </select>
          </label>

          <button
            className={`${tt.button} ${tt.buttonPrimary}`}
          >
            <SlidersHorizontal
              size={14}
            />
            Apply
          </button>
        </div>

        <details
          style={{
            marginTop: 12,
            color: "#94a3b8",
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 750,
            }}
          >
            More filters
            {activeFilterCount > 0
              ? ` · ${activeFilterCount} active`
              : ""}
          </summary>

          <div
            className={tt.formGrid}
            style={{
              marginTop: 12,
              maxWidth: 520,
            }}
          >
            <label className={tt.field}>
              <span className={tt.label}>
                Minimum overall %
              </span>
              <input
                className="tt-input"
                type="number"
                min={0}
                max={100}
                name="minProgress"
                defaultValue={
                  query.minProgress ?? ""
                }
              />
            </label>

            <label className={tt.field}>
              <span className={tt.label}>
                Maximum overall %
              </span>
              <input
                className="tt-input"
                type="number"
                min={0}
                max={100}
                name="maxProgress"
                defaultValue={
                  query.maxProgress ?? ""
                }
              />
            </label>
          </div>
        </details>
      </form>

      {rows.length > 0 ? (
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
                  <th>
                    Type / Line
                  </th>
                  <th>Weight</th>
                  <th>Assembly</th>
                  <th>Erection</th>
                  <th>Overall</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((tower) => {
                  const type =
                    Array.isArray(
                      tower.v2_tower_types,
                    )
                      ? tower
                          .v2_tower_types[0]
                      : tower.v2_tower_types;

                  const overall =
                    overallProgress(
                      tower.assembly_percent,
                      tower.erection_percent,
                      assemblyFraction,
                      erectionFraction,
                    );

                  return (
                    <tr key={tower.id}>
                      <td>
                        <a
                          href={`/workspace/projects/${projectId}/towers/${tower.id}?organisation=${encodeURIComponent(
                            orgId,
                          )}`}
                          className={
                            tt.tableLink
                          }
                        >
                          {
                            tower.tower_identifier
                          }
                        </a>

                        <div
                          className={
                            tt.secondary
                          }
                        >
                          Sequence{" "}
                          {tower.sequence_number ??
                            "-"}
                        </div>
                      </td>

                      <td>
                        <div
                          style={{
                            color:
                              "#e2e8f0",
                            fontWeight: 700,
                          }}
                        >
                          {type?.type_code ||
                            type?.name ||
                            "-"}
                        </div>

                        <div
                          className={
                            tt.secondary
                          }
                        >
                          {tower.line ||
                            "No line set"}
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
                        {overall.toFixed(0)}%
                      </td>

                      <td>
                        <StatusBadge
                          status={
                            tower.status
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            className={tt.mobileList}
          >
            {rows.map((tower) => {
              const type =
                Array.isArray(
                  tower.v2_tower_types,
                )
                  ? tower.v2_tower_types[0]
                  : tower.v2_tower_types;

              const overall =
                overallProgress(
                  tower.assembly_percent,
                  tower.erection_percent,
                  assemblyFraction,
                  erectionFraction,
                );

              return (
                <a
                  key={tower.id}
                  href={`/workspace/projects/${projectId}/towers/${tower.id}?organisation=${encodeURIComponent(
                    orgId,
                  )}`}
                  className={tt.mobileRow}
                >
                  <div
                    className={
                      tt.mobileRowHeader
                    }
                  >
                    <div>
                      <div
                        style={{
                          color:
                            "#f8fafc",
                          fontWeight: 800,
                        }}
                      >
                        {
                          tower.tower_identifier
                        }
                      </div>

                      <div
                        className={
                          tt.secondary
                        }
                      >
                        {type?.type_code ||
                          type?.name ||
                          "Type not set"}
                      </div>
                    </div>

                    <StatusBadge
                      status={tower.status}
                    />
                  </div>

                  <div
                    className={
                      tt.mobileRowMeta
                    }
                  >
                    <Meta
                      label="Line"
                      value={
                        tower.line || "-"
                      }
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
                    <Meta
                      label="Overall"
                      value={`${overall.toFixed(
                        0,
                      )}%`}
                    />
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      ) : (
        <EmptyState title="No towers found">
          Change the filters or import the project tower schedule.
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
      <div
        className={
          tt.mobileMetaLabel
        }
      >
        {label}
      </div>

      <div
        className={
          tt.mobileMetaValue
        }
      >
        {value}
      </div>
    </div>
  );
}
