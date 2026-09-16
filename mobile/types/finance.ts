export type FinancialStatus = "draft" | "submitted" | "changes_required" | "rejected" | "approved" | "paid";
export type FinancialType = "expense_claim" | "invoice";
export type FinancePayload = {
  type: FinancialType;
  employeeId: string | null;
  submissions: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  attachments: Array<Record<string, unknown>>;
  categories: Array<{ id: string; name: string; description: string | null; active: boolean; sort_order: number }>;
  projects: Array<{ id: string; name: string; project_number: string | null; status: string | null }>;
  vehicles: Array<Record<string, unknown>>;
  plant: Array<Record<string, unknown>>;
  fleetJobs: Array<Record<string, unknown>>;
};
