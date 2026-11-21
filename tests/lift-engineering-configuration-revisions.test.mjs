import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sameConfigurationDraftRevision } from "../lib/lift-engineering/configuration-revision-identity.ts";

const draft = { revision: "Rev C", status: "draft", counterweight_t: 41, outrigger_state: "Full", data: { slewRange: "360°", outriggerLengthM: 8.55 } };

test("repeated identical Draft revision submit reuses its existing revision", () => {
  assert.equal(sameConfigurationDraftRevision(draft, { ...draft, status: "DRAFT" }), true);
  assert.equal(sameConfigurationDraftRevision({ ...draft, source_document: [] }, draft), true);
});

test("different or protected technical revisions are not treated as duplicate Drafts", () => {
  assert.equal(sameConfigurationDraftRevision(draft, { ...draft, data: { slewRange: "180°" } }), false);
  assert.equal(sameConfigurationDraftRevision({ ...draft, status: "active" }, draft), false);
});

test("configuration revision APIs are resource-scoped and return JSON for successful operations", async () => {
  const createRoute = await readFile(new URL("../app/api/lift-engineering/library/configurations/[configurationId]/revisions/route.ts", import.meta.url), "utf8");
  assert.match(createRoute, /export async function POST/);
  assert.match(createRoute, /NextResponse\.json\(\{ ok: true, revision: data, existing: false \}, \{ status: 201 \}\)/);
  assert.match(createRoute, /NextResponse\.json\(\{ ok: true, revision: duplicateDraft, existing: true \}\)/);
  assert.match(createRoute, /NextResponse\.json\(\{ ok: true, deletedRevisionId: data\.id \}\)/);
});

test("configuration Draft delete rejects protected and sole revisions", async () => {
  const route = await readFile(new URL("../app/api/lift-engineering/library/configurations/[configurationId]/revisions/route.ts", import.meta.url), "utf8");
  assert.match(route, /Only Draft technical revisions can be deleted/);
  assert.match(route, /\(revisions \?\? \[\]\)\.length <= 1/);
  assert.match(route, /lift_study_revisions/);
  assert.match(route, /lift_load_charts/);
  assert.match(route, /last_configuration_revision/);
  assert.match(route, /revision_in_study/);
  assert.match(route, /revision_in_chart/);
});

test("detail UI only offers secondary unused Draft delete and sole revision uses Delete Configuration", async () => {
  const page = await readFile(new URL("../app/(protected)/lift-engineering/library/[resource]/CraneConfigurationDetail.tsx", import.meta.url), "utf8");
  assert.match(page, /revisions\.length === 1 && revision\?\.status\.toLowerCase\(\) === "draft"/);
  assert.match(page, /Delete Configuration/);
  assert.match(page, /revisions\.length > 1 && item\.studyReferenceCount === 0 && item\.chartReferenceCount === 0/);
  assert.match(page, /Delete Draft \{revisionToDelete\.revision\}\?/);
  assert.match(page, /submitting\.current\) return/);
  assert.match(page, /\/configurations\/\$\{encodeURIComponent\(detail\.configuration\.id\)\}\/revisions/);
});

test("legacy generic resource endpoint no longer creates configuration revisions", async () => {
  const route = await readFile(new URL("../app/api/lift-engineering/library/[resource]/revisions/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /^\s*configurations:/m);
});
