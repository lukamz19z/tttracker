import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function load(file,mocks={}){const exports={};new Function("require","exports",ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{assert.ok(name in mocks,`Unexpected dependency ${name}`);return mocks[name];},exports);return exports;}
const cache=new Map(),files=new Map(),queue=[];let active=0,peak=0,failures=new Set(),downloads=0;
class LocalFile{constructor(uri){this.uri=typeof uri==="string"?uri:uri?.uri;this.exists=files.has(this.uri);this.size=files.get(this.uri)||0;}delete(){files.delete(this.uri);this.exists=false;}}
const db={getCache:async key=>cache.has(key)?{value:structuredClone(cache.get(key))}:null,setCache:async(key,value)=>cache.set(key,structuredClone(value)),removeCache:async key=>cache.delete(key),cacheEntriesWithPrefix:async prefix=>[...cache.entries()].filter(([key])=>key.startsWith(prefix)).map(([key,value])=>({key,value:structuredClone(value),updatedAt:"now"})),queueRows:async()=>queue};
const workspace={listRevisionWorkspaces:async()=>[]};
const fileModule={removeOfflineFile:async uri=>files.delete(uri)};
const api={downloadQualityFile:async id=>{active++;peak=Math.max(peak,active);downloads++;await new Promise(resolve=>setImmediate(resolve));active--;if(failures.has(id))throw Error("synthetic network failure");const uri=`doc://${id}`;files.set(uri,30_000);cache.set(`quality:preview:${id}`,uri);return uri;}};
const network={NetworkStateType:{WIFI:"WIFI",ETHERNET:"ETHERNET"},getNetworkStateAsync:async()=>({type:"WIFI"})};
const packs=load("mobile/lib/offline/quality-offline-packs.ts",{"expo-network":network,"expo-file-system":{File:LocalFile},"@/lib/api/quality":api,"./db":db,"./files":fileModule,"./revision-workspaces":workspace});

const detail=(count,photos)=>({revision:{id:"R",project_id:"P",source_type:"punchlist"},items:Array.from({length:count},(_,i)=>({id:`I${i}`,status:"Open",tower_segment:i%2?"Peak":"Body",source_type:"punchlist",issue_type_id:"bolt",operational_details:{existing_diameter:20,existing_length:80,required_diameter:20,required_length:100,quantity:2}})),files:Array.from({length:photos},(_,i)=>({id:`F${i}`,file_role:"before_photo",file_name:String(i)})).map(row=>({...row,file_name:`${row.id}.jpg`}))});

const supplied=detail(200,250);failures=new Set(["F9","F88"]);
let progress=[];let pack=await packs.prepareQualityOfflinePack({projectId:"P",revisionId:"R",detail:supplied,onProgress:row=>progress.push(row)});
assert.equal(pack.findings,200);assert.equal(pack.cachedFindings,200);assert.equal(pack.previews,250);assert.equal(pack.cachedPreviews,248);assert.equal(pack.status,"partial");assert.equal(pack.failedFileIds.length,2);assert.ok(peak<=3&&peak>1,"Preview downloads use bounded concurrency of three.");assert.ok(progress.some(row=>row.status==="preparing"));const cachedDetail=(await db.getCache("quality:revision:P:R")).value;assert.equal(cachedDetail.items.length,200);assert.equal(cachedDetail.items[0].operational_details.required_length,100,"offline metadata retains configured material details");
failures.clear();const beforeRetry=downloads;pack=await packs.prepareQualityOfflinePack({projectId:"P",revisionId:"R",detail:supplied,explicit:true});assert.equal(pack.status,"ready");assert.equal(pack.cachedPreviews,250);assert.equal(downloads-beforeRetry,2,"Retry downloads only missing previews");
const beforeDelta=downloads;pack=await packs.prepareQualityOfflinePack({projectId:"P",revisionId:"R",detail:detail(201,251),explicit:true});assert.equal(pack.findings,201);assert.equal(pack.cachedPreviews,251);assert.equal(downloads-beforeDelta,1,"Delta refresh fetches only the new preview");

await packs.saveQualityOfflineSettings("P",{maxCacheMb:8192,previewQuality:83,wifiOnly:true});assert.equal((await packs.qualityOfflineSettings("P")).previewQuality,83);assert.equal((await packs.offlineQualityStorage("P")).packs.length,1);
queue.push({id:"edit",kind:"quality_revision_item_update",payload:{projectId:"P",revisionId:"R"},status:"requires_reconciliation"});await assert.rejects(packs.removeSafeQualityOfflinePack("P","R"),/protected/);assert.equal((await packs.offlineQualityStorage("P")).packs.length,1,"unresolved queue work protects cache");queue.length=0;await packs.removeSafeQualityOfflinePack("P","R");assert.equal((await packs.offlineQualityStorage("P")).packs.length,0);assert.equal(files.size,0,"removal deletes durable preview files");

const offlineSettings=await packs.saveQualityOfflineSettings("P",{manualOnly:true});assert.equal(offlineSettings.manualOnly,true);const beforeManual=downloads;pack=await packs.prepareQualityOfflinePack({projectId:"P",revisionId:"R",detail:detail(202,252)});assert.equal(downloads,beforeManual,"manual-only mode prevents automatic preview download");const stored=await db.getCache("quality:revision:P:R");assert.equal(stored.value.items.length,202,"safe preview cleanup preserves the cached operational metadata");
console.log("PASS automatic offline metadata packs, bounded preview transfer, 200 FLIs/250 previews, visible progress, partial failure/retry, one-file delta refresh, configurable storage/preview/Wi-Fi/manual-only settings, safe cleanup protection and file-backed removal.");
