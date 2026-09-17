// mobile/types/daily-dockets.ts
//
// Shared mobile Daily Docket data model.
//
// Batch 2 will use this as the form/editor model.
// The shape deliberately follows the current website Daily Docket instead of
// the older mobile-only FormState.

import type {
  DelayAppliesMode,
  DelayScope,
  DelayType,
  ProgressModel,
} from "@/lib/dockets/calculations";

export type DocketMode =
  | "create"
  | "edit"
  | "view";

export type DocketRateType =
  | "tonnage_rate"
  | "schedule_of_rates";

export type DocketApprovalStatus =
  | "draft"
  | "legacy"
  | "submitted_bc"
  | "bc_changes_requested"
  | "client_pending"
  | "client_changes_requested"
  | "final"
  | "legacy_final"
  | string;

export type ProductionActivity =
  | "assembly"
  | "erection"
  | "mixed"
  | "rectification"
  | "other";

export type MaterialEventType =
  | "missing"
  | "found_received"
  | "taken_from_another_tower"
  | "sent_to_another_tower"
  | "excess"
  | "damaged_incorrect";

export type MaterialWorkOutcome =
  | ""
  | "stopped_work"
  | "slowed_down"
  | "changed_sequence"
  | "minor_impact";

export type MaterialSearchMode =
  | "member"
  | "bundle";

export type MobilisationStatus =
  | "planning"
  | "packing"
  | "demobilising"
  | "in_transit"
  | "mobilising"
  | "setup"
  | "complete";

export type BundleTransferStatus =
  | "in_transit"
  | "received"
  | "cancelled";

export type DocketDefectSeverity =
  | "Minor"
  | "Major"
  | "Critical";

export type LabourRow = {
  worker_name: string;
  time_in: string;
  time_out: string;
  total_hours: string;
  prestart_minutes: string;
  lunch_minutes: string;
  travel_in_minutes: string;
  travel_out_minutes: string;

  /**
   * Minutes in the editor/calculation model.
   * Converted to decimal hours before database persistence.
   */
  mobilisation_hours: string;

  delay_hours: string;
  delay_reason: string;
  production_hours: string;
};

export type PlantRow = {
  plant_name: string;
  plant_type: string;
  asset_id: string;
  operator_name: string;
  time_in: string;
  time_out: string;
  total_hours: string;
  notes: string;
};

export type DelayRow = {
  ui_id: string;
  id?: string;
  delay_type: DelayType;
  delay_reason: string;
  delay_hours: string;
  applies_to: DelayScope;
  worker_names: string[];
  delay_applies_mode: DelayAppliesMode;
  plant_names: string[];
};

export type LegacyProgressRow = {
  section_label: string;
  assembled_qty: string;
  erected_qty: string;
};

export type SectionV2ProgressRow = {
  section_code: string;
  section_label: string;
  assembly_today: string;
  erection_today: string;
  assembly_weight: number;
  erection_weight: number;
};

export type MaterialCatalogItem = {
  source_table: string;
  source_record_id: string;
  bundle_id: string;
  bundle_no: string;
  bundle_section: string;
  item_reference: string;
  item_description: string;
  unit: string;
  tower_id: string;
};

export type MaterialEventItemDraft = {
  ui_id: string;
  search_mode: MaterialSearchMode;
  source_table: string;
  source_record_id: string;
  issue_key: string;
  source_issue_key: string;
  bundle_id: string;
  bundle_no: string;
  bundle_section: string;
  material_kind:
    | "registered"
    | "manual"
    | "manual_bolt";
  manual_category: string;
  bolt_size: string;
  search_query: string;
  search_loading: boolean;
  search_results: MaterialCatalogItem[];
  item_reference: string;
  item_description: string;
  quantity: string;
  unit: string;
};

export type MaterialEventPersonDraft = {
  ui_id: string;
  employee_id: string;
  employee_name: string;
  employee_role: string;
  started_at: string;
  finished_at: string;
};

export type MaterialEventPlantDraft = {
  ui_id: string;
  plant_name: string;
  asset_number: string;
  started_at: string;
  finished_at: string;
};

export type MaterialEventDraft = {
  ui_id: string;
  id?: string;
  event_type: MaterialEventType;
  source_tower_id: string;
  destination_tower_id: string;
  source_location: string;
  destination_location: string;
  occurred_time: string;
  affected_work: boolean;
  affected_activity: string;
  affected_section: string;
  work_outcome: MaterialWorkOutcome;
  impact_start_time: string;
  impact_finish_time: string;
  impact_ongoing: boolean;
  current_effect: string;
  mitigation_actions: string[];
  notes: string;
  items: MaterialEventItemDraft[];
  people: MaterialEventPersonDraft[];
  plant: MaterialEventPlantDraft[];
};

export type MissingMaterialIssue = {
  issue_key: string;
  source_table: string;
  source_record_id: string;
  bundle_id: string;
  bundle_no: string;
  bundle_section: string;
  item_reference: string;
  item_description: string;
  original_quantity: number;
  received_quantity: number;
  remaining_quantity: number;
  unit: string;
  first_reported_at: string;
  source_docket_id: string;
};

export type BundleTransferRecord = {
  id: string;
  transfer_no: number | null;
  project_id: string;
  source_tower_id: string;
  destination_tower_id: string;
  source_bundle_id: string;
  destination_bundle_id: string;
  bundle_no: string;
  bundle_section: string;
  quantity: number;
  status: BundleTransferStatus;
  transferred_by_name: string;
  transferred_at: string | null;
  received_by_name: string;
  received_at: string | null;
  source_docket_id: string;
  destination_docket_id: string;
  notes: string;
};

export type BundleTransferReplacementStatus = {
  transfer_id: string;
  issue_key: string;
  original_quantity: number;
  delivered_quantity: number;
  remaining_quantity: number;
  first_reported_at: string | null;
  last_delivery_at: string | null;
};

export type BundleTransferDraft = {
  ui_id: string;
  source_tower_id: string;
  source_bundle_id: string;
  destination_bundle_id: string;
  quantity: string;
  occurred_time: string;
  replacement_quantity: string;
  replacement_time: string;
  notes: string;
};

export type AdditionalTowerWork = {
  id?: string;
  ui_id: string;
  target_tower_id: string;
  allocation_percent: string;
  saved_allocated_mh: number;
  activity: ProductionActivity;
  notes: string;
  has_body_extension: boolean;
  progress_rows: SectionV2ProgressRow[];
};

export type TowerRevisionAllocation = {
  id?: string;
  ui_id: string;
  target_tower_id: string;
  hours: string;
  worker_names: string[];
  reason: string;
};

export type DocketDefectIssueType = {
  id: string;
  name: string;
  applies_to:
    | "defect"
    | "revision"
    | "both";
  active: boolean;
  sort_order: number;
};

export type DocketDefectAssignee = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type ExistingTowerDefect = {
  id: string;
  defect_number: string | null;
  issue_type_id: string | null;
  member_number: string | null;
  segment: string | null;
  drawing_number: string | null;
  description: string | null;
  severity: DocketDefectSeverity;
  status:
    | "Open"
    | "In Progress"
    | "Fixed"
    | "Closed";
  assigned_to_user_id: string | null;
  assigned_to_label: string | null;
  created_at: string;
};

export type LinkedDocketDefect =
  ExistingTowerDefect & {
    link_id: string;
    link_type:
      | "raised"
      | "referenced";
  };

export type DocketPhotoDraft = {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
  capturedAt?: string | null;
};

export type DocketDefectDraft = {
  ui_id: string;
  issue_type_id: string;
  other_issue_text: string;
  segment: string;
  member_number: string;
  drawing_number: string;
  description: string;
  severity: DocketDefectSeverity;
  assigned_to_user_id: string;
  photos: DocketPhotoDraft[];
};

export type MobilisationDraft = {
  enabled: boolean;
  from_tower_id: string;
  to_tower_id: string;
  status: MobilisationStatus;
  percent_complete: string;
  started_date: string;
  target_move_date: string;
  completed_date: string;
  notes: string;
  worker_names: string[];
};

export type DailyDocketDraft = {
  mode: DocketMode;
  docketId: string | null;

  projectId: string;
  towerId: string;
  docketDate: string;

  selectedCrewId: string;
  crewName: string;
  leadingHand: string;
  weather: string;
  rateType: DocketRateType;

  progressModel: ProgressModel;
  approvalStatus: DocketApprovalStatus;
  approvalRevision: number;

  dailySiteSummary: string;
  rfiReferences: string[];

  prestartMinutes: string;
  lunchBreakMinutes: string;
  travelInMinutes: string;
  travelOutMinutes: string;

  labourRows: LabourRow[];
  plantRows: PlantRow[];
  delayRows: DelayRow[];

  hasBodyExtension: boolean;
  legacyProgressRows: LegacyProgressRow[];
  sectionV2Rows: SectionV2ProgressRow[];

  primaryWorkActivity: ProductionActivity;
  primaryWorkNotes: string;
  additionalTowerWork: AdditionalTowerWork[];
  towerRevisionAllocations: TowerRevisionAllocation[];

  materialEvents: MaterialEventDraft[];
  outstandingMaterials: MissingMaterialIssue[];
  bundleTransfers: BundleTransferDraft[];
  activeBundleTransfers: BundleTransferRecord[];
  bundleReplacementStatus: BundleTransferReplacementStatus[];

  mobilisationHours: string;
  mobilisation: MobilisationDraft;

  linkedDefects: LinkedDocketDefect[];
  newDefects: DocketDefectDraft[];

  incidentOccurred: boolean;
  incidentType: string;
  incidentNotes: string;

  bcRepName: string;
  bcRepEmail: string;
  bcRepUserId: string;
  bcSignatureDataUrl: string;
  bcSignedAt: string;
};

export type DocketTowerOption = {
  id: string;
  project_id: string;
  name: string;
  line: string | null;
  status: string | null;
  progress: number | null;
  has_body_extension: boolean;
};

export type DocketCrewOption = {
  id: string;
  crew_number: string | null;
  crew_name: string | null;
  leading_hand: string | null;
  active: boolean;
};

export type DocketEmployeeOption = {
  id: string;
  full_name: string;
  role: string | null;
  crew_id: string | null;
  active: boolean;
};

export type DocketProjectSummary = {
  id: string;
  name: string;
  project_number: string | null;
};

export type DocketUserIdentity = {
  userId: string;
  employeeId: string | null;
  name: string;
  email: string;
  display: string;
};

export type DailyDocketEditorPayload = {
  project: DocketProjectSummary;
  towers: DocketTowerOption[];
  crews: DocketCrewOption[];
  employees: DocketEmployeeOption[];

  identity: DocketUserIdentity;

  draft: DailyDocketDraft;

  defectIssueTypes: DocketDefectIssueType[];
  defectAssignees: DocketDefectAssignee[];
  towerDefects: ExistingTowerDefect[];

  outstandingMaterials: MissingMaterialIssue[];
  activeBundleTransfers: BundleTransferRecord[];
  bundleReplacementStatus: BundleTransferReplacementStatus[];
};

export type SaveDailyDocketResult = {
  success: true;
  docketId: string;
  approvalStatus: DocketApprovalStatus;
  rawManhours: number;
  productionManhours: number;
  assemblyPercent: number;
  erectionPercent: number;
  overallProgressPercent: number;
  warnings?: string[];
};

export type SubmitDailyDocketResult = {
  success: true;
  docketId: string;
  status: "submitted_bc";
  submittedAt: string;
  revision: number;
  reviewers: number;
  warning?: string | null;
};
