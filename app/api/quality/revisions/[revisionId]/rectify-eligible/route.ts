import { NextResponse } from "next/server";
import { qualityWorkflowAccess } from "@/lib/quality/workflow-access";
import { assertQualityProjectAccess, qualityApiError } from "@/lib/quality/server";
import { revisionItemFli } from "@/lib/quality/fli";
import { atomicQualityError } from "@/lib/quality/atomic-error";
import { qualityDisplayName } from "@/lib/quality/display-name";
import { mapWithConcurrency } from "@/lib/quality/bounded-concurrency";
import { runRevisionReconciliationItem } from "@/lib/quality/run-revision-reconciliation-item";
import {
  historicalCaptureBackfill,
  selectCaptureEvidence,
  summarizeRevisionEvidence,
  type RevisionEvidenceItem,
  type RevisionEvidenceRow,
} from "@/lib/quality/revision-evidence-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const REVISION_RECTIFY_CONCURRENCY = 6;

type Context = { params: Promise<unknown> };
type RevisionRow = { id: string; project_id: string; tower_id: string; status: string; finalised_at: string | null };
type ItemRow = RevisionEvidenceItem & Record<string, unknown> & {
  project_id: string; tower_id: string; item_number: number; fli_number: string | null;
  record_version: number | string; before_taken_at: string | null; before_taken_by: string | null;
  before_taken_by_label: string | null; after_taken_at: string | null; after_taken_by: string | null;
  after_taken_by_label: string | null;
};

async function loadRevision(service: Awaited<ReturnType<typeof qualityWorkflowAccess>>["service"], revisionId: string) {
  const result = await service.from("tower_revisions").select("id,project_id,tower_id,status,finalised_at").eq("id", revisionId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as RevisionRow | null;
}

async function loadPlan(service: Awaited<ReturnType<typeof qualityWorkflowAccess>>["service"], revision: RevisionRow) {
  const [itemResult, fileResult] = await Promise.all([
    service.from("tower_revision_items")
      .select("id,revision_id,project_id,tower_id,item_number,fli_number,status,record_version,issue_type_id,other_issue_text,before_taken_at,before_taken_by,before_taken_by_label,after_taken_at,after_taken_by,after_taken_by_label")
      .eq("revision_id", revision.id).eq("project_id", revision.project_id).eq("tower_id", revision.tower_id)
      .order("item_number"),
    service.from("tower_quality_files")
      .select("id,revision_id,revision_item_id,file_role,deletion_pending,is_outdated,captured_at,uploaded_by,uploaded_by_label,created_at,evidence_metadata")
      .eq("revision_id", revision.id).eq("project_id", revision.project_id).eq("tower_id", revision.tower_id)
      .eq("deletion_pending", false).eq("is_outdated", false).in("file_role", ["before_photo", "after_photo"]),
  ]);
  if (itemResult.error) throw new Error(itemResult.error.message);
  if (fileResult.error) throw new Error(fileResult.error.message);
  const items = (itemResult.data || []) as ItemRow[];
  const files = (fileResult.data || []) as RevisionEvidenceRow[];
  const summary = summarizeRevisionEvidence(items, files);
  const mutable = !revision.finalised_at && ["Draft", "Open", "In Progress"].includes(revision.status);
  return { items, files, summary, mutable };
}

function previewResponse(revision: RevisionRow, plan: Awaited<ReturnType<typeof loadPlan>>) {
  return {
    revisionId: revision.id,
    canExecute: plan.mutable,
    lockedReason: plan.mutable ? null : "This Revision is finalised or locked and cannot be changed.",
    counts: plan.summary.counts,
    eligibleItems: plan.summary.eligibleItems.map(item => ({ id: item.id, fli: revisionItemFli(item) })),
    metadataRepairItems: plan.summary.metadataRepairItems.map(({ item, fields, missingFields }) => ({ id: item.id, fli: revisionItemFli(item), status: item.status, fields, missingFields, repairable: fields.length > 0 })),
    skippedItems: plan.summary.skippedItems.map(({ item, reason }) => ({ id: item.id, fli: revisionItemFli(item), reason })),
  };
}

async function authorize(request: Request, revisionId: string) {
  const context = await qualityWorkflowAccess(request);
  const revision = await loadRevision(context.service, revisionId);
  if (!revision) return { response: NextResponse.json({ error: "Revision could not be found." }, { status: 404 }) };
  await assertQualityProjectAccess({ service: context.service, userId: context.user.id, role: context.role, projectId: revision.project_id });
  return { context, revision };
}

export async function GET(request: Request, context: Context) {
  try {
    const { revisionId } = await context.params as { revisionId: string };
    const authorized = await authorize(request, revisionId);
    if ("response" in authorized) return authorized.response;
    const plan = await loadPlan(authorized.context.service, authorized.revision);
    return NextResponse.json(previewResponse(authorized.revision, plan));
  } catch (error) {
    const result = qualityApiError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { revisionId } = await context.params as { revisionId: string };
    const authorized = await authorize(request, revisionId);
    if ("response" in authorized) return authorized.response;
    const body = await request.json().catch(() => null) as { operationId?: unknown } | null;
    if (typeof body?.operationId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.operationId)) {
      return NextResponse.json({ error: "A valid reconciliation operation ID is required." }, { status: 400 });
    }

    // Re-read immediately before mutation; the per-item RPC then rechecks status,
    // record version, revision lock and evidence presence transactionally.
    const plan = await loadPlan(authorized.context.service, authorized.revision);
    if (!plan.mutable) return NextResponse.json({ error: "This Revision is finalised or locked and cannot be changed." }, { status: 409 });
    const updatedItems: Array<{ id: string; fli: string }> = [];
    const metadataRepairedItems: Array<{ id: string; fli: string; repairedFields: string[] }> = [];
    const skippedItems: Array<{ id: string; fli: string; reason: string }> = plan.summary.skippedItems.map(({ item, reason }) => ({ id: item.id, fli: revisionItemFli(item), reason }));
    const failedItems: Array<{ id: string; fli: string; reason: string }> = [];
    const metadataFailedItems: Array<{ id: string; fli: string; reason: string }> = [];
    const metadataLockedItems: Array<{ id: string; fli: string; reason: string }> = [];
    const metadataUnavailableItems: Array<{ id: string; fli: string; missingFields: string[]; reason: string }> = plan.summary.metadataRepairItems
      .filter(entry => !entry.fields.length)
      .map(({ item, missingFields }) => ({ id: item.id, fli: revisionItemFli(item), missingFields, reason: "Active evidence exists, but it has no capture metadata to restore these fields." }));

    const statusEligibleIds = new Set(plan.summary.eligibleItems.map(item => item.id));
    const metadataById = new Map(plan.summary.metadataRepairItems.map(entry => [entry.item.id, entry]));
    const workById = new Map<string, { item: ItemRow; statusEligible: boolean; metadataFields: string[] }>();
    for (const item of plan.summary.eligibleItems) workById.set(item.id, { item: item as ItemRow, statusEligible: true, metadataFields: metadataById.get(item.id)?.fields || [] });
    for (const { item, fields } of plan.summary.metadataRepairItems.filter(entry => entry.fields.length > 0)) {
      const existing = workById.get(item.id);
      workById.set(item.id, { item: item as ItemRow, statusEligible: statusEligibleIds.has(item.id), metadataFields: existing?.metadataFields || fields });
    }

    // Keep both transition and metadata-repair fan-out bounded. Status changes
    // still use the established transition RPC; metadata repair has its own
    // transactional lock/scope/null-only RPC so it can be retried independently.
    const outcomes = await mapWithConcurrency([...workById.values()], REVISION_RECTIFY_CONCURRENCY, async ({ item, statusEligible, metadataFields }) => {
      const before = selectCaptureEvidence(item, plan.files, "before_photo");
      const after = selectCaptureEvidence(item, plan.files, "after_photo");
      return runRevisionReconciliationItem({
        id: item.id,
        fli: revisionItemFli(item),
        statusEligible,
        metadataFields,
        metadataLocked: item.status === "Verified",
        transition: async () => {
          const mutationId = `bulk-rectify:${body.operationId}:${item.id}`;
          const transition = await authorized.context.service.rpc("update_v1_quality_item", {
            p_item: item.id,
            p_actor: authorized.context.user.id,
            p_version: Number(item.record_version),
            p_mutation: mutationId,
            p_patch: { status: "Rectified" },
            p_label: qualityDisplayName(authorized.context.label),
          });
          if (transition.error) {
            const normalized = atomicQualityError(transition.error);
            return { ok: false, conflict: normalized.status === 409 || normalized.status === 404, reason: normalized.message };
          }
          return { ok: true };
        },
        repairMetadata: async () => {
          const backfill = historicalCaptureBackfill(item, before, after);
          if (!Object.keys(backfill).length) return { ok: true, fields: [] };
          const repaired = await authorized.context.service.rpc("reconcile_v1_quality_item_capture_metadata", {
            p_item: item.id,
            p_revision: authorized.revision.id,
            p_project: authorized.revision.project_id,
            p_tower: authorized.revision.tower_id,
            p_actor: authorized.context.user.id,
            p_patch: backfill,
          });
          if (repaired.error) return { ok: false, reason: atomicQualityError(repaired.error).message };
          const data = repaired.data as { lockedReason?: string; updatedFields?: string[] } | null;
          return data?.lockedReason
            ? { ok: false, lockedReason: data.lockedReason }
            : { ok: true, fields: data?.updatedFields || [] };
        },
      });
    });

    for (const outcome of outcomes) {
      if (outcome.transition?.kind === "updated") updatedItems.push({ id: outcome.id, fli: outcome.fli });
      if (outcome.transition?.kind === "skipped") skippedItems.push({ id: outcome.id, fli: outcome.fli, reason: outcome.transition.reason || "Item changed before transition." });
      if (outcome.transition?.kind === "failed") failedItems.push({ id: outcome.id, fli: outcome.fli, reason: outcome.transition.reason || "Status transition failed." });
      if (outcome.metadata?.kind === "repaired" && outcome.metadata.fields?.length) metadataRepairedItems.push({ id: outcome.id, fli: outcome.fli, repairedFields: outcome.metadata.fields });
      if (outcome.metadata?.kind === "failed") metadataFailedItems.push({ id: outcome.id, fli: outcome.fli, reason: outcome.metadata.reason || "Capture metadata repair failed." });
      if (outcome.metadata?.kind === "locked") metadataLockedItems.push({ id: outcome.id, fli: outcome.fli, reason: outcome.metadata.reason || "Metadata repair is locked." });
    }

    const finalPlan = await loadPlan(authorized.context.service, authorized.revision);
    return NextResponse.json({
      ...previewResponse(authorized.revision, finalPlan),
      eligibleCount: plan.summary.counts.eligible,
      updatedCount: updatedItems.length,
      alreadyRectifiedCount: plan.summary.counts.alreadyRectified,
      verifiedCount: plan.summary.counts.verified,
      skippedCount: skippedItems.length,
      failedCount: failedItems.length,
      metadataRepairCandidateCount: plan.summary.counts.metadataRepairCandidates,
      metadataRepairedCount: metadataRepairedItems.length,
      metadataFailedCount: metadataFailedItems.length,
      updatedItems,
      metadataRepairedItems,
      skippedItems,
      failedItems,
      metadataFailedItems,
      metadataLockedItems,
      metadataUnavailableItems,
      remainingIncompleteCount: finalPlan.summary.counts.noEvidence + finalPlan.summary.counts.beforeOnly + finalPlan.summary.counts.afterOnly,
    });
  } catch (error) {
    const result = qualityApiError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
