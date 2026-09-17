/* eslint-disable @typescript-eslint/no-explicit-any */

// app/api/mobile/daily-dockets/save/route.ts
//
// Batch 2A implements the stable server-side save for:
// - docket header
// - labour
// - plant
// - general delays
// - primary + additional tower progress
// - production tower allocations
// - revision/rectification allocations
// - tower progress recalculation
//
// Batch 2B extends this same route with:
// - materials / outstanding materials
// - bundle transfers
// - linked Dayworks
// - controlled Defect linking/creation
//
// The mobile UI is NOT switched to this route until Batch 2B.

import { NextResponse } from "next/server";

import {
  calculateLabourTotals,
  calculateProgressTotals,
  type DelayCalculationRow,
  type LabourCalculationRow,
  type LegacyProgressCalculationRow,
  type SectionV2CalculationRow,
} from "@/lib/dockets/calculations";
import {
  buildMobilisationLine,
  clean,
  docketLocked,
  mobileDocketApiError,
  num,
  requireMobileDocketUser,
  uniqueStrings,
} from "@/lib/dockets/mobile-docket-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SaveBody = {
  draft?: any;
};

function delaySummary(delays: any[]) {
  return delays.reduce<Record<string, number>>(
    (summary, row) => {
      const type = clean(row.delay_type) || "other";
      summary[type] =
        (summary[type] ?? 0) +
        num(row.delay_hours);
      return summary;
    },
    {},
  );
}

function calculationLabourRows(
  draft: any,
): LabourCalculationRow[] {
  return (draft.labourRows ?? []).map(
    (row: any) => ({
      worker_name: clean(row.worker_name),
      time_in: clean(row.time_in),
      time_out: clean(row.time_out),
      total_hours: row.total_hours,
      prestart_minutes:
        row.prestart_minutes ??
        draft.prestartMinutes,
      lunch_minutes:
        row.lunch_minutes ??
        draft.lunchBreakMinutes,
      travel_in_minutes:
        row.travel_in_minutes ??
        draft.travelInMinutes,
      travel_out_minutes:
        row.travel_out_minutes ??
        draft.travelOutMinutes,
      mobilisation_hours:
        row.mobilisation_hours,
      delay_hours: row.delay_hours,
      delay_reason: clean(row.delay_reason),
      production_hours:
        row.production_hours,
    }),
  );
}

function calculationDelays(
  draft: any,
): DelayCalculationRow[] {
  return (draft.delayRows ?? []).map(
    (row: any) => ({
      delay_type: clean(row.delay_type) || "other",
      delay_reason: clean(row.delay_reason),
      delay_hours: row.delay_hours,
      applies_to:
        clean(row.applies_to) ===
        "selected_workers"
          ? "selected_workers"
          : "entire_crew",
      worker_names: uniqueStrings(
        row.worker_names,
      ),
      delay_applies_mode:
        clean(row.delay_applies_mode) ===
        "labour_and_plant"
          ? "labour_and_plant"
          : "labour_only",
      plant_names: uniqueStrings(
        row.plant_names,
      ),
    }),
  );
}

function mobilisationCalculation(draft: any) {
  const durationHours = Math.max(
    0,
    num(draft.mobilisationHours),
  );

  return {
    enabled: Boolean(
      draft.mobilisation?.enabled,
    ),
    durationMinutes: durationHours * 60,
    workerNames: uniqueStrings(
      draft.mobilisation?.worker_names,
    ),
  };
}

function progressTotals(draft: any) {
  return calculateProgressTotals({
    progressModel:
      clean(draft.progressModel) === "legacy"
        ? "legacy"
        : "section_v2",
    sectionV2Rows:
      (draft.sectionV2Rows ??
        []) as SectionV2CalculationRow[],
    legacyRows:
      (draft.legacyProgressRows ??
        []) as LegacyProgressCalculationRow[],
    hasBodyExtension:
      draft.hasBodyExtension !== false,
  });
}

function docketPayload(args: {
  draft: any;
  labourTotals: ReturnType<
    typeof calculateLabourTotals
  >;
  progress: ReturnType<
    typeof calculateProgressTotals
  >;
}) {
  const { draft, labourTotals, progress } = args;
  const delays = draft.delayRows ?? [];
  const summary = delaySummary(delays);

  const mobilisationLine =
    buildMobilisationLine({
      mobilisation: draft.mobilisation,
      mobilisationHours:
        draft.mobilisationHours,
    });

  const siteSummary = clean(
    draft.dailySiteSummary,
  );

  return {
    project_id: clean(draft.projectId),
    tower_id: clean(draft.towerId),
    docket_date: clean(draft.docketDate),
    crew: clean(draft.crewName) || null,
    leading_hand:
      clean(draft.leadingHand) || null,
    weather: clean(draft.weather) || null,
    rate_type:
      clean(draft.rateType) ===
      "schedule_of_rates"
        ? "schedule_of_rates"
        : "tonnage_rate",
    progress_model:
      clean(draft.progressModel) === "legacy"
        ? "legacy"
        : "section_v2",

    approval_status:
      clean(draft.approvalStatus) || "draft",

    assembly_percent:
      progress.assemblyPercent,
    erection_percent:
      progress.erectionPercent,

    weather_delay_hours:
      summary.weather ?? 0,
    lightning_delay_hours:
      summary.lightning ?? 0,
    toolbox_delay_hours:
      summary.toolbox ?? 0,
    other_delay_hours:
      summary.other ?? 0,

    daily_site_summary:
      siteSummary || null,
    rfi_references: uniqueStrings(
      draft.rfiReferences,
    ),

    prestart_minutes: num(
      draft.prestartMinutes,
    ),
    lunch_break_minutes: num(
      draft.lunchBreakMinutes,
    ),
    travel_in_minutes: num(
      draft.travelInMinutes,
    ),
    travel_out_minutes: num(
      draft.travelOutMinutes,
    ),

    mobilisation_hours: Boolean(
      draft.mobilisation?.enabled,
    )
      ? Math.max(
          0,
          num(draft.mobilisationHours),
        )
      : 0,
    mobilisation_notes: Boolean(
      draft.mobilisation?.enabled,
    )
      ? clean(draft.mobilisation?.notes) ||
        null
      : null,

    delays_comments: [
      siteSummary,
      mobilisationLine,
    ]
      .filter(Boolean)
      .join("\n") || null,

    raw_manhours:
      labourTotals.rawManhours,
    production_manhours:
      labourTotals.productionManhours,

    incident_occurred: Boolean(
      draft.incidentOccurred,
    ),
    incident_type:
      draft.incidentOccurred
        ? clean(draft.incidentType) || null
        : null,
    incident_notes:
      draft.incidentOccurred
        ? clean(draft.incidentNotes) || null
        : null,

    bc_rep_name:
      clean(draft.bcRepName) || null,
    bc_rep_email:
      clean(draft.bcRepEmail) || null,
    bc_rep_user_id:
      clean(draft.bcRepUserId) || null,
    bc_signature_data_url:
      clean(draft.bcSignatureDataUrl) ||
      null,
    bc_signed_at:
      clean(draft.bcSignedAt) || null,
  };
}

function labourPayload(
  docketId: string,
  draft: any,
  labourTotals: ReturnType<
    typeof calculateLabourTotals
  >,
) {
  return labourTotals.rows
    .filter((row) =>
      clean(row.worker_name),
    )
    .map((row) => ({
      docket_id: docketId,
      worker_name: clean(row.worker_name),
      time_in: clean(row.time_in) || null,
      time_out: clean(row.time_out) || null,
      total_hours: num(row.total_hours),
      prestart_minutes: num(
        row.prestart_minutes,
      ),
      lunch_minutes: num(
        row.lunch_minutes,
      ),
      travel_in_minutes: num(
        row.travel_in_minutes,
      ),
      travel_out_minutes: num(
        row.travel_out_minutes,
      ),

      // database stores decimal hours
      mobilisation_hours:
        num(row.mobilisation_hours) / 60,

      delay_hours: num(row.delay_hours),
      delay_reason:
        clean(row.delay_reason) || null,
      production_hours: num(
        row.production_hours,
      ),
    }));
}

function delayPayload(
  docketId: string,
  draft: any,
) {
  return (draft.delayRows ?? [])
    .filter(
      (row: any) =>
        num(row.delay_hours) > 0 ||
        clean(row.delay_reason),
    )
    .map((row: any) => ({
      docket_id: docketId,
      delay_type:
        clean(row.delay_type) || "other",
      delay_reason:
        clean(row.delay_reason) || null,
      delay_hours: num(row.delay_hours),
      applies_to:
        clean(row.applies_to) ===
        "selected_workers"
          ? "selected_workers"
          : "entire_crew",
      worker_names:
        clean(row.applies_to) ===
        "selected_workers"
          ? uniqueStrings(row.worker_names)
          : [],
      delay_applies_mode:
        clean(row.delay_applies_mode) ===
        "labour_and_plant"
          ? "labour_and_plant"
          : "labour_only",
      plant_names:
        clean(row.delay_applies_mode) ===
        "labour_and_plant"
          ? uniqueStrings(row.plant_names)
          : [],
    }));
}

function plantPayload(
  docketId: string,
  draft: any,
) {
  if (
    clean(draft.rateType) !==
    "schedule_of_rates"
  ) {
    return [];
  }

  return (draft.plantRows ?? [])
    .filter(
      (row: any) =>
        clean(row.plant_name) ||
        clean(row.asset_id) ||
        clean(row.plant_type),
    )
    .map((row: any) => ({
      docket_id: docketId,
      plant_name:
        clean(row.plant_name) || null,
      plant_type:
        clean(row.plant_type) || null,
      asset_number:
        clean(row.asset_id) || null,
      operator_name:
        clean(row.operator_name) || null,
      time_in: clean(row.time_in) || null,
      time_out: clean(row.time_out) || null,
      total_hours: num(row.total_hours),
      notes: clean(row.notes) || null,
    }));
}

function progressPayload(
  docketId: string,
  draft: any,
) {
  const primaryTowerId = clean(
    draft.towerId,
  );

  const primary =
    clean(draft.progressModel) === "legacy"
      ? (draft.legacyProgressRows ?? []).map(
          (row: any) => ({
            docket_id: docketId,
            tower_id: primaryTowerId,
            progress_model: "legacy",
            section:
              clean(row.section_label) ||
              "Section",
            section_label:
              clean(row.section_label) ||
              "Section",
            assembled_qty: num(
              row.assembled_qty,
            ),
            erected_qty: num(
              row.erected_qty,
            ),
          }),
        )
      : (draft.sectionV2Rows ?? [])
          .filter(
            (row: any) =>
              draft.hasBodyExtension !== false ||
              clean(row.section_code) !== "BE",
          )
          .map((row: any) => ({
            docket_id: docketId,
            tower_id: primaryTowerId,
            progress_model: "section_v2",
            section: clean(row.section_code),
            section_code:
              clean(row.section_code),
            section_label:
              clean(row.section_label),
            assembly_today:
              clean(row.assembly_today) === ""
                ? null
                : num(row.assembly_today),
            assembly_overall:
              clean(row.assembly_today) === ""
                ? null
                : num(row.assembly_today),
            erection_today:
              clean(row.erection_today) === ""
                ? null
                : num(row.erection_today),
            erection_overall:
              clean(row.erection_today) === ""
                ? null
                : num(row.erection_today),
            assembly_weight: num(
              row.assembly_weight,
            ),
            erection_weight: num(
              row.erection_weight,
            ),
            assembled_qty: num(
              row.assembly_today,
            ),
            erected_qty: num(
              row.erection_today,
            ),
          }));

  const additional = (
    draft.additionalTowerWork ?? []
  ).flatMap((work: any) => {
    const towerId = clean(
      work.target_tower_id,
    );

    if (!towerId) return [];

    return (work.progress_rows ?? [])
      .filter(
        (row: any) =>
          work.has_body_extension !== false ||
          clean(row.section_code) !== "BE",
      )
      .map((row: any) => ({
        docket_id: docketId,
        tower_id: towerId,
        progress_model: "section_v2",
        section: clean(row.section_code),
        section_code:
          clean(row.section_code),
        section_label:
          clean(row.section_label),
        assembly_today:
          clean(row.assembly_today) === ""
            ? null
            : num(row.assembly_today),
        assembly_overall:
          clean(row.assembly_today) === ""
            ? null
            : num(row.assembly_today),
        erection_today:
          clean(row.erection_today) === ""
            ? null
            : num(row.erection_today),
        erection_overall:
          clean(row.erection_today) === ""
            ? null
            : num(row.erection_today),
        assembly_weight: num(
          row.assembly_weight,
        ),
        erection_weight: num(
          row.erection_weight,
        ),
        assembled_qty: num(
          row.assembly_today,
        ),
        erected_qty: num(
          row.erection_today,
        ),
      }));
  });

  return [...primary, ...additional];
}

function allocationPayload(
  docketId: string,
  draft: any,
  productionManhours: number,
) {
  const sourceTowerId = clean(
    draft.towerId,
  );

  const workers = (
    draft.labourRows ?? []
  )
    .map((row: any) =>
      clean(row.worker_name),
    )
    .filter(Boolean);

  const workerCount = workers.length;

  const additional = (
    draft.additionalTowerWork ?? []
  )
    .filter(
      (row: any) =>
        clean(row.target_tower_id) &&
        clean(row.target_tower_id) !==
          sourceTowerId &&
        num(row.allocation_percent) > 0,
    )
    .map((row: any) => {
      const allocatedMh =
        productionManhours *
        (Math.max(
          0,
          Math.min(
            100,
            num(row.allocation_percent),
          ),
        ) /
          100);

      return {
        docket_id: docketId,
        project_id: clean(
          draft.projectId,
        ),
        source_tower_id: sourceTowerId,
        target_tower_id: clean(
          row.target_tower_id,
        ),
        allocation_type: "production",
        activity:
          clean(row.activity) || "mixed",
        hours:
          workerCount > 0
            ? allocatedMh / workerCount
            : 0,
        worker_names: workers,
        reason: clean(row.notes) || null,
      };
    });

  const additionalPercent = (
    draft.additionalTowerWork ?? []
  ).reduce(
    (sum: number, row: any) =>
      sum +
      Math.max(
        0,
        Math.min(
          100,
          num(row.allocation_percent),
        ),
      ),
    0,
  );

  if (additionalPercent > 100.0001) {
    throw new Error(
      "Additional tower work allocation cannot exceed 100%.",
    );
  }

  const primaryPercent = Math.max(
    0,
    100 - additionalPercent,
  );

  const primary = workerCount
    ? [
        {
          docket_id: docketId,
          project_id: clean(
            draft.projectId,
          ),
          source_tower_id: sourceTowerId,
          target_tower_id: sourceTowerId,
          allocation_type: "production",
          activity:
            clean(
              draft.primaryWorkActivity,
            ) || "mixed",
          hours:
            (productionManhours *
              (primaryPercent / 100)) /
            workerCount,
          worker_names: workers,
          reason:
            clean(draft.primaryWorkNotes) ||
            null,
        },
      ]
    : [];

  const revision = (
    draft.towerRevisionAllocations ?? []
  )
    .filter(
      (row: any) =>
        clean(row.target_tower_id) &&
        clean(row.target_tower_id) !==
          sourceTowerId &&
        num(row.hours) > 0 &&
        uniqueStrings(row.worker_names)
          .length > 0,
    )
    .map((row: any) => ({
      docket_id: docketId,
      project_id: clean(draft.projectId),
      source_tower_id: sourceTowerId,
      target_tower_id: clean(
        row.target_tower_id,
      ),
      allocation_type: "revision",
      activity: "rectification",
      hours: num(row.hours),
      worker_names: uniqueStrings(
        row.worker_names,
      ),
      reason: clean(row.reason) || null,
    }));

  const revisionMh = revision.reduce(
    (sum: number, row: any) =>
      sum +
      num(row.hours) *
        row.worker_names.length,
    0,
  );

  if (
    revisionMh >
    productionManhours + 0.0001
  ) {
    throw new Error(
      "Revision / rectification allocation cannot exceed Production MH.",
    );
  }

  return [
    ...primary,
    ...additional,
    ...revision,
  ];
}

async function recalcTower(
  service: any,
  towerId: string,
) {
  const { data, error } = await service
    .from("tower_daily_dockets")
    .select(
      "assembly_percent,erection_percent",
    )
    .eq("tower_id", towerId);

  if (error) throw new Error(error.message);

  const progress = (data ?? []).reduce(
    (max: number, row: any) =>
      Math.max(
        max,
        Math.round(
          num(row.assembly_percent) * 0.5 +
            num(row.erection_percent) *
              0.5,
        ),
      ),
    0,
  );

  const status =
    progress >= 100
      ? "Complete"
      : progress > 0
        ? "In Progress"
        : "Not Started";

  const { error: updateError } =
    await service
      .from("towers")
      .update({
        progress,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", towerId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SaveBody;
    const draft = body?.draft;

    if (!draft || typeof draft !== "object") {
      return NextResponse.json(
        { error: "Daily Docket draft is required." },
        { status: 400 },
      );
    }

    const projectId = clean(draft.projectId);
    const towerId = clean(draft.towerId);

    if (!projectId || !towerId) {
      return NextResponse.json(
        {
          error:
            "Project and tower are required.",
        },
        { status: 400 },
      );
    }

    if (!clean(draft.docketDate)) {
      return NextResponse.json(
        { error: "Docket date is required." },
        { status: 400 },
      );
    }

    if (!clean(draft.leadingHand)) {
      return NextResponse.json(
        {
          error:
            "Leading Hand is required.",
        },
        { status: 400 },
      );
    }

    const { service, identity } =
      await requireMobileDocketUser(
        request,
        projectId,
      );

    const { data: tower, error: towerError } =
      await service
        .from("towers")
        .select("id,project_id")
        .eq("id", towerId)
        .eq("project_id", projectId)
        .maybeSingle();

    if (towerError) {
      throw new Error(towerError.message);
    }

    if (!tower) {
      return NextResponse.json(
        {
          error:
            "Tower does not belong to the selected project.",
        },
        { status: 404 },
      );
    }

    const docketId = clean(draft.docketId);

    if (docketId) {
      const { data: existing, error } =
        await service
          .from("tower_daily_dockets")
          .select(
            "id,project_id,tower_id,approval_status,client_rep_name,signed_date",
          )
          .eq("id", docketId)
          .eq("project_id", projectId)
          .eq("tower_id", towerId)
          .maybeSingle();

      if (error) throw new Error(error.message);

      if (!existing) {
        return NextResponse.json(
          {
            error:
              "Daily Docket could not be found.",
          },
          { status: 404 },
        );
      }

      if (docketLocked(existing)) {
        return NextResponse.json(
          {
            error:
              "This Daily Docket is locked by its approval status and cannot be edited.",
          },
          { status: 409 },
        );
      }
    }

    const delays =
      calculationDelays(draft);
    const labour =
      calculationLabourRows(draft);
    const mobilisation =
      mobilisationCalculation(draft);

    const labourTotals =
      calculateLabourTotals(
        labour,
        delays,
        mobilisation,
      );

    const progress =
      progressTotals(draft);

    const header = docketPayload({
      draft: {
        ...draft,
        bcRepName:
          clean(draft.bcRepName) ||
          identity.name,
        bcRepEmail:
          clean(draft.bcRepEmail) ||
          identity.email,
        bcRepUserId:
          clean(draft.bcRepUserId) ||
          identity.userId,
      },
      labourTotals,
      progress,
    });

    let savedDocketId = docketId;

    if (!savedDocketId) {
      const { data, error } = await service
        .from("tower_daily_dockets")
        .insert({
          ...header,
          approval_status: "draft",
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new Error(
          error?.message ||
            "Daily Docket could not be created.",
        );
      }

      savedDocketId = clean(data.id);
    } else {
      const { error } = await service
        .from("tower_daily_dockets")
        .update(header)
        .eq("id", savedDocketId);

      if (error) throw new Error(error.message);
    }

    const [
      deleteLabour,
      deletePlant,
      deleteDelays,
      deleteProgress,
      deleteAllocations,
    ] = await Promise.all([
      service
        .from("tower_docket_labour")
        .delete()
        .eq("docket_id", savedDocketId),
      service
        .from("tower_docket_plant")
        .delete()
        .eq("docket_id", savedDocketId),
      service
        .from("tower_docket_delays")
        .delete()
        .eq("docket_id", savedDocketId),
      service
        .from("tower_docket_progress")
        .delete()
        .eq("docket_id", savedDocketId),
      service
        .from(
          "tower_docket_hour_allocations",
        )
        .delete()
        .eq("docket_id", savedDocketId)
        .is("transfer_id", null),
    ]);

    const deleteError = [
      deleteLabour.error,
      deletePlant.error,
      deleteDelays.error,
      deleteProgress.error,
      deleteAllocations.error,
    ].find(Boolean);

    if (deleteError) {
      throw new Error(
        deleteError.message ||
          "Existing Daily Docket detail could not be refreshed.",
      );
    }

    const labourRows = labourPayload(
      savedDocketId,
      draft,
      labourTotals,
    );
    const plantRows = plantPayload(
      savedDocketId,
      draft,
    );
    const delayRows = delayPayload(
      savedDocketId,
      draft,
    );
    const progressRows = progressPayload(
      savedDocketId,
      draft,
    );
    const allocationRows =
      allocationPayload(
        savedDocketId,
        draft,
        labourTotals.productionManhours,
      );

    const inserts = await Promise.all([
      labourRows.length
        ? service
            .from("tower_docket_labour")
            .insert(labourRows)
        : Promise.resolve({ error: null }),
      plantRows.length
        ? service
            .from("tower_docket_plant")
            .insert(plantRows)
        : Promise.resolve({ error: null }),
      delayRows.length
        ? service
            .from("tower_docket_delays")
            .insert(delayRows)
        : Promise.resolve({ error: null }),
      progressRows.length
        ? service
            .from("tower_docket_progress")
            .insert(progressRows)
        : Promise.resolve({ error: null }),
      allocationRows.length
        ? service
            .from(
              "tower_docket_hour_allocations",
            )
            .insert(allocationRows)
        : Promise.resolve({ error: null }),
    ]);

    const insertError = inserts
      .map((result: any) => result.error)
      .find(Boolean);

    if (insertError) {
      throw new Error(
        insertError.message ||
          "Daily Docket detail could not be saved.",
      );
    }

    await recalcTower(service, towerId);

    return NextResponse.json({
      success: true,
      docketId: savedDocketId,
      approvalStatus:
        clean(header.approval_status) || "draft",
      rawManhours:
        labourTotals.rawManhours,
      productionManhours:
        labourTotals.productionManhours,
      assemblyPercent:
        progress.assemblyPercent,
      erectionPercent:
        progress.erectionPercent,
      overallProgressPercent:
        progress.totalProgressPercent,
      warnings: [
        "Batch 2A save route does not yet write material events, bundle transfers, linked Dayworks or controlled Defects. The mobile editor is not switched to this route until Batch 2B adds those features.",
      ],
    });
  } catch (error) {
    const apiError = mobileDocketApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
