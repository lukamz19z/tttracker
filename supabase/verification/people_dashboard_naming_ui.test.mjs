import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('People Overview uses real summary data and permission-gated actions', () => {
  const page = read('v2/components/people/people-client.tsx');
  assert.match(page, /Workforce, crews, training, onboarding and site readiness/);
  assert.match(page, /Quick Actions/);
  assert.match(page, /Needs Attention/);
  assert.match(page, /people\.create/);
  assert.match(page, /training\.approve/);
  assert.match(page, /people\.onboarding\.view/);
  assert.match(page, /area=prestarts/);
});

test('Training File Naming edits the canonical hierarchy and only offers resolver tokens', () => {
  const page = read('v2/components/people/people-document-naming.tsx');
  assert.match(page, /api\/integrations\/sharepoint\/workspace/);
  assert.match(page, /api\/people\/training-filename-default/);
  assert.match(page, /action, id: String\(editing\.row\.id\), data/);
  assert.match(page, /Training Default/);
  assert.match(page, /Category Overrides/);
  assert.match(page, /Training Type Overrides/);
  assert.match(page, /Preview/);
  assert.match(page, /Manage Storage/);
  assert.match(page, /DocumentTemplateBuilder/);
  assert.match(page, /training_type/);
  assert.match(page, /document_side/);
  assert.match(page, /Front \/ Back sides are not named/);
  assert.match(page, /namingStatusAttention/);
  assert.match(page, /Inherited from Organisation Default/);
  assert.match(page, /Add Document Side/);
  assert.match(page, /const context = typePreviewContext\(row\)/);
  assert.match(page, /training_type: String\(row\.name/);
  assert.match(page, /training_category: categoryName\(typeCategory\(row\)/);
  assert.match(page, /className=\{styles\.namingPreviewLines\}/);
  assert.match(page, /<span>Front<\/span>/);
  assert.match(page, /<span>Back<\/span>/);
  assert.match(page, /title=\{front\}/);
  assert.match(page, /title=\{back\}/);
  assert.doesNotMatch(page, /training_category: "First Aid", training_type: "CPR"/);
  const styles = read('v2/components/people/people.module.css');
  assert.match(styles, /\.namingTypeTable th:nth-child\(3\) \{ width: 35%; \}/);
  assert.match(styles, /\.namingTable tbody tr \{ display: grid/);
  assert.doesNotMatch(page, /People Document Naming|Current Name|Edit Name|supabase\.storage|v2_people_document_rules/);
});
