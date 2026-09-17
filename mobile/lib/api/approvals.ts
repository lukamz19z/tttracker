import { apiJson } from "@/lib/api/client";

export type ApprovalKind = "docket" | "expense" | "invoice";

export type FinanceApprovalCapability = {
  canReviewEdit: boolean;
  canApprove: boolean;
  canMarkPaid: boolean;
};

export type ApprovalListPayload = {
  dailyDockets: Record<string, unknown>[];
  expenseClaims: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  capabilities: {
    dailyDockets: {
      projectIds: string[];
    };
    expense: FinanceApprovalCapability;
    invoice: FinanceApprovalCapability;
  };
};

type FinanceReviewAction =
  | "request_changes"
  | "deny"
  | "approve"
  | "mark_paid";

export function getMyApprovals() {
  return apiJson<ApprovalListPayload>("/api/mobile/approvals");
}

export function getApprovalDetail<T = Record<string, unknown>>(
  kind: ApprovalKind,
  id: string,
) {
  return apiJson<T>(
    `/api/mobile/approvals/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`,
  );
}

export function reviewDocket(input: {
  docketId: string;
  action: "approve" | "request_changes";
  comments?: string;
  changeRequests?: { category: string; detail: string }[];
  reviewerSignatureDataUrl?: string;
  reviewerMadeChanges?: boolean;
  clientContentKeys?: string[];
}) {
  return apiJson<Record<string, unknown>>(
    `/api/daily-dockets/${encodeURIComponent(input.docketId)}/bc-review`,
    {
      method: "POST",
      body: JSON.stringify({
        action: input.action,
        comments: input.comments || undefined,
        change_requests:
          input.action === "request_changes"
            ? input.changeRequests ?? []
            : undefined,
        reviewer_signature_data_url:
          input.action === "approve"
            ? input.reviewerSignatureDataUrl
            : undefined,
        reviewer_made_changes:
          input.action === "approve"
            ? Boolean(input.reviewerMadeChanges)
            : undefined,
        client_content_keys:
          input.action === "approve"
            ? input.clientContentKeys ?? []
            : undefined,
      }),
    },
  );
}

function reviewFinance(input: {
  kind: "expense" | "invoice";
  submissionId: string;
  action: FinanceReviewAction;
  comments?: string;
  paymentReference?: string;
}) {
  const endpoint =
    input.kind === "expense"
      ? "/api/expenses/claims/review"
      : "/api/expenses/invoices/review";

  return apiJson<Record<string, unknown>>(endpoint, {
    method: "POST",
    body: JSON.stringify({
      submissionId: input.submissionId,
      action: input.action,
      comments: input.comments?.trim() || undefined,
      paymentReference:
        input.action === "mark_paid"
          ? input.paymentReference?.trim() || undefined
          : undefined,
    }),
    timeoutMs: 120_000,
  });
}

export function reviewExpense(
  submissionId: string,
  action: FinanceReviewAction,
  comments = "",
  paymentReference = "",
) {
  return reviewFinance({
    kind: "expense",
    submissionId,
    action,
    comments,
    paymentReference,
  });
}

export function reviewInvoice(
  submissionId: string,
  action: FinanceReviewAction,
  comments = "",
  paymentReference = "",
) {
  return reviewFinance({
    kind: "invoice",
    submissionId,
    action,
    comments,
    paymentReference,
  });
}
