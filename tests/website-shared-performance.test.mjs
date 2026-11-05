import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("website access is shared by Home and Training without another access API call", async () => {
  const [provider, home, training, root] = await Promise.all([
    read("components/access/access-provider.tsx"),
    read("app/(protected)/page.tsx"),
    read("app/(protected)/people/training/page.tsx"),
    read("app/page.tsx"),
  ]);
  assert.match(provider, /resilientFetch\("\/api\/access\/me"/);
  assert.doesNotMatch(home, /fetch\("\/api\/access\/me"/);
  assert.doesNotMatch(training, /fetch\("\/api\/access\/me"|auth\.getSession\(/);
  assert.match(root, /<AccessProvider><ProjectsPage \/><\/AccessProvider>/);
  assert.match(home, /useAccess\(\)/);
  assert.match(training, /useAccess\(\)/);
  assert.match(provider, /activeUserIdRef\.current !== session\.user\.id/);
  assert.match(provider, /activeUserIdRef\.current !== \(nextSession\?\.user\.id \?\? null\)/);
});

test("shared website role is read once, concurrently with access, and navigation consumes it", async () => {
  const [provider, topbar, project, towers, sidebar] = await Promise.all([
    read("components/access/access-provider.tsx"), read("components/layout/topbar.tsx"),
    read("app/(protected)/project/[projectId]/page.tsx"),
    read("app/(protected)/project/[projectId]/towers/page.tsx"),
    read("components/layout/sidebar.tsx"),
  ]);
  assert.match(provider, /Promise\.all\(\[\s*resilientFetch\("\/api\/access\/me"/);
  assert.match(provider, /from\("user_roles"\)/);
  for (const source of [topbar, project, towers]) {
    assert.match(source, /websiteRole/);
    assert.doesNotMatch(source, /getUserRole\(|auth\.getUser\(/);
  }
  assert.match(sidebar, /Promise\.all\(\[/);
});

test("project and tower loaders scope docket-linked data and keep core reads concurrent", async () => {
  const [project, tower] = await Promise.all([
    read("app/(protected)/project/[projectId]/page.tsx"),
    read("app/(protected)/project/[projectId]/tower/[towerId]/page.tsx"),
  ]);
  assert.match(project, /Promise\.all\(\[\s*supabase\.from\("projects"\)/);
  assert.match(project, /\.in\("docket_id", ids\)/);
  assert.ok(project.indexOf("setLoading(false);", project.indexOf("const loadedDockets =")) < project.indexOf("let loadedLabourRows", project.indexOf("const loadedDockets =")));
  assert.match(tower, /Array\.isArray\(filter\.value\)/);
  for (const table of ["tower_docket_labour", "tower_docket_delays", "tower_docket_plant"]) {
    const at = tower.indexOf(`"${table}"`, tower.indexOf("const docketIds = docketData.map"));
    assert.ok(at > 0, `${table} must be read in the docket phase`);
    assert.match(tower.slice(at, at + 290), /docketIds/);
  }
});

test("generic path authorization remains in proxy and development traces link browser to server", async () => {
  const [proxy, layout, access] = await Promise.all([
    read("proxy.ts"), read("app/(protected)/layout.tsx"), read("app/api/access/me/route.ts"),
  ]);
  assert.match(proxy, /"user_can_access_path"/);
  assert.match(proxy, /next-router-prefetch/);
  assert.match(proxy, /x-tttracker-web-trace/);
  assert.match(layout, /x-tttracker-web-trace/);
  assert.match(access, /x-tttracker-trace/);
});

test("Tower Overview passes its computed summary to TowerHeader so the child skips duplicate reads", async () => {
  const [tower, header] = await Promise.all([
    read("app/(protected)/project/[projectId]/tower/[towerId]/page.tsx"),
    read("components/towers/TowerHeader.tsx"),
  ]);
  assert.match(tower, /<TowerHeader[^>]+summary=\{\{/);
  assert.match(header, /if \(!towerId \|\| summary\) return/);
  assert.match(header, /summary\?\.openDefects \?\? fetchedOpenDefects/);
  assert.match(header, /summary\?\.deliveryProgress \?\? fetchedDeliveryProgress/);
});

test("Assets dashboard traces browser headers and parse against server auth and DB phases", async () => {
  const [page, route] = await Promise.all([
    read("app/(protected)/assets/page.tsx"), read("app/api/assets/dashboard/route.ts"),
  ]);
  assert.match(page, /X-TTTracker-Trace/);
  assert.match(page, /assets_response_headers/);
  assert.match(page, /assets_json_parsed/);
  assert.match(route, /mark\("auth_identity"/);
  assert.match(route, /mark\("dashboard_queries"/);
  assert.match(route, /mark\("total"/);
});

test("Workpack uploader identity uses the current browser session for display", async () => {
  const page = await read("app/(protected)/project/[projectId]/tower/[towerId]/workpack/(modules)/documents/page.tsx");
  assert.match(page, /auth\.getSession\(\)/);
  assert.doesNotMatch(page, /auth\.getUser\(\)/);
  assert.match(page, /from\("tower_workpack_documents"\)/);
});
