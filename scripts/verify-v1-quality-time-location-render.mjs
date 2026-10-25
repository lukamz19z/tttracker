import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url),ts=require('typescript');
function loader(mocks={},override={}) {const cache=new Map();return function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const source=override[file] ?? fs.readFileSync(file,'utf8');new Function('require','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>{if(name in mocks)return mocks[name];if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name)+'.ts');throw Error('Missing mock '+name)},exports);return exports;};}
const pure=loader(),time=pure('lib/quality/date-time.ts');
const instant='2026-10-25T05:19:23.123Z',zone='Australia/Sydney';
assert.equal(time.formatQualityDateTime(instant,zone),'25/10/2026 4:19 pm');
assert.equal(time.formatQualityDateTime('2026-07-25T06:19:00Z',zone),'25/07/2026 4:19 pm');
assert.equal(time.formatQualityDateTime(instant,'Australia/Brisbane'),'25/10/2026 3:19 pm');
assert.equal(time.canonicalCaptureTime('2026-10-25T16:19:23.123+11:00'),instant);
assert.equal(time.canonicalCaptureTime('2026-10-25 16:19'),null);
assert.equal(time.projectLocalCaptureTime('2026-10-25 16:19',zone),'2026-10-25T05:19:00.000Z');
assert.equal(time.projectLocalCaptureTime('2026-10-04 02:30',zone),null);
assert.equal(time.projectLocalCaptureTime('2026-02-30 16:19',zone),null);
assert.equal(time.captureTimeFromExif({DateTimeOriginal:'2026:10:25 16:19:23',OffsetTimeOriginal:'+11:00'},'UTC'),'2026-10-25T05:19:23.000Z');
assert.match(time.qualityCaptureLabel(null,zone,'2026-10-25T05:39:00Z'),/Recorded.*capture time unavailable/);
assert.equal(time.qualityCaptureLabel(instant,zone,'2026-10-25T05:39:00Z'),'25/10/2026 4:19 pm');
const layout=pure('lib/quality/evidence-layout.ts');assert.equal(layout.watermarkLines({phase:'BEFORE',capturedAt:instant,timeZone:zone}).at(-1),'25/10/2026 4:19 pm');
const sharp=require('sharp'),original=await sharp({create:{width:1200,height:900,channels:3,background:'#8ea7ba'}}).withExif({IFD2:{DateTimeOriginal:'2026:10:25 16:19:23',OffsetTimeOriginal:'+11:00'}}).jpeg().toBuffer();
assert.equal(pure('lib/quality/photo-capture.ts').imageCaptureTime(original,'UTC'),'2026-10-25T05:19:23.000Z');
const actualText=[],RealPdf=require('jspdf').jsPDF;
const renderer=loader({sharp:{default:sharp},'node:path':{default:path}})('lib/quality/evidence-watermark.ts');
const beforeBytes=await renderer.annotateEvidence(original,{phase:'BEFORE',project:'P-UGL-26-002',tower:'5C3/5C1-093',reference:'RECT-01',fli:'FLI-003',capturedAt:instant,timeZone:zone},'bottom-left');
const afterBytes=await renderer.annotateEvidence(original,{phase:'AFTER',project:'P-UGL-26-002',tower:'5C3/5C1-093',reference:'RECT-01',fli:'FLI-003',capturedAt:'2026-10-25T05:24:00Z',timeZone:zone},'bottom-right');
const pdf=loader({jspdf:{jsPDF:function(...args){const doc=new RealPdf(...args),text=doc.text;doc.text=function(value,...rest){actualText.push(value);return text.call(this,value,...rest)};return doc}}})('lib/quality/revision-pdf.ts');
const photo={id:'BEFORE',fileName:'BEFORE-01.jpg',mimeType:'image/jpeg',dataUrl:'data:image/jpeg;base64,'+beforeBytes.toString('base64'),capturedAt:instant};
const timePdf=pdf.generateRevisionPdf({projectName:'Time regression',projectNumber:'P-UGL-26-002',towerName:'5C3/5C1-093',fliNumber:'RECT-01',reportRevision:1,timeZone:zone,inspectionStage:'Post Erection',inspectionDate:'2026-10-25',generatedBy:'Test',generatedAt:'2026-10-25T05:39:00Z',items:[{itemNumber:3,itemReference:'FLI-003',issueType:'Issue',status:'Rectified',beforeTakenAt:'1990-01-01T00:00:00Z',beforePhotos:[photo],afterPhotos:[{...photo,id:'AFTER',dataUrl:'data:image/jpeg;base64,'+afterBytes.toString('base64'),capturedAt:'2026-10-25T05:24:00Z'}]}]});
if(process.argv.includes('--write-pdf')) {const target=path.join(require('node:os').tmpdir(),'tt-quality-capture-time.pdf');fs.writeFileSync(target,timePdf);console.log('PDF time fixture: '+target);}
assert.ok(actualText.flat().some(text=>String(text).includes('25/10/2026 4:19 pm')));assert.ok(actualText.flat().some(text=>String(text).includes('25/10/2026 4:24 pm')));assert.ok(!actualText.flat().some(text=>String(text).includes('1990')));
console.log('PASS UTC capture preserved across delayed sync; NSW AEDT/AEST, alternate project zone, invalid clocks, EXIF offsets, shared watermark label and honest legacy fallback.');
console.log('PASS real JPEG EXIF extraction and actual PDF text uses each photo capture instant, never stale item capture/upload/generated time.');
const location=pure('mobile/lib/offline/revision-location.ts');
let prefs={keepSegment:true,keepLeg:true,segment:'+10m Leg Extension',leg:'A'};
assert.deepEqual(location.nextFindingLocation(prefs),{towerSegment:'+10m Leg Extension',leg:'A'});
prefs=location.savedFindingLocation(prefs,'Body Extension 1','B');assert.deepEqual(location.nextFindingLocation(prefs),{towerSegment:'Body Extension 1',leg:'B'});
prefs=location.savedFindingLocation({...prefs,keepLeg:false},'Body Extension 1','B');assert.deepEqual(location.nextFindingLocation(prefs),{towerSegment:'Body Extension 1',leg:null});
assert.deepEqual(location.nextFindingLocation(),{towerSegment:'',leg:null});assert.deepEqual(Object.keys(location.nextFindingLocation(prefs)).sort(),['leg','towerSegment']);
const values=new Map(),storage={'@/lib/offline/db':{getCache:async key=>values.has(key)?{value:structuredClone(values.get(key))}:null,setCache:async(key,value)=>values.set(key,structuredClone(value))}};
let work=loader(storage)('mobile/lib/offline/revision-workspaces.ts');
let workspace=work.createLocalRevisionWorkspace({projectId:'P',towerId:'T',clientMutationId:'RECT-A',inspectionStage:'Post Erection',inspectionDate:'2026-10-25'});await work.saveRevisionWorkspace({...workspace,workingLocation:prefs});await work.saveRevisionWorkspace(workspace);
work=loader(storage)('mobile/lib/offline/revision-workspaces.ts');assert.deepEqual((await work.listRevisionWorkspaces('P'))[0].workingLocation,prefs);
const other=work.createLocalRevisionWorkspace({projectId:'P',towerId:'OTHER',clientMutationId:'RECT-B'});assert.equal(other.workingLocation,undefined);
console.log('PASS independent keep controls, latest saved segment/leg, no other fields retained, durable restart/stale-write protection, separate RECT starts blank.');
const db=new PGlite();try {await db.exec('create table projects(id uuid primary key);');const sql=fs.readFileSync('supabase/migrations/20261025160000_v1_project_quality_timezone.sql','utf8');await db.exec(sql);await db.exec(sql);await db.exec("insert into projects(id,timezone) values(gen_random_uuid(),'Australia/Sydney');");await assert.rejects(db.exec("insert into projects(id,timezone) values(gen_random_uuid(),'not/a-zone');"));}finally{await db.close();}
console.log('PASS additive/idempotent timezone migration; valid IANA zone accepted and invalid zone rejected.');

// Render actual Revisions list + shared shell/status components through JSX,
// rejecting every string/number outside a native Text ancestor.
let current='',cursor=0,scenario;
const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:Symbol('fragment')};
const react={useState:initial=>{const i=cursor++;return [current==='RevisionsScreenContent'?(scenario.state[i]??initial):initial,()=>{}]},useMemo:fn=>fn(),useCallback:fn=>fn,useEffect:()=>{},useRef:value=>({current:value})};
const native=Object.fromEntries(['Text','View','Pressable','TextInput','ScrollView','ActivityIndicator','RefreshControl'].map(key=>[key,key]));native.StyleSheet={create:value=>value};
const icons=new Proxy({},{get:()=>()=>null});
function makeScreen(source) {
 const mocks={'react':react,'react/jsx-runtime':jsx,'react-native':native,'react-native-safe-area-context':{SafeAreaView:'View'},'expo-router':{router:{}},'@react-navigation/native':{useFocusEffect:()=>{}},'lucide-react-native':icons,
 '@/contexts/SyncContext':{useSync:()=>scenario.sync},'@/contexts/QualityContext':{useQuality:()=>({data:scenario.data,loading:false,cachedAt:'2026-10-25T05:00:00Z',refreshing:false}),QualityProvider:({children})=>children},'@/contexts/AuthContext':{useAuth:()=>({profile:{}})},
 '@/lib/api/quality':{},'@/lib/offline/revision-deletions':{},'@/lib/offline/revision-workspaces':{},'@/components/common/AppFooter':{AppFooter:()=>null},'@/components/common/PermissionScreen':{PermissionScreen:({children})=>children}};
 const load=loader(mocks,source?{[path.resolve('mobile/app/(drawer)/revisions.tsx')]:source}:{});
 mocks['@/components/sync/SyncStatus']=load('mobile/components/sync/SyncStatus.tsx');
 mocks['@/components/quality/QualityShell']=load('mobile/components/quality/QualityShell.tsx');
 mocks['@/components/quality/QualityStatusPill']=load('mobile/components/quality/QualityStatusPill.tsx');
 return load('mobile/app/(drawer)/revisions.tsx').default;
}
function render(node,inText=false){if(node==null||typeof node==='boolean')return;if(Array.isArray(node)){node.forEach(child=>render(child,inText));return;}if(typeof node==='string'||typeof node==='number'){assert.ok(inText,`Raw native text: ${JSON.stringify(node)}`);return;}if(typeof node.type==='function'){const before=current;current=node.type.name;cursor=0;const child=node.type(node.props);current=before;render(child,inText);}else render(node.props?.children,inText||node.type==='Text');}
const Screen=makeScreen(),record={id:'S',revision_number:'RECT-01',tower_id:'T',status:'In Progress',inspection_date:'2026-10-25',itemCount:1};
for(const [name,failed,offline,server,query] of [['zero',0,false,true,''],['one',1,false,true,''],['multiple',2,false,true,''],['offline cached',0,true,false,''],['synced',0,false,true,''],['search empty',0,false,true,'unmatched']]) {
 scenario={data:{projectId:'P',project:{project_number:'P'},towers:[{id:'T',name:'Tower'}],workflow:{revisionStatuses:['In Progress']}},sync:{online:!offline,networkOnline:!offline,forcedOffline:offline,failedCount:failed,pendingCount:failed,syncing:false,lastError:failed?'Retryable error':null},state:[server?[record]:[],1,failed?'Refresh failed':null,'',query,'All',offline?[{routeKey:'local-RECT-A',towerId:'T',findings:[],cachedDetail:{revision:record,items:[]}}]:[]]};
 render({type:Screen,props:{}});console.log('PASS native text children: '+name);
}
const old=fs.readFileSync('mobile/app/(drawer)/revisions.tsx','utf8').replace(/\}\)\}\s+\{nextOffset/,'})}      {nextOffset');assert.throws(()=>render({type:makeScreen(old),props:{}}),/Raw native text/);
console.log('PASS regression proves the original inline six-space JSX node caused the native Text error.');
