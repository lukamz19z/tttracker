import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(file,mocks){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{assert.ok(name in mocks,name);return mocks[name]},exports);return exports;}
const db=new PGlite();
try {
await db.exec(`create table tower_revisions(id uuid primary key default gen_random_uuid(),project_id uuid,tower_id uuid,sequence_no int,revision_number text,fli_number text,mobile_client_mutation_id text,inspection_stage text,inspection_date date,client_inspector text,client_company text,client_reference text,notes text,status text,created_by uuid,created_by_label text,updated_at timestamptz,finalised_at timestamptz);
create unique index tower_revisions_fli_number_uidx on tower_revisions(fli_number);
create unique index tower_revisions_tower_sequence_uidx on tower_revisions(project_id,tower_id,sequence_no);
create unique index tower_revisions_project_tower_revision_number_uidx on tower_revisions(project_id,tower_id,revision_number) where revision_number is not null;
create table tower_revision_items(id uuid primary key default gen_random_uuid(),revision_id uuid,project_id uuid,tower_id uuid,item_number int,fli_number text,mobile_client_mutation_id text,leg text,assigned_flag text,issue_type_id uuid,other_issue_text text,tower_segment text,member_number text,drawing_number text,finding text,rectification_comment text,status text,created_by uuid);
create unique index tower_revision_items_revision_id_item_number_key on tower_revision_items(revision_id,item_number);
create unique index tower_revision_items_revision_fli_number_uidx on tower_revision_items(revision_id,fli_number) where fli_number is not null;
create table towers(id uuid primary key,project_id uuid);`);
await db.exec(fs.readFileSync('scripts/fixtures/v1-quality-numbering-before.sql','utf8'));
await db.exec(`create trigger tower_revisions_assign_revision_number before insert on tower_revisions for each row execute function tttracker_assign_revision_number();create trigger tower_revisions_sync_legacy_revision_number before insert or update of revision_number on tower_revisions for each row execute function tttracker_sync_legacy_revision_number();create trigger tower_revision_items_assign_fli_number before insert on tower_revision_items for each row execute function tttracker_assign_fli_number();`);
const P='00000000-0000-0000-0000-000000000001',A='00000000-0000-0000-0000-000000000002',B='00000000-0000-0000-0000-000000000003',U='00000000-0000-0000-0000-000000000004';
await db.query('insert into towers values ($1,$3),($2,$3)',[A,B,P]);
const original=(await db.query('insert into tower_revisions(project_id,tower_id,status,created_by) values($1,$2,\'Draft\',$3) returning *',[P,A,U])).rows[0];
assert.equal(original.fli_number,'RECT-01');
await assert.rejects(db.query('insert into tower_revisions(project_id,tower_id,fli_number) values($1,$2,null)',[P,B]),/tower_revisions_fli_number_uidx/);
console.log('PASS exact audited legacy trigger reproduces RECT-01 collision on another tower.');
const migration=fs.readFileSync('supabase/migrations/20261024143000_v1_rect_legacy_numbering_fix.sql','utf8');await db.exec(migration);await db.exec(migration);const driftMigration=fs.readFileSync('supabase/migrations/20261025100000_v1_rect_allocator_drift_safe.sql','utf8');await db.exec(driftMigration);await db.exec(driftMigration);
assert.equal((await db.query('select fli_number from tower_revisions where id=$1',[original.id])).rows[0].fli_number,'RECT-01');
let forceConflict=0;
const service={auth:{admin:{getUserById:async()=>({data:{user:{email:'test@example.invalid'}}})}},from(table){let filters=[],insert=null,update=null,columns='*';const query={select(value){columns=value;return query},eq(name,value){filters.push([name,value]);return query},insert(value){insert=value;return query},update(value){update=value;return query},async run(){try {if(forceConflict&&insert){forceConflict--;return{error:{code:'23505',message:'duplicate key value violates unique constraint "tower_revisions_fli_number_uidx"',details:'Key (fli_number)=(RECT-01) already exists.'}};}let params=[],sql='';if(insert){const keys=Object.keys(insert);params=Object.values(insert);sql=`insert into ${table}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')}) returning *`;}else{if(update){params=Object.values(update);sql=`update ${table} set ${Object.keys(update).map((k,i)=>k+'=$'+(i+1)).join(',')}`;}else sql=`select ${columns} from ${table}`;if(filters.length)sql+=' where '+filters.map(([k,v])=>{params.push(v);return k+'=$'+params.length}).join(' and ');if(update)sql+=' returning *';}return{data:(await db.query(sql,params)).rows[0]||null,error:null};}catch(error){return{data:null,error:{message:error.message,code:error.code}}}},maybeSingle(){return query.run()},single(){return query.run()},then(resolve,reject){return query.run().then(resolve,reject)}};return query;}};
const common={'next/server':{NextResponse:{json:(body,options={})=>Response.json(body,options)}},'@/lib/quality/server':{requireQualityUser:async request=>({service,user:{id:request.headers.get("x-test-user") || U},role:'test'}),assertQualityProjectAccess:async()=>{},qualityApiError:error=>({status:500,message:error.message})},'@/lib/quality/revision-notifications':{notifyRevisionEvent:async()=>({})}};
const web=load('app/api/quality/revisions/route.ts',common),mobile=load('app/api/mobile/quality/revisions/route.ts',{'@/app/api/quality/revisions/route':web});assert.equal(mobile.POST,web.POST);
const mutation='revision-1792840476967-psu178zp',findingMutation='revision-item-1792840632745-cs6d97gj';
const req=(body,user=U)=>new Request('https://www.tttracker.com.au/api/mobile/quality/revisions',{method:'POST',headers:{'x-test-user':user},body:JSON.stringify(body)});
const body={projectId:P,towerId:B,inspectionDate:'2026-10-24',clientMutationId:mutation};
// First response deliberately discarded: retry must reconcile the committed row.
const first=await mobile.POST(req(body));assert.equal(first.status,200);const parent=(await first.json()).revision;assert.equal(parent.revision_number,'RECT-01');assert.equal(parent.fli_number,null);
const retry=await mobile.POST(req(body));assert.equal(retry.status,200);assert.equal((await retry.json()).revision.id,parent.id);assert.equal((await db.query('select * from tower_revisions where mobile_client_mutation_id=$1',[mutation])).rows.length,1);
const itemRoute=load('app/api/mobile/quality/revisions/[revisionId]/items/route.ts',common),ctx={params:Promise.resolve({revisionId:parent.id})};
const itemBody={clientMutationId:findingMutation,otherIssueText:'Wrong orientation',finding:'Offline finding',leg:'B'};
const itemResult=await itemRoute.POST(req(itemBody),ctx);assert.equal(itemResult.status,200);const item=(await itemResult.json()).item;assert.equal(item.fli_number,'FLI-001');const itemRetry=await itemRoute.POST(req(itemBody),ctx);assert.equal(itemRetry.status,200);assert.equal((await itemRetry.json()).item.id,item.id);
const concurrent=await Promise.all(Array.from({length:3},()=>mobile.POST(req({...body,clientMutationId:'concurrent'}))));assert.ok(concurrent.every(r=>r.status===200));assert.equal((await db.query("select * from tower_revisions where mobile_client_mutation_id='concurrent'")).rows.length,1);
forceConflict=10;const originalWarn=console.warn;console.warn=()=>{};const conflict=await mobile.POST(req({...body,clientMutationId:'conflict'}));console.warn=originalWarn;assert.equal(conflict.status,503);assert.ok(!(await conflict.json()).error.includes('tower_revisions_fli_number_uidx'));
console.log('PASS actual shared handlers: exact stuck mutation IDs recover, parent legacy FLI null, DB-issued RECT and finding FLI, lost-response retries, concurrent duplicate reconciliation, bounded race retries.');

forceConflict=0;
await db.query("insert into tower_revisions(project_id,tower_id,status,created_by) values($1,$2,'Draft',$3),($1,$2,'Draft',$3)",[P,A,U]);
await db.query("update tower_revisions set revision_number='RECT-'||lpad(sequence_no::text,3,'0') where project_id=$1 and tower_id=$2",[P,A]);
await db.query("update tower_revisions set sequence_no=null where project_id=$1 and tower_id=$2 and revision_number='RECT-003'",[P,A]);
const stale=await mobile.POST(req({...body,towerId:A,sequence_no:3,revision_number:'RECT-003',clientMutationId:'stale-proposal'}));assert.equal(stale.status,200);assert.equal((await stale.json()).revision.revision_number,'RECT-004');
const distinct=await Promise.all(['one','two'].map((id,index)=>mobile.POST(req({...body,towerId:A,clientMutationId:'concurrent-'+id},index?'00000000-0000-0000-0000-000000000005':U))));const numbers=await Promise.all(distinct.map(async response=>(await response.json()).revision.revision_number));assert.equal(new Set(numbers).size,2);
forceConflict=1;const diagnostics=[];console.warn=(...args)=>diagnostics.push(args);const race=await mobile.POST(req({...body,towerId:A,clientMutationId:'race-reallocation'}));console.warn=originalWarn;assert.equal(race.status,200);assert.equal(diagnostics[0][1].conflictingNumber,'RECT-01');assert.equal(diagnostics[0][1].owners.id,original.id);
console.log('PASS drifted sequence with RECT-001/002/003 and stale proposed 003 allocates RECT-004; distinct concurrent requests get distinct numbers; injected numbering race reallocates automatically.');
const policy=load('mobile/lib/offline/sync-errors.ts',{});assert.equal(policy.classifySyncError(new Error('duplicate key value violates unique constraint "tower_revisions_fli_number_uidx"')),'requires_reconciliation');assert.equal(policy.classifySyncError({status:403,message:'Forbidden'}),'requires_reconciliation');assert.equal(policy.classifySyncError({status:503,message:'Unavailable'}),'retryable_failure');assert.equal(policy.classifySyncError(new policy.DependencyBlockedError('Parent Revision must sync before its findings.')),'blocked_by_dependency');assert.equal(policy.automaticRetryDue({status:'failed',lastError:'duplicate key value violates unique constraint',attempts:14,updatedAt:'2026-10-24'}),false);assert.equal(policy.automaticRetryDue({status:'retryable_failure',lastError:'Unavailable',attempts:3,updatedAt:'2026-10-24'}),false);
console.log('PASS deterministic failures never auto-retry; transient failures have bounded backoff; dependency blocks are separate.');
const fn=(await db.query("select pg_get_functiondef(oid) as def from pg_proc where proname='tttracker_assign_revision_number'")).rows[0].def;assert.ok(fn.includes('pg_advisory_xact_lock'));assert.equal((await db.query("select indexname from pg_indexes where indexname='tower_revisions_fli_number_uidx'")).rows.length,1);
console.log('PASS migration idempotent, historical FLI retained, global legacy uniqueness retained, existing advisory-lock allocator reused.');
} finally {await db.close();}
