import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const helperSource = await readFile(new URL("mobile/lib/materials/tower-filter.ts", root), "utf8");
const helperJs = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const helperExports = {};
new Function("exports", helperJs)(helperExports);
const { filterMaterialBundles, matchesMaterialTower, resolveMaterialTowerId } = helperExports;

const towers = [
  { id: "tower-a-id", name: "Tower 18", line: "T18", tower_number: "18" },
  { id: "tower-b-id", name: "Tower 29", line: "T29", tower_number: "29" },
  { id: "tower-c-id", name: "Tower 35", line: "T35", tower_number: "35" },
];
const bundles = [
  ...Array.from({ length: 10 }, (_, index) => ({ id: `a-${index}`, tower_id: "tower-a-id", bundle_no: index === 5 ? "6/1" : `${index + 1}/1`, section: index < 4 ? "Bottom Crossarm" : "Common Body" })),
  ...Array.from({ length: 15 }, (_, index) => ({ id: `b-${index}`, tower_id: "tower-b-id", bundle_no: index === 5 ? "6/1" : `${index + 1}/1`, section: index < 4 ? "Bottom Crossarm" : "Common Body" })),
  ...Array.from({ length: 8 }, (_, index) => ({ id: `c-${index}`, tower_id: "tower-c-id", bundle_no: `${index + 1}/1`, section: "Common Body" })),
];
const towerName = (id) => towers.find((tower) => tower.id === id)?.name ?? "Tower";
const select = (selectedTowerId, section = "", query = "") => filterMaterialBundles({
  bundles, selectedTowerId, towers, section, query, towerName,
});

test("canonical tower filter returns only the selected tower from the full project dataset", () => {
  assert.equal(bundles.length, 33);
  assert.equal(select("tower-b-id").length, 15);
  assert.ok(select("tower-b-id").every((row) => row.tower_id === "tower-b-id"));
  assert.equal(select("").length, bundles.length);
});

test("tower and section/search filters combine with AND, including duplicate bundle numbers", () => {
  const bySection = select("tower-b-id", "Bottom Crossarm");
  assert.equal(bySection.length, 4);
  assert.ok(bySection.every((row) => row.tower_id === "tower-b-id" && row.section === "Bottom Crossarm"));

  const bySearch = select("tower-b-id", "", "6/1");
  assert.deepEqual(bySearch.map((row) => row.id), ["b-5"]);
  assert.equal(select("tower-b-id", "Common Body", "6/1").length, 1);
});

test("route display labels resolve to canonical IDs and tower changes re-filter immediately", () => {
  assert.equal(resolveMaterialTowerId("Tower 29", towers), "tower-b-id");
  assert.equal(resolveMaterialTowerId("T35", towers), "tower-c-id");
  assert.deepEqual(select("tower-a-id").map((row) => row.tower_id).filter((id) => id !== "tower-a-id"), []);
  assert.ok(select("tower-b-id").every((row) => row.tower_id === "tower-b-id"));
});

test("bundle and member tower matching works offline using cached project records", async () => {
  assert.equal(matchesMaterialTower("tower-b-id", "tower-b-id", towers), true);
  assert.equal(matchesMaterialTower("tower-a-id", "tower-b-id", towers), false);
  assert.equal(matchesMaterialTower("tower-a-id", "", towers), true);
  const search = await readFile(new URL("mobile/components/materials/MaterialLiveSearch.tsx", root), "utf8");
  assert.match(search, /matchesMaterialTower\(rowTowerId, towerIdFilter, data\.towers \?\? \[\]\)/);
  assert.match(search, /if \(!towerMatches\(row\.tower_id\)\) continue/);
});

test("full-list UI stays virtualized with stable item keys and no pagination cap or Load More", async () => {
  const [screen, shell, bootstrap, context] = await Promise.all([
    readFile(new URL("mobile/app/materials/bundles.tsx", root), "utf8"),
    readFile(new URL("mobile/components/materials/MaterialsShell.tsx", root), "utf8"),
    readFile(new URL("app/api/mobile/materials/bootstrap/route.ts", root), "utf8"),
    readFile(new URL("mobile/contexts/MaterialsContext.tsx", root), "utf8"),
  ]);
  assert.match(screen, /filterMaterialBundles\(/);
  assert.match(screen, /towerId=\{selectedTowerId\}/);
  assert.match(screen, /group\.rows\.map\(\(bundle, index\)/);
  assert.match(screen, /ensureBundleMembers\(bundle\)/);
  assert.doesNotMatch(screen, /Load More|Load 6 more|visibleCount|nextOffset|hasMore/);
  assert.match(shell, /<FlatList data=\{items\}/);
  assert.match(shell, /item\.key != null/);
  assert.match(shell, /extraData=\{items\}/);
  assert.doesNotMatch(bootstrap, /BUNDLE_BOOTSTRAP_LIMIT|bundlePage|\.limit\(20\)/);
  assert.match(context, /bundles: \[\.\.\.data\.bundles\]\.sort\(compareBundles\)/);
});
