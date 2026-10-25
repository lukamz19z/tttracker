import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),sharp=require('sharp');
const {PGlite}=require('@electric-sql/pglite');
function load(file,mocks={}){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{assert.ok(name in mocks,name);return mocks[name]},exports);return exports;}
const db=new PGlite(),ids=Array.from({length:6},(_,i)=>`00000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`);
try {
 await db.exec('create role service_role; create table tower_quality_files(id uuid primary key,revision_item_id uuid,defect_id uuid); create table tower_quality_upload_sessions(id uuid primary key,revision_item_id uuid,defect_id uuid); create table tower_revisions(id uuid primary key,pdf_revision int);');
 const migration=fs.readFileSync('supabase/migrations/20261025150000_v1_quality_photo_numbers.sql','utf8');
 await db.exec(migration);await db.exec(migration);
 for(const id of ids.slice(0,3)) await db.query('insert into tower_quality_upload_sessions(id,revision_item_id) values($1,$2)',[id,ids[5]]);
 const reserve=id=>db.query("select claim_v1_quality_photo_number(null,$1,'BEFORE') n",[id]);
 const numbers=await Promise.all(ids.slice(0,3).map(reserve));assert.deepEqual(numbers.map(r=>r.rows[0].n),[1,2,3]);assert.equal((await reserve(ids[0])).rows[0].n,1);
 await db.query('insert into tower_quality_files(id,revision_item_id,photo_no,evidence_type) values($1,$2,1,\'BEFORE\')',[ids[3],ids[5]]);
 assert.equal((await db.query("select claim_v1_quality_photo_number($1,null,'BEFORE') n",[ids[3]])).rows[0].n,1);
 await db.query('insert into tower_revisions(id,pdf_revision) values($1,4)',[ids[4]]);
 const pdfs=await Promise.all([1,2].map(()=>db.query('select reserve_v1_revision_pdf_number($1) n',[ids[4]])));assert.deepEqual(pdfs.map(r=>r.rows[0].n),[5,6]);
 assert.equal((await db.query('select pdf_revision from tower_revisions')).rows[0].pdf_revision,4);
 const grants=await db.query("select has_function_privilege('public','claim_v1_quality_photo_number(uuid,uuid,text)','execute') p");assert.equal(grants.rows[0].p,false);
} finally {await db.close();}
console.log('PASS additive/idempotent migration; stable evidence reservations, independent concurrent numbers, PDF reservation leaves published pointer unchanged; RPCs private.');
const names=load('lib/quality/file-names.ts');
assert.equal(names.qualityEvidenceName('P-UGL-26-002','5C3/5C1-093','RECT-01','FLI-003','BEFORE',1),'P-UGL-26-002_5C3-5C1-093_RECT-01_FLI-003_BEFORE-01.jpg');
assert.equal(names.qualityPdfName('P-UGL-26-002','5C3/5C1-093','RECT-01',1),'P-UGL-26-002_5C3-5C1-093_RECT-01_R01.pdf');
const http=load('lib/quality/http-response.ts');await assert.rejects(http.qualityJsonResponse(new Response('<!DOCTYPE html>',{status:404,headers:{'content-type':'text/html'}}),'Revision PDF service'),/HTTP 404 instead of JSON/);
assert.deepEqual(await http.qualityJsonResponse(Response.json({ok:true})),{ok:true});
const cache=new Map(),store={'@/lib/offline/db':{getCache:async key=>cache.has(key)?{value:structuredClone(cache.get(key))}:null,setCache:async(key,value)=>cache.set(key,structuredClone(value))}};
let work=load('mobile/lib/offline/revision-workspaces.ts',store);
let local=work.createLocalRevisionWorkspace({projectId:'P',towerId:'T',clientMutationId:'revision-old',inspectionStage:'Post Erection',inspectionDate:'2026-10-25'});await work.saveRevisionWorkspace(local);
const detail={projectId:'P',generatedAt:'2026-10-25T01:00:00Z',revision:{id:'SERVER',tower_id:'T',revision_number:'RECT-01',mobile_client_mutation_id:'revision-old',inspection_stage:'Post Erection',inspection_date:'2026-10-25'},items:[{id:'I',fli_number:'FLI-003'}],files:[]};
await work.reconcileRevisionDetail('P',detail,local.routeKey);await work.saveRevisionWorkspace(local);
work=load('mobile/lib/offline/revision-workspaces.ts',store);const rows=await work.listRevisionWorkspaces('P');assert.equal(rows.length,1);assert.equal(rows[0].serverRevisionId,'SERVER');assert.equal(rows[0].cachedDetail.items[0].fli_number,'FLI-003');assert.equal(rows[0].reconciliationStatus,'synced');
await work.reconcileRevisionDetail('P',detail);assert.equal((await work.listRevisionWorkspaces('P')).length,1);
await work.removeRevisionWorkspace('P',local.routeKey);const restored=await work.reconcileRevisionDetail('P',detail,local.routeKey);assert.ok(restored.legacyRouteKeys.includes(local.routeKey));assert.equal(restored.serverRevisionId,'SERVER');
console.log('PASS safe HTML response handling, clean names; retained workspace/detail across restart and stale UI writes; one logical record; deleted old route reconstructed from canonical detail.');
const layout=load('lib/quality/evidence-layout.ts'),renderer=load('lib/quality/evidence-watermark.ts',{'node:path':{default:path},sharp:{default:sharp},'./evidence-layout':layout});
const original=await sharp({create:{width:1600,height:1200,channels:3,background:'#8ea7ba'}}).jpeg().toBuffer();
const output=await renderer.annotateEvidence(original,{phase:'BEFORE',project:'P-UGL-26-002',tower:'5C3/5C1-093',reference:'RECT-01',fli:'FLI-003',assignedFlag:'F4',leg:'A',segment:'+10m Leg Extension',member:'2501H',drawing:'TL-799312-52',issue:'Incorrect Bolt / Washer',capturedAt:'24/10/2026 16:20'},'bottom-left');
const fixture=path.join(os.tmpdir(),'tt-quality-readable-watermark.jpg');fs.writeFileSync(fixture,output);console.log('Private-font raster fixture: '+fixture);

// Exercise the actual controlled PDF handler, including publication failure.
const revision={id:'RECT',project_id:'P',tower_id:'T',revision_number:'RECT-01',status:'In Progress',pdf_revision:0};
const item={id:'I',item_number:3,fli_number:'FLI-003',issue_type_id:'ISSUE',status:'Rectified',rectification_comment:'Corrected',finding:'Finding'};
const evidence=['before_photo','after_photo'].map((role,i)=>({id:'F'+i,project_id:'P',tower_id:'T',revision_id:'RECT',revision_item_id:'I',defect_id:null,file_role:role,file_name:role+'.jpg',mime_type:'image/jpeg',sharepoint_drive_id:'DRIVE',sharepoint_item_id:'ORIGINAL',annotated_sharepoint_item_id:'ANNOTATED'+i,captured_at:null,uploaded_by_label:'Test'}));
let failPublish=false,authFailure=false,inserted=0,pointers=0,generated,uploadedName;
const service={rpc:async()=>({data:1,error:null}),from(table){const q={select(){return q},eq(){return q},in(){return q},order(){return q},neq(){return q},or(){return q},update(){if(table==='tower_revisions')pointers++;return q},insert(){inserted++;return q},single:async()=>({data:table==='tower_revisions'?revision:{id:'PDF',file_name:uploadedName},error:null}),then(resolve,reject){return Promise.resolve({data:table==='tower_revision_items'?[item]:table==='project_field_issue_types'?[{id:'ISSUE',name:'Wrong orientation'}]:evidence,error:null}).then(resolve,reject)}};return q}};
const route=load('app/api/quality/files/revisions/[revisionId]/pdf/route.ts',{
 '@/lib/quality/evidence-context':{revisionEvidenceContext:()=>({reference:'RECT-01',fli:'FLI-003'})},
 '@/lib/quality/evidence-watermark':renderer,'@/lib/quality/fli':{revisionItemFli:i=>i.fli_number,revisionReference:r=>r.revision_number},
 'next/server':{NextResponse:{json:Response.json}},sharp:{default:sharp},
 '@/lib/quality/evidence-publication':{ensurePublishedQualityEvidence:async(_service,file)=>file},'@/lib/quality/file-names':names,
 '@/lib/branding/server':{loadSystemPdfBranding:async()=>({})},
 '@/lib/quality/revision-pdf':{generateRevisionPdf:value=>{generated=value;return Buffer.from('%PDF-test')}},
 '@/lib/quality/server':{requireQualityUser:async()=>{if(authFailure)throw Error('Sign in required');return {service,user:{id:'U'},role:'test'}},assertQualityProjectAccess:async()=>{},loadQualityProject:async()=>({project_number:'P-UGL-26-002',sharepoint_drive_id:'DRIVE',sharepoint_folder_id:'ROOT'}),loadQualityTower:async()=>({}),qualityTowerLabel:()=> '5C3/5C1-093',qualityUserLabel:()=> 'Test',qualityApiError:error=>({message:error.message,status:authFailure?401:500})},
 '@/lib/sharepoint/quality':{ensureRevisionFolder:async()=>({id:'FOLDER'}),uploadQualityFile:async value=>{uploadedName=value.fileName;if(failPublish)throw Error('Synthetic SharePoint publication failure');return {id:'PROVIDER',name:value.fileName}}},
 '@/lib/sharepoint/graph':{getGraphAccessToken:async()=> 'synthetic-token',deleteDriveItem:async()=>{}}
});
const fetchOriginal=globalThis.fetch;
globalThis.fetch=async()=>new Response(output,{headers:{'content-type':'image/jpeg'}});
const call=()=>route.POST(new Request('https://test/api/quality/revisions/RECT/pdf',{method:'POST'}),{params:Promise.resolve({revisionId:'RECT'})});
try {
 authFailure=true;assert.equal((await call()).status,401);authFailure=false;
 failPublish=true;const failed=await call();assert.equal(failed.status,500);assert.match(failed.headers.get('content-type'),/application\/json/);assert.equal(inserted,0);assert.equal(pointers,0);
 failPublish=false;const succeeded=await call();assert.equal(succeeded.status,200);assert.equal(inserted,1);assert.equal(pointers,1);assert.equal(uploadedName,'P-UGL-26-002_5C3-5C1-093_RECT-01_R01.pdf');assert.ok(generated.items[0].beforePhotos[0].dataUrl.startsWith('data:image/jpeg;base64,'));assert.ok(generated.items[0].afterPhotos[0]);
} finally {globalThis.fetch=fetchOriginal;}
console.log('PASS actual PDF handler: JSON auth/error responses, SharePoint failure leaves published metadata untouched, successful annotated Before/After generation publishes clean PDF and then updates pointer.');
