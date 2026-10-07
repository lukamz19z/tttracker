import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const dependency=createRequire(import.meta.url);
const {PGlite}=dependency(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=(name)=>fs.readFileSync(path.join(root,"supabase/migrations",name),"utf8");
const id=(n)=>`00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
const table=(sql,name)=>sql.match(new RegExp(`create table if not exists public\\.${name} \\([\\s\\S]*?\\n\\);`))[0];
const fn=(sql,name)=>sql.match(new RegExp(`create or replace function (?:private|public)\\.${name}\\([\\s\\S]*?\\$\\$;`))[0];
let db;
const migration=read("20261004090000_organisation_invitation_provisioning.sql");
async function platform(action,org=10,role=null,email=null,invite=null,actor=1) {
 return (await db.query("select public.tttracker_v2_platform_invitation($1,$2,$3,$4,$5,$6) result",[id(actor),action,id(org),role,email,invite])).rows[0].result;
}
async function accept(invite,user=2) {
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(user)]);
 return (await db.query("select public.tttracker_v2_accept_organisation_invitation($1) result",[invite])).rows[0].result;
}
async function invite(email="new@example.test",org=10) {
 const role=(await platform("bootstrap",org)).roleId;
 return (await platform("create",org,role,email)).invitationId;
}
before(async()=>{
 db=new PGlite();
 await db.exec(`create schema auth; create schema private; create role anon; create role authenticated; create role service_role;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 insert into auth.users values('${id(1)}','operator@example.test',now()),('${id(2)}','new@example.test',now()),('${id(3)}','other@example.test',now());`);
 const foundation=read("20260926120515_organisation_foundation_actual.sql"),rbac=read("20260927054309_access_permission_engine.sql"),platformSQL=read("20260927055944_platform_admin_foundation.sql");
 for(const name of ["organisations","organisation_users"]) await db.exec(table(foundation,name));
 for(const name of ["v2_resources","v2_permissions","v2_roles","v2_role_permissions","v2_user_role_assignments","v2_user_permission_overrides"]) await db.exec(table(rbac,name));
 for(const name of ["v2_platform_admins","v2_organisation_invitations"]) await db.exec(table(platformSQL,name));
 await db.exec(read("20260927103336_invitation_delivery.sql").split("create table")[0]);
 await db.exec(table(read("20260928101620_tenant_setup_framework.sql"),"v2_organisation_setup_state"));
 await db.exec(fn(foundation,"tttracker_v2_is_organisation_member"));
 await db.exec(fn(rbac,"tttracker_v2_has_permission"));
 await db.exec(fn(rbac,"tttracker_v2_validate_user_role_org"));
 await db.exec(`create trigger validate_assignment before insert or update on v2_user_role_assignments for each row execute function private.tttracker_v2_validate_user_role_org();
 insert into organisations(id,code,name) values('${id(10)}','NEUTRAL','Neutral organisation'),('${id(11)}','OTHER','Other organisation');
 insert into v2_platform_admins(user_id) values('${id(1)}');
 insert into v2_resources(id,resource_key,name) values('${id(20)}','organisation','Organisation');
 insert into v2_permissions(id,resource_id,permission_code,action_key,name) values('${id(21)}','${id(20)}','organisation.settings.configure','manage','Manage settings');`);
 await db.exec(migration);
});
after(async()=>db.close());
test("operator invites non-member and stores canonical role without premature access",async()=>{
 const invitationId=await invite();
 const row=(await db.query("select intended_role_id,status from v2_organisation_invitations where id=$1",[invitationId])).rows[0];
 assert.ok(row.intended_role_id); assert.equal(row.status,"pending");
 assert.equal((await db.query("select count(*)::int n from organisation_users")).rows[0].n,0);
});
test("acceptance activates membership then assigns role; dynamic settings permission resolves",async()=>{
 const row=(await db.query("select id from v2_organisation_invitations where email='new@example.test' and organisation_id=$1",[id(10)])).rows[0];
 await accept(row.id);
 assert.equal((await db.query("select status from organisation_users where user_id=$1",[id(2)])).rows[0].status,"active");
 assert.equal((await db.query("select private.tttracker_v2_has_permission($1,'organisation.settings.configure') allowed",[id(10)])).rows[0].allowed,true);
});
test("repeat acceptance creates no duplicate membership or role assignment",async()=>{
 const row=(await db.query("select id from v2_organisation_invitations where email='new@example.test' and organisation_id=$1",[id(10)])).rows[0];
 assert.equal((await accept(row.id)).alreadyAccepted,true);
 assert.equal((await db.query("select count(*)::int n from organisation_users where user_id=$1",[id(2)])).rows[0].n,1);
 assert.equal((await db.query("select count(*)::int n from v2_user_role_assignments where user_id=$1",[id(2)])).rows[0].n,1);
 await assert.rejects(invite(),/ALREADY_ACTIVE/);
});
test("duplicate pending email is rejected; resend preserves intended role",async()=>{
 const i=await invite("other@example.test");
 await assert.rejects(invite("other@example.test"),/ALREADY_PENDING/);
 await platform("resend",10,null,null,i);
 assert.equal((await db.query("select status from v2_organisation_invitations where id=$1",[i])).rows[0].status,"pending");
});
test("non-platform user cannot provision a tenant",async()=>{
 await assert.rejects(platform("bootstrap",10,null,null,null,3),/PLATFORM_ACCESS_DENIED/);
});
test("wrong authenticated recipient cannot accept",async()=>{
 const i=(await db.query("select id from v2_organisation_invitations where email='other@example.test' and status='pending'")).rows[0].id;
 await assert.rejects(accept(i,2),/ACCESS_DENIED/);
});
test("revoked invitation cannot be accepted and revoking does not remove legitimate roles",async()=>{
 const i=(await db.query("select id from v2_organisation_invitations where email='other@example.test' and status='pending'")).rows[0].id;
 await platform("revoke",10,null,null,i);
 await assert.rejects(accept(i,3),/NOT_PENDING/);
 assert.equal((await db.query("select count(*)::int n from v2_user_role_assignments")).rows[0].n,1);
});
test("expired invitation requires resend before acceptance",async()=>{
 const i=await invite("other@example.test",11);
 await db.query("update v2_organisation_invitations set expires_at=now()-interval '1 day' where id=$1",[i]);
 await assert.rejects(accept(i,3),/EXPIRED/);
 await platform("resend",11,null,null,i);
 await accept(i,3);
});
test("existing role deny and completed tenant setup survive acceptance and bootstrap",async()=>{
 const role=(await platform("bootstrap",10)).roleId;
 await db.query("update v2_role_permissions set allowed=false where role_id=$1",[role]);
 await db.query("update v2_organisation_setup_state set status='completed' where organisation_id=$1",[id(10)]);
 await platform("bootstrap",10);
 const i=await invite("other@example.test");
 await accept(i,3);
 assert.equal((await db.query("select private.tttracker_v2_has_permission($1,'organisation.settings.configure') allowed",[id(10)])).rows[0].allowed,false);
 assert.equal((await db.query("select status from v2_organisation_setup_state where organisation_id=$1",[id(10)])).rows[0].status,"completed");
});
test("role from another organisation is rejected",async()=>{
 const role=(await platform("bootstrap",11)).roleId;
 await assert.rejects(platform("create",10,role,"unknown@example.test"),/ROLE_NOT_AVAILABLE/);
});
test("late assignment failure rolls back membership and acceptance",async()=>{
 await db.exec(`insert into auth.users values('${id(4)}','rollback@example.test',now());
 create function private.fail_test() returns trigger language plpgsql as $$begin if new.user_id='${id(4)}' then raise exception 'forced late failure'; end if; return new; end$$;
 create trigger fail_late before insert on v2_user_role_assignments for each row execute function private.fail_test();`);
 const i=await invite("rollback@example.test");
 await assert.rejects(accept(i,4),/forced late failure/);
 assert.equal((await db.query("select count(*)::int n from organisation_users where user_id=$1",[id(4)])).rows[0].n,0);
 assert.equal((await db.query("select status from v2_organisation_invitations where id=$1",[i])).rows[0].status,"pending");
});
test("RPC execution grants do not expose platform provisioning to browser sessions",async()=>{
 assert.equal((await db.query("select has_function_privilege('authenticated','public.tttracker_v2_platform_invitation(uuid,text,uuid,uuid,text,uuid)','execute') allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('anon','public.tttracker_v2_accept_organisation_invitation(uuid)','execute') allowed")).rows[0].allowed,false);
});

test("newly invited administrator receives project scope without reseeding custom permissions",async()=>{
 await db.exec(`create table v2_projects(id uuid primary key,organisation_id uuid,status text);
 create table v2_project_users(project_id uuid,organisation_id uuid,user_id uuid,status text);
 insert into v2_resources(resource_key,name) values('projects','Projects');`);
 await db.exec(fn(read('20261002051838_contractor_project_parties.sql'),'tttracker_v2_is_active_org_member'));
 await db.exec(read('20261004110000_organisation_project_access_scope.sql'));
 await db.exec(`insert into organisations(id,code,name) values('${id(800)}','INVITED','Invited organisation');
 insert into v2_projects values('${id(801)}','${id(800)}','active'),('${id(802)}','${id(800)}','active');`);
 const role=(await platform('bootstrap',800)).roleId;
 const invitation=(await platform('create',800,role,'other@example.test')).invitationId;
 await accept(invitation,3);
 await accept(invitation,3);
 assert.equal((await db.query('select private.tttracker_v2_is_project_member($1) allowed',[id(801)])).rows[0].allowed,true);
 assert.equal((await db.query('select private.tttracker_v2_is_project_member($1) allowed',[id(802)])).rows[0].allowed,true);
 assert.equal((await db.query('select count(*)::int n from v2_project_users')).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from v2_user_role_assignments where organisation_id=$1 and user_id=$2',[id(800),id(3)])).rows[0].n,1);
});
