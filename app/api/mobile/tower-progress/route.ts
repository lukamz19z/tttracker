import { NextResponse } from "next/server";
import { requireMobileDocketUser, mobileDocketApiError, clean } from "@/lib/dockets/mobile-docket-server";
import { mobileProgressContext } from "@/lib/dockets/mobile-progress-context";
import { towerWeightTonnes } from "@/lib/dockets/daily-productivity";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const startedAt = Date.now();
  const trace = request.headers.get("x-tttracker-trace");
  const mark = (phase: string, since: number) => { if (process.env.NODE_ENV === "development" && trace) console.info("[mobile-trace]", { trace, route: "tower_progress", phase, durationMs: Date.now() - since }); };
  try {
    const projectId = clean(new URL(request.url).searchParams.get("projectId"));
    if (!projectId) return NextResponse.json({ error: "Project is required." }, { status: 400 });
    const { service } = await requireMobileDocketUser(request, projectId);
    mark("auth_access", startedAt);
    const contextStartedAt = Date.now();
    const project = await service.from("projects").select("id").eq("id", projectId).maybeSingle();
    if (project.error) throw new Error(project.error.message);
    if (!project.data) return NextResponse.json({ error: "Project could not be found." }, { status: 404 });
    const { data, error } = await service.from("towers").select("*").eq("project_id", projectId);
    if (error) throw new Error(error.message);
    const towers = data || [];
    const { resolved, dockets } = await mobileProgressContext(service, projectId, towers);
    mark("project_progress_context", contextStartedAt);
    const docketIds = dockets.map((row) => row.id);
    const labourByDocket = new Map<string, { raw: number; production: number }>();
    if (docketIds.length) {
      const labourStartedAt = Date.now();
      for (const table of ["tower_docket_labour", "tower_daily_docket_labour", "tower_daily_docket_labour_rows"]) {
        let tableFound = false;
        for (let offset = 0; offset < docketIds.length; offset += 200) {
          const ids = docketIds.slice(offset, offset + 200);
          const { data: labour, error: labourError } = await service.from(table).select("docket_id,total_hours,production_hours").in("docket_id", ids);
          if (labourError) {
            if (/relation .* does not exist|could not find the table/i.test(labourError.message)) { tableFound = false; break; }
            throw new Error(`Tower progress labour hours could not be loaded: ${labourError.message}`);
          }
          tableFound = true;
          for (const row of labour || []) {
            const value = labourByDocket.get(String(row.docket_id)) || { raw: 0, production: 0 };
            value.raw += Number(row.total_hours) || 0;
            value.production += Number(row.production_hours) || 0;
            labourByDocket.set(String(row.docket_id), value);
          }
        }
        if (tableFound) break;
      }
      mark("labour", labourStartedAt);
    }
    const progress = Object.fromEntries([...resolved].map(([towerId, row]) => {
      const towerDockets = dockets.filter((docket) => docket.tower_id === towerId && !docket.deleted_at && docket.approval_status !== "deleted");
      let rawHours = towerDockets.reduce((sum, docket) => sum + (Number(docket.raw_manhours) || 0), 0);
      let productionHours = towerDockets.reduce((sum, docket) => sum + (Number(docket.production_manhours) || 0), 0);
      if (rawHours <= 0) rawHours = towerDockets.reduce((sum, docket) => sum + (labourByDocket.get(docket.id)?.raw || 0), 0);
      if (productionHours <= 0) productionHours = towerDockets.reduce((sum, docket) => sum + (labourByDocket.get(docket.id)?.production || 0), 0);
      const tower = towers.find((item) => item.id === towerId);
      const weight = tower ? towerWeightTonnes(tower.extra_data) : null;
      const completedTonnes = weight !== null ? weight * (row.totalProgressPercent / 100) : null;
      return [towerId, { ...row, totalHours: rawHours, productionHours, completedTonnes, rawMhPerTonne: completedTonnes && completedTonnes > 0 ? rawHours / completedTonnes : null, productionMhPerTonne: completedTonnes && completedTonnes > 0 ? productionHours / completedTonnes : null }];
    }));
    const serializeStartedAt = Date.now();
    const response = NextResponse.json({ progress, towers, dockets: dockets.map((docket) => ({ ...docket, project_id: projectId })) }, { headers: { "Cache-Control": "private, no-store" } });
    mark("serialize", serializeStartedAt);
    mark("total", startedAt);
    return response;
  } catch (error) {
    mark("failed_total", startedAt);
    const result = mobileDocketApiError(error);
    const status = [400, 401, 403, 404, 500].includes(result.status) ? result.status : 500;
    return NextResponse.json({ error: result.message }, { status });
  }
}
