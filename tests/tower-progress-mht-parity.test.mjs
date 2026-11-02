import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("mobile Tower Progress uses resolved progress and the website Tower header MH/t denominator", async () => {
  const [route, context, website, mobile] = await Promise.all([
    read("app/api/mobile/tower-progress/route.ts"),
    read("lib/dockets/mobile-progress-context.ts"),
    read("components/towers/TowerHeader.tsx"),
    read("mobile/app/(drawer)/tower-progress.tsx"),
  ]);
  assert.match(context, /\.is\("deleted_at", null\)/);
  assert.match(route, /docket\.tower_id === towerId/);
  assert.match(route, /weight \* \(row\.totalProgressPercent \/ 100\)/);
  assert.match(route, /rawHours \/ completedTonnes/);
  assert.match(route, /productionHours \/ completedTonnes/);
  assert.match(website, /towerWeightTonnes \* \(overallProgress \/ 100\)/);
  assert.match(website, /totalHours \/ completedTonnes/);
  assert.match(mobile, /resolvedProgress\[item\.id\]\?\.rawMhPerTonne/);
  assert.match(mobile, /AsyncStorage\.setItem\(progressCacheKey/);
});
