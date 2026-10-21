import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const sql=fs.readFileSync(new URL('../migrations/20261012090000_integration_bootstrap_role_defaults.sql',import.meta.url),'utf8');
test('bootstrap integration defaults fill missing entries, preserve denies/custom roles and are idempotent',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create table v2_roles(id int primary key,organisation_id int,is_system boolean,is_active boolean,metadata jsonb);
      create table v2_permissions(id int primary key,permission_code text,is_active boolean);
      create table v2_role_permissions(organisation_id int,role_id int,permission_id int,allowed boolean,unique(organisation_id,role_id,permission_id));
      create table user_denies(user_id int,permission_id int,allowed boolean);
      insert into v2_roles values(1,1,true,true,'{"initial_invitation_default":true}'),(2,1,false,true,'{"initial_invitation_default":true}'),(3,2,true,true,'{}'),(4,2,true,false,'{"initial_invitation_default":true}');
      insert into v2_permissions values(1,'integrations.sharepoint.view',true),(2,'integrations.sharepoint.manage',true),(3,'integrations.xero.view',true),(4,'integrations.xero.manage',true),(5,'people.confidential.view',true);
      insert into v2_role_permissions values(1,1,4,false),(1,2,1,false);
      insert into user_denies values(1,2,false);
    `);
    await db.exec(sql);
    const first=await db.query('select * from v2_role_permissions order by role_id,permission_id');
    assert.deepEqual(first.rows.filter(r=>r.role_id===1).map(r=>[r.permission_id,r.allowed]),[[1,true],[2,true],[3,true],[4,false]]);
    assert.equal(first.rows.filter(r=>r.role_id===2).length,1);
    assert.equal(first.rows.filter(r=>r.role_id===3||r.role_id===4).length,0);
    assert.ok(!first.rows.some(r=>r.permission_id===5));
    assert.equal((await db.query('select allowed from user_denies')).rows[0].allowed,false);
    await db.exec(sql);assert.deepEqual((await db.query('select * from v2_role_permissions order by role_id,permission_id')).rows,first.rows);
  }finally{await db.close();}
});


test('integration role denies win over other role grants and user allows without changing tenant membership',async()=>{
 const db=new PGlite();const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const rbac=fs.readFileSync(new URL('../migrations/20260927054309_access_permission_engine.sql',import.meta.url),'utf8');
 try {
  await db.exec(`create schema auth;create schema private;create table auth.users(id uuid primary key);create table organisations(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function private.tttracker_v2_is_organisation_member(org uuid) returns boolean language sql as $$select org='${id(1)}'::uuid and auth.uid()='${id(2)}'::uuid$$;insert into organisations values('${id(1)}'),('${id(8)}');insert into auth.users values('${id(2)}');`);
  for(const name of ['v2_resources','v2_permissions','v2_roles','v2_role_permissions','v2_user_role_assignments','v2_user_permission_overrides']) await db.exec(rbac.match(new RegExp(`create table if not exists public\\.${name} \\([\\s\\S]*?\\n\\);`))[0]);
  await db.exec(fs.readFileSync(new URL('../migrations/20261012101000_integration_explicit_role_denies.sql',import.meta.url),'utf8'));
  await db.exec(`insert into v2_resources(id,resource_key,name) values('${id(3)}','settings','Settings');insert into v2_permissions(id,resource_id,permission_code,action_key,name) values('${id(4)}','${id(3)}','integrations.sharepoint.manage','manage','Manage');insert into v2_roles(id,organisation_id,code,name) values('${id(5)}','${id(1)}','configured-a','Configured A'),('${id(6)}','${id(1)}','configured-b','Configured B');insert into v2_role_permissions(organisation_id,role_id,permission_id,allowed) values('${id(1)}','${id(5)}','${id(4)}',true),('${id(1)}','${id(6)}','${id(4)}',false);insert into v2_user_role_assignments(organisation_id,user_id,role_id) values('${id(1)}','${id(2)}','${id(5)}'),('${id(1)}','${id(2)}','${id(6)}');insert into v2_user_permission_overrides(organisation_id,user_id,permission_id,effect) values('${id(1)}','${id(2)}','${id(4)}','allow');select set_config('request.jwt.claim.sub','${id(2)}',false);`);
  const allowed=async org=>(await db.query("select private.tttracker_v2_has_permission($1,'integrations.sharepoint.manage') allowed",[id(org)])).rows[0].allowed;
  assert.equal(await allowed(1),false);assert.equal(await allowed(8),false);
  await db.exec(`update v2_user_role_assignments set expires_at=now()-interval '1 minute' where role_id='${id(6)}'`);assert.equal(await allowed(1),true);
  await db.exec("update v2_user_permission_overrides set effect='deny'");assert.equal(await allowed(1),false);
 } finally {await db.close();}
});
