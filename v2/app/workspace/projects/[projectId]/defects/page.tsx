import {
  AlertTriangle,
  Search,
} from "lucide-react";

import {
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
    status?: string;
    tower?: string;
    type?: string;
  }>;
};

export default async function ProjectDefectsPage({
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

  const [{ data: defects, error }, { data: towers }] = await Promise.all([
    admin
      .from("v2_defects")
      .select(`
        id,
        tower_id,
        defect_number,
        defect_type_key,
        title,
        description,
        status,
        priority,
        raised_at,
        due_date
      `)
      .eq("project_id", projectId)
      .order("raised_at", { ascending: false }),

    admin
      .from("v2_towers")
      .select("id, tower_identifier")
      .eq("project_id", projectId),
  ]);

  if (error) throw new Error(error.message);

  const towerMap = new Map(
    (towers ?? []).map((tower) => [
      tower.id,
      tower.tower_identifier,
    ]),
  );

  const q = String(query.q ?? "").trim().toLowerCase();
  const status = String(query.status ?? "").trim();
  const tower = String(query.tower ?? "").trim();
  const type = String(query.type ?? "").trim();

  const filtered = (defects ?? []).filter((defect) => {
    if (status && defect.status !== status) return false;
    if (tower && defect.tower_id !== tower) return false;
    if (type && defect.defect_type_key !== type) return false;

    if (!q) return true;

    return [
      defect.defect_number,
      defect.title,
      defect.description,
      defect.defect_type_key,
      defect.tower_id ? towerMap.get(defect.tower_id) : null,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const openCount = (defects ?? []).filter(
    (defect) =>
      !["closed", "resolved", "completed"].includes(
        String(defect.status).toLowerCase(),
      ),
  ).length;

  const types = Array.from(
    new Set(
      (defects ?? [])
        .map((defect) => defect.defect_type_key)
        .filter(Boolean),
    ),
  ).sort();

  const orgId =
    context.workspace.organisation.organisationId;

  return (
    <Page>
      <PageHeader
        eyebrow={<AlertTriangle size={14} />}
        title="Defects"
        subtitle="Project-wide defect register across all towers."
      />

      <div className={tt.metricGrid} style={{ marginBottom: 18 }}>
        <MetricCard label="Total defects" value={(defects ?? []).length} />
        <MetricCard label="Open defects" value={openCount} />
      </div>

      <form className={tt.card} style={{ padding: 16, marginBottom: 18 }}>
        <input type="hidden" name="organisation" value={orgId} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px, 1fr) 170px 190px 180px auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <label className={tt.field}>
            <span className={tt.label}>Search defects</span>
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
                placeholder="Number, title, detail or tower..."
              />
            </div>
          </label>

          <label className={tt.field}>
            <span className={tt.label}>Status</span>
            <select className="tt-select" name="status" defaultValue={status}>
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="closed">Closed</option>
            </select>
          </label>

          <label className={tt.field}>
            <span className={tt.label}>Tower</span>
            <select className="tt-select" name="tower" defaultValue={tower}>
              <option value="">All towers</option>
              {(towers ?? [])
                .sort((a, b) =>
                  String(a.tower_identifier).localeCompare(
                    String(b.tower_identifier),
                    undefined,
                    { numeric: true },
                  ),
                )
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.tower_identifier}
                  </option>
                ))}
            </select>
          </label>

          <label className={tt.field}>
            <span className={tt.label}>Defect type</span>
            <select className="tt-select" name="type" defaultValue={type}>
              <option value="">All types</option>
              {types.map((value) => (
                <option key={value} value={value}>
                  {String(value).replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>

          <button className={`${tt.button} ${tt.buttonPrimary}`}>
            Search
          </button>
        </div>
      </form>

      {filtered.length > 0 ? (
        <div className={tt.tableWrap}>
          <table className={tt.table}>
            <thead>
              <tr>
                <th>Defect</th>
                <th>Tower</th>
                <th>Type</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Raised</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((defect) => (
                <tr key={defect.id}>
                  <td>
                    <div style={{ color: "#f8fafc", fontWeight: 800 }}>
                      {defect.defect_number || defect.title}
                    </div>
                    <div className={tt.secondary}>
                      {defect.defect_number ? defect.title : defect.description}
                    </div>
                  </td>
                  <td>
                    {defect.tower_id
                      ? towerMap.get(defect.tower_id) ?? "-"
                      : "Project-wide"}
                  </td>
                  <td>
                    {defect.defect_type_key?.replaceAll("_", " ") || "-"}
                  </td>
                  <td>{defect.priority || "-"}</td>
                  <td>{defect.status.replaceAll("_", " ")}</td>
                  <td>{String(defect.raised_at).slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No defects found">
          No defects match the current project filters.
        </EmptyState>
      )}
    </Page>
  );
}
