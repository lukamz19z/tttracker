import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { reconcileDailyDocketSubmissionStatus } from "../lib/dockets/submission-status.ts";
import { createPortableId } from "../lib/portable-id.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const require = createRequire(import.meta.url);
const ts = require("typescript");

test("daily docket writes bypass read circuits, have no retries, and use a mutation timeout", async () => {
  const [resilience, api] = await Promise.all([
    read("lib/backend-resilience.ts"),
    read("mobile/lib/api/daily-dockets.ts"),
  ]);
  assert.match(resilience, /circuitProtected = this\.circuitBreaker && safeRead && !authRequest/);
  assert.match(resilience, /const retries = safeRead && !authRequest \? RETRY_DELAYS_MS\.length : 0/);
  assert.match(resilience, /safeRead \? Math\.min\(MAX_ATTEMPT_TIMEOUT_MS, remainingMs\) : remainingMs/);
  assert.doesNotMatch(api, /timeoutMs:\s*60_000/);
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
  assert.match(screen, /docketId: draft\.docketId \|\| createClientId\(\)/);
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

test("mobile client IDs work with no browser crypto global and stay injectable for native runtimes", () => {
  const originalCrypto = globalThis.crypto;
  try {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
    const generated = createPortableId(() => "6e1f42a4-c083-4dcf-9a7b-1ce853d89d43");
    assert.equal(generated, "6e1f42a4-c083-4dcf-9a7b-1ce853d89d43");
  } finally {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto });
  }
});

test("portable ID helper uses Web Crypto in browser and server runtimes", () => {
  assert.match(createPortableId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test("Materials offline queue uses the same React Native safe ID helper", async () => {
  const [queue, materials, idHelper] = await Promise.all([
    read("mobile/lib/offline/db.ts"),
    read("mobile/lib/api/materials.ts"),
    read("mobile/lib/client-id.ts"),
  ]);
  assert.match(queue, /id: string = createClientId\(\)/);
  assert.doesNotMatch(queue, /crypto\.randomUUID/);
  assert.match(idHelper, /Crypto\.randomUUID/);
  assert.match(materials, /clientMutationId/);
});

test("Quality offline revision creation uses the same safe stable local ID for its queue record", async () => {
  const [revisionSync, offlineDb] = await Promise.all([
    read("mobile/lib/offline/revision-sync.ts"),
    read("mobile/lib/offline/db.ts"),
  ]);
  assert.match(revisionSync, /const localId = createClientId\(\)/);
  assert.match(revisionSync, /enqueue\("revision_draft", payload, localId\)/);
  assert.match(revisionSync, /revision-\$\{localId\}/);
  assert.match(offlineDb, /ON CONFLICT\(id\) DO NOTHING/);
  assert.doesNotMatch(revisionSync, /crypto\.randomUUID/);
});

test("Quality offline revision can queue and retry sync with global crypto undefined and one stable ID", async () => {
  const source = await read("mobile/lib/offline/revision-sync.ts");
  const originalCrypto = globalThis.crypto;
  const queue = new Map();
  const syncPayloads = [];
  let generatedIds = 0;
  const id = "6e1f42a4-c083-4dcf-9a7b-1ce853d89d43";
  const mocks = {
    "@/lib/offline/db": {
      enqueue: async (kind, payload, queueId) => {
        if (!queue.has(queueId)) queue.set(queueId, { id: queueId, kind, payload, createdAt: "2026-11-04T00:00:00Z" });
        return queueId;
      },
    },
    "@/lib/offline/files": { persistOfflineFile: async (uri) => uri, removeOfflineFile: async () => {} },
    "@/lib/client-id": { createClientId: () => { generatedIds++; return createPortableId(() => id); } },
    "./quality-sync": { syncQualityQueueRecord: async ({ payload }) => syncPayloads.push(payload) },
  };
  const exports = {};
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

  try {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
    new Function("require", "exports", compiled)((name) => {
      assert.ok(name in mocks, `Unexpected revision-sync dependency: ${name}`);
      return mocks[name];
    }, exports);

    const localId = await exports.queueOfflineRevision({
      projectId: "P", towerId: "T", inspectionStage: "Post Erection", inspectionDate: "2026-11-04",
      finding: "Offline finding", photos: [],
    });
    const record = queue.get(localId);
    await exports.syncRevisionQueueRecord(record);
    await exports.syncRevisionQueueRecord(record);

    assert.equal(localId, id);
    assert.equal(generatedIds, 1);
    assert.equal(queue.size, 1);
    assert.equal(record.payload.localId, id);
    assert.deepEqual(syncPayloads.map((payload) => payload.clientMutationId), [`legacy-parent:${id}`, `legacy-parent:${id}`]);
  } finally {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto });
  }
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
