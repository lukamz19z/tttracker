import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function load(file, mocks = {}) {
  const exports = {};
  new Function("require", "exports", ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText)(name => {
    assert.ok(name in mocks, `Unexpected dependency ${name}`);
    return mocks[name];
  }, exports);
  return exports;
}
const details = load("lib/quality/operational-details.ts");
const list = load("lib/quality/field-list.ts", { "./finding-readiness": load("lib/quality/finding-readiness.ts") });
const punchlist = load("lib/quality/punchlist.ts", {});
const bolt = details.DETAIL_TEMPLATES[0].schema, packer = details.DETAIL_TEMPLATES[1].schema;
const types = [{ id: "bolt", name: "Wrong Bolt", detail_schema: bolt }, { id: "packer", name: "Packers", detail_schema: packer }];
const importedRows=punchlist.mapPunchlistRows([{Tower:"136", "External Defect Number":"B-1",Defect:"Wrong Bolt","Existing Diameter":"20","Existing Length":"80","Required Diameter":"20","Required Length":"100",Qty:"4",Change:"Increase"}],punchlist.suggestPunchlistMapping(["Tower","External Defect Number","Defect","Existing Diameter","Existing Length","Required Diameter","Required Length","Qty","Change"],types),types);
assert.equal(importedRows[0].operationalDetails.quantity,4);assert.equal(importedRows[0].operationalDetails.required_length,100);assert.equal(importedRows[0].issueTypeId,"bolt");
assert.match(details.operationalDetailSummary(bolt,importedRows[0].operationalDetails),/M20 × 80 mm → M20 × 100 mm · Qty 4/);
const importedPacker=punchlist.mapPunchlistRows([{Tower:"136", "External Defect Number":"P-1",Defect:"Packers","Existing Thickness":"3","Existing Quantity":"1","Required Thickness":"6","Required Quantity":"2",Action:"Replace"}],punchlist.suggestPunchlistMapping(["Tower","External Defect Number","Defect","Existing Thickness","Existing Quantity","Required Thickness","Required Quantity","Action"],types),types);
assert.equal(importedPacker[0].operationalDetails.required_thickness,6);assert.equal(importedPacker[0].operationalDetails.action,"Replace");
const automaticHeaders=["Tower No","Finding No","Finding Type","Description","Member No","Section","Leg","Drawing No","Inspected By","Date"];
const automaticMapping=punchlist.suggestPunchlistMapping(automaticHeaders);
assert.deepEqual([automaticMapping.tower,automaticMapping.externalReference,automaticMapping.defectType,automaticMapping.description,automaticMapping.member,automaticMapping.segment,automaticMapping.leg,automaticMapping.drawing,automaticMapping.inspector,automaticMapping.sourceDate],automaticHeaders);
assert.equal(punchlist.punchlistSourceKey("project-1","Tower 92 Punchlist"),punchlist.punchlistSourceKey("project-1","Tower 92 Punchlist"),"same source name yields stable hidden import key");assert.notEqual(punchlist.punchlistSourceKey("project-1","Tower 92 Punchlist"),punchlist.punchlistSourceKey("project-2","Tower 92 Punchlist"));
const photoReview=punchlist.matchPunchlistPhotos(importedRows,[{name:"B-1_01.jpg"},{name:"unknown.jpg"},{name:"multi.jpg"}],{2:"skip"});assert.equal(photoReview.matches.filter(match=>match.state==="matched").length,1);assert.equal(photoReview.matches.filter(match=>match.state==="unmatched"||match.state==="ambiguous").length,1);assert.equal(photoReview.matches.filter(match=>match.state==="skipped").length,1);
for (const schema of [bolt, packer]) {
  assert.equal(details.validateDetailSchema(schema), null);
  assert.equal(details.validateDetailValues(schema, {}), null, "All template fields optional");
}
const boltValues = quantity => ({ existing_diameter: 16, existing_length: 65, required_diameter: 20, required_length: 80, change: "Increase", quantity, connection: "A-1" });
const packerValues = quantity => ({ existing_thickness: 2, existing_quantity: 1, required_thickness: 5, required_quantity: quantity, action: "Add" });
assert.equal(details.validateDetailValues(bolt, boltValues(4)), null);
assert.equal(details.validateDetailValues(packer, packerValues(3)), null);
assert.match(details.operationalDetailSummary(bolt, boltValues(4)), /M16 × 65 mm → M20 × 80 mm · Qty 4/);
assert.match(details.operationalDetailSummary(packer, packerValues(2)), /2 mm × 1 → 5 mm × 2 · Add/);
const fieldBoltValues={existing_diameter:20,existing_length:80,required_diameter:20,required_length:100,quantity:4,change:"Increase"};
assert.match(details.operationalDetailSummary(bolt,fieldBoltValues),/M20 × 80 mm → M20 × 100 mm · Qty 4/);
const materialPrep=details.materialRequirements([{issue_type_id:"bolt",operational_details:fieldBoltValues},{issue_type_id:"bolt",operational_details:{...fieldBoltValues,quantity:2}}],types);
assert.deepEqual(materialPrep.rows,[{label:"M20 × 100 bolts",quantity:6,action:"",findings:2}]);
assert.match(details.validateDetailValues(bolt, { quantity: "four" }), /quantity/i);
assert.match(details.validateDetailValues(packer, { action: "Guess" }), /configured/);
assert.match(details.validateDetailValues({ fields: [{ key: "quantity", label: "Quantity", type: "quantity", required: true }] }, {}), /required/);
assert.equal(details.validateDetailValues({fields:[{key:"checked",label:"Checked",type:"toggle",required:true},{key:"tags",label:"Tags",type:"multi-select",options:["A","B"]},{key:"units",label:"Units",type:"unit"}]},{checked:false,tags:["A","B"],units:"mm"}),null);
const finding = (id, patch = {}) => ({ id: String(id), fli_number: `FLI-${String(id).padStart(3,"0")}`, item_number: id, status: "Open", issue_type_id: "bolt", tower_segment: "Earthwire Peak", source_type: "punchlist", assigned_flag: "Team 1", operational_details: boltValues(4), ...patch });
const items = [finding(1), finding(2, {operational_details:boltValues(2)}), finding(3,{operational_details:{...boltValues(6),required_diameter:24,required_length:90}}), finding(4,{tower_segment:"Body",operational_details:boltValues(99)}),finding(5,{status:"Rectified",operational_details:boltValues(88)}),finding(6,{issue_type_id:"packer",operational_details:packerValues(2)}),finding(7,{issue_type_id:"packer",operational_details:packerValues(3)}),finding(8,{source_type:"manual",assigned_flag:null,operational_details:{}})];
const rows = list.fieldListRows(items, types, []);
assert.equal(list.fieldListRows([finding(99,{issue_type_id:null,other_issue_text:"Wrong Bolt"})],types,[])[0].defectType,"bolt");
assert.equal(list.groupFieldRows(list.fieldListRows([finding(99,{issue_type_id:null,other_issue_text:"WRONG BOLT"}),finding(100)],types,[]),"Defect Type").length,1);
assert.equal(list.fieldListRows([finding(99,{issue_type_id:null,other_issue_text:"Wrong Bolt"})],[...types,{id:"duplicate",name:"Wrong Bolt"}],[])[0].defectType,"text:Wrong Bolt");
const state = {...list.DEFAULT_FIELD_STATE, status:"Open",section:"Earthwire Peak",defectType:"bolt",source:"Punchlist",assignment:"Team 1",group:"Defect Type"};
const filtered = list.filterFieldRows(rows,state);
assert.deepEqual(filtered.map(row=>row.item.id),["1","2","3"]);
assert.deepEqual(details.materialRequirements(filtered.map(row=>row.item),types).rows.map(row=>`${row.quantity} × ${row.label}`),["6 × M20 × 80 bolts","6 × M24 × 90 bolts"]);
assert.deepEqual(list.groupFieldRows(rows,"Section").map(group=>[group.label,group.rows.length]),[["Body",1],["Earthwire Peak",7]]);
assert.deepEqual(list.groupFieldRows(rows,"Defect Type").map(group=>[group.label,group.rows.length]),[["Packers",2],["Wrong Bolt",6]]);
assert.deepEqual(list.groupFieldRows(rows,"FLI")[0].rows.map(row=>row.item.item_number),[1,2,3,4,5,6,7,8]);
assert.deepEqual(list.restoreFieldState(JSON.parse(JSON.stringify(state))),state);
assert.notEqual(list.fieldStateKey("user","project","A"),list.fieldStateKey("user","project","B"));
assert.notEqual(list.fieldStateKey("user","project","A"),list.fieldStateKey("other","project","A"));
assert.deepEqual(list.restoreFieldState({status:"bad",group:"bad"}),list.DEFAULT_FIELD_STATE);
const packerRows=list.filterFieldRows(rows,{...list.DEFAULT_FIELD_STATE,defectType:"packer",section:"Earthwire Peak",status:"Open"});
assert.deepEqual(details.materialRequirements(packerRows.map(row=>row.item),types).rows,[{label:"5 mm packers",quantity:5,action:"Add",findings:2}]);
const removals=details.materialRequirements([...packerRows.map(row=>row.item),finding(9,{issue_type_id:"packer",operational_details:{...packerValues(7),action:"Remove"}})],types);
assert.equal(removals.rows.length,2);assert.equal(removals.rows.find(row=>row.action==="Remove").quantity,7);
assert.equal(details.materialRequirements([finding(10,{finding:"999 M20 bolts",operational_details:{}})],types).incomplete,1);
const readiness=list.fieldListRows([finding(11,{operational_details:{}}),finding(12),finding(13,{status:"Verified"})],types,[{revision_item_id:"11",file_role:"after_photo"},{revision_item_id:"12",file_role:"before_photo"},{revision_item_id:"12",file_role:"after_photo"}]);
assert.deepEqual(readiness.map(row=>row.workflow),["In Progress","Ready","Rectified"]);
const scale=Array.from({length:200},(_,index)=>finding(index+1,{tower_segment:index%2?"Body":"Earthwire Peak",issue_type_id:index%3?"bolt":"packer",operational_details:index%3?boltValues(2):packerValues(1)}));
const start=performance.now();
for(let run=0;run<200;run++){
  const indexed=list.fieldListRows(scale,types,[]);
  const selected=list.filterFieldRows(indexed,{...state,assignment:""});
  assert.equal(selected.length,66);
  assert.equal(list.groupFieldRows(selected,"Section")[0].rows.length,66);
  assert.equal(list.groupFieldRows(selected,"Defect Type")[0].label,"Wrong Bolt");
  assert.equal(details.materialRequirements(selected.map(row=>row.item),types).rows[0].quantity,132);
}
const elapsed=performance.now()-start;
assert.ok(elapsed<5000,`200-FLI workload regressed: ${elapsed.toFixed(1)}ms`);
console.log(`PASS stacked filters, section/type/status/FLI groups, persistence codec/isolation, optional/required structured fields, filtered bolt/packer summaries. 200 FLIs × 200 filter/group/summary passes: ${elapsed.toFixed(1)}ms (${(elapsed/200).toFixed(2)}ms/pass).`);

// Exercise the actual preference hook across unmount/remount, rather than just its codec.
const stored=new Map();
function mountPreferences(key) {
  const slots=[];let cursor=0,effects=[],cleanups=[];
  const react={
    useState(initial){const index=cursor++;if(!(index in slots))slots[index]=initial;return[slots[index],value=>{slots[index]=value}];},
    useRef(initial){const index=cursor++;return slots[index] ||= {current:initial};},
    useCallback:fn=>fn,
    useEffect(fn){const index=cursor++;if(!(index in slots)){slots[index]=true;effects.push(fn);}},
  };
  const hook=load("mobile/lib/quality-field-state.ts",{react,"./offline/db":{getCache:async key=>stored.has(key)?{value:structuredClone(stored.get(key))}:null,setCache:async(key,value)=>stored.set(key,structuredClone(value))},"../../lib/quality/field-list":list}).useQualityFieldState;
  return {render(){cursor=0;const value=hook(key);for(const effect of effects)cleanups.push(effect());effects=[];return value;},unmount(){for(const cleanup of cleanups)cleanup?.();}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const prefKey=list.fieldStateKey("user","project","RECT");
let prefs=mountPreferences(prefKey);assert.equal(prefs.render().ready,false);await tick();assert.equal(prefs.render().ready,true);
prefs.render().update({...state,group:"Section"});prefs.render().update(state);await tick();prefs.unmount();
prefs=mountPreferences(prefKey);prefs.render();await tick();assert.deepEqual(prefs.render().state,state);prefs.unmount();
assert.equal(stored.size,1,"Mounting never overwrites saved filters with defaults");
console.log("PASS actual filter persistence hook: ordered writes, navigating away/remounting, preserved stacked filters and grouping, no default overwrite.");

const importerSource=fs.readFileSync("components/quality/PunchlistImport.tsx","utf8");
for(const label of ["Upload Punchlist","Add Punchlist Photos","Review import","Advanced","matched automatically","Tower issues","Date issues","Punchlist imported","Create a separate Punchlist instead"])assert.ok(importerSource.includes(label),`guided importer includes ${label}`);
assert.match(importerSource,/const effectiveSourceKey=sourceKeyOverride\|\|automaticSourceKey/);
assert.match(importerSource,/const unresolved=review\.matches\.filter\(match=>match\.state==="unmatched" \|\| match\.state==="ambiguous"\)/);
assert.match(importerSource,/filter\(row=>!row\.towerId\)/);
assert.ok(importerSource.includes("Photo details (optional)"));
console.log("PASS guided importer: automatic source key, mapped required aliases, Advanced mapping/source metadata, photo counts, exception-only reconciliation, optional photo metadata and re-import detection.");

const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
const native=Object.fromEntries(["View","Text","Pressable"].map(name=>[name,name]));
const card=load("mobile/components/quality/FieldFindingCard.tsx",{"react/jsx-runtime":jsx,"react-native":native,"lucide-react-native":{MoreVertical:()=>null},"./QualityStatusPill":{QualityStatusPill:()=>null},"./QualityShell":{qualityStyles:{primary:{},primaryText:{},secondary:{},card:{},row:{},grow:{},muted:{},cardTitle:{}}},"../../../lib/quality/operational-details":details}).FieldFindingCard;
let opened=0,menus=0,stopped=0;
function nodes(node,type,result=[]){if(!node)return result;if(Array.isArray(node)){node.forEach(child=>nodes(child,type,result));return result;}if(node.type===type)result.push(node);if(node.props)nodes(node.props.children,type,result);return result;}
const renderStart=performance.now();
for(const row of list.fieldListRows(scale,types,[])) {
  const rendered=card({row,locked:false,onOpen:()=>opened++,onActions:()=>menus++});
  const buttons=nodes(rendered,"Pressable");assert.equal(buttons.length,3);
  assert.equal(buttons[1].props.style[1].minHeight,48);assert.equal(buttons[2].props.style[1].minWidth,48);
  buttons[1].props.onPress({stopPropagation:()=>stopped++});buttons[2].props.onPress({stopPropagation:()=>stopped++});
}
assert.equal(opened,200);assert.equal(menus,200);assert.equal(stopped,400);
assert.match(fs.readFileSync("mobile/components/quality/QualityShell.tsx","utf8"),/<FlatList data=\{virtualRows\}/);
const sampleCard=card({row:rows[0],locked:false,onOpen:()=>{},onActions:()=>{},issueTypes:types});
const cardSummary=nodes(sampleCard,"Text").map(node=>node.props.children).flat(Infinity).filter(value=>typeof value==="string").join(" ");
assert.match(cardSummary,/M16 × 65 mm → M20 × 80 mm · Qty 4/);
console.log(`PASS actual 200-card JSX construction and 48-point actions, isolated menu taps, FlatList integration (${(performance.now()-renderStart).toFixed(1)}ms). Physical-device rendering remains a deployment check.`);

const revisionScreen=fs.readFileSync("mobile/app/revisions/[revisionId].tsx","utf8");
assert.ok(revisionScreen.includes("Add Flagged Issue"));
assert.ok(revisionScreen.includes("✓ Synced")&&revisionScreen.includes("Retry ${failedCount}")&&revisionScreen.includes("Sync ${pendingCount}"));
assert.ok(revisionScreen.includes("Submit Review")&&revisionScreen.includes(">More</Text>"));
assert.ok(revisionScreen.includes("operationalDetailSummary(data?.issueTypes.find(type=>type.id===finding.issueTypeId)?.detail_schema,finding.operationalDetails)"),"pending Manual FLIs display their configured summary");
const detailFieldsSource=fs.readFileSync("mobile/components/quality/OperationalDetailFields.tsx","utf8");
assert.ok(detailFieldsSource.includes('side("Current",true)')&&detailFieldsSource.includes('side("Required",false)'));
assert.ok(detailFieldsSource.includes('accessibilityLabel={field.label}')&&detailFieldsSource.includes('field.options'));
assert.ok(revisionScreen.includes("<OperationalDetailFields schema={data?.issueTypes.find(issue=>issue.id===findingForm.issueTypeId)?.detail_schema}"),"Manual FLI uses the configured editor");
const detailEditor=load("mobile/components/quality/OperationalDetailFields.tsx",{"react/jsx-runtime":jsx,"react-native":Object.fromEntries(["View","Text","Pressable","ScrollView","TextInput"].map(name=>[name,name])),"./QualityShell":{qualityStyles:{cardTitle:{},primary:{},secondary:{}}}}).OperationalDetailFields;
const editorTree=detailEditor({schema:bolt,values:boltValues(4),onChange:()=>{}});
const editorText=nodes(editorTree,"Text").map(node=>node.props.children).flat(Infinity).filter(value=>typeof value==="string").join(" ");
assert.match(editorText,/Current/);assert.match(editorText,/Required/);assert.match(editorText,/Change/);
const editorInputs=nodes(editorTree,"TextInput").map(node=>node.props.accessibilityLabel);
assert.ok(editorInputs.includes("Existing Diameter")&&editorInputs.includes("Required Diameter"),"Configured current/required controls are rendered with stable field labels");
console.log("PASS mobile workflow exposes configured Current/Required/action fields for manual and imported findings; compact primary/sync/review actions and pending Manual FLI summaries are present.");

// Existing update queue must upload extra Manual Before evidence before completion.
globalThis.__DEV__=false;
const queueCache=new Map(),events=[],commands=[];
const dbMock={queueRows:async()=>[],getCache:async key=>queueCache.has(key)?{value:queueCache.get(key)}:null,setCache:async(key,value)=>queueCache.set(key,value),enqueue:async()=>{}};
const sync=load("mobile/lib/offline/quality-sync.ts",{
  "./quality-photo-deletion":{syncQualityPhotoDelete:async()=>{}},"./quality-photo-tombstones":{photoDeleted:async()=>false,withoutDeletedPhotos:async value=>value},
  "@/lib/quality-evidence":{annotateQualityPhoto:async photo=>photo,photoContext:context=>context,persistEvidencePhoto:async()=>{}},
  "./sync-errors":load("mobile/lib/offline/sync-errors.ts"),"./quality-operation-lock":{withQualityOperation:operation=>operation()},"./revision-deletions":{revisionDeletion:async()=>null},
  "./revision-workspaces":{listRevisionWorkspaces:async()=>[],saveRevisionWorkspace:async()=>{}},"./db":dbMock,"@/lib/offline/db":dbMock,
  "@/lib/offline/files":{offlineFileExists:()=>true},"@/lib/api/quality":{uploadQualityPhoto:async input=>{events.push(input.fileRole);return {file:{id:input.fileRole}}}},
  "@/lib/api/client":{apiJson:async(_url,init={})=>{if(!init.method)return{evidenceContext:{fli:"FLI-001"}};const body=JSON.parse(init.body);commands.push(body);events.push(body.status?"status":"details");return{item:{record_version:2}};}},
});
const photo=id=>({id,uri:`file://${id}.jpg`,mimeType:"image/jpeg",name:`${id}.jpg`});
await sync.syncQualityQueueRecord({id:"edit",kind:"quality_revision_item_update",payload:{projectId:"P",revisionId:"R",towerId:"T",itemId:"I",clientMutationId:"edit",expectedVersion:1,operationalDetails:boltValues(4),issueTypeId:"bolt",rectificationComment:"",status:"Rectified",beforePhotos:[photo("extra-before")],afterPhotos:[photo("after")]}});
assert.deepEqual(events,["details","before_photo","after_photo","status"]);
assert.deepEqual(commands[0].operationalDetails,boltValues(4));assert.equal(commands[0].rectificationComment,"");assert.equal(commands[1].expectedVersion,2);
console.log("PASS actual update queue: structured details retained, extra Before then After upload before Rectified, blank comment accepted, completion uses returned record version.");

export async function verifyFieldWorkflowSql(db,{project,actor,rect}) {
  const issue="00000000-0000-0000-0000-000000000090",packerId="00000000-0000-0000-0000-000000000091";
  for(const [id,schema] of [[issue,bolt],[packerId,packer]]) await db.query("insert into project_field_issue_types(id,project_id,active,applies_to,detail_schema)values($1,$2,true,'revision',$3)",[id,project,schema]);
  const create=(mutation,issueId,values)=>db.query("select create_v1_revision_item_atomic($1,$2,$3,$4,$5) result",[rect,project,actor,mutation,{issueTypeId:issueId,finding:"Structured manual FLI",operationalDetails:values}]).then(result=>result.rows[0].result.item);
  const item=await create("structured-bolt",issue,boltValues(4));
  assert.deepEqual(item.operational_details,boltValues(4));
  assert.equal((await create("structured-packer",packerId,packerValues(3))).operational_details.required_quantity,3);
  await assert.rejects(create("invalid-quantity",issue,{quantity:"four"}),/numeric/);
  await assert.rejects(create("invalid-choice",packerId,{action:"Guess"}),/configured option/);
  assert.deepEqual((await create("optional-fields",issue,{})).operational_details,{});
  const edit=(version,mutation,patch)=>db.query("select update_v1_quality_item($1,$2,$3,$4,$5,$6) result",[item.id,actor,version,mutation,patch,"Field User"]).then(result=>result.rows[0].result);
  const changed=await edit(1,"structured-change",{operational_details:boltValues(6)});
  assert.equal(changed.record_version,2);assert.equal(changed.operational_details.quantity,6);
  assert.deepEqual(await edit(1,"structured-change",{operational_details:boltValues(6)}),changed);
  await assert.rejects(edit(1,"stale-structured-change",{operational_details:boltValues(8)}),/changed on another device/);
  await db.query("update project_field_issue_types set detail_schema=$1 where id=$2",[{fields:[{key:"quantity",label:"Quantity",type:"quantity",required:true}]},issue]);
  await assert.rejects(create("missing-required",issue,{}),/Quantity is required/);
  await assert.rejects(db.query("update project_field_issue_types set detail_schema=$1 where id=$2",[{fields:[{key:"bad key",label:"Bad",type:"text"}]},issue]),/stable identifiers/);
  const before=(await db.query("select source_payload from tower_revision_items where source_type='punchlist' limit 1")).rows[0].source_payload;
  assert.ok(before.description,"Source provenance retained");
  console.log("PASS SQL structured creation/update, optional and required fields, numeric/options validation, version increment, idempotent retries, stale edit rejection and retained source provenance.");
}
