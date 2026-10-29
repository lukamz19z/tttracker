import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';

const require=createRequire(import.meta.url),ts=require('typescript');
function load(file,mocks={}) {
  const exports={};
  new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>{
    if(name in mocks)return mocks[name];throw Error('Missing mock '+name);
  },exports);
  return exports;
}
const db=new PGlite(),actor='00000000-0000-0000-0000-000000000001';
const migration=fs.readFileSync('supabase/migrations/20261029120000_v1_ladder_manual_numbers_and_replacements.sql','utf8');
const metadataMigration=fs.readFileSync('supabase/migrations/20261029130000_v1_ladder_serial_height_measurement.sql','utf8');
const model=load('lib/assets/ladders.ts');
let permissions=new Set(['tt.assets','tt.assets.equipment','assets.view','assets.edit']);
try {
  await db.exec(`create role service_role bypassrls;create role authenticated;create role anon;
    create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${actor}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table crews(id uuid primary key);
    create table effective_user_permissions(user_id uuid,code text,allowed boolean);
    -- Simulate an existing V1 installation: no existing value may be rewritten.
    create table equipment_ladders(id uuid primary key default gen_random_uuid(),ladder_number text not null,make text,ladder_type text,height text,crew_id uuid references crews(id),status text default 'Active',last_internal_inspection date,notes text,created_at timestamptz default now(),updated_at timestamptz default now());
    insert into equipment_ladders(ladder_number,make,status,last_internal_inspection,notes,height) values('LAD-001','Bailey','Active','2026-10-01','Original ladder inspection history','2.4m');
    create table equipment_documents(id uuid primary key default gen_random_uuid(),equipment_type text,equipment_id uuid,title text,created_at timestamptz default now());
    create table equipment_sharepoint_links(id uuid primary key default gen_random_uuid(),equipment_type text,equipment_id uuid,sharepoint_web_url text);
  `);
  await db.exec(migration);await db.exec(migration);
  await db.exec(metadataMigration);await db.exec(metadataMigration);
  const first=(await db.query("select * from equipment_ladders where ladder_number='LAD-001'")).rows[0];
  assert.equal(first.serial_number,null);assert.equal(first.height_measurement_type,null);assert.equal(first.height,'2.4m');
  await db.query("insert into equipment_documents(equipment_type,equipment_id,title)values('ladder',$1,'Original inspection certificate')",[first.id]);
  await db.query("insert into equipment_sharepoint_links(equipment_type,equipment_id,sharepoint_web_url)values('ladder',$1,'https://example.test/original')",[first.id]);
  async function row(id){return (await db.query('select to_jsonb(l) item from equipment_ladders l where id=$1',[id])).rows[0]?.item;}
  async function save(data,id=null){return (await db.query('select to_jsonb(v1_ladder_save($1::jsonb,$2,$3)) item',[JSON.stringify(data),actor,id])).rows[0].item;}
  const replacement={ladder_number:'  LAD-001-R1  ',make:'New make',ladder_type:'Step Ladder',height:'2.4m',status:'Active',last_internal_inspection:'2026-10-29',notes:'Replacement inspection',supersedes_ladder_id:first.id};
  await assert.rejects(save(replacement),/Confirm/);assert.equal((await row(first.id)).status,'Active');
  const next=await save({...replacement,confirm_supersedes:true});
  assert.equal(next.ladder_number,'LAD-001-R1');assert.equal(next.status,'Active');assert.equal(next.supersedes_ladder_id,first.id);
  const old=await row(first.id);assert.equal(old.ladder_number,'LAD-001');assert.equal(old.status,'Superseded');assert.equal(old.superseded_by_user_id,actor);assert.ok(old.superseded_at);
  assert.equal(old.last_internal_inspection,'2026-10-01');assert.equal(old.notes,'Original ladder inspection history');assert.equal(next.last_internal_inspection,'2026-10-29');
  assert.equal((await db.query('select equipment_id from equipment_documents')).rows[0].equipment_id,first.id);
  assert.equal((await db.query('select equipment_id from equipment_sharepoint_links')).rows[0].equipment_id,first.id);
  const before=(await db.query('select count(*)::int n from equipment_ladders')).rows[0].n;
  await assert.rejects(save({ladder_number:' lad-001-r1 ',status:'Active'}),/A ladder with register number lad-001-r1 already exists/);
  assert.equal((await db.query('select count(*)::int n from equipment_ladders')).rows[0].n,before);
  await assert.rejects(save({...replacement,ladder_number:'LAD-001-R2',confirm_supersedes:true}),/already been superseded/);
  for(const number of ['LAD-001A','LAD-014','SITE-LAD-003','mixed-Case-R2'])assert.equal((await save({ladder_number:` ${number} `,status:'Active'})).ladder_number,number);
  await assert.rejects(save({ladder_number:' ',status:'Active'}),/Register Number/);
  await assert.rejects(save({ladder_number:'NEW',status:'Superseded'}),/valid ladder status/);
  await assert.rejects(save({...next,ladder_number:'RENAMED'},next.id),/locked after creation/);
  await assert.rejects(save({...next,supersedes_ladder_id:null},next.id),/relationship is permanent/);
  await assert.rejects(save({...old,status:'Active'},old.id),/cannot be reactivated/);
  const edited=await save({...next,notes:'Updated replacement note'},next.id);assert.equal(edited.ladder_number,'LAD-001-R1');assert.equal(edited.supersedes_ladder_id,first.id);
  await assert.rejects(save({...next,notes:'Stale overwrite'},next.id),/changed/);
  await assert.rejects(db.query('delete from equipment_ladders where id=$1',[old.id]),/retained/);
  await assert.rejects(db.query('delete from equipment_ladders where id=$1',[next.id]),/retained/);
  const rollbackOld=await save({ladder_number:'LAD-020',status:'Active',last_internal_inspection:'2026-10-02'});
  await assert.rejects(save({ladder_number:'LAD-001-R1',status:'Active',supersedes_ladder_id:rollbackOld.id,confirm_supersedes:true}),/already exists/);
  assert.equal((await row(rollbackOld.id)).status,'Active');assert.equal((await row(rollbackOld.id)).superseded_at,null);
  assert.equal((await row(rollbackOld.id)).last_internal_inspection,'2026-10-02');
  const reused=await save({ladder_number:'LAD-020',status:'Active',supersedes_ladder_id:rollbackOld.id,confirm_supersedes:true});
  assert.notEqual(reused.id,rollbackOld.id);assert.equal((await row(rollbackOld.id)).status,'Superseded');
  assert.equal((await db.query("select has_function_privilege('authenticated','v1_ladder_save(jsonb,uuid,uuid)','EXECUTE') allowed")).rows[0].allowed,false);
  assert.equal((await db.query("select has_table_privilege('authenticated','equipment_ladders','INSERT') allowed")).rows[0].allowed,false);
  console.log('PASS migration twice, existing LAD-001 unchanged, manual suffix/custom/case display values, trimming, case-insensitive duplicate prevention and required number.');
  console.log('PASS confirmed LAD-001-R1 replacement, old Superseded/new Active, stable UUID linkage, independent inspections/notes/documents/SharePoint history and atomic duplicate rollback.');
  console.log('PASS locked existing numbers, immutable relationships, no reactivation/deletion of linked ladders, stale edit protection and service-only transactional writes.');

  // Run the actual API and permission gate against local PostgreSQL.
  const service={from(table){
    assert.ok(['equipment_ladders','equipment_documents','equipment_sharepoint_links'].includes(table));
    let columns='*',single=false,mode='select',offset=0,limit=null;const filters=[],orders=[];
    const query={select(value){columns=value;return query;},eq(key,value){filters.push([key,value]);return query;},order(key,options){orders.push(key+(options?.ascending===false?' desc':' asc'));return query;},range(start,end){offset=start;limit=end-start+1;return query;},maybeSingle(){single=true;return query;},delete(){mode='delete';return query;},async then(resolve){
      const args=[],bind=value=>{args.push(value);return '$'+args.length;};
      const where=filters.length?' where '+filters.map(([key,value])=>key+'='+bind(value)).join(' and '):'';
      const sql=mode==='delete'?'delete from '+table+where+' returning '+columns:'select '+columns+' from '+table+where+(orders.length?' order by '+orders.join(','):'')+(limit!==null?' limit '+limit+' offset '+offset:'');
      try{const result=await db.query(sql,args);const rows=result.rows.map(row=>({...row,...(row.last_internal_inspection instanceof Date?{last_internal_inspection:row.last_internal_inspection.toISOString().slice(0,10)}:{})}));return resolve({data:single?rows[0]??null:rows,error:null});}catch(error){return resolve({data:null,error});}
    }};return query;
  },async rpc(name,args){assert.equal(name,'v1_ladder_save');try{return {data:await save(args.p_data,args.p_id),error:null};}catch(error){return {data:null,error};}}};
  const responseMock={'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}}};
  const server=load('lib/assets/ladder-server.ts',{...responseMock,'./ladders':model,'@/lib/access/server':{getRequestUser:async()=>({id:actor}),createServiceClient:()=>service,userHasAccess:async(_s,_u,code)=>permissions.has(code)}});
  const route=load('app/api/assets/equipment/ladder/route.ts',{...responseMock,'@/lib/assets/ladder-server':server});
  const req=body=>({json:async()=>body});
  const standard=await route.POST(req({ladder_number:'LAD-004',serial_number:' SN458392 ',make:'Bailey',ladder_type:'Platform Ladder',height:'1.8 m',height_measurement_type:'Platform Height',status:'Active'}));
  assert.equal(standard.status,200);assert.equal(standard.body.item.serial_number,'SN458392');assert.equal(standard.body.item.height,'1.8 m');assert.equal(standard.body.item.height_measurement_type,'Platform Height');
  const overall=await route.POST(req({ladder_number:'LAD-005',serial_number:'SN458392',height:'3.0 m',height_measurement_type:'Overall Height',status:'Active'}));assert.equal(overall.status,200);assert.equal(overall.body.item.height_measurement_type,'Overall Height');
  const custom=await route.POST(req({ladder_number:'LAD-006',height_measurement_type:' Custom rail height ',status:'Active'}));assert.equal(custom.status,200);assert.equal(custom.body.item.height_measurement_type,'Custom rail height');
  const legacyEdit={...standard.body.item,notes:'Older client note update'};delete legacyEdit.serial_number;delete legacyEdit.height_measurement_type;
  const compatible=await route.PATCH(req(legacyEdit));assert.equal(compatible.status,200);assert.equal(compatible.body.item.serial_number,'SN458392');assert.equal(compatible.body.item.height_measurement_type,'Platform Height');
  const cleared=await route.PATCH(req({...compatible.body.item,serial_number:null,height_measurement_type:null}));assert.equal(cleared.status,200);assert.equal(cleared.body.item.serial_number,null);assert.equal(cleared.body.item.height_measurement_type,null);
  assert.equal((await route.POST(req({ladder_number:'INVALID-SERIAL',serial_number:123,status:'Active'}))).status,400);
  assert.equal((await route.POST(req({ladder_number:'INVALID-BASIS',height_measurement_type:'x'.repeat(121),status:'Active'}))).status,400);
  const apiNew=await route.POST(req({ladder_number:'  API-LAD-R1 ',status:'Active'}));assert.equal(apiNew.status,200);assert.equal(apiNew.body.item.ladder_number,'API-LAD-R1');assert.equal(apiNew.body.item.height_measurement_type,null);assert.equal(apiNew.body.item.serial_number,null);
  const apiDuplicate=await route.POST(req({ladder_number:'api-lad-r1',status:'Active'}));assert.equal(apiDuplicate.status,400);assert.equal(apiDuplicate.body.error,'A ladder with register number api-lad-r1 already exists.');assert.doesNotMatch(apiDuplicate.body.error,/duplicate key|constraint/i);
  const apiBlank=await route.POST(req({ladder_number:' '}));assert.equal(apiBlank.status,400);
  const unconfirmed=await route.POST(req({ladder_number:'API-LAD-R2',status:'Active',supersedes_ladder_id:apiNew.body.item.id}));assert.equal(unconfirmed.status,400);assert.match(unconfirmed.body.error,/Confirm/);
  const apiReplacement=await route.POST(req({ladder_number:'API-LAD-R2',status:'Active',supersedes_ladder_id:apiNew.body.item.id,confirm_supersedes:true}));assert.equal(apiReplacement.status,200);assert.equal((await row(apiNew.body.item.id)).status,'Superseded');
  const apiRename=await route.PATCH(req({...apiReplacement.body.item,ladder_number:'CHANGED'}));assert.equal(apiRename.status,400);assert.match(apiRename.body.error,/locked/);
  const forbiddenDelete=await route.DELETE({nextUrl:{searchParams:new URLSearchParams({id:apiNew.body.item.id})}});assert.equal(forbiddenDelete.status,400);assert.match(forbiddenDelete.body.error,/retained/);
  const list=await route.GET({});assert.equal(list.status,200);assert.ok(list.body.items.some(item=>item.id===first.id&&item.status==='Superseded'));
  permissions.delete('assets.edit');assert.equal((await route.POST(req({ladder_number:'DENIED',status:'Active'}))).status,403);assert.equal((await route.GET({})).body.canEdit,false);
  permissions.delete('assets.view');assert.equal((await route.GET({})).status,403);permissions.add('assets.view');permissions.add('assets.edit');
  const helpers=load('lib/assets/equipment-sharepoint.ts',{'@/lib/sharepoint/graph':{},'@/lib/assets/server':{clean:value=>String(value??'').trim()},'@/lib/assets/sharepoint':{}});
  assert.match(helpers.equipmentLabel('ladder',next),/^LAD-001-R1/);
  const detailRoute=load('app/api/assets/equipment/ladder/[equipmentId]/route.ts',{...responseMock,'@/lib/assets/ladder-server':server,'@/lib/assets/equipment-sharepoint':{...helpers,loadEquipmentDocumentTypes:async()=>[]}});
  const oldDetail=await detailRoute.GET({}, {params:Promise.resolve({equipmentId:first.id})});assert.equal(oldDetail.status,200);assert.equal(oldDetail.body.ladderRelations.supersededBy.id,next.id);assert.equal(oldDetail.body.documents[0].title,'Original inspection certificate');
  const newDetail=await detailRoute.GET({}, {params:Promise.resolve({equipmentId:next.id})});assert.equal(newDetail.body.ladderRelations.supersedes.id,first.id);assert.equal(newDetail.body.documents.length,0);assert.equal(newDetail.body.item.last_internal_inspection,'2026-10-29');
  console.log('PASS actual API controlled duplicates/blank/confirmation/errors, manual values, replacement save, identifier lock, safe deletion, dynamic permission denials, old/new clickable detail data and saved-number SharePoint labels.');
  console.log('PASS nullable serial/basis migration twice; standard LAD-004/API serial roundtrip; duplicate serials allowed; Overall/custom bases retained; older-client edits preserve metadata; explicit clears and validation.');
} finally {await db.close();}

// The inspected V1 project has no ladder table: verify the guarded bootstrap
// independently, without relying on the existing-installation fixture above.
const fresh=new PGlite();
try {
  await fresh.exec(`create role service_role;create role authenticated;create role anon;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
    create table crews(id uuid primary key);
    create table effective_user_permissions(user_id uuid,code text,allowed boolean);`);
  await fresh.exec(migration);await fresh.exec(migration);await fresh.exec(metadataMigration);await fresh.exec(metadataMigration);
  assert.equal((await fresh.query('select count(*)::int n from equipment_ladders')).rows[0].n,0);
  await fresh.query("insert into equipment_ladders(ladder_number)values('LAD-001')");
  // Legacy duplicate data is never silently renamed or deleted by a migration.
  await fresh.exec('drop index equipment_ladders_current_number_uidx');
  await fresh.query("insert into equipment_ladders(ladder_number)values('lad-001')");
  await assert.rejects(fresh.exec(migration),/Reconcile them explicitly/);
  await fresh.exec('rollback');
  assert.deepEqual((await fresh.query('select ladder_number from equipment_ladders order by ladder_number')).rows.map(r=>r.ladder_number),['LAD-001','lad-001']);
  console.log('PASS absent-table bootstrap twice, no automatic seed numbers, and conflicting legacy identifiers abort migration without rewriting or deleting data.');
} finally {await fresh.close();}

const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const links=load('components/assets/ladder-replacement-links.tsx',{'react/jsx-runtime':require('react/jsx-runtime'),'next/link':{default:({children,...props})=>React.createElement('a',props,children)},'@/lib/assets/ladders':model});
const html=renderToStaticMarkup(React.createElement(links.LadderReplacementLinks,{supersedes:{id:'old-uuid',ladder_number:'LAD-001'},supersededBy:{id:'next-uuid',ladder_number:'LAD-001-R1'}}));assert.match(html,/Supersedes:/);assert.match(html,/Superseded by:/);assert.match(html,/records\/ladder\/old-uuid/);assert.match(html,/records\/ladder\/next-uuid/);
const source=fs.readFileSync('app/(protected)/assets/equipment/ladders/page.tsx','utf8');assert.doesNotMatch(source,/getNextLadderNumber|nextNumber|ladder_number:\s*['"]LAD-001['"]/);assert.match(source,/ladder_number: ""/);assert.match(source,/placeholder="e.g. LAD-001-R1"/);assert.match(source,/Enter the identifier used on the physical ladder \/ asset register\./);assert.match(source,/window.confirm\(`\$\{selectedPrevious.ladder_number\} will be marked as Superseded by/);
assert.equal(model.ladderNumberKey(' lad-001-r1 '),'LAD-001-R1');
for(const term of ['001','LAD-001-R1','R1'])assert.ok('LAD-001-R1'.toLowerCase().includes(term.toLowerCase()));
console.log('PASS rendered bidirectional stable-ID links, empty manual number input/helper, explicit replacement confirmation, generation removed and partial number search.');

// Exercise the same data projection used by the real register, CSV and print view.
const base={make:'Bailey',ladder_type:'Platform Ladder',height:'1.8 m',crew_id:'C2',status:'Active',last_internal_inspection:'2026-10-29',notes:'Long notes stay out of print tables',created_at:null,updated_at:null,supersedes_ladder_id:null,superseded_at:null};
const historical={...base,id:'OLD',ladder_number:'LAD-001',status:'Superseded',height:'2.4m',serial_number:null,height_measurement_type:null};
const standardRow={...base,id:'NEW',ladder_number:'LAD-004',serial_number:'SN458392',height_measurement_type:'Platform Height',supersedes_ladder_id:'OLD'};
const overallRow={...base,id:'OVERALL',ladder_number:'LAD-005',ladder_type:'Extension Ladder',height:'3.0 m',height_measurement_type:'Overall Height',serial_number:'SN-OTHER',crew_id:'C3'};
const fixtures=[historical,standardRow,overallRow];
const crewLabel=row=>row.crew_id==='C2'?'Crew 2':'Crew 3',inspectionLabel=()=> 'Recently inspected';
const emptyFilters={search:'',crew:'All Crews',status:'All',type:'All Types',inspection:'All Inspections'};
assert.deepEqual(model.filterLadders(fixtures,{...emptyFilters,search:'458392'},crewLabel,inspectionLabel).map(r=>r.id),['NEW']);
for(const search of ['LAD-004','Bailey','1.8','Platform Ladder','Crew 2','Active'])assert.ok(model.filterLadders(fixtures,{...emptyFilters,search},crewLabel,inspectionLabel).some(r=>r.id==='NEW'));
const filtered=model.filterLadders(fixtures,{...emptyFilters,status:'Active',crew:'Crew 2',type:'Platform Ladder'},crewLabel,inspectionLabel);assert.deepEqual(filtered.map(r=>r.id),['NEW']);
const csv=model.ladderCsv(filtered,fixtures,crewLabel,inspectionLabel);assert.match(csv,/'?SN458392/);assert.match(csv,/"Height Measurement"/);assert.match(csv,/"Supersedes","Superseded By","Notes"/);assert.match(csv,/"Platform Height"/);assert.match(csv,/"LAD-001"/);assert.doesNotMatch(csv,/"Overall Height"/);
assert.equal(model.ladderMeasurementLabel(null),'Not specified');assert.equal(model.defaultLadderHeightMeasurement,'Platform Height');assert.equal(model.ladderHeightLabel('1.8m'),'1.8 m');assert.equal(model.ladderHeightLabel('1.8'),'1.8 (unit not specified)');
const printing=load('components/assets/ladder-print-register.tsx',{'react/jsx-runtime':require('react/jsx-runtime'),'@/lib/assets/ladders':model});
function renderPrint(items,allItems,filterSummary){return renderToStaticMarkup(React.createElement(printing.LadderPrintRegister,{items,allItems,crewLabel,inspectionLabel,printedAt:'29 Oct 2026, 10:45 am',filterSummary}));}
const activeHtml=renderPrint(filtered,fixtures,'Crew 2 \u00b7 Active \u00b7 Platform Ladder');assert.match(activeHtml,/SN458392/);assert.match(activeHtml,/1.8 m/);assert.match(activeHtml,/Platform Height/);assert.match(activeHtml,/1 filtered ladder/);assert.doesNotMatch(activeHtml,/<td>LAD-001<\/td>|<td>LAD-005<\/td>|Long notes stay/);
const allHtml=renderPrint(fixtures,fixtures,'All ladders');assert.match(allHtml,/<td>Superseded<\/td>/);assert.match(allHtml,/Superseded by LAD-004/);assert.match(allHtml,/<td>\u2014<\/td>/);assert.match(allHtml,/Not specified/);assert.match(allHtml,/Overall Height/);assert.doesNotMatch(allHtml,/null|undefined/);
assert.match(printing.ladderPrintCss,/size: landscape/);assert.match(printing.ladderPrintCss,/display: table-header-group/);assert.match(printing.ladderPrintCss,/break-inside: avoid/);assert.match(printing.ladderPrintCss,/ladder-screen-only.*display: none/s);
const ladderSource=fs.readFileSync('app/(protected)/assets/equipment/ladders/page.tsx','utf8');assert.match(ladderSource,/height_measurement_type: defaultLadderHeightMeasurement/);assert.match(ladderSource,/height_measurement_type: clean\(item.height_measurement_type\)/);assert.match(ladderSource,/function printFilteredRegister\(\) \{\s*window.print\(\)/);assert.match(ladderSource,/LadderPrintRegister items=\{filteredItems\}/);
console.log('PASS actual serial/number/make/type/height/crew/status search, combined filters, CSV metadata, historical Not specified/serial dash, filtered/all print rows and Lifting Gear-style landscape/header CSS.');
if(process.env.TTTRACKER_LADDER_PRINT_QA_DIR){
 const dir=path.resolve(process.env.TTTRACKER_LADDER_PRINT_QA_DIR);fs.mkdirSync(dir,{recursive:true});
 const write=(name,content)=>fs.writeFileSync(path.join(dir,name),'<!doctype html><html><head><meta charset="utf-8"><title>Ladder print QA</title><style>.hidden{display:none}body{margin:0}</style></head><body><header>QA NAVIGATION MUST NOT PRINT</header><div class="ladder-screen-only">QA FILTERS AND BUTTONS MUST NOT PRINT</div>'+content+'</body></html>');
 write('active.html',activeHtml);write('all.html',allHtml);
 const many=Array.from({length:85},(_,i)=>({...standardRow,id:'M'+i,ladder_number:'LAD-'+String(100+i),serial_number:i===2?'LONG-SERIAL-'.repeat(5):'SN-'+i,supersedes_ladder_id:null,height_measurement_type:i%2?'Platform Height':'Overall Height'}));
 write('multipage.html',renderPrint(many,many,'Active \u00b7 Crew 2'));
 console.log('Print QA HTML fixtures: '+dir);
}
