import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const Module = require("node:module");
Module._extensions[".ts"] = (mod, filename) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  mod._compile(js, filename);
};
const { revisionEvidenceState, summarizeRevisionEvidence, historicalCaptureBackfill, hasCompleteHistoricalCaptureMetadata, selectCaptureEvidence } = require(path.join(root, "lib/quality/revision-evidence-state.ts"));
const { mapWithConcurrency } = require(path.join(root, "lib/quality/bounded-concurrency.ts"));
const { runRevisionReconciliationItem } = require(path.join(root, "lib/quality/run-revision-reconciliation-item.ts"));
const item = (overrides = {}) => ({ id: "item-1", revision_id: "rev-1", status: "Open", issue_type_id: "issue-1", other_issue_text: null, ...overrides });
const file = (role, overrides = {}) => ({ id: `${role}-1`, revision_id: "rev-1", revision_item_id: "item-1", file_role: role, deletion_pending: false, is_outdated: false, created_at: "2026-11-01T00:00:00Z", ...overrides });

test("eligibility requires an Open finding and active Before plus After evidence", () => {
  const before = file("before_photo"), after = file("after_photo");
  assert.equal(summarizeRevisionEvidence([item()], [before, after]).counts.eligible, 1);
  assert.equal(summarizeRevisionEvidence([item()], [before]).counts.beforeOnly, 1);
  assert.equal(summarizeRevisionEvidence([item()], [after]).counts.afterOnly, 1);
  assert.equal(summarizeRevisionEvidence([item()], []).counts.noEvidence, 1);
  assert.equal(summarizeRevisionEvidence([item()], [file("before_photo", { is_outdated: true }), after]).counts.eligible, 0);
  assert.equal(summarizeRevisionEvidence([item()], [before, file("after_photo", { deletion_pending: true })]).counts.eligible, 0);
  assert.equal(summarizeRevisionEvidence([item()], [before, after, file("before_photo", { id: "before-2" })]).counts.eligible, 1);
  assert.equal(summarizeRevisionEvidence([item({ status: "Rectified" })], [before, after]).counts.alreadyRectified, 1);
  assert.equal(summarizeRevisionEvidence([item({ status: "Verified" })], [before, after]).counts.verified, 1);
  assert.equal(summarizeRevisionEvidence([item({ revision_id: "rev-2" })], [before, after]).counts.eligible, 0);
  assert.equal(summarizeRevisionEvidence([item()], [file("before_photo", { revision_id: "rev-2" }), after]).counts.eligible, 0);
  assert.equal(summarizeRevisionEvidence([item()], [file("before_photo", { revision_item_id: "other-item" }), after]).counts.eligible, 0);
  assert.equal(summarizeRevisionEvidence([item({ status: "Cancelled" })], [before, after]).counts.eligible, 0);
});

test("evidence labels distinguish none, before only, after only and complete", () => {
  assert.equal(revisionEvidenceState(item(), []).label, "No evidence");
  assert.equal(revisionEvidenceState(item(), [file("before_photo")]).label, "Awaiting After");
  assert.equal(revisionEvidenceState(item(), [file("after_photo")]).label, "Missing Before");
  assert.equal(revisionEvidenceState(item(), [file("before_photo"), file("after_photo")]).label, "Evidence complete");
  assert.equal(revisionEvidenceState(item({ status: "Rectified" }), []).label, "Rectified");
  assert.equal(revisionEvidenceState(item({ status: "Verified" }), []).label, "Verified");
});

test("capture backfill is deterministic, null-only, and never attributes the bulk actor", () => {
  const older = file("before_photo", { id: "old", created_at: "2026-10-01T00:00:00Z", captured_at: "2026-09-30T00:00:00Z", uploaded_by: "u-old", uploaded_by_label: "Photographer A", evidence_metadata: { capturedBy: "Photographer A" } });
  const newest = file("before_photo", { id: "new", created_at: "2026-10-02T00:00:00Z", captured_at: "2026-10-01T00:00:00Z", uploaded_by: "u-new", uploaded_by_label: "Photographer B", evidence_metadata: { capturedBy: "Photographer B" } });
  const chosen = selectCaptureEvidence(item(), [older, newest], "before_photo");
  assert.equal(chosen.id, "new");
  const patch = historicalCaptureBackfill({ before_taken_at: null, before_taken_by: null, before_taken_by_label: null, after_taken_at: null, after_taken_by: null, after_taken_by_label: null }, chosen, file("after_photo", { captured_at: "2026-10-04T00:00:00Z", uploaded_by: "u-after", uploaded_by_label: "After User", evidence_metadata: { capturedBy: "After User" } }));
  assert.equal(patch.before_taken_at, "2026-10-01T00:00:00Z");
  assert.equal(patch.before_taken_by, "u-new");
  assert.equal(patch.before_taken_by_label, "Photographer B");
  assert.equal(patch.after_taken_by, "u-after");
  assert.ok(!Object.values(patch).includes("bulk-actor"));
  const metadataTime = historicalCaptureBackfill({ before_taken_at: null }, { ...chosen, captured_at: null, evidence_metadata: { capturedAt: "2026-10-01T00:00:00Z" } }, null);
  assert.equal(metadataTime.before_taken_at, "2026-10-01T00:00:00Z");
  const preserved = historicalCaptureBackfill({ before_taken_at: "existing", before_taken_by: "existing-id", before_taken_by_label: "Existing Name", after_taken_at: null, after_taken_by: null, after_taken_by_label: null }, chosen, null);
  assert.deepEqual(preserved, {});
});

test("reconciliation becomes idempotent after the existing Rectified transition and keeps verification separate", () => {
  const before = file("before_photo"), after = file("after_photo");
  const plan = summarizeRevisionEvidence([item(), item({ id: "item-2", status: "Verified" })], [before, after]);
  assert.equal(plan.counts.eligible, 1);
  const rerun = summarizeRevisionEvidence([item({ status: "Rectified" }), item({ id: "item-2", status: "Verified" })], [before, after]);
  assert.equal(rerun.counts.eligible, 0);
  assert.equal(rerun.counts.alreadyRectified, 1);
  assert.equal(rerun.counts.verified, 1);
});

test("Open complete findings can transition and repair metadata; a retry repairs Rectified metadata without transitioning again", () => {
  const before = file("before_photo", { captured_at: "2026-10-01T01:00:00Z", uploaded_by: "u1", uploaded_by_label: "Capture User", evidence_metadata: { capturedBy: "Capture User" } });
  const after = file("after_photo", { captured_at: "2026-10-02T01:00:00Z", uploaded_by: "u2", uploaded_by_label: "After User", evidence_metadata: { capturedBy: "After User" } });
  const open = item({ before_taken_at: null, before_taken_by: null, before_taken_by_label: null, after_taken_at: null, after_taken_by: null, after_taken_by_label: null });
  const preview = summarizeRevisionEvidence([open], [before, after]);
  assert.equal(preview.counts.eligible, 1);
  assert.equal(preview.counts.metadataRepairCandidates, 1);
  assert.deepEqual(preview.metadataRepairItems[0].fields, ["before_taken_at", "before_taken_by_label", "before_taken_by", "after_taken_at", "after_taken_by_label", "after_taken_by"]);

  const repaired = { ...open, ...historicalCaptureBackfill(open, before, after), status: "Rectified" };
  const retry = summarizeRevisionEvidence([repaired], [before, after]);
  assert.equal(retry.counts.eligible, 0);
  assert.equal(retry.counts.alreadyRectified, 1);
  assert.equal(retry.counts.metadataRepairCandidates, 0);
  assert.equal(hasCompleteHistoricalCaptureMetadata(repaired), true);
});

test("already Rectified items can repair metadata while Verified items remain locked", () => {
  const before = file("before_photo", { captured_at: "2026-10-01T01:00:00Z", uploaded_by: "u1", uploaded_by_label: "Capture User", evidence_metadata: { capturedBy: "Capture User" } });
  const after = file("after_photo", { captured_at: "2026-10-02T01:00:00Z", uploaded_by: "u2", uploaded_by_label: "After User", evidence_metadata: { capturedBy: "After User" } });
  const missing = { before_taken_at: null, before_taken_by: null, before_taken_by_label: null, after_taken_at: null, after_taken_by: null, after_taken_by_label: null };
  const result = summarizeRevisionEvidence([item({ ...missing, status: "Rectified" }), item({ id: "verified", ...missing, status: "Verified" })], [before, after, { ...before, id: "verified-before", revision_item_id: "verified" }, { ...after, id: "verified-after", revision_item_id: "verified" }]);
  assert.equal(result.counts.eligible, 0);
  assert.equal(result.counts.alreadyRectified, 1);
  assert.equal(result.counts.verified, 1);
  assert.equal(result.counts.metadataRepairable, 1);
  assert.equal(result.counts.metadataLocked, 1);
  assert.equal(result.metadataRepairItems.length, 2);
});

test("metadata failure is reported separately and a later run retries without another status transition", async () => {
  let status = "Open";
  let transitionCalls = 0;
  let metadataCalls = 0;
  const first = await runRevisionReconciliationItem({
    id: "item-1", fli: "FLI-001", statusEligible: true, metadataFields: ["before_taken_at"], metadataLocked: false,
    transition: async () => { transitionCalls += 1; status = "Rectified"; return { ok: true }; },
    repairMetadata: async () => { metadataCalls += 1; return { ok: false, reason: "temporary database error" }; },
  });
  assert.equal(status, "Rectified");
  assert.equal(first.transition?.kind, "updated");
  assert.equal(first.metadata?.kind, "failed");

  const second = await runRevisionReconciliationItem({
    id: "item-1", fli: "FLI-001", statusEligible: false, metadataFields: ["before_taken_at"], metadataLocked: false,
    transition: async () => { transitionCalls += 1; return { ok: true }; },
    repairMetadata: async () => { metadataCalls += 1; return { ok: true, fields: ["before_taken_at"] }; },
  });
  assert.equal(second.transition, undefined);
  assert.deepEqual(second.metadata, { kind: "repaired", fields: ["before_taken_at"] });
  assert.equal(transitionCalls, 1);
  assert.equal(metadataCalls, 2);
});

test("metadata-only repair preserves verified locks and reports them without invoking the repair", async () => {
  let repairCalls = 0;
  const result = await runRevisionReconciliationItem({
    id: "item-verified", fli: "FLI-002", statusEligible: false, metadataFields: ["after_taken_at"], metadataLocked: true,
    transition: async () => ({ ok: true }),
    repairMetadata: async () => { repairCalls += 1; return { ok: true }; },
  });
  assert.equal(result.transition, undefined);
  assert.equal(result.metadata?.kind, "locked");
  assert.equal(repairCalls, 0);
});

test("incomplete evidence stays status-ineligible and only supplies metadata from the available role", () => {
  const before = file("before_photo", { captured_at: "2026-10-01T01:00:00Z", uploaded_by: null, uploaded_by_label: null, evidence_metadata: {} });
  const open = item({ before_taken_at: null, before_taken_by: null, before_taken_by_label: null, after_taken_at: null, after_taken_by: null, after_taken_by_label: null });
  const result = summarizeRevisionEvidence([open], [before]);
  assert.equal(result.counts.eligible, 0);
  assert.equal(result.counts.beforeOnly, 1);
  assert.deepEqual(result.metadataRepairItems[0].fields, ["before_taken_at"]);
  assert.equal(historicalCaptureBackfill(open, before, null).before_taken_at, before.captured_at);
  assert.equal(historicalCaptureBackfill(open, before, null).after_taken_at, undefined);
});

test("active evidence with null capture fields but no stored capture values is visible as unavailable, not silently repaired", () => {
  const noMetadataBefore = file("before_photo", { captured_at: null, uploaded_by: null, uploaded_by_label: null, evidence_metadata: {} });
  const noMetadataAfter = file("after_photo", { captured_at: null, uploaded_by: null, uploaded_by_label: null, evidence_metadata: {} });
  const result = summarizeRevisionEvidence([item({ status: "Rectified", before_taken_at: null, before_taken_by: null, before_taken_by_label: null, after_taken_at: null, after_taken_by: null, after_taken_by_label: null })], [noMetadataBefore, noMetadataAfter]);
  assert.equal(result.counts.metadataRepairCandidates, 1);
  assert.equal(result.counts.metadataRepairable, 0);
  assert.equal(result.counts.metadataUnavailable, 1);
  assert.deepEqual(result.metadataRepairItems[0].fields, []);
  assert.deepEqual(result.metadataRepairItems[0].missingFields, ["before_taken_at", "before_taken_by", "before_taken_by_label", "after_taken_at", "after_taken_by", "after_taken_by_label"]);
});

test("bulk item work is bounded and results remain associated with the original FLI order", async () => {
  let active = 0;
  let maximumActive = 0;
  const items = Array.from({ length: 87 }, (_, index) => index);
  const results = await mapWithConcurrency(items, 6, async (item) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise(resolve => setTimeout(resolve, item % 3));
    active -= 1;
    return `FLI-${item + 1}`;
  });
  assert.equal(maximumActive, 6);
  assert.equal(results.length, 87);
  assert.equal(results[0], "FLI-1");
  assert.equal(results[86], "FLI-87");
});

test("server uses the canonical item transition RPC, preflights active evidence, and retains PDF invalidation", async () => {
  const bulk = await readFile(path.join(root, "app/api/quality/revisions/[revisionId]/rectify-eligible/route.ts"), "utf8");
  const single = await readFile(path.join(root, "app/api/quality/revisions/[revisionId]/items/[itemId]/route.ts"), "utf8");
  const invalidation = await readFile(path.join(root, "supabase/migrations/20261030120000_v1_quality_punchlists_and_evidence.sql"), "utf8");
  const metadataRpc = await readFile(path.join(root, "supabase/migrations/20261106143000_v1_quality_capture_metadata_reconciliation.sql"), "utf8");
  const retryHelper = await readFile(path.join(root, "lib/quality/run-revision-reconciliation-item.ts"), "utf8");
  assert.match(bulk, /qualityWorkflowAccess/);
  assert.match(bulk, /update_v1_quality_item/);
  assert.match(bulk, /REVISION_RECTIFY_CONCURRENCY\s*=\s*6/);
  assert.match(bulk, /mapWithConcurrency\(\[\.\.\.workById\.values\(\)\],\s*REVISION_RECTIFY_CONCURRENCY/);
  assert.match(bulk, /reconcile_v1_quality_item_capture_metadata/);
  assert.match(bulk, /runRevisionReconciliationItem/);
  assert.match(bulk, /metadataFailedItems/);
  assert.match(bulk, /metadataLockedItems/);
  assert.match(bulk, /failedItems/);
  assert.match(bulk, /normalized\.status\s*===\s*409\s*\|\|\s*normalized\.status\s*===\s*404/);
  assert.match(bulk, /p_patch:\s*\{\s*status:\s*"Rectified"\s*\}/);
  assert.match(bulk, /deletion_pending.*is_outdated/s);
  assert.doesNotMatch(bulk, /status:\s*"Verified"/);
  assert.match(single, /\.eq\("is_outdated", false\)/);
  assert.match(invalidation, /invalidate_v1_revision_finalisation/);
  assert.match(invalidation, /latest_pdf_file_id=null/);
  assert.match(invalidation, /is_outdated=true/);
  assert.match(metadataRpc, /parent\.finalised_at is not null/);
  assert.match(metadataRpc, /item\.status='Verified'/);
  assert.match(metadataRpc, /before_taken_at is null/);
  assert.match(metadataRpc, /after_taken_at is null/);
  assert.match(metadataRpc, /assert_v1_quality_actor/);
  assert.match(retryHelper, /if \(args\.statusEligible\)/);
  assert.match(retryHelper, /if \(!args\.metadataFields\.length\)/);
});

test("RECT page exposes preview counts, explicit confirmation and incomplete-evidence labels", async () => {
  const page = await readFile(path.join(root, "app/(protected)/project/[projectId]/tower/[towerId]/revisions/page.tsx"), "utf8");
  const helper = await readFile(path.join(root, "lib/quality/revision-evidence-state.ts"), "utf8");
  assert.match(page, /Rectify eligible/);
  assert.match(page, /Mark \$\{rectifyPreview\.counts\.eligible\} as Rectified/);
  assert.match(page, /Metadata repair required/);
  assert.match(page, /metadataRepairable/);
  assert.match(page, /Verified records and locked revisions are not changed/);
  assert.match(page, /Findings with incomplete evidence remain Open/);
  assert.match(helper, /Awaiting After/);
  assert.match(helper, /Missing Before/);
});
