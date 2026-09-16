export type TrainingType = {
  id: string;
  category_id: string | null;
  name: string;
  short_code: string | null;
  category: string | null;
  record_kind: string | null;
  active: boolean | null;
  requires_issue_date: boolean | null;
  requires_expiry_date: boolean | null;
  allows_no_expiry: boolean | null;
  validity_mode: string | null;
  validity_interval_value: number | null;
  validity_interval_unit: string | null;
  requires_certificate_number: boolean | null;
  requires_issuer: boolean | null;
  requires_project: boolean | null;
  requires_document: boolean | null;
  document_upload_type: string | null;
  allows_multiple_current: boolean | null;
  subtype_mode: string | null;
  requires_review: boolean | null;
  allowed_extensions: string[] | null;
  max_file_size_mb: number | null;
  sort_order: number | null;
};

export type TrainingOption = {
  id: string;
  training_type_id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean | null;
  sort_order: number | null;
};

export type TrainingField = {
  id: string;
  training_type_id: string;
  field_key: string;
  label: string;
  field_type: string;
  required: boolean;
  options: unknown;
  placeholder: string | null;
  help_text: string | null;
  active: boolean;
  sort_order: number;
};

export type TrainingRecord = {
  id: string;
  employee_id: string;
  training_type_id: string | null;
  training_name: string;
  training_short_code: string | null;
  category: string | null;
  record_kind: string | null;
  certificate_number: string | null;
  class_codes: string[] | null;
  option_ids: string[] | null;
  option_codes: string[] | null;
  provider: string | null;
  issuing_authority: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  does_not_expire: boolean | null;
  project_id: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  workflow_status: string | null;
  record_status: string | null;
  review_comment: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  current_version: boolean | null;
  supersedes_record_id: string | null;
  superseded_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type TrainingDocument = {
  id: string;
  training_record_id: string;
  document_type_name: string;
  document_type_code: string | null;
  document_side: string | null;
  generated_file_name: string;
  original_file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  staging_path: string | null;
  sharepoint_web_url: string | null;
  active: boolean | null;
  created_at: string | null;
};

export type TrainingPayload = {
  employee: { id: string; payroll_id: string | null; full_name: string } | null;
  records: TrainingRecord[];
  documents: TrainingDocument[];
  types: TrainingType[];
  options: TrainingOption[];
  fields: TrainingField[];
  projects: Array<{ id: string; name: string; projectNumber: string | null; status: string | null }>;
  message?: string;
};
