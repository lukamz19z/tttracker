import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("quality evidence content resolves by stable SharePoint item identity and explains a missing item", async () => {
  const route = await read("../app/api/quality/files/[fileId]/content/route.ts");
  assert.match(route, /items\/\$\{encodeURIComponent\(itemId\)\}\/content/);
  assert.match(route, /Evidence file missing from SharePoint/);
  assert.match(route, /deletion_pending.*false/);
});

test("website keeps evidence metadata visible when an individual photo request fails", async () => {
  const page = await read("../app/(protected)/project/[projectId]/tower/[towerId]/revisions/page.tsx");
  assert.match(page, /Promise\.all\(itemFiles\.map/);
  assert.match(page, /Evidence file missing from SharePoint/);
  assert.match(page, /view\.missingMessage/);
  assert.match(page, /Captured By:/);
});

test("PDF keeps a missing-photo placeholder and does not finalise missing evidence", async () => {
  const route = await read("../app/api/quality/files/revisions/[revisionId]/pdf/route.ts");
  const renderer = await read("../lib/quality/revision-pdf.ts");
  assert.match(route, /isMissingSharePointItem/);
  assert.match(route, /missingFromSharePoint:true/);
  assert.match(route, /incomplete\.length===0 && missingEvidence\.length===0/);
  assert.match(route, /Recover the original evidence and regenerate the report/);
  assert.match(renderer, /Evidence unavailable \/ missing from SharePoint/);
});


test("evidence deletion remains explicit and is not invoked by read or PDF recovery paths", async () => {
  const content = await read("../app/api/quality/files/[fileId]/content/route.ts");
  const pdf = await read("../app/api/quality/files/revisions/[revisionId]/pdf/route.ts");
  const deletion = await read("../lib/quality/evidence-deletion.ts");
  const deleteRoute = await read("../app/api/quality/files/[fileId]/route.ts");
  assert.doesNotMatch(content, /deleteDriveItem|\.remove\(/);
  assert.doesNotMatch(pdf, /deleteDriveItem\([^\n]*file\.sharepoint_item_id/);
  assert.match(deletion, /\.eq\("deletion_pending", false\)/);
  assert.match(deletion, /filter\(\(row\) => !excluded\.has\(row\.id\)\)/);
  assert.match(deleteRoute, /unreferencedQualityDriveItems/);
});
