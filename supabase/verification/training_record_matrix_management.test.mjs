import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("V2 Training Matrix provides the V1 status and detailed modes with persisted selection", () => {
  const source = read("v2/components/people/people-operations.tsx");
  assert.match(source, /Status View/);
  assert.match(source, /Detailed View/);
  assert.match(source, /tttracker\.people\.matrix-view/);
  assert.match(source, /certificate_number/);
  assert.match(source, /expiry_date/);
  assert.match(source, /Matrix status legend/);
  assert.match(source, /aria-pressed=\{matrixView === "status"\}/);
  assert.match(source, /aria-pressed=\{matrixView === "detailed"\}/);
  assert.match(source, /area === "matrix" \? styles\.matrixFilters/);
  assert.match(source, /Open Training details/);
  assert.match(source, /No Training records match these filters/);
  const client = read("v2/components/people/people-client.tsx");
  assert.match(client, /peopleSettingsLink/);
  assert.match(client, /People Settings/);
  assert.doesNotMatch(client, /People & Onboarding Settings\s*<\/Link>/);
  const css = read("v2/components/people/people.module.css");
  assert.match(css, /\.matrixTable th:first-child,\s*\.matrixTable td:first-child\s*\{\s*position:\s*sticky/);
  assert.match(css, /\.matrixTable th\s*\{\s*position:\s*sticky;\s*top:\s*0/);
  assert.match(css, /nth-child\(even\)/);
  assert.match(css, /:focus-within/);
  assert.match(css, /\.matrixViewToggle button\[aria-pressed="true"\]/);
  assert.match(source, /<colgroup>/);
  assert.match(source, /matrixPersonColumn/);
  assert.match(source, /matrixTrainingColumn/);
  assert.match(css, /\.matrixTable\s*\{\s*width:\s*max-content;\s*min-width:\s*0;/);
  assert.doesNotMatch(css, /\.matrixTable\s*\{[^}]*min-width:\s*100%/);
  assert.match(css, /\.matrixPersonColumn\s*\{\s*width:\s*230px/);
  assert.match(css, /\.matrixTrainingColumn\s*\{\s*width:\s*170px/);
  assert.match(css, /height:\s*44px/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /\.matrixTableDetailed \.matrixTrainingColumn\s*\{\s*width:\s*190px/);
  assert.doesNotMatch(css, /\.matrix thead\s*\{\s*display:\s*none/);
});

test("Training option display is configurable and voided records leave competency calculations", () => {
  const migration = read("supabase/migrations/20261013164000_training_record_management_matrix.sql");
  const client = read("v2/components/people/people-client.tsx");
  assert.match(migration, /matrix_option_display in \('separate','combined'\)/);
  assert.match(migration, /voided_at is null/);
  assert.match(migration, /tttracker_v2_training_record_update/);
  assert.match(migration, /tttracker_v2_training_void/);
  assert.match(client, /Combine under Training Type/);
  assert.match(client, /Delete Record/);
});

test("Training configuration File Naming remains wired to the redesigned route component", () => {
  const source = read("v2/components/people/people-client.tsx");
  const naming = read("v2/components/people/people-document-naming.tsx");
  assert.match(source, /section === "file_naming"/);
  assert.match(naming, /Training Default/);
  assert.match(naming, /Category Overrides/);
  assert.match(naming, /Training Type Overrides/);
  assert.match(source, /"file_naming"/);
  const controls = read("v2/components/people/people-controls.tsx");
  assert.match(controls, /TRAINING_FILENAME_DEFAULT_NOT_CONFIGURED/);
  assert.match(controls, /Training default file naming could not be saved/);
});
