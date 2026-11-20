import { NextResponse } from "next/server";
import { LIFT_ACCESS, liftApiError, liftInvalid, requireLiftAccess } from "@/lib/lift-engineering/server";

export async function GET(request: Request) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.view);
    const chartId = new URL(request.url).searchParams.get("chartId")?.trim();
    if (!chartId) liftInvalid("Load chart is required.");
    const { data, error } = await service.from("lift_load_chart_points").select("id,load_chart_id,configuration_key,radius_m,rated_capacity_t,source_page").eq("load_chart_id", chartId).order("configuration_key").order("radius_m");
    if (error) throw new Error(error.message);
    return NextResponse.json({ points: data ?? [] });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

export async function POST(request: Request) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const body = await request.json() as Record<string, unknown>;
    const chartId = typeof body.chartId === "string" ? body.chartId.trim() : "";
    const rows = Array.isArray(body.rows) ? body.rows as Array<Record<string, unknown>> : [];
    if (!chartId || !rows.length || rows.length > 3000) liftInvalid("Chart and between 1 and 3,000 chart points are required.");
    const { data: chart, error: chartError } = await service.from("lift_load_charts").select("id").eq("id", chartId).maybeSingle();
    if (chartError) throw new Error(chartError.message); if (!chart) liftInvalid("Load chart was not found.");
    const points = rows.map((row, index) => {
      const configurationKey = typeof row.configurationKey === "string" ? row.configurationKey.trim() : "";
      const radiusM = Number(row.radiusM); const ratedCapacityT = Number(row.ratedCapacityT);
      if (!configurationKey || !Number.isFinite(radiusM) || radiusM < 0 || !Number.isFinite(ratedCapacityT) || ratedCapacityT <= 0) liftInvalid(`Chart point ${index + 1} needs a configuration key, non-negative radius and positive capacity.`);
      return { load_chart_id: chartId, configuration_key: configurationKey, radius_m: radiusM, rated_capacity_t: ratedCapacityT,
        source_page: typeof row.sourcePage === "string" ? row.sourcePage.trim() || null : null };
    });
    const { data, error } = await service.from("lift_load_chart_points").upsert(points, { onConflict: "load_chart_id,configuration_key,radius_m" }).select("id,load_chart_id,configuration_key,radius_m,rated_capacity_t,source_page");
    if (error) throw new Error(error.message);
    return NextResponse.json({ points: data ?? [] }, { status: 201 });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
