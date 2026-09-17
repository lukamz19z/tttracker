/* eslint-disable @typescript-eslint/no-explicit-any */

// app/api/mobile/daily-dockets/editor/route.ts

import { NextResponse } from "next/server";

import {
  SECTION_PROGRESS_WEIGHTS,
} from "@/lib/dockets/calculations";
import {
  loadOutstandingMobileMaterialIssues,
} from "@/lib/dockets/mobile-docket-materials";
import {
  loadMobileBundleTransferContext,
} from "@/lib/dockets/mobile-docket-transfers";
import {
  blankSectionV2Rows,
  clean,
  inferBodyExtension,
  mobileDocketApiError,
  num,
  parseMobilisation,
  requireMobileDocketUser,
  stripMobilisationLine,
  timeFromIso,
  uniqueStrings,
} from "@/lib/dockets/mobile-docket-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todaySydneyLike() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function labourRow(row: any) {
  return {
    worker_name: clean(row.worker_name),
    time_in: clean(row.time_in),
    time_out: clean(row.time_out),
    total_hours:
      row.total_hours == null
        ? ""
        : String(row.total_hours),
    prestart_minutes:
      row.prestart_minutes == null
        ? ""
        : String(row.prestart_minutes),
    lunch_minutes:
      row.lunch_minutes == null
        ? ""
        : String(row.lunch_minutes),
    travel_in_minutes:
      row.travel_in_minutes == null
        ? ""
        : String(row.travel_in_minutes),
    travel_out_minutes:
      row.travel_out_minutes == null
        ? ""
        : String(row.travel_out_minutes),

    // Editor/calculation model stores mobilisation as minutes.
    mobilisation_hours:
      row.mobilisation_hours == null
        ? ""
        : String(num(row.mobilisation_hours) * 60),

    delay_hours:
      row.delay_hours == null
        ? ""
        : String(row.delay_hours),
    delay_reason: clean(row.delay_reason),
    production_hours:
      row.production_hours == null
        ? ""
        : String(row.production_hours),
  };
}

function plantRow(row: any) {
  return {
    plant_name: clean(row.plant_name),
    plant_type: clean(row.plant_type),
    asset_id: clean(row.asset_number),
    operator_name: clean(row.operator_name),
    time_in: clean(row.time_in),
    time_out: clean(row.time_out),
    total_hours:
      row.total_hours == null
        ? ""
        : String(row.total_hours),
    notes: clean(row.notes),
  };
}

function delayRow(row: any) {
  return {
    ui_id: clean(row.id) || crypto.randomUUID(),
    id: clean(row.id) || undefined,
    delay_type: clean(row.delay_type) || "other",
    delay_reason: clean(row.delay_reason),
    delay_hours:
      row.delay_hours == null
        ? ""
        : String(row.delay_hours),
    applies_to:
      clean(row.applies_to) === "selected_workers"
        ? "selected_workers"
        : "entire_crew",
    worker_names: uniqueStrings(row.worker_names),
    delay_applies_mode:
      clean(row.delay_applies_mode) ===
      "labour_and_plant"
        ? "labour_and_plant"
        : "labour_only",
    plant_names: uniqueStrings(row.plant_names),
  };
}

function materialItem(row: any) {
  const manualBolt =
    clean(row.material_type) === "bolt" &&
    !clean(row.source_record_id);

  return {
    ui_id: clean(row.id) || crypto.randomUUID(),
    search_mode:
      clean(row.source_table) ===
      "tower_required_bundles"
        ? "bundle"
        : "member",
    source_table: clean(row.source_table),
    source_record_id: clean(row.source_record_id),
    issue_key: clean(row.issue_key),
    source_issue_key: clean(row.source_issue_key),
    bundle_id: clean(row.bundle_id),
    bundle_no: clean(row.bundle_no),
    bundle_section: clean(row.bundle_section),
    material_kind: manualBolt
      ? "manual_bolt"
      : clean(row.source_record_id)
        ? "registered"
        : "manual",
    manual_category: "",
    bolt_size: manualBolt
      ? clean(row.bolt_size) ||
        clean(row.item_reference)
      : "",
    search_query: "",
    search_loading: false,
    search_results: [],
    item_reference: manualBolt
      ? ""
      : clean(row.item_reference),
    item_description: clean(row.item_description),
    quantity:
      row.quantity == null ? "1" : String(row.quantity),
    unit: clean(row.unit) || "ea",
  };
}

function materialEvent(row: any) {
  return {
    ui_id: clean(row.id) || crypto.randomUUID(),
    id: clean(row.id) || undefined,
    event_type: clean(row.event_type) || "missing",
    source_tower_id: clean(row.source_tower_id),
    destination_tower_id: clean(row.destination_tower_id),
    source_location: clean(row.source_location),
    destination_location: clean(row.destination_location),
    occurred_time: timeFromIso(row.occurred_at),
    affected_work: Boolean(row.affected_work),
    affected_activity: clean(row.affected_activity),
    affected_section: clean(row.affected_section),
    work_outcome: clean(row.work_outcome),
    impact_start_time: timeFromIso(row.impact_started_at),
    impact_finish_time: timeFromIso(row.impact_finished_at),
    impact_ongoing: Boolean(row.impact_ongoing),
    current_effect: clean(row.current_effect),
    mitigation_actions: uniqueStrings(
      row.mitigation_actions,
    ),
    notes: clean(row.notes),
    items: (row.items ?? []).length
      ? (row.items ?? []).map(materialItem)
      : [],
    people: (row.people ?? []).map((person: any) => ({
      ui_id: clean(person.id) || crypto.randomUUID(),
      employee_id: clean(person.employee_id),
      employee_name: clean(person.employee_name),
      employee_role: clean(person.employee_role),
      started_at: timeFromIso(person.started_at),
      finished_at: timeFromIso(person.finished_at),
    })),
    plant: (row.plant ?? []).map((plant: any) => ({
      ui_id: clean(plant.id) || crypto.randomUUID(),
      plant_name: clean(plant.plant_name),
      asset_number: clean(plant.asset_number),
      started_at: timeFromIso(plant.started_at),
      finished_at: timeFromIso(plant.finished_at),
    })),
  };
}

function progressRowsForTower(
  allRows: any[],
  towerId: string,
) {
  const rows = allRows.filter(
    (row) =>
      !clean(row.tower_id) ||
      clean(row.tower_id) === towerId,
  );

  return blankSectionV2Rows().map((config) => {
    const saved = rows.find(
      (row) =>
        clean(row.section_code).toUpperCase() ===
        config.section_code.toUpperCase(),
    );

    if (!saved) return config;

    return {
      ...config,
      section_label:
        clean(saved.section_label) ||
        config.section_label,
      assembly_today: clean(
        saved.assembly_overall ??
          saved.assembly_today ??
          saved.assembled_qty,
      ),
      erection_today: clean(
        saved.erection_overall ??
          saved.erection_today ??
          saved.erected_qty,
      ),
      assembly_weight:
        SECTION_PROGRESS_WEIGHTS[
          config.section_code
        ] ?? config.assembly_weight,
      erection_weight:
        SECTION_PROGRESS_WEIGHTS[
          config.section_code
        ] ?? config.erection_weight,
    };
  });
}

async function loadDocketData(
  service: any,
  docket: any,
  tower: any,
  projectTowers: any[],
) {
  const docketId = clean(docket.id);
  const towerId = clean(docket.tower_id);

  const [
    labourResult,
    plantResult,
    delayResult,
    progressResult,
    materialResult,
    allocationResult,
    defectLinkResult,
  ] = await Promise.all([
    service
      .from("tower_docket_labour")
      .select("*")
      .eq("docket_id", docketId),
    service
      .from("tower_docket_plant")
      .select("*")
      .eq("docket_id", docketId),
    service
      .from("tower_docket_delays")
      .select("*")
      .eq("docket_id", docketId)
      .order("created_at"),
    service
      .from("tower_docket_progress")
      .select("*")
      .eq("docket_id", docketId),
    service
      .from("tower_material_events")
      .select(`
        *,
        items:tower_material_event_items(*),
        people:tower_material_event_people(*),
        plant:tower_material_event_plant(*)
      `)
      .eq("docket_id", docketId)
      .is("transfer_id", null)
      .order("occurred_at"),
    service
      .from("tower_docket_hour_allocations")
      .select("*")
      .eq("docket_id", docketId)
      .order("created_at"),
    service
      .from("tower_docket_defect_links")
      .select(`
        id,
        link_type,
        defect:tower_defects(*)
      `)
      .eq("docket_id", docketId),
  ]);

  const errors = [
    labourResult.error,
    plantResult.error,
    delayResult.error,
    progressResult.error,
    materialResult.error,
    allocationResult.error,
  ].filter(Boolean);

  if (errors.length) {
    throw new Error(
      errors[0]?.message ||
        "Daily Docket detail could not be loaded.",
    );
  }

  const labourRows = (labourResult.data ?? []).map(
    labourRow,
  );
  const plantRows = (plantResult.data ?? []).map(
    plantRow,
  );
  const delayRows = (delayResult.data ?? []).map(
    delayRow,
  );
  const progress = progressResult.data ?? [];
  const materialEvents = (
    materialResult.data ?? []
  ).map(materialEvent);
  const allocations = allocationResult.data ?? [];

  const mobilisation = parseMobilisation(
    docket.delays_comments,
    docket.mobilisation_hours,
  );

  const productionAllocations = allocations.filter(
    (row: any) =>
      clean(row.allocation_type) === "production",
  );

  const primaryProduction =
    productionAllocations.find(
      (row: any) =>
        clean(row.target_tower_id) === towerId,
    );

  const additionalTowerWork =
    productionAllocations
      .filter(
        (row: any) =>
          clean(row.target_tower_id) &&
          clean(row.target_tower_id) !== towerId,
      )
      .map((row: any) => {
        const targetTowerId = clean(
          row.target_tower_id,
        );
        const targetTower = projectTowers.find(
          (candidate) =>
            clean(candidate.id) === targetTowerId,
        );
        const workerNames = uniqueStrings(
          row.worker_names,
        );

        return {
          id: clean(row.id) || undefined,
          ui_id:
            clean(row.id) || crypto.randomUUID(),
          target_tower_id: targetTowerId,
          allocation_percent: "",
          saved_allocated_mh:
            num(row.hours) * workerNames.length,
          activity:
            clean(row.activity) || "mixed",
          notes: clean(row.reason),
          has_body_extension:
            inferBodyExtension(targetTower),
          progress_rows: progressRowsForTower(
            progress,
            targetTowerId,
          ),
        };
      });

  const revisionAllocations = allocations
    .filter(
      (row: any) =>
        !clean(row.allocation_type) ||
        clean(row.allocation_type) === "revision",
    )
    .map((row: any) => ({
      id: clean(row.id) || undefined,
      ui_id: clean(row.id) || crypto.randomUUID(),
      target_tower_id: clean(row.target_tower_id),
      hours:
        row.hours == null ? "" : String(row.hours),
      worker_names: uniqueStrings(
        row.worker_names,
      ),
      reason: clean(row.reason),
    }));

  const linkedDefects = defectLinkResult.error
    ? []
    : (defectLinkResult.data ?? [])
        .map((link: any) => {
          const defect = Array.isArray(link.defect)
            ? link.defect[0]
            : link.defect;

          if (!defect) return null;

          return {
            ...defect,
            link_id: clean(link.id),
            link_type:
              clean(link.link_type) === "raised"
                ? "raised"
                : "referenced",
          };
        })
        .filter(Boolean);

  const primaryRows = progress.filter(
    (row: any) =>
      !clean(row.tower_id) ||
      clean(row.tower_id) === towerId,
  );

  const progressModel =
    clean(docket.progress_model) === "section_v2" ||
    primaryRows.some(
      (row: any) =>
        clean(row.progress_model) === "section_v2",
    )
      ? "section_v2"
      : "legacy";

  return {
    mode: "edit",
    docketId,

    projectId: clean(docket.project_id),
    towerId,
    docketDate: clean(docket.docket_date),

    selectedCrewId: "",
    crewName: clean(docket.crew),
    leadingHand: clean(docket.leading_hand),
    weather: clean(docket.weather),
    rateType:
      clean(docket.rate_type) === "schedule_of_rates"
        ? "schedule_of_rates"
        : "tonnage_rate",

    progressModel,
    approvalStatus:
      clean(docket.approval_status) || "legacy",
    approvalRevision: num(docket.approval_revision),

    dailySiteSummary:
      clean(docket.daily_site_summary) ||
      stripMobilisationLine(docket.delays_comments),
    rfiReferences: uniqueStrings(
      docket.rfi_references,
    ),

    prestartMinutes:
      docket.prestart_minutes == null
        ? ""
        : String(docket.prestart_minutes),
    lunchBreakMinutes:
      docket.lunch_break_minutes == null
        ? ""
        : String(docket.lunch_break_minutes),
    travelInMinutes:
      docket.travel_in_minutes == null
        ? ""
        : String(docket.travel_in_minutes),
    travelOutMinutes:
      docket.travel_out_minutes == null
        ? ""
        : String(docket.travel_out_minutes),

    labourRows,
    plantRows,
    delayRows,

    hasBodyExtension:
      progressModel === "section_v2"
        ? primaryRows.some(
            (row: any) =>
              clean(row.section_code).toUpperCase() ===
              "BE",
          )
        : inferBodyExtension(tower),

    legacyProgressRows: primaryRows.map(
      (row: any) => ({
        section_label:
          clean(row.section_label) ||
          clean(row.section) ||
          "Section",
        assembled_qty: clean(
          row.assembly_overall ??
            row.assembly_today ??
            row.assembled_qty,
        ),
        erected_qty: clean(
          row.erection_overall ??
            row.erection_today ??
            row.erected_qty,
        ),
      }),
    ),
    sectionV2Rows: progressRowsForTower(
      progress,
      towerId,
    ),

    primaryWorkActivity:
      clean(primaryProduction?.activity) || "mixed",
    primaryWorkNotes:
      clean(primaryProduction?.reason),
    additionalTowerWork,
    towerRevisionAllocations: revisionAllocations,

    materialEvents,
    outstandingMaterials: [],
    bundleTransfers: [],
    activeBundleTransfers: [],
    bundleReplacementStatus: [],
    bundleReplacementDrafts: {},

    mobilisationHours:
      docket.mobilisation_hours == null
        ? ""
        : String(docket.mobilisation_hours),
    mobilisation,

    linkedDefects,
    newDefects: [],

    incidentOccurred: Boolean(
      docket.incident_occurred,
    ),
    incidentType: clean(docket.incident_type),
    incidentNotes: clean(docket.incident_notes),

    bcRepName: clean(docket.bc_rep_name),
    bcRepEmail: clean(docket.bc_rep_email),
    bcRepUserId: clean(docket.bc_rep_user_id),
    bcSignatureDataUrl: clean(
      docket.bc_signature_data_url,
    ),
    bcSignedAt: clean(docket.bc_signed_at),
  };
}

function blankDraft(args: {
  projectId: string;
  towerId: string;
  docketDate: string;
  tower: any;
  identity: any;
}) {
  return {
    mode: "create",
    docketId: null,

    projectId: args.projectId,
    towerId: args.towerId,
    docketDate: args.docketDate,

    selectedCrewId: "",
    crewName: "",
    leadingHand: "",
    weather: "",
    rateType: "tonnage_rate",

    progressModel: "section_v2",
    approvalStatus: "draft",
    approvalRevision: 0,

    dailySiteSummary: "",
    rfiReferences: [],

    prestartMinutes: "",
    lunchBreakMinutes: "30",
    travelInMinutes: "",
    travelOutMinutes: "",

    labourRows: [],
    plantRows: [],
    delayRows: [],

    hasBodyExtension:
      inferBodyExtension(args.tower),
    legacyProgressRows: [],
    sectionV2Rows: blankSectionV2Rows(),

    primaryWorkActivity: "mixed",
    primaryWorkNotes: "",
    additionalTowerWork: [],
    towerRevisionAllocations: [],

    materialEvents: [],
    outstandingMaterials: [],
    bundleTransfers: [],
    activeBundleTransfers: [],
    bundleReplacementStatus: [],
    bundleReplacementDrafts: {},

    mobilisationHours: "",
    mobilisation: {
      enabled: false,
      from_tower_id: "",
      to_tower_id: "",
      status: "planning",
      percent_complete: "",
      started_date: "",
      target_move_date: "",
      completed_date: "",
      notes: "",
      worker_names: [],
    },

    linkedDefects: [],
    newDefects: [],

    incidentOccurred: false,
    incidentType: "",
    incidentNotes: "",

    bcRepName: args.identity.name,
    bcRepEmail: args.identity.email,
    bcRepUserId: args.identity.userId,
    bcSignatureDataUrl: "",
    bcSignedAt: "",
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const projectId = clean(
      url.searchParams.get("projectId"),
    );
    const towerId = clean(
      url.searchParams.get("towerId"),
    );
    const docketId = clean(
      url.searchParams.get("docketId"),
    );
    const docketDate =
      clean(url.searchParams.get("docketDate")) ||
      todaySydneyLike();
    const copyPrevious =
      url.searchParams.get("copyPrevious") === "1";

    if (!projectId || !towerId) {
      return NextResponse.json(
        {
          error:
            "projectId and towerId are required.",
        },
        { status: 400 },
      );
    }

    const { service, identity } =
      await requireMobileDocketUser(
        request,
        projectId,
      );

    const [
      projectResult,
      towersResult,
      crewsResult,
      employeesResult,
      issueTypesResult,
      defectsResult,
    ] = await Promise.all([
      service
        .from("projects")
        .select("id,name,project_number")
        .eq("id", projectId)
        .maybeSingle(),
      service
        .from("towers")
        .select(
          "id,project_id,name,line,status,progress,extra_data",
        )
        .eq("project_id", projectId)
        .order("name"),
      service
        .from("crews")
        .select(
          "id,crew_number,crew_name,leading_hand,active",
        )
        .order("crew_number"),
      service
        .from("employees")
        .select(
          "id,full_name,role,crew_id,active",
        )
        .order("full_name"),
      service
        .from("project_field_issue_types")
        .select(
          "id,name,applies_to,active,sort_order",
        )
        .eq("project_id", projectId)
        .eq("active", true)
        .order("sort_order"),
      service
        .from("tower_defects")
        .select("*")
        .eq("project_id", projectId)
        .eq("tower_id", towerId)
        .order("created_at", {
          ascending: false,
        }),
    ]);

    if (projectResult.error) {
      throw new Error(projectResult.error.message);
    }
    if (!projectResult.data) {
      return NextResponse.json(
        { error: "Project could not be found." },
        { status: 404 },
      );
    }
    if (towersResult.error) {
      throw new Error(towersResult.error.message);
    }
    if (crewsResult.error) {
      throw new Error(crewsResult.error.message);
    }
    if (employeesResult.error) {
      throw new Error(employeesResult.error.message);
    }

    const towers = towersResult.data ?? [];
    const tower = towers.find(
      (row: any) => clean(row.id) === towerId,
    );

    if (!tower) {
      return NextResponse.json(
        {
          error:
            "Tower could not be found in this project.",
        },
        { status: 404 },
      );
    }

    const [
      outstandingMaterials,
      bundleTransferContext,
    ] = await Promise.all([
      loadOutstandingMobileMaterialIssues(
        service,
        towerId,
      ),
      loadMobileBundleTransferContext({
        service,
        projectId,
        towerId,
        docketId: docketId || null,
        docketDate,
      }),
    ]);

    let sourceDocket: any = null;

    if (docketId) {
      const { data, error } = await service
        .from("tower_daily_dockets")
        .select("*")
        .eq("id", docketId)
        .eq("project_id", projectId)
        .eq("tower_id", towerId)
        .maybeSingle();

      if (error) throw new Error(error.message);

      if (!data) {
        return NextResponse.json(
          {
            error:
              "Daily Docket could not be found.",
          },
          { status: 404 },
        );
      }

      sourceDocket = data;
    } else if (copyPrevious) {
      const { data, error } = await service
        .from("tower_daily_dockets")
        .select("*")
        .eq("project_id", projectId)
        .eq("tower_id", towerId)
        .lt("docket_date", docketDate)
        .order("docket_date", {
          ascending: false,
        })
        .limit(1);

      if (error) throw new Error(error.message);
      sourceDocket = data?.[0] ?? null;
    }

    let draft: any = sourceDocket
      ? await loadDocketData(
          service,
          sourceDocket,
          tower,
          towers,
        )
      : blankDraft({
          projectId,
          towerId,
          docketDate,
          tower,
          identity,
        });

    /*
     * Copy Previous is a new Draft, not an edit of yesterday.
     * Carry forward workforce / progress / plant and work defaults.
     * Do not carry delays, material events, Defects or signatures.
     */
    if (copyPrevious && sourceDocket) {
      draft = {
        ...draft,
        mode: "create",
        docketId: null,
        docketDate,
        approvalStatus: "draft",
        approvalRevision: 0,
        dailySiteSummary: "",
        rfiReferences: [],
        delayRows: [],
        materialEvents: [],
        linkedDefects: [],
        newDefects: [],
        incidentOccurred: false,
        incidentType: "",
        incidentNotes: "",
        bcRepName: identity.name,
        bcRepEmail: identity.email,
        bcRepUserId: identity.userId,
        bcSignatureDataUrl: "",
        bcSignedAt: "",
      };
    }

    const activeCrews = (crewsResult.data ?? []).filter(
      (row: any) => row.active !== false,
    );

    if (!clean(draft.selectedCrewId) && clean(draft.crewName)) {
      const savedCrew = clean(draft.crewName).toLowerCase();
      const matchedCrew = activeCrews.find((crew: any) => {
        const number = clean(crew.crew_number).toLowerCase();
        const name = clean(crew.crew_name).toLowerCase();
        const label = [number, name].filter(Boolean).join(" - ");

        return (
          savedCrew === number ||
          savedCrew === name ||
          savedCrew === label ||
          (number && savedCrew.startsWith(`${number} - `))
        );
      });

      if (matchedCrew) {
        draft.selectedCrewId = clean(matchedCrew.id);
      }
    }

    draft = {
      ...draft,
      outstandingMaterials,
      activeBundleTransfers:
        bundleTransferContext.activeBundleTransfers,
      bundleReplacementStatus:
        bundleTransferContext.bundleReplacementStatus,
      bundleReplacementDrafts: {},
    };

    return NextResponse.json({
      project: projectResult.data,
      towers: towers.map((row: any) => ({
        ...row,
        has_body_extension:
          inferBodyExtension(row),
      })),
      crews: activeCrews,
      employees: (
        employeesResult.data ?? []
      ).filter(
        (row: any) => row.active !== false,
      ),
      identity,
      draft,

      defectIssueTypes:
        issueTypesResult.error
          ? []
          : issueTypesResult.data ?? [],
      defectAssignees: [],
      towerDefects:
        defectsResult.error
          ? []
          : defectsResult.data ?? [],

      outstandingMaterials,
      activeBundleTransfers:
        bundleTransferContext.activeBundleTransfers,
      bundleReplacementStatus:
        bundleTransferContext.bundleReplacementStatus,
    });
  } catch (error) {
    const apiError = mobileDocketApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
