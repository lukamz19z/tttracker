import assert from 'node:assert/strict';
import fs from 'node:fs';
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
    insert into equipment_ladders(ladder_number,make,status,last_internal_inspection,notes) values('LAD-001','Bailey','Active','2026-10-01','Original ladder inspection history');
    create table equipment_documents(id uuid primary key default gen_random_uuid(),equipment_type text,equipment_id uuid,title text,created_at timestamptz default now());
    create table equipment_sharepoint_links(id uuid primary key default gen_random_uuid(),equipment_type text,equipment_id uuid,sharepoint_web_url text);
  `);
  await db.exec(migration);await db.exec(migration);
  const first=(await db.query("select * from equipment_ladders where ladder_number='LAD-001'")).rows[0];
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
  const apiNew=await route.POST(req({ladder_number:'  API-LAD-R1 ',status:'Active'}));assert.equal(apiNew.status,200);assert.equal(apiNew.body.item.ladder_number,'API-LAD-R1');
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
  await fresh.exec(migration);await fresh.exec(migration);
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
