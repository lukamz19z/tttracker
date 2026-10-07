/* Run with PGLITE_MODULE pointing at an isolated @electric-sql/pglite install.
 * No connection to Supabase or production data; exercises the actual migration.
 * node --test supabase/verification/materials_import_integrity.test.cjs
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '../..');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const ts = require(path.join(root, 'v2/node_modules/typescript'));
function loadTypeScript(name) {
  const filename = path.join(root, 'v2/lib/materials', name);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = new Module(filename);
  const originalRequire = mod.require.bind(mod);
  mod.require = (request) => request === "./import-validation" ? loadTypeScript("import-validation.ts") : originalRequire(request);
  mod._compile(compiled, filename);
  return mod.exports;
}
const { prepareImportRows } = loadTypeScript('import-validation.ts');
const { parseMaterialsCsv } = loadTypeScript('import-csv.ts');
const ids = {
  org: '10000000-0000-0000-0000-000000000001',
  otherOrg: '10000000-0000-0000-0000-000000000002',
  project: '20000000-0000-0000-0000-000000000001',
  otherProject: '20000000-0000-0000-0000-000000000002',
  tower: '30000000-0000-0000-0000-000000000001',
  otherTower: '30000000-0000-0000-0000-000000000002',
  actor: '40000000-0000-0000-0000-000000000001',
};
let db;
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261002180000_materials_import_integrity.sql'), 'utf8');
function createTable(source, name) {
  const match = source.match(new RegExp(`create table if not exists public\\.${name} \\([\\s\\S]*?\\n\\);`));
  assert.ok(match, `fixture table ${name} must come from the repository schema`);
  return match[0];
}
before(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth; create schema private;
    create role anon; create role authenticated; create role service_role;
    create table auth.users(id uuid primary key);
    create table public.organisations(id uuid primary key);
    create table public.v2_projects(id uuid primary key,organisation_id uuid references organisations);
    create table public.organisation_users(organisation_id uuid references organisations,user_id uuid references auth.users,status text);
    create table public.v2_tower_types(id uuid primary key,type_code text,name text);
    create table public.v2_towers(id uuid primary key,organisation_id uuid references organisations,project_id uuid references v2_projects,tower_type_id uuid references v2_tower_types);
    create table public.v2_daily_dockets(id uuid primary key,project_id uuid default '${ids.project}',organisation_id uuid default '${ids.org}');
    create table public.v2_project_option_definitions(id uuid primary key default gen_random_uuid(),organisation_id uuid,project_id uuid,option_group text,option_key text,is_active boolean default true,settings jsonb default '{}');
  `);
  const operations = fs.readFileSync(path.join(root,'supabase/migrations/20260929110945_operations_control_centre.sql'),'utf8');
  const trace = fs.readFileSync(path.join(root,'supabase/migrations/20261002062325_materials_traceability_control.sql'),'utf8');
  await db.exec(createTable(operations,'v2_material_register'));
  await db.exec(createTable(trace,'v2_material_bundles'));
  const registerAlter = trace.match(/alter table public\.v2_material_register[\s\S]*?;/)[0];
  await db.exec(registerAlter);
  for (const name of ['v2_material_reconciliation_runs','v2_material_reconciliation_findings','v2_material_bundle_members','v2_material_bundle_checks','v2_material_member_checks',
    'v2_material_locations','v2_material_issues','v2_material_movements','v2_material_reservations',
    'v2_material_amendments','v2_material_amendment_items','v2_material_import_profiles',
    'v2_material_import_batches','v2_material_source_records']) await db.exec(createTable(trace,name));
  await db.exec(`alter table public.v2_material_register add column source_import_batch_id uuid references v2_material_import_batches on delete set null;`);
  const deliveries = fs.readFileSync(path.join(root,'supabase/migrations/20261002163500_material_bundle_deliveries_two_stage.sql'),'utf8');
  for (const name of ['v2_material_deliveries','v2_material_delivery_items']) await db.exec(createTable(deliveries,name));
  await db.exec(`
    insert into auth.users values('${ids.actor}');
    insert into organisations values('${ids.org}'),('${ids.otherOrg}');
    insert into v2_projects values('${ids.project}','${ids.org}'),('${ids.otherProject}','${ids.otherOrg}');
    insert into organisation_users values('${ids.org}','${ids.actor}','active');
    insert into v2_towers(id,organisation_id,project_id) values('${ids.tower}','${ids.org}','${ids.project}'),('${ids.otherTower}','${ids.otherOrg}','${ids.otherProject}');
    insert into v2_project_option_definitions(organisation_id,project_id,option_group,option_key,settings)
      select '${ids.org}','${ids.project}','material_import_source_role',role,'{}'::jsonb
      from unnest(array['packing_list','drawing_schedule','supplier_list','manual','custom']) role;
  `);
  await db.exec(`
    insert into v2_material_register(organisation_id,project_id,tower_id,item_reference,received_quantity)
      values('${ids.org}','${ids.project}','${ids.tower}','LEGACY',7);
    insert into v2_material_import_batches(organisation_id,project_id,source_type_key,source_file_name)
      values('${ids.org}','${ids.project}','packing_list','legacy.csv');
    insert into v2_material_source_records(organisation_id,project_id,import_batch_id,source_type_key,tower_id,material_kind,item_reference,required_quantity)
      select '${ids.org}','${ids.project}',id,'packing_list','${ids.tower}','member','LEGACY',9
      from v2_material_import_batches where source_file_name='legacy.csv';
  `);
  await db.exec(migration);
  await db.exec(migration); // Additive migration must also tolerate manual prior application.
  // Exercise the unchanged import RPC with the new transaction-local relationship guards enabled.
  const security = fs.readFileSync(path.join(root, 'supabase/migrations/20261002190000_materials_project_access.sql'), 'utf8');
  const guard = security.match(/create or replace function private\.tttracker_v2_material_relationship_guard\(\)[\s\S]*?end \$\$;/);
  const triggers = security.match(/do \$\$ declare tbl text; begin[\s\S]*?end \$\$;/);
  assert.ok(guard); assert.ok(triggers);
  await db.exec(guard[0]); await db.exec(triggers[0]);
  if (process.env.MATERIALS_BULK) {
    await db.exec("alter table v2_towers add column tower_identifier text; update v2_towers set tower_identifier=id::text;");
    await db.query("insert into v2_towers(id,organisation_id,project_id,tower_identifier) values($1,$2,$3,'T002')",[bulkTower,ids.org,ids.project]);
    await db.query("update v2_towers set tower_identifier='T001' where id=$1",[ids.tower]);
    await db.exec(fs.readFileSync(path.join(root,"supabase/migrations/20261003070045_materials_bulk_import.sql"),"utf8"));
    if(process.env.MATERIALS_APPLICABILITY) {
      await apply([{bundle_reference:'LEGACY-MANIFEST'}],{category:'bundles',role:'supplier_list',scope:'legacy-manifest.csv'});
      const sql=fs.readFileSync(path.join(root,"supabase/migrations/20261003080334_materials_requirement_applicability.sql"),"utf8");
      await db.exec(sql);await db.exec(sql);
      const readiness=fs.readFileSync(path.join(root,"supabase/migrations/20261003085151_materials_schedule_readiness.sql"),"utf8");await db.exec(readiness);await db.exec(readiness);
      const safe=fs.readFileSync(path.join(root,"supabase/migrations/20261003095800_materials_import_safe_updates.sql"),"utf8");await db.exec(safe);await db.exec(safe);
      const packs=fs.readFileSync(path.join(root,"supabase/migrations/20261003110000_materials_physical_bundle_assignments.sql"),"utf8");await db.exec(packs);await db.exec(packs);
    }
  }
});
after(async () => { if (db) await db.close(); });
const scalar = async (sql, params=[]) => (await db.query(sql,params)).rows[0];
async function apply(values, options={}) {
  const result = await scalar(`select public.tttracker_v2_apply_material_import($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb) result`,[
    options.project || ids.project, options.org || ids.org, options.tower || ids.tower, ids.actor,
    options.category || 'members',options.mode || 'merge',options.role || 'packing_list',options.scope || 'packing.csv',
    options.file || options.scope || 'packing.csv', options.profile || null, '{}',
    JSON.stringify(values.map((value,index)=>({row_number:index+2,values:value,raw_payload:value}))),
  ]);
  return result.result;
}
async function material(ref) { return scalar('select * from v2_material_register where item_reference=$1',[ref]); }
async function counts() {
  return scalar(`select (select count(*) from v2_material_register) masters,
    (select count(*) from v2_material_bundles) bundles,(select count(*) from v2_material_source_records) sources,
    (select count(*) from v2_material_import_batches) batches,(select count(*) from v2_material_import_profiles) profiles`);
}

test('legacy source records are retained and linked only to deterministic canonical matches',async()=>{
  const m=await material('LEGACY');
  const source=await scalar("select * from v2_material_source_records where item_reference='LEGACY'");
  assert.equal(source.material_item_id,m.id); assert.equal(source.source_scope_key,'legacy.csv');
  assert.equal(source.source_role_key,'packing_list'); assert.equal(source.import_category_key,'members');
  assert.equal(m.received_quantity,'7');
});
test('preflight rejects invalid numbers/required fields and preserves valid zero/omitted values',()=>{
  const mapping={item_reference:'Member',required_quantity:'Qty',drawing_reference:'Drawing'};
  const good=prepareImportRows([{Member:'M',Qty:'0',Drawing:' '}],mapping,'members');
  assert.deepEqual(good.rowErrors,[]); assert.equal(good.rows[0].values.required_quantity,0);
  assert.equal('drawing_reference' in good.rows[0].values,false);
  for(const Qty of ['abc','1,2','-1','Infinity','1e4']) assert.ok(prepareImportRows([{Member:'M',Qty}],{item_reference:'Member',required_quantity:'Qty'},'members').rowErrors.length);
  assert.equal(prepareImportRows([{Member:'M',Qty:'1,200.5'}],mapping,'members').rows[0].values.required_quantity,1200.5);
  assert.ok(prepareImportRows([{Member:'',Description:'Real member'}],{item_reference:'Member',description:'Description'},'members').rowErrors.length);
});
test('CSV rejects duplicate headings, malformed quotes and truncated rows',()=>{
  for(const text of ['a,a\nx,y','a,b\nx','a,b\n"x,y','a,b\n"x"z,y']) assert.throws(()=>parseMaterialsCsv(text));
  assert.deepEqual(parseMaterialsCsv('a,b\n"x,y","a""b"').rows,[{a:'x,y',b:'a"b'}]);
  assert.deepEqual(parseMaterialsCsv('a,b\n,').rows,[]);
});
test('Merge enriches multiple sources without blank erasure, resetting receipts or changing primary provenance',async()=>{
  assert.equal((await apply([{item_reference:'M1',drawing_reference:'799312/47',drawing_revision:'A',segment:'S1',profile:'L90',material_code:'G350',description:'Original',required_quantity:5}],{role:'drawing_schedule',scope:'drawing.csv'})).ok,true);
  const original=await material('M1');
  await db.query('update v2_material_register set received_quantity=3 where id=$1',[original.id]);
  const result=await apply([{item_reference:'M1',bundle_reference:'B1'}]);
  assert.equal(result.mergedRows,1);
  const merged=await material('M1');
  assert.equal(merged.drawing_reference,'799312/47'); assert.equal(merged.profile,'L90');
  assert.equal(merged.material_code,'G350'); assert.equal(merged.required_quantity,'5');
  assert.equal(merged.received_quantity,'3'); assert.equal(merged.source_document,'drawing.csv');
  assert.equal(merged.bundle_reference,'B1');
  const sources=(await db.query('select * from v2_material_source_records where material_item_id=$1',[merged.id])).rows;
  assert.equal(sources.length,2); assert.equal(sources[1].canonical_before.received_quantity,3);
  assert.equal(sources[1].canonical_after.drawing_reference,'799312/47');
});
test('Add records provenance but never changes a matching existing canonical record',async()=>{
  const before=await material('M1');
  const result=await apply([{item_reference:'M1',description:'Different',required_quantity:99}],{mode:'add',scope:'extra.csv'});
  assert.equal(result.unchangedRows,1); assert.equal(result.addedRows,0);
  assert.deepEqual(await material('M1'),before);
  assert.equal((await apply([{item_reference:'NEW-ADD'}],{mode:'add'})).addedRows,1);
});
test('duplicate and ambiguous keys reject the full batch before any mutation',async()=>{
  const before=await counts();
  const duplicate=await apply([{item_reference:'DUP'},{item_reference:'DUP',description:'duplicate'}]);
  assert.equal(duplicate.ok,false); assert.ok(duplicate.rowErrors.some(x=>x.row===3));
  assert.deepEqual(await counts(),before);
  await apply([{item_reference:'AMB',segment:'A'},{item_reference:'AMB',segment:'B'}]);
  const after=await counts();
  const ambiguous=await apply([{item_reference:'VALID-BUT-BATCH-FAILS'},{item_reference:'AMB'}],{profile:'Not created'});
  assert.equal(ambiguous.ok,false); assert.ok(ambiguous.rowErrors.some(x=>x.row===3));
  assert.deepEqual(await counts(),after);
});
test('cross-project tower, material IDs and bundle IDs are rejected',async()=>{
  await assert.rejects(apply([{item_reference:'X'}],{tower:ids.otherTower}),/Tower does not belong/);
  const remote=(await db.query(`insert into v2_material_bundles(organisation_id,project_id,tower_id,bundle_reference) values($1,$2,$3,'REMOTE') returning id`,[ids.otherOrg,ids.otherProject,ids.otherTower])).rows[0];
  const before=await counts();
  const result=await apply([{item_reference:'X',bundle_id:remote.id}]);
  assert.equal(result.ok,false); assert.match(result.rowErrors[0].message,/bundle_id/);
  assert.deepEqual(await counts(),before);
  const m=await material('M1');
  const wrong=await apply([{item_reference:'WRONG',material_item_id:m.id}]);
  assert.equal(wrong.ok,false); assert.deepEqual(await counts(),before);
});
test('Replace supersedes only selected document/category/role and preserves other active source requirements',async()=>{
  await apply([{item_reference:'SCOPED',required_quantity:4}],{scope:'scope-a.csv'});
  await apply([{item_reference:'SCOPED',drawing_reference:'DWG'}],{role:'drawing_schedule',scope:'scope-b.csv'});
  const m=await material('SCOPED');
  await apply([{item_reference:'OTHER-DOC'}],{scope:'untouched.csv'});
  const result=await apply([{item_reference:'REPLACEMENT'}],{mode:'replace',scope:'scope-a.csv'});
  assert.equal(result.supersededRows,1);
  assert.equal((await material('SCOPED')).id,m.id); assert.equal((await material('SCOPED')).is_active,true);
  assert.equal((await material('OTHER-DOC')).is_active,true);
  const sources=(await db.query('select * from v2_material_source_records where material_item_id=$1',[m.id])).rows;
  assert.equal(sources.filter(x=>x.superseded_by_batch_id).length,1); assert.equal(sources.length,2);
});
test('Replace keeps removed bundle IDs, checks, deliveries, reservations and links',async()=>{
  await apply([{bundle_reference:'HISTORY',required_quantity:1}],{category:'bundles',scope:'bundle-history.csv'});
  const b=await scalar("select * from v2_material_bundles where bundle_reference='HISTORY'");
  const delivery=await scalar(`insert into v2_material_deliveries(organisation_id,project_id,delivery_number) values($1,$2,'TEST') returning id`,[ids.org,ids.project]);
  await db.query(`insert into v2_material_delivery_items(organisation_id,project_id,delivery_id,tower_id,bundle_id) values($1,$2,$3,$4,$5)`,[ids.org,ids.project,delivery.id,ids.tower,b.id]);
  await db.query(`insert into v2_material_bundle_checks(organisation_id,project_id,tower_id,bundle_id,status) values($1,$2,$3,$4,'arrived')`,[ids.org,ids.project,ids.tower,b.id]);
  await db.query(`insert into v2_material_reservations(organisation_id,project_id,bundle_id,quantity) values($1,$2,$3,1)`,[ids.org,ids.project,b.id]);
  const result=await apply([{bundle_reference:'NEW-HISTORY'}],{category:'bundles',mode:'replace',scope:'bundle-history.csv'});
  assert.equal(result.supersededRows,1);
  assert.equal((await scalar('select * from v2_material_bundles where id=$1',[b.id])).is_active,false);
  for(const table of ['v2_material_bundle_checks','v2_material_delivery_items','v2_material_reservations']) assert.equal((await scalar(`select count(*) total from ${table} where bundle_id=$1`,[b.id])).total,1);
});
test('Replace keeps unchanged material UUID, receipts, checks, movements, docket and amendment references',async()=>{
  await apply([{bundle_reference:'CHECK-PACK'}],{category:'bundles',scope:'check-pack.csv'});
  await apply([{item_reference:'CHECK-MEMBER',bundle_reference:'CHECK-PACK',required_quantity:2}],{scope:'check-members.csv'});
  const m=await material('CHECK-MEMBER');
  await db.query('update v2_material_register set received_quantity=2 where id=$1',[m.id]);
  await db.query(`insert into v2_material_member_checks(organisation_id,project_id,tower_id,bundle_id,material_item_id,member_reference,status) values($1,$2,$3,$4,$5,'CHECK-MEMBER','arrived')`,[ids.org,ids.project,ids.tower,m.bundle_id,m.id]);
  const docket=await scalar('insert into v2_daily_dockets(id) values(gen_random_uuid()) returning id');
  const issue=await scalar(`insert into v2_material_issues(organisation_id,project_id,issue_number,material_item_id,bundle_id,issue_type_key,raised_docket_id)
    values($1,$2,'TEST-HISTORY',$3,$4,'missing',$5) returning id`,[ids.org,ids.project,m.id,m.bundle_id,docket.id]);
  await db.query(`insert into v2_material_movements(organisation_id,project_id,material_item_id,bundle_id,issue_id,docket_id,movement_type_key)
    values($1,$2,$3,$4,$5,$6,'transfer')`,[ids.org,ids.project,m.id,m.bundle_id,issue.id,docket.id]);
  const amendment=await scalar(`insert into v2_material_amendments(organisation_id,project_id,title,scope_key)
    values($1,$2,'Audit reference','tower') returning id`,[ids.org,ids.project]);
  await db.query(`insert into v2_material_amendment_items(amendment_id,base_material_item_id,action_key,material_kind)
    values($1,$2,'note','member')`,[amendment.id,m.id]);
  const historyTables = ['v2_material_member_checks','v2_material_movements','v2_material_issues'];
  const history = {};
  for (const table of historyTables) history[table]=(await db.query(`select * from ${table} where material_item_id=$1`,[m.id])).rows;
  const before=history.v2_material_member_checks;
  const result=await apply([{item_reference:'CHECK-MEMBER',description:'Updated requirement'}],{mode:'replace',scope:'check-members.csv'});
  assert.equal(result.mergedRows,1); assert.equal(result.supersededRows,1);
  assert.equal((await material('CHECK-MEMBER')).id,m.id); assert.equal((await material('CHECK-MEMBER')).received_quantity,'2');
  assert.deepEqual((await db.query('select * from v2_material_member_checks where material_item_id=$1',[m.id])).rows,before);
  for(const table of historyTables) assert.deepEqual((await db.query(`select * from ${table} where material_item_id=$1`,[m.id])).rows,history[table]);
  assert.equal((await scalar('select base_material_item_id from v2_material_amendment_items where amendment_id=$1',[amendment.id])).base_material_item_id,m.id);
  await apply([{item_reference:'REMOVED-REQUIREMENT-REPLACEMENT'}],{mode:'replace',scope:'check-members.csv'});
  assert.equal((await material('CHECK-MEMBER')).is_active,false);
  assert.equal((await material('CHECK-MEMBER')).received_quantity,'2');
  for(const table of historyTables) assert.deepEqual((await db.query(`select * from ${table} where material_item_id=$1`,[m.id])).rows,history[table]);
  assert.equal((await scalar('select base_material_item_id from v2_material_amendment_items where amendment_id=$1',[amendment.id])).base_material_item_id,m.id);
});
test('a failure after writes rolls back masters, sources, profiles, batches and supersession',async()=>{
  const before=await counts();
  const sources=(await db.query('select id,superseded_by_batch_id from v2_material_source_records order by id')).rows;
  await db.exec(`create function private.fail_import_test() returns trigger language plpgsql as $$ begin
    if new.item_reference='FAIL-LATE' then raise exception 'Injected late source failure'; end if; return new; end $$;
    create trigger fail_import_test before insert on v2_material_source_records for each row execute function private.fail_import_test();`);
  await assert.rejects(apply([{item_reference:'WROTE-FIRST'},{item_reference:'FAIL-LATE'}],{mode:'replace',profile:'Roll back profile'}),/Injected late/);
  assert.deepEqual(await counts(),before);
  assert.deepEqual((await db.query('select id,superseded_by_batch_id from v2_material_source_records order by id')).rows,sources);
  await db.exec('drop trigger fail_import_test on v2_material_source_records; drop function private.fail_import_test();');
});
test('Add cannot attach active source evidence to an archived master; Merge reuses its UUID',async()=>{
  const m=await material('CHECK-MEMBER');
  assert.equal(m.is_active,false);
  const before=await counts();
  const add=await apply([{item_reference:'CHECK-MEMBER'}],{mode:'add',scope:'reactivate.csv'});
  assert.equal(add.ok,false); assert.match(add.rowErrors[0].message,/archived/);
  assert.deepEqual(await counts(),before);
  const merge=await apply([{item_reference:'CHECK-MEMBER'}],{scope:'reactivate.csv'});
  assert.equal(merge.mergedRows,1);
  assert.equal((await material('CHECK-MEMBER')).id,m.id);
  assert.equal((await material('CHECK-MEMBER')).is_active,true);
  assert.equal((await material('CHECK-MEMBER')).received_quantity,'2');
});
test('RPC execution is denied to public API roles',async()=>{
  const row=await scalar(`select has_function_privilege('anon','public.tttracker_v2_apply_material_import(uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb)','EXECUTE') anon,
    has_function_privilege('authenticated','public.tttracker_v2_apply_material_import(uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb)','EXECUTE') authenticated,
    has_function_privilege('service_role','public.tttracker_v2_apply_material_import(uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb)','EXECUTE') service`);
  assert.deepEqual(row,{anon:false,authenticated:false,service:true});
});

test('existing operational bundle reference cannot be silently changed by a source import',async()=>{
  const before=await counts();
  const result=await apply([{item_reference:'M1',bundle_reference:'DIFFERENT-PACK'}]);
  assert.equal(result.ok,false); assert.match(result.rowErrors[0].message,/bundle reference conflicts/);
  assert.deepEqual(await counts(),before);
});
test('fastener Merge preserves populated specification and quantities when incoming fields are omitted',async()=>{
  await apply([{item_reference:'BOLT-TEST',drawing_reference:'DWG-B',diameter:'M16',length:'60',bolt_type:'8.8',required_quantity:12}],{category:'bolts',role:'drawing_schedule',scope:'bolts.csv'});
  const first=await material('BOLT-TEST');
  await db.query('update v2_material_register set received_quantity=8 where id=$1',[first.id]);
  const result=await apply([{item_reference:'BOLT-TEST',drawing_reference:'DWG-B',diameter:'M16',required_quantity:15}],{category:'bolts',role:'drawing_schedule',scope:'bolts.csv'});
  assert.equal(result.mergedRows,1);
  const current=await material('BOLT-TEST');
  assert.equal(current.length,'60'); assert.equal(current.bolt_type,'8.8');
  assert.equal(current.received_quantity,'8'); assert.equal(current.required_quantity,'15');
});
test('changed import TypeScript files pass strict project compiler settings',()=>{
  const config=ts.readConfigFile(path.join(root,'v2/tsconfig.json'),ts.sys.readFile);
  const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,path.join(root,'v2'));
  const files=['next-env.d.ts','lib/materials/import-validation.ts','lib/materials/import-csv.ts',
    'app/api/projects/[projectId]/materials/import/route.ts',
    'app/workspace/projects/[projectId]/materials/import/materials-import-client.tsx'];
  const program=ts.createProgram(files.map(f=>path.join(root,'v2',f)),{...parsed.options,incremental:false});
  const diagnostics=ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{
    getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=>"\n",
  }));
});

test('representative 2500-row timing', {skip: !process.env.MATERIALS_BENCH}, async()=>{
 const start=performance.now();
 const result=await apply(Array.from({length:2500},(_,i)=>({item_reference:'PERF-'+i,required_quantity:1})),{scope:'performance.csv'});
 assert.equal(result.ok,true);
 console.log(JSON.stringify({benchmark:'2500 members x 1 tower',milliseconds:Math.round(performance.now()-start),timings:result.timings}));
});

async function bulk(values,options={}){
 return (await scalar('select public.tttracker_v2_apply_material_import_bulk($1,$2,$3,$4,$5::uuid[],$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14) result',[
 ids.project,ids.org,ids.actor,options.scope||'selected',options.towers||[ids.tower,bulkTower],options.category||'members',options.mode||'merge',options.role||'drawing_schedule',options.document||'bulk.csv','bulk.csv',null,'{}',JSON.stringify(values.map((v,i)=>({row_number:i+2,values:v,raw_payload:v}))),options.confirm!==false])).result;
}
const bulkTower='30000000-0000-0000-0000-000000000003';
test('bulk source schedule is shared; tower operational quantities stay independent',{skip:!process.env.MATERIALS_BULK},async()=>{
 const r=await bulk([{item_reference:'BULK-M1',required_quantity:5,profile:'L90'}]);assert.equal(r.ok,true);assert.equal(r.appliedRequirementRows,2);
 assert.equal((await scalar('select count(*)::int n from v2_material_import_source_rows where import_batch_id=$1',[r.batchId])).n,1);
 assert.equal((await scalar('select count(distinct source_row_id)::int n,count(*)::int targets from v2_material_source_records where import_batch_id=$1',[r.batchId])).targets,2);
 await db.query("update v2_material_register set received_quantity=3 where item_reference='BULK-M1' and tower_id=$1",[ids.tower]);
 const next=await bulk([{item_reference:'BULK-M1',description:'Enriched'}]);assert.equal(next.ok,true);
 const rows=(await db.query("select tower_id,received_quantity,profile from v2_material_register where item_reference='BULK-M1'")).rows;
 assert.equal(rows.find(x=>x.tower_id===ids.tower).received_quantity,'3');assert.equal(rows.find(x=>x.tower_id===bulkTower).received_quantity,'0');assert.ok(rows.every(x=>x.profile==='L90'));
});
test('CSV towers resolve within project; duplicate bundle references across towers stay independent',{skip:!process.env.MATERIALS_BULK},async()=>{
 const r=await bulk([{tower_reference:' t001 ',bundle_reference:'CSV-1/1'},{tower_reference:'T002',bundle_reference:'CSV-1/1'}],{scope:'csv',towers:[],category:'bundles',role:'supplier_list'});
 assert.equal(r.ok,true);assert.equal(r.targetTowers,2);
 assert.equal((await scalar("select count(*)::int n from v2_material_bundles where bundle_reference='CSV-1/1'")).n,2);
 const before=await counts();
 const bad=await bulk([{tower_reference:'T999',bundle_reference:'BAD'}],{scope:'csv',towers:[],category:'bundles',role:'supplier_list'});
 assert.equal(bad.ok,false);assert.match(bad.rowErrors[0].message,/Unmatched tower/);assert.deepEqual(await counts(),before);
 await db.query("update v2_towers set tower_identifier=' t001 ' where id=$1",[bulkTower]);
 const ambiguous=await bulk([{tower_reference:'T001',bundle_reference:'BAD'}],{scope:'csv',towers:[],category:'bundles',role:'supplier_list'});
 assert.equal(ambiguous.ok,false);assert.match(ambiguous.rowErrors[0].message,/Ambiguous tower/);
 await db.query("update v2_towers set tower_identifier='T002' where id=$1",[bulkTower]);
 await assert.rejects(bulk([{item_reference:'BAD'}],{towers:[ids.tower,ids.otherTower]}),/Tower does not belong/);
});
test('bulk Add and Replace preserve unselected towers and histories',{skip:!process.env.MATERIALS_BULK},async()=>{
 const original=await bulk([{item_reference:'BULK-KEEP',description:'Original'},{item_reference:'BULK-REMOVE'}],{mode:'add',document:'scoped.csv'});assert.equal(original.ok,true);
 const add=await bulk([{item_reference:'BULK-KEEP',description:'Incoming'}],{mode:'add',document:'another.csv'});assert.equal(add.unchangedRows,2);
 const replacement=await bulk([{item_reference:'BULK-KEEP'}],{mode:'replace',towers:[ids.tower],document:'scoped.csv'});assert.equal(replacement.ok,true);
 assert.equal((await scalar("select is_active from v2_material_register where item_reference='BULK-REMOVE' and tower_id=$1",[ids.tower])).is_active,false);
 assert.equal((await scalar("select is_active from v2_material_register where item_reference='BULK-REMOVE' and tower_id=$1",[bulkTower])).is_active,true);
 assert.equal((await scalar("select description from v2_material_register where item_reference='BULK-KEEP' and tower_id=$1",[bulkTower])).description,'Original');
});
test('all project scope requires confirmation and a current project tower set',{skip:!process.env.MATERIALS_BULK},async()=>{
 await assert.rejects(bulk([{item_reference:'ALL-M'}],{scope:'all',confirm:false}),/Confirm schedule applicability/);
 const r=await bulk([{item_reference:'ALL-M'}],{scope:'all'});assert.equal(r.ok,true);assert.equal(r.targetTowers,2);
 await assert.rejects(bulk([{item_reference:'ALL-M'}],{scope:'all',towers:[ids.tower]}),/Project towers changed/);
});
test('historical full-expansion capacity baseline',{skip:!process.env.MATERIALS_BULK||!!process.env.MATERIALS_APPLICABILITY},async()=>{
 for(const towers of [30,100,400]){
 const start=performance.now();const r=await scalar('select count(*)::int n from generate_series(1,2500) source cross join generate_series(1,$1::int) target',[towers]);
 assert.equal(r.n,2500*towers);console.log(JSON.stringify({benchmark:'2500 source rows x '+towers+' targets expansion',milliseconds:Math.round(performance.now()-start),requirements:r.n}));
 }
 const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261003070045_materials_bulk_import.sql'),'utf8');
 assert.doesNotMatch(sql,/for\s+\w+\s+in|foreach|end loop/i);assert.match(sql,/jsonb_to_recordset/);
});
test('representative bulk apply timing',{skip:!process.env.MATERIALS_BULK||!process.env.MATERIALS_BENCH_TOWERS},async()=>{
 const size=Number(process.env.MATERIALS_BENCH_TOWERS);const towerIds=[];
 for(let i=0;i<size;i++)towerIds.push('30000000-0000-0000-0001-'+String(i).padStart(12,'0'));
 await db.query("insert into v2_towers(id,organisation_id,project_id,tower_identifier) select x::uuid,$2,$3,x from unnest($1::text[]) x",[towerIds,ids.org,ids.project]);
 const start=performance.now();const r=await bulk(Array.from({length:2500},(_,i)=>({item_reference:'PERF-BULK-'+i,required_quantity:1})),{towers:towerIds});
 assert.equal(r.ok,true);assert.equal(r.appliedRequirementRows,2500*size);
 console.log(JSON.stringify({benchmark:'2500 source rows x '+size+' towers full atomic apply',milliseconds:Math.round(performance.now()-start),timings:r.timings}));
});

test('statement guards reject cross-project multi-row canonical writes atomically',{skip:!process.env.MATERIALS_BULK},async()=>{
 const before=await counts();
 await assert.rejects(db.query(`insert into v2_material_register(organisation_id,project_id,tower_id,item_reference)
 values($1,$2,$3,'GUARD-VALID'),($1,$2,$4,'GUARD-FOREIGN')`,[ids.org,ids.project,ids.tower,ids.otherTower]),/MATERIALS_RELATIONSHIP_INVALID/);
 assert.deepEqual(await counts(),before);
 const bundle=await scalar("select id from v2_material_bundles where tower_id=$1 limit 1",[ids.tower]);
 if(bundle) await assert.rejects(db.query('update v2_material_bundles set tower_id=$1 where id=$2',[ids.otherTower,bundle.id]),/MATERIALS_RELATIONSHIP_INVALID/);
 assert.deepEqual(await counts(),before);
});
test('bulk RPC remains service-role only',{skip:!process.env.MATERIALS_BULK},async()=>{
 const signature='public.tttracker_v2_apply_material_import_bulk(uuid,uuid,uuid,text,uuid[],text,text,text,text,text,text,jsonb,jsonb,boolean)';
 const r=await scalar("select has_function_privilege('anon',$1,'EXECUTE') anon,has_function_privilege('authenticated',$1,'EXECUTE') authenticated,has_function_privilege('service_role',$1,'EXECUTE') service",[signature]);
 assert.deepEqual(r,{anon:false,authenticated:false,service:true});
});
test('representative project-wide bundle CSV timing',{skip:!process.env.MATERIALS_BULK||!process.env.MATERIALS_BUNDLE_BENCH},async()=>{
 const towerIds=Array.from({length:120},(_,i)=>'30000000-0000-0000-0002-'+String(i).padStart(12,'0'));
 await db.query("insert into v2_towers(id,organisation_id,project_id,tower_identifier) select x::uuid,$2,$3,x from unnest($1::text[]) x",[towerIds,ids.org,ids.project]);
 const values=towerIds.flatMap(tower=>Array.from({length:50},(_,i)=>({tower_reference:tower,bundle_reference:'PACK-'+i,required_quantity:1})));
 const start=performance.now();const r=await bulk(values,{scope:'csv',towers:[],category:'bundles',role:'supplier_list'});
 assert.equal(r.ok,true);assert.equal(r.appliedRequirementRows,6000);assert.equal(r.targetTowers,120);
 console.log(JSON.stringify({benchmark:'6000 bundles across 120 towers full atomic apply',milliseconds:Math.round(performance.now()-start),timings:r.timings}));
 await db.exec('analyze v2_material_bundles');
 const plan=(await db.query("explain select id from v2_material_bundles where project_id=$1 and tower_id=$2 and upper(btrim(bundle_reference))='PACK-1'",[ids.project,towerIds[0]])).rows;
 assert.match(JSON.stringify(plan),/v2_material_bundles_import_match_idx/);console.log(JSON.stringify({normalizedReferencePlan:plan}));
});

async function schedule(values,options={}){
 return (await scalar('select public.tttracker_v2_apply_material_schedule($1,$2,$3,$4,$5::uuid[],$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15::jsonb) result',[
 ids.project,ids.org,ids.actor,options.scope||'selected',options.towers||[ids.tower,bulkTower],options.category||'members',options.mode||'merge',options.role||'drawing_schedule',options.document||'schedule.csv','schedule.csv',options.profile||null,
 JSON.stringify(options.mapping||{applicable_towers:'Applicable'}),JSON.stringify(values.map((v,i)=>({row_number:i+2,values:v,raw_payload:v}))),true,
 JSON.stringify(options.rules||{memberIdentity:'source_variant',applicability:{kind:'tower_list',blank:'common',delimiter:','}})])).result;
}
test('applicability common plus explicit lists intersects single/selected/all scopes',{skip:!process.env.MATERIALS_APPLICABILITY},async()=>{
 const values=[{item_reference:'APP-COMMON',required_quantity:1},{item_reference:'APP-ONE',applicable_towers:'T001',bundle_reference:'7/1'},{item_reference:'APP-OTHER',applicable_towers:'T002'}];
 const r=await schedule(values,{scope:'single',towers:[ids.tower]});assert.equal(r.ok,true);assert.equal(r.appliedRequirementRows,2);assert.equal(r.commonRows,1);assert.equal(r.conditionalRows,2);
 const all=await schedule(values,{scope:'all'});assert.equal(all.ok,true);assert.equal(all.appliedRequirementRows,4);
 const none=await schedule([{item_reference:'APP-NONE',applicable_towers:'T002'}],{scope:'selected',towers:[ids.tower],document:'none.csv'});assert.equal(none.ok,true);assert.equal(none.appliedRequirementRows,0);
 const bad=await schedule([{item_reference:'APP-BAD',applicable_towers:'UNKNOWN'}]);assert.equal(bad.ok,true);assert.deepEqual(bad.unmatchedTowerReferences,['UNKNOWN']);assert.equal(bad.appliedRequirementRows,0);
});
test('packing variants remain tower-contextual and duplicate manifests are distinct',{skip:!process.env.MATERIALS_APPLICABILITY},async()=>{
 const values=[{item_reference:'1054H',bundle_reference:'7/1',applicable_towers:'T001'},{item_reference:'1054H',bundle_reference:'8/1',applicable_towers:'T002'}];
 const r=await schedule(values);assert.equal(r.ok,true);
 const members=(await db.query("select id,tower_id,bundle_reference from v2_material_register where item_reference='1054H'")).rows;
 assert.equal(members.length,2);assert.equal(members.find(x=>x.tower_id===ids.tower).bundle_reference,'7/1');assert.equal(members.find(x=>x.tower_id===bulkTower).bundle_reference,'8/1');
 const bundles=await schedule([{bundle_reference:'7/1',segment:'MAIN'},{bundle_reference:'7/1',segment:'+3M BOLTS'}],{scope:'single',towers:[ids.tower],category:'bundles',role:'supplier_list',mapping:{},rules:{bundleIdentity:'source_row'},document:'manifest.csv'});
 assert.equal(bundles.ok,true);assert.equal(bundles.addedRows,2);
 assert.equal((await scalar("select count(*)::int n from v2_material_bundles where tower_id=$1 and bundle_reference='7/1'",[ids.tower])).n,2);
 assert.equal((await scalar("select bundle_id from v2_material_register where id=$1",[members.find(x=>x.tower_id===ids.tower).id])).bundle_id,null);
 const contextual=await schedule([{item_reference:'1054H-CONTEXT',bundle_reference:'7/1',segment:'MAIN',applicable_towers:'T001'}]);assert.equal(contextual.ok,true);
 assert.ok((await scalar("select bundle_id from v2_material_register where item_reference='1054H-CONTEXT'")).bundle_id);
});
test('Members-first and Bundles-first resolve the same unique tower packing hints',{skip:!process.env.MATERIALS_APPLICABILITY},async()=>{
 const member=await schedule([{item_reference:'ORDER-M',bundle_reference:'ORDER-PACK',applicable_towers:'T001'}],{document:'order.csv'});assert.equal(member.ok,true);
 assert.equal((await scalar("select bundle_id from v2_material_register where item_reference='ORDER-M'")).bundle_id,null);
 const pack=await schedule([{bundle_reference:'ORDER-PACK'}],{scope:'single',towers:[ids.tower],category:'bundles',role:'supplier_list',mapping:{},rules:{bundleIdentity:'source_row'},document:'order-manifest.csv'});assert.equal(pack.ok,true);
 assert.ok((await scalar("select bundle_id from v2_material_register where item_reference='ORDER-M'")).bundle_id);
 const next=await schedule([{item_reference:'ORDER-LATER',bundle_reference:'ORDER-PACK',applicable_towers:'T001'}],{document:'order-later.csv'});assert.equal(next.ok,true);
 assert.ok((await scalar("select bundle_id from v2_material_register where item_reference='ORDER-LATER'")).bundle_id);
});
test('neutral schedule regression resolves 998 common plus 177 conditional, not 2278',{skip:!process.env.MATERIALS_APPLICABILITY},async()=>{
 const otherIds=Array.from({length:63},(_,i)=>'30000000-0000-0000-0003-'+String(i).padStart(12,'0'));
 await db.query("insert into v2_towers(id,organisation_id,project_id,tower_identifier) select x::uuid,$2,$3,'N-T'||(ordinality+2)::text from unnest($1::text[]) with ordinality as row(x,ordinality)",[otherIds,ids.org,ids.project]);
 const context=i=>({required_quantity:1,drawing_reference:'N-DRAWING',segment:'MAIN',bundle_reference:'N-PACK-'+(i%37+1)});
 const values=Array.from({length:998},(_,i)=>({item_reference:'NEUTRAL-C-'+i,...context(i)}));
 values.push(...Array.from({length:177},(_,i)=>({item_reference:i<75?'NEUTRAL-C-'+i:'NEUTRAL-X-'+i,...context(i),applicable_towers:'T001'})));
 values.push(...Array.from({length:1103},(_,i)=>({item_reference:'NEUTRAL-Y-'+(i%620),...context(i),applicable_towers:i%64===0?'T002':'N-T'+(i%64+2)})));
 assert.equal(new Set(values.map(x=>x.item_reference)).size,1720);
 const start=performance.now();
 const r=await schedule(values,{scope:'single',towers:[ids.tower],document:'neutral-regression.csv'});assert.equal(r.ok,true);assert.equal(r.acceptedRows,2278);assert.equal(r.appliedRequirementRows,1175);assert.equal(r.commonRows,998);assert.equal(r.conditionalRows,1280);assert.equal(r.referencedTowers,65);
 assert.equal((await scalar('select count(*)::int n from v2_material_import_source_rows where import_batch_id=$1',[r.batchId])).n,2278);
 assert.equal((await scalar('select count(distinct item_reference)::int n from v2_material_source_records where import_batch_id=$1',[r.batchId])).n,1100);
 const manifests=Array.from({length:37},(_,i)=>({bundle_reference:'N-PACK-'+(i+1),segment:'MAIN'}));manifests.push({bundle_reference:'N-PACK-6',segment:'+3M BOLTS'},{bundle_reference:'N-PACK-12',segment:'+3M BOLTS'});
 const packs=await schedule(manifests,{scope:'single',towers:[ids.tower],category:'bundles',role:'supplier_list',mapping:{},rules:{bundleIdentity:'source_row'},document:'neutral-manifest.csv'});assert.equal(packs.ok,true);assert.equal(packs.addedRows,39);
 const linked=await scalar('select count(*)::int n from v2_material_register m join v2_material_source_records s on s.material_item_id=m.id where s.import_batch_id=$1 and m.bundle_id is not null',[r.batchId]);assert.equal(linked.n,1175);
 console.log(JSON.stringify({benchmark:'neutral applicability schedule: 2278 source rows, 1175 effective rows, 39 manifest rows',milliseconds:Math.round(performance.now()-start)}));
});

async function reconcile(towers=[ids.tower,bulkTower]){
 return (await scalar('select public.tttracker_v2_reconcile_material_requirements($1,$2,$3,$4::uuid[]) result',[ids.project,ids.org,ids.actor,towers])).result;
}
test('reconciliation reports ambiguity, applicable requirements and source variants without guessing',{skip:!process.env.MATERIALS_APPLICABILITY},async()=>{
 await schedule([{item_reference:'RECON-AMBIG',bundle_reference:'RECON-PACK',applicable_towers:'T001'}],{document:'recon.csv'});
 await schedule([{bundle_reference:'RECON-PACK'},{bundle_reference:'RECON-PACK'}],{scope:'single',towers:[ids.tower],category:'bundles',role:'supplier_list',mapping:{},rules:{bundleIdentity:'source_row'},document:'recon-manifest.csv'});
 const r=await reconcile();assert.equal(r.ok,true);assert.equal(r.towerSummary.length,2);
 assert.ok(r.towerSummary.find(x=>x.tower_id===ids.tower).ambiguous_assignments>0);
 assert.ok((await scalar("select count(*)::int n from v2_material_reconciliation_findings where run_id=$1 and finding_type_key='ambiguous_duplicate_bundle_reference' and item_reference='RECON-AMBIG'",[r.runId])).n);
 assert.equal((await scalar("select bundle_id from v2_material_register where item_reference='RECON-AMBIG' and tower_id=$1",[ids.tower])).bundle_id,null);
 await assert.rejects(reconcile([ids.otherTower]),/Tower does not belong/);
});
test('blank rule is configurable and unsupported applicability cannot silently copy rows',{skip:!process.env.MATERIALS_APPLICABILITY},async()=>{
 const none=await schedule([{item_reference:'BLANK-NONE'}],{rules:{memberIdentity:'source_variant',applicability:{kind:'tower_list',blank:'none',delimiter:';'}}});assert.equal(none.ok,true);assert.equal(none.appliedRequirementRows,0);
 const error=await schedule([{item_reference:'BLANK-ERROR'}],{rules:{memberIdentity:'source_variant',applicability:{kind:'tower_list',blank:'error',delimiter:','}}});assert.equal(error.ok,false);
 await assert.rejects(schedule([{item_reference:'NO-RULE'}],{rules:{}}),/Configure a supported/);
 const repeated=await schedule([{item_reference:'REPEAT-TOKEN',applicable_towers:' t001 ;T001'}],{rules:{memberIdentity:'source_variant',applicability:{kind:'tower_list',blank:'common',delimiter:';'}}});assert.equal(repeated.ok,true);assert.equal(repeated.appliedRequirementRows,1);
});
test('variant Merge preserves independent receipts and Replace handles a now-inapplicable tower scope',{skip:!process.env.MATERIALS_APPLICABILITY},async()=>{
 const rows=[{item_reference:'VERSION-M',required_quantity:4,bundle_reference:'V-PACK'}];
 const r=await schedule(rows,{document:'version.csv'});assert.equal(r.ok,true);
 await db.query("update v2_material_register set received_quantity=2 where tower_id=$1 and item_reference='VERSION-M'",[ids.tower]);
 const merge=await schedule([{...rows[0],description:'Enriched',required_quantity:5}],{document:'version.csv'});assert.equal(merge.mergedRows,2);
 const state=(await db.query("select tower_id,received_quantity from v2_material_register where item_reference='VERSION-M'")).rows;assert.equal(state.find(x=>x.tower_id===ids.tower).received_quantity,'2');assert.equal(state.find(x=>x.tower_id===bulkTower).received_quantity,'0');
 const replace=await schedule([{...rows[0],applicable_towers:'T002'}],{mode:'replace',scope:'selected',towers:[ids.tower],document:'version.csv'});assert.equal(replace.ok,true);assert.equal(replace.appliedRequirementRows,0);
 assert.equal((await scalar("select is_active,received_quantity from v2_material_register where tower_id=$1 and item_reference='VERSION-M'",[ids.tower])).is_active,false);
 assert.equal((await scalar("select is_active from v2_material_register where tower_id=$1 and item_reference='VERSION-M'",[bulkTower])).is_active,true);
});
test('new applicability application rolls back shared source rows, target masters and late supersession failures',{skip:!process.env.MATERIALS_APPLICABILITY},async()=>{
 const before=await counts();const sharedBefore=await scalar('select count(*)::int n from v2_material_import_source_rows');
 await db.exec(`create function private.fail_schedule_test() returns trigger language plpgsql as $$ begin if new.item_reference='FAIL-SCHEDULE' then raise exception 'Injected schedule failure'; end if; return new; end $$;
 create trigger fail_schedule_test before insert on v2_material_source_records for each row execute function private.fail_schedule_test();`);
 await assert.rejects(schedule([{item_reference:'SCHEDULE-FIRST'},{item_reference:'FAIL-SCHEDULE'}],{mode:'replace',document:'version.csv'}),/Injected schedule failure/);
 assert.deepEqual(await counts(),before);assert.deepEqual(await scalar('select count(*)::int n from v2_material_import_source_rows'),sharedBefore);
 await db.exec('drop trigger fail_schedule_test on v2_material_source_records;drop function private.fail_schedule_test();');
});

test('new schedule and reconciliation RPCs remain service-only',{skip:!process.env.MATERIALS_APPLICABILITY},async()=>{
 for(const signature of ['public.tttracker_v2_apply_material_schedule(uuid,uuid,uuid,text,uuid[],text,text,text,text,text,text,jsonb,jsonb,boolean,jsonb)','public.tttracker_v2_reconcile_material_requirements(uuid,uuid,uuid,uuid[])']){
 const r=await scalar("select has_function_privilege('anon',$1,'EXECUTE') anon,has_function_privilege('authenticated',$1,'EXECUTE') authenticated,has_function_privilege('service_role',$1,'EXECUTE') service",[signature]);assert.deepEqual(r,{anon:false,authenticated:false,service:true});
 }
});

test('saved profile persists applicability and identity options without replacing unrelated defaults',{skip:!process.env.MATERIALS_APPLICABILITY},async()=>{
 const r=await schedule([{item_reference:'PROFILE-M'}],{profile:'Neutral Applicability'});assert.equal(r.ok,true);
 await db.query("update v2_material_import_profiles set defaults=defaults||'{\"customer_setting\":true}'::jsonb where name='Neutral Applicability'");
 const merged=await schedule([{item_reference:'PROFILE-M',description:'Enrich'}],{profile:'Neutral Applicability'});assert.equal(merged.ok,true);
 const profile=await scalar("select mapping,defaults from v2_material_import_profiles where name='Neutral Applicability'");
 assert.equal(profile.mapping.applicable_towers,'Applicable');assert.equal(profile.defaults.import_options.applicability.blank,'common');assert.equal(profile.defaults.customer_setting,true);
});

test('legacy manifest identity backfill reuses proven physical UUID and retains history',{skip:!process.env.MATERIALS_APPLICABILITY},async()=>{
 const before=await scalar("select id,manifest_row_key from v2_material_bundles where bundle_reference='LEGACY-MANIFEST'");assert.ok(before.manifest_row_key);
 const r=await schedule([{bundle_reference:'LEGACY-MANIFEST'}],{scope:'single',towers:[ids.tower],category:'bundles',role:'supplier_list',document:'legacy-manifest.csv',mapping:{},rules:{bundleIdentity:'source_row'}});
 assert.equal(r.ok,true);assert.equal(r.addedRows,0);assert.equal(r.mergedRows,1);
 assert.equal((await scalar("select id from v2_material_bundles where bundle_reference='LEGACY-MANIFEST'")).id,before.id);
});

test('unmatched applicability can be explicitly retained as source rules without cross-project target links',{skip:!process.env.MATERIALS_APPLICABILITY},async()=>{
 const r=await schedule([{item_reference:'RETAIN-COMMON'},{item_reference:'RETAIN-FUTURE',applicable_towers:'FUTURE-TOWER'}],{scope:'single',towers:[ids.tower],document:'retained.csv',rules:{applicability:{kind:'tower_list',blank:'common',delimiter:',',unmatched:'retain'}}});
 assert.equal(r.ok,true);assert.equal(r.acceptedRows,2);assert.equal(r.appliedRequirementRows,1);assert.deepEqual(r.unmatchedTowerReferences,['FUTURE-TOWER']);assert.equal(r.referencedTowers,1);
 assert.equal((await scalar('select count(*)::int n from v2_material_import_source_rows where import_batch_id=$1',[r.batchId])).n,2);
 assert.equal((await scalar("select count(*)::int n from v2_material_register where item_reference='RETAIN-FUTURE'")).n,0);
 await assert.rejects(schedule([{item_reference:'FOREIGN-TARGET'}],{towers:[ids.otherTower]}),/Tower does not belong/);
});
test('new schedule RPC keeps tower-from-CSV strict and project contextual',{skip:!process.env.MATERIALS_APPLICABILITY},async()=>{
 const r=await schedule([{tower_reference:'T001',bundle_reference:'NEW-CSV-1'},{tower_reference:'T002',bundle_reference:'NEW-CSV-1'}],{scope:'csv',towers:[],category:'bundles',role:'supplier_list',mapping:{tower_reference:'Tower'},rules:{bundleIdentity:'source_row'},document:'new-csv.csv'});assert.equal(r.ok,true);assert.equal(r.addedRows,2);
 const bad=await schedule([{tower_reference:'UNKNOWN-CSV',bundle_reference:'BAD'}],{scope:'csv',towers:[],category:'bundles',role:'supplier_list',mapping:{tower_reference:'Tower'},rules:{bundleIdentity:'source_row'}});assert.equal(bad.ok,false);assert.match(bad.rowErrors[0].message,/Unmatched tower/);
 const foreign=(await db.query("insert into v2_material_bundles(organisation_id,project_id,tower_id,bundle_reference) values($1,$2,$3,'FOREIGN-NEW') returning id",[ids.otherOrg,ids.otherProject,ids.otherTower])).rows[0];
 const before=await counts();const denied=await schedule([{item_reference:'FOREIGN-ID',bundle_id:foreign.id,applicable_towers:'T001'}]);assert.equal(denied.ok,false);assert.deepEqual(await counts(),before);
});

test('physical manifest section is separate from member profile and can disambiguate packing',{skip:!process.env.MATERIALS_APPLICABILITY},async()=>{
 const pack=await schedule([{bundle_reference:'CONTEXT-PACK',package_context:'STEEL'},{bundle_reference:'CONTEXT-PACK',package_context:'+3M BOLTS'}],{scope:'single',towers:[ids.tower],category:'bundles',role:'supplier_list',mapping:{},rules:{bundleIdentity:'source_row'},document:'context-manifest.csv'});assert.equal(pack.ok,true);assert.equal(pack.addedRows,2);
 const member=await schedule([{item_reference:'CONTEXT-MEMBER',bundle_reference:'CONTEXT-PACK',profile:'L90',package_context:'STEEL',applicable_towers:'T001'}],{document:'context-members.csv'});assert.equal(member.ok,true);
 const row=await scalar("select m.profile,m.package_context,b.package_context as manifest_context from v2_material_register m join v2_material_bundles b on b.id=m.bundle_id where m.item_reference='CONTEXT-MEMBER'");assert.equal(row.profile,'L90');assert.equal(row.package_context,'STEEL');assert.equal(row.manifest_context,'STEEL');
});

test('unresolved/partial lists remain valid and reconciliation evaluates a later tower without source duplication',{skip:!process.env.MATERIALS_APPLICABILITY},async()=>{
 const source=[{item_reference:'FUTURE-COMMON',required_quantity:3},{item_reference:'FUTURE-PARTIAL',applicable_towers:'T001,NEW-TOWER',required_quantity:2},{item_reference:'FUTURE-ONLY',applicable_towers:'NEW-TOWER',required_quantity:1}];
 const r=await schedule(source,{scope:'all',towers:(await db.query('select id from v2_towers where project_id=$1',[ids.project])).rows.map(t=>t.id),document:'future-evaluation.csv'});
 assert.equal(r.ok,true);assert.deepEqual(r.unmatchedTowerReferences,['NEW-TOWER']);assert.equal(r.outOfScopeRows,1);
 const before=await scalar('select count(*) n from v2_material_import_source_rows where import_batch_id=$1',[r.batchId]);assert.equal(before.n,3);
 const future='30000000-0000-0000-0000-000000009001';await db.query("insert into v2_towers(id,project_id,organisation_id,tower_identifier) values($1,$2,$3,'NEW-TOWER')",[future,ids.project,ids.org]);
 const first=(await scalar('select tttracker_v2_reevaluate_material_schedules($1,$2,$3,$4::uuid[]) result',[ids.project,ids.org,ids.actor,[future]])).result;
 assert.ok(first.newRelationships>=3);
 const applied=await scalar("select count(*) n from v2_material_register where tower_id=$1 and item_reference like 'FUTURE-%'",[future]);assert.equal(applied.n,3);
 assert.equal((await scalar('select count(*) n from v2_material_import_source_rows where import_batch_id=$1',[r.batchId])).n,3);
 const second=(await scalar('select tttracker_v2_reevaluate_material_schedules($1,$2,$3,$4::uuid[]) result',[ids.project,ids.org,ids.actor,[future]])).result;assert.equal(second.newRelationships,0);
 const links=await scalar('select count(*) n from v2_material_source_records where source_row_id in(select id from v2_material_import_source_rows where import_batch_id=$1) and tower_id=$2',[r.batchId,future]);assert.equal(links.n,3);
});
test('standalone profile save precedes import and preserves customer defaults',{skip:!process.env.MATERIALS_APPLICABILITY},async()=>{
 const defaults={import_category_key:'members',customer_setting:true,import_options:{applicability:{kind:'tower_list',blank:'common',delimiter:',',unmatched:'retain'}}};
 const save=async d=>(await scalar('select tttracker_v2_save_material_import_profile($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) id',[ids.project,ids.org,ids.actor,'Standalone schedule','drawing_schedule',JSON.stringify({applicable_towers:'Applicable Towers'}),JSON.stringify(d)])).id;
 const id=await save(defaults);await save({import_category_key:'members',import_options:defaults.import_options});
 const profile=await scalar('select * from v2_material_import_profiles where id=$1',[id]);assert.equal(profile.defaults.import_options.applicability.blank,'common');assert.equal(profile.defaults.customer_setting,true);
});

test('scoped Replace tombstones prevent reconciliation from resurrecting removed requirements',{skip:!process.env.MATERIALS_APPLICABILITY},async()=>{
 const document='reevaluation-replace.csv';const first=await schedule([{item_reference:'RERUN-KEEP'},{item_reference:'RERUN-REMOVE'}],{document});assert.equal(first.ok,true);
 await schedule([{item_reference:'RERUN-KEEP',applicable_towers:'T002'}],{document,mode:'replace',scope:'selected',towers:[ids.tower]});
 const run=(await scalar('select tttracker_v2_reconcile_material_requirements($1,$2,$3,$4::uuid[]) result',[ids.project,ids.org,ids.actor,[ids.tower]])).result;assert.equal(run.ok,true);
 const states=(await db.query("select tower_id,item_reference,is_active from v2_material_register where item_reference like 'RERUN-%'")).rows;
 assert.ok(states.filter(row=>row.tower_id===ids.tower).every(row=>!row.is_active));assert.ok(states.filter(row=>row.tower_id===bulkTower).every(row=>row.is_active));
});
test('reevaluation failure rolls back all newly resolved relationships and remains service-only',{skip:!process.env.MATERIALS_APPLICABILITY},async()=>{
 const source=await schedule([{item_reference:'REEVAL-FAIL',applicable_towers:'LATE-TARGET'}],{document:'reeval-rollback.csv',scope:'all',towers:(await db.query('select id from v2_towers where project_id=$1',[ids.project])).rows.map(row=>row.id)});assert.equal(source.ok,true);
 const target='30000000-0000-0000-0000-000000009002';await db.query("insert into v2_towers(id,project_id,organisation_id,tower_identifier) values($1,$2,$3,'LATE-TARGET')",[target,ids.project,ids.org]);
 const before=await counts();
 await db.exec("create function private.fail_reevaluation() returns trigger language plpgsql as $$ begin if new.item_reference='REEVAL-FAIL' then raise exception 'late reevaluation failure'; end if; return new; end $$; create trigger reevaluation_failure before insert on v2_material_source_records for each row execute function private.fail_reevaluation();");
 await assert.rejects(scalar('select tttracker_v2_reevaluate_material_schedules($1,$2,$3,$4::uuid[]) result',[ids.project,ids.org,ids.actor,[target]]),/late reevaluation failure/);
 await db.exec('drop trigger reevaluation_failure on v2_material_source_records; drop function private.fail_reevaluation();');assert.deepEqual(await counts(),before);
 const priv=await scalar("select has_function_privilege('authenticated','public.tttracker_v2_reevaluate_material_schedules(uuid,uuid,uuid,uuid[])','execute') allowed");assert.equal(priv.allowed,false);
});

test('reevaluation preserves CSV per-row targets and refuses foreign tower scopes',{skip:!process.env.MATERIALS_APPLICABILITY},async()=>{
 const r=await schedule([{item_reference:'CSV-EXCLUDED',tower_reference:'T001',applicable_towers:'T002'},{item_reference:'CSV-VALID',tower_reference:'T002'}],{scope:'csv',towers:[],document:'csv-evaluation.csv',mapping:{tower_reference:'Tower',applicable_towers:'Applicable'}});assert.equal(r.ok,true);assert.equal(r.appliedRequirementRows,1);
 await scalar('select tttracker_v2_reevaluate_material_schedules($1,$2,$3,$4::uuid[]) result',[ids.project,ids.org,ids.actor,[ids.tower,bulkTower]]);
 assert.equal((await scalar("select count(*) n from v2_material_register where item_reference='CSV-EXCLUDED'")).n,0);
 await assert.rejects(scalar('select tttracker_v2_reevaluate_material_schedules($1,$2,$3,$4::uuid[]) result',[ids.project,ids.org,ids.actor,[ids.otherTower]]),/Tower does not belong/);
});

test('current import/reconciliation mutation statements have explicit WHERE clauses',{skip:!process.env.MATERIALS_APPLICABILITY},async()=>{
 const definitions=(await db.query("select proname,pg_get_functiondef(oid) definition from pg_proc where proname in ('tttracker_v2_apply_material_schedule','tttracker_v2_apply_material_import_bulk','tttracker_v2_apply_material_import','tttracker_v2_reevaluate_material_schedules','tttracker_v2_reconcile_material_requirements','tttracker_v2_save_material_import_profile')")).rows;
 for(const fn of definitions)for(const statement of fn.definition.match(/\b(?:update\s+(?:public|pg_temp)\.|delete\s+from\s+(?:public|pg_temp)\.)[\s\S]*?;/gi)||[])assert.match(statement,/\bwhere\b/i,`${fn.proname}: ${statement}`);
 const current=definitions.find(fn=>fn.proname==='tttracker_v2_apply_material_schedule');assert.match(current.definition,/where source_id is not null and variant_key is null/);
});
test('2202-row Member schedule commits across 30 targets with common/conditional source provenance',{skip:!process.env.MATERIALS_APPLICABILITY},async()=>{
 const towers=(await db.query('select id,tower_identifier from v2_towers where project_id=$1 order by tower_identifier limit 30',[ids.project])).rows;assert.equal(towers.length,30);
 const values=[...Array.from({length:922},(_,i)=>({item_reference:`SAFE-C${i}`,required_quantity:1})),...Array.from({length:1280},(_,i)=>({item_reference:`SAFE-S${i}`,required_quantity:1,applicable_towers:towers[i%30].tower_identifier}))];
 const other=async()=> (await db.query("select to_jsonb(m) snapshot from v2_material_register m where project_id=$1 order by id",[ids.otherProject])).rows;
 const before=await other();const start=performance.now();const result=await schedule(values,{scope:'selected',towers:towers.map(t=>t.id),document:'safe-2202.csv'});
 assert.equal(result.ok,true);assert.equal(result.acceptedRows,2202);assert.equal(result.commonRows,922);assert.equal(result.conditionalRows,1280);assert.equal(result.appliedRequirementRows,28940);
 assert.equal((await scalar('select count(*) n from v2_material_import_source_rows where import_batch_id=$1',[result.batchId])).n,2202);assert.deepEqual(await other(),before);
 console.log(JSON.stringify({benchmark:'safe-update 2202 source rows / 30 targets',effective:result.appliedRequirementRows,milliseconds:Math.round(performance.now()-start)}));
});
test('separate import batches cannot mutate each others source or staging-derived records',{skip:!process.env.MATERIALS_APPLICABILITY},async()=>{
 const first=await schedule([{item_reference:'SAFE-BATCH-M',applicable_towers:'T001',required_quantity:2}],{document:'safe-batch-A.csv'});
 const snapshot=async()=> (await db.query('select to_jsonb(s) snapshot from v2_material_source_records s where import_batch_id=$1 order by id',[first.batchId])).rows;
 const before=await snapshot();
 const second=await schedule([{item_reference:'SAFE-BATCH-M',applicable_towers:'T002',required_quantity:9}],{document:'safe-batch-B.csv'});
 assert.equal(second.ok,true);assert.notEqual(second.batchId,first.batchId);assert.deepEqual(await snapshot(),before);
 const source=(await db.query('select import_batch_id,source_row_number,values from v2_material_import_source_rows where import_batch_id=any($1::uuid[]) order by import_batch_id',[[first.batchId,second.batchId]])).rows;assert.equal(source.length,2);assert.ok(source.some(row=>row.values.required_quantity===2));assert.ok(source.some(row=>row.values.required_quantity===9));
});


test('physical UUID assignment accepts unique packing reference despite different engineering/manifest segments in either import order', {skip:!process.env.MATERIALS_APPLICABILITY}, async()=>{
 for(const order of ['members-first','bundles-first']) {
  const ref=`ORDER-${order}`;
  const members=()=>schedule([{item_reference:`ITEM-${order}`,bundle_reference:ref,segment:'Super Structure Ladder',required_quantity:2}],{scope:'single',towers:[ids.tower],document:`${order}-members.csv`});
  const bundles=()=>schedule([{bundle_reference:ref,segment:'LADDER'}],{scope:'single',towers:[ids.tower],category:'bundles',role:'supplier_list',rules:{bundleIdentity:'source_row'},mapping:{},document:`${order}-packs.csv`});
  let source;
  if(order==='members-first'){source=await members();assert.equal(source.ok,true);await bundles();}else{await bundles();source=await members();}
  const row=await scalar('select m.id,m.bundle_id,m.received_quantity,b.segment from v2_material_register m join v2_material_bundles b on b.id=m.bundle_id where m.item_reference=$1',[`ITEM-${order}`]);
  assert.ok(row?.bundle_id);assert.equal(row.segment,'LADDER');
  assert.equal((await scalar('select count(*)::int n from v2_material_bundle_members where material_item_id=$1 and bundle_id=$2',[row.id,row.bundle_id])).n,1);
  assert.equal((await scalar('select bundle_id from v2_material_source_records where import_batch_id=$1',[source.batchId])).bundle_id,row.bundle_id);
  await reconcile([ids.tower]);assert.equal((await scalar('select count(*)::int n from v2_material_bundle_members where material_item_id=$1',[row.id])).n,1);
 }
});

test('duplicate physical refs stay separate; exact context resolves one UUID and absent comparable context remains ambiguous', {skip:!process.env.MATERIALS_APPLICABILITY}, async()=>{
 const ref='DUP-PHYSICAL-1/6';
 await schedule([{bundle_reference:ref,segment:'MAIN'},{bundle_reference:ref,segment:'EXTENSION'}],{scope:'single',towers:[ids.tower],category:'bundles',role:'supplier_list',rules:{bundleIdentity:'source_row'},mapping:{},document:'duplicate-context-manifest.csv'});
 await schedule([{item_reference:'DUP-RESOLVED',bundle_reference:ref,segment:'MAIN'},{item_reference:'DUP-PENDING',bundle_reference:ref,segment:'Different engineering vocabulary'}],{scope:'single',towers:[ids.tower],document:'duplicate-context-members.csv'});
 const linked=await scalar("select m.bundle_id,b.segment from v2_material_register m join v2_material_bundles b on b.id=m.bundle_id where m.item_reference='DUP-RESOLVED'");assert.equal(linked.segment,'MAIN');
 assert.equal((await scalar("select bundle_id from v2_material_register where item_reference='DUP-PENDING'")).bundle_id,null);
 const run=await reconcile([ids.tower]);assert.ok(run.towerSummary[0].ambiguous_assignments>0);
 assert.equal((await scalar("select count(*)::int n from v2_material_bundle_members l join v2_material_register m on m.id=l.material_item_id where m.item_reference='DUP-PENDING'")).n,0);
});

test('reconciliation repairs existing pending imports without changing receipts or another project', {skip:!process.env.MATERIALS_APPLICABILITY}, async()=>{
 await schedule([{bundle_reference:'REPAIR-OLD',segment:'PACKING SECTION'}],{scope:'single',towers:[ids.tower],category:'bundles',role:'supplier_list',rules:{bundleIdentity:'source_row'},mapping:{},document:'repair-packs.csv'});
 await schedule([{item_reference:'REPAIR-OLD-MEMBER',bundle_reference:'REPAIR-OLD',segment:'Engineering section'}],{scope:'single',towers:[ids.tower],document:'repair-members.csv'});
 const row=await scalar("select id from v2_material_register where item_reference='REPAIR-OLD-MEMBER'");
 await db.query('delete from v2_material_bundle_members where material_item_id=$1',[row.id]);
 await db.query('update v2_material_register set bundle_id=null,received_quantity=7 where id=$1',[row.id]);
 const before=(await db.query('select to_jsonb(m) data from v2_material_register m where project_id=$1 order by id',[ids.otherProject])).rows;
 await reconcile([ids.tower]);
 const repaired=await scalar('select bundle_id,received_quantity from v2_material_register where id=$1',[row.id]);assert.ok(repaired.bundle_id);assert.equal(Number(repaired.received_quantity),7);
 assert.deepEqual((await db.query('select to_jsonb(m) data from v2_material_register m where project_id=$1 order by id',[ids.otherProject])).rows,before);
});
