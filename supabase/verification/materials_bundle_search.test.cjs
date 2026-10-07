const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('../../v2/node_modules/typescript');
const root=path.resolve(__dirname,'../..');
function compile(file, dependencies={}) {
 const filename=path.join(root,file);
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const exp={};new Function('require','exports',code)((name)=>dependencies[name]??require(name),exp);return exp;
}
const {readMaterialsPages}=compile('v2/lib/materials/read-pages.ts');
const policy=compile('v2/lib/materials/access-policy.ts');
const project='project-A',tower='tower-A',bundle='pack-A',duplicate='pack-A-duplicate';
const members=Array.from({length:1105},(_,i)=>({id:`member-${String(i).padStart(4,'0')}`,project_id:project,tower_id:tower,bundle_id:bundle,bundle_reference:'1/6',material_kind:'member',item_reference:`M${String(i).padStart(4,'0')}`,is_active:true,profile:'L100*8'}));
const tables={v2_material_register:[...members,{...members[0],id:'other-pack-member',bundle_id:duplicate},{...members[0],id:'foreign-member',project_id:'project-B',tower_id:'tower-B'}],v2_material_bundles:[{id:bundle,project_id:project,tower_id:tower,bundle_reference:'1/6',is_active:true},{id:duplicate,project_id:project,tower_id:tower,bundle_reference:'1/6',is_active:true},{id:'foreign-pack',project_id:'project-B',tower_id:'tower-B',is_active:true}],v2_material_member_checks:[],v2_material_issues:[{id:'issue-1',project_id:project,material_item_id:members[0].id,issue_type_key:'missing',status:'open'}]};
let context;
const admin={from(table){let rows=tables[table]??[],start=0,end=999,count=false,head=false;return {
 select(_fields,opts={}){count=opts.count==='exact';head=opts.head;return this;},
 eq(key,value){rows=rows.filter(row=>row[key]===value);return this;},
 in(key,values){rows=rows.filter(row=>values.includes(row[key]));return this;},
 order(){return this;},range(from,to){start=from;end=to;return this;},
 or(filter){const match=filter.match(/ilike\.%(.*?)%/);if(match)rows=rows.filter(row=>Object.values(row).some(value=>String(value).toLowerCase().includes(match[1].toLowerCase())));return this;},
 then(resolve,reject){return Promise.resolve({data:head?null:rows.slice(start,end+1),count:count?rows.length:null,error:null}).then(resolve,reject);}
};}};
const security={requireMaterialsContext:async()=>{policy.requireMaterialsPermission(context.access,'view');return context;},
 validateMaterialsRequest:async(c,{bundleId,towerId})=>{if(towerId&&towerId!==tower)throw new policy.MaterialsSecurityError('MATERIALS_RELATIONSHIP_INVALID',422);if(bundleId){const pack=tables.v2_material_bundles.find(row=>row.id===bundleId&&row.project_id===c.project.id);if(!pack||towerId&&pack.tower_id!==towerId)throw new policy.MaterialsSecurityError('MATERIALS_RELATIONSHIP_INVALID',422);policy.requireMaterialRecordAccess(c.access,'v2_material_bundles',bundleId);}},
 materialsErrorResponse:error=>({status:error.status??400,body:{error:error.message}})};
const route=compile('v2/app/api/projects/[projectId]/materials/search/route.ts',{'next/server':{NextResponse:{json:body=>({status:200,body})}},'@/lib/materials/read-pages':{readMaterialsPages},'@/lib/materials/access-policy':policy,'@/lib/supabase/admin':{createSupabaseAdmin:()=>admin},'@/lib/materials/security':security});
function host(){context={project:{id:project},access:{kind:'host',permissions:{'materials.view':true},shares:[]}};}
async function get(params){return route.GET({nextUrl:new URL(`https://example.test/?${new URLSearchParams(params)}`)},{params:Promise.resolve({projectId:project})});}

test('Open Pack pages every current UUID assignment beyond 1000; repeated reference packs and foreign project stay independent',async()=>{
 host();const seen=[];let offset=0;
 do{const result=await get({bundleId:bundle,towerId:tower,offset:String(offset)});assert.equal(result.status,200);seen.push(...result.body.items);offset=result.body.nextOffset;}while(offset!=null);
 assert.equal(seen.length,1105);assert.equal(new Set(seen.map(row=>row.id)).size,1105);assert.ok(seen.every(row=>row.bundle_id===bundle));
 const other=await get({bundleId:duplicate,towerId:tower});assert.deepEqual(other.body.items.map(row=>row.id),['other-pack-member']);
 const counts=await get({mode:'bundles',towerId:tower});assert.equal(counts.body.bundles.find(row=>row.id===bundle).member_count,seen.length);
 assert.equal((await get({bundleId:'foreign-pack'})).status,422);
});
test('member search is tower contextual, searchable by profile and paginated without a legacy limit',async()=>{
 host();const first=await get({towerId:tower,q:'L100*8'});assert.equal(first.body.items.length,20);assert.equal(first.body.nextOffset,20);
 const second=await get({towerId:tower,q:'L100*8',offset:'20'});assert.equal(second.body.items.length,20);assert.notEqual(first.body.items[0].id,second.body.items[0].id);
 assert.equal(first.body.items[0].exception_status,'Missing');assert.equal(first.body.items[1].exception_status,null);
});
test('party visibility is applied before pagination and count; permission and pack sharing remain required',async()=>{
 context={project:{id:project},access:{kind:'party',permissions:{'materials.view':true},shares:[{type:'v2_material_bundles',id:bundle},{type:'v2_material_register',id:members[1104].id}]}};
 const result=await get({bundleId:bundle,towerId:tower});assert.equal(result.status,200);assert.deepEqual(result.body.items.map(row=>row.id),[members[1104].id]);assert.equal(result.body.items[0].exception_status,null);
 assert.equal((await get({mode:'bundles'})).body.bundles[0].member_count,1);
 assert.equal((await get({bundleId:duplicate})).status,403);
 context.access.permissions['materials.view']=false;assert.equal((await get({bundleId:bundle})).status,403);
});
test('bounded relation reader continues past max_rows and propagates errors instead of caching empty success',async()=>{
 const source=Array.from({length:1501},(_,id)=>({id}));const calls=[];
 const result=await readMaterialsPages(async(from,to)=>{calls.push([from,to]);return {data:source.slice(from,to+1),error:null};});assert.equal(result.data.length,1501);assert.equal(calls.length,4);
 await assert.rejects(readMaterialsPages(async()=>({data:null,error:{message:'read failed'}})),/read failed/);
});
const React=require('../../v2/node_modules/react');
const {renderToStaticMarkup}=require('../../v2/node_modules/react-dom/server');
function loadUi(file){
 const filename=path.join(root,file);const exp={};
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports',code)(name=>{
  if(name==='react')return React;
  if(name==='react/jsx-runtime')return require('../../v2/node_modules/react/jsx-runtime');
  if(name==='lucide-react')return require('../../v2/node_modules/lucide-react');
  if(name.endsWith('.module.css'))return {default:new Proxy({},{get:(_,key)=>String(key)})};
  if(name==='@/lib/materials/ui-workflows')return compile('v2/lib/materials/ui-workflows.ts');
  if(name.startsWith('.'))return loadUi(path.relative(root,path.resolve(path.dirname(filename),name+'.tsx')));
  throw new Error(`UI dependency ${name}`);
 },exp);return exp;
}
function loadPresentation(openDelivery=false,expandedId=null){
 let firstBoolean=true;let nullStates=0;
 const file=path.join(root,'v2/app/workspace/projects/[projectId]/materials/materials-control-client.tsx');
 const code=ts.transpileModule(fs.readFileSync(file,'utf8')+'\nexport { MaterialItemRow, PackContents, RegisterSearchWorkspace, BundlesWorkspace, DeliveriesWorkspace, IssueCreateForm, TraceabilityEventForm };',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exp={};new Function('require','exports',code)((name)=>{
  if(name==='react')return expandedId ? {...React,useState:(initial)=>{if(initial===null){nullStates++;if(nullStates===2)return React.useState(expandedId);}return React.useState(initial==='scheduled'?'dockets':initial);}} : openDelivery ? {...React,useState:(initial)=>{const value=firstBoolean && initial===false ? true : initial;if(initial===false)firstBoolean=false;return React.useState(value);}} : React;
  if(name==='react/jsx-runtime')return require('../../v2/node_modules/react/jsx-runtime');
  if(name==='lucide-react')return require('../../v2/node_modules/lucide-react');
  if(name==='@/components/materials/materials-notice')return loadUi('v2/components/materials/materials-notice.ts');
  if(name==='@/components/materials/workflow-controls')return loadUi('v2/components/materials/workflow-controls.tsx');
  if(name==='@/components/materials/material-picker')return loadUi('v2/components/materials/material-picker.tsx');
  if(name==='@/components/materials/materials-ui.module.css')return {default:new Proxy({},{get:(_,key)=>String(key)})};
  if(name==='@/lib/materials/ui-workflows')return compile('v2/lib/materials/ui-workflows.ts');
  if(name==='@/lib/materials/delivery-planning')return compile('v2/lib/materials/delivery-planning.ts');
  if(name==='@/components/ui/tt-ui')return {tt:new Proxy({},{get:(_,key)=>String(key)}),Card:({children})=>React.createElement('section',null,children)};
  throw new Error(`Unexpected presentation dependency ${name}`);
 },exp);return exp;
}
const presentation=loadPresentation();
test('default member presentation is compact information without exception forms; real issue alone shows its status',()=>{
 const item={...members[0],profile:'L100*8',required_quantity:2,segment:'Top Crossarms',drawing_reference:'DRAW-24',resolved_bundle_context:'Packing section'};
 const clean=renderToStaticMarkup(React.createElement(presentation.MaterialItemRow,{item,towerMap:new Map([[tower,'T001']])}));
 for(const value of ['L100*8','Qty / Tower','Top Crossarms','DRAW-24','Packing section'])assert.ok(clean.includes(value));
 assert.doesNotMatch(clean,/<button|Missing|Issue open|not checked|Received/);
 const issue=renderToStaticMarkup(React.createElement(presentation.MaterialItemRow,{item:{...item,exception_status:'Missing'},towerMap:new Map()}));assert.match(issue,/Missing/);assert.doesNotMatch(issue,/<button/);
});
test('Open Pack presents ten compact member lines with count and pagination, never a thousand-row card list',()=>{
 const html=renderToStaticMarkup(React.createElement(presentation.PackContents,{members}));
 assert.match(html,/1105 member lines/);assert.match(html,/Qty \/ Tower/);assert.match(html,/Tower Segment/);assert.match(html,/Next/);
 assert.match(html,/M0009/);assert.doesNotMatch(html,/M0010|>Here<|>Missing<|>Issue</);
});
const planning=compile('v2/lib/materials/delivery-planning.ts');
const pack=(id,check=null)=>({id,tower_id:tower,bundle_reference:'1/6',required_quantity:1,segment:'TOP CROSSARM',check});
const docket=(id,status,items)=>({id,delivery_number:`DKT-${id}`,status,items});
const allocation=(id,status,qty=0)=>({id:`line-${id}`,bundle_id:id,tower_id:tower,status,delivered_quantity:qty});
test('site groups derive counts only from site checks; Arrived is collapsed and Clear returns the row to outstanding',()=>{
 const render=(bundles)=>renderToStaticMarkup(React.createElement(presentation.BundlesWorkspace,{bundles,towerMap:new Map(),bundleMembers:{},expandedBundle:null,busy:false,canCheck:true,onOpen:()=>{},onSaveBundle:()=>{}}));
 let html=render([pack('a'),pack('b',{status:'not_delivered',quantity_received:0}),pack('c',{status:'arrived',quantity_received:1})]);
 assert.match(html,/3 expected.*2 outstanding.*1 arrived/);assert.match(html,/<details(?![^>]*\bopen)[^>]*><summary[^>]*>.*Arrived bundles/);assert.match(html,/<details[^>]*\bopen[^>]*><summary[^>]*><strong>Outstanding bundles/);assert.match(html,/Outstanding bundles/);
 html=render([pack('a',{status:'arrived',quantity_received:1}),pack('b'),pack('c',{status:'arrived',quantity_received:1})]);assert.match(html,/3 expected.*1 outstanding.*2 arrived/);
 html=render([pack('a',{status:'not_checked',quantity_received:0}),pack('b'),pack('c',{status:'arrived',quantity_received:1})]);assert.match(html,/3 expected.*2 outstanding.*1 arrived/);
});
test('delivery candidates use tower UUID manifest and remain eligible despite site Arrived; duplicate labels stay independent',()=>{
 const source=[pack('a',{status:'arrived',quantity_received:1}),pack('b'),{...pack('foreign'),tower_id:'other-tower'}];
 const candidates=planning.deliveryCandidates(source,tower,[]);assert.deepEqual(candidates.filter(row=>row.eligible).map(row=>row.bundle.id),['a','b']);assert.equal(candidates.length,2);
 assert.deepEqual(planning.deliveryCandidates(source,'absent',[]),[]);
});
test('planned and delivered allocations cannot be selected again; cancelled and failed zero-quantity deliveries release planning',()=>{
 const records=[docket('1','planned',[allocation('a','planned')]),docket('2','delivered',[allocation('b','delivered',1)]),docket('3','cancelled',[allocation('c','planned')]),docket('4','delivered_with_issues',[allocation('d','rejected')])];
 assert.equal(planning.deliveryAvailability(pack('a'),records).state,'planned');assert.match(planning.deliveryAvailability(pack('a'),records).label,/DKT-1/);
 assert.equal(planning.deliveryAvailability(pack('b'),records).state,'delivered');
 const eligible=planning.deliveryCandidates(['a','b','c','d'].map(id=>pack(id)),tower,records).filter(row=>row.eligible).map(row=>row.bundle.id);assert.deepEqual(eligible,['c','d']);
 assert.equal(planning.deliveryAvailability({...pack('partial'),required_quantity:2},[docket('5','delivered_with_issues',[allocation('partial','short',1)])]).eligible,false);
});
test('delivery/site mutations remain separate and tower changes clear selections in both controls',()=>{
 const deliverySource=fs.readFileSync(path.join(root,'v2/app/api/projects/[projectId]/materials/deliveries/route.ts'),'utf8');
 const checkSource=fs.readFileSync(path.join(root,'v2/app/api/projects/[projectId]/materials/bundle-checks/route.ts'),'utf8');
 assert.doesNotMatch(deliverySource,/from\("v2_material_bundle_checks"\)/);assert.doesNotMatch(checkSource,/from\("v2_material_deliver(?:ies|y_items)"\)/);
 assert.match(deliverySource,/deliveryAvailability\(bundle, deliveries\)\.eligible/);
 const ui=fs.readFileSync(path.join(root,'v2/app/workspace/projects/[projectId]/materials/materials-control-client.tsx'),'utf8');
 assert.match(ui,/setTowerId\(towerFilter\);\s*setSelectedBundles\(\[\]\)/);assert.match(ui,/setTowerId\(value\);\s*setSelectedBundles\(\[\]\)/);
 assert.match(ui,/setSelectedBundles\(event.target.checked \? \[\.\.\.eligibleIds\] : \[\]\)/);
 assert.match(ui,/No bundle manifest has been imported for this tower/);
});

test('new delivery renders a tower checklist and sticky creation area; absent manifest offers imports',()=>{
 const data={projectId:project,organisationId:'org',permissions:{manage_deliveries:true},bundles:[pack('a'),pack('b')],deliveries:[],towers:[{id:tower,tower_identifier:'T001'}]};
 const render=(payload)=>renderToStaticMarkup(React.createElement(loadPresentation(true).DeliveriesWorkspace,{data:payload,towerFilter:tower,towerMap:new Map([[tower,'T001']]),busy:false,refresh:async()=>{},setMessage:()=>{}}));
 const html=render(data);assert.match(html,/Bundles to schedule/);assert.match(html,/Select all remaining/);assert.match(html,/type="checkbox"/);assert.match(html,/position:sticky/);assert.match(html,/Save scheduled delivery/);assert.match(html,/Top crossarm/);
 assert.equal(data.bundles[0].segment,'TOP CROSSARM');
 const empty=render({...data,bundles:[]});assert.match(empty,/No bundle manifest has been imported for this tower/);assert.match(empty,/Go to Data &amp; Imports/);
});

const workflows=compile('v2/lib/materials/ui-workflows.ts');
const controls=loadUi('v2/components/materials/workflow-controls.tsx');
test('Materials search has prominent shared treatment, search and clear icons',()=>{
 const html=renderToStaticMarkup(React.createElement(controls.MaterialsSearch,{value:'100H',placeholder:'Search material...',onChange:()=>{},onClear:()=>{}}));
 assert.match(html,/lucide-search/);assert.match(html,/Clear search/);assert.match(html,/lucide-x/);
 const css=fs.readFileSync(path.join(root,'v2/components/materials/materials-ui.module.css'),'utf8');assert.match(css,/#f8fafc/);assert.match(css,/focus-within/);assert.match(css,/max-content/);
});
test('local date typing roundtrips and rejects impossible dates rather than silently rolling over',()=>{
 const iso=workflows.parseLocalDateTime('03/10/2026 14:30');assert.ok(iso);assert.equal(workflows.formatLocalDateTime(iso),'03/10/2026 14:30');
 for(const value of ['31/02/2026 14:30','03/10/2026 25:30','2026-10-03','03/13/2026 14:30'])assert.equal(workflows.parseLocalDateTime(value),null);
 const html=renderToStaticMarkup(React.createElement(controls.LocalDateTime,{label:'Planned date',value:iso,onChange:()=>{}}));assert.match(html,/03\/10\/2026 14:30/);assert.match(html,/Choose Planned date/);assert.match(html,/lucide-calendar/);
});
test('all registered material types provide known issue metadata and retain physical UUIDs',()=>{
 for(const kind of ['member','bolt','packer']){
  const data=workflows.materialIssueMetadata({...members[0],material_kind:kind,bundle_id:bundle,segment:'Crossarm',drawing_reference:'DRAW-24',profile:'L100*8',required_quantity:2});
  assert.equal(data.materialKind,kind);assert.equal(data.bundleId,bundle);assert.equal(data.affectedSegment,'Crossarm');assert.equal(data.drawing,'DRAW-24');assert.equal(data.expectedQuantity,2);
 }
 const a=workflows.materialIssueMetadata(pack('a')),b=workflows.materialIssueMetadata(pack('b'));assert.equal(a.itemReference,b.itemReference);assert.notEqual(a.bundleId,b.bundleId);
});
test('traceability metadata controls fields and hidden source/destination values cannot leak into note events',()=>{
 const note=workflows.eventFormFields({option_key:'note',settings:{}});assert.equal(note.has('quantity'),false);assert.equal(note.has('sourceType'),false);
 const receipt=workflows.eventFormFields({option_key:'custom_receipt',settings:{resolves_quantity:true}});assert.ok(receipt.has('quantity'));assert.ok(receipt.has('destinationTower'));
 const custom=workflows.eventFormFields({option_key:'tenant_transfer',settings:{form_fields:['quantity','sourceType','destinationTower','notes','invalid']}});assert.deepEqual([...custom],['quantity','sourceType','destinationTower','notes']);
 const payload=workflows.traceabilityEventPayload({quantity:'3',sourceTypeKey:'another_tower',sourceTowerId:'source',sourceLocationId:'location',destinationTowerId:'destination',destinationLocationId:'location2',docketId:'docket'},note,{requires_tower:true});
 assert.equal(payload.quantity,'0');assert.equal(payload.sourceTowerId,'');assert.equal(payload.destinationTowerId,'');assert.equal(payload.sourceTypeKey,'');
});
test('vehicle manual fields retain rego/description without demanding Assets setup',()=>{
 const html=renderToStaticMarkup(React.createElement(controls.VehiclePicker,{value:{assetId:null,rego:'ABC123',description:'Truck 04'},onChange:()=>{}}));assert.match(html,/ABC123/);assert.match(html,/Truck 04/);assert.match(html,/Search Assets/);
});
test('delivery entry actions and registers distinguish planning from actual docket events',()=>{
 const data={projectId:project,organisationId:'org',permissions:{manage_deliveries:true},bundles:[],deliveries:[],towers:[],recordedBy:'Test Operator'};
 const html=renderToStaticMarkup(React.createElement(presentation.DeliveriesWorkspace,{data,towerFilter:'',towerMap:new Map(),busy:false,refresh:async()=>{},setMessage:()=>{}}));
 assert.match(html,/Plan Delivery/);assert.match(html,/Record Delivery Docket/);assert.match(html,/Scheduled/);assert.match(html,/Delivery dockets/);
});

test('issue form displays canonical metadata and actor without repeated segment/drawing selectors',()=>{
 const data={projectId:project,organisationId:'org',permissions:{manage_issues:true},options:[{option_group:'material_issue_type',option_key:'missing',label:'Missing',settings:{allow_manual_material:false}}],dockets:[],towers:[],locations:[],recordedBy:'Test Operator'};
 const draft={materialItemId:'member',bundleId:bundle,bundleReference:'1/5',itemReference:'100H',materialKind:'member',affectedSegment:'Top Crossarms',drawing:'DRAW-24',profile:'L100*8',expectedQuantity:2,unit:'ea',issueTypeKey:'missing',quantity:'1',raisedAt:'2026-10-03T04:30:00Z',docketId:'',affectedWork:false,towerId:tower};
 const html=renderToStaticMarkup(React.createElement(presentation.IssueCreateForm,{data,draft,setDraft:()=>{},onSave:()=>{},busy:false}));
 for(const value of ['100H','Top Crossarms','DRAW-24','Bundle 1/5','Recorded by Test Operator','Create issue'])assert.ok(html.includes(value));
 assert.doesNotMatch(html,/Unregistered material/);
});
test('note traceability hides irrelevant fields while configured receipt exposes operational destination',()=>{
 const data={options:[{option_group:'material_issue_event_type',option_key:'note',label:'Note',settings:{}},{option_group:'material_issue_event_type',option_key:'received',label:'Received',settings:{resolves_quantity:true}},{option_group:'material_source_type',option_key:'another_tower',label:'Another tower',settings:{requires_tower:true}}],dockets:[],towers:[],locations:[],permissions:{manage_issues:true},recordedBy:'Test Operator'};
 const draft={eventTypeKey:'note',quantity:'1',sourceTypeKey:'another_tower',sourceTowerId:'source',sourceLocationId:'',destinationTowerId:'',destinationLocationId:'',docketId:'',reference:'',notes:''};
 const render=eventTypeKey=>renderToStaticMarkup(React.createElement(presentation.TraceabilityEventForm,{data,draft:{...draft,eventTypeKey},setDraft:()=>{},onSave:()=>{}}));
 assert.doesNotMatch(render('note'),/Source tower|Destination|>Qty</);assert.match(render('received'),/Source tower/);assert.match(render('received'),/Destination \/ received at tower/);
});

test('All Towers issue requires selection; specific affected tower enables scoped material search',()=>{
 const data={projectId:project,organisationId:'org',permissions:{manage_issues:true},options:[],dockets:[],towers:[{id:tower,tower_identifier:'T001'}],locations:[]};
 const draft={towerId:'',itemReference:'',issueTypeKey:'missing',quantity:'1',raisedAt:'2026-10-03T04:30:00Z',unit:'ea',docketId:'',affectedWork:false};
 const render=towerId=>renderToStaticMarkup(React.createElement(presentation.IssueCreateForm,{data,draft:{...draft,towerId},setDraft:()=>{},onSave:()=>{},busy:false}));
 assert.match(render(''),/Affected tower \(required\)/);assert.match(render(''),/Select the affected tower before searching/);assert.doesNotMatch(render(''),/placeholder="Search member/);assert.match(render(tower),/placeholder="Search member/);assert.match(render(tower),/value="T001"/);
 const source=fs.readFileSync(path.join(root,'v2/app/workspace/projects/[projectId]/materials/materials-control-client.tsx'),'utf8');assert.match(source,/towerId:towerFilter/);assert.match(source,/towerId,materialItemId:"",bundleId:""/);
});
test('completed docket is read-only with explicit correction; in-progress exposes outcomes only for pending UUID rows',()=>{
 const render=(status,items)=>{
  const data={projectId:project,organisationId:'org',permissions:{manage_deliveries:true},bundles:[pack('a'),pack('b')],deliveries:[{id:'test-delivery',delivery_number:'DEL-1',status,completed_at:'2026-10-03T04:30:00Z',completed_by_name:'Test Operator',items}],towers:[]};
  return renderToStaticMarkup(React.createElement(loadPresentation(false,'test-delivery').DeliveriesWorkspace,{data,towerFilter:'',towerMap:new Map(),busy:false,refresh:async()=>{},setMessage:()=>{}}));
 };
 const complete=render('delivered',[{...allocation('a','delivered',1),expected_quantity:1,driver_checked_at:'2026-10-03T04:30:00Z',driver_checked_by_name:'Test Operator'}]);
 assert.match(complete,/COMPLETED/);assert.doesNotMatch(complete,/Mark all/);assert.match(complete,/Completed .*by Test Operator/);assert.match(complete,/View details \/ Correct outcomes/);assert.doesNotMatch(complete,/<button[^>]*>Delivered<|<button[^>]*>Not Delivered</);assert.match(complete,/Correct outcome \/ Reopen/);assert.doesNotMatch(complete,/<details[^>]*\bopen/);
 const partial=render('in_transit',[{...allocation('a','delivered',1),expected_quantity:1},{...allocation('b','planned'),expected_quantity:1}]);assert.match(partial,/IN PROGRESS/);assert.match(partial,/Mark all 1 remaining as Delivered/);assert.match(partial,/1 \/ 2 bundles actioned/);assert.equal((partial.match(/>Delivered<\/button>/g)||[]).length,1);assert.equal((partial.match(/>Not Delivered<\/button>/g)||[]).length,1);
});
