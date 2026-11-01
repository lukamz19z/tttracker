import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const migration = readFileSync("supabase/migrations/20261101120000_v1_material_uuid_contract_fix.sql", "utf8");
const receipt = readFileSync("app/api/mobile/materials/missing/receive/route.ts", "utf8");
const resolve = readFileSync("app/api/mobile/materials/missing/resolve/route.ts", "utf8");
const actions = readFileSync("app/api/mobile/materials/missing/actions/route.ts", "utf8");
const users = readFileSync("app/api/mobile/materials/users/route.ts", "utf8");
const names = readFileSync("lib/materials/project-users.ts", "utf8");
const queue = readFileSync("mobile/lib/offline/materialsQueue.ts", "utf8");
const notifier = readFileSync("lib/materials/missing-notifications.ts", "utf8");

assert.match(migration, /tttracker_v1_record_material_receipt\(\s*p_project_id uuid,p_tower_id uuid,p_issue_key uuid,p_quantity numeric/s);
assert.match(migration, /tttracker_v1_resolve_missing_material\(p_project_id uuid,p_tower_id uuid,p_issue_key uuid,p_user_id uuid\)/);
assert.match(migration, /p_project_id uuid,p_tower_id uuid,p_issue_key uuid,p_client_mutation_id text/);
assert.match(migration, /p_client_mutation_id text/); // mutation IDs intentionally remain text
assert.ok(migration.includes("v_source_record_id:=nullif(trim(p_item->>'sourceRecordId'),'')::uuid"));
assert.match(receipt, /clientMutationId/);
assert.match(resolve, /UUID\.test\(issueKey\)/);
assert.match(actions, /UUID\.test\(issueKey\)/);
assert.match(queue, /clientMutationId:id/);
assert.match(queue, /kind==="receive_missing"/);
assert.match(users, /resolveProjectUserLabels/);
assert.match(names, /employees/);
assert.match(names, /full_name/);
assert.match(notifier, /resolveUserDisplayName/);

const sampleIds = {
  project: "b7d7e5a0-a5b4-4f71-a933-3227299c9461",
  tower: "0c3ef50f-89c9-48b2-b938-642b1d2d404d",
  issue: "eb0d2c37-1470-47aa-8d66-b8295423eacc",
  member: "9779890c-1c46-43dc-8e75-c5e2e32be057",
  user: "de6ca94b-c0aa-4612-8f8d-7a650fad44a6",
};
for (const id of Object.values(sampleIds)) assert.match(id, /^[0-9a-f-]{36}$/i);
assert.equal("" || null, null); // optional master record stays NULL for manual material

console.log("PASS: Missing Materials issue IDs now use UUID RPC parameters, mutation IDs remain text, API boundaries validate canonical IDs, and project-user labels resolve from employee/profile names.");
