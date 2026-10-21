import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Training filename inheritance is Ticket, Category, organisation, then safe fallback", () => {
  const source = read("v2/lib/integrations/resolver.ts");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  new Function("require", "exports", code)((name) => name === "@/lib/people/document-rules" ? { sanitizePathPart: (value) => value } : {}, exports);
  const resolve = exports.resolveTrainingFilenameTemplate;
  assert.equal(resolve("ticket", "category", "organisation"), "ticket");
  assert.equal(resolve(null, "category", "organisation"), "category");
  assert.equal(resolve(" ", null, "organisation"), "organisation");
  assert.equal(resolve(null, null, ""), "{training_type}_{year}");
});

test("Training Ticket editor uses operational labels and only canonical resolver filename tokens", () => {
  const client = read("v2/components/people/people-client.tsx");
  const catalogue = read("v2/components/people/training-catalogue.tsx");
  const route = read("v2/app/api/people/route.ts");
  const service = read("v2/lib/documents/service.ts");
  assert.match(client, /Tickets \/ Training Types/);
  assert.match(client, /When new Training is completed/);
  assert.match(client, /Replace current record for the same Option \/ Class/);
  assert.match(client, /Custom for this Ticket/);
  assert.match(catalogue, /Custom for this Category/);
  assert.match(route, /training\.configure/);
  assert.match(service, /resolveTrainingFilenameTemplate/);
  assert.match(service, /v2_training_categories/);
});

test("Training filename overrides are additive fields on canonical catalogue records", () => {
  const migration = read("supabase/migrations/20261013170000_training_filename_inheritance.sql");
  assert.match(migration, /alter table public\.v2_training_categories\s+add column if not exists filename_template text/i);
  assert.match(migration, /alter table public\.v2_training_types\s+add column if not exists filename_template text/i);
  assert.doesNotMatch(migration, /create table/i);
  assert.match(migration, /organisation SharePoint Training destination template/i);
});

test("Rendered Training File Naming uses the three-level hierarchy and no legacy table", () => {
  const route = read("v2/app/workspace/people/training/configuration/page.tsx");
  const client = read("v2/components/people/people-client.tsx");
  const naming = read("v2/components/people/people-document-naming.tsx");
  assert.match(route, /section=|"file_naming"/);
  assert.match(client, /<PeopleDocumentNaming organisation=\{organisationId\} permissions=\{rights\}/);
  assert.match(client, /"file_naming",\s*"review_rules"/);
  for (const heading of ["Training Default", "Category Overrides", "Training Type Overrides", "Preview", "Document Storage", "Manage Storage"]) assert.match(naming, new RegExp(heading));
  for (const stale of ["People Document Naming", "Current Name", "Edit Name", "Training DocumentsTraining Documents", "Unable to complete this action. Check the details and try again."]) assert.doesNotMatch(naming, new RegExp(stale));
  assert.match(naming, /training-filename-default/);
  assert.match(naming, /action, id: String\(editing\.row\.id\), data/);
});

test("Training default naming save updates the central destination filename field under Training capability", () => {
  const route = read("v2/app/api/people/training-filename-default/route.ts");
  const service = read("v2/lib/documents/service.ts");
  assert.match(route, /training\.configure/);
  assert.match(route, /v2_document_destinations/);
  assert.match(route, /context", "training/);
  assert.match(service, /resolveTrainingFilenameTemplate\(training\.data\.filename_template, categoryTemplate, rule\.filename_template\)/);
  assert.match(service, /v2_training_categories/);
});
