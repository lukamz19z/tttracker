export type DefectSeverity = "Minor" | "Major" | "Critical";

export type DefectStatus = "Open" | "In Progress" | "Fixed" | "Closed";

export type RevisionStatus = "Draft" | "In Progress" | "Ready for Review" | "Closed";

export type RevisionItemStatus = "Open" | "Rectified" | "Verified";

export type InspectionStage = "Post Assembly" | "Post Erection" | "Other";

export type QualityTower = {
  id: string;
  project_id: string;
  name: string | null;
  line: string | null;
  status: string | null;
  progress: number | null;
  extra_data: Record<string, unknown> | null;
};

export type QualityIssueType = {
  id: string;
  project_id: string;
  applies_to: "defect" | "revision" | "both";
  name: string;
  active: boolean;
  sort_order: number;
};

export type QualityMember = {
  id: string;
  tower_id: string;
  bundle_reference: string | null;
  drawing_number: string | null;
  mark_no: string | null;
  qty_per_tower: number | null;
  section: string | null;
  tower_segment: string | null;
};

export type QualityDefect = {
  id: string;
  project_id: string;
  tower_id: string;
  sequence_no: number | null;
  defect_number: string | null;
  issue_type_id: string | null;
  member_number: string | null;
  segment: string | null;
  drawing_number: string | null;
  description: string;
  responsibility: string | null;
  client_reference: string | null;
  severity: DefectSeverity;
  status: DefectStatus;
  source: string | null;
  identified_at: string | null;
  identified_by_label: string | null;
  resolution_notes: string | null;
  assigned_to_user_id: string | null;
  assigned_to_label: string | null;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string | null;
  mobile_client_mutation_id?: string | null;
};

export type QualityRevision = {
  id: string;
  project_id: string;
  tower_id: string;
  sequence_no: number | null;

  /**
   * Canonical parent Revision code.
   * Example: RECT-01
   */
  revision_number: string | null;

  /**
   * Legacy compatibility field retained during the RECT/FLI rollout.
   * New UI should use revision_number for parent Revisions.
   */
  fli_number: string | null;

  inspection_stage: InspectionStage;
  inspection_date: string;
  client_inspector: string | null;
  client_company: string | null;
  client_reference: string | null;
  notes: string | null;
  status: RevisionStatus;
  created_by_label: string | null;
  completed_by_label: string | null;
  completed_at: string | null;
  submitted_for_review_at?: string | null;
  submitted_for_review_by?: string | null;
  pdf_revision: number | null;
  latest_pdf_file_id: string | null;
  created_at: string;
  updated_at: string | null;
  mobile_client_mutation_id?: string | null;
};

export type QualityRevisionItem = {
  id: string;
  revision_id: string;
  project_id: string;
  tower_id: string;
  item_number: number | null;

  /**
   * Canonical child Flagged Issue code.
   * Example: FLI-001
   */
  fli_number: string | null;

  issue_type_id: string | null;
  other_issue_text: string | null;
  tower_segment: string | null;
  member_number: string | null;
  drawing_number: string | null;
  finding: string | null;
  rectification_comment: string | null;
  status: RevisionItemStatus;
  before_taken_at: string | null;
  before_taken_by_label: string | null;
  after_taken_at: string | null;
  after_taken_by_label: string | null;
  sort_order: number | null;
  created_at: string;
  mobile_client_mutation_id?: string | null;
};

export type QualityFile = {
  id: string;
  project_id: string;
  tower_id: string;
  defect_id: string | null;
  revision_id: string | null;
  revision_item_id: string | null;
  file_role:
    | "defect_photo"
    | "before_photo"
    | "after_photo"
    | "supporting"
    | "revision_pdf";
  file_name: string;
  mime_type: string | null;
  captured_at: string | null;
  uploaded_by_label: string | null;
  created_at: string;
};

export type QualityWorkflowOptions = {
  defectSeverities: DefectSeverity[];
  defectStatuses: DefectStatus[];
  revisionStatuses: RevisionStatus[];
  revisionItemStatuses: RevisionItemStatus[];
  inspectionStages: InspectionStage[];
};

export type QualityPayload = {
  projectId: string;
  generatedAt: string;
  towers: QualityTower[];
  issueTypes: QualityIssueType[];
  members: QualityMember[];
  revisions: QualityRevision[];
  items: QualityRevisionItem[];
  files: QualityFile[];
  defects: QualityDefect[];
  workflow: QualityWorkflowOptions;
};

export type LocalQualityPhoto = {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  capturedAt: string;
};

export type DefectAssignee = {
  id: string;
  name: string;
  email: string;
  role: string;
};
