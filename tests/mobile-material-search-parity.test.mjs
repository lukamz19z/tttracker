import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("mobile member search calls the complete project-scoped register API instead of the empty bootstrap catalogue", async () => {
  const [web, mobile, route] = await Promise.all([
    read("app/(protected)/project/[projectId]/tower/[towerId]/materials/page.tsx"),
    read("mobile/components/materials/MaterialLiveSearch.tsx"),
    read("app/api/mobile/materials/search/route.ts"),
  ]);
  assert.match(web, /fetchAllMembers[\s\S]*\.eq\("tower_id", towerId\)[\s\S]*\.range\(from, from \+ pageSize - 1\)/);
  assert.match(web, /member\.mark_no, member\.bundle_reference, member\.drawing_number, member\.section, member\.tower_segment/);
  assert.match(mobile, /currentProjectId/);
  assert.match(mobile, /searchMaterials\(projectId, normalizedQuery, effectiveKind/);
  assert.match(mobile, /identity !== activeIdentity\.current/);
  assert.match(route, /\.from\("tower_material_members"\)/);
  assert.match(route, /\.in\("tower_id", towerIds\)/);
  for (const field of ["mark_no", "pn_final", "bundle_reference", "drawing_number", "section", "tower_segment"]) {
    assert.ok(route.includes(field), `server search should support ${field}`);
  }
  assert.doesNotMatch(mobile, /HumeLink East|P-HLE-26-003/);
});

test("mobile member search paginates deterministically beyond the former result cap", async () => {
  const [route, mobile, helper] = await Promise.all([
    read("app/api/mobile/materials/search/route.ts"),
    read("mobile/components/materials/MaterialLiveSearch.tsx"),
    read("mobile/lib/api/materials-search.ts"),
  ]);
  assert.match(route, /requestedOffset/);
  assert.match(route, /\.order\("mark_no"[\s\S]*\.range\(offset, offset \+ perKindLimit - 1\)/);
  assert.match(route, /nextOffset: hasMore \? offset \+ perKindLimit : null/);
  assert.match(helper, /offset: String\(Math\.max\(0, Math\.floor\(offset\)\)\)/);
  assert.match(mobile, /Load more results/);
  assert.match(mobile, /searchMaterials\(projectId, normalizedQuery, effectiveKind, limit, \{ towerId, memberField: effectiveMemberField \}, offset\)/);
});

test("search cache and bundle/bootstrap caches are separately keyed by project", async () => {
  const [search, bundle, materials] = await Promise.all([
    read("mobile/lib/api/materials-search.ts"),
    read("mobile/lib/api/materials-bundles.tsx"),
    read("mobile/lib/api/materials.ts"),
  ]);
  assert.match(search, /"materials:search",\s*projectId/);
  assert.match(search, /filters\.towerId/);
  assert.match(search, /String\(offset\)/);
  assert.match(bundle, /materials:bundle-members:\$\{projectId\}:\$\{bundleId\}/);
  assert.match(materials, /materials:v\$\{MATERIAL_CACHE_VERSION\}:\$\{projectId\}/);
  assert.match(materials, /operation: "bundles\.load"/);
  assert.match(bundle, /operation: "members\.by_bundle"/);
  assert.match(search, /operation: kind === "member" \? "members\.search"/);
});
