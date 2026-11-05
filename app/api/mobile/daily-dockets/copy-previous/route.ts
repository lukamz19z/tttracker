import { NextResponse } from "next/server";
import { blankSectionV2Rows, clean, inferBodyExtension, mobileDocketApiError, num, parseMobilisation, requireMobileDocketUser } from "@/lib/dockets/mobile-docket-server";
import { SECTION_PROGRESS_WEIGHTS } from "@/lib/dockets/calculations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const coreColumns = "id,project_id,tower_id,docket_date,crew,leading_hand,weather,rate_type,progress_model,prestart_minutes,lunch_break_minutes,travel_in_minutes,travel_out_minutes,mobilisation_hours,delays_comments";

function stringValue(value: unknown) { return value == null ? "" : String(value); }

export async function GET(request: Request) {
  const startedAt = Date.now();
  let phase = "validation";
  let phaseStartedAt = startedAt;
  const timing = (next: string) => {
    if (process.env.NODE_ENV === "development") console.info("[docket-copy]", { phase, durationMs: Date.now() - phaseStartedAt });
    phase = next;
    phaseStartedAt = Date.now();
  };
  try {
    const url = new URL(request.url);
    const projectId = clean(url.searchParams.get("projectId"));
    const towerId = clean(url.searchParams.get("towerId"));
    const docketDate = clean(url.searchParams.get("docketDate"));
    const previousDocketId = clean(url.searchParams.get("previousDocketId"));
    if (!projectId || !towerId || !/^\d{4}-\d{2}-\d{2}$/.test(docketDate)) {
      return NextResponse.json({ error: "Project, tower and a valid docket date are required." }, { status: 400 });
    }

    phase = "auth_access";
    const { service } = await requireMobileDocketUser(request, projectId);
    timing("tower_scope");
    const towerResult = await service.from("towers").select("id,extra_data").eq("id", towerId).eq("project_id", projectId).maybeSingle();
    if (towerResult.error) throw new Error(`Tower scope check failed: ${towerResult.error.message}`);
    if (!towerResult.data) return NextResponse.json({ error: "Tower could not be found in this project." }, { status: 404 });

    timing(previousDocketId ? "docket_core" : "previous_lookup");
    let query = service.from("tower_daily_dockets").select(coreColumns)
      .eq("project_id", projectId).eq("tower_id", towerId).lt("docket_date", docketDate)
      .is("deleted_at", null)
      .or("approval_status.is.null,approval_status.in.(legacy,submitted_bc,client_pending,final,legacy_final)");
    if (previousDocketId) query = query.eq("id", previousDocketId);
    const docketResult = await query.order("docket_date", { ascending: false }).limit(1).maybeSingle();
    if (docketResult.error) throw new Error(`Previous Daily Docket lookup failed: ${docketResult.error.message}`);
    if (!docketResult.data) {
      if (process.env.NODE_ENV === "development") console.info("[docket-copy]", { phase, durationMs: Date.now() - phaseStartedAt, totalMs: Date.now() - startedAt, found: false });
      return NextResponse.json({ found: false });
    }
    const docket = docketResult.data;
    const id = clean(docket.id);
    timing("related_rows");
    const timed = async <T,>(name: string, task: PromiseLike<T>): Promise<T> => {
      const began = Date.now();
      const result = await task;
      if (process.env.NODE_ENV === "development") console.info("[docket-copy]", { phase: name, durationMs: Date.now() - began });
      return result;
    };
    const [labour, plant, progress, allocations] = await Promise.all([
      timed("labour_crew", service.from("tower_docket_labour").select("worker_name,time_in,time_out,total_hours,prestart_minutes,lunch_minutes,travel_in_minutes,travel_out_minutes,mobilisation_hours,delay_hours,delay_reason,production_hours").eq("docket_id", id)),
      timed("plant", service.from("tower_docket_plant").select("plant_name,plant_type,asset_number,operator_name,time_in,time_out,total_hours,notes").eq("docket_id", id)),
      timed("work_progress", service.from("tower_docket_progress").select("tower_id,section_code,section_label,section,progress_model,assembly_overall,assembly_today,assembled_qty,erection_overall,erection_today,erected_qty").eq("docket_id", id)),
      timed("work_allocations", service.from("tower_docket_hour_allocations").select("allocation_type,target_tower_id,hours,activity,reason,worker_names").eq("docket_id", id)),
    ]);
    for (const result of [labour, plant, progress, allocations]) {
      if (result.error) throw new Error(`Previous Daily Docket rows failed: ${result.error.message}`);
    }
    const progressRows = progress.data ?? [];
    const rowsFor = (targetTowerId: string) => blankSectionV2Rows().map((config) => {
      const saved = progressRows.find((row) => (!clean(row.tower_id) || clean(row.tower_id) === targetTowerId) && clean(row.section_code).toUpperCase() === config.section_code.toUpperCase());
      return saved ? {
        ...config, section_label: clean(saved.section_label) || config.section_label,
        assembly_today: clean(saved.assembly_overall ?? saved.assembly_today ?? saved.assembled_qty),
        erection_today: clean(saved.erection_overall ?? saved.erection_today ?? saved.erected_qty),
        assembly_weight: SECTION_PROGRESS_WEIGHTS[config.section_code] ?? config.assembly_weight,
        erection_weight: SECTION_PROGRESS_WEIGHTS[config.section_code] ?? config.erection_weight,
      } : config;
    });
    const production = (allocations.data ?? []).filter((row) => clean(row.allocation_type) === "production");
    const primary = production.find((row) => clean(row.target_tower_id) === towerId);
    const other = production.filter((row) => clean(row.target_tower_id) && clean(row.target_tower_id) !== towerId);
    const otherIds = [...new Set(other.map((row) => clean(row.target_tower_id)))];
    let otherTowers: { id: string; extra_data: unknown }[] = [];
    if (otherIds.length) {
      const result = await timed("work_towers", service.from("towers").select("id,extra_data").eq("project_id", projectId).in("id", otherIds));
      if (result.error) throw new Error(`Additional work tower lookup failed: ${result.error.message}`);
      otherTowers = result.data ?? [];
    }
    const progressModel = clean(docket.progress_model) === "section_v2" || progressRows.some((row) => clean(row.progress_model) === "section_v2") ? "section_v2" : "legacy";
    const oldMobilisation = parseMobilisation(docket.delays_comments, docket.mobilisation_hours);
    const copy = {
      crewName: clean(docket.crew), leadingHand: clean(docket.leading_hand), weather: clean(docket.weather),
      rateType: clean(docket.rate_type) === "schedule_of_rates" ? "schedule_of_rates" : "tonnage_rate",
      prestartMinutes: stringValue(docket.prestart_minutes), lunchBreakMinutes: stringValue(docket.lunch_break_minutes),
      travelInMinutes: stringValue(docket.travel_in_minutes), travelOutMinutes: stringValue(docket.travel_out_minutes),
      mobilisationHours: stringValue(docket.mobilisation_hours),
      mobilisation: {
        enabled: oldMobilisation.enabled && oldMobilisation.status !== "complete",
        from_tower_id: oldMobilisation.from_tower_id, to_tower_id: oldMobilisation.to_tower_id,
        status: "planning", percent_complete: "", started_date: "", target_move_date: "", completed_date: "",
        notes: oldMobilisation.notes, worker_names: oldMobilisation.worker_names,
      },
      labourRows: (labour.data ?? []).map((row) => ({
        worker_name: clean(row.worker_name), time_in: clean(row.time_in), time_out: clean(row.time_out),
        total_hours: stringValue(row.total_hours), prestart_minutes: stringValue(row.prestart_minutes), lunch_minutes: stringValue(row.lunch_minutes),
        travel_in_minutes: stringValue(row.travel_in_minutes), travel_out_minutes: stringValue(row.travel_out_minutes),
        mobilisation_hours: row.mobilisation_hours == null ? "" : String(num(row.mobilisation_hours) * 60),
        delay_hours: "", delay_reason: "", production_hours: stringValue(row.production_hours),
      })),
      plantRows: (plant.data ?? []).map((row) => ({
        plant_name: clean(row.plant_name), plant_type: clean(row.plant_type), asset_id: clean(row.asset_number), operator_name: clean(row.operator_name),
        time_in: clean(row.time_in), time_out: clean(row.time_out), total_hours: stringValue(row.total_hours), notes: clean(row.notes),
      })),
      progressModel,
      legacyProgressRows: progressRows.filter((row) => !clean(row.tower_id) || clean(row.tower_id) === towerId).map((row) => ({
        section_label: clean(row.section_label) || clean(row.section) || "Section",
        assembled_qty: clean(row.assembly_overall ?? row.assembly_today ?? row.assembled_qty),
        erected_qty: clean(row.erection_overall ?? row.erection_today ?? row.erected_qty),
      })),
      sectionV2Rows: rowsFor(towerId),
      hasBodyExtension: progressModel === "section_v2" ? progressRows.some((row) => clean(row.section_code).toUpperCase() === "BE") : inferBodyExtension(towerResult.data),
      primaryWorkActivity: clean(primary?.activity) || "mixed", primaryWorkNotes: clean(primary?.reason),
      additionalTowerWork: other.filter((row) => otherTowers.some((tower) => tower.id === clean(row.target_tower_id))).map((row) => ({
        ui_id: crypto.randomUUID(),
        target_tower_id: clean(row.target_tower_id), allocation_percent: "", saved_allocated_mh: num(row.hours) * (Array.isArray(row.worker_names) ? row.worker_names.length : 0),
        activity: clean(row.activity) || "mixed", notes: clean(row.reason),
        has_body_extension: inferBodyExtension(otherTowers.find((tower) => tower.id === clean(row.target_tower_id))),
        progress_rows: rowsFor(clean(row.target_tower_id)),
      })),
      towerRevisionAllocations: (allocations.data ?? []).filter((row) => !clean(row.allocation_type) || clean(row.allocation_type) === "revision").map((row) => ({
        ui_id: crypto.randomUUID(), target_tower_id: clean(row.target_tower_id), hours: stringValue(row.hours),
        worker_names: Array.isArray(row.worker_names) ? row.worker_names.map(clean).filter(Boolean) : [], reason: clean(row.reason),
      })),
    };
    if (process.env.NODE_ENV === "development") console.info("[docket-copy]", { phase: "total", durationMs: Date.now() - startedAt, labourRows: copy.labourRows.length, plantRows: copy.plantRows.length, progressRows: progressRows.length });
    return NextResponse.json({ found: true, previousDocketId: id, previousDocketDate: docket.docket_date, copy });
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.info("[docket-copy] failed", { phase, phaseDurationMs: Date.now() - phaseStartedAt, totalMs: Date.now() - startedAt, errorType: error instanceof Error ? error.name : "unknown" });
    const apiError = mobileDocketApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
