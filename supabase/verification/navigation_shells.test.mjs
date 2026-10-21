import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("People routes preserve workspace navigation and separate context levels", () => {
  const source = read("v2/components/people/people-client.tsx");
  assert.match(source, /WorkspaceHeading title="People"/);
  assert.match(source, /WorkspaceTabs items=\{peopleWorkspaceItems\}/);
  assert.match(source, /ContextTabs items=\{trainingNavItems\}/);
  assert.match(source, /ContextTabs items=\{profileNavItems\}/);
  assert.match(source, /ConfigurationLayout items=\{configNavItems\}/);
  assert.doesNotMatch(source, /Breadcrumbs items=\{\[\s*\{ label: "People", href: peopleHref\("overview"\) \},\s*\{ label: "Training"/);
  assert.match(source, /Breadcrumbs items=\{/);
  assert.match(source, /trainingContext = !personId/);
  assert.doesNotMatch(source, /<div className=\{styles\.moduleHeading\}><h2>Training<\/h2><\/div>/);
  assert.match(source, /aria-label="Configuration status"/);
  assert.doesNotMatch(source, /configurationSummary|<span>Manage<\/span>/);
  assert.doesNotMatch(source, /router\.back\(\)|history\.back\(\)/);
});

test("Settings nested routes inherit one permission-aware Settings shell", () => {
  const layout = read("v2/app/workspace/settings/layout.tsx");
  const shell = read("v2/components/workspace/settings-workspace-shell.tsx");
  assert.match(layout, /requireWorkspacePermission\(organisationId, "organisation\.settings\.view"\)/);
  assert.match(layout, /SettingsWorkspaceShell/);
  assert.match(shell, /WorkspaceHeading title="Settings"/);
  assert.match(shell, /WorkspaceTabs items=\{items\}/);
  assert.match(shell, /Breadcrumbs items=\{crumbs\}/);
  for (const route of ["integrations/page.tsx", "integrations/sharepoint/page.tsx", "integrations/xero/page.tsx"]) {
    assert.doesNotMatch(read(`v2/app/workspace/settings/${route}`), /BackLink/);
  }
});

test("global header remains owned by the workspace frame and nested layouts do not add one", () => {
  const workspace = read("v2/app/workspace/layout.tsx");
  const frame = read("v2/components/workspace/workspace-frame.tsx");
  const people = read("v2/components/people/people-client.tsx");
  const settings = read("v2/components/workspace/settings-workspace-shell.tsx");
  assert.match(workspace, /<WorkspaceFrame/);
  assert.match(frame, /<AppShell/);
  assert.doesNotMatch(people, /<header[^>]*global/i);
  assert.doesNotMatch(settings, /<header[^>]*global/i);
});

