import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Add Training follows staged V1 hierarchy with a labeled summary and visible option chips", () => {
  const source = read("v2/components/people/people-operations.tsx");
  const upload = source.slice(source.indexOf("export function TrainingUpload("));
  for (const label of ["1. Person", "2. Training Type", "3. Record Details", "4. Evidence", "Submission Summary"]) assert.match(upload, new RegExp(label.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")));
  assert.match(upload, /trainingOptionChips/);
  assert.match(upload, /trainingOptionChipSelected/);
  assert.match(upload, /Search classes/);
  assert.match(upload, /Front of Licence/);
  assert.match(upload, /Back of Licence/);
  assert.match(upload, /Also record from this evidence/);
  assert.match(upload, /Automatically calculated from this Training Type/);
  assert.match(upload, /SubmissionSummaryRow label="Person"/);
  assert.match(upload, /SubmissionSummaryRow label="Training"/);
  assert.match(upload, /SubmissionSummaryRow label="Options \/ Classes"/);
  assert.match(upload, /SubmissionSummaryRow label="Review"/);
  assert.match(upload, /area=training_replacement/);
  assert.match(upload, /What will happen/);
  assert.match(upload, /Existing Training/);
  assert.match(upload, /Replace matching current record/);
  assert.match(upload, /Add alongside current record/);
  assert.match(upload, /SubmissionSummaryRow label="Record Outcome"/);
  assert.match(upload, /replacement_mode: replacementMode/);
  assert.match(upload, /The current record remains active until the replacement is approved/);
  assert.match(upload, /Submit Training Record/);
  const recordDetail = read("v2/components/people/people-client.tsx");
  assert.match(recordDetail, /<h3>Record Details<\/h3>/);
  for (const label of ["Person", "Training Type", "Option / Class", "Certificate / Licence Number", "Issue Date", "Expiry Date", "Review"]) assert.ok(recordDetail.includes(`<dt>${label}</dt>`), `${label} is explicitly labeled in record detail`);
});

test("Matrix Status is compact and Detailed uses configuration-driven grouped subcolumns", () => {
  const source = read("v2/components/people/people-operations.tsx");
  const css = read("v2/components/people/people.module.css");
  assert.match(source, /<th scope="colgroup"[\s\S]*colSpan=\{group\.fields\.length\}/);
  assert.match(source, /matrixSubheaderRow/);
  assert.match(source, /label: "Class \/ Ticket"/);
  assert.match(source, /label: "Number"/);
  assert.match(source, /label: "Expiry"/);
  assert.match(source, /label: "Status"/);
  assert.match(source, /<State state=\{status\} compact \/>/);
  assert.match(source, /matrixNotApplicable/);
  assert.match(source, /state === "expired"\s*\? XCircle/);
  assert.match(source, /state === "expiring"\s*\? Clock/);
  assert.match(source, /matrixValueList/);
  assert.match(source, /Employees Shown/);
  assert.match(source, /Required Competencies Shown/);
  assert.match(css, /\.matrixTable:not\(\.matrixTableDetailed\) \.matrixStatusColumn\s*\{\s*width:\s*96px/);
  assert.match(css, /\.matrixSummary/);
});

test("People Settings is a permission-gated workspace action rather than a loose footer link", () => {
  const source = read("v2/components/people/people-client.tsx");
  assert.match(source, /peopleSettingsLink/);
  assert.match(source, /People Settings/);
  assert.match(source, /allowed\("people.configure"\) \|\| allowed\("training.configure"\)/);
  assert.doesNotMatch(source, /People & Onboarding Settings\s*<\/Link>/);
});
