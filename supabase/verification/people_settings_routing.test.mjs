import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Settings People navigation opens the nested People Settings workspace', () => {
  const settingsShell = read('v2/components/workspace/settings-workspace-shell.tsx');
  const settingsLayout = read('v2/app/workspace/settings/layout.tsx');
  const settingsPage = read('v2/app/workspace/settings/page.tsx');
  const peopleLayout = read('v2/app/workspace/settings/people/layout.tsx');
  assert.match(settingsShell, /\/workspace\/settings\/people\?\$\{query\}/);
  assert.match(settingsShell, /inPeopleSettings/);
  assert.match(settingsShell, /label: "People"/);
  assert.match(settingsPage, /Open People Settings/);
  assert.match(settingsPage, /\/workspace\/settings\/people\?/);
  assert.match(settingsLayout, /label: "People"/);
  assert.match(peopleLayout, /requirePeopleContext/);
  assert.match(peopleLayout, /people\.configure/);
});

test('People Settings sections reuse canonical configuration pages without operational People shell', () => {
  const settingsPage = read('v2/components/people/people-settings-page.tsx');
  const documentsHub = read('v2/components/people/people-documents-hub.tsx');
  const peopleClient = read('v2/components/people/people-client.tsx');
  const navigation = read('v2/components/people/people-settings-navigation.tsx');
  assert.match(settingsPage, /settingsInWorkspace/);
  assert.match(read('v2/app/workspace/settings/people/onboarding/templates/page.tsx'), /section="templates"/);
  assert.match(settingsPage, /section === "documents"\) return <PeopleDocumentsHub/);
  assert.match(documentsHub, /Manage Training File Naming/);
  assert.match(documentsHub, /Manage SharePoint Storage/);
  assert.match(peopleClient, /!settingsInWorkspace && <>/);
  assert.match(navigation, /People settings sections/);
  assert.match(navigation, /Onboarding Templates/);
});

test('Onboarding templates are one click from operational Onboarding and directly deep-linkable', () => {
  const onboarding = read('v2/components/people/onboarding-admin.tsx');
  const route = read('v2/app/workspace/settings/people/onboarding/templates/page.tsx');
  const legacy = read('v2/app/workspace/people/settings/page.tsx');
  assert.match(onboarding, /Manage Templates/);
  assert.match(onboarding, /\/workspace\/settings\/people\/onboarding\/templates/);
  assert.match(route, /section="templates"/);
  assert.match(legacy, /redirect\(/);
  assert.match(legacy, /onboarding\/templates/);
  assert.doesNotMatch(onboarding, /router\.back\(\)/);
});
