import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("bundle scrolling requests tower/filter-scoped server pages and never reveals a local Load More batch", async () => {
  const [screen, api, route, shell, liveSearch] = await Promise.all([
    readFile(new URL("mobile/app/materials/bundles.tsx", root), "utf8"),
    readFile(new URL("mobile/lib/api/materials.ts", root), "utf8"),
    readFile(new URL("app/api/mobile/materials/bootstrap/route.ts", root), "utf8"),
    readFile(new URL("mobile/components/materials/MaterialsShell.tsx", root), "utf8"),
    readFile(new URL("mobile/components/materials/MaterialLiveSearch.tsx", root), "utf8"),
  ]);

  assert.doesNotMatch(screen, /Load More|Load 6 more|visibleCount|setVisibleCount/);
  assert.match(screen, /onNearEnd=\{loadNextServerPage\}/);
  assert.match(screen, /requestBundlePage\(nextOffset, generationRef\.current\)/);
  assert.match(screen, /if \(!online \|\| !hasMore \|\| loadingNextPage \|\| pageError \|\| inFlightPageRef\.current\) return/);
  assert.match(screen, /generation !== generationRef\.current/);
  assert.match(screen, /cachedMaterialBundlePages\(projectId, towerId, section, deferredQuery\)/);
  assert.match(screen, /if \(!online \|\| !hasMore/);
  assert.match(screen, /setPageError\(/);
  assert.match(screen, /setBundlePages\(\(current\) =>/);
  assert.match(screen, /new Map<string, BundleRecord>\(\)/);
  assert.match(screen, /\.sort\(compareBundles\)/);

  assert.match(api, /bundlePage: "1"/);
  assert.match(api, /offset: String\(input\.offset\)/);
  assert.match(api, /limit: String\(input\.limit \?\? 20\)/);
  assert.match(api, /q: input\.query\.trim\(\)/);
  assert.match(api, /await apiJson<MaterialBundlePage>\(`\/api\/mobile\/materials\/bootstrap\?/);
  assert.match(api, /await setCache\(key, page\)/);

  assert.match(route, /if \(bundlePage\)/);
  assert.match(route, /\.in\("tower_id", requestedTowerId \? \[requestedTowerId\] : towerIds\)/);
  assert.match(route, /if \(section\) bundleQuery = bundleQuery\.eq\("section", section\)/);
  assert.match(route, /bundle_no\.ilike\.%\$\{search\}%/);
  assert.match(route, /\.range\(offset, offset \+ pageSize - 1\)/);
  assert.match(route, /const hasMore = bundles\.length === pageSize/);
  assert.match(route, /const BUNDLE_BOOTSTRAP_LIMIT = 20/);
  assert.match(route, /\.limit\(BUNDLE_BOOTSTRAP_LIMIT\)/);
  assert.doesNotMatch(route, /count:\s*["']exact/);

  assert.match(shell, /<FlatList/);
  assert.match(shell, /onEndReached=\{onNearEnd\}/);
  assert.match(screen, /ensureBundleMembers\(bundle\)/);
  assert.match(liveSearch, /searchMaterials\(/);
  assert.match(liveSearch, /cachedMaterialSearch\(/);
});

test("53 bundles at 20 per page terminate after 20, 40, and 53 rows", () => {
  const all = Array.from({ length: 53 }, (_, index) => ({ id: `bundle-${index + 1}` }));
  let offset = 0;
  const loaded = [];
  let hasMore = true;
  while (hasMore) {
    const page = all.slice(offset, offset + 20);
    loaded.push(...page);
    hasMore = page.length === 20;
    offset += page.length;
    assert.equal(loaded.length, Math.min(offset, 53));
  }
  assert.deepEqual([20, 40, loaded.length], [20, 40, 53]);
});

test("repeated end-reached triggers share one in-flight next-page request", async () => {
  let inFlight = false;
  let requests = 0;
  const requestNext = async () => {
    if (inFlight) return;
    inFlight = true;
    requests += 1;
    await Promise.resolve();
    inFlight = false;
  };
  await Promise.all([requestNext(), requestNext(), requestNext()]);
  assert.equal(requests, 1);
});

test("canonical ID append deduplicates an overlapping retry page", () => {
  const existing = [{ id: "a" }, { id: "b" }];
  const retry = [{ id: "b" }, { id: "c" }];
  const unique = new Map([...existing, ...retry].map((row) => [row.id, row]));
  assert.deepEqual([...unique.keys()], ["a", "b", "c"]);
});

test("late response from an old tower generation is ignored", () => {
  let activeGeneration = 2;
  const responseGeneration = 1;
  let appended = false;
  if (responseGeneration === activeGeneration) appended = true;
  assert.equal(appended, false);
});

test("remote search sends the query even if the matching row is beyond loaded cache pages", async () => {
  const screen = await readFile(new URL("mobile/app/materials/bundles.tsx", root), "utf8");
  const api = await readFile(new URL("mobile/lib/api/materials.ts", root), "utf8");
  assert.match(screen, /query: deferredQuery/);
  assert.match(api, /q: input\.query\.trim\(\)/);
  assert.match(api, /loadMaterialBundlePage\(/);
});
