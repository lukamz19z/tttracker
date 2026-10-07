const dependency = process.getBuiltinModule('module').createRequire(__filename);
const {test,before,after}=dependency('node:test');
const assert=dependency('node:assert/strict');
const fs=dependency('node:fs');
const path=dependency('node:path');
const {PGlite}=dependency(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const root=path.resolve(__dirname,'../..');
const ts=dependency(path.join(root,'v2/node_modules/typescript'));
const readSql=(name)=>fs.readFileSync(path.join(root,'supabase/migrations',name),'utf8');
const source={foundation:readSql('20260926120515_organisation_foundation_actual.sql'),rbac:readSql('20260927054309_access_permission_engine.sql'),projects:readSql('20260927054926_projects_and_memberships.sql'),party:readSql('20261002051838_contractor_project_parties.sql'),portal:readSql('20261002051844_contractor_client_portal_sections.sql'),bilateral:readSql('20261002051849_bilateral_project_access.sql')};
function table(sql,name){const match=sql.match(new RegExp(`create table if not exists public\\.${name} \\([\\s\\S]*?\\n\\);`));assert.ok(match,name);return match[0];}
function fn(sql,name){const match=sql.match(new RegExp(`create or replace function (?:private|public)\\.${name}\\([\\s\\S]*?\\$\\$;`));assert.ok(match,name);return match[0];}
const id=(n)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const ids={host:id(1),partyUser:id(2),stranger:id(3),view:id(4),org:id(10),otherOrg:id(11),project:id(20),otherProject:id(21),party:id(30),partyMember:id(31),tower:id(40),otherTower:id(41),towerTwo:id(42),bundle:id(50),otherBundle:id(51),delivery:id(60),otherDelivery:id(61),deliveryItem:id(70),foreignDelivery:id(62),foreignDeliveryItem:id(71)};
let db,currentUser=ids.host,writes=0;
async function access(user=currentUser,project=ids.project){await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[user]);return (await db.query('select public.tttracker_v2_project_access($1) as access',[project])).rows[0].access;}
const modules=new Map();
function load(file){file=path.resolve(file);if(modules.has(file))return modules.get(file);const exp={};modules.set(file,exp);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;const req=(name)=>{
 if(name==='server-only')return {};
 if(name==='next/navigation')return {unstable_rethrow:()=>{}};
 if(name==='next/server')return {NextResponse:{json:(body,options={})=>({body,status:options.status||200})}};
 if(name==='@/lib/projects/project-context')return {requireProjectContext:async(project)=>{const raw=await access(currentUser,project);const a=raw && load(path.join(root,'v2/lib/projects/access-selection.ts')).selectProjectParticipant(raw);if(!a)throw new Error('PROJECT_ACCESS_DENIED');return {access:a,project:{id:project},dataOrganisationId:a.dataOrganisationId,workspace:{userId:currentUser,organisation:{organisationId:a.dataOrganisationId}}};}};
 if(name==='@/lib/supabase/server')return {createSupabaseServer:async()=>({rpc:async()=>{await access(currentUser);return {data:(await db.query('select public.tttracker_v2_accessible_projects() as projects')).rows[0].projects,error:null};}})};
 if(name==='@/lib/supabase/admin')return {createSupabaseAdmin:()=>admin};
 if(name.startsWith('@/'))return load(path.join(root,'v2',name.slice(2)+'.ts'));
 if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'));
 return dependency(name);
};new Function('require','exports',code)(req,exp);return exp;}
const admin={from(tableName){let filters=[];let mutation=false;return {select(){return this;},eq(k,v){filters.push([k,v]);return this;},maybeSingle:async function(){const clauses=filters.map(([k],i)=>`"${k}"=$${i+1}`).join(' and ');return {data:(await db.query(`select * from public."${tableName}" where ${clauses}`,filters.map(([,v])=>v))).rows[0]||null,error:null};},upsert:async()=>{writes++;return {error:null};},insert(){mutation=true;writes++;return this;},then(resolve,reject){if(mutation)return Promise.resolve({data:{id:id(100)},error:null}).then(resolve,reject);const clauses=filters.map(([k],i)=>`"${k}"=$${i+1}`).join(' and ');return db.query(`select * from public."${tableName}" where ${clauses||'true'}`,filters.map(([,v])=>v)).then(r=>({data:r.rows,error:null})).then(resolve,reject);}};}};
before(async()=>{
 db=new PGlite();await db.exec(`create schema auth;create schema private;create role anon;create role authenticated;create role service_role;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table auth.users(id uuid primary key);create table organisations(id uuid primary key);create table organisation_users(organisation_id uuid,user_id uuid,status text);create table v2_projects(id uuid primary key,organisation_id uuid,host_organisation_id uuid,status text);create table organisation_modules(organisation_id uuid,module_key text,enabled boolean);create table v2_project_section_settings(project_id uuid,section_key text,enabled boolean);create table v2_section_definitions(section_key text,scope text,implementation_status text,default_enabled boolean);insert into v2_section_definitions values('project_materials','project','ready',true);`);
 for(const name of ['v2_resources','v2_permissions','v2_roles','v2_role_permissions','v2_user_role_assignments','v2_user_permission_overrides'])await db.exec(table(source.rbac,name));
 await db.exec(table(source.projects,'v2_project_users'));
 for(const name of ['v2_project_parties','v2_project_party_users','v2_project_party_permission_definitions','v2_project_party_permissions','v2_project_party_user_permission_overrides','v2_record_party_shares'])await db.exec(table(source.party,name));
 for(const name of ['v2_client_portal_section_definitions','v2_project_party_portal_sections'])await db.exec(table(source.portal,name));
 await db.exec(table(source.bilateral,'v2_project_party_access_grants'));
 const trace=readSql('20261002062325_materials_traceability_control.sql');
 await db.exec(fn(trace,'tttracker_v2_next_material_issue_number'));await db.exec(fn(trace,'tttracker_v2_recalculate_material_issue'));await db.exec(fn(readSql('20261002163500_material_bundle_deliveries_two_stage.sql'),'tttracker_v2_next_material_delivery_number'));
 for(const [src,name] of [[source.foundation,'tttracker_v2_is_organisation_member'],[source.rbac,'tttracker_v2_has_permission'],[source.projects,'tttracker_v2_is_project_member'],[source.projects,'tttracker_v2_has_project_permission'],[source.party,'tttracker_v2_is_active_org_member'],[source.bilateral,'tttracker_v2_user_has_scoped_party_grant'],[source.bilateral,'tttracker_v2_external_party_has_permission'],[source.bilateral,'tttracker_v2_user_has_project_party_access'],[source.bilateral,'tttracker_v2_party_can_view_portal_section']])await db.exec(fn(src,name));
 await db.exec(`insert into auth.users values('${ids.host}'),('${ids.partyUser}'),('${ids.stranger}'),('${ids.view}');insert into organisations values('${ids.org}'),('${ids.otherOrg}');insert into v2_projects values('${ids.project}','${ids.org}','${ids.org}','active'),('${ids.otherProject}','${ids.otherOrg}','${ids.otherOrg}','active');insert into organisation_users values('${ids.org}','${ids.host}','active'),('${ids.org}','${ids.view}','active');insert into v2_project_users(organisation_id,project_id,user_id)values('${ids.org}','${ids.project}','${ids.host}'),('${ids.org}','${ids.project}','${ids.view}');insert into organisation_modules values('${ids.org}','materials',true);insert into v2_project_parties(id,project_id,host_organisation_id,linked_organisation_id,party_type_key,display_name,portal_enabled)values('${ids.party}','${ids.project}','${ids.org}','${ids.otherOrg}','client','External party',true);insert into v2_project_party_users(id,project_party_id,project_id,user_id,status)values('${ids.partyMember}','${ids.party}','${ids.project}','${ids.partyUser}','active');insert into v2_client_portal_section_definitions(host_organisation_id,section_key,label,permission_key,default_enabled,default_sharing_mode)values('${ids.org}','materials','Materials','materials.view_shared',true,'selected_records');insert into v2_project_party_permissions(project_party_id,permission_key,allowed)values('${ids.party}','materials.view_shared',true);`);
 await db.exec(`insert into v2_project_party_permission_definitions(host_organisation_id,permission_key,label,default_allowed)values('${ids.org}','materials.view_shared','Shared Materials',false)`);
 await db.exec(readSql('20261002190000_materials_project_access.sql'));
 await db.exec(readSql('20261002190000_materials_project_access.sql')); // Idempotence.
 await db.exec(`insert into v2_user_permission_overrides(organisation_id,user_id,permission_id,effect)select '${ids.org}','${ids.host}',id,'allow' from v2_permissions;insert into v2_user_permission_overrides(organisation_id,user_id,permission_id,effect)select '${ids.org}','${ids.view}',id,'allow' from v2_permissions where permission_code='materials.view';create table v2_towers(id uuid primary key,project_id uuid,organisation_id uuid);create table v2_material_bundles(id uuid primary key,project_id uuid,organisation_id uuid,tower_id uuid);create table v2_material_deliveries(id uuid primary key,project_id uuid,organisation_id uuid);create table v2_material_delivery_items(id uuid primary key,project_id uuid,organisation_id uuid,delivery_id uuid,bundle_id uuid,tower_id uuid);insert into v2_towers values('${ids.tower}','${ids.project}','${ids.org}'),('${ids.towerTwo}','${ids.project}','${ids.org}'),('${ids.otherTower}','${ids.otherProject}','${ids.otherOrg}');insert into v2_material_bundles values('${ids.bundle}','${ids.project}','${ids.org}','${ids.tower}'),('${ids.otherBundle}','${ids.otherProject}','${ids.otherOrg}','${ids.otherTower}');insert into v2_material_deliveries values('${ids.delivery}','${ids.project}','${ids.org}'),('${ids.otherDelivery}','${ids.project}','${ids.org}'),('${ids.foreignDelivery}','${ids.otherProject}','${ids.otherOrg}');insert into v2_material_delivery_items values('${ids.deliveryItem}','${ids.project}','${ids.org}','${ids.delivery}','${ids.bundle}','${ids.tower}'),('${ids.foreignDeliveryItem}','${ids.otherProject}','${ids.otherOrg}','${ids.foreignDelivery}','${ids.otherBundle}','${ids.otherTower}');`);
 await db.exec(`create table v2_material_bundle_checks(id uuid primary key default gen_random_uuid(),project_id uuid,organisation_id uuid,tower_id uuid,bundle_id uuid);`);
 await db.exec(readSql('20261002190000_materials_project_access.sql'));
 await db.exec("alter table v2_projects add column created_by uuid references auth.users(id), add column name text default 'Project', add column code text default 'TEST', add column project_number text, add column client_name text, add column location text, add column expected_tower_count integer;");
 await db.exec(readSql('20261002203753_project_access_provisioning.sql'));
});
after(async()=>db.close());
const bundleRoute=()=>load(path.join(root,'v2/app/api/projects/[projectId]/materials/bundle-checks/route.ts'));
async function check(body,user=ids.host){currentUser=user;return bundleRoute().POST({json:async()=>body},{params:Promise.resolve({projectId:ids.project})});}
test('valid host retains access and can check a bundle',async()=>{const start=writes;const r=await check({bundleId:ids.bundle,towerId:ids.tower});assert.equal(r.status,200);assert.equal(writes,start+1);});
for(const [name,body]of [['cross-project bundle',{bundleId:ids.otherBundle,towerId:ids.tower}],['cross-project tower',{bundleId:ids.bundle,towerId:ids.otherTower}],['bundle/tower mismatch',{bundleId:ids.bundle,towerId:ids.towerTwo}],['delivery item through wrong delivery',{bundleId:ids.bundle,towerId:ids.tower,deliveryItemId:ids.deliveryItem,deliveryId:ids.otherDelivery}]])test(name+' is rejected before mutation',async()=>{const start=writes;const r=await check(body);assert.equal(r.status,422);assert.equal(r.body.error,'MATERIALS_RELATIONSHIP_INVALID');assert.equal(writes,start);});
test('view-only user cannot mutate',async()=>{const start=writes;const r=await check({bundleId:ids.bundle,towerId:ids.tower},ids.view);assert.equal(r.status,403);assert.equal(r.body.error,'MATERIALS_PERMISSION_DENIED');assert.equal(writes,start);});
test('unauthorized project-party user has no relationship',async()=>{assert.equal(await access(ids.stranger),null);});
test('authorized project-party user can read permitted shared Materials',async()=>{await db.exec(`insert into v2_record_party_shares(project_id,project_party_id,record_type,record_id)values('${ids.project}','${ids.party}','v2_material_bundles','${ids.bundle}')`);const a=await access(ids.partyUser);assert.equal(a.kind,'party');assert.equal(a.permissions['materials.view'],true);const policy=load(path.join(root,'v2/lib/materials/access-policy.ts'));assert.equal(policy.canReadMaterialRecord(a,'v2_material_bundles',ids.bundle),true);assert.equal(policy.canReadMaterialRecord(a,'v2_material_bundles',ids.otherBundle),false);assert.equal(a.settingsConfigure,false);});
test('disabled party section denies Materials even with permission',async()=>{await db.exec(`insert into v2_project_party_portal_sections(project_party_id,project_id,section_key,enabled)values('${ids.party}','${ids.project}','materials',false)`);const a=await access(ids.partyUser);assert.equal(a.permissions['materials.view'],false);assert.equal(a.shares.length,0);await db.exec(`update v2_project_party_portal_sections set enabled=true,sharing_mode='selected_records'`);});
test('summary-only section exposes no record shares',async()=>{await db.exec(`update v2_project_party_portal_sections set sharing_mode='summary_only'`);const a=await access(ids.partyUser);assert.equal(a.permissions['materials.view'],true);assert.equal(a.shares.length,0);await db.exec(`update v2_project_party_portal_sections set sharing_mode='selected_records'`);});
test('party cannot bypass missing action permission',async()=>{const start=writes;const r=await check({bundleId:ids.bundle,towerId:ids.tower},ids.partyUser);assert.equal(r.status,403);assert.equal(writes,start);});
test('Materials settings require configure permission on the actual route',async()=>{currentUser=ids.view;const start=writes;const route=load(path.join(root,'v2/app/api/projects/[projectId]/configuration/options/route.ts'));const r=await route.POST({json:async()=>({optionGroup:'material_feature',options:[{optionKey:'deliveries',label:'Deliveries',isActive:false}]})},{params:Promise.resolve({projectId:ids.project})});assert.equal(r.status,403);assert.equal(writes,start);});
test('expired bilateral grant cannot enable an action',async()=>{await db.exec(`insert into v2_project_parties(id,project_id,host_organisation_id,party_type_key,display_name,is_host)values('${id(32)}','${ids.project}','${ids.org}','host','Host',true);insert into v2_project_party_access_grants(project_id,grantor_project_party_id,grantee_project_party_id,permission_key,valid_until)values('${ids.project}','${id(32)}','${ids.party}','materials.check_bundles',now()-interval '1 hour')`);const a=await access(ids.partyUser);assert.equal(a.permissions['materials.check_bundles'],false);});
test('host organisation membership alone does not grant another project',async()=>{assert.equal(await access(ids.host,ids.otherProject),null);});
test('suspended party membership immediately removes project access',async()=>{await db.exec(`update v2_project_party_users set status='suspended' where id='${ids.partyMember}'`);assert.equal(await access(ids.partyUser),null);await db.exec(`update v2_project_party_users set status='active' where id='${ids.partyMember}'`);});

test('database trigger blocks cross-project reference even through the service backend',async()=>{
 await assert.rejects(db.query('insert into v2_material_bundle_checks(project_id,organisation_id,tower_id,bundle_id) values($1,$2,$3,$4)',[ids.project,ids.org,ids.tower,ids.otherBundle]),/MATERIALS_RELATIONSHIP_INVALID/);
 await db.query('insert into v2_material_bundle_checks(project_id,organisation_id,tower_id,bundle_id) values($1,$2,$3,$4)',[ids.project,ids.org,ids.tower,ids.bundle]);
 await assert.rejects(db.query('update v2_material_bundle_checks set tower_id=$1',[ids.towerTwo]),/MATERIALS_RELATIONSHIP_INVALID/);
});
test('actual delivery route rejects a cross-project delivery item before mutation',async()=>{
 currentUser=ids.host;const start=writes;const route=load(path.join(root,'v2/app/api/projects/[projectId]/materials/deliveries/route.ts'));
 const r=await route.POST({json:async()=>({action:'driver_check',deliveryId:ids.delivery,deliveryItemId:ids.foreignDeliveryItem})},{params:Promise.resolve({projectId:ids.project})});
 assert.equal(r.status,422);assert.equal(writes,start);
});
test('authorized party action succeeds only for explicitly shared relationships',async()=>{
 await db.exec(`insert into v2_project_party_permissions(project_party_id,permission_key,allowed)values('${ids.party}','materials.check_bundles',true);insert into v2_record_party_shares(project_id,project_party_id,record_type,record_id)values('${ids.project}','${ids.party}','v2_towers','${ids.tower}')`);
 const r=await check({bundleId:ids.bundle,towerId:ids.tower},ids.partyUser);assert.equal(r.status,200);
 await db.exec(`delete from v2_project_party_permissions where permission_key='materials.check_bundles'`);
});
test('explicit party-user deny takes precedence over an active bilateral grant',async()=>{
 await db.exec(`update v2_project_party_access_grants set valid_until=now()+interval '1 hour';insert into v2_project_party_user_permission_overrides(project_party_user_id,permission_key,allowed)values('${ids.partyMember}','materials.check_bundles',false)`);
 const a=await access(ids.partyUser);assert.equal(a.permissions['materials.check_bundles'],false);
 await db.exec(`delete from v2_project_party_user_permission_overrides;update v2_project_party_access_grants set status='revoked'`);
});
test('two party memberships cannot combine a disabled section with another party permission',async()=>{
 const second=id(33),secondUser=id(34);
 await db.exec(`insert into v2_project_parties(id,project_id,host_organisation_id,party_type_key,display_name,portal_enabled)values('${second}','${ids.project}','${ids.org}','consultant','Other party',true);insert into v2_project_party_users(id,project_party_id,project_id,user_id,status)values('${secondUser}','${second}','${ids.project}','${ids.partyUser}','active');insert into v2_project_party_permissions(project_party_id,permission_key,allowed)values('${second}','materials.check_bundles',true);insert into v2_project_party_portal_sections(project_party_id,project_id,section_key,enabled)values('${second}','${ids.project}','materials',false)`);
 const raw=await access(ids.partyUser);const select=load(path.join(root,'v2/lib/projects/access-selection.ts')).selectProjectParticipant;
 assert.equal(select(raw,second).permissions['materials.view'],false);assert.equal(select(raw,ids.party).permissions['materials.check_bundles'],false);
 assert.equal(select(raw,ids.org),null);
});
test('Materials payload contains only shared records and never exposes Daily Dockets',async()=>{
 const a=load(path.join(root,'v2/lib/projects/access-selection.ts')).selectProjectParticipant(await access(ids.partyUser),ids.party);
 const filter=load(path.join(root,'v2/lib/materials/visibility.ts')).filterMaterialsPayload;
 const payload={projectId:ids.project,organisationId:ids.org,towers:[],bundles:[{id:ids.bundle},{id:ids.otherBundle}],issues:[],movements:[],deliveries:[],locations:[],reservations:[],amendments:[],findings:[],dockets:[{id:id(88)}],options:[],settings:{deliveriesEnabled:true},metrics:{bundleCount:2,memberCount:99,boltCount:99,packerCount:99}};
 const filtered=filter(payload,a);assert.deepEqual(filtered.bundles.map(r=>r.id),[ids.bundle]);assert.deepEqual(filtered.dockets,[]);assert.equal(filtered.metrics.memberCount,0);assert.equal(filtered.permissions.check_bundles,false);
});

test('browser roles cannot call service-only Materials mutation RPCs',async()=>{
 for(const name of ['tttracker_v2_next_material_issue_number','tttracker_v2_recalculate_material_issue','tttracker_v2_next_material_delivery_number']) {
  for(const role of ['anon','authenticated']) {
   const result=await db.query('select has_function_privilege($1,$2,$3) allowed',[role,'public.'+name+'(uuid)','EXECUTE']);assert.equal(result.rows[0].allowed,false);
  }
  const result=await db.query('select has_function_privilege($1,$2,$3) allowed',['service_role','public.'+name+'(uuid)','EXECUTE']);assert.equal(result.rows[0].allowed,true);
 }
});

test('disabled Materials section catalogue cannot be re-enabled by a party override',async()=>{
 await db.exec(`update v2_client_portal_section_definitions set is_active=false where section_key='materials'`);
 const a=await access(ids.partyUser);assert.equal(a.permissions['materials.view'],false);assert.deepEqual(a.shares,[]);
 await db.exec(`update v2_client_portal_section_definitions set is_active=true where section_key='materials'`);
});
test('disabled Materials module denies read and write permissions',async()=>{
 await db.exec(`update organisation_modules set enabled=false where module_key='materials'`);
 const a=await access(ids.host);assert.equal(a.permissions['materials.view'],false);assert.equal(a.permissions['materials.check_bundles'],false);
 await db.exec(`update organisation_modules set enabled=true where module_key='materials'`);
});

test("unknown project is denied", async () => { assert.equal(await access(ids.host, id(999)), null); });

test('creator becomes member and can reopen without gaining Materials write permission',async()=>{
 await db.query('insert into v2_projects(id,organisation_id,host_organisation_id,status,created_by)values($1,$2,$2,$3,$4)',[id(200),ids.org,'active',ids.view]);
 const m=(await db.query('select * from v2_project_users where project_id=$1',[id(200)])).rows[0];
 assert.equal(m.user_id,ids.view);assert.equal(m.status,'active');assert.equal(m.access_level,'member');
 const a=await access(ids.view,id(200));assert.equal(a.kind,'host');assert.equal(a.permissions['materials.import'],false);
 assert.equal(await access(ids.stranger,id(200)),null);
});
test('creator enrollment failure rolls back the project',async()=>{
 await assert.rejects(db.query('insert into v2_projects(id,organisation_id,status,created_by)values($1,$2,$3,$4)',[id(201),ids.otherOrg,'active',ids.view]),/PROJECT_CREATOR_ORGANISATION_MEMBERSHIP_REQUIRED/);
 assert.equal((await db.query('select count(*)::int as n from v2_projects where id=$1',[id(201)])).rows[0].n,0);
});
test('normal list excludes inaccessible organisation projects and agrees with direct access',async()=>{
 currentUser=ids.host;
 await db.query('insert into v2_projects(id,organisation_id,status)values($1,$2,$3)',[id(202),ids.org,'active']);
 const rows=await load(path.join(root,'v2/lib/projects/list.ts')).listAccessibleProjects(ids.org);
 assert.ok(rows.some(p=>p.id===ids.project));assert.ok(!rows.some(p=>p.id===id(202)));
 for(const p of rows)assert.ok(await access(ids.host,p.id));
});
test('authorised party sees canonical project with permitted landing route; stranger sees none',async()=>{
 currentUser=ids.partyUser;
 const list=load(path.join(root,'v2/lib/projects/list.ts')).listAccessibleProjects;
 const rows=await list(ids.otherOrg);assert.equal(rows.length,1);assert.equal(rows[0].id,ids.project);assert.match(rows[0].href,/materials/);
 currentUser=ids.stranger;assert.equal((await list()).length,0);
});
test('backfill is creator-only, idempotent and preserves suspended memberships',async()=>{
 await db.exec('drop trigger v2_projects_enroll_creator on v2_projects');
 await db.query('insert into v2_projects(id,organisation_id,status,created_by)values($1,$2,$3,$4)',[id(203),ids.org,'active',ids.view]);
 await db.query('update v2_project_users set status=$1 where project_id=$2 and user_id=$3',['suspended',id(200),ids.view]);
 await db.exec(readSql('20261002203753_project_access_provisioning.sql'));
 await db.exec(readSql('20261002203753_project_access_provisioning.sql'));
 assert.equal((await db.query('select count(*)::int as n from v2_project_users where project_id=$1',[id(203)])).rows[0].n,1);
 assert.equal((await db.query('select status from v2_project_users where project_id=$1',[id(200)])).rows[0].status,'suspended');
 assert.equal((await db.query('select count(*)::int as n from v2_project_users where project_id=$1',[id(202)])).rows[0].n,0);
});

test('party with no permitted landing section is not listed',async()=>{
 await db.exec(`update v2_project_party_portal_sections set enabled=false;`);
 currentUser=ids.partyUser;
 assert.equal((await load(path.join(root,'v2/lib/projects/list.ts')).listAccessibleProjects()).length,0);
 await db.exec(`update v2_project_party_portal_sections set enabled=true;`);
});
test('system administrator missing capabilities are seeded without overriding explicit deny',async()=>{
 await db.query("insert into v2_roles(id,organisation_id,code,name,is_system)values($1,$2,'admin','Administrator',true)",[id(300),ids.org]);
 await db.query("insert into v2_role_permissions(organisation_id,role_id,permission_id,allowed) select $1,$2,id,false from v2_permissions where permission_code='materials.import'",[ids.org,id(300)]);
 await db.exec(readSql('20261002203753_project_access_provisioning.sql'));
 const rows=(await db.query("select p.permission_code,r.allowed from v2_role_permissions r join v2_permissions p on p.id=r.permission_id where role_id=$1",[id(300)])).rows;
 assert.equal(rows.find(r=>r.permission_code==='materials.import').allowed,false);
 assert.equal(rows.find(r=>r.permission_code==='materials.manage_deliveries').allowed,true);
});

test('owner role permits imports while explicit user deny wins',async()=>{
 const policy=load(path.join(root,'v2/lib/materials/access-policy.ts'));
 await db.query("insert into v2_user_role_assignments(organisation_id,user_id,role_id,status) values($1,$2,$3,'active')",[ids.org,ids.view,id(300)]);
 await db.query("update v2_role_permissions set allowed=true where role_id=$1",[id(300)]);
 const privileged=await access(ids.view);
 assert.doesNotThrow(()=>policy.requireMaterialsPermission(privileged,'import'));
 await db.query("insert into v2_user_permission_overrides(organisation_id,user_id,permission_id,effect) select $1,$2,id,'deny' from v2_permissions where permission_code='materials.import'",[ids.org,ids.view]);
 const denied=await access(ids.view);
 assert.throws(()=>policy.requireMaterialsPermission(denied,'import'),/MATERIALS_PERMISSION_DENIED/);
});
test('view-only and no-view permission checks reject import and view respectively',async()=>{
 const policy=load(path.join(root,'v2/lib/materials/access-policy.ts'));
 const base=await access(ids.host);
 assert.doesNotThrow(()=>policy.requireMaterialsPermission({...base,permissions:{'materials.view':true}},'view'));
 assert.throws(()=>policy.requireMaterialsPermission({...base,permissions:{'materials.view':true}},'import'),/MATERIALS_PERMISSION_DENIED/);
 assert.throws(()=>policy.requireMaterialsPermission({...base,permissions:{'materials.import':true}},'view'),/MATERIALS_PERMISSION_DENIED/);
});

// Organisation-wide scope uses the same actual SQL/RBAC harness as explicit and party access.
test('all-project capability grants existing and future projects without membership fanout', async () => {
  await db.exec("insert into v2_resources(resource_key,name) values('projects','Projects') on conflict do nothing");
  await db.exec(readSql('20261004110000_organisation_project_access_scope.sql'));
  assert.equal((await access(ids.view,id(202))).kind,'host');
  await db.query('insert into v2_projects(id,organisation_id,status) values($1,$2,$3)',[id(400),ids.org,'active']);
  assert.equal((await access(ids.view,id(400))).kind,'host');
  assert.equal((await db.query('select count(*)::int n from v2_project_users where project_id=$1',[id(400)])).rows[0].n,0);
  currentUser=ids.view;
  const list=await load(path.join(root,'v2/lib/projects/list.ts')).listAccessibleProjects(ids.org);
  assert.ok(list.some(p=>p.id===id(400)));
  for(const p of list) assert.ok(await access(ids.view,p.id));
});
test('removing all-project grant immediately falls back to selected memberships',async()=>{
  await db.exec("update v2_role_permissions set allowed=false where permission_id=(select id from v2_permissions where permission_code='projects.access_all')");
  assert.equal(await access(ids.view,id(400)),null);
  assert.equal((await access(ids.view,ids.project)).kind,'host');
  await db.exec(readSql('20261004110000_organisation_project_access_scope.sql'));
  assert.equal(await access(ids.view,id(400)),null); // Migration preserves explicit false.
  await db.exec("update v2_role_permissions set allowed=true where permission_id=(select id from v2_permissions where permission_code='projects.access_all')");
});
test('explicit user deny wins over all-project role grant',async()=>{
  await db.query("insert into v2_user_permission_overrides(organisation_id,user_id,permission_id,effect) select $1,$2,id,'deny' from v2_permissions where permission_code='projects.access_all'",[ids.org,ids.view]);
  assert.equal(await access(ids.view,id(400)),null);
  await db.query("delete from v2_user_permission_overrides where user_id=$1 and permission_id=(select id from v2_permissions where permission_code='projects.access_all')",[ids.view]);
});
test('organisation-wide capability cannot cross organisation boundary',async()=>{
  assert.equal(await access(ids.view,ids.otherProject),null);
});
test('ordinary selected-project user still cannot access other organisation projects',async()=>{
  assert.equal((await access(ids.host,ids.project)).kind,'host');
  assert.equal(await access(ids.host,id(400)),null);
});
test('party access stays party-scoped despite host all-project grant',async()=>{
  assert.equal((await access(ids.partyUser,ids.project)).kind,'party');
  assert.equal(await access(ids.partyUser,id(400)),null);
});
test('inactive organisation membership removes all-project access',async()=>{
  await db.query("update organisation_users set status='suspended' where user_id=$1",[ids.view]);
  assert.equal(await access(ids.view,id(400)),null);
  await db.query("update organisation_users set status='active' where user_id=$1",[ids.view]);
});
