// Controlled V2 Dev HTTP verification. Synthetic only; no raw secrets in output.
import {randomBytes,createHash} from "node:crypto";
import {createInterface} from "node:readline";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import fs from "node:fs";import path from "node:path";
const require=createRequire(import.meta.url);const ts=require("../../v2/node_modules/typescript");
function load(file){const exports={};new Function("exports","require",ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(exports,name=>load(path.join(path.dirname(file),name+".ts")));return exports;}
const {resumeOnboarding}=load("v2/lib/people/onboarding-client-session.ts");const {onboardingEmail}=load("v2/lib/people/onboarding-email.ts");
const token=randomBytes(32).toString("base64url");
console.log(JSON.stringify({fixture_token_hash:createHash("sha256").update(token).digest("hex")}));
await new Promise(resolve=>{const r=createInterface({input:process.stdin});r.once("line",()=>{r.close();resolve();});});
const origin="http://localhost:3001";let cookie="";let calls=[];
const fetcher=async(path,options={})=>{calls.push(path);const response=await fetch(origin+path,{...options,headers:{...options.headers,Origin:origin,...(cookie?{Cookie:cookie}:{})}});const set=response.headers.get("set-cookie");if(set){assert.match(set,/HttpOnly/i);assert.match(set,/SameSite=Strict/i);assert.match(set,/Path=\/api\/onboarding\/security/i);cookie=set.split(";")[0];}return response;};
const email=onboardingEmail({organisation:"Synthetic UX Verification",title:"Synthetic Low Risk",url:origin+"/secure-onboarding#token="+token});const link=new URL(email.match(/href="([^"]+)"/)[1]);
const shell=await fetch(link);assert.equal(shell.status,200);assert.ok((await shell.text()).includes("Secure onboarding"));
let removed=false;const data=await resumeOnboarding(fetcher,link,()=>{link.hash="";removed=true;});assert.equal(removed,true);assert.equal(data.title,"Synthetic Low Risk");assert.ok(cookie);assert.equal(calls[0],"/api/onboarding/security/exchange");
let response=await fetcher("/api/onboarding/security/workflow",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save",field:"name",value:"Synthetic Worker"})});assert.equal(response.ok,true);
const resumed=await resumeOnboarding(fetcher,link,()=>assert.fail("refresh must not exchange"));assert.equal(resumed.answers.name,"Synthetic Worker");
response=await fetcher("/api/onboarding/security/workflow",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"submit"})});assert.equal(response.ok,true);assert.equal((await response.json()).status,"submitted");
const reuse=await fetcher("/api/onboarding/security/exchange",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})});assert.equal((await reuse.json()).error,"ONBOARDING_LINK_USED");
for(const path of ["/api/people?organisation=ee000000-0000-4000-8000-000000000001","/api/projects","/api/platform/organisations"]){const denied=await fetcher(path,{redirect:"manual"});assert.ok(!denied.ok || (denied.status>=300 && denied.status<400));}
console.log("PASS: generated email CTA, actual shell, fragment POST, HttpOnly cookie, draft save, refresh resume, submission, one-time retry and internal API denial");
