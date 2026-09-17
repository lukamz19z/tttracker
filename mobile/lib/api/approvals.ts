import { apiJson } from "@/lib/api/client";

export type FinanceApprovalCapability = {
  canReviewEdit: boolean;
  canApprove: boolean;
  canMarkPaid: boolean;
};

export type ApprovalListPayload = {
  capabilities: {
    dailyDockets: {
      projectIds: string[];
    };
    expense: FinanceApprovalCapability;
    invoice: FinanceApprovalCapability;
  };
  dailyDockets: Array<Record<string, unknown>>;
  expenseClaims: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
};

export type DocketReviewerCorrectionInput = {
  docketId: string;
  docket?: Record<string, unknown>;
  progress?: Array<Record<string, unknown>>;
  labour?: Array<Record<string, unknown>>;
  delays?: Array<Record<string, unknown>>;
};

export type ReviewDocketInput = {
  docketId: string;
  action: "approve" | "request_changes";
  comments?: string;
  changeRequests?: Array<{
    category: string;
    detail: string;
  }>;
  reviewerSignatureDataUrl?: string;
  reviewerMadeChanges?: boolean;
  clientContentKeys?: string[];
};

export async function getMyApprovals(): Promise<ApprovalListPayload> {
  return apiJson<ApprovalListPayload>("/api/mobile/approvals");
}

export async function getApprovalDetail<T>(
  kind: "docket" | "expense" | "invoice",
  id: string,
): Promise<T> {
  return apiJson<T>(
    `/api/mobile/approvals/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`,
  );
}

/**
 * Saves the same reviewer correction fields that are editable from the website
 * BC review page. Authority is re-checked server-side against the project's
 * configured BC reviewers before any row is changed.
 */
export async function saveDocketReviewerCorrections(
  input: DocketReviewerCorrectionInput,
) {
  const { docketId, ...body } = input;

  return apiJson<{ success: boolean; reviewerMadeChanges: boolean }>(
    `/api/mobile/approvals/docket/${encodeURIComponent(docketId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
      timeoutMs: 120_000,
    },
  );
}

/**
 * IMPORTANT: final BC review is intentionally sent to the exact same website
 * route used by the browser review page. This keeps PDF generation, SharePoint,
 * revisioning, client approval links, emails and workflow events canonical.
 */
export async function reviewDocket(input: ReviewDocketInput) {
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
      timeoutMs: 120_000,
    },
  );
}

export async function reviewExpense(
  submissionId: string,
  action: "request_changes" | "deny" | "approve" | "mark_paid",
  comments = "",
  paymentReference = "",
) {
  return apiJson<Record<string, unknown>>("/api/expenses/claims/review", {
    method: "POST",
    body: JSON.stringify({
      submissionId,
      action,
      comments,
      paymentReference,
    }),
    timeoutMs: 120_000,
  });
}

export async function reviewInvoice(
  submissionId: string,
  action: "request_changes" | "deny" | "approve" | "mark_paid",
  comments = "",
  paymentReference = "",
) {
  return apiJson<Record<string, unknown>>("/api/expenses/invoices/review", {
    method: "POST",
    body: JSON.stringify({
      submissionId,
      action,
      comments,
      paymentReference,
    }),
    timeoutMs: 120_000,
  });
}
