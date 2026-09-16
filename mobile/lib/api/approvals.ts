import { apiJson, jsonBody } from "@/lib/api/client";
import { reviewFinance } from "@/lib/api/finance";

export type ApprovalKind = "docket" | "expense" | "invoice";

export type ApprovalListPayload = {
  dockets: Array<Record<string, unknown>>;
  expenses: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  capabilities: Record<string, unknown>;
};

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
  changeRequests?: Array<{ category: string; detail: string }>;
  reviewerSignatureDataUrl?: string;
  reviewerMadeChanges?: boolean;
  clientContentKeys?: string[];
}) {
  return apiJson<Record<string, unknown>>(
    `/api/daily-dockets/${encodeURIComponent(input.docketId)}/bc-review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: jsonBody({
        action: input.action,
        comments: input.comments || undefined,
        change_requests:
          input.action === "request_changes" ? input.changeRequests ?? [] : undefined,
        reviewer_signature_data_url:
          input.action === "approve" ? input.reviewerSignatureDataUrl : undefined,
        reviewer_made_changes:
          input.action === "approve" ? Boolean(input.reviewerMadeChanges) : undefined,
        client_content_keys:
          input.action === "approve" ? input.clientContentKeys ?? [] : undefined,
      }),
    },
  );
}

export function reviewExpense(
  submissionId: string,
  action: "request_changes" | "deny" | "approve" | "mark_paid",
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
  action: "request_changes" | "deny" | "approve" | "mark_paid",
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
