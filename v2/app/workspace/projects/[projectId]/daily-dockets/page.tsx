import {
  CalendarDays,
  ClipboardList,
  Plus,
} from "lucide-react";

import {
  ButtonLink,
  EmptyState,
  MetricCard,
  Page,
  PageHeader,
  tt,
} from "@/components/ui/tt-ui";
import { aggregateMhPerTonne } from "@/lib/dockets/calculations";
import { requireProjectContext } from "@/lib/projects/project-context";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    organisation?: string;
    start?: string;
    end?: string;
    tower?: string;
    crew?: string;
    status?: string;
  }>;
};

export default async function ProjectDailyDocketsPage({
  params,
  searchParams,
}: Props) {
  const { projectId } = await params;
  const query = await searchParams;

  const context = await requireProjectContext(
    projectId,
    query.organisation ?? null,
  );

  const admin = createSupabaseAdmin();

  let docketQuery = admin
    .from("v2_daily_dockets")
    .select(`
      id,
      primary_tower_id,
      docket_date,
      crew_label,
      leading_hand_name,
      raw_manhours,
      production_manhours,
      approval_status,
      created_at
    `)
    .eq("project_id", projectId)
    .order("docket_date", { ascending: false });

  if (query.start) {
    docketQuery = docketQuery.gte("docket_date", query.start);
  }

  if (query.end) {
    docketQuery = docketQuery.lte("docket_date", query.end);
  }

  if (query.tower) {
    docketQuery = docketQuery.eq("primary_tower_id", query.tower);
  }

  if (query.crew) {
    docketQuery = docketQuery.ilike("crew_label", `%${query.crew}%`);
  }

  if (query.status) {
    docketQuery = docketQuery.eq("approval_status", query.status);
  }

  const [
    { data: dockets, error },
    { data: towers },
  ] = await Promise.all([
    docketQuery,
    admin
      .from("v2_towers")
      .select("id, tower_identifier")
      .eq("project_id", projectId),
  ]);

  if (error) throw new Error(error.message);

  const docketIds = (dockets ?? []).map((docket) => docket.id);

  const { data: allocations } =
    docketIds.length > 0
      ? await admin
          .from("v2_docket_tower_allocations")
          .select(
            "docket_id, raw_hours, production_hours, earned_tonnes",
          )
          .in("docket_id", docketIds)
      : { data: [] };

  const metrics = aggregateMhPerTonne(
    (allocations ?? []).map((row) => ({
      rawHours: Number(row.raw_hours ?? 0),
      productionHours: Number(row.production_hours ?? 0),
      earnedTonnes: Number(row.earned_tonnes ?? 0),
    })),
  );

  const towerMap = new Map(
    (towers ?? []).map((tower) => [
      tower.id,
      tower.tower_identifier,
    ]),
  );

  const orgId =
    context.workspace.organisation.organisationId;

  return (
    <Page>
      <PageHeader
        eyebrow={<ClipboardList size={14} />}
        title="Daily Dockets"
        subtitle="Search project dockets by exact dates or date range. Raw MH/t and Production MH/t are calculated from aggregate hours divided by aggregate earned tonnes."
        actions={
          <ButtonLink
            href={`/workspace/projects/${projectId}/daily-dockets/new?organisation=${encodeURIComponent(
              orgId,
            )}`}
            primary
          >
            <Plus size={16} />
            New docket
          </ButtonLink>
        }
      />

      <div className={tt.metricGrid} style={{ marginBottom: 18 }}>
        <MetricCard
          label="Dockets"
          value={(dockets ?? []).length}
        />
        <MetricCard
          label="Earned tonnes"
          value={metrics.earnedTonnes.toFixed(1)}
        />
        <MetricCard
          label="Raw MH/t"
          value={
            metrics.rawMhPerTonne === null
              ? "-"
              : metrics.rawMhPerTonne.toFixed(2)
          }
          detail={`${metrics.rawHours.toFixed(1)} raw MH`}
        />
        <MetricCard
          label="Production MH/t"
          value={
            metrics.productionMhPerTonne === null
              ? "-"
              : metrics.productionMhPerTonne.toFixed(2)
          }
          detail={`${metrics.productionHours.toFixed(1)} production MH`}
        />
      </div>

      <form className={tt.card} style={{ padding: 16, marginBottom: 18 }}>
        <input type="hidden" name="organisation" value={orgId} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(2, minmax(140px, .8fr)) minmax(160px, 1fr) minmax(150px, .8fr) minmax(150px, .8fr) auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <label className={tt.field}>
            <span className={tt.label}>From</span>
            <input className="tt-input" type="date" name="start" defaultValue={query.start ?? ""} />
          </label>

          <label className={tt.field}>
            <span className={tt.label}>To</span>
            <input className="tt-input" type="date" name="end" defaultValue={query.end ?? ""} />
          </label>

          <label className={tt.field}>
            <span className={tt.label}>Tower</span>
            <select className="tt-select" name="tower" defaultValue={query.tower ?? ""}>
              <option value="">All towers</option>
              {(towers ?? [])
                .sort((a, b) =>
                  String(a.tower_identifier).localeCompare(
                    String(b.tower_identifier),
                    undefined,
                    { numeric: true },
                  ),
                )
                .map((tower) => (
                  <option key={tower.id} value={tower.id}>
                    {tower.tower_identifier}
                  </option>
                ))}
            </select>
          </label>

          <label className={tt.field}>
            <span className={tt.label}>Crew</span>
            <input className="tt-input" name="crew" defaultValue={query.crew ?? ""} placeholder="Crew..." />
          </label>

          <label className={tt.field}>
            <span className={tt.label}>Status</span>
            <select className="tt-select" name="status" defaultValue={query.status ?? ""}>
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
            </select>
          </label>

          <button className={`${tt.button} ${tt.buttonPrimary}`}>
            Search
          </button>
        </div>
      </form>

      {(dockets ?? []).length > 0 ? (
        <div className={tt.tableWrap}>
          <table className={tt.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Tower</th>
                <th>Crew</th>
                <th>Leading hand</th>
                <th>Raw MH</th>
                <th>Production MH</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {(dockets ?? []).map((docket) => (
                <tr key={docket.id}>
                  <td>
                    <a
                      className={tt.tableLink}
                      href={`/workspace/projects/${projectId}/daily-dockets/${docket.id}?organisation=${encodeURIComponent(
                        orgId,
                      )}`}
                    >
                      {docket.docket_date}
                    </a>
                  </td>
                  <td>
                    {docket.primary_tower_id
                      ? towerMap.get(docket.primary_tower_id) ?? "-"
                      : "Multiple / project"}
                  </td>
                  <td>{docket.crew_label || "-"}</td>
                  <td>{docket.leading_hand_name || "-"}</td>
                  <td>{Number(docket.raw_manhours ?? 0).toFixed(1)}</td>
                  <td>
                    {Number(
                      docket.production_manhours ?? 0,
                    ).toFixed(1)}
                  </td>
                  <td>{docket.approval_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No Daily Dockets found">
          Change the date filters or create a new project Daily Docket.
        </EmptyState>
      )}
    </Page>
  );
}
