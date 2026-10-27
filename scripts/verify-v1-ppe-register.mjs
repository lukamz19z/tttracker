import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(file,mocks={}){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>{if(name in mocks)return mocks[name];throw Error('Missing mock '+name);},exports);return exports;}
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
 assert.equal(model.ppeLines([...rows,...rows],defs,crews).length,8);assert.equal(model.summarisePpe(lines).find(row=>row.ppe_type_id===shirt.id).people,1);
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
 assert.equal(model.summarisePpe(model.filterPpeLines(model.ppeLines(bootRows,[...defs,custom],crews),model.emptyPpeFilters)).find(row=>row.ppe_type_id===custom.id&&row.size==='10').people,1);
 await assert.rejects(db.query('insert into people_ppe_requirements(employee_id,ppe_type_id,size_value)values($1,$2,$3)',[inactive,shirt.id,'M']),/canonical employee/);
 await assert.rejects(db.query('select v1_ppe_save_requirement($1,$2,$3,$4,$5)',[emp,shirt.id,'INVALID',1,actor]),/configured size/);
 const issueArgs=[emp,shirt.id,'issued','L',1,'2020-01-01T00:00:00Z',null,'Issued at office','00000000-0000-0000-0000-000000000010',actor];
 const issueSql='select (v1_ppe_record_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)).id';
 const issued=(await db.query(issueSql,issueArgs)).rows[0].id;assert.equal((await db.query(issueSql,issueArgs)).rows[0].id,issued);assert.equal((await db.query('select count(*)::int n from people_ppe_issue_events')).rows[0].n,1);
 rows=(await db.query('select * from v1_people_ppe_register')).rows;lines=model.ppeLines(rows,[...defs,custom],crews);const shirtLine=lines.find(row=>row.employee_id===emp&&row.ppe_type_id===shirt.id);assert.equal(shirtLine.required_quantity,2);assert.equal(shirtLine.issued_quantity,1);assert.equal(shirtLine.status,"Recorded");assert.equal(model.summarisePpe([shirtLine])[0].people,1);
 await db.query(issueSql,[emp,shirt.id,'returned','IGNORED',1,'2020-01-02T00:00:00Z',issued,'Returned','00000000-0000-0000-0000-000000000011',actor]);
 await assert.rejects(db.query(issueSql,[emp,shirt.id,'returned','L',1,'2020-01-02T00:00:00Z',issued,'Overreturn','00000000-0000-0000-0000-000000000012',actor]),/exceeds/);
 const total=(await db.query('select issued_quantity from v1_people_ppe_register where employee_id=$1 and ppe_type_id=$2',[emp,shirt.id])).rows[0].issued_quantity;assert.equal(total,0);
 const missing=model.filterPpeLines(lines,{...model.emptyPpeFilters,active:'inactive',details:'missing'});assert.ok(missing.some(row=>row.missing.some(message=>message.includes('size not recorded'))));
 const noSize=(await db.query("insert into people_ppe_types(name,requires_size,issue_tracking)values('Safety glasses',false,false)returning *")).rows[0];
 rows=(await db.query('select * from v1_people_ppe_register')).rows;const noSizeLine=model.ppeLines(rows,[...defs,custom,noSize],crews).find(row=>row.ppe_type_id===noSize.id);assert.equal(noSizeLine.missing.length,0);assert.equal(noSizeLine.size_label,'No size required');
 const csv=model.ppeCsv([shirtLine]);assert.match(csv,/'?Employee One/);assert.match(csv,/'?Field crew/);assert.match(csv,/"PPE Item","Size","Status"/);assert.doesNotMatch(csv,/Required Qty|Issued Qty|Outstanding/);assert.ok(!csv.includes(emp));assert.match(model.ppeCsv([{...shirtLine,full_name:'=DANGEROUS()'}]),/'=DANGEROUS/);
 console.log('PASS migration twice; existing four employee columns reused; custom category canonical requirement; duplicate prevention; active/crew/missing filters; dormant quantities/returns retained without affecting sizing; safe sizing-only CSV.');
 console.log('PASS profile/mobile canonical employee update immediately visible; no duplicate legacy size stored; no-size and tracking-off states handled explicitly.');
 // Exercise the actual size-only API against PostgreSQL, preserving dormant data.
 const sqlService={from(table){
  assert.ok(['employees','people_ppe_types','people_ppe_requirements'].includes(table));
  let columns='*',data=null,mode='select',single=false;const where=[];
  const query={select(value){columns=value;return query;},eq(key,value){where.push([key,value]);return query;},maybeSingle(){single=true;return query;},update(value){mode='update';data=value;return query;},insert(value){mode='insert';data=value;return query;},async then(resolve){
   const args=[],bind=value=>{args.push(value);return '$'+args.length;};
   const clause=()=>where.length?' where '+where.map(([key,value])=>key+'='+bind(value)).join(' and '):'';
   let sql;
   if(mode==='select')sql='select '+columns+' from '+table+clause();
   else if(mode==='update')sql='update '+table+' set '+Object.entries(data).map(([key,value])=>key+'='+bind(value)).join(',')+clause()+' returning '+columns;
   else sql='insert into '+table+'('+Object.keys(data).join(',')+') values('+Object.values(data).map(bind).join(',')+') returning *';
   const result=await db.query(sql,args);return resolve({data:single?result.rows[0]??null:result.rows,error:null});
  }};return query;
 }};
 const sizeRoute=load('app/api/people/ppe/route.ts',{'next/server':{NextResponse:{json:body=>({body})}},'@/lib/people/ppe':model,'@/lib/people/ppe-server':{ppeAccess:async()=>({service:sqlService,user:{id:actor}}),ppeBody:async request=>request.body,ppeError:error=>{throw error;},invalidPpe:message=>{throw Error(message);},uuidPattern:/^[0-9a-f-]{36}$/}});
 await sizeRoute.PATCH({body:{employeeId:emp,typeId:shirt.id,size:'S',quantity:999}});
 assert.equal((await db.query('select shirt_size from employees where id=$1',[emp])).rows[0].shirt_size,'S');
 assert.equal((await db.query('select quantity_required from people_ppe_requirements where employee_id=$1 and ppe_type_id=$2',[emp,shirt.id])).rows[0].quantity_required,2);
 await db.query('update people_ppe_requirements set quantity_required=7 where employee_id=$1 and ppe_type_id=$2',[emp,custom.id]);
 await sizeRoute.PATCH({body:{employeeId:emp,typeId:custom.id,size:'11'}});
 assert.deepEqual((await db.query('select size_value,quantity_required from people_ppe_requirements where employee_id=$1 and ppe_type_id=$2',[emp,custom.id])).rows[0],{size_value:'11',quantity_required:7});
 await sizeRoute.PATCH({body:{employeeId:inactive,typeId:custom.id,size:'10'}});
 assert.equal((await db.query('select size_value from people_ppe_requirements where employee_id=$1 and ppe_type_id=$2',[inactive,custom.id])).rows[0].size_value,'10');
 assert.equal((await db.query('select count(*)::int n from people_ppe_issue_events')).rows[0].n,2);
 console.log('PASS actual PATCH updates canonical legacy/custom sizing and inserts new sizing, ignores caller quantity, preserves existing quantity overrides and all issue events.');
 await db.query('delete from auth.users where id=$1',[actor]);assert.ok((await db.query('select recorded_by from people_ppe_issue_events')).rows.every(row=>row.recorded_by===null));
 await db.query('delete from employees where id=$1',[emp]);assert.equal((await db.query('select count(*)::int n from people_ppe_issue_events')).rows[0].n,0);
 console.log('PASS existing employee/account hard-delete behaviour preserved by FK cleanup; no new PPE foreign key prevents the existing delete workflow.');
}finally{await db.close();}
// Actual permission gate: denies absent and explicit-false capabilities; never roles.
const service={};let permissions=new Set(['tt.people','people.view_basic','people.view_ppe']);
const access=load('lib/people/ppe-server.ts',{'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},'@/lib/access/server':{getRequestUser:async()=>({id:actor}),createServiceClient:()=>service,userHasAccess:async(_s,_u,code)=>permissions.has(code)}});
assert.equal((await access.ppeAccess({})).canEdit,false);await assert.rejects(access.ppeAccess({},true),/FORBIDDEN/);permissions.add('people.edit');assert.equal((await access.ppeAccess({},true)).canEdit,true);permissions.delete('people.view_ppe');await assert.rejects(access.ppeAccess({}),/FORBIDDEN/);
console.log('PASS actual server permission gate: view-only cannot edit/configure; explicit missing PPE permission blocks retrieval.');
const definitions=[{id:'TYPE',name:'Configured PPE',source_field:'shirt_size',active:true,required:false,requires_size:true,size_options:['M'],quantity_required:200,issue_tracking:true,sort_order:1}];
const large=Array.from({length:2505},(_,index)=>({id:'E'+index,full_name:'Employee '+index,payroll_id:String(index),crew_id:null,active:true,shirt_size:'M'}));
const calls=[];
const bulkService={from(table){calls.push(table);let start=0,end=999;const query={select(){return query},order(){return query},range(a,b){start=a;end=b;return query},or(){return query},eq(){return query},then(resolve){return Promise.resolve({data:table==='employees'?large.slice(start,end+1):table==='people_ppe_types'?definitions:[],error:null}).then(resolve)}};return query;}};
const route=load('app/api/people/ppe/route.ts',{'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},'@/lib/people/ppe':model,'@/lib/people/ppe-server':{ppeAccess:async()=>({service:bulkService,canEdit:false,canSeeCrews:true}),ppeError:error=>{throw error},invalidPpe:message=>{throw Error(message)},uuidPattern:/./}});
const started=performance.now(),response=await route.GET({nextUrl:{searchParams:new URLSearchParams()}});
assert.equal(response.body.lines.length,2505);assert.equal(response.body.summary[0].people,2505);assert.equal(response.body.metrics.complete,2505);assert.equal(calls.filter(table=>table==='employees').length,3);assert.equal(calls.length,6);assert.ok(!calls.includes('people_ppe_issue_events'));assert.ok(!calls.includes('v1_people_ppe_register'));
const disabled=await route.POST({});assert.equal(disabled.status,409);
console.log(`PASS actual API: 2,505 employees, size totals count people not configured quantities; 3 employee pages + bulk sizes/definitions/crews, no ledger queries or N+1 (${(performance.now()-started).toFixed(1)}ms fixture).`);
const sample=[{employee_id:'A',full_name:'Crew member',ppe_type_id:'TYPE',size_value:'M',active:true},{employee_id:'A',full_name:'Crew member',ppe_type_id:'OTHER',size_value:null,active:true}];
const sizing=model.ppeLines(sample,[...definitions,{...definitions[0],id:'OTHER',name:'Boots'}],[]);
assert.equal(model.filterPpeLines(sizing,{...model.emptyPpeFilters,type:'TYPE',details:'complete'}).length,0);
assert.equal(model.filterPpeLines(sizing,{...model.emptyPpeFilters,type:'TYPE',details:'missing'}).length,1);
assert.equal(model.filterPpeLines(sizing,{...model.emptyPpeFilters,search:'M'}).length,2);
assert.equal(model.filterPpeLines(sizing,{...model.emptyPpeFilters,type:'OTHER',size:'__missing__'}).length,1);
const blankSize=model.ppeLines([{...sample[0],size_value:'   '}],definitions,[]);assert.equal(model.filterPpeLines(blankSize,{...model.emptyPpeFilters,size:'__missing__'}).length,1);
console.log('PASS missing sizing ignores dormant required/quantity flags; person completeness survives single-category filters; size drill-down and search.');

// Render actual read-only views/editor: no operational issue workflow leaks into UI/print.
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const uiMocks={'react':React,'react/jsx-runtime':require('react/jsx-runtime'),'lucide-react':require('lucide-react'),'next/link':{default:({children,...props})=>React.createElement('a',props,children)},'@/lib/people/ppe':model};
const views=load('components/people/ppe-register-views.tsx',uiMocks);
const editor=load('components/people/ppe-register-editor.tsx',{...uiMocks,'./ppe-register-views':views});
const screen=load('components/people/ppe-register-screen.tsx',{...uiMocks,'./ppe-register-views':views,'./ppe-register-editor':editor});
const line=response.body.lines[0];
for(const tab of ['Overview','People']){
 const html=renderToStaticMarkup(React.createElement(screen.PpeRegisterScreen,{report:response.body,allowed:true,accessLoading:false,busy:false,error:'',filters:model.emptyPpeFilters,change(){},reset(){},tab,setTab(){},visible:[line],people:[[line]],limit:100,more(){},refresh(){},exportRows(){},onSize(){},onItem(){},filterDescription:'Active only',editor:null}));
 assert.doesNotMatch(html,/Outstanding|Issued|Required Qty|Record issue|Issue history/i);
 assert.match(html,/PPE Details Complete/);assert.match(html,/PPE Types/);
}
const expanded=renderToStaticMarkup(React.createElement(views.PpePeople,{people:[[line]],expanded:new Set([line.employee_id]),onExpand(){},onItem(){},canEdit:true,limit:100,onMore(){}}));
assert.match(expanded,/Edit PPE/);assert.doesNotMatch(expanded,/Outstanding|Issued|Required Qty/i);
const editHtml=renderToStaticMarkup(React.createElement(editor.PpeRegisterEditor,{line,definition:definitions[0],canEdit:true,saving:false,size:'M',setSize(){},error:'',save(){},close(){}}));
assert.match(editHtml,/Save PPE/);assert.doesNotMatch(editHtml,/Outstanding|Issued|quantity|history/i);
console.log('PASS actual Overview, People, expanded detail, print and size editor render without issue/outstanding controls or quantity fields.');
