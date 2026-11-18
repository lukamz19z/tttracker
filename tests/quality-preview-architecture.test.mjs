import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const source = async (path) => readFile(new URL(path, root), "utf8");

test("quality image variants are bounded and preserve aspect ratio", async () => {
  const route = await source("app/api/quality/files/[fileId]/content/route.ts");
  assert.match(route, /variant === "thumbnail" \? 320 : 1200/);
  assert.match(route, /fit:"inside",withoutEnlargement:true/);
  assert.match(route, /\.rotate\(\)/);
  assert.match(route, /mozjpeg:true/);
});

test("quick preview API selects lightweight fields and active evidence only", async () => {
  const route = await source("app/api/mobile/quality/previews/[kind]/[recordId]/route.ts");
  assert.match(route, /DEFECT_FIELDS/);
  assert.match(route, /ITEM_FIELDS/);
  assert.match(route, /deletion_pending/, "preview excludes deletion-pending photos");
  assert.match(route, /is_outdated/, "preview excludes outdated photos");
  assert.doesNotMatch(route, /select\("\*"\)/);
  assert.match(route, /shortDescription/);
  assert.match(route, /beforeFileId/);
  assert.match(route, /afterFileId/);
});

test("full image is requested only from an explicit photo action", async () => {
  const component = await source("mobile/components/quality/QualityQuickPreview.tsx");
  assert.match(component, /downloadQualityImageVariant\(projectId,fileId,fileName,"full"\)/);
  assert.match(component, /onPress=\{\(\)=>setPhoto/);
  assert.match(component, /contentFit="contain"/);
  assert.match(component, /Gesture\.Pinch/);
});

test("mobile preview caches are project and variant scoped", async () => {
  const api = await source("mobile/lib/api/quality.ts");
  assert.match(api, /quality-image:\$\{projectId\}:\$\{variant\}:\$\{fileId\}/);
  assert.match(api, /quality-quick-preview:\$\{projectId\}:\$\{kind\}:\$\{recordId\}/);
});
