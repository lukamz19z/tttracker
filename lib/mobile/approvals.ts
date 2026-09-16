import type { AccessService } from "@/lib/access/server";

type FinanceRule = {
  applies_to: "all" | "expense_claim" | "invoice";
  can_review_edit: boolean | null;
  can_approve: boolean | null;
  can_mark_paid: boolean | null;
};

export type FinanceCapability = {
  canReviewEdit: boolean;
  canApprove: boolean;
  canMarkPaid: boolean;
};

export async function financeCapabilitiesForUser(
  service: AccessService,
  userId: string,
) {
  const { data, error } = await service
    .from("financial_access_rules")
    .select("applies_to,can_review_edit,can_approve,can_mark_paid")
    .eq("principal_type", "user")
    .eq("user_id", userId)
    .eq("active", true);

  if (error) throw new Error(error.message);
  const rules = (data ?? []) as FinanceRule[];

  const forType = (type: "expense_claim" | "invoice"): FinanceCapability => {
    const matching = rules.filter(
      (rule) => rule.applies_to === "all" || rule.applies_to === type,
    );
    return {
      canReviewEdit: matching.some((rule) => rule.can_review_edit === true),
      canApprove: matching.some((rule) => rule.can_approve === true),
      canMarkPaid: matching.some((rule) => rule.can_mark_paid === true),
    };
  };

  return {
    expense: forType("expense_claim"),
    invoice: forType("invoice"),
  };
}

export async function docketReviewerProjectIds(
  service: AccessService,
  userId: string,
) {
  const { data, error } = await service
    .from("project_docket_approval_users")
    .select("project_id")
    .eq("user_id", userId)
    .eq("receives_bc_review", true);

  if (error) throw new Error(error.message);
  return Array.from(new Set((data ?? []).map((row) => String(row.project_id))));
}

export async function isDocketReviewerForProject(
  service: AccessService,
  userId: string,
  projectId: string,
) {
  const { data, error } = await service
    .from("project_docket_approval_users")
    .select("user_id")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .eq("receives_bc_review", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data?.user_id);
}
