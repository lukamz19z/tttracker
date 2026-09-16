export type AssetType = "vehicle" | "plant";

export type AssetDocumentCategory =
  | "compliance"
  | "service"
  | "invoice"
  | "inspection"
  | "manual"
  | "photo"
  | "other";

export type AssetDocumentAppliesTo = AssetType | "both";

export type AssetDocumentDateRequirement =
  | "none"
  | "document_date"
  | "expiry_date"
  | "document_and_expiry";

export type AssetDocumentReplacementMode = "current" | "historical";

export type AssetDocumentDateSource = "document_date" | "expiry_date";

export type AssetDocumentTypeRow = {
  id: string;
  system_key: string | null;
  name: string;
  code: string;
  category: AssetDocumentCategory;
  applies_to: AssetDocumentAppliesTo;
  date_requirement: AssetDocumentDateRequirement;
  naming_date_source: AssetDocumentDateSource;
  naming_template: string;
  replacement_mode: AssetDocumentReplacementMode;
  asset_field_mapping: string | null;
  asset_field_source: AssetDocumentDateSource | null;
  requires_supplier: boolean;
  requires_invoice_number: boolean;
  requires_cost: boolean;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type AssetSettings = {
  id: boolean;
  sharepoint_site_id: string | null;
  sharepoint_site_name: string | null;
  sharepoint_site_url: string | null;
  sharepoint_drive_id: string | null;
  sharepoint_drive_name: string | null;
  sharepoint_base_folder: string;
  vehicle_folder_name: string;
  plant_folder_name: string;
  superseded_folder_name: string;
  document_folders: Record<string, string>;
  max_file_size_mb: number;
  notifications_enabled: boolean;
  updated_at: string;
  updated_by: string | null;
};

export type AssetRecord = {
  id: string;
  vehicle_id?: string | null;
  vehicle_rego?: string | null;
  asset_id?: string | null;
  make?: string | null;
  model?: string | null;
  category?: string | null;
  plant_type?: string | null;
  serial_number?: string | null;
  rego?: string | null;
  project?: string | null;
  crew?: string | null;
  status?: string | null;
  asset_status?: string | null;
  year?: number | string | null;
  vin_number?: string | null;
  owner?: string | null;
  hired?: boolean | null;
  hired_from?: string | null;
  hire_term?: string | null;
  off_hire_date?: string | null;
  superseded_by?: string | null;
  inactive_reason?: string | null;
  notes?: string | null;

  last_service?: string | null;
  last_service_date?: string | null;
  last_service_hours?: number | string | null;
  next_service_due?: string | null;
  next_service_km?: number | string | null;
  next_service_hours?: number | string | null;
  service_interval_km?: number | string | null;
  service_interval_hours?: number | string | null;
  next_inspection_due?: string | null;
  current_odometer_km?: number | string | null;
  current_engine_hours?: number | string | null;

  rego_expiry?: string | null;
  insurance_expiry?: string | null;
  cranesafe_expiry?: string | null;
  ten_year_inspection_due?: string | null;
  risk_assessment_date?: string | null;

  sharepoint_site_id?: string | null;
  sharepoint_drive_id?: string | null;
  sharepoint_folder_id?: string | null;
  sharepoint_web_url?: string | null;
  sharepoint_folder_name?: string | null;
  sharepoint_synced_at?: string | null;

  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type AssetDocumentRow = {
  id: string;
  asset_type: AssetType;
  vehicle_asset_id: string | null;
  plant_asset_id: string | null;
  document_type_id: string | null;
  document_type_name: string | null;
  document_type_code: string | null;
  naming_template_snapshot: string | null;
  replacement_mode_snapshot: AssetDocumentReplacementMode | null;
  document_category: AssetDocumentCategory;
  title: string;
  document_date: string | null;
  expiry_date: string | null;
  supplier: string | null;
  invoice_number: string | null;
  amount_ex_gst: number | string | null;
  gst_amount: number | string | null;
  amount_inc_gst: number | string | null;
  service_record_id: string | null;
  fleet_job_id: string | null;
  financial_submission_id: string | null;
  financial_item_id: string | null;
  financial_attachment_id: string | null;
  source: string;
  generated_by_module: string | null;
  file_name: string;
  content_type: string | null;
  file_size_bytes: number | string | null;
  sharepoint_site_id: string | null;
  sharepoint_drive_id: string;
  sharepoint_folder_id: string | null;
  sharepoint_item_id: string;
  sharepoint_web_url: string | null;
  sharepoint_folder_path: string | null;
  is_current: boolean;
  supersedes_document_id: string | null;
  superseded_by_document_id: string | null;
  superseded_at: string | null;
  superseded_by: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type LegacyAssetDocument = {
  id: string;
  document_type: string | null;
  file_name: string | null;
  file_url: string | null;
  storage_path?: string | null;
  notes?: string | null;
  created_at: string | null;
};

export type AssetServiceItemInput = {
  issue: string;
  diagnosis?: string | null;
  rectification?: string | null;
  partsUsed?: string | null;
  labourHours?: number | null;
  itemStatus?: "resolved" | "monitor" | "unresolved";
};

export type AssetServiceRecordRow = {
  id: string;
  service_number: string;
  asset_type: AssetType;
  vehicle_asset_id: string | null;
  plant_asset_id: string | null;
  record_type:
    | "service"
    | "repair"
    | "inspection"
    | "maintenance"
    | "breakdown";
  status: "draft" | "completed" | "void";
  service_date: string;
  odometer_km: number | string | null;
  engine_hours: number | string | null;
  provider_type: "internal" | "external";
  provider_name: string | null;
  mechanic_employee_id: string | null;
  mechanic_name: string | null;
  supplier: string | null;
  fleet_job_id: string | null;
  work_order_reference: string | null;
  summary: string;
  work_completed: string | null;
  recommendations: string | null;
  follow_up_actions: string | null;
  next_service_date: string | null;
  next_service_km: number | string | null;
  next_service_hours: number | string | null;
  invoice_number: string | null;
  amount_ex_gst: number | string;
  gst_amount: number | string;
  amount_inc_gst: number | string;
  financial_submission_id: string | null;
  financial_item_id: string | null;
  financial_attachment_id: string | null;
  report_document_id: string | null;
  created_by: string | null;
  created_by_name: string;
  completed_at: string | null;
  legacy_source_table: string | null;
  legacy_source_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AssetEventRow = {
  id: string;
  asset_type: AssetType;
  vehicle_asset_id: string | null;
  plant_asset_id: string | null;
  event_type:
    | "service"
    | "repair"
    | "inspection"
    | "maintenance"
    | "breakdown"
    | "modification"
    | "compliance"
    | "document"
    | "meter"
    | "status"
    | "project_transfer"
    | "other";
  event_date: string;
  title: string;
  description: string | null;
  supplier: string | null;
  cost: number | string | null;
  odometer_km: number | string | null;
  engine_hours: number | string | null;
  fleet_job_id: string | null;
  service_record_id: string | null;
  document_id: string | null;
  financial_submission_id: string | null;
  performed_by: string | null;
  performed_by_name: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type AssetSpendRow = {
  itemId: string;
  submissionId: string;
  submissionNumber: string;
  submissionType: string;
  status: string;
  expenseDate: string | null;
  supplier: string | null;
  description: string;
  invoiceNumber: string | null;
  amountExGst: number;
  gstAmount: number;
  amountIncGst: number;
  fleetJobId: string | null;
  serviceRecordId: string | null;
  assetDocumentId: string | null;
  createdAt: string | null;
};
