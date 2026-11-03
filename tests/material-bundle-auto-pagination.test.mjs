import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("bootstrap returns all paged bundle rows and caches the complete response", async () => {
  const [route, api, context] = await Promise.all([
    readFile(new URL("app/api/mobile/materials/bootstrap/route.ts", root), "utf8"),
    readFile(new URL("mobile/lib/api/materials.ts", root), "utf8"),
    readFile(new URL("mobile/contexts/MaterialsContext.tsx", root), "utf8"),
  ]);
  assert.match(route, /paged\(\(from, to\) =>[\s\S]*?from\("tower_required_bundles"\)[\s\S]*?\.range\(from, to\)/);
  assert.doesNotMatch(route, /BUNDLE_BOOTSTRAP_LIMIT|bundlePage|\.limit\(20\)/);
  assert.match(route, /\bbundles,/);
  assert.match(api, /apiJson<MaterialPayload>\(`\/api\/mobile\/materials\/bootstrap\?projectId=/);
  assert.match(api, /await setCache\(materialCacheKey\(projectId\), snapshot\)/);
  assert.match(context, /compareBundles/);
});

test("Bundles renders all tower-filtered rows in a virtualized FlatList without Load More", async () => {
  const [screen, shell] = await Promise.all([
    readFile(new URL("mobile/app/materials/bundles.tsx", root), "utf8"),
    readFile(new URL("mobile/components/materials/MaterialsShell.tsx", root), "utf8"),
  ]);
  assert.doesNotMatch(screen, /Load More|Load 6 more|visibleCount|hasMore|nextOffset|bundlePages|onNearEnd/);
  assert.match(screen, /filterMaterialBundles\(/);
  assert.match(screen, /towerId=\{selectedTowerId\}/);
  assert.match(screen, /group\.rows\.map\(\(bundle, index\)/);
  assert.match(screen, /ensureBundleMembers\(bundle\)/);
  assert.match(shell, /<FlatList data=\{items\}/);
  assert.match(shell, /initialNumToRender=\{10\} windowSize=\{5\}/);
  assert.doesNotMatch(shell, /onEndReached|onNearEnd|Load More/);
});

test("53 loaded bundles are all available immediately and natural order spans the full list", () => {
  const records = Array.from({ length: 53 }, (_, index) => ({ id: `b-${index}`, bundle_no: `${Math.floor(index / 3) + 1}/${index % 3 + 1}` }));
  const allDisplayed = records.slice();
  assert.equal(allDisplayed.length, 53);
  assert.equal(allDisplayed.find((row) => row.bundle_no === "16/3")?.id, "b-47");
  assert.deepEqual(allDisplayed.slice(0, 6).map((row) => row.bundle_no), ["1/1", "1/2", "1/3", "2/1", "2/2", "2/3"]);
});

test("local bundle search finds records beyond item 20 and does not duplicate canonical IDs", () => {
  const records = Array.from({ length: 53 }, (_, index) => ({ id: `b-${index}`, bundle_no: `Bundle ${index + 1}` }));
  const search = records.filter((row) => row.bundle_no.toLowerCase().includes("bundle 45"));
  assert.equal(search[0]?.id, "b-44");
  const unique = new Map([...records, records[44]].map((row) => [row.id, row]));
  assert.equal(unique.size, 53);
});

test("offline cache stores the full bootstrap snapshot, while member details stay lazy", async () => {
  const [api, screen] = await Promise.all([
    readFile(new URL("mobile/lib/api/materials.ts", root), "utf8"),
    readFile(new URL("mobile/app/materials/bundles.tsx", root), "utf8"),
  ]);
  assert.match(api, /const snapshot = \{ \.\.\.raw, members: cached\?\.value\.members \|\| \[\], bolts: cached\?\.value\.bolts \|\| \[\] \}/);
  assert.match(api, /setCache\(materialCacheKey\(projectId\), snapshot\)/);
  assert.match(screen, /if \(!force && Object\.prototype\.hasOwnProperty\.call\(packMembersByBundleId, bundleId\)\)/);
  assert.match(screen, /loadBundleMembers\(/);
});
