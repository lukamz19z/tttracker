const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const ts=require(path.join(root,'v2/node_modules/typescript'));
let calls=0;let lastRpc;let rpcError=null;
const mocks={
 '@/lib/materials/security':{requireMaterialsContext:async()=>({dataOrganisationId:'org',workspace:{userId:'actor'}}),materialsErrorResponse:error=>({status:400,body:{error:error.message}})},
 '@/lib/supabase/admin':{createSupabaseAdmin:()=>({rpc:async(name,args)=>{calls++;lastRpc={name,args};return {data:{ok:true,acceptedRows:1,rowErrors:[]},error:rpcError};}})},
 'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}}
};
function load(file){const exports={};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 new Function('require','exports',code)(name=>mocks[name]||load(name.startsWith('@/')?'v2/'+name.slice(2)+'.ts':path.posix.join(path.posix.dirname(file),name+'.ts')),exports);return exports;}
const parser=load('v2/lib/materials/import-csv.ts');
const validation=load('v2/lib/materials/import-validation.ts');
const scopeHelper=load('v2/lib/materials/import-scope.ts');
const applicabilityHelper=load('v2/lib/materials/applicability.ts');
const mapping={bundle_reference:'Bundle',description:'Description',required_quantity:'Qty'};
for(const [name,source] of [
 ['trailing blank line','Bundle,Description,Qty\n1/1,First,1\n'],
 ['several blank lines','Bundle,Description,Qty\n1/1,First,1\n\n,,\n\n'],
 ['whitespace-only row','Bundle,Description,Qty\n1/1,First,1\n  , \t ,  '],
 ['blank row between real rows','Bundle,Description,Qty\n1/1,First,1\n,,\n1/10,Second,1']
])test(name,()=>{const p=parser.parseMaterialsCsv(source);assert.ok(p.rows.every(row=>row.Bundle));const v=validation.prepareImportRows(p.rows,mapping,'bundles',p.sourceRowNumbers);assert.equal(v.invalidRows,0);assert.equal(v.rows[0].values.bundle_reference,'1/1');if(name.includes('between')){assert.equal(v.rows[1].values.bundle_reference,'1/10');assert.equal(v.rows[1].row_number,4);}});
test('formatting-only Excel cells and cached blank formulas are empty; unevaluated formulas are not',()=>{
 assert.equal(validation.isEmptySourceRow([{t:'z',s:{font:{bold:true}}},undefined]),true);
 assert.equal(validation.isEmptySourceRow([{f:'IF(A1="","",A1)',v:''},{v:'   '}]),true);
 assert.equal(validation.isEmptySourceRow([{f:'A1+A2'}]),false);
 assert.equal(validation.isEmptySourceRow([0,'',null]),false);
});
test('partially populated missing bundle retains physical line after blanks are removed',()=>{
 const p=parser.parseMaterialsCsv('Bundle,Description,Qty\n1/1,First,1\n,,\n,BOTTOM CROSS-ARM,1');
 const v=validation.prepareImportRows(p.rows,mapping,'bundles',p.sourceRowNumbers);
 assert.equal(v.rowErrors[0].row,4);assert.equal(v.rowErrors[0].message,'bundle_reference is required.');
 assert.equal(v.validRows,1);assert.equal(v.invalidRows,1);assert.equal(v.appliedRows,0);
});
test('common empty filtering preserves required fields for all categories',()=>{
 for(const category of ['bundles','members','bolts','packers']){
  const v=validation.prepareImportRows([{a:null,b:undefined,c:'  '},{Description:'Real row'}],{description:'Description'},category,[8,10]);
  assert.equal(v.ignoredEmptyRows,1);assert.ok(v.rowErrors.every(e=>e.row===10));assert.equal(v.invalidRows,1);
 }
});
test('counts distinguish validated, invalid and applied rows; grouped errors count rows',()=>{
 const errors=[{row:40,message:'bundle_reference is required.'},{row:40,message:'required_quantity is required.'}];
 assert.deepEqual(validation.importValidationCounts(39,errors),{validRows:38,invalidRows:1,appliedRows:0});
 assert.deepEqual(validation.importValidationCounts(39,[],39),{validRows:39,invalidRows:0,appliedRows:39});
 assert.equal(validation.groupImportErrors([{row:3,message:"required_quantity: 'bad' is not a non-negative decimal."},{row:4,message:"required_quantity: 'wrong' is not a non-negative decimal."}]).length,1);
});
const route=load('v2/app/api/projects/[projectId]/materials/import/route.ts');
const body={towerId:'30000000-0000-0000-0000-000000000001',importCategory:'bundles',mode:'merge',sourceRole:'packing_list',sourceScope:'file.csv',mapping};
test('38 valid plus one genuine invalid row do not call the transactional RPC',async()=>{
 calls=0;const rows=Array.from({length:38},(_,i)=>({Bundle:`1/${i+1}`,Description:'',Qty:'1'}));rows.push({Bundle:'',Description:'BOTTOM CROSS-ARM',Qty:'1'});
 const result=await route.POST({json:async()=>({...body,rows,sourceRowNumbers:Array.from({length:39},(_,i)=>i+2)})},{params:Promise.resolve({projectId:'project'})});
 assert.equal(result.status,422);assert.equal(result.body.validRows,38);assert.equal(result.body.invalidRows,1);assert.equal(result.body.appliedRows,0);assert.equal(result.body.rowErrors[0].row,40);assert.equal(calls,0);
});
test('empty-only batch never invokes RPC; valid batch reports applied',async()=>{
 calls=0;const empty=await route.POST({json:async()=>({...body,rows:[{Bundle:'',Description:'',Qty:''}]})},{params:Promise.resolve({projectId:'project'})});
 assert.equal(empty.status,400);assert.equal(calls,0);
 const result=await route.POST({json:async()=>({...body,rows:[{Bundle:'1/10',Description:'',Qty:'1'}],sourceRowNumbers:[12]})},{params:Promise.resolve({projectId:'project'})});
 assert.equal(result.body.validRows,1);assert.equal(result.body.invalidRows,0);assert.equal(result.body.appliedRows,1);assert.equal(calls,1);
});

test('rendered import keeps primary workflow visible and only error details collapsed',()=>{
 const file='v2/app/workspace/projects/[projectId]/materials/import/materials-import-client.tsx';
 const states={4:'bundles.csv',5:['Bundle','Description','Qty'],6:[{Bundle:'1/1',Description:'',Qty:'1'}],7:[2],8:1,9:{validRows:38,invalidRows:1,appliedRows:0},10:mapping,14:[{row:40,message:'bundle_reference is required.'}]};
 let stateIndex=0;
 const imports={react:{useState:initial=>[stateIndex in states ? states[stateIndex++] : (stateIndex++,initial),()=>{}],useMemo:fn=>fn()},
 'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
 'lucide-react':new Proxy({},{get:(_,name)=>String(name)}),
 'next/link':{default:'Link'},
 '@/components/ui/tt-ui':{Card:'Card',tt:new Proxy({},{get:(_,name)=>String(name)})},
 '@/lib/materials/applicability':applicabilityHelper,'@/lib/materials/import-scope':scopeHelper,'@/lib/materials/import-csv':parser,'@/lib/materials/import-validation':validation};
 const exports={};
 const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports',code)(name=>imports[name],exports);
 const tree=exports.default({organisationId:'org',projectId:'project',towers:[]});
 const nodes=[];function walk(value){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object'){nodes.push(value);walk(value.props?.children);}}
 walk(tree);
 function text(value){return Array.isArray(value)?value.map(text).join(''):value&&typeof value==='object'?text(value.props?.children):String(value??'');}
 const output=text(tree);
 assert.match(output,/Fatal errors.*1/);assert.match(output,/0 source rows stored/);assert.match(output,/Import readiness/);
 assert.match(output,/CSV row 40/);assert.match(output,/1 empty source row/);
 const details=nodes.filter(node=>node.type==='details');
 assert.ok(details.filter(node=>/Missing bundle reference/.test(text(node.props.children))).every(node=>!node.props.open));
 assert.doesNotMatch(output,/39 rejected|unmatched\/ambiguous rows/);
 assert.ok(!details.some(node=>/^Preview|^Import readiness|^Apply/.test(text(node.props.children))));
});

test('tower column aliases auto-map and custom headers manually map without losing original values',()=>{
 const file='v2/app/workspace/projects/[projectId]/materials/import/materials-import-client.tsx';
 const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};new Function('require','exports',code+';exports.autoMap=autoMap;exports.fieldSets=fieldSets;')(name=>name==='lucide-react'?new Proxy({},{get:(_,key)=>key}):{},exports);
 const actualHeaders=['Member Number','Bundle Number','Drawing Number','Section','Qty/Tower','Tower Segment','Applicable Towers'];
 const actual=exports.autoMap(actualHeaders,exports.fieldSets.members);assert.equal(actual.item_reference,'Member Number');assert.equal(actual.profile,'Section');assert.equal(actual.segment,'Tower Segment');assert.equal(actual.required_quantity,'Qty/Tower');assert.equal(actual.applicable_towers,'Applicable Towers');assert.equal(actual.drawing_reference,'Drawing Number');
 const field={key:'tower_reference',label:'Tower Identifier',aliases:scopeHelper.towerReferenceAliases};
 for(const alias of scopeHelper.towerReferenceAliases)assert.equal(exports.autoMap([alias],[field]).tower_reference,alias);
 const p=parser.parseMaterialsCsv('Structure Label,Bundle\n t001 ,1/10');
 const prepared=validation.prepareImportRows(p.rows,{tower_reference:'Structure Label',bundle_reference:'Bundle'},'bundles',p.sourceRowNumbers);
 assert.equal(prepared.rows[0].values.tower_reference,'t001');assert.equal(prepared.rows[0].raw_payload['Structure Label'],' t001 ');
 const result=scopeHelper.importTargets('csv',[{id:'A',tower_identifier:'T001'}],'',[],prepared.rows);
 assert.equal(result.towers.length,1);assert.equal(result.rowErrors.length,0);
});
test('scope summary resolves selected/all/CSV targets and groups unmatched tower values',()=>{
 const towers=[{id:'A',tower_identifier:'T001',tower_type:'3DT'},{id:'B',tower_identifier:'T002',tower_type:'3LT'}];
 assert.equal(scopeHelper.importTargets('selected',towers,'',['A'],[]).towers.length,1);
 assert.equal(scopeHelper.importTargets('all',towers,'',[],[]).types.length,2);
 const errors=scopeHelper.importTargets('csv',towers,'',[],[{row_number:40,values:{tower_reference:'T999'}},{row_number:41,values:{tower_reference:'T998'}}]).rowErrors;
 assert.equal(errors.length,2);assert.equal(validation.groupImportErrors(errors).length,1);
});

test('bulk scopes use one authorized RPC with server context and source rows unchanged',async()=>{
 const targets=['30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002'];
 for(const scope of ['selected','all','csv']){
 calls=0;
 const result=await route.POST({json:async()=>({...body,organisationId:'untrusted',importScope:scope,targetTowerIds:targets,confirmTowerTypes:true,
 mapping:{...mapping,tower_reference:'Tower'},rows:[{Bundle:'1/1',Tower:'T001',Description:'',Qty:'1'}],sourceRowNumbers:[40]})},{params:Promise.resolve({projectId:'project'})});
 assert.equal(result.status,200);assert.equal(calls,1);assert.equal(lastRpc.name,'tttracker_v2_apply_material_schedule');
 assert.equal(lastRpc.args.p_organisation_id,'org');assert.equal(lastRpc.args.p_actor_id,'actor');assert.equal(lastRpc.args.p_scope,scope);
 assert.equal(lastRpc.args.p_rows.length,1);assert.equal(lastRpc.args.p_rows[0].row_number,40);
 assert.deepEqual(lastRpc.args.p_tower_ids,scope==='csv'?[]:targets);
 }
 calls=0;
 const bad=await route.POST({json:async()=>({...body,importScope:'csv',rows:[{Bundle:'1/1'}]})},{params:Promise.resolve({projectId:'project'})});
 assert.equal(bad.status,422);assert.equal(calls,0);assert.equal(bad.body.appliedRows,0);
});

test('profile-driven applicability preview uses common/list/intersection and preserves row errors',()=>{
 const towers=[{id:'A',tower_identifier:'T001'},{id:'B',tower_identifier:'T002'}];
 const rows=[{row_number:2,values:{item_reference:'M'}},{row_number:4,values:{item_reference:'M',applicable_towers:'T001;T002'}},{row_number:8,values:{item_reference:'M',applicable_towers:'T002'}}];
 const r=applicabilityHelper.evaluateApplicability(rows,towers,[towers[0]],{kind:'tower_list',blank:'common',delimiter:';'});
 assert.deepEqual(r.effective,[{towerId:'A',common:1,conditional:1,total:2}]);assert.equal(r.rowErrors.length,0);
 assert.equal(applicabilityHelper.evaluateApplicability(rows,towers,[towers[0]],{kind:'tower_list',blank:'error',delimiter:';'}).rowErrors[0].row,2);
 assert.equal(applicabilityHelper.evaluateApplicability(rows,towers,[towers[0]],{kind:'tower_list',blank:'none',delimiter:';'}).effective[0].total,1);
});

test('partial and absent applicability are warnings/out of scope, not fatal source errors',()=>{
 const towers=[{id:'A',tower_identifier:'T001'},{id:'B',tower_identifier:'T003'}];
 const rows=[{row_number:2,values:{item_reference:'M'}},{row_number:3,values:{item_reference:'P',applicable_towers:'T001,T002,T003'}},{row_number:4,values:{item_reference:'F',applicable_towers:'T004'}}];
 const result=applicabilityHelper.evaluateApplicability(rows,towers,towers,applicabilityHelper.memberScheduleApplicability);
 assert.equal(result.rowErrors.length,0);assert.equal(result.common,1);assert.equal(result.conditional,2);assert.equal(result.relationships,4);assert.equal(result.outOfScopeRows,1);assert.deepEqual(result.unmatchedReferences,['T002','T004']);
 const restored=applicabilityHelper.profileApplicability({import_options:{applicability:{kind:'tower_list',blank:'common',delimiter:';'}}});assert.equal(restored.blank,'common');assert.equal(restored.delimiter,';');assert.equal(restored.unmatched,'retain');
 const invalid=applicabilityHelper.evaluateApplicability([{row_number:9,values:{item_reference:'BAD',applicable_towers:'T001,,T003'}}],towers,towers,applicabilityHelper.memberScheduleApplicability);assert.equal(invalid.rowErrors[0].row,9);
});

test('reported 2202-row pattern is valid despite 1278 rows containing unavailable references',()=>{
 const towers=[{id:'A',tower_identifier:'T001'},{id:'B',tower_identifier:'T003'}];
 const rows=[...Array.from({length:922},(_,i)=>({row_number:i+2,values:{item_reference:`C${i}`}})),...Array.from({length:1280},(_,i)=>({row_number:i+924,values:{item_reference:`S${i}`,applicable_towers:i<1278?'T001,T999':'T003'}}))];
 const result=applicabilityHelper.evaluateApplicability(rows,towers,towers,applicabilityHelper.memberScheduleApplicability);
 assert.equal(result.common,922);assert.equal(result.conditional,1280);assert.equal(result.rowErrors.length,0);assert.equal(result.relationships,3124);assert.equal(result.unmatchedReferences.length,1);assert.equal(result.outOfScopeRows,0);
});

test('reopened importer restores saved profile and file upload does not reset its applicability',async()=>{
 const file='v2/app/workspace/projects/[projectId]/materials/import/materials-import-client.tsx';const state=[];let cursor=0;
 const imports={react:{useState:initial=>{const index=cursor++;if(!(index in state))state[index]=initial;return[state[index],value=>{state[index]=typeof value==='function'?value(state[index]):value;}];},useMemo:fn=>fn()},
 'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},'lucide-react':new Proxy({},{get:(_,name)=>String(name)}),'next/link':{default:'Link'},
 '@/components/ui/tt-ui':{Card:'Card',tt:new Proxy({},{get:(_,name)=>String(name)})},'@/lib/materials/applicability':applicabilityHelper,'@/lib/materials/import-scope':scopeHelper,'@/lib/materials/import-csv':parser,'@/lib/materials/import-validation':validation};
 const exports={};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','exports',code)(name=>imports[name],exports);
 const props={organisationId:'org',projectId:'project',towers:[{id:'A',tower_identifier:'T001'}],importProfiles:[{name:'Saved schedule',sourceRole:'drawing_schedule',mapping:{item_reference:'Member',applicable_towers:'Applicable'},defaults:{import_category_key:'members',import_options:{applicability:{kind:'tower_list',blank:'common',delimiter:';',unmatched:'retain'}}}}]};
 const render=()=>{cursor=0;return exports.default(props);};
 const nodes=tree=>{const out=[];const walk=value=>{if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object'){out.push(value);walk(value.props?.children);}};walk(tree);return out;};
 const text=value=>Array.isArray(value)?value.map(text).join(''):value&&typeof value==='object'?text(value.props?.children):String(value??'');
 let tree=render();nodes(tree).find(node=>node.props?.['aria-label']==='Import type').props.onChange({target:{value:'members'}});tree=render();assert.equal(state[11],'Saved schedule');
 nodes(tree).find(node=>node.type==='input'&&node.props.type==='file').props.onChange({target:{files:[{name:'real.csv',text:async()=> 'Member,Applicable\nM1,\nM2,T001;FUTURE'}]}});
 await new Promise(resolve=>setImmediate(resolve));tree=render();const output=text(tree);
 assert.match(output,/Blank applicability: Common within selected scope/);assert.match(output,/Delimiter: ;/);assert.match(output,/Applicability references unresolved: 1/);assert.doesNotMatch(output,/Unmatched tower|Applicable towers is required/);
 assert.equal(state[10].applicable_towers,'Applicable');
});

test('internal RPC failures are logged and never expose database SQL errors in the response',async()=>{
 const original=console.error;const logged=[];console.error=(...args)=>logged.push(args);rpcError={code:'21000',message:'UPDATE requires a WHERE clause',details:'internal SQL'};
 try {const result=await route.POST({json:async()=>({...body,rows:[{Bundle:'1/1',Description:'',Qty:'1'}]})},{params:Promise.resolve({projectId:'project'})});assert.equal(result.status,500);assert.equal(result.body.code,'MATERIALS_IMPORT_FAILED');assert.equal(result.body.appliedRows,0);assert.doesNotMatch(result.body.error,/UPDATE|WHERE|internal SQL/);assert.equal(logged[0][1].message,rpcError.message);}finally{rpcError=null;console.error=original;}
});
