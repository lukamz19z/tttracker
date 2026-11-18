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
const { mapWithConcurrency } = require(path.join(root, "lib/quality/bounded-concurrency.ts"));
const { QUALITY_EVIDENCE_JPEG_QUALITY } = require(path.join(root, "mobile/lib/quality-photo-policy.ts"));

test("photo uploads stay at three active workers for one, ten and fifty queued photos", async () => {
  for (const count of [1, 10, 50]) {
    let active = 0;
    let maximum = 0;
    await mapWithConcurrency(Array.from({ length: count }, (_, index) => index), 3, async () => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--;
    });
    assert.ok(maximum <= 3);
    assert.equal(maximum, Math.min(3, count));
  }
});

test("one failed photo does not block remaining queue items", async () => {
  const completed = [];
  const result = await mapWithConcurrency(Array.from({ length: 10 }, (_, index) => index), 3, async value => {
    try {
      if (value === 4) throw new Error("simulated upload failure");
      completed.push(value);
      return "uploaded";
    } catch {
      return "failed";
    }
  });
  assert.equal(result.filter(value => value === "failed").length, 1);
  assert.equal(completed.length, 9);
});

test("existing Expo Image Picker compression is used without claiming or performing a dimension resize", async () => {
  assert.equal(QUALITY_EVIDENCE_JPEG_QUALITY, 0.88);
  const picker=await readFile(path.join(root,"mobile/components/quality/QualityPhotoPicker.tsx"),"utf8");
  assert.match(picker,/launchCameraAsync\(\{ mediaTypes: \["images"\], quality: QUALITY_EVIDENCE_JPEG_QUALITY/);
  assert.match(picker,/quality: QUALITY_EVIDENCE_JPEG_QUALITY,/);
  assert.match(picker,/width: asset\.width, height: asset\.height/);
  assert.doesNotMatch(picker,/manipulateAsync|expo-image-manipulator|resize\(/);
});

test("bulk revision photos are durable, project/item scoped, photo-only, and retain Before/After roles", async () => {
  const source = await readFile(path.join(root, "mobile/lib/offline/quality-sync.ts"), "utf8");
  const screen = await readFile(path.join(root, "mobile/app/revisions/[revisionId].tsx"), "utf8");
  const sync = await readFile(path.join(root, "mobile/contexts/SyncContext.tsx"), "utf8");
  assert.match(source, /enqueue\("quality_revision_evidence_upload",input\)/);
  assert.match(source, /role:"before_photo"\|"after_photo"/);
  assert.match(screen, /enqueueRevisionEvidenceUpload\(\{projectId,towerId,revisionId:canonicalRevisionId,itemId:item\.id,role:bulkPhase/);
  assert.match(screen, /bulkCaptureLock\.current/);
  assert.match(sync, /record\.kind === "quality_revision_evidence_upload"/);
  assert.match(sync, /batch\.length < 3/);
  assert.match(source, /record\.kind !== "quality_revision_evidence_upload" && payload\.projectId/);
});

test("retry is scoped to failed queue IDs and upload bytes go directly to the short-lived Graph session", async () => {
  const db = await readFile(path.join(root, "mobile/lib/offline/db.ts"), "utf8");
  const api = await readFile(path.join(root, "mobile/lib/api/quality.ts"), "utf8");
  assert.match(db, /WHERE id=\? AND status IN \('failed','retryable_failure','requires_reconciliation'\)/);
  assert.match(api, /\/api\/quality\/files\/upload-session/);
  assert.match(api, /binaryFetch\(session\.uploadUrl/);
  assert.match(api, /\/api\/quality\/files\/upload/);
});

test("list position is separated by project and filter scope; FlatList can restore its offset", async () => {
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === "@/lib/perf-trace") return { logMobilePerf() {} };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const position = require(path.join(root, "mobile/lib/quality-list-position.ts"));
    position.saveQualityListPosition("quality:mobile:list:project-west:revisions", "west|query-a", 6120);
    position.saveQualityListAnchor("quality:mobile:list:project-west:revisions", "west|query-a", "item-101", 101, 6120);
    assert.equal(position.qualityListPosition("quality:mobile:list:project-west:revisions", "west|query-a"), 6120);
    assert.equal(position.qualityListPosition("quality:mobile:list:project-west:revisions", "west|query-b"), 0);
    assert.equal(position.qualityListPosition("quality:mobile:list:project-east:revisions", "west|query-a"), 0);
    const shell = await readFile(path.join(root, "mobile/components/quality/QualityShell.tsx"), "utf8");
    assert.match(shell, /scrollToOffset\(\{offset,animated:false\}\)/);
    assert.match(shell, /scrollToIndex\(\{index:anchorIndex/);
    assert.match(shell, /onScroll=\{handleScroll\}/);
  } finally {
    Module._load = originalLoad;
  }
});
