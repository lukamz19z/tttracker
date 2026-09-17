// mobile/lib/dockets/constants.ts

import {
  SECTION_PROGRESS_WEIGHTS,
  SECTION_V2_DEFS,
} from "@/lib/dockets/calculations";
import type {
  BundleTransferDraft,
  DailyDocketDraft,
  DelayRow,
  DocketDefectDraft,
  LabourRow,
  MaterialEventDraft,
  MaterialEventItemDraft,
  MobilisationDraft,
  PlantRow,
  SectionV2ProgressRow,
} from "@/types/daily-dockets";

export const DAILY_DOCKET_STEPS = [
  {
    key: "setup",
    label: "Setup",
    shortLabel: "Setup",
  },
  {
    key: "crew",
    label: "Crew & Plant",
    shortLabel: "Crew",
  },
  {
    key: "work",
    label: "Work & Progress",
    shortLabel: "Work",
  },
  {
    key: "events",
    label: "Site Events",
    shortLabel: "Events",
  },
  {
    key: "review",
    label: "Review & Submit",
    shortLabel: "Review",
  },
] as const;

export type DailyDocketStep =
  (typeof DAILY_DOCKET_STEPS)[number]["key"];

export const DELAY_OPTIONS = [
  {
    value: "weather",
    label: "Weather",
  },
  {
    value: "lightning",
    label: "Lightning",
  },
  {
    value: "toolbox",
    label: "Toolbox",
  },
  {
    value: "mobilisation",
    label: "Mobilisation",
  },
  {
    value: "access",
    label: "Access / Bogged",
  },
  {
    value: "plant",
    label: "Plant / Equipment",
  },
  {
    value: "materials",
    label: "Materials",
  },
  {
    value: "other",
    label: "Other",
  },
] as const;

export const MATERIAL_EVENT_OPTIONS = [
  {
    value: "missing",
    label: "Missing",
  },
  {
    value: "found_received",
    label: "Found / Received",
  },
  {
    value: "taken_from_another_tower",
    label: "Taken from Tower",
  },
  {
    value: "sent_to_another_tower",
    label: "Sent to Tower",
  },
  {
    value: "damaged_incorrect",
    label: "Damaged / Incorrect",
  },
] as const;

export const MITIGATION_OPTIONS = [
  "Moved personnel to another activity",
  "Assembled another section",
  "Checked other bundles",
  "Resequenced planned work",
  "Assisted client to locate / verify material",
] as const;

export function docketUiId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function createBlankSectionV2Rows(): SectionV2ProgressRow[] {
  return SECTION_V2_DEFS.map(
    ([section_code, section_label]) => ({
      section_code,
      section_label,
      assembly_today: "",
      erection_today: "",
      assembly_weight:
        SECTION_PROGRESS_WEIGHTS[
          section_code
        ] ?? 0,
      erection_weight:
        SECTION_PROGRESS_WEIGHTS[
          section_code
        ] ?? 0,
    }),
  );
}

export function createBlankLabourRow(
  defaults?: {
    prestartMinutes?: string;
    lunchMinutes?: string;
    travelInMinutes?: string;
    travelOutMinutes?: string;
  },
): LabourRow {
  return {
    worker_name: "",
    time_in: "",
    time_out: "",
    total_hours: "",
    prestart_minutes:
      defaults?.prestartMinutes ?? "",
    lunch_minutes:
      defaults?.lunchMinutes ?? "",
    travel_in_minutes:
      defaults?.travelInMinutes ?? "",
    travel_out_minutes:
      defaults?.travelOutMinutes ?? "",
    mobilisation_hours: "",
    delay_hours: "",
    delay_reason: "",
    production_hours: "",
  };
}

export function createBlankPlantRow(): PlantRow {
  return {
    plant_name: "",
    plant_type: "",
    asset_id: "",
    operator_name: "",
    time_in: "",
    time_out: "",
    total_hours: "",
    notes: "",
  };
}

export function createBlankDelayRow(): DelayRow {
  return {
    ui_id: docketUiId("delay"),
    delay_type: "other",
    delay_reason: "",
    delay_hours: "",
    applies_to: "entire_crew",
    worker_names: [],
    delay_applies_mode: "labour_only",
    plant_names: [],
  };
}

export function createBlankMaterialItem(): MaterialEventItemDraft {
  return {
    ui_id: docketUiId("material-item"),
    search_mode: "member",
    source_table: "",
    source_record_id: "",
    issue_key: "",
    source_issue_key: "",
    bundle_id: "",
    bundle_no: "",
    bundle_section: "",
    material_kind: "registered",
    manual_category: "",
    bolt_size: "",
    search_query: "",
    search_loading: false,
    search_results: [],
    item_reference: "",
    item_description: "",
    quantity: "1",
    unit: "ea",
  };
}

export function createBlankMaterialEvent(
  eventType: MaterialEventDraft["event_type"] = "missing",
): MaterialEventDraft {
  return {
    ui_id: docketUiId("material-event"),
    event_type: eventType,
    source_tower_id: "",
    destination_tower_id: "",
    source_location: "",
    destination_location: "",
    occurred_time: "",
    affected_work: false,
    affected_activity: "",
    affected_section: "",
    work_outcome: "",
    impact_start_time: "",
    impact_finish_time: "",
    impact_ongoing: false,
    current_effect: "",
    mitigation_actions: [],
    notes: "",
    items: [createBlankMaterialItem()],
    people: [],
    plant: [],
  };
}

export function createBlankBundleTransfer(): BundleTransferDraft {
  return {
    ui_id: docketUiId("bundle-transfer"),
    source_tower_id: "",
    source_bundle_id: "",
    destination_bundle_id: "",
    quantity: "1",
    occurred_time: "",
    replacement_quantity: "",
    replacement_time: "",
    notes: "",
  };
}

export function createBlankDefect(): DocketDefectDraft {
  return {
    ui_id: docketUiId("defect"),
    issue_type_id: "",
    other_issue_text: "",
    segment: "",
    member_number: "",
    drawing_number: "",
    description: "",
    severity: "Minor",
    assigned_to_user_id: "",
    photos: [],
  };
}

export function createBlankMobilisation(): MobilisationDraft {
  return {
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
  };
}

export function createBlankDailyDocketDraft(args: {
  projectId: string;
  towerId: string;
  docketDate: string;
}): DailyDocketDraft {
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
    lunchBreakMinutes: "",
    travelInMinutes: "",
    travelOutMinutes: "",

    labourRows: [],
    plantRows: [],
    delayRows: [],

    hasBodyExtension: true,
    legacyProgressRows: [],
    sectionV2Rows:
      createBlankSectionV2Rows(),

    primaryWorkActivity: "mixed",
    primaryWorkNotes: "",
    additionalTowerWork: [],
    towerRevisionAllocations: [],

    materialEvents: [],
    outstandingMaterials: [],
    bundleTransfers: [],
    activeBundleTransfers: [],
    bundleReplacementStatus: [],

    mobilisationHours: "",
    mobilisation:
      createBlankMobilisation(),

    linkedDefects: [],
    newDefects: [],

    incidentOccurred: false,
    incidentType: "",
    incidentNotes: "",

    bcRepName: "",
    bcRepEmail: "",
    bcRepUserId: "",
    bcSignatureDataUrl: "",
    bcSignedAt: "",
  };
}
