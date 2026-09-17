export type FinanceSubmissionType = "expense_claim" | "invoice";
export type FinanceKind = "expense" | "invoice";
export type FinanceAllocationType =
  | "general"
  | "project"
  | "vehicle"
  | "plant"
  | "fleet_job";

export type FinanceProject = {
  id: string;
  name: string;
  project_number: string | null;
};

export type FinanceCategory = {
  id: string;
  name: string;
  active: boolean;
};

export type FinanceVehicleAsset = {
  id: string;
  vehicle_id: string | null;
  vehicle_rego: string | null;
  rego?: string | null;
  make: string | null;
  model: string | null;
  category: string | null;
  status: string | null;
};

export type FinancePlantAsset = {
  id: string;
  asset_id: string | null;
  make: string | null;
  model: string | null;
  plant_type: string | null;
  serial_number: string | null;
  rego: string | null;
  asset_status: string | null;
};

export type FinanceFleetJob = {
  id: string;
  job_number: string | null;
  asset_type: string | null;
  vehicle_asset_id: string | null;
  plant_asset_id: string | null;
  asset_label: string | null;
  status: string | null;
};

export type FinanceSubmission = Record<string, unknown> & {
  id: string;
  submission_number?: string | null;
  submission_type?: FinanceSubmissionType;
  status?: string | null;
  created_by?: string | null;
  submitted_by?: string | null;
  submitted_for_employee_id?: string | null;
  project_id?: string | null;
  total_amount?: number | string | null;
};

export type FinancePayload = {
  submissions: FinanceSubmission[];
  categories: FinanceCategory[];
  projects: FinanceProject[];
  vehicleAssets: FinanceVehicleAsset[];
  plantAssets: FinancePlantAsset[];
  fleetJobs: FinanceFleetJob[];
};

export type FinanceAllocationInput = {
  categoryId: string;
  expenseDate: string;
  description: string;
  amountIncGst: number;
  gstAmount: number;
  notes: string;
  allocationType: FinanceAllocationType;
  projectId?: string;
  vehicleAssetId?: string;
  plantAssetId?: string;
  fleetJobId?: string;
};

export type SaveFinanceDraftInput = {
  type: FinanceSubmissionType;
  projectId: string;
  description: string;
  notes: string;
  supplierName?: string;
  supplierAbn?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  receivedDate?: string;
  dueDate?: string;
  purchaseOrderNumber?: string;
  allocations: FinanceAllocationInput[];
};

export type SaveFinanceDraftResult = {
  submissionId: string;
  items: Array<{ id: string }>;
};

export type FinanceDetailPayload = {
  kind: FinanceKind;
  capability: {
    canReviewEdit: boolean;
    canApprove: boolean;
    canMarkPaid: boolean;
  };
  submission: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  attachments: Array<Record<string, unknown>>;
  categories: FinanceCategory[];
  project: FinanceProject | null;
  vehicleAssets: FinanceVehicleAsset[];
  plantAssets: FinancePlantAsset[];
  fleetJobs: FinanceFleetJob[];
  readOnly?: boolean;
};
