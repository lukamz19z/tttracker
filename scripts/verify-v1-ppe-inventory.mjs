import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(file,mocks={}){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>{if(name in mocks)return mocks[name];throw Error('Missing mock '+name);},exports);return exports;}
const db=new PGlite(),actor='00000000-0000-0000-0000-000000000001';
const people=[2,3,4,5].map(n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0'));
const migration='supabase/migrations/20261028120000_v1_ppe_inventory.sql';
let counter=10;
const uuid=()=>`00000000-0000-0000-0000-${String(++counter).padStart(12,'0')}`;
try{
 await db.exec(`create role service_role;create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
 create table crews(id uuid primary key,crew_number text,crew_name text);
 create table employees(id uuid primary key,full_name text,payroll_id text,crew_id uuid,active boolean,shirt_size text,jacket_size text,glove_size text,pants_size text);
 create table access_areas(id uuid primary key default gen_random_uuid(),group_id uuid,category text,code text unique,name text,description text,type text,permission_level text,route text,source text,sort_order int,is_active boolean);
 insert into auth.users values('${actor}');`);
 for(let i=0;i<people.length;i++)await db.query('insert into employees(id,full_name,payroll_id,active,jacket_size) values($1,$2,$3,true,$4)',[people[i],['John Smith','Peter Brown','Sam Jones','Jane Jones'][i],String(100+i),['XL','XL','L','M'][i]]);
 await db.exec(fs.readFileSync('supabase/migrations/20261027120000_v1_people_ppe_register.sql','utf8'));
 await db.exec(fs.readFileSync(migration,'utf8'));await db.exec(fs.readFileSync(migration,'utf8'));
 assert.equal((await db.query('select count(*)::int n from access_areas')).rows[0].n,6);
 const mapping=(await db.query("select id from people_ppe_types where source_field='jacket_size'")).rows[0].id;
 async function product(name,labels,extra={}){const data={name,category:'Clothing',code:null,description:null,notes:null,tracks_sizes:labels[0]!=='',ppe_type_id:mapping,active:true,sort_order:0,sizes:labels.map(label=>({label,minimum:5})),...extra};return (await db.query('select v1_ppe_inventory_save_product($1::jsonb) id',[JSON.stringify(data)])).rows[0].id;}
 async function sizes(pid){return (await db.query('select * from v1_ppe_inventory_balances where product_id=$1 order by sort_order',[pid])).rows;}
 async function balance(sid){return Number((await db.query('select on_hand from v1_ppe_inventory_balances where id=$1',[sid])).rows[0].on_hand);}
 async function post(kind,lines,extra={}){const request={kind,lines,mutation_id:uuid(),...extra};const id=(await db.query('select v1_ppe_inventory_post($1::jsonb,$2,$3) id',[JSON.stringify(request),actor,'Luka Zetovic'])).rows[0].id;return {id,request};}
 const hoodie=await product('Black BC Hoodie',['M','L','XL','2XL']),hs=await sizes(hoodie),[m,l,xl,xxl]=hs.map(s=>s.id);
 await post('receipt',[{size_id:xl,quantity:10}]);assert.equal(await balance(xl),10);
 await post('receipt',[{size_id:xl,quantity:15}],{reference:'PO-100',supplier:'Supplier'});assert.equal(await balance(xl),25);
 const single=await post('issue',[{size_id:xl,quantity:1,employee_id:people[0]}]);assert.equal(await balance(xl),24);
 let movement=(await db.query('select * from people_ppe_inventory_movements where batch_id=$1',[single.id])).rows[0];assert.equal(movement.employee_name,'John Smith');assert.equal(movement.performed_by_label,'Luka Zetovic');assert.equal(movement.quantity_delta,-1);
 // Set the acceptance-test opening stock using ledger movements, never balances.
 await post('adjustment',[{size_id:xl,quantity:-14},{size_id:l,quantity:10},{size_id:m,quantity:10}],{notes:'Acceptance opening balance'});
 const bulk=await post('issue',[xl,xl,l,m].map((sid,i)=>({size_id:sid,quantity:1,employee_id:people[i]})));assert.deepEqual(await Promise.all([xl,l,m].map(balance)),[8,9,9]);assert.equal((await db.query('select count(*)::int n from people_ppe_inventory_movements where batch_id=$1',[bulk.id])).rows[0].n,4);
 const shirt=await product('Orange Hi-Vis Shirt',['XL']),pants=await product('Work Pants',['92']);const shirtSize=(await sizes(shirt))[0].id,pantsSize=(await sizes(pants))[0].id;
 await post('receipt',[{size_id:shirtSize,quantity:10},{size_id:pantsSize,quantity:10}]);
 const pack=await post('issue',[{size_id:xl,quantity:1,employee_id:people[0]},{size_id:shirtSize,quantity:2,employee_id:people[0]},{size_id:pantsSize,quantity:2,employee_id:people[0]}]);assert.deepEqual(await Promise.all([xl,shirtSize,pantsSize].map(balance)),[7,8,8]);assert.equal((await db.query('select count(*)::int n from people_ppe_inventory_movements where batch_id=$1',[pack.id])).rows[0].n,3);
 await post('adjustment',[{size_id:xl,quantity:-5}],{notes:'Prepare insufficient-stock case'});assert.equal(await balance(xl),2);
 const before=(await db.query('select count(*)::int n from people_ppe_inventory_batches')).rows[0].n;
 await assert.rejects(post('issue',[{size_id:xl,quantity:3,employee_id:people[0]}]),/Only 2 Black BC Hoodie · XL are available/);
 await assert.rejects(post('issue',[{size_id:l,quantity:1,employee_id:people[0]},{size_id:xl,quantity:2,employee_id:people[1]},{size_id:xl,quantity:1,employee_id:people[2]}]),/Only 2/);assert.equal(await balance(l),9);assert.equal(await balance(xl),2);assert.equal((await db.query('select count(*)::int n from people_ppe_inventory_batches')).rows[0].n,before);
 const bulkReceipt=await post('receipt',[{size_id:m,quantity:10},{size_id:l,quantity:15},{size_id:xl,quantity:20},{size_id:xxl,quantity:5}]);assert.deepEqual(await Promise.all([m,l,xl,xxl].map(balance)),[19,24,22,5]);assert.equal((await db.query('select count(*)::int n from people_ppe_inventory_movements where batch_id=$1',[bulkReceipt.id])).rows[0].n,4);
 // Retry the exact same delivery: same batch and no double stock.
 assert.equal((await db.query('select v1_ppe_inventory_post($1::jsonb,$2,$3) id',[JSON.stringify(bulkReceipt.request),actor,'Luka Zetovic'])).rows[0].id,bulkReceipt.id);assert.equal(await balance(xl),22);
 await assert.rejects(db.query('select v1_ppe_inventory_post($1::jsonb,$2,$3)',[JSON.stringify({...bulkReceipt.request,notes:'changed'}),actor,'Luka Zetovic']),/different details/);
 await assert.rejects(post('receipt',[{size_id:xl,quantity:5},{size_id:uuid(),quantity:1}]),/size not found/);assert.equal(await balance(xl),22);
 await assert.rejects(post('adjustment',[{size_id:xl,quantity:-1}]),/reason is required/);
 await assert.rejects(post('adjustment',[{size_id:xl,quantity:-23}],{notes:'Too much'}),/Only 22/);
 await assert.rejects(post('receipt',[{size_id:xl,quantity:1}],{occurred_at:'2099-01-01T00:00:00Z'}),/future/);
 await db.query('update employees set active=false where id=$1',[people[0]]);await assert.rejects(post('issue',[{size_id:xl,quantity:1,employee_id:people[0]}]),/active employee/);await db.query('update employees set active=true where id=$1',[people[0]]);
 await post('reversal',[{size_id:xl,quantity:1,reversal_of:movement.id}],{notes:'Incorrect size, corrected issue follows'});assert.equal(await balance(xl),23);await assert.rejects(post('reversal',[{size_id:xl,quantity:1,reversal_of:movement.id}],{notes:'Repeated reversal'}),/already been reversed/);
 await assert.rejects(db.query('delete from people_ppe_inventory_movements where id=$1',[movement.id]),/permanent/);await assert.rejects(db.query('update people_ppe_inventory_movements set quantity_delta=-5 where id=$1',[movement.id]),/permanent/);
 let old=(await db.query('select * from people_ppe_inventory_products where id=$1',[hoodie])).rows[0];
 await product('Renamed Hoodie',['M','L','2XL'],{id:hoodie,updated_at:old.updated_at});assert.equal((await sizes(hoodie)).find(s=>s.id===xl).active,false);assert.equal(await balance(xl),23);await assert.rejects(post('issue',[{size_id:xl,quantity:1,employee_id:people[0]}]),/active product and size/);
 // Adjustments/reversals can explain archived stock; no historical deletion needed.
 await post('adjustment',[{size_id:xl,quantity:-1}],{notes:'Archived size stock count correction'});assert.equal(await balance(xl),22);
 await assert.rejects(product('Stale edit',['XL'],{id:hoodie,updated_at:old.updated_at}),/changed/);
 old=(await db.query('select * from people_ppe_inventory_products where id=$1',[hoodie])).rows[0];await assert.rejects(product('Changed tracking',[''],{id:hoodie,updated_at:old.updated_at}),/Size tracking cannot change/);
 await assert.rejects(product('Duplicate sizes',['XL',' xl ']),/unique/);
 const glasses=await product('Custom Safety Glasses',[''],{ppe_type_id:null});const gs=(await sizes(glasses))[0].id;await post('receipt',[{size_id:gs,quantity:4}]);await post('issue',[{size_id:gs,quantity:1,employee_id:people[0]}]);assert.equal(await balance(gs),3);
 await db.query('delete from employees where id=$1',[people[0]]);await db.query('delete from auth.users where id=$1',[actor]);assert.equal((await db.query('select employee_name,performed_by_label from people_ppe_inventory_movements where id=$1',[movement.id])).rows[0].employee_name,'John Smith');
 assert.equal((await db.query('select product_name from people_ppe_inventory_movements where id=$1',[movement.id])).rows[0].product_name,'Black BC Hoodie');
 assert.equal((await db.query('select jacket_size from employees where id=$1',[people[1]])).rows[0].jacket_size,'XL');
 const privilege=(await db.query("select has_function_privilege('authenticated','v1_ppe_inventory_post(jsonb,uuid,text)','EXECUTE') can_post,has_table_privilege('service_role','people_ppe_inventory_movements','UPDATE') can_edit,has_table_privilege('anon','people_ppe_inventory_movements','SELECT') can_read")).rows[0];assert.deepEqual(privilege,{can_post:false,can_edit:false,can_read:false});
 console.log('PASS additive migration twice, configurable products/sizes, receipt 10+15=25, single issue 25→24, bulk people XL=8/L=9/M=9, atomic PPE Pack, bulk receipt and cross-product batches.');
 console.log('PASS duplicate-size combined demand, insufficient stock rollback, invalid-line receipt rollback, retry idempotency, required adjustment reason, negative stock protection, active employee validation.');
 console.log('PASS immutable ledger/batches, one-time reversal, archived size stock/history, stale product edit, tracking-change prevention, unsized products, audit survives employee/account deletion, restricted SQL privileges.');

 // Exercise the actual stock API against the transactional PostgreSQL function.
 const calls=[];let denied=false;
 const stockRoute=load('app/api/people/ppe/inventory/stock/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},
  '@/lib/people/ppe-inventory-server':{inventoryAccess:async(_r,capability)=>{calls.push(capability);if(denied)throw Error('FORBIDDEN');return {user:{id:actor,user_metadata:{}},service:{from(table){assert.equal(table,'employees');const q={select(){return q;},eq(){return q;},limit(){return q;},maybeSingle:async()=>({data:{full_name:'Recorded User'},error:null})};return q;},async rpc(name,args){assert.equal(name,'v1_ppe_inventory_post');try{return {data:(await db.query('select v1_ppe_inventory_post($1::jsonb,$2,$3) id',[JSON.stringify(args.p_request),args.p_actor,args.p_actor_label])).rows[0].id,error:null};}catch(error){return {data:null,error};}}}};},inventoryError:error=>({error:error.message})},
  '@/lib/people/ppe-server':{ppeBody:async r=>r.body,invalidPpe:message=>{throw Error(message);},uuidPattern:/^[0-9a-f-]{36}$/}
 });
 const apiReceipt={kind:'receipt',mutation_id:uuid(),lines:[{size_id:gs,quantity:5}]};
 const apiResult=await stockRoute.POST({body:apiReceipt});assert.ok(apiResult.body.batch_id);assert.equal(await balance(gs),8);assert.equal(calls.at(-1),'receive');
 assert.equal((await db.query('select performed_by_label from people_ppe_inventory_movements where batch_id=$1',[apiResult.body.batch_id])).rows[0].performed_by_label,'Recorded User');
 assert.equal((await stockRoute.POST({body:apiReceipt})).body.batch_id,apiResult.body.batch_id);assert.equal(await balance(gs),8);
 const rejected=await stockRoute.POST({body:{kind:'issue',mutation_id:uuid(),lines:[{size_id:gs,quantity:9,employee_id:people[1]}]}});assert.match(rejected.error,/Only 8/);assert.equal(await balance(gs),8);assert.equal(calls.at(-1),'issue');
 assert.match((await stockRoute.POST({body:{kind:'adjustment',mutation_id:uuid(),lines:[{size_id:gs,quantity:-1}]}})).error,/reason is required/i);assert.equal(calls.at(-1),'adjust');
 assert.match((await stockRoute.POST({body:{kind:'receipt',mutation_id:uuid(),lines:[{size_id:gs,quantity:1.5}]}})).error,/whole quantity/);
 denied=true;assert.equal((await stockRoute.POST({body:apiReceipt})).error,'FORBIDDEN');assert.equal(await balance(gs),8);
 console.log('PASS actual stock API uses permission-specific actions, canonical issuing-user label, transactional RPC, clear insufficient-stock errors, validated quantities, retry-safe batch ID and denied access leaves stock untouched.');
}finally{await db.close();}
const model=load('lib/people/ppe-inventory.ts');
const p={id:'P',ppe_type_id:'T',tracks_sizes:true},s=[{id:'XL',product_id:'P',label:'XL',active:true}];assert.equal(model.suggestedSize(p,{sizes:{T:' xl '}},s),'XL');assert.equal(model.suggestedSize({...p,ppe_type_id:null},{sizes:{T:'XL'}},s),'');assert.equal(model.suggestedSize(p,{sizes:{T:'L'}},s),'');assert.equal(model.suggestedSize({...p,tracks_sizes:false},undefined,[{...s[0],label:''}]),'XL');assert.match(model.inventoryCsv([['=danger','Product','On Hand'],['Hoodie','XL',9]]),/'=danger/);
let permissions=new Set(['view']);const server=load('lib/people/ppe-inventory-server.ts',{'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},'./ppe-server':{ppeAccess:async()=>({service:{},user:{id:actor}})},'@/lib/access/server':{userHasAccess:async(_s,_u,code)=>permissions.has(code.split('.').at(-1))}});
assert.equal((await server.inventoryAccess({})).permissions.issue,false);await assert.rejects(server.inventoryAccess({},'issue'),/FORBIDDEN/);permissions.add('issue');assert.equal((await server.inventoryAccess({},'issue')).permissions.issue,true);permissions.delete('view');await assert.rejects(server.inventoryAccess({},'issue'),/FORBIDDEN/);
console.log('PASS optional mapped size suggestions, no guessed mapping, unsized suggestion, formula-safe CSV and independent dynamic inventory permissions.');

// Catalogue pages products/balances in bulk, without loading issue history.
const catalogueCalls=[];
const catalogueService={from(table){let first=0,last=999;const query={select(){return query;},order(){return query;},range(a,b){first=a;last=b;return query;},then(resolve){catalogueCalls.push([table,first,last]);const count=table==='people_ppe_inventory_products'?1005:table==='v1_ppe_inventory_balances'?2505:0;return Promise.resolve({data:Array.from({length:Math.max(0,Math.min(last+1,count)-first)},(_,i)=>({id:String(first+i)})),error:null}).then(resolve);}};return query;}};
const catalogue=load('app/api/people/ppe/inventory/route.ts',{'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},'@/lib/people/ppe-inventory-server':{inventoryAccess:async()=>({service:catalogueService,permissions:{view:true}}),inventoryError:error=>{throw error;}},'@/lib/people/ppe-server':{}});
const result=await catalogue.GET({});assert.equal(result.body.products.length,1005);assert.equal(result.body.sizes.length,2505);assert.equal(catalogueCalls.length,6);assert.ok(!catalogueCalls.some(([table])=>table==='people_ppe_inventory_movements'));
// Actual history route uses bounded pages, applies product/person filters and redacts crews.
const historyCalls=[];let requestedCapability;
const historyService={from(table){assert.equal(table,'people_ppe_inventory_movements');const query={select(v){historyCalls.push(['select',v]);return query;},order(k,v){historyCalls.push(['order',k,v]);return query;},range(a,b){historyCalls.push(['range',a,b]);return query;},eq(k,v){historyCalls.push(['eq',k,v]);return query;},in(k,v){historyCalls.push(['in',k,v]);return query;},lte(k,v){historyCalls.push(['lte',k,v]);return query;},then(resolve){return Promise.resolve({data:[{id:'M',crew_label:'Private crew'}],error:null}).then(resolve);}};return query;}};
const historyRoute=load('app/api/people/ppe/inventory/history/route.ts',{'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},'@/lib/people/ppe-inventory-server':{inventoryAccess:async(_r,capability)=>{requestedCapability=capability;return {service:historyService,canSeeCrews:false};},inventoryError:error=>{throw error;}},'@/lib/people/ppe-server':{invalidPpe:message=>{throw Error(message);},uuidPattern:/^[0-9a-f-]{36}$/}});
const historyResult=await historyRoute.GET({nextUrl:{searchParams:new URLSearchParams({employee:people[1],product:actor,issues:'1',offset:'50',export:'1',before:'2026-10-28T00:00:00Z'})}});assert.equal(requestedCapability,'export');assert.equal(historyResult.body.rows[0].crew_label,'Crew not available');assert.ok(historyCalls.some(c=>c[0]==='range'&&c[1]===50&&c[2]===99));assert.ok(historyCalls.some(c=>c[0]==='eq'&&c[1]==='size.product_id'));assert.ok(historyCalls.some(c=>c[0]==='lte'&&c[1]==='created_at'));
console.log('PASS actual catalogue API handles 1,005 products/2,505 sizes with 6 bulk queries and no ledger N+1; actual history API paginates 50 rows, scopes employee/product, checks export permission and hides restricted crew labels.');

// Render actual forms: configurable product mapping and compact stock entry controls.
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const uiMocks={'react':React,'react/jsx-runtime':require('react/jsx-runtime'),'lucide-react':require('lucide-react'),'next/link':{default:({children,...props})=>React.createElement('a',props,children)},'@/lib/people/ppe':load('lib/people/ppe.ts')};
const views=load('components/people/ppe-register-views.tsx',uiMocks),dialog=load('components/people/ppe-inventory-dialog.tsx',{...uiMocks,'./ppe-register-views':views});
const stock=load('components/people/ppe-inventory-stock.tsx',{...uiMocks,'./ppe-register-views':views,'./ppe-inventory-dialog':dialog,'./ppe-client':{},'@/lib/people/ppe-inventory':model});
const productEditor=load('components/people/ppe-inventory-product.tsx',{...uiMocks,'./ppe-register-views':views,'./ppe-inventory-dialog':dialog,'./ppe-client':{}});
const data={products:[{id:'P',name:'Custom Hoodie',active:true,tracks_sizes:true,ppe_type_id:'T'}],sizes:[{id:'XL',product_id:'P',active:true,label:'XL',on_hand:10}],definitions:[{id:'T',name:'Jacket / Hoodie'}]};
const productHtml=renderToStaticMarkup(React.createElement(productEditor.InventoryProductEditor,{data,close(){},saved(){}}));assert.match(productHtml,/New Inventory Item/);assert.match(productHtml,/Optional PPE Size Mapping/);assert.match(productHtml,/Jacket \/ Hoodie/);assert.match(productHtml,/Low Stock Minimum/);
const receiptHtml=renderToStaticMarkup(React.createElement(stock.InventoryStockEditor,{data,kind:'receipt',close(){},saved(){}}));assert.match(receiptHtml,/Bulk Stock Receipt/);assert.match(receiptHtml,/Custom Hoodie/);assert.match(receiptHtml,/10 now/);
const issueHtml=renderToStaticMarkup(React.createElement(stock.InventoryStockEditor,{data,kind:'issue',close(){},saved(){}}));assert.match(issueHtml,/Single Person/);assert.match(issueHtml,/Bulk People/);assert.match(issueHtml,/PPE Pack/);assert.match(issueHtml,/Find active employees/);
console.log('PASS actual product/receipt/issue forms render configurable mapping, per-size entry, available quantity, searchable employee picker and all issue workflows.');
