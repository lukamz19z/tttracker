import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
const require=createRequire(import.meta.url),ts=require("typescript");
function load(file,mocks) {const exports={};new Function("require","exports",ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{if(name.endsWith("revision-deletions"))return {revisionDeletion:async()=>null,filterDeletedRevisions:async(_project,rows)=>rows};if(name==="./quality-operation-lock")return {withQualityOperation:operation=>operation()};if(name.endsWith("/date-time")) return load("lib/quality/date-time.ts",{});assert.ok(name in mocks,`Missing mock ${name}`);return mocks[name];},exports);return exports;}
globalThis.__DEV__=false;
process.env.SUPABASE_SERVICE_ROLE_KEY="test-key-never-a-real-secret";
const ticketModule=load("lib/quality/upload-ticket.ts",{"node:crypto":require("node:crypto")});
const payload={userId:"user-a",expires:Date.now()+60_000,projectId:"project",size:8*1024*1024};
const ticket=ticketModule.signQualityUpload(payload);
assert.deepEqual(ticketModule.verifyQualityUpload(ticket,"user-a"),payload);
assert.throws(()=>ticketModule.verifyQualityUpload(ticket,"user-b"));
assert.throws(()=>ticketModule.verifyQualityUpload(ticket.replace(/^./,"x"),"user-a"));
assert.throws(()=>ticketModule.verifyQualityUpload(ticketModule.signQualityUpload({...payload,expires:1}),"user-a"));

const original=Buffer.alloc(8*1024*1024,139),saved=Buffer.from(original),puts=[];
class LocalFile {
  constructor(uri) {this.uri=uri;this.size=uri==="original"?original.length:6*1024*1024;this.exists=true;}
  open(){return {offset:0,readBytes(size){const bytes=Uint8Array.from(original.subarray(this.offset,this.offset+size));this.offset+=size;return bytes;},close(){}};}
}
let completed=0;
const api=load("mobile/lib/api/quality.ts",{
  "expo/fetch":{fetch:async(url,init)=>{assert.equal(url,"https://upload.example/scoped-secret");assert.ok(!("Authorization" in init.headers));const range=init.headers["Content-Range"].match(/bytes (\d+)-(\d+)\/(\d+)/);const [start,end,total]=range.slice(1).map(Number);assert.equal(init.body.byteLength,end-start+1);assert.ok(init.body.byteLength<=320*1024*5);if(end+1<total) assert.equal(init.body.byteLength%(320*1024),0);puts.push({start,end});return new Response("",{status:end+1===total?201:202});}},
  "react-native":{Image:{getSize:(_uri,callback)=>callback(4032,3024)}},
  "@/lib/offline/connectivity":{manuallyOffline:()=>false},
  "@/lib/offline/files":{offlineFileExists:()=>true},"expo-file-system":{File:LocalFile,Paths:{}},"expo-sharing":{},
  "@/lib/api/client":{ApiRequestError:class extends Error{},apiJson:async(path,init)=>{const value=JSON.parse(init.body);assert.ok(init.body.length<4000);assert.ok(!init.body.includes("data:image"));if(path.endsWith("upload-session")){assert.equal(value.size,original.length);assert.ok(!value.uri && !value.annotatedUri);return {uploadUrl:"https://upload.example/scoped-secret",ticket:"signed-metadata-only"};}assert.equal(value.ticket,"signed-metadata-only");completed++;return {file:{id:"evidence"}};}},
  "@/lib/offline/db":{},"@/lib/offline/revision-workspaces":{},
});
assert.equal((await api.uploadQualityPhoto({projectId:"p",towerId:"t",revisionId:"r",revisionItemId:"i",fileRole:"before_photo",uri:"original",annotatedUri:"annotated",name:"photo.jpg",mimeType:"image/jpeg",clientMutationId:"photo-1",capturedAt:"2026-10-25T05:19:23.123Z"})).file.id,"evidence");
assert.equal(completed,1);assert.equal(puts[0].start,0);assert.equal(puts.at(-1).end+1,original.length);assert.deepEqual(original,saved);
console.log("PASS 8 MiB original + 6 MiB preview: only bounded binary chunks go direct; website JSON stays below 4 KiB; no bearer forwarded; original unchanged.");

let rows=[{id:"finding-mutation",kind:"quality_revision_item_create",status:"failed",attempts:0,payload:{clientMutationId:"finding-mutation"}}];
let workspace={routeKey:"local-r",projectId:"p",serverRevisionId:null,findings:[{clientMutationId:"finding-mutation",beforePhotos:[],afterPhotos:[]}],pendingUpdates:[]};
let cleaned=0,serverDeletes=0;
const deletion=load("mobile/lib/offline/quality-deletion.ts",{
  "@/lib/api/client":{apiJson:async()=>{serverDeletes++;throw new Error("No server DELETE for an unsynced draft");}},
  "./db":{getCache:async()=>null,queueRows:async()=>rows,removeCache:async()=>{},removeQueueRecord:async id=>{rows=rows.filter(row=>row.id!==id);},replaceQueuePayload:async()=>{}},
  "./quality-sync":{cleanupQualityRecord:async()=>cleaned++},
  "./revision-workspaces":{listRevisionWorkspaces:async()=>[workspace],saveRevisionWorkspace:async value=>{workspace=value;}},
  "@/lib/api/quality":{},
});
await deletion.deleteQualityFinding({projectId:"p",routeKey:"local-r",clientMutationId:"finding-mutation",confirm:"pending FLI",online:false});
assert.equal(rows.length,0);assert.equal(workspace.findings.length,0);assert.ok(workspace.reconciledFindingIds.includes("finding-mutation"));assert.equal(serverDeletes,0);assert.ok(cleaned);
rows=[{id:"defect-mutation",kind:"quality_defect_create",status:"failed",attempts:0,payload:{photos:[]}}];
await deletion.deleteQualityDefect({projectId:"p",clientMutationId:"defect-mutation",confirm:"pending DEF",online:false});
assert.equal(rows.length,0);assert.equal(serverDeletes,0);
console.log("PASS local FLI and DEF deletion: no HTTP DELETE, queue/errors removed, finding tombstone persisted, evidence cleanup invoked.");

const display=load("lib/quality/display-name.ts",{});
assert.equal(display.qualityDisplayName("Luka Z · luka@example.com"),"Luka Z");
assert.equal(display.qualityDisplayName("luka@example.com"),"TTTracker User");
const layout=load("lib/quality/evidence-layout.ts",{});
const lines=layout.watermarkLines({kind:"defect",phase:"AFTER",reference:"DEF-012",tower:"093",issue:"A very long complete issue description"});
assert.ok(lines.includes("DEF-012"));assert.ok(lines.includes("AFTER"));assert.ok(!lines.some(line=>line.includes("Pending FLI") || line.includes("RECT")));
console.log("PASS assignment privacy and DEF watermark namespace/AFTER label.");

const sharp=require("sharp");
const watermarks=load("lib/quality/evidence-watermark.ts",{'node:path':{default:require('node:path')},sharp:{default:sharp},"./evidence-layout":layout});
const pixels=Buffer.alloc(2600*1950*3);let seed=42;
for(let i=0;i<pixels.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels[i]=seed>>>24;}
const source=await sharp(pixels,{raw:{width:2600,height:1950,channels:3}}).png().toBuffer();
const retained=Buffer.from(source);
const derivative=await watermarks.annotateEvidence(source,{kind:"defect",phase:"AFTER",reference:"DEF-012",tower:"093",issue:"Engineering evidence with complete metadata"},"bottom-left");
const dimensions=await sharp(derivative).metadata();
assert.equal(dimensions.format,"jpeg");assert.ok(dimensions.width<=2400 && dimensions.height<=2400);assert.ok(derivative.length<source.length);assert.deepEqual(source,retained);
console.log(`PASS actual Sharp optimisation fixture: original ${source.length} bytes; annotated JPEG ${derivative.length} bytes, ${dimensions.width}x${dimensions.height}; original unchanged.`);

let locked=false,providerFailure=false,deleteCount=0,physical=[],cleanups=0;
const tables={tower_revisions:[{id:"r",project_id:"p",status:"In Progress",finalised_at:null}],tower_revision_items:[{id:"i",revision_id:"r",item_number:3,fli_number:"FLI-003"}],tower_quality_files:[{id:"f",revision_id:"r",revision_item_id:"i",sharepoint_drive_id:"drive",sharepoint_item_id:"original",annotated_sharepoint_item_id:"annotated"}]};
const service={from(name){let op="read",filters=[];const q={select(){return q;},eq(key,value){filters.push([key,value]);return q;},or(){return q;},in(){return q;},update(){op="update";return q;},delete(){op="delete";return q;},maybeSingle(){return Promise.resolve(result(true));},then(resolve,reject){return Promise.resolve(result(false)).then(resolve,reject);}};function result(single){let data=tables[name]||[];data=data.filter(row=>filters.every(([key,value])=>row[key]===value));if(name==="tower_revisions" && locked)data=data.map(row=>({...row,status:"Submitted"}));if(op==="delete"){deleteCount++;}return {data:single?data[0]||null:data,error:null};}return q;}};
const {deleteFinding}=load("lib/quality/delete-finding.ts",{
  "next/server":{NextResponse:{json:(value,init)=>new Response(JSON.stringify(value),{status:init?.status||200})}},
  "./server":{requireQualityUser:async()=>({service,user:{id:"user"},role:""}),assertQualityProjectAccess:async()=>{},qualityApiError:error=>({status:500,message:error.message})},
  "./fli":{revisionItemFli:item=>item.fli_number},"@/lib/mobile/server":{requireMobilePermission:async()=>{}},
  "@/lib/sharepoint/graph":{deleteDriveItem:async value=>{if(providerFailure)throw new Error("Provider offline");physical.push(value.itemId);}},
  "./upload-cleanup":{cleanupQualityUploadSessions:async()=>cleanups++},
});
const deleteRequest=confirm=>new Request("https://test/items/i",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({confirm})});
const ctx={params:Promise.resolve({revisionId:"r",itemId:"i"})};
locked=true;assert.equal((await deleteFinding(deleteRequest("FLI-003"),ctx)).status,409);assert.equal(deleteCount,0);
locked=false;assert.equal((await deleteFinding(deleteRequest("FLI-002"),ctx)).status,400);assert.equal(deleteCount,0);
providerFailure=true;assert.equal((await deleteFinding(deleteRequest("FLI-003"),ctx)).status,500);assert.equal(deleteCount,0);
providerFailure=false;assert.equal((await deleteFinding(deleteRequest("FLI-003"),ctx)).status,200);assert.deepEqual(physical,["original","annotated"]);assert.equal(deleteCount,2);assert.ok(cleanups);
console.log("PASS actual server FLI DELETE: confirmation and controlled-record lock; original+derivative cleanup; provider failure retains metadata; successful deletion removes relationships/item.");

let defectRows=[],defectInserts=0;
const defectService={from(table){assert.equal(table,"tower_defects");let filters=[],insert;const q={select(){return q;},eq(key,value){filters.push([key,value]);return q;},maybeSingle(){return Promise.resolve({data:defectRows.find(row=>filters.every(([key,value])=>row[key]===value))||null,error:null});},insert(value){insert=value;return q;},single(){if(defectRows.some(row=>row.mobile_client_mutation_id===insert.mobile_client_mutation_id))return Promise.resolve({data:null,error:{code:"23505"}});defectInserts++;const row={...insert,id:"server-defect",defect_number:"DEF-001"};defectRows.push(row);return Promise.resolve({data:row,error:null});}};return q;}};
const canonical=load("app/api/quality/defects/route.ts",{
  "next/server":{NextResponse:{json:(value,init)=>new Response(JSON.stringify(value),{status:init?.status||200})}},
  "@/lib/quality/display-name":display,
  "@/lib/dockets/system-user-identity":{resolveSystemUserIdentityById:async()=>({name:"Luka Z"})},
  "@/lib/quality/defect-notifications":{notifyDefectEvent:async()=>{}},
  "@/lib/quality/server":{requireQualityUser:async()=>({service:defectService,user:{id:"user"},role:""}),assertQualityProjectAccess:async()=>{},loadQualityProject:async()=>({id:"p"}),loadQualityTower:async()=>({id:"t"}),qualityTowerLabel:()=>"Tower",qualityUserLabel:()=>"Luka Z",qualityApiError:error=>({status:500,message:error.message})},
});
const createRequest=()=>new Request("https://test/defects",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId:"p",towerId:"t",description:"Long engineering finding",clientMutationId:"offline-defect",leg:"B",source:"mobile"})});
const concurrent=await Promise.all([canonical.POST(createRequest()),canonical.POST(createRequest())]);
for(const response of concurrent){assert.equal(response.status,200);assert.equal((await response.json()).defect.id,"server-defect");}
assert.equal(defectInserts,1);assert.equal(defectRows[0].mobile_client_mutation_id,"offline-defect");assert.equal(defectRows[0].leg,"B");
assert.equal((await (await canonical.POST(createRequest())).json()).defect.defect_number,"DEF-001");assert.equal(defectInserts,1);
console.log("PASS actual canonical DEF POST: mutation key is inserted atomically, concurrent/lost-response retry returns the same DEF, Leg B retained.");

const db=new PGlite();
try {
  await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table projects(id uuid primary key);create table towers(id uuid primary key);create table tower_revisions(id uuid primary key);create table tower_revision_items(id uuid primary key);create table tower_defects(id uuid primary key);");
  const sql=fs.readFileSync("supabase/migrations/20261025120000_v1_quality_upload_sessions.sql","utf8");
  await db.exec(sql);await db.exec(sql);
  const contextSql=fs.readFileSync("supabase/migrations/20261025123000_v1_defect_evidence_leg.sql","utf8");
  await db.exec(contextSql);await db.exec(contextSql);
  const result=await db.query("select relrowsecurity from pg_class where relname='tower_quality_upload_sessions'");assert.equal(result.rows[0].relrowsecurity,true);
  const grants=await db.query("select has_table_privilege('anon','tower_quality_upload_sessions','select') as anon,has_table_privilege('authenticated','tower_quality_upload_sessions','select') as authenticated");assert.equal(grants.rows[0].anon,false);assert.equal(grants.rows[0].authenticated,false);
}finally{await db.close();}
console.log("PASS upload receipt migration additive/idempotent, RLS enabled, no direct client access; signed tickets reject tampering, wrong user and expiry.");
