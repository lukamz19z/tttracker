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

test("revision list photo action remains separate from the full issue action", async () => {
  const screen = await source("mobile/app/revisions/[revisionId].tsx");
  assert.match(screen, /onPhotos=\{\(\)=>void openFindingEvidence/);
  assert.match(screen, /onOpen=\{\(\)=>router\.push/);
  assert.doesNotMatch(screen, /QualityQuickPreview/);
  assert.doesNotMatch(screen, /QualityListThumbnail/);
  assert.match(screen, /content: <FieldFindingCard/);
});

test("mobile preview caches are project and variant scoped and photos use contain", async () => {
  const api = await source("mobile/lib/api/quality.ts");
  assert.match(api, /quality-image:\$\{projectId\}:\$\{variant\}:\$\{fileId\}/);
  const gallery = await source("mobile/components/quality/QualityEvidenceGallery.tsx");
  assert.match(gallery, /contentFit="contain"/);
  assert.match(gallery, /downloadQualityImageVariant\(photo\.file\.project_id,photo\.file\.id,photo\.file\.file_name,"full"\)/);
  assert.match(gallery, /Gesture\.Pinch/);
});
