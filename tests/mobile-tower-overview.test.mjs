import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("mobile tower overview orders summary, metrics, details, site summary and actions", async () => {
  const mobile = await read("mobile/app/(drawer)/tower-progress.tsx");
  const sections = [
    mobile.indexOf("<View style={styles.heroCard}>", mobile.indexOf("<Modal")),
    mobile.indexOf('<SectionCard title="Key Metrics">'),
    mobile.indexOf('<SectionCard title="Tower Details">'),
    mobile.indexOf('<SectionCard title="Site Summary">'),
    mobile.indexOf('<SectionCard title="Quick Actions">'),
  ];

  assert.ok(sections.every((index) => index >= 0));
  assert.deepEqual(sections, [...sections].sort((a, b) => a - b));
  assert.match(mobile, /<KeyMetric label="Raw MH\/t" value=\{formatMetric\(overviewStats\.rawMhPerTonne/);
  assert.match(mobile, /<KeyMetric label="Production MH\/t" value=\{formatMetric\(overviewStats\.productionMhPerTonne/);
  assert.match(mobile, /resolved\?\.rawMhPerTonne/);
  assert.match(mobile, /resolved\?\.productionMhPerTonne/);
  assert.match(mobile, /progress === null \? "—"/);
});

test("mobile overview does not show mismatched delivery quantity percentages as tower progress", async () => {
  const mobile = await read("mobile/app/(drawer)/tower-progress.tsx");
  assert.doesNotMatch(mobile, /Delivery Progress|Required Qty|Delivered Qty|outstandingBundles/);
  assert.match(mobile, /<SectionCard title="Quick Actions">/);
});
