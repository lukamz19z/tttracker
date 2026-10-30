import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript"),sharp=require("sharp");
function load(file,mocks={}) {
  const exports={};
  new Function("require","exports",ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>{
    if(name in mocks)return mocks[name];
    if(name.startsWith("."))return load(path.join(path.dirname(file),name)+".ts",mocks);
    throw Error(`Missing mock ${name} in ${file}`);
  },exports);return exports;
}
const matching=load("lib/quality/punchlist.ts");
const raw=Array.from({length:200},(_,i)=>({Tower:"136", "External Reference":`TG-${String(i+1).padStart(6,"0")}`,"Defect Type":"Damaged galvanising",Description:"Repair coating", "Inspected By":"John Smith"}));
const rows=matching.mapPunchlistRows(raw,matching.suggestPunchlistMapping(Object.keys(raw[0])));
assert.equal(rows[0].inspector,"John Smith");
for(const column of ["Inspector","Inspected By","Raised By"])assert.equal(matching.suggestPunchlistMapping([column]).inspector,column);
const files=rows.map(row=>({name:`${row.externalReference}_01.jpg`}));
files.push(...rows.slice(0,60).map(row=>({name:`${row.externalReference}_02.jpg`})));
const started=performance.now(),review=matching.matchPunchlistPhotos(rows,files),elapsed=performance.now()-started;
assert.equal(review.matches.length,260);assert.equal(review.matches.filter(m=>m.state==="matched").length,260);
assert.equal(review.matches.filter(m=>m.rowKey===rows[0].rowKey).length,2);assert.equal(review.findingsWithoutPhotos.length,0);
assert.ok(elapsed<2000,`Metadata matching took ${elapsed} ms`);
const duplicate={...rows[0],rowKey:"other-tower",tower:"137"};
const exceptional=matching.matchPunchlistPhotos([...rows,duplicate],[{name:"TG-000001_03.jpg"},{name:"unrelated.jpg"},{name:"TG-0000012_01.jpg"},{name:"TG-000001_other.jpg"}]);
assert.deepEqual(exceptional.matches.map(m=>m.state),["ambiguous","unmatched","unmatched","unmatched"]);
assert.deepEqual(exceptional.duplicateReferences,["TG-000001"]);
const assigned=matching.matchPunchlistPhotos([...rows,duplicate],[{name:"TG-000001_03.jpg"},{name:"unrelated.jpg"}],{0:"other-tower",1:rows[1].rowKey});
assert.equal(assigned.matches[0].rowKey,"other-tower");assert.equal(assigned.matches[1].rowKey,rows[1].rowKey);
assert.equal(matching.matchPunchlistPhotos(rows,[{name:"unrelated.jpg"}],{0:"skip"}).matches[0].state,"skipped");
assert.equal(matching.matchPunchlistPhotos([{...rows[0],photos:"office.jpg; second.jpg"}],[{name:"SECOND.JPG"}]).matches[0].state,"matched");
console.log(`PASS 200 findings / 260 photos (${elapsed.toFixed(1)} ms), multiple images, exact boundaries, unmatched/ambiguous files, manual assignments, exclusions and inspector aliases.`);

const readiness=load("lib/quality/finding-readiness.ts").findingReadiness;
const item={status:"Open",other_issue_text:"Damaged galvanising",rectification_comment:""};
assert.deepEqual(readiness(item,1,1),{photosComplete:true,ready:true,workflow:"Ready to Rectify"});
assert.equal(readiness({...item,rectification_comment:"Repaired"},1,1).workflow,"Ready to Rectify");
assert.equal(readiness({...item,status:"Rectified",rectification_comment:"Repaired"},1,1).workflow,"Rectified");
assert.equal(readiness({...item,rectification_comment:"Repaired"},1,0).ready,false);
for(const comment of [null,"","   ","Repaired"]) {
  assert.equal(readiness({...item,rectification_comment:comment},1,1).workflow,"Ready to Rectify");
  assert.equal(readiness({...item,rectification_comment:comment,status:"Rectified"},1,1).workflow,"Rectified");
  assert.equal(readiness({...item,rectification_comment:comment},0,1).ready,false);
  assert.equal(readiness({...item,rectification_comment:comment},1,0).ready,false);
}
const webPage="app/(protected)/project/[projectId]/tower/[towerId]/revisions/page.tsx";
const screens=[webPage,"components/quality/PunchlistImport.tsx","mobile/app/revisions/[revisionId].tsx","mobile/app/revisions/[revisionId]/[itemId].tsx","mobile/components/quality/QualityPhotoPicker.tsx","mobile/components/quality/QualityEvidenceGallery.tsx"];
for(const file of screens) {
  const source=fs.readFileSync(file,"utf8"),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function visit(node){if(ts.isJsxText(node)||ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isTemplateHead(node)||ts.isTemplateMiddle(node)||ts.isTemplateTail(node)){
    const value=node.text;assert.ok(!/(?:\s\?\s|\? Delete Photo)/.test(value) && !(ts.isJsxText(node) && node.parent.children.length===1 && /^\s*\?\s*$/.test(value)),`${file}: broken question-mark literal ${value}`);assert.notEqual(value,"Legacy",file);
  }ts.forEachChild(node,visit);}visit(ast);
}
assert.match(fs.readFileSync(webPage,"utf8"),/Save &amp; Mark Rectified/);
assert.match(fs.readFileSync(webPage,"utf8"),/Photos Complete/);
for(const screen of screens)assert.doesNotMatch(fs.readFileSync(screen,"utf8"),/Comment Required|Comment required|commentRequired/);
assert.doesNotMatch(fs.readFileSync("components/quality/PunchlistImport.tsx","utf8"),/<img|createObjectURL/);

const browser=load("lib/quality/browser-evidence.ts");
const blank=browser.emptyCaptureDetails,bytes=new Uint8Array([0,1,2]);
assert.equal(browser.resolveEvidenceCapture(blank,bytes).capturedAt,null);
assert.deepEqual(browser.resolveEvidenceCapture({...blank,capturedBy:"Michael Brown",capturedDate:"29/10/2026"},bytes),{capturedAt:null,capturedDate:"2026-10-29",capturedBy:"Michael Brown"});
assert.equal(browser.resolveEvidenceCapture({...blank,capturedDate:"29/10/2026",capturedTime:"14:30"},bytes,"Australia/Sydney").capturedAt,"2026-10-29T03:30:00.000Z");
assert.throws(()=>browser.resolveEvidenceCapture({...blank,capturedTime:"14:30"},bytes),/capture date/);
assert.throws(()=>browser.resolveEvidenceCapture({...blank,capturedBy:"person@example.com"},bytes),/not an email/);
let sessions=[],completed=0,chunks=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(_url,init)=>{assert.equal(init.method,"PUT");assert.ok(init.body.size<=1638400);assert.ok(!init.headers.Authorization);chunks++;return new Response(null,{status:201});};
const api=async(url,init)=>{const body=JSON.parse(init.body);if(url.endsWith("upload-session")){sessions.push(body);return Response.json({ticket:"signed",uploadUrl:"https://upload.invalid/one-photo"});}assert.equal(body.ticket,"signed");completed++;return Response.json({file:{id:"photo"}});};
try {
  for(const fileRole of ["before_photo","after_photo"])await browser.uploadBrowserEvidence(api,new File([new Uint8Array(2_000_000)],"office.jpg",{type:"image/jpeg"}),{projectId:"P",towerId:"T",revisionId:"R",revisionItemId:"I",fileRole},{...blank,capturedBy:"Michael Brown"});
}finally{globalThis.fetch=originalFetch;}
assert.equal(completed,2);assert.equal(chunks,4);assert.deepEqual(sessions.map(s=>s.evidencePhase),["BEFORE","AFTER"]);assert.ok(sessions.every(s=>s.capturedAt===null && s.capturedBy==="Michael Brown"));assert.equal(sessions[0].clientMutationId,sessions[1].clientMutationId);
console.log("PASS website Before/After chunked uploads, stable retries, explicit closeout labels, independent readiness and unknown/date-only/project-local capture times.");

// Exercise the actual server upload handler and real Sharp watermark renderer.
const original=await sharp({create:{width:1200,height:900,channels:3,background:"#8ea7ba"}}).jpeg().toBuffer();
const layout=load("lib/quality/evidence-layout.ts"),renderer=load("lib/quality/evidence-watermark.ts",{sharp,"node:path":path});
let inserted=[],published=[],nextId=0;
const revision={id:"R",revision_number:"RECT-01",status:"In Progress"};
const finding={id:"I",fli_number:"FLI-001",item_number:1,other_issue_text:"Damaged galvanising",assigned_flag:"Crew 1",leg:"A",tower_segment:"Peak",member_number:"M1",drawing_number:"D1"};
const service={rpc:async()=>({data:1,error:null}),from(table){let payload,operation="select";const q={select(){return q},eq(){return q},contains(){return q},limit(){return q},update(){return q},upsert(){return q},insert(value){payload=value;operation="insert";return q},maybeSingle:async()=>({data:table==="tower_revisions"?revision:table==="tower_revision_items"?finding:table==="tower_quality_upload_sessions"?{id:"SESSION"}:null,error:null}),single:async()=>{
  if(table==="tower_quality_files" && operation==="insert"){inserted.push(payload);return{data:{...payload,id:`F${++nextId}`},error:null};}
  return{data:table==="tower_revisions"?revision:table==="tower_revision_items"?finding:{id:"SESSION"},error:null};
},then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject);}};return q;}};
process.env.SUPABASE_SERVICE_ROLE_KEY="quality-local-test-key";
const tickets=load("lib/quality/upload-ticket.ts",{"node:crypto":require("node:crypto")});
const routeMocks={
  "@/lib/quality/display-name":load("lib/quality/display-name.ts"),
  "@/lib/quality/evidence-context":load("lib/quality/evidence-context.ts",{"./server":{},"./fli":load("lib/quality/fli.ts")}),
  "@/lib/access/server":{userHasAccess:async()=>true},"node:crypto":require("node:crypto"),
  "@/lib/quality/fli":load("lib/quality/fli.ts"),"@/lib/quality/evidence-watermark":renderer,"@/lib/quality/file-names":load("lib/quality/file-names.ts"),"@/lib/quality/date-time":load("lib/quality/date-time.ts"),
  "next/server":{NextResponse:{json:Response.json}},
  "@/lib/quality/server":{requireQualityUser:async()=>({service,user:{id:"AUTHENTICATED-UPLOADER"},role:"test"}),assertQualityProjectAccess:async()=>{},loadQualityProject:async()=>({project_number:"PROJECT",timezone:"Australia/Sydney",sharepoint_drive_id:"DRIVE",sharepoint_folder_id:"ROOT"}),loadQualityTower:async()=>({name:"136"}),qualityTowerLabel:()=>"136",qualityUserLabel:()=>"Luka Zetovic",qualityApiError:error=>({message:error.message,status:500})},
  "@/lib/sharepoint/quality":{safeQualitySharePointPart:value=>value,ensureRevisionPhotoFolder:async()=>({id:"FOLDER"}),uploadQualityFile:async value=>{published.push(value);return{id:`SP${published.length}`,webUrl:"https://sharepoint.invalid/evidence"};}},
  "@/lib/sharepoint/graph":{ensureDriveFolder:async()=>({id:"ORIGINALS"}),deleteDriveItem:async()=>{},downloadDriveItemContent:async()=>({content:original}),graphRequest:async url=>url.endsWith("createUploadSession")?{uploadUrl:"https://upload.invalid/one-photo",expirationDateTime:new Date(Date.now()+3600000).toISOString()}:{id:"STAGING",size:original.length,parentReference:{id:"FOLDER"}}},"@/lib/quality/upload-ticket":tickets,"@/lib/quality/upload-cleanup":{cleanupQualityUploadSessions:async()=>{}},
};
const route=load("app/api/quality/files/upload/route.ts",routeMocks);
for(const fileRole of ["before_photo","after_photo"]) {
  const form=new FormData();for(const [key,value] of Object.entries({projectId:"P",towerId:"T",revisionId:"R",revisionItemId:"I",fileRole,capturedBy:"Michael Brown",capturedDate:"2026-10-29",clientMutationId:`web-${fileRole}`}))form.set(key,value);
  form.set("file",new File([original],"raw.jpg",{type:"image/jpeg"}));
  const response=await route.POST(new Request("https://test.invalid/upload",{method:"POST",body:form}));const result=await response.json();assert.equal(response.status,200,result.error);
}
const sessionsRoute=load("app/api/quality/files/upload-session/route.ts",routeMocks);
for(const fileRole of ["before_photo","after_photo"]) {
  const response=await sessionsRoute.POST(new Request("https://test.invalid/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId:"P",towerId:"T",revisionId:"R",revisionItemId:"I",fileRole,clientMutationId:`session-${fileRole}`,name:"photo.jpg",mimeType:"image/jpeg",size:original.length,capturedBy:"Michael Brown",capturedDate:"2026-10-29"})}));
  const session=await response.json();assert.equal(response.status,200,session.error);
  const signed=tickets.verifyQualityUpload(session.ticket,"AUTHENTICATED-UPLOADER");assert.equal(signed.capturedBy,"Michael Brown");assert.equal(signed.capturedDate,"2026-10-29");assert.equal(signed.capturedAt,"");
  const result=await route.POST(new Request("https://test.invalid/complete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ticket:session.ticket})}));assert.equal(result.status,200,JSON.stringify(await result.json()));
}
assert.equal(inserted.length,4);assert.equal(published.length,8);
for(const file of inserted){assert.equal(file.uploaded_by,"AUTHENTICATED-UPLOADER");assert.equal(file.uploaded_by_label,"Luka Zetovic");assert.equal(file.captured_at,null);assert.equal(file.evidence_metadata.capturedBy,"Michael Brown");assert.equal(file.evidence_metadata.capturedDate,"2026-10-29");assert.ok(file.annotated_sharepoint_item_id);assert.match(file.file_name,/^PROJECT_136_RECT-01_FLI-001_(BEFORE|AFTER)-01.jpg$/);}
for(const photo of published.filter(value=>value.folderId==="FOLDER")){assert.notDeepEqual(photo.content,original);assert.equal((await sharp(photo.content).metadata()).format,"jpeg");}
const lines=layout.watermarkLines(inserted[0].evidence_metadata).join("\n");for(const value of ["PROJECT","136","RECT-01","FLI-001","BEFORE","Crew 1","Leg: A","Peak","M1","D1","Damaged galvanising","Michael Brown","29/10/2026 (time unknown)"])assert.ok(lines.includes(value),value);
assert.ok(!lines.includes("1 of"));
console.log("PASS real website upload handler publishes baked canonical Before/After JPEGs, preserves originals, canonical filenames, photographer and authenticated uploader separately; no fabricated capture timestamp.");
