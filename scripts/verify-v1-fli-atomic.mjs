import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const migration=fs.readFileSync('supabase/migrations/20261026120000_v1_atomic_fli_creation.sql','utf8');
const databaseUrl=process.env.FLI_TEST_DATABASE_URL;
const run=promisify(execFile);
// Optional real multi-connection PostgreSQL test. Never accepts a production DB.
if(databaseUrl && !new URL(databaseUrl).pathname.endsWith('_fli_test'))throw Error('Use an empty disposable database whose name ends in _fli_test.');
const psql=async sql=>(await run('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1','--dbname',databaseUrl,'--command',sql],{maxBuffer:2_000_000})).stdout;
const quote=value=>value==null?'null':"'"+(typeof value==='object'?JSON.stringify(value):String(value)).replaceAll("'","''")+"'";
const db=databaseUrl?{
 exec:psql,
 query:async(sql,params=[])=>{const expanded=sql.replace(/\$(\d+)/g,(_,index)=>quote(params[Number(index)-1]));return {rows:JSON.parse((await psql(`select coalesce(json_agg(row_to_json(q)),'[]') from (${expanded}) q`)).trim())};},
 close:async()=>{},
}:new PGlite();
const project='00000000-0000-0000-0000-000000000001',actor='00000000-0000-0000-0000-000000000002',rect='00000000-0000-0000-0000-000000000003',tower='00000000-0000-0000-0000-000000000004';
try {
await db.exec(`do $$begin if not exists(select 1 from pg_roles where rolname='service_role')then create role service_role;end if;if not exists(select 1 from pg_roles where rolname='anon')then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated')then create role authenticated;end if;end$$;
create table tower_revisions(id uuid primary key,project_id uuid,tower_id uuid,status text default 'In Progress',finalised_at timestamptz,updated_at timestamptz,submitted_for_review_at timestamptz,submitted_for_review_by uuid);
create table tower_revision_items(id uuid primary key default gen_random_uuid(),revision_id uuid references tower_revisions(id),project_id uuid,tower_id uuid,created_by uuid,mobile_client_mutation_id text,item_number int not null,fli_number text,sort_order int default 0,issue_type_id uuid,other_issue_text text,leg text,assigned_flag text,tower_segment text,member_number text,drawing_number text,finding text,rectification_comment text,status text);
create table tower_quality_files(revision_id uuid,revision_item_id uuid,file_role text);
create table project_field_issue_types(id uuid,project_id uuid,active boolean,applies_to text);
create function tttracker_quality_has_project_access(uuid) returns boolean language sql as $$select current_setting('request.jwt.claim.sub',true)='${actor}' and $1='${project}'::uuid$$;
insert into tower_revisions(id,project_id,tower_id)values('${rect}','${project}','${tower}');`);
await db.exec(migration);await db.exec(migration);
const create=(mutation,fields={otherIssueText:'Same issue',finding:'Identical finding text'})=>db.query('select create_v1_revision_item_atomic($1,$2,$3,$4,$5) result',[rect,project,actor,mutation,fields]).then(result=>result.rows[0].result);
// Ten simultaneous caller promises; PGlite itself queues database execution.
const ten=await Promise.all(Array.from({length:10},(_,i)=>create('phone-'+i)));
assert.equal(new Set(ten.map(row=>row.item.id)).size,10);assert.equal(new Set(ten.map(row=>row.item.fli_number)).size,10);assert.deepEqual(ten.map(row=>row.item.item_number).sort((a,b)=>a-b),Array.from({length:10},(_,i)=>i+1));
const retry=await Promise.all(Array.from({length:10},(_,i)=>create('phone-'+i)));assert.ok(retry.every(row=>row.idempotentHit));assert.deepEqual(retry.map(row=>row.item.id),ten.map(row=>row.item.id));assert.equal((await db.query('select count(*)::int n from tower_revision_items')).rows[0].n,10);
console.log('PASS 10 simultaneous caller promises: ten unique FLI/item numbers, contiguous 1–10; same mutations return same rows and create zero extras.');
const duplicate=await Promise.all(Array.from({length:10},()=>create('duplicate-request')));assert.equal(new Set(duplicate.map(row=>row.item.id)).size,1);assert.equal(duplicate.filter(row=>!row.idempotentHit).length,1);
await assert.rejects(db.exec(`update tower_revision_items set fli_number='FLI-001' where item_number=2`),/unique/);
await assert.rejects(db.exec(`update tower_revision_items set item_number=1 where item_number=2`),/unique/);
await assert.rejects(db.exec(`update tower_revision_items set mobile_client_mutation_id='phone-0' where item_number=2`),/unique/);
const six=await Promise.all(['A1','B1','A2','B2','A3','B3'].map(id=>create(id)));assert.equal(new Set(six.map(row=>row.item.fli_number)).size,6);
await assert.rejects(db.query('select create_v1_revision_item_atomic($1,$2,$3,$4,$5)',[rect,project,tower,'denied',{otherIssueText:'Issue'}]),/access denied/);
await assert.rejects(create('bad-leg',{otherIssueText:'Issue',leg:'Z'}),/Leg A/);
// A failed finalisation never commits a lock state; newly arrived findings count.
await assert.rejects(db.query('select finalise_v1_revision_atomic($1,$2,$3)',[rect,project,actor]),/Before evidence/);
await db.exec(`update tower_revision_items set status='Rectified';insert into tower_quality_files select revision_id,id,'before_photo' from tower_revision_items;insert into tower_quality_files select revision_id,id,'after_photo' from tower_revision_items;`);
const createWins=await Promise.allSettled([create('race-create-first'),db.query('select finalise_v1_revision_atomic($1,$2,$3)',[rect,project,actor])]);
assert.notEqual(createWins[0].status,createWins[1].status,'Create and finalise cannot both succeed with an unevidenced new finding.');
await db.exec(`update tower_revision_items set status='Rectified';insert into tower_quality_files select revision_id,id,'before_photo' from tower_revision_items where mobile_client_mutation_id='race-create-first';insert into tower_quality_files select revision_id,id,'after_photo' from tower_revision_items where mobile_client_mutation_id='race-create-first';`);
const finaliseWins=await Promise.allSettled([db.query('select finalise_v1_revision_atomic($1,$2,$3)',[rect,project,actor]),create('race-finalise-first')]);
assert.notEqual(finaliseWins[0].status,finaliseWins[1].status);
if(finaliseWins[1].status==='fulfilled'){
 await db.exec(`update tower_revision_items set status='Rectified';insert into tower_quality_files select revision_id,id,'before_photo' from tower_revision_items where mobile_client_mutation_id='race-finalise-first';insert into tower_quality_files select revision_id,id,'after_photo' from tower_revision_items where mobile_client_mutation_id='race-finalise-first';`);
 await db.query('select finalise_v1_revision_atomic($1,$2,$3)',[rect,project,actor]);
}
await assert.rejects(create('late'),/finalised/);assert.ok((await create('phone-0')).idempotentHit);
await db.query('select finalise_v1_revision_atomic($1,$2,$3,true)',[rect,project,actor]);
await db.exec('delete from tower_quality_files;delete from tower_revision_items;delete from tower_revisions;');
await assert.rejects(create('deleted'),/deleted or is no longer available/);
console.log('PASS two offline phones/six distinct findings; access and validation; finalise evidence validation; locked/deleted parents reject new FLIs, completed mutation retries still resolve.');
// Verify real transaction locks in the migration, not merely result-level uniqueness.
assert.match(migration,/where id=p_revision_id and project_id=p_project_id for update/g);assert.match(migration,/where id=new.revision_id for update/);assert.match(migration,/pg_advisory_xact_lock/);
console.log(databaseUrl?'PASS true independent PostgreSQL connections: ten simultaneous sessions and retries.':'NOTE PGlite serialises sessions; true independent-connection lock contention requires FLI_TEST_DATABASE_URL and psql. No hosted migration was executed.');
} finally {await db.close();}
