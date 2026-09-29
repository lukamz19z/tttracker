import {
  ClipboardList,
  PackageCheck,
  Truck,
} from "lucide-react";

import TowerNav from "@/components/projects/tower-nav";
import {
  Page,
  PageHeader,
  ProgressBar,
  QuickCard,
  tt,
} from "@/components/ui/tt-ui";
import { requireTowerContext } from "@/lib/projects/tower-context";

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
  const { projectId, towerId } =
    await params;

  const query = await searchParams;

  const context =
    await requireTowerContext(
      projectId,
      towerId,
      query.organisation ?? null,
    );

  const typeRelation =
    Array.isArray(
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
  const overall =
    (assembly + erection) / 2;

  const orgId =
    context.workspace.organisation.organisationId;

  const extra =
    context.tower.extra_data &&
    typeof context.tower.extra_data ===
      "object" &&
    !Array.isArray(context.tower.extra_data)
      ? Object.entries(
          context.tower
            .extra_data as Record<
            string,
            unknown
          >,
        )
      : [];

  return (
    <Page className={tt.stack}>
      <PageHeader
        eyebrow="Tower overview"
        title={context.tower.tower_identifier}
        subtitle={[
          typeRelation?.type_code ||
            typeRelation?.name,
          context.tower.line,
          context.tower.tower_weight_t
            ? `${fmt(
                context.tower.tower_weight_t,
                2,
              )} t`
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
        <ProgressBar
          label="Assembly"
          value={assembly}
        />
        <ProgressBar
          label="Erection"
          value={erection}
        />
        <ProgressBar
          label="Overall"
          value={overall}
        />
      </div>

      <div className={tt.threeCol}>
        <QuickCard
          href={`/workspace/projects/${projectId}/towers/${towerId}/daily-dockets?organisation=${encodeURIComponent(
            orgId,
          )}`}
          icon={<ClipboardList size={19} />}
          title="Daily dockets"
          detail="Progress and production actuals"
        />

        <QuickCard
          href={`/workspace/projects/${projectId}/towers/${towerId}/deliveries?organisation=${encodeURIComponent(
            orgId,
          )}`}
          icon={<Truck size={19} />}
          title="Deliveries"
          detail="Delivered and outstanding materials"
        />

        <QuickCard
          href={`/workspace/projects/${projectId}/towers/${towerId}/materials?organisation=${encodeURIComponent(
            orgId,
          )}`}
          icon={<PackageCheck size={19} />}
          title="Materials"
          detail="Bundles, members, bolts and packers"
        />
      </div>

      <section className={tt.card}>
        <div className={tt.cardHeader}>
          <div>
            <h2 className={tt.cardTitle}>
              Imported tower details
            </h2>
            <p className={tt.cardDescription}>
              Extra tower schedule fields remain attached to the tower without hard-coding one contractor format.
            </p>
          </div>
        </div>

        <div className={tt.cardPad}>
          {extra.length > 0 ? (
            <div className={tt.detailsGrid}>
              {extra.map(([key, value]) => (
                <div
                  key={key}
                  className={tt.detailCard}
                >
                  <div className={tt.detailLabel}>
                    {key
                      .replace(/[_-]+/g, " ")
                      .replace(
                        /\b\w/g,
                        (letter) =>
                          letter.toUpperCase(),
                      )}
                  </div>

                  <div className={tt.detailValue}>
                    {value === null ||
                    value === undefined
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
                Additional project-specific fields will appear here when imported or configured.
              </div>
            </div>
          )}
        </div>
      </section>
    </Page>
  );
}
