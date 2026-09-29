import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireProjectContext } from "@/lib/projects/project-context";
import {
  calculateLabourTotals,
  calculateTowerProgress,
  type ProgressStageInput,
} from "@/lib/dockets/calculations";
import {
  getProjectProgressConfiguration,
  upsertProductionActualsFromDocket,
} from "@/lib/projects/operations";

type Context = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const body = await request.json();

    const project = await requireProjectContext(
      projectId,
      String(body.organisationId ?? "") || null,
    );

    const docketDate = String(body.docketDate ?? "").trim();

    if (!docketDate) {
      return NextResponse.json(
        { error: "Docket date is required." },
        { status: 400 },
      );
    }

    const labour = Array.isArray(body.labour) ? body.labour : [];

    if (labour.length === 0) {
      return NextResponse.json(
        { error: "Add at least one employee to the Daily Docket." },
        { status: 400 },
      );
    }

    const calculatedLabour = calculateLabourTotals(
      labour.map((row: Record<string, unknown>) => ({
        workerName: String(row.workerName ?? "").trim(),
        timeIn: String(row.timeIn ?? "") || null,
        timeOut: String(row.timeOut ?? "") || null,
        prestartMinutes: Number(row.prestartMinutes ?? 0),
        lunchMinutes: Number(row.lunchMinutes ?? 0),
        travelInMinutes: Number(row.travelInMinutes ?? 0),
        travelOutMinutes: Number(row.travelOutMinutes ?? 0),
        mobilisationHours: Number(row.mobilisationHours ?? 0),
        delayHours: Number(row.delayHours ?? 0),
      })),
    );

    const inputTowerAllocations = Array.isArray(body.towerAllocations)
      ? body.towerAllocations
      : [];

    if (body.submit) {
      const allocatedRaw = inputTowerAllocations.reduce(
        (sum: number, row: Record<string, unknown>) =>
          sum + Number(row.rawHours ?? 0),
        0,
      );

      const allocatedProduction = inputTowerAllocations.reduce(
        (sum: number, row: Record<string, unknown>) =>
          sum + Number(row.productionHours ?? 0),
        0,
      );

      if (
        Math.abs(allocatedRaw - calculatedLabour.rawManhours) > 0.05 ||
        Math.abs(
          allocatedProduction - calculatedLabour.productionManhours,
        ) > 0.05
      ) {
        return NextResponse.json(
          {
            error:
              "Submitted Daily Dockets must allocate all Raw MH and Production MH across the towers worked.",
          },
          { status: 400 },
        );
      }
    }

    const admin = createSupabaseAdmin();
    const progressConfiguration =
      await getProjectProgressConfiguration(projectId);

    const { data: docket, error: docketError } = await admin
      .from("v2_daily_dockets")
      .insert({
        organisation_id:
          project.workspace.organisation.organisationId,
        project_id: projectId,
        primary_tower_id:
          body.primaryTowerId ? String(body.primaryTowerId) : null,
        docket_date: docketDate,
        crew_label: String(body.crewLabel ?? "").trim() || null,
        leading_hand_person_id:
          body.leadingHandPersonId
            ? String(body.leadingHandPersonId)
            : null,
        leading_hand_name:
          String(body.leadingHandName ?? "").trim() || null,
        weather_key: String(body.weatherKey ?? "").trim() || null,
        rate_type: String(body.rateType ?? "").trim() || null,
        prestart_minutes: Number(body.prestartMinutes ?? 0),
        lunch_minutes: Number(body.lunchMinutes ?? 0),
        travel_in_minutes: Number(body.travelInMinutes ?? 0),
        travel_out_minutes: Number(body.travelOutMinutes ?? 0),
        raw_manhours: calculatedLabour.rawManhours,
        production_manhours: calculatedLabour.productionManhours,
        manual_production_tonnes:
          body.manualProductionTonnes === "" ||
          body.manualProductionTonnes === null ||
          body.manualProductionTonnes === undefined
            ? null
            : Number(body.manualProductionTonnes),
        daily_site_summary:
          String(body.dailySiteSummary ?? "").trim() || null,
        rfi_references:
          String(body.rfiReferences ?? "").trim() || null,
        incident_occurred: Boolean(body.incidentOccurred),
        incident_type_key: body.incidentOccurred
          ? String(body.incidentTypeKey ?? "").trim() || null
          : null,
        incident_notes: body.incidentOccurred
          ? String(body.incidentNotes ?? "").trim() || null
          : null,
        approval_status: body.submit ? "submitted" : "draft",
        created_by: project.workspace.userId,
        submitted_at: body.submit ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (docketError || !docket) {
      throw new Error(docketError?.message ?? "Could not save Daily Docket.");
    }

    const labourRows = calculatedLabour.rows.map((row, index) => ({
      docket_id: docket.id,
      person_id:
        labour[index]?.personId ? String(labour[index].personId) : null,
      worker_name: row.workerName,
      time_in: row.timeIn || null,
      time_out: row.timeOut || null,
      raw_hours: row.rawHours,
      prestart_minutes: Number(row.prestartMinutes ?? 0),
      lunch_minutes: Number(row.lunchMinutes ?? 0),
      travel_in_minutes: Number(row.travelInMinutes ?? 0),
      travel_out_minutes: Number(row.travelOutMinutes ?? 0),
      mobilisation_hours: Number(row.mobilisationHours ?? 0),
      delay_hours: Number(row.delayHours ?? 0),
      production_hours: row.productionHours,
      metadata: {},
    }));

    const { error: labourError } = await admin
      .from("v2_docket_labour")
      .insert(labourRows);

    if (labourError) throw new Error(labourError.message);

    const plant = Array.isArray(body.plant) ? body.plant : [];

    if (plant.length > 0) {
      const { error: plantError } = await admin
        .from("v2_docket_plant")
        .insert(
          plant
            .filter(
              (row: Record<string, unknown>) =>
                String(row.plantName ?? "").trim(),
            )
            .map((row: Record<string, unknown>) => ({
              docket_id: docket.id,
              plant_name: String(row.plantName ?? "").trim(),
              plant_type: String(row.plantType ?? "").trim() || null,
              asset_number: String(row.assetNumber ?? "").trim() || null,
              time_in: String(row.timeIn ?? "").trim() || null,
              time_out: String(row.timeOut ?? "").trim() || null,
              total_hours: Number(row.totalHours ?? 0),
              delay_hours: Number(row.delayHours ?? 0),
              notes: String(row.notes ?? "").trim() || null,
            })),
        );

      if (plantError) throw new Error(plantError.message);
    }

    const delays = Array.isArray(body.delays) ? body.delays : [];

    if (delays.length > 0) {
      const { error: delayError } = await admin
        .from("v2_docket_delays")
        .insert(
          delays.map((delay: Record<string, unknown>) => ({
            docket_id: docket.id,
            delay_key: String(delay.delayKey ?? "other"),
            delay_label: String(delay.delayLabel ?? "Other"),
            delay_hours: Number(delay.delayHours ?? 0),
            applies_to:
              delay.appliesTo === "selected_workers"
                ? "selected_workers"
                : "entire_crew",
            person_ids: Array.isArray(delay.personIds)
              ? delay.personIds
              : [],
            worker_names: Array.isArray(delay.workerNames)
              ? delay.workerNames
              : [],
            notes: String(delay.notes ?? "").trim() || null,
          })),
        );

      if (delayError) throw new Error(delayError.message);
    }

    const towerAllocations = inputTowerAllocations;

    const stageDefinitions = progressConfiguration.stages;
    const actualAllocations: Array<{
      towerId: string;
      assemblyAfter: number;
      erectionAfter: number;
      progressDelta: number;
      earnedTonnes: number;
      rawHours: number;
      productionHours: number;
      delayHours?: number;
    }> = [];

    for (const allocation of towerAllocations) {
      const towerId = String(allocation.towerId ?? "").trim();
      if (!towerId) continue;

      const { data: tower, error: towerError } = await admin
        .from("v2_towers")
        .select("id, tower_weight_t")
        .eq("id", towerId)
        .eq("project_id", projectId)
        .single();

      if (towerError || !tower) {
        throw new Error(`Tower allocation could not be resolved.`);
      }

      const { data: currentStates, error: stateError } = await admin
        .from("v2_tower_progress_stage_state")
        .select("stage_definition_id, is_applicable, percent_complete")
        .eq("tower_id", towerId);

      if (stateError) throw new Error(stateError.message);

      const stateMap = new Map<
        string,
        {
          stage_definition_id: string;
          is_applicable: boolean;
          percent_complete: number;
        }
      >(
        ((currentStates ?? []) as Array<{
          stage_definition_id: string;
          is_applicable: boolean;
          percent_complete: number;
        }>).map((state) => [
          state.stage_definition_id,
          state,
        ]),
      );

      const submittedStages = Array.isArray(allocation.stages)
        ? allocation.stages
        : [];

      const submittedMap = new Map<string, Record<string, unknown>>(
        submittedStages.map((stage: Record<string, unknown>) => [
          String(stage.stageDefinitionId),
          stage,
        ]),
      );

      const calculationStages: ProgressStageInput[] =
        stageDefinitions.map((definition) => {
          const current = stateMap.get(definition.id);
          const submitted = submittedMap.get(definition.id);

          return {
            id: definition.id,
            phase:
              definition.phase === "erection" ? "erection" : "assembly",
            weight: Number(definition.weight ?? 0),
            applicable:
              submitted?.isApplicable !== undefined
                ? Boolean(submitted.isApplicable)
                : current?.is_applicable ??
                  definition.default_applicable ??
                  true,
            percentBefore: Number(current?.percent_complete ?? 0),
            percentAfter:
              submitted?.percentAfter !== undefined
                ? Number(submitted.percentAfter)
                : Number(current?.percent_complete ?? 0),
          };
        });

      const progress = calculateTowerProgress({
        stages: calculationStages,
        profile: {
          assemblyShare: Number(
            progressConfiguration.profile.assembly_share ?? 50,
          ),
          erectionShare: Number(
            progressConfiguration.profile.erection_share ?? 50,
          ),
          normalizeApplicableWeights: Boolean(
            progressConfiguration.profile.normalize_applicable_weights,
          ),
          mhTBasis:
            progressConfiguration.profile.mh_t_basis === "manual_tonnes"
              ? "manual_tonnes"
              : "progress_earned_tonnes",
        },
        towerWeightTonnes: Number(tower.tower_weight_t ?? 0),
        manualProductionTonnes:
          allocation.manualProductionTonnes === "" ||
          allocation.manualProductionTonnes === undefined
            ? null
            : Number(allocation.manualProductionTonnes),
      });

      const rawHours = Number(allocation.rawHours ?? 0);
      const productionHours = Number(allocation.productionHours ?? 0);

      const { error: allocationError } = await admin
        .from("v2_docket_tower_allocations")
        .insert({
          docket_id: docket.id,
          tower_id: towerId,
          raw_hours: rawHours,
          production_hours: productionHours,
          progress_before: progress.overallBefore,
          progress_after: progress.overallAfter,
          progress_delta: progress.overallDelta,
          earned_tonnes: progress.earnedTonnes,
          assembly_before: progress.assemblyBefore,
          assembly_after: progress.assemblyAfter,
          erection_before: progress.erectionBefore,
          erection_after: progress.erectionAfter,
          metadata: {},
        });

      if (allocationError) throw new Error(allocationError.message);

      const stageProgressRows = calculationStages.map((stage) => ({
        docket_id: docket.id,
        tower_id: towerId,
        stage_definition_id: stage.id,
        is_applicable: stage.applicable,
        percent_before: stage.percentBefore,
        percent_after: stage.percentAfter,
      }));

      const { error: stageProgressError } = await admin
        .from("v2_docket_stage_progress")
        .insert(stageProgressRows);

      if (stageProgressError) throw new Error(stageProgressError.message);

      for (const stage of calculationStages) {
        const { error: stateUpsertError } = await admin
          .from("v2_tower_progress_stage_state")
          .upsert(
            {
              tower_id: towerId,
              stage_definition_id: stage.id,
              is_applicable: stage.applicable,
              percent_complete: stage.percentAfter,
              updated_from_type: "daily_docket",
              updated_from_id: docket.id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "tower_id,stage_definition_id" },
          );

        if (stateUpsertError) throw new Error(stateUpsertError.message);
      }

      await admin
        .from("v2_towers")
        .update({
          assembly_percent: progress.assemblyAfter,
          erection_percent: progress.erectionAfter,
        })
        .eq("id", towerId);

      actualAllocations.push({
        towerId,
        assemblyAfter: progress.assemblyAfter,
        erectionAfter: progress.erectionAfter,
        progressDelta: progress.overallDelta,
        earnedTonnes: progress.earnedTonnes,
        rawHours,
        productionHours,
        delayHours: Number(allocation.delayHours ?? 0),
      });
    }

    const materialEvents = Array.isArray(body.materialEvents)
      ? body.materialEvents
      : [];

    if (materialEvents.length > 0) {
      const { error: materialError } = await admin
        .from("v2_material_events")
        .insert(
          materialEvents
            .filter(
              (event: Record<string, unknown>) =>
                String(event.eventType ?? "").trim() &&
                String(event.itemReference ?? "").trim(),
            )
            .map((event: Record<string, unknown>) => ({
              organisation_id:
                project.workspace.organisation.organisationId,
              project_id: projectId,
              tower_id:
                event.towerId ? String(event.towerId) : null,
              docket_id: docket.id,
              event_type: String(event.eventType),
              item_reference: String(event.itemReference),
              description: String(event.description ?? "").trim() || null,
              quantity: Number(event.quantity ?? 1),
              unit: String(event.unit ?? "ea"),
              status: "open",
              notes: String(event.notes ?? "").trim() || null,
            })),
        );

      if (materialError) throw new Error(materialError.message);
    }

    await upsertProductionActualsFromDocket(admin, {
      organisationId:
        project.workspace.organisation.organisationId,
      projectId,
      docketId: docket.id,
      docketDate,
      crewLabel: String(body.crewLabel ?? "").trim() || null,
      allocations: actualAllocations,
    });

    return NextResponse.json({
      ok: true,
      docketId: docket.id,
      rawManhours: calculatedLabour.rawManhours,
      productionManhours: calculatedLabour.productionManhours,
      totalEarnedTonnes: actualAllocations.reduce(
        (sum, row) => sum + row.earnedTonnes,
        0,
      ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Daily Docket could not be saved.",
      },
      { status: 400 },
    );
  }
}
