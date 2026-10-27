import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(file,mocks={}){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{if(name in mocks)return mocks[name];throw Error('Missing mock '+name);},exports);return exports;}
const model=load('lib/people/ppe.ts');
const db=new PGlite();
const emp='00000000-0000-0000-0000-000000000001',inactive='00000000-0000-0000-0000-000000000002',actor='00000000-0000-0000-0000-000000000003',crew='00000000-0000-0000-0000-000000000004';
try{
 await db.exec(`create role service_role;create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${actor}');
 create table employees(id uuid primary key,full_name text,payroll_id text,crew_id uuid,active boolean,shirt_size text,jacket_size text,glove_size text,pants_size text);
 insert into employees values('${emp}','Employee One','100', '${crew}',true,'M','L','M','87R'),('${inactive}','Employee Two','101',null,false,'L',null,null,null);`);
 const migration=fs.readFileSync('supabase/migrations/20261027120000_v1_people_ppe_register.sql','utf8');await db.exec(migration);await db.exec(migration);
 const defs=(await db.query('select * from people_ppe_types order by sort_order')).rows,shirt=defs.find(row=>row.source_field==='shirt_size'),pants=defs.find(row=>row.source_field==='pants_size');
 let rows=(await db.query('select * from v1_people_ppe_register')).rows;
 assert.equal(rows.find(row=>row.employee_id===emp&&row.ppe_type_id===shirt.id).size_value,'M');assert.equal(rows.length,8);
 assert.equal(rows.find(row=>row.employee_id===emp&&row.ppe_type_id===pants.id).size_value,'87R');
 const crews=[{id:crew,crew_number:'1',crew_name:'Field crew'}];
 let lines=model.filterPpeLines(model.ppeLines(rows,defs,crews),model.emptyPpeFilters);assert.equal(lines.length,4);assert.ok(lines.every(row=>row.employee_id===emp));
 assert.equal(model.filterPpeLines(model.ppeLines(rows,defs,crews),{...model.emptyPpeFilters,active:'all',crew:'unassigned'}).length,4);
 assert.equal(model.filterPpeLines(model.ppeLines(rows,defs,crews),{...model.emptyPpeFilters,crew}).length,4);
 assert.equal(model.ppeLines([...rows,...rows],defs,crews).length,8);assert.equal(model.summarisePpe(lines).find(row=>row.ppe_type_id===shirt.id).required,1);
 assert.equal(model.summarisePpe(lines).find(row=>row.ppe_type_id===pants.id&&row.size==='87R').people,1);
 await db.query('select v1_ppe_save_requirement($1,$2,$3,$4,$5)',[emp,shirt.id,'XL',2,actor]);
 assert.equal((await db.query('select shirt_size from employees where id=$1',[emp])).rows[0].shirt_size,'XL');
 assert.equal((await db.query('select size_value from people_ppe_requirements where employee_id=$1 and ppe_type_id=$2',[emp,shirt.id])).rows[0].size_value,null);
 // Profile/mobile/onboarding processing that writes the canonical employee field
 // is immediately reflected, without any register sync/copy operation.
 await db.query('update employees set shirt_size=$1 where id=$2',['L',emp]);
 assert.equal((await db.query('select size_value from v1_people_ppe_register where employee_id=$1 and ppe_type_id=$2',[emp,shirt.id])).rows[0].size_value,'L');
 const custom=(await db.query("insert into people_ppe_types(name,size_options)values('Safety boots',array['10','11'])returning *")).rows[0];
 await db.query('select v1_ppe_save_requirement($1,$2,$3,$4,$5)',[emp,custom.id,'10',null,actor]);assert.equal((await db.query('select size_value from v1_people_ppe_register where employee_id=$1 and ppe_type_id=$2',[emp,custom.id])).rows[0].size_value,'10');
 const bootRows=(await db.query('select * from v1_people_ppe_register')).rows;
 assert.equal(model.summarisePpe(model.filterPpeLines(model.ppeLines(bootRows,[...defs,custom],crews),model.emptyPpeFilters)).find(row=>row.ppe_type_id===custom.id&&row.size==='10').required,1);
 await assert.rejects(db.query('insert into people_ppe_requirements(employee_id,ppe_type_id,size_value)values($1,$2,$3)',[inactive,shirt.id,'M']),/canonical employee/);
 await assert.rejects(db.query('select v1_ppe_save_requirement($1,$2,$3,$4,$5)',[emp,shirt.id,'INVALID',1,actor]),/configured size/);
 const issueArgs=[emp,shirt.id,'issued','L',1,'2020-01-01T00:00:00Z',null,'Issued at office','00000000-0000-0000-0000-000000000010',actor];
 const issueSql='select (v1_ppe_record_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)).id';
 const issued=(await db.query(issueSql,issueArgs)).rows[0].id;assert.equal((await db.query(issueSql,issueArgs)).rows[0].id,issued);assert.equal((await db.query('select count(*)::int n from people_ppe_issue_events')).rows[0].n,1);
 rows=(await db.query('select * from v1_people_ppe_register')).rows;lines=model.ppeLines(rows,[...defs,custom],crews);const shirtLine=lines.find(row=>row.employee_id===emp&&row.ppe_type_id===shirt.id);assert.equal(shirtLine.required_quantity,2);assert.equal(shirtLine.issued_quantity,1);assert.equal(shirtLine.outstanding_quantity,1);
 await db.query(issueSql,[emp,shirt.id,'returned','IGNORED',1,'2020-01-02T00:00:00Z',issued,'Returned','00000000-0000-0000-0000-000000000011',actor]);
 await assert.rejects(db.query(issueSql,[emp,shirt.id,'returned','L',1,'2020-01-02T00:00:00Z',issued,'Overreturn','00000000-0000-0000-0000-000000000012',actor]),/exceeds/);
 const total=(await db.query('select issued_quantity from v1_people_ppe_register where employee_id=$1 and ppe_type_id=$2',[emp,shirt.id])).rows[0].issued_quantity;assert.equal(total,0);
 const missing=model.filterPpeLines(lines,{...model.emptyPpeFilters,active:'inactive',missing:true});assert.ok(missing.some(row=>row.missing.some(message=>message.includes('size not recorded'))));
 const noSize=(await db.query("insert into people_ppe_types(name,requires_size,issue_tracking)values('Safety glasses',false,false)returning *")).rows[0];
 rows=(await db.query('select * from v1_people_ppe_register')).rows;const noSizeLine=model.ppeLines(rows,[...defs,custom,noSize],crews).find(row=>row.ppe_type_id===noSize.id);assert.equal(noSizeLine.outstanding_quantity,null);assert.equal(noSizeLine.size_label,'No size required');
 const csv=model.ppeCsv([shirtLine]);assert.match(csv,/'?Employee One/);assert.match(csv,/'?Field crew/);assert.match(csv,/"2","1","1"/);assert.ok(!csv.includes(emp));assert.match(model.ppeCsv([{...shirtLine,full_name:'=DANGEROUS()'}]),/'=DANGEROUS/);
 console.log('PASS migration twice; existing four employee columns reused; custom category canonical requirement; duplicate prevention; active/crew/missing filters; quantities and returns; idempotent issues; size-specific outstanding; safe CSV.');
 console.log('PASS profile/mobile canonical employee update immediately visible; no duplicate legacy size stored; no-size and tracking-off states handled explicitly.');
 await db.query('delete from auth.users where id=$1',[actor]);assert.ok((await db.query('select recorded_by from people_ppe_issue_events')).rows.every(row=>row.recorded_by===null));
 await db.query('delete from employees where id=$1',[emp]);assert.equal((await db.query('select count(*)::int n from people_ppe_issue_events')).rows[0].n,0);
 console.log('PASS existing employee/account hard-delete behaviour preserved by FK cleanup; no new PPE foreign key prevents the existing delete workflow.');
}finally{await db.close();}
// Actual permission gate: denies absent and explicit-false capabilities; never roles.
const service={};let permissions=new Set(['tt.people','people.view_basic','people.view_ppe']);
const access=load('lib/people/ppe-server.ts',{'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},'@/lib/access/server':{getRequestUser:async()=>({id:actor}),createServiceClient:()=>service,userHasAccess:async(_s,_u,code)=>permissions.has(code)}});
assert.equal((await access.ppeAccess({})).canEdit,false);await assert.rejects(access.ppeAccess({},true),/FORBIDDEN/);permissions.add('people.edit');assert.equal((await access.ppeAccess({},true)).canEdit,true);permissions.delete('people.view_ppe');await assert.rejects(access.ppeAccess({}),/FORBIDDEN/);
console.log('PASS actual server permission gate: view-only cannot edit/issue/configure; explicit missing PPE permission blocks retrieval.');
const definitions=[{id:'TYPE',name:'Configured PPE',active:true,required:true,requires_size:true,size_options:['M'],quantity_required:2,issue_tracking:true,sort_order:1}];
const large=Array.from({length:2505},(_,index)=>({employee_id:'E'+index,full_name:'Employee '+index,payroll_id:String(index),crew_id:null,active:true,ppe_type_id:'TYPE',size_value:'M',required_quantity:2,quantity_override:null,issued_quantity:1,last_issued_at:null}));
const calls=[];
const bulkService={from(table){calls.push(table);let start=0,end=999;const query={select(){return query},order(){return query},range(a,b){start=a;end=b;return query},or(){return query},eq(){return query},then(resolve){return Promise.resolve({data:table==='v1_people_ppe_register'?large.slice(start,end+1):table==='people_ppe_types'?definitions:[],error:null}).then(resolve)}};return query;}};
const route=load('app/api/people/ppe/route.ts',{'next/server':{NextResponse:{json:(body)=>({body})}},'@/lib/people/ppe':model,'@/lib/people/ppe-server':{ppeAccess:async()=>({service:bulkService,canEdit:false,canSeeCrews:true}),ppeError:error=>{throw error},invalidPpe:message=>{throw Error(message)},uuidPattern:/./}});
const started=performance.now(),response=await route.GET({nextUrl:{searchParams:new URLSearchParams()}});
assert.equal(response.body.lines.length,2505);assert.equal(response.body.summary[0].required,5010);assert.equal(response.body.summary[0].outstanding,2505);assert.equal(calls.filter(table=>table==='v1_people_ppe_register').length,3);assert.equal(calls.length,5);
console.log(`PASS actual register API: 2,505 employee/item rows, full totals, 3 paged register queries + definitions/crews; no per-employee requests (${(performance.now()-started).toFixed(1)}ms in fixture).`);
