import { ClipboardList } from "lucide-react";

import {
  MetricCard,
  Page,
  PageHeader,
  tt,
} from "@/components/ui/tt-ui";
import { aggregateMhPerTonne } from "@/lib/dockets/calculations";
import { requireProjectContext } from "@/lib/projects/project-context";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type Props = {
  params: Promise<{
    projectId: string;
    docketId: string;
  }>;
  searchParams: Promise<{
    organisation?: string;
  }>;
};

export default async function DailyDocketDetailPage({
  params,
  searchParams,
}: Props) {
  const { projectId, docketId } = await params;
  const query = await searchParams;

  const context = await requireProjectContext(
    projectId,
    query.organisation ?? null,
  );

  const admin = createSupabaseAdmin();

  const [
    { data: docket, error },
    { data: labour },
    { data: plant },
    { data: delays },
    { data: allocations },
    { data: materials },
    { data: towers },
  ] = await Promise.all([
    admin
      .from("v2_daily_dockets")
      .select("*")
      .eq("id", docketId)
      .eq("project_id", projectId)
      .single(),

    admin
      .from("v2_docket_labour")
      .select("*")
      .eq("docket_id", docketId)
      .order("worker_name"),

    admin
      .from("v2_docket_plant")
      .select("*")
      .eq("docket_id", docketId),

    admin
      .from("v2_docket_delays")
      .select("*")
      .eq("docket_id", docketId),

    admin
      .from("v2_docket_tower_allocations")
      .select("*")
      .eq("docket_id", docketId),

    admin
      .from("v2_material_events")
      .select("*")
      .eq("docket_id", docketId)
      .order("occurred_at"),

    admin
      .from("v2_towers")
      .select("id, tower_identifier")
      .eq("project_id", projectId),
  ]);

  if (error || !docket) {
    throw new Error(error?.message ?? "Daily Docket not found.");
  }

  const towerMap = new Map(
    (towers ?? []).map((tower) => [
      tower.id,
      tower.tower_identifier,
    ]),
  );

  const metrics = aggregateMhPerTonne(
    (allocations ?? []).map((row) => ({
      rawHours: Number(row.raw_hours ?? 0),
      productionHours: Number(row.production_hours ?? 0),
      earnedTonnes: Number(row.earned_tonnes ?? 0),
    })),
  );

  return (
    <Page className={tt.stack}>
      <PageHeader
        eyebrow={<ClipboardList size={14} />}
        title={`Daily Docket · ${docket.docket_date}`}
        subtitle={[
          docket.crew_label,
          docket.leading_hand_name,
          docket.approval_status,
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      <div className={tt.metricGrid}>
        <MetricCard
          label="Raw MH"
          value={Number(docket.raw_manhours ?? 0).toFixed(2)}
        />
        <MetricCard
          label="Production MH"
          value={Number(docket.production_manhours ?? 0).toFixed(2)}
        />
        <MetricCard
          label="Raw MH/t"
          value={
            metrics.rawMhPerTonne === null
              ? "-"
              : metrics.rawMhPerTonne.toFixed(2)
          }
          detail={`${metrics.earnedTonnes.toFixed(2)} earned t`}
        />
        <MetricCard
          label="Production MH/t"
          value={
            metrics.productionMhPerTonne === null
              ? "-"
              : metrics.productionMhPerTonne.toFixed(2)
          }
          detail={`${metrics.earnedTonnes.toFixed(2)} earned t`}
        />
      </div>

      <section className={tt.card}>
        <div className={tt.cardHeader}>
          <div>
            <h2 className={tt.cardTitle}>Tower allocations</h2>
            <p className={tt.cardDescription}>
              MH/t is calculated from the aggregate hours and earned tonnes,
              never by averaging per-tower ratios.
            </p>
          </div>
        </div>

        <div className={tt.tableWrap} style={{ border: 0, borderRadius: 0 }}>
          <table className={tt.table}>
            <thead>
              <tr>
                <th>Tower</th>
                <th>Raw MH</th>
                <th>Production MH</th>
                <th>Progress gain</th>
                <th>Earned tonnes</th>
                <th>Assembly</th>
                <th>Erection</th>
              </tr>
            </thead>
            <tbody>
              {(allocations ?? []).map((row) => (
                <tr key={row.id}>
                  <td>
                    {towerMap.get(row.tower_id) ?? row.tower_id}
                  </td>
                  <td>{Number(row.raw_hours ?? 0).toFixed(2)}</td>
                  <td>
                    {Number(row.production_hours ?? 0).toFixed(2)}
                  </td>
                  <td>
                    {Number(row.progress_delta ?? 0).toFixed(2)}%
                  </td>
                  <td>
                    {Number(row.earned_tonnes ?? 0).toFixed(2)} t
                  </td>
                  <td>
                    {Number(row.assembly_after ?? 0).toFixed(1)}%
                  </td>
                  <td>
                    {Number(row.erection_after ?? 0).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={tt.card}>
        <div className={tt.cardHeader}>
          <div>
            <h2 className={tt.cardTitle}>Labour</h2>
          </div>
        </div>

        <div className={tt.tableWrap} style={{ border: 0, borderRadius: 0 }}>
          <table className={tt.table}>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Time in</th>
                <th>Time out</th>
                <th>Raw MH</th>
                <th>Production MH</th>
                <th>Delay</th>
              </tr>
            </thead>
            <tbody>
              {(labour ?? []).map((row) => (
                <tr key={row.id}>
                  <td>{row.worker_name}</td>
                  <td>{row.time_in || "-"}</td>
                  <td>{row.time_out || "-"}</td>
                  <td>{Number(row.raw_hours ?? 0).toFixed(2)}</td>
                  <td>{Number(row.production_hours ?? 0).toFixed(2)}</td>
                  <td>{Number(row.delay_hours ?? 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {(delays ?? []).length > 0 ? (
        <section className={tt.card}>
          <div className={tt.cardHeader}>
            <h2 className={tt.cardTitle}>Delays</h2>
          </div>
          <div className={tt.tableWrap} style={{ border: 0, borderRadius: 0 }}>
            <table className={tt.table}>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Hours</th>
                  <th>Applies to</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {(delays ?? []).map((row) => (
                  <tr key={row.id}>
                    <td>{row.delay_label}</td>
                    <td>{Number(row.delay_hours ?? 0).toFixed(2)}</td>
                    <td>{row.applies_to.replaceAll("_", " ")}</td>
                    <td>{row.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {(plant ?? []).length > 0 ? (
        <section className={tt.card}>
          <div className={tt.cardHeader}>
            <h2 className={tt.cardTitle}>Plant</h2>
          </div>
          <div className={tt.tableWrap} style={{ border: 0, borderRadius: 0 }}>
            <table className={tt.table}>
              <thead>
                <tr>
                  <th>Plant</th>
                  <th>Type</th>
                  <th>Asset</th>
                  <th>Hours</th>
                  <th>Delay</th>
                </tr>
              </thead>
              <tbody>
                {(plant ?? []).map((row) => (
                  <tr key={row.id}>
                    <td>{row.plant_name}</td>
                    <td>{row.plant_type || "-"}</td>
                    <td>{row.asset_number || "-"}</td>
                    <td>{Number(row.total_hours ?? 0).toFixed(2)}</td>
                    <td>{Number(row.delay_hours ?? 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {(materials ?? []).length > 0 ? (
        <section className={tt.card}>
          <div className={tt.cardHeader}>
            <h2 className={tt.cardTitle}>Material events</h2>
          </div>
          <div className={tt.tableWrap} style={{ border: 0, borderRadius: 0 }}>
            <table className={tt.table}>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Item</th>
                  <th>Tower</th>
                  <th>Qty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(materials ?? []).map((row) => (
                  <tr key={row.id}>
                    <td>{row.event_type.replaceAll("_", " ")}</td>
                    <td>{row.item_reference || row.description || "-"}</td>
                    <td>
                      {row.tower_id
                        ? towerMap.get(row.tower_id) ?? "-"
                        : "-"}
                    </td>
                    <td>
                      {row.quantity} {row.unit}
                    </td>
                    <td>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {docket.daily_site_summary ? (
        <section className={tt.card} style={{ padding: 18 }}>
          <h2 className={tt.cardTitle}>Daily site summary</h2>
          <div
            style={{
              marginTop: 10,
              color: "#cbd5e1",
              fontSize: 13,
              whiteSpace: "pre-wrap",
              lineHeight: 1.6,
            }}
          >
            {docket.daily_site_summary}
          </div>
        </section>
      ) : null}
    </Page>
  );
}
