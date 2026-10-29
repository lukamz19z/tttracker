import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
function load(file,mocks){const exports={};new Function("require","exports",ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{assert.ok(name in mocks,`Missing mock ${name}`);return mocks[name];},exports);return exports;}
const values=new Map();let rows=[],removed=[],requests=[];
const db={getCache:async key=>values.has(key)?{value:values.get(key)}:null,setCache:async(key,value)=>values.set(key,value),removeCache:async key=>values.delete(key),queueRows:async()=>rows,replaceQueuePayload:async(id,payload)=>{rows=rows.map(row=>row.id===id?{...row,payload}:row);},enqueue:async(kind,payload,id)=>{if(!rows.some(row=>row.id===id))rows.push({id,kind,payload});}};
const tombstones=load("mobile/lib/offline/quality-photo-tombstones.ts",{"@/lib/offline/db":db});
const operations=load("mobile/lib/offline/quality-operation-lock.ts",{});
const deletion=load("mobile/lib/offline/quality-photo-deletion.ts",{"./db":db,"./quality-photo-tombstones":tombstones,"./quality-operation-lock":operations,"@/lib/offline/files":{removeOfflineFile:async uri=>{if(uri)removed.push(uri);}},"@/lib/api/client":{apiJson:async(url,init)=>requests.push({url,body:JSON.parse(init.body)})},"@/lib/quality-evidence":{waitQualityAnnotations:async()=>{}}});
for(const phase of ["beforePhotos","afterPhotos"]){
  const photo={id:`local-${phase}`,uri:`file://${phase}`,originalUri:`file://${phase}`,annotatedUri:`file://${phase}-annotated`};
  const stale={findings:[{clientMutationId:"finding",[phase]:[photo,{id:"keep",uri:"file://keep"}]}]};
  rows=[{id:"upload",kind:"quality_revision_item_create",payload:structuredClone(stale)}];
  await db.setCache(`quality:photo-annotation:${photo.id}`,photo);
  await deletion.deleteLocalQualityPhoto(photo);
  assert.deepEqual(rows[0].payload.findings[0][phase].map(row=>row.id),["keep"]);
  assert.deepEqual((await tombstones.withoutDeletedPhotos(stale)).findings[0][phase].map(row=>row.id),["keep"]);
  assert.ok(removed.includes(photo.annotatedUri));assert.equal(requests.length,0);
}
const file={id:"server-photo",project_id:"p",revision_id:"r",revision_item_id:"i",file_role:"after_photo"};
rows=[];await db.setCache(`quality:preview:${file.id}`,"file://cached-preview");
await deletion.queueQualityPhotoDelete(file);await deletion.queueQualityPhotoDelete(file);
assert.equal(rows.length,1);assert.equal(requests.length,0);assert.ok(await tombstones.photoDeleted(file.id));assert.ok(removed.includes("file://cached-preview"));
await deletion.syncQualityPhotoDelete(rows[0].payload);assert.equal(requests[0].url,"/api/quality/files/server-photo");assert.equal(requests[0].body.confirm,true);
// Upload won the race while a stale screen still considered this photo local.
await db.setCache("quality:photo-server:late",{...file,id:"late-server"});
await deletion.deleteLocalQualityPhoto({id:"late",uri:"file://late"});
assert.ok(rows.some(row=>row.id==="delete-photo:late-server"));assert.ok(await tombstones.photoDeleted("late-server"));
console.log("PASS unsynced Before/After delete removes queue references and derivatives without server calls; stale snapshots stay deleted; offline synced deletion is idempotent and queued; upload-won race becomes a controlled server delete.");

let finish=0,providerFailure=true,physical=[];
const audit={file_snapshot:{sharepoint_drive_id:"drive",sharepoint_item_id:"original",annotated_sharepoint_item_id:"annotated"},completed_at:null};
const route=load("app/api/quality/files/[fileId]/route.ts",{
  "next/server":{NextResponse:{json:(body,init)=>Response.json(body,init)}},
  "@/lib/quality/workflow-access":{qualityWorkflowAccess:async()=>({user:{id:"actor"},service:{rpc:async(name)=>{if(name.startsWith("finish")){finish++;return{data:null,error:null};}return{data:audit,error:null};}}})},
  "@/lib/quality/atomic-error":{atomicQualityError:error=>({status:409,message:error.message})},
  "@/lib/quality/server":{qualityApiError:error=>({status:503,message:error.message})},
  "@/lib/sharepoint/graph":{deleteDriveItem:async({itemId})=>{if(providerFailure)throw Error("Connection lost");physical.push(itemId);}},
});
const request=()=>new Request("https://test.invalid/photo",{method:"DELETE",body:JSON.stringify({confirm:true})}),context={params:Promise.resolve({fileId:"photo"})};
assert.equal((await route.DELETE(request(),context)).status,503);assert.equal(finish,0);
providerFailure=false;assert.equal((await route.DELETE(request(),context)).status,200);assert.deepEqual(physical,["original","annotated"]);assert.equal(finish,1);
console.log("PASS SharePoint provider failure retains the deletion audit and metadata; both original and derivative are removed before finishing metadata deletion.");
