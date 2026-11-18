import test from "node:test";
import assert from "node:assert/strict";
import { buildProjectRevisionStats, buildRevisionStats, keepAvailableOptions } from "../lib/quality/revision-stats.ts";

test("revision stats dynamically count issue types, sections and completed states", () => {
  const items = [
    { status: "Open", issue_type_id: "i1", tower_segment: "Upper", source_type: "manual" },
    { status: "Rectified", issue_type_id: "i1", tower_segment: "Upper", source_type: "manual" },
    { status: "Verified", issue_type_id: "i2", tower_segment: "Lower", source_type: "manual" },
    { status: "Open", issue_type_id: null, other_issue_text: "Custom category", tower_segment: "Lower", source_type: "manual" },
  ];
  const stats = buildRevisionStats(items, [{ id: "i1", name: "Configured issue A" }, { id: "i2", name: "Configured issue B" }]);
  assert.equal(stats.total, 4);
  assert.equal(stats.open, 2);
  assert.equal(stats.completed, 2);
  assert.deepEqual(stats.issueTypes.map(row => [row.label, row.count, row.percent]), [
    ["Configured issue A", 2, 50],
    ["Configured issue B", 1, 25],
    ["Custom category", 1, 25],
  ]);
  assert.deepEqual(stats.sections.map(row => [row.label, row.count, row.percent]), [["Lower", 2, 50], ["Upper", 2, 50]]);
  assert.equal(stats.mostCommonIssue?.label, "Configured issue A");
  assert.deepEqual(stats.statuses.map(row => [row.label, row.count, row.percent]), [["Open", 2, 50], ["Rectified", 1, 25], ["Verified", 1, 25]]);
});

test("revision stats use a zero-safe denominator", () => {
  const stats = buildRevisionStats([], [{ id: "unused", name: "Configured but unused" }]);
  assert.equal(stats.total, 0);
  assert.equal(stats.open, 0);
  assert.equal(stats.completed, 0);
  assert.equal(stats.mostCommonIssue, null);
  assert.deepEqual(stats.issueTypes, []);
  assert.deepEqual(stats.sections, []);
});

test("zero-count facets are hidden while a selected zero-count option remains available", () => {
  const options = [
    { value: "", count: 6 },
    { value: "Upper", count: 3 },
    { value: "Lower", count: 0 },
  ];
  assert.deepEqual(keepAvailableOptions(options, "").map(row => row.value), ["", "Upper"]);
  assert.deepEqual(keepAvailableOptions(options, "Lower").map(row => row.value), ["", "Upper", "Lower"]);
});

test("the same scoped item set produces equivalent client stats without category constants", () => {
  const scopedItems = [
    { status: "Open", issue_type_id: "configured-x", tower_segment: "Segment A" },
    { status: "Open", issue_type_id: "configured-y", tower_segment: "Segment B" },
  ];
  const issueTypes = [{ id: "configured-x", name: "Imported category" }, { id: "configured-y", name: "Another configured category" }];
  const webStats = buildRevisionStats(scopedItems, issueTypes);
  const mobileStats = buildRevisionStats(scopedItems, issueTypes);
  assert.deepEqual(mobileStats, webStats);
  assert.deepEqual(webStats.issueTypes.map(row => row.label), ["Another configured category", "Imported category"]);
});

test("project switching cannot display stats from a revision in the previous project", () => {
  const staleItems = [{ status: "Open", issue_type_id: "i", tower_segment: "Old project section" }];
  const stats = buildProjectRevisionStats(staleItems, "project-east", "project-west", [{ id: "i", name: "Configured issue" }]);
  assert.equal(stats.total, 0);
  assert.deepEqual(stats.sections, []);
  assert.deepEqual(stats.issueTypes, []);
});
