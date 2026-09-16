import { apiFetch, apiJson, jsonBody } from "@/lib/api/client";
import type { FinancePayload, FinancialType } from "@/types/finance";

export type PickedFinanceFile = { uri: string; name: string; mimeType: string };

export async function getMyFinance(type: FinancialType) {
  return apiJson<FinancePayload>(`/api/mobile/finance?type=${encodeURIComponent(type)}`);
}

export async function submitExpenseClaim(submissionId: string) {
  return apiJson<{ success?: boolean; warning?: string | null; revision?: number }>("/api/expenses/claims/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: jsonBody({ submissionId }),
  });
}

export async function submitInvoice(submissionId: string) {
  return apiJson<{ success?: boolean; warning?: string | null; revision?: number }>("/api/expenses/invoices/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: jsonBody({ submissionId }),
  });
}

export async function uploadExpenseReceipt(input: {
  submissionId: string;
  itemId: string;
  file: PickedFinanceFile;
}) {
  const form = new FormData();
  form.append("submissionId", input.submissionId);
  form.append("itemId", input.itemId);
  form.append("file", { uri: input.file.uri, name: input.file.name, type: input.file.mimeType } as unknown as Blob);
  const response = await apiFetch("/api/expenses/attachments/upload", { method: "POST", body: form, timeoutMs: 120_000 });
  const payload = (await response.json().catch(() => null)) as { error?: string; attachment?: unknown; warning?: string | null } | null;
  if (!response.ok) throw new Error(payload?.error ?? "Receipt could not be uploaded.");
  return payload;
}

export async function uploadInvoiceDocument(input: {
  submissionId: string;
  file: PickedFinanceFile;
  documentType: "invoice" | "supporting_document";
}) {
  const form = new FormData();
  form.append("submissionId", input.submissionId);
  form.append("documentType", input.documentType);
  form.append("file", { uri: input.file.uri, name: input.file.name, type: input.file.mimeType } as unknown as Blob);
  const response = await apiFetch("/api/expenses/invoices/attachments/upload", { method: "POST", body: form, timeoutMs: 120_000 });
  const payload = (await response.json().catch(() => null)) as { error?: string; attachment?: unknown } | null;
  if (!response.ok) throw new Error(payload?.error ?? "Invoice document could not be uploaded.");
  return payload;
}

export async function reviewFinance(input: {
  kind: "expense" | "invoice";
  submissionId: string;
  action: "request_changes" | "deny" | "approve" | "mark_paid";
  comments?: string;
  paymentReference?: string;
}) {
  const path = input.kind === "expense" ? "/api/expenses/claims/review" : "/api/expenses/invoices/review";
  return apiJson<{ error?: string; warning?: string | null }>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: jsonBody({
      submissionId: input.submissionId,
      action: input.action,
      comments: input.comments ?? "",
      paymentReference: input.paymentReference ?? "",
    }),
  });
}

export async function saveFinanceDraft(input: Record<string, unknown>) {
  return apiJson<{ success: boolean; submissionId: string; items: Array<{ id: string; sort_order: number; description: string; amount_inc_gst: number }> }>("/api/mobile/finance/save", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: jsonBody(input),
  });
}

export function getFinanceDetail(kind: "expense" | "invoice", id: string) {
  return apiJson<Record<string, unknown>>(`/api/mobile/finance/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`);
}
