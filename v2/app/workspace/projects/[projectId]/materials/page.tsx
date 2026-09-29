import Link from "next/link";
import {
  Boxes,
  Search,
  ShieldAlert,
  Upload,
} from "lucide-react";

import {
  ButtonLink,
  EmptyState,
  MetricCard,
  Page,
  PageHeader,
  tt,
} from "@/components/ui/tt-ui";
import { requireProjectContext } from "@/lib/projects/project-context";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    organisation?: string;
    q?: string;
    kind?: string;
    issue?: string;
    tower?: string;
  }>;
};

export default async function MaterialsControlPage({
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

  const [{ data: items }, { data: events }, { data: towers }] =
    await Promise.all([
      admin
        .from("v2_material_register")
        .select(`
          id,
          tower_id,
          material_kind,
          item_reference,
          description,
          bundle_reference,
          segment,
          drawing_reference,
          required_quantity,
          received_quantity,
          unit
        `)
        .eq("project_id", projectId)
        .order("item_reference")
        .limit(2500),

      admin
        .from("v2_material_events")
        .select(`
          id,
          tower_id,
          material_item_id,
          event_type,
          item_reference,
          description,
          quantity,
          unit,
          status,
          occurred_at
        `)
        .eq("project_id", projectId)
        .order("occurred_at", { ascending: false })
        .limit(1000),

      admin
        .from("v2_towers")
        .select("id, tower_identifier")
        .eq("project_id", projectId),
    ]);

  const towerMap = new Map(
    (towers ?? []).map((tower) => [
      tower.id,
      tower.tower_identifier,
    ]),
  );

  const q = String(query.q ?? "").trim().toLowerCase();
  const kind = String(query.kind ?? "").trim();
  const towerFilter = String(query.tower ?? "").trim();

  const filteredItems = (items ?? []).filter((item) => {
    if (kind && item.material_kind !== kind) return false;
    if (towerFilter && item.tower_id !== towerFilter) return false;

    if (!q) return true;

    return [
      item.item_reference,
      item.description,
      item.bundle_reference,
      item.segment,
      item.drawing_reference,
      item.tower_id ? towerMap.get(item.tower_id) : null,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const openEvents = (events ?? []).filter(
    (event) => event.status !== "closed" && event.status !== "resolved",
  );

  const missingCount = openEvents.filter(
    (event) => event.event_type === "missing",
  ).length;

  const excessCount = openEvents.filter(
    (event) => event.event_type === "excess",
  ).length;

  const materialKinds = Array.from(
    new Set<string>(
      (items ?? [])
        .map((item) => String(item.material_kind ?? ""))
        .filter(Boolean),
    ),
  ).sort();

  const orgId =
    context.workspace.organisation.organisationId;

  return (
    <Page>
      <PageHeader
        eyebrow={<Boxes size={14} />}
        title="Materials Control"
        subtitle="Search the entire project register, bulk-load materials and track missing, excess and material events across all towers."
        actions={
          <ButtonLink
            href={`/workspace/projects/${projectId}/materials/import?organisation=${encodeURIComponent(
              orgId,
            )}`}
            primary
          >
            <Upload size={16} />
            Bulk import
          </ButtonLink>
        }
      />

      <div className={tt.metricGrid} style={{ marginBottom: 18 }}>
        <MetricCard
          label="Register items"
          value={(items ?? []).length}
        />
        <MetricCard
          label="Open missing"
          value={missingCount}
        />
        <MetricCard
          label="Open excess"
          value={excessCount}
        />
        <MetricCard
          label="Open material events"
          value={openEvents.length}
        />
      </div>

      <form className={tt.card} style={{ padding: 16, marginBottom: 18 }}>
        <input type="hidden" name="organisation" value={orgId} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px, 1fr) 180px 190px auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <label className={tt.field}>
            <span className={tt.label}>Search project materials</span>
            <div style={{ position: "relative" }}>
              <Search
                size={15}
                style={{
                  position: "absolute",
                  left: 11,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#64748b",
                }}
              />
              <input
                className="tt-input"
                style={{ paddingLeft: 34 }}
                name="q"
                defaultValue={query.q ?? ""}
                placeholder="Item, bundle, segment, drawing or tower..."
              />
            </div>
          </label>

          <label className={tt.field}>
            <span className={tt.label}>Material type</span>
            <select className="tt-select" name="kind" defaultValue={kind}>
              <option value="">All types</option>
              {materialKinds.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>

          <label className={tt.field}>
            <span className={tt.label}>Tower</span>
            <select
              className="tt-select"
              name="tower"
              defaultValue={towerFilter}
            >
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

          <button className={`${tt.button} ${tt.buttonPrimary}`}>
            Search
          </button>
        </div>
      </form>

      {openEvents.length > 0 ? (
        <section className={tt.card} style={{ marginBottom: 18 }}>
          <div className={tt.cardHeader}>
            <div>
              <h2 className={tt.cardTitle}>Missing & excess</h2>
              <p className={tt.cardDescription}>
                Project-wide open material issues from Daily Dockets and Materials Control.
              </p>
            </div>
          </div>

          <div className={tt.tableWrap} style={{ border: 0, borderRadius: 0 }}>
            <table className={tt.table}>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Item</th>
                  <th>Tower</th>
                  <th>Qty</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {openEvents.slice(0, 50).map((event) => (
                  <tr key={event.id}>
                    <td>{event.event_type.replaceAll("_", " ")}</td>
                    <td>
                      <div style={{ color: "#f8fafc", fontWeight: 800 }}>
                        {event.item_reference || event.description || "-"}
                      </div>
                    </td>
                    <td>
                      {event.tower_id
                        ? towerMap.get(event.tower_id) ?? "-"
                        : "-"}
                    </td>
                    <td>
                      {event.quantity} {event.unit}
                    </td>
                    <td>{event.status}</td>
                    <td>{String(event.occurred_at).slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {filteredItems.length > 0 ? (
        <section className={tt.card}>
          <div className={tt.cardHeader}>
            <div>
              <h2 className={tt.cardTitle}>Project register</h2>
              <p className={tt.cardDescription}>
                Showing {filteredItems.length} matching material records.
              </p>
            </div>
          </div>

          <div className={tt.tableWrap} style={{ border: 0, borderRadius: 0 }}>
            <table className={tt.table}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Type</th>
                  <th>Tower</th>
                  <th>Bundle</th>
                  <th>Segment</th>
                  <th>Required</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.slice(0, 500).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ color: "#f8fafc", fontWeight: 800 }}>
                        {item.item_reference}
                      </div>
                      <div className={tt.secondary}>
                        {item.description || item.drawing_reference || ""}
                      </div>
                    </td>
                    <td>{item.material_kind.replaceAll("_", " ")}</td>
                    <td>
                      {item.tower_id
                        ? towerMap.get(item.tower_id) ?? "-"
                        : "Project-wide"}
                    </td>
                    <td>{item.bundle_reference || "-"}</td>
                    <td>{item.segment || "-"}</td>
                    <td>
                      {item.required_quantity ?? "-"} {item.unit}
                    </td>
                    <td>
                      {item.received_quantity ?? 0} {item.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <EmptyState title="No materials found">
          Change the filters or bulk-import the project material register.
        </EmptyState>
      )}
    </Page>
  );
}
