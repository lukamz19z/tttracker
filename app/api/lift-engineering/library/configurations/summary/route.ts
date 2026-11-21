import { NextResponse } from "next/server";
import { LIFT_ACCESS, liftApiError, requireLiftAccess } from "@/lib/lift-engineering/server";

async function readAll<T>(readPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await readPage(from, from + 999);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

type Revision = Record<string, unknown> & { id: string; configuration_id: string; revision: string; status: string; created_at: string };
type ChartOption = { id: string; crane_profile_id: string; status: string; active: boolean; manufacturer_configuration: Record<string, unknown> | null };
export async function GET(request: Request) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.view);
    const [configsResult, profilesResult, revisions, chartOptions] = await Promise.all([
      service.from("lift_crane_configurations").select("id,crane_profile_id,name,active,created_at" ).order("created_at", { ascending: false }),
      service.from("lift_crane_profiles").select("id,name,manufacturer,model,active"),
      readAll<Revision>((from, to) => service.from("lift_crane_configuration_revisions").select("*").order("created_at", { ascending: false }).range(from, to)),
      readAll<ChartOption>((from, to) => service.from("lift_load_charts").select("id,crane_profile_id,status,active,manufacturer_configuration").range(from, to)),
    ]);
    if (configsResult.error) throw new Error(configsResult.error.message);
    if (profilesResult.error) throw new Error(profilesResult.error.message);
    const profiles = profilesResult.data ?? [];
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    const configurations = configsResult.data ?? [];
    const currentRevisionByConfiguration = new Map<string, Revision | null>();
    for (const configuration of configurations) {
      const own = revisions.filter((revision) => revision.configuration_id === configuration.id);
      currentRevisionByConfiguration.set(configuration.id, own.find((revision) => ["verified", "active", "current"].includes(String(revision.status).toLowerCase())) ?? own[0] ?? null);
    }
    const profileChartCounts = new Map<string, number>();
    await Promise.all(profiles.map(async (profile) => {
      const { count, error } = await service.from("lift_load_charts").select("id", { count: "exact", head: true }).eq("crane_profile_id", profile.id);
      if (error) throw new Error(error.message);
      profileChartCounts.set(profile.id, count ?? 0);
    }));
    const configurationChartCounts = new Map<string, number>();
    await Promise.all(configurations.map(async (configuration) => {
      const revision = currentRevisionByConfiguration.get(configuration.id);
      if (!revision) { configurationChartCounts.set(configuration.id, 0); return; }
      const { count, error } = await service.from("lift_load_charts").select("id", { count: "exact", head: true }).eq("configuration_revision_id", revision.id);
      if (error) throw new Error(error.message);
      configurationChartCounts.set(configuration.id, count ?? 0);
    }));
    const records = configurations.map((configuration) => {
      const ownRevisions = revisions.filter((revision) => revision.configuration_id === configuration.id);
      const currentRevision = currentRevisionByConfiguration.get(configuration.id) ?? null;
      const profile = profileById.get(configuration.crane_profile_id);
      const dates = [configuration.created_at, ...ownRevisions.map((revision) => revision.created_at)].filter((value): value is string => typeof value === "string").sort();
      return { ...configuration, profile: profile ?? null, revisions: ownRevisions, currentRevision, revisionCount: ownRevisions.length, chartConfigurationCount: configurationChartCounts.get(configuration.id) ?? 0, profileChartConfigurationCount: profileChartCounts.get(configuration.crane_profile_id) ?? 0, lastUpdated: dates.at(-1) ?? configuration.created_at };
    });
    const profileOptions = profiles.map((profile) => ({ ...profile }));
    const configurationOptions = chartOptions.map((chart) => ({ id: chart.id, crane_profile_id: chart.crane_profile_id, status: chart.status, active: chart.active, manufacturer_configuration: chart.manufacturer_configuration }));
    return NextResponse.json({ configurations: records, profiles: profileOptions, configurationOptions });
  } catch (error) {
    const result = liftApiError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
