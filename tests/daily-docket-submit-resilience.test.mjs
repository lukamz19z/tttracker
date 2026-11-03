import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { reconcileDailyDocketSubmissionStatus } from "../lib/dockets/submission-status.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("daily docket writes bypass read circuits, have no retries, and use a mutation timeout", async () => {
  const [resilience, api] = await Promise.all([
    read("lib/backend-resilience.ts"),
    read("mobile/lib/api/daily-dockets.ts"),
  ]);
  assert.match(resilience, /circuitProtected = this\.circuitBreaker && safeRead && !authRequest/);
  assert.match(resilience, /const retries = safeRead && !authRequest \? RETRY_DELAYS_MS\.length : 0/);
  assert.match(resilience, /safeRead \? Math\.min\(MAX_ATTEMPT_TIMEOUT_MS, remainingMs\) : remainingMs/);
  assert.match(api, /method: "POST",\s*timeoutMs: 60_000/);
  assert.match(api, /isAmbiguousDailyDocketMutationFailure/);
});

test("submission uses a stable docket ID and reconciles ambiguous results through a safe status read", async () => {
  const [screen, api, statusRoute, saveRoute] = await Promise.all([
    read("mobile/app/(drawer)/daily-dockets.tsx"),
    read("mobile/lib/api/daily-dockets.ts"),
    read("app/api/mobile/daily-dockets/[docketId]/status/route.ts"),
    read("app/api/mobile/daily-dockets/save/route.ts"),
  ]);
  assert.match(screen, /submissionInFlight\.current/);
  assert.match(screen, /docketId: draft\.docketId \|\| crypto\.randomUUID\(\)/);
  assert.match(screen, /submissionUncertainDocketId\.current === docketId/);
  assert.match(screen, /Checking submission status/);
  assert.match(screen, /couldn't confirm whether this docket was submitted/);
  assert.match(screen, /getDailyDocketSubmissionStatus\(projectId, docketId\)/);
  assert.match(api, /\/api\/mobile\/daily-dockets\/\$\{encodeURIComponent\(id\)\}\/status/);
  const statusHelper = await read("lib/dockets/submission-status.ts");
  assert.match(statusRoute, /isSubmittedDailyDocketStatus\(status\)/);
  assert.match(statusHelper, /"submitted_bc"[\s\S]*"client_pending"[\s\S]*"final"/);
  assert.match(saveRoute, /draft\.mode !== "create"/);
  assert.match(saveRoute, /\.\.\.\(savedDocketId \? \{ id: savedDocketId \} : \{\}\)/);
});

test("submit route returns current submitted state idempotently and schedules non-critical email after commit", async () => {
  const route = await read("app/api/daily-dockets/[docketId]/submit-bc/route.ts");
  const idempotentBranch = route.indexOf("if (isSubmittedDailyDocketStatus(docket.approval_status))");
  const submittedState = route.indexOf('approval_status: "submitted_bc",');
  const commit = route.lastIndexOf(".update({", submittedState);
  const firstWorkflowInsert = route.indexOf('service.from("tower_docket_approvals").insert', commit);
  const after = route.indexOf("after(async () =>", commit);
  const response = route.indexOf("return NextResponse.json({", after);

  assert.ok(idempotentBranch >= 0 && idempotentBranch < commit);
  assert.ok(firstWorkflowInsert > commit);
  assert.ok(after > firstWorkflowInsert);
  assert.ok(response > after);
  assert.match(route, /alreadySubmitted: true/);
  assert.match(route, /logSubmitPhase\("persist_submission_state"\)/);
  assert.match(route, /phase: "post_commit_data_load"/);
  assert.match(route, /phase: "reviewer_email"/);
  assert.match(route, /Daily Docket submitted; post-commit reviewer notification preparation failed/);
});

test("ambiguous timeout reconciliation distinguishes committed, draft and unavailable status reads", async () => {
  const committed = await reconcileDailyDocketSubmissionStatus(async () => ({ status: "submitted_bc", submitted: true, revision: 2 }));
  assert.equal(committed.state, "submitted");

  const stillDraft = await reconcileDailyDocketSubmissionStatus(async () => ({ status: "draft", submitted: false, revision: 0 }));
  assert.equal(stillDraft.state, "not_submitted");

  const unavailable = await reconcileDailyDocketSubmissionStatus(async () => { throw new TypeError("network request failed"); });
  assert.equal(unavailable.state, "unknown");

  const authFailure = Object.assign(new Error("You must be signed in."), { status: 401 });
  await assert.rejects(reconcileDailyDocketSubmissionStatus(async () => { throw authFailure; }), (error) => error === authFailure);
});
