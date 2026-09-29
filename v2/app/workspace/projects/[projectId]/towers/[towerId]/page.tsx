import {
  ClipboardList,
  PackageCheck,
  Truck,
} from "lucide-react";

import TowerNav from "@/components/projects/tower-nav";
import TowerSequenceNav from "@/components/projects/tower-sequence-nav";
import {
  Page,
  PageHeader,
  ProgressBar,
  QuickCard,
  tt,
} from "@/components/ui/tt-ui";
import { requireTowerContext } from "@/lib/projects/tower-context";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type Props = {
  params: Promise<{
    projectId: string;
    towerId: string;
  }>;
  searchParams: Promise<{
    organisation?: string;
  }>;
};

function fmt(
  value: number | null | undefined,
  digits = 1,
) {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(Number(value))
  ) {
    return "-";
  }

  return Number(value).toFixed(digits);
}

export default async function TowerPage({
  params,
  searchParams,
}: Props) {
  const { projectId, towerId } = await params;
  const query = await searchParams;

  const context = await requireTowerContext(
    projectId,
    towerId,
    query.organisation ?? null,
  );

  const typeRelation = Array.isArray(
    context.tower.v2_tower_types,
  )
    ? context.tower.v2_tower_types[0]
    : context.tower.v2_tower_types;

  const assembly = Number(
    context.tower.assembly_percent ?? 0,
  );
  const erection = Number(
    context.tower.erection_percent ?? 0,
  );
  const overall = (assembly + erection) / 2;

  const orgId =
    context.workspace.organisation.organisationId;

  const admin = createSupabaseAdmin();

  const { data: towerRows } = await admin
    .from("v2_towers")
    .select("id, tower_identifier")
    .eq("project_id", projectId);

  const ordered = (towerRows ?? []).sort((a, b) =>
    String(a.tower_identifier).localeCompare(
      String(b.tower_identifier),
      undefined,
      { numeric: true, sensitivity: "base" },
    ),
  );

  const currentIndex = ordered.findIndex(
    (row) => row.id === towerId,
  );

  const previous =
    currentIndex > 0
      ? {
          id: ordered[currentIndex - 1].id,
          label: ordered[currentIndex - 1].tower_identifier,
        }
      : null;

  const next =
    currentIndex >= 0 && currentIndex < ordered.length - 1
      ? {
          id: ordered[currentIndex + 1].id,
          label: ordered[currentIndex + 1].tower_identifier,
        }
      : null;

  const extra =
    context.tower.extra_data &&
    typeof context.tower.extra_data === "object" &&
    !Array.isArray(context.tower.extra_data)
      ? Object.entries(
          context.tower.extra_data as Record<string, unknown>,
        )
      : [];

  return (
    <Page className={tt.stack}>
      <TowerSequenceNav
        projectId={projectId}
        organisationId={orgId}
        previous={previous}
        current={{
          id: towerId,
          label: context.tower.tower_identifier,
        }}
        next={next}
      />

      <PageHeader
        eyebrow="Tower overview"
        title={context.tower.tower_identifier}
        subtitle={[
          typeRelation?.type_code || typeRelation?.name,
          context.tower.line,
          context.tower.tower_weight_t
            ? `${fmt(context.tower.tower_weight_t, 2)} t`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      <TowerNav
        organisationId={orgId}
        projectId={projectId}
        towerId={towerId}
        sections={context.towerSections}
      />

      <div className={tt.threeCol}>
        <ProgressBar label="Assembly" value={assembly} />
        <ProgressBar label="Erection" value={erection} />
        <ProgressBar label="Overall" value={overall} />
      </div>

      <div className={tt.threeCol}>
        <QuickCard
          href={`/workspace/projects/${projectId}/daily-dockets/new?organisation=${encodeURIComponent(
            orgId,
          )}&tower=${encodeURIComponent(towerId)}`}
          icon={<ClipboardList size={19} />}
          title="New Daily Docket"
          detail="Open a docket with this tower selected"
        />

        <QuickCard
          href={`/workspace/projects/${projectId}/materials?organisation=${encodeURIComponent(
            orgId,
          )}&tower=${encodeURIComponent(towerId)}`}
          icon={<PackageCheck size={19} />}
          title="Tower materials"
          detail="Search this tower in Materials Control"
        />

        <QuickCard
          href={`/workspace/projects/${projectId}/daily-dockets?organisation=${encodeURIComponent(
            orgId,
          )}&tower=${encodeURIComponent(towerId)}`}
          icon={<Truck size={19} />}
          title="Tower history"
          detail="Review project dockets for this tower"
        />
      </div>

      <section className={tt.card}>
        <div className={tt.cardHeader}>
          <div>
            <h2 className={tt.cardTitle}>Imported tower details</h2>
            <p className={tt.cardDescription}>
              Project-specific tower fields remain attached to the tower without
              hard-coding one contractor format.
            </p>
          </div>
        </div>

        <div className={tt.cardPad}>
          {extra.length > 0 ? (
            <div className={tt.detailsGrid}>
              {extra.map(([key, value]) => (
                <div key={key} className={tt.detailCard}>
                  <div className={tt.detailLabel}>
                    {key
                      .replace(/[_-]+/g, " ")
                      .replace(
                        /\b\w/g,
                        (letter) => letter.toUpperCase(),
                      )}
                  </div>

                  <div className={tt.detailValue}>
                    {value === null || value === undefined
                      ? "-"
                      : String(value)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={tt.empty}>
              <div className={tt.emptyTitle}>
                No additional tower fields
              </div>
              <div className={tt.emptyText}>
                Additional project-specific fields will appear here when
                imported or configured.
              </div>
            </div>
          )}
        </div>
      </section>
    </Page>
  );
}
