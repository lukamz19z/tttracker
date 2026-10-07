const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const root=path.resolve(__dirname,'../..');const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
let db;const org=id(1),project=id(2),foreign=id(3),tower=id(4),otherTower=id(5),actor=id(6);
function table(file,name){return fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8').match(new RegExp(`create table if not exists public\\.${name} \\([\\s\\S]*?\\n\\);`))[0];}
before(async()=>{
 db=new PGlite();await db.exec(`create schema auth;create schema private;create role anon;create role authenticated;create role service_role;
 create table auth.users(id uuid primary key);create table organisations(id uuid primary key);create table v2_projects(id uuid primary key);
 create table v2_towers(id uuid primary key,project_id uuid,organisation_id uuid);create table v2_material_locations(id uuid primary key);
 create table v2_material_register(id uuid primary key);create table v2_daily_dockets(id uuid primary key);
 create table v2_material_bundles(id uuid primary key,tower_id uuid,project_id uuid);
 insert into auth.users values('${actor}');insert into organisations values('${org}');insert into v2_projects values('${project}'),('${foreign}');
 insert into v2_towers values('${tower}','${project}','${org}'),('${otherTower}','${foreign}','${org}');
 create table v2_material_bundle_checks(id uuid primary key,bundle_id uuid,status text);`);
 for(const name of ['v2_material_deliveries','v2_material_delivery_items'])await db.exec(table('20261002163500_material_bundle_deliveries_two_stage.sql',name));
 await db.exec(`alter table v2_material_delivery_items add column driver_checked_by_name text;`);
 await db.exec(table('20261002062325_materials_traceability_control.sql','v2_material_issues'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261003124500_materials_issue_tower_delivery_completion.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261004042200_materials_delivery_bulk_outcomes.sql'),'utf8'));
});
after(async()=>db.close());
async function fixture(n,count=2){const delivery=id(n);await db.query(`insert into v2_material_deliveries(id,organisation_id,project_id,delivery_number)values($1,$2,$3,$4)`,[delivery,org,project,'DEL-'+n]);
 const items=[];for(let i=0;i<count;i++){const bundle=id(n+100+i),item=id(n+200+i);items.push(item);await db.query(`insert into v2_material_bundles values($1,$2,$3)`,[bundle,tower,project]);await db.query(`insert into v2_material_bundle_checks values($1,$2,'not_checked')`,[id(n+300+i),bundle]);await db.query(`insert into v2_material_delivery_items(id,organisation_id,project_id,delivery_id,tower_id,bundle_id,expected_quantity)values($1,$2,$3,$4,$5,$6,1)`,[item,org,project,delivery,tower,bundle]);}return {delivery,items};}
async function transition(f,item,status='delivered',action='driver_check',reason=null,expected=null,targetProject=project){return (await db.query(`select public.tttracker_v2_delivery_transition($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result`,[targetProject,f.delivery,item,action,status,status==='delivered'?1:0,actor,'Test Operator',reason,expected])).rows[0].result;}
async function header(f){return(await db.query('select * from v2_material_deliveries where id=$1',[f.delivery])).rows[0];}
test('scheduled stays planned until actual workflow; first line is in progress; final line completes with authenticated attribution',async()=>{
 const f=await fixture(1000);assert.equal((await header(f)).status,'planned');await transition(f,null,'planned','start');assert.equal((await header(f)).status,'in_transit');
 await transition(f,f.items[0]);assert.equal((await header(f)).completed_at,null);assert.equal((await header(f)).status,'in_transit');
 await transition(f,f.items[1],'rejected');const d=await header(f);assert.equal(d.status,'delivered_with_issues');assert.ok(d.completed_at);assert.equal(d.completed_by,actor);assert.equal(d.completed_by_name,'Test Operator');
 assert.equal((await db.query(`select count(*)::int n from v2_material_bundle_checks where status<>'not_checked'`)).rows[0].n,0);
});
test('identical repeated requests are no-op and conflicting outcome requires correction',async()=>{
 const f=await fixture(2000,1);await transition(f,f.items[0]);const first=await header(f);
 assert.equal((await transition(f,f.items[0])).unchanged,true);assert.deepEqual(await header(f),first);
 assert.equal((await db.query(`select jsonb_array_length(metadata->'outcome_history') n from v2_material_delivery_items where id=$1`,[f.items[0]])).rows[0].n,1);
 await assert.rejects(transition(f,f.items[0],'rejected'),/already recorded/);
 await assert.rejects(transition(f,null,'planned','start'),/cannot be started/);
});
test('explicit reasoned reopen retains audit then re-completes; stale corrections fail',async()=>{
 const f=await fixture(3000,1);await transition(f,f.items[0]);await assert.rejects(transition(f,f.items[0],'planned','correct_outcome'),/reason required/);
 await transition(f,f.items[0],'planned','correct_outcome','Wrong physical pack','delivered');const d=await header(f);assert.equal(d.status,'in_transit');assert.equal(d.completed_at,null);
 const row=(await db.query('select metadata from v2_material_delivery_items where id=$1',[f.items[0]])).rows[0];assert.equal(row.metadata.outcome_history[1].previous_status,'delivered');assert.equal(row.metadata.outcome_history[1].actor,actor);assert.equal(row.metadata.outcome_history[1].reason,'Wrong physical pack');
 await assert.rejects(transition(f,f.items[0],'rejected','correct_outcome','Stale tab','delivered'),/refresh/);await transition(f,f.items[0],'rejected');assert.ok((await header(f)).completed_at);
});
test('cross-project, wrong delivery and malformed quantities cannot mutate outcomes',async()=>{
 const a=await fixture(4000,1),b=await fixture(5000,1);await assert.rejects(transition(a,a.items[0],'delivered','driver_check',null,null,foreign),/unavailable/);
 await assert.rejects(transition(a,b.items[0]),/unavailable/);assert.equal((await header(a)).status,'planned');
 await assert.rejects(db.query(`select tttracker_v2_delivery_transition($1,$2,$3,'driver_check','delivered','NaN',$4,'Actor',null,null)`,[project,a.delivery,a.items[0],actor]),/quantity/);
});
test('late header failure rolls back line outcome and audit together',async()=>{
 const f=await fixture(6000,1);await db.exec(`create function private.fail_completion() returns trigger language plpgsql as $$begin if new.id='${f.delivery}' and new.completed_at is not null then raise exception 'forced late failure';end if;return new;end$$;create trigger forced_completion_failure before update on v2_material_deliveries for each row execute function private.fail_completion();`);
 await assert.rejects(transition(f,f.items[0]),/forced late failure/);const row=(await db.query('select status,metadata from v2_material_delivery_items where id=$1',[f.items[0]])).rows[0];assert.equal(row.status,'planned');assert.deepEqual(row.metadata,{});await db.exec('drop trigger forced_completion_failure on v2_material_deliveries');
});
test('affected tower is required, project scoped and immutable through later movement',async()=>{
 const insert=async(t)=>db.query(`insert into v2_material_issues(id,organisation_id,project_id,issue_number,issue_type_key,tower_id) values($1,$2,$3,'MAT-1','missing',$4)`,[id(7000),org,project,t]);
 await assert.rejects(insert(null),/required/);await assert.rejects(insert(otherTower),/Invalid affected tower/);await insert(tower);
 await db.query(`update v2_material_issues set current_tower_id=$1 where id=$2`,[otherTower,id(7000)]);assert.equal((await db.query('select tower_id from v2_material_issues where id=$1',[id(7000)])).rows[0].tower_id,tower);
 await assert.rejects(db.query('update v2_material_issues set tower_id=$1 where id=$2',[otherTower,id(7000)]),/cannot be changed/);
});
test('browser roles cannot execute service transition RPC',async()=>{
 const grants=(await db.query(`select has_function_privilege('authenticated','public.tttracker_v2_delivery_transition(uuid,uuid,uuid,text,text,numeric,uuid,text,text,text)','EXECUTE') allowed`)).rows[0];assert.equal(grants.allowed,false);
});
test('independent site verification cannot reopen or complete a docket',async()=>{
 const f=await fixture(8000,1);await transition(f,f.items[0]);const old=await header(f);await db.query(`update v2_material_bundle_checks set status='arrived' where bundle_id=$1`,[id(8100)]);assert.deepEqual(await header(f),old);
});

const ts=require(path.join(root,'v2/node_modules/typescript'));
function compile(file,deps={}){const exp={};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;new Function('require','exports',code)(name=>{if(name in deps)return deps[name];throw new Error('Missing test dependency '+name);},exp);return exp;}
const policy=compile('v2/lib/materials/access-policy.ts');
const relationships=compile('v2/lib/materials/relationship-security.ts',{'./access-policy':policy});
const actorHelper=compile('v2/lib/materials/project-actor.ts');
async function issueRequest(body,materialKind='member'){
 const captured=[];const material=id(9000),bundle=id(9001);const registered={id:material,project_id:project,organisation_id:org,tower_id:tower,bundle_id:bundle,material_kind:materialKind,item_reference:'100H',description:'Canonical material',segment:'Top Crossarms',drawing_reference:'DRAW-24',profile:'L100*8',required_quantity:2,unit:'ea',bundle_reference:'1/5'};
 const rows={v2_towers:[{id:tower,project_id:project,organisation_id:org},{id:id(9999),project_id:project,organisation_id:org},{id:otherTower,project_id:foreign,organisation_id:org}],v2_material_register:[registered],v2_material_bundles:[{id:bundle,project_id:project,organisation_id:org,tower_id:tower,bundle_reference:'1/5',segment:'Top Crossarms',required_quantity:1}]};
 const context={project:{id:project},dataOrganisationId:org,workspace:{userId:actor}};
 const admin={rpc:async()=>({data:'MAT-1',error:null}),from:table=>{let inserted;return {insert(value){inserted=value;captured.push({table,value});return this;},select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null,error:null}),single:async()=>({data:{id:id(9900),issue_number:'MAT-1'},error:null}),then(resolve,reject){return Promise.resolve({data:inserted,error:null}).then(resolve,reject);}};}};
 const route=compile('v2/app/api/projects/[projectId]/materials/issues/route.ts',{'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},'@/lib/supabase/admin':{createSupabaseAdmin:()=>admin},'@/lib/materials/project-actor':actorHelper,'@/lib/materials/security':{requireMaterialsContext:async()=>context,validateMaterialsRequest:async(_,value)=>relationships.validateMaterialRelationships(value,async(table,key)=>rows[table]?.find(row=>row.id===key&&row.project_id===project&&row.organisation_id===org)||null),materialsErrorResponse:error=>({status:error.status||400,body:{error:error.message}})}});
 const response=await route.POST({json:async()=>({...body})},{params:Promise.resolve({projectId:project})});return {response,captured,registered,material,bundle};
}
test('actual issue API rejects missing affected tower, foreign tower and material/tower mismatch before inserts',async()=>{
 for(const body of [{itemReference:'Manual'},{towerId:otherTower},{towerId:otherTower,materialItemId:id(9000)}]){const {response,captured}=await issueRequest(body);assert.notEqual(response.status,200);assert.equal(captured.length,0);}
 const mismatchedTower=id(9999);const result=await issueRequest({towerId:mismatchedTower,materialItemId:id(9000)});assert.notEqual(result.response.status,200);assert.equal(result.captured.length,0);
});
test('actual issue API derives Member/Bolt/Packer metadata and actor; movement fields do not replace affected tower',async()=>{
 for(const kind of ['member','bolt','packer']){
  const {response,captured}=await issueRequest({towerId:tower,materialItemId:id(9000),itemReference:'Browser lie',affectedSegment:'Browser lie',raisedBy:id(9999),currentTowerId:tower,quantity:1,sourceTowerId:id(9999),destinationTowerId:id(9999)},kind);
  assert.equal(response.status,200);const issue=captured.find(row=>row.table==='v2_material_issues').value;assert.equal(issue.tower_id,tower);assert.equal(issue.raised_by,actor);assert.equal(issue.item_reference,'100H');assert.equal(issue.affected_segment,'Top Crossarms');assert.equal(issue.bundle_id,id(9001));assert.equal(issue.metadata.drawing_reference,'DRAW-24');assert.equal(issue.metadata.material_kind,kind);
 }
});
test('actual Bundle issue retains the physical UUID and derived tower/context',async()=>{
 const {response,captured}=await issueRequest({bundleId:id(9001),quantity:1});assert.equal(response.status,200);const issue=captured[0].value;assert.equal(issue.tower_id,tower);assert.equal(issue.bundle_id,id(9001));assert.equal(issue.item_reference,'1/5');assert.equal(issue.metadata.material_kind,'bundle');
});

test('concurrent identical confirmations serialize to one audit entry and one completion',async()=>{
 const f=await fixture(10000,1);const results=await Promise.all([transition(f,f.items[0]),transition(f,f.items[0])]);assert.ok(results.some(result=>result.unchanged));
 const row=(await db.query(`select jsonb_array_length(metadata->'outcome_history') n from v2_material_delivery_items where id=$1`,[f.items[0]])).rows[0];assert.equal(row.n,1);
});
test('traceability can retain original affected tower when the registered material has moved',async()=>{
 const movedTower=id(11000),issueId=id(11001),materialId=id(11002),bundleId=id(11003);const issue={id:issueId,project_id:project,organisation_id:org,tower_id:tower,material_item_id:materialId,bundle_id:bundleId,unit:'ea'};
 const rows={v2_material_issues:[issue],v2_towers:[{id:tower},{id:movedTower}],v2_material_register:[{id:materialId,tower_id:movedTower,bundle_id:null}],v2_material_bundles:[{id:bundleId,tower_id:tower}]};const writes=[];
 const context={project:{id:project},dataOrganisationId:org,workspace:{userId:actor}};
 const admin={rpc:async()=>({error:null}),from:table=>{let inserted;return {select(){return this;},eq(){return this;},insert(value){inserted=value;writes.push({table,value});return this;},single:async()=>({data:inserted?{id:id(11004)}:issue,error:null})};}};
 const route=compile('v2/app/api/projects/[projectId]/materials/issues/[issueId]/events/route.ts',{'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},'@/lib/supabase/admin':{createSupabaseAdmin:()=>admin},'@/lib/materials/project-actor':actorHelper,'@/lib/materials/security':{requireMaterialsContext:async()=>context,validateMaterialsRequest:async(_,body)=>relationships.validateMaterialRelationships(body,async(table,key)=>rows[table]?.find(row=>row.id===key)||null),materialsErrorResponse:error=>({status:error.status||400,body:{error:error.message}})}});
 const result=await route.POST({json:async()=>({eventTypeKey:'note',quantity:0,sourceTowerId:movedTower,destinationTowerId:tower})},{params:Promise.resolve({projectId:project,issueId})});assert.equal(result.status,200);assert.deepEqual(writes.map(row=>row.table),['v2_material_issue_events']);assert.equal(issue.tower_id,tower);assert.equal(writes[0].value.created_by,actor);
});

async function bulk(f,status='delivered',targetProject=project,items=f.items){return(await db.query('select tttracker_v2_delivery_bulk_outcome($1,$2,$3,$4,$5,$6) result',[targetProject,f.delivery,items,status,actor,'Test Operator'])).rows[0].result;}
test('bulk Delivered preserves seven prior outcomes, audits all 23 pending UUID lines, completes and retries without changes',async()=>{
 const f=await fixture(12000,30);for(let i=0;i<7;i++)await transition(f,f.items[i],i<5?'delivered':'rejected');
 const prior=(await db.query('select * from v2_material_delivery_items where id=any($1) order by id',[f.items.slice(0,7)])).rows;
 assert.equal((await bulk(f)).applied,23);assert.deepEqual((await db.query('select * from v2_material_delivery_items where id=any($1) order by id',[f.items.slice(0,7)])).rows,prior);
 const counts=(await db.query('select status,count(*)::int n from v2_material_delivery_items where delivery_id=$1 group by status',[f.delivery])).rows;assert.equal(counts.find(r=>r.status==='delivered').n,28);assert.equal(counts.find(r=>r.status==='rejected').n,2);
 const audited=(await db.query('select * from v2_material_delivery_items where id=$1',[f.items[7]])).rows[0];assert.equal(audited.driver_checked_by,actor);assert.ok(audited.driver_checked_at);assert.equal(audited.metadata.outcome_history.length,1);assert.equal(audited.metadata.outcome_history[0].previous_status,'planned');assert.equal(audited.metadata.outcome_history[0].new_status,'delivered');assert.equal(audited.metadata.outcome_history[0].reason,'Bulk pending delivery outcome');assert.equal(audited.delivery_id,f.delivery);
 const complete=await header(f);assert.equal(complete.status,'delivered_with_issues');assert.equal(complete.completed_by,actor);assert.ok(complete.completed_at);assert.equal((await bulk(f)).unchanged,true);assert.deepEqual(await header(f),complete);
 assert.equal((await db.query(`select count(*)::int n from v2_material_bundle_checks where bundle_id=any($1) and status<>'not_checked'`,[f.items.map((_,i)=>id(12100+i))])).rows[0].n,0);
});
test('bulk Not Delivered only acts on pending lines, and scheduled records cannot receive bulk outcomes',async()=>{
 const f=await fixture(13000,3);await assert.rejects(bulk(f,'rejected'),/Begin actual delivery/);await transition(f,f.items[0]);assert.equal((await bulk(f,'rejected')).applied,2);assert.equal((await header(f)).status,'delivered_with_issues');assert.equal((await db.query('select status from v2_material_delivery_items where id=$1',[f.items[0]])).rows[0].status,'delivered');
});
test('bulk late failure rolls back earlier line audits, header updates and completion',async()=>{
 const f=await fixture(14000,2);await transition(f,null,'planned','start');const old=await header(f);await db.query('update v2_material_bundles set tower_id=$1 where id=$2',[otherTower,id(14101)]);await assert.rejects(bulk(f),/relationship invalid/);
 const rows=(await db.query('select status,metadata from v2_material_delivery_items where delivery_id=$1',[f.delivery])).rows;assert.ok(rows.every(row=>row.status==='planned'&&Object.keys(row.metadata).length===0));assert.deepEqual(await header(f),old);
});
test('bulk refuses cross-project scope, missing authorization snapshots and browser RPC access',async()=>{
 const f=await fixture(15000,2);await transition(f,null,'planned','start');await assert.rejects(bulk(f,'delivered',foreign),/unavailable/);await assert.rejects(bulk(f,'delivered',project,[f.items[0]]),/refresh/);
 assert.equal((await db.query(`select has_function_privilege('authenticated','public.tttracker_v2_delivery_bulk_outcome(uuid,uuid,uuid[],text,uuid,text)','EXECUTE') allowed`)).rows[0].allowed,false);assert.equal((await header(f)).status,'in_transit');
});

test('actual bulk API derives actor and pending IDs on server; record authorization completes before the single RPC',async()=>{
 const deliveryId=id(16000),line=id(16001),bundle=id(16002);const records={v2_material_deliveries:[{id:deliveryId,project_id:project,organisation_id:org,status:'in_transit'}],v2_material_delivery_items:[{id:line,delivery_id:deliveryId,bundle_id:bundle,tower_id:tower,project_id:project,organisation_id:org,status:'planned'}],v2_material_bundles:[{id:bundle,tower_id:tower,project_id:project,organisation_id:org}],v2_towers:[{id:tower,project_id:project,organisation_id:org}],v2_project_option_definitions:[]};const calls=[];let denyLine=false;
 const admin={auth:{admin:{getUserById:async key=>{assert.equal(key,actor);return {data:{user:{user_metadata:{full_name:'Test Operator'}}}};}}},rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true,applied:1},error:null};},from:table=>{const filters=[];let from=0,to=999;const results=()=>records[table].filter(row=>filters.every(([key,value])=>row[key]===value)).slice(from,to+1);return {select(){return this;},eq(key,value){filters.push([key,value]);return this;},order(){return this;},range(a,b){from=a;to=b;return this;},maybeSingle:async()=>({data:results()[0]||null,error:null}),then(resolve,reject){return Promise.resolve({data:results(),error:null}).then(resolve,reject);}};}};
 const context={project:{id:project},dataOrganisationId:org,workspace:{userId:actor}};
 const route=compile('v2/app/api/projects/[projectId]/materials/deliveries/route.ts',{'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},'@/lib/supabase/admin':{createSupabaseAdmin:()=>admin},'@/lib/materials/project-actor':actorHelper,'@/lib/materials/read-pages':compile('v2/lib/materials/read-pages.ts'),'@/lib/materials/delivery-planning':compile('v2/lib/materials/delivery-planning.ts'),'@/lib/materials/security':{requireMaterialsContext:async(_,__,capability)=>{assert.equal(capability,'manage_deliveries');return context;},validateMaterialsRequest:async(_,body)=>relationships.validateMaterialRelationships(body,async(table,key)=>{if(denyLine&&key===line)throw new policy.MaterialsSecurityError('MATERIALS_RECORD_DENIED',403);return records[table]?.find(row=>row.id===key&&row.project_id===project&&row.organisation_id===org)||null;}),materialsErrorResponse:error=>({status:error.status||400,body:{error:error.message}})}});
 const post=()=>route.POST({json:async()=>({action:'bulk_driver_check',deliveryId,status:'delivered',actor:id(99999),itemIds:[id(99999)]})},{params:Promise.resolve({projectId:project})});
 assert.equal((await post()).status,200);assert.equal(calls.length,1);assert.equal(calls[0].name,'tttracker_v2_delivery_bulk_outcome');assert.equal(calls[0].args.p_actor,actor);assert.deepEqual(calls[0].args.p_item_ids,[line]);denyLine=true;assert.equal((await post()).status,403);assert.equal(calls.length,1);
});
