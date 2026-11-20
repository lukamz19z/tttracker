import { NextResponse } from "next/server";
import { LIFT_ACCESS, liftApiError, requireLiftAccess } from "@/lib/lift-engineering/server";

type Row = Record<string, unknown>;

async function readAll<T extends Row>(
  readPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await readPage(from, from + 999);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

function documentNames(source: unknown): string[] {
  if (!source || typeof source !== "object" || Array.isArray(source)) return [];
  const row = source as Record<string, unknown>;
  const docs = Array.isArray(row.documents) ? row.documents : [];
  return [...docs, row.fileName, row.sourceDocument].flatMap((value) => {
    if (typeof value === "string" && value.trim()) return [value.trim()];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const name = (value as Record<string, unknown>).fileName;
      if (typeof name === "string" && name.trim()) return [name.trim()];
    }
    return [];
  });
}

export async function GET(request: Request) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.view);
    const [profilesResult, revisionsResult, configurationsResult] = await Promise.all([
      service.from("lift_crane_profiles").select("id,name,manufacturer,model,notes,active,created_at,updated_at").order("manufacturer").order("model"),
      service.from("lift_crane_profile_revisions").select("id,crane_profile_id,revision,status,created_at,created_by,technical_data").order("created_at", { ascending: false }),
      service.from("lift_crane_configurations").select("id,crane_profile_id,active"),
    ]);
    for (const result of [profilesResult, revisionsResult, configurationsResult]) if (result.error) throw new Error(result.error.message);
    const profiles = profilesResult.data ?? [];
    const profileIds = profiles.map((profile) => profile.id);
    if (!profileIds.length) return NextResponse.json({ profiles: [] });

    const charts = await readAll((from, to) => service.from("lift_load_charts")
      .select("id,crane_profile_id,status,source_document,created_at")
      .in("crane_profile_id", profileIds).range(from, to));
    const revisions = revisionsResult.data ?? [];
    const configurations = configurationsResult.data ?? [];
    const summaries = profiles.map((profile) => {
      const ownRevisions = revisions.filter((row) => row.crane_profile_id === profile.id);
      const currentRevision = ownRevisions.find((row) => ["verified", "active", "current"].includes(String(row.status ?? "").toLowerCase())) ?? ownRevisions[0] ?? null;
      const ownCharts = charts.filter((row) => row.crane_profile_id === profile.id);
      const chartBooks = new Set(ownCharts.flatMap((row) => documentNames(row.source_document).map((name) => name.toLocaleLowerCase("en-AU"))));
      const ownConfigurations = configurations.filter((row) => row.crane_profile_id === profile.id && row.active !== false);
      const dates = [profile.updated_at, ...ownRevisions.map((row) => row.created_at), ...ownCharts.map((row) => row.created_at)]
        .filter((value): value is string => typeof value === "string").sort();
      return {
        ...profile,
        revisions: ownRevisions,
        currentRevision,
        revisionCount: ownRevisions.length,
        chartBookCount: chartBooks.size,
        chartConfigurationCount: ownCharts.length,
        importedChartCount: ownCharts.filter((row) => row.status === "Imported").length,
        verifiedChartCount: ownCharts.filter((row) => row.status === "Verified").length,
        configurationCount: ownConfigurations.length,
        lastUpdated: dates.at(-1) ?? profile.created_at,
      };
    });
    return NextResponse.json({ profiles: summaries });
  } catch (error) {
    const result = liftApiError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
