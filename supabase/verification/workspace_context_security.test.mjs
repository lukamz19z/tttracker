import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const dependency = createRequire(import.meta.url);
import { test,before,after  } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const { PGlite } = dependency(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read = (f) => fs.readFileSync(path.join(root,"supabase/migrations",f),"utf8");
const rbac = read("20260927054309_access_permission_engine.sql");
const entitlement = read("20260927060739_feature_subscription_entitlements.sql");
const migration = read("20261004060000_workspace_navigation_context.sql");
function table(sql,name) {
 const match = sql.match(new RegExp(`create table if not exists public\\.${name} \\([\\s\\S]*?\\n\\);`));
 assert.ok(match,name);return match[0];
}
function fn(sql,name) {
 const match=sql.match(new RegExp(`create or replace function (?:private|public)\\.${name}\\([\\s\\S]*?\\$\\$;`));assert.ok(match,name);return match[0];
}
const id=(n)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
let db;
async function context(user=1,org=10) {
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(user)]);
 return (await db.query("select public.tttracker_v2_workspace_access($1) as access",[id(org)])).rows[0].access;
}
before(async () => {
 db = new PGlite();
 await db.exec(`create schema auth; create schema private; create role anon; create role authenticated;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key);create table organisations(id uuid primary key);
 create table organisation_users(organisation_id uuid,user_id uuid,status text);
 create table organisation_modules(organisation_id uuid,module_key text,enabled boolean);
 create table v2_section_definitions(section_key text primary key,scope text,label text,route_segment text,module_key text,icon_key text,sort_order int,implementation_status text,default_enabled boolean);
 insert into v2_section_definitions values('workspace_people','workspace','People','people','people','users',30,'planned',false);
 insert into auth.users values('${id(1)}'),('${id(2)}'),('${id(3)}');insert into organisations values('${id(10)}'),('${id(11)}');
 insert into organisation_users values('${id(10)}','${id(1)}','active'),('${id(11)}','${id(2)}','active');`);
 for (const name of ["v2_resources","v2_permissions","v2_roles","v2_role_permissions","v2_user_role_assignments","v2_user_permission_overrides"]) await db.exec(table(rbac,name));
 for (const name of ["v2_features","v2_subscription_plans","v2_subscription_plan_versions","v2_subscription_plan_entitlements","v2_organisation_subscriptions","v2_organisation_entitlement_overrides"]) await db.exec(table(entitlement,name));
 await db.exec(fn(read("20260926120515_organisation_foundation_actual.sql"),"tttracker_v2_is_organisation_member"));
 await db.exec(fn(rbac,"tttracker_v2_has_permission"));
 await db.exec(fn(entitlement,"tttracker_v2_get_entitlement"));await db.exec(fn(entitlement,"tttracker_v2_has_feature"));
 await db.exec(migration);
 await db.exec(`insert into v2_resources(id,resource_key,name) values('${id(20)}','people','People');
 insert into v2_permissions(id,resource_id,permission_code,action_key,name) values('${id(21)}','${id(20)}','people.view','view','View People');
 insert into v2_roles(id,organisation_id,code,name) values('${id(22)}','${id(10)}','configurable','Configurable role');
 insert into v2_role_permissions(organisation_id,role_id,permission_id,allowed) values('${id(10)}','${id(22)}','${id(21)}',true);
 insert into v2_user_role_assignments(organisation_id,user_id,role_id) values('${id(10)}','${id(1)}','${id(22)}');
 insert into v2_features(id,feature_key,name,lifecycle_status) values('${id(30)}','people','People','available'),('${id(31)}','assets','Assets','available');
 insert into organisation_modules values('${id(10)}','people',true),('${id(10)}','assets',true);
 insert into v2_organisation_entitlement_overrides(organisation_id,feature_id,enabled) values('${id(10)}','${id(30)}',true);`);
});
after(async () => { await db.close(); });
test("member receives only effective dynamic grants and entitled enabled modules",async () => {
 const access=await context();assert.equal(access.permissions['people.view'],true);assert.deepEqual(access.modules,['people']);
});
test("unrelated organisation cannot resolve workspace permissions",async () => {
 await assert.rejects(context(1,11),/WORKSPACE_ORGANISATION_ACCESS_DENIED/);
});
test("platform-only identity has no tenant membership bypass",async () => {
 await assert.rejects(context(3,10),/WORKSPACE_ORGANISATION_ACCESS_DENIED/);
});
test("explicit deny wins over role grant",async () => {
 await db.exec(`insert into v2_user_permission_overrides(organisation_id,user_id,permission_id,effect) values('${id(10)}','${id(1)}','${id(21)}','deny')`);
 assert.equal((await context()).permissions['people.view'],false);
 await db.exec(`delete from v2_user_permission_overrides where user_id='${id(1)}' and permission_id='${id(21)}'`);
});
test("module disabled in tenant configuration is excluded even when entitled",async () => {
 await db.exec(`update organisation_modules set enabled=false where organisation_id='${id(10)}' and module_key='people'`);
 assert.deepEqual((await context()).modules,[]);
 await db.exec(`update organisation_modules set enabled=true where organisation_id='${id(10)}' and module_key='people'`);
});
test("disabled lifecycle wins over enabled commercial override",async () => {
 await db.exec(`update v2_features set lifecycle_status='disabled' where id='${id(30)}'`);
 assert.deepEqual((await context()).modules,[]);
 await db.exec(`update v2_features set lifecycle_status='available' where id='${id(30)}'`);
});
test("switching organisation recalculates permissions and modules",async () => {
 const next=await context(2,11);assert.equal(next.permissions['people.view'],false);assert.deepEqual(next.modules,[]);
});
test("anonymous RPC execution is not granted",async () => {
 const result=(await db.query("select has_function_privilege('anon','public.tttracker_v2_workspace_access(uuid)','execute') as anon,has_function_privilege('authenticated','public.tttracker_v2_workspace_access(uuid)','execute') as authenticated")).rows[0];
 assert.equal(result.anon,false);assert.equal(result.authenticated,true);
});
test("migration is repeatable and seeds only foundation section definitions",async () => {
 await db.exec(migration);const rows=(await db.query("select section_key from v2_section_definitions order by section_key")).rows;
 assert.deepEqual(rows.map(r=>r.section_key),['workspace_assets','workspace_people']);
 assert.equal((await db.query("select count(*)::int as n from v2_role_permissions")).rows[0].n,1);
});
