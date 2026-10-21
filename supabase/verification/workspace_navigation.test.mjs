import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const dependency = createRequire(import.meta.url);
import { test  } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const ts = dependency(path.join(root,"v2/node_modules/typescript"));
const React = dependency(path.join(root,"v2/node_modules/react"));
const { renderToStaticMarkup } = dependency(path.join(root,"v2/node_modules/react-dom/server"));
let pathname = "/workspace";
function load(file, mocks = {}) {
 const source = ts.transpileModule(fs.readFileSync(path.join(root,file),"utf8"), { compilerOptions:{ module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020 } }).outputText;
 const exp = {};
 new Function("require","exports",source)((name) => {
  if (name in mocks) return mocks[name];
  if (name === "server-only") return {};
  if (name.endsWith(".module.css")) return { default:new Proxy({}, { get:(_,key) => String(key) }) };
  if (name === "react") return React;
  if (name === "react/jsx-runtime") return dependency(path.join(root,"v2/node_modules/react/jsx-runtime"));
  if (name === "next/image") return dependency(path.join(root,"v2/node_modules/next/image"));
  if (name === "next/link") return { default:({ children,...props }) => React.createElement("a",props,children) };
  if (name === "next/navigation") return { usePathname:() => pathname,useRouter:() => ({}),notFound:() => { throw Error("NOT_FOUND"); },redirect:(href) => { throw Error(`REDIRECT:${href}`); } };
  if (name === "@/lib/supabase/browser") return { createSupabaseBrowser:() => ({}) };
  if (name === "lucide-react") return new Proxy({}, { get:(_,key) => () => React.createElement("svg",{"data-icon":key}) });
  if (name.startsWith("@/")) return load(`v2/${name.slice(2)}${name.includes("components/")?".tsx":".ts"}`,mocks);
  throw Error(`Unexpected import ${name}`);
 },exp);
 return exp;
}
const org={ organisationId:"org-a",organisationName:"Neutral Organisation",organisationCode:"ORG" };
const sections=[{key:"workspace_home",label:"Home",routeSegment:"",moduleKey:null},{key:"workspace_projects",label:"Projects",routeSegment:"projects",moduleKey:"projects"}];
const shell=load("v2/components/workspace/app-shell.tsx").default;
const markup=(props={}) => renderToStaticMarkup(React.createElement(shell,{organisation:org,memberships:[org],sections,email:"user@example.test",...props}));
const nav=load("v2/lib/workspace/navigation.ts");
test("organisation identity and global destinations remain visible",() => {
 const html=markup();assert.match(html,/Neutral Organisation/);assert.match(html,/Global navigation/);assert.match(html,/Home/);assert.match(html,/Projects/);assert.match(html,/Personal account/);assert.doesNotMatch(html,/Project navigation/);
});
test("Account keeps global navigation and the same acting organisation",() => {
 pathname="/account";const html=markup();assert.match(html,/workspace\?organisation=org-a/);assert.match(html,/Projects/);assert.match(html,/account\?organisation=org-a/);
});
test("Settings keeps global navigation without a project sidebar",() => {
 pathname="/workspace/settings";assert.match(markup(),/Global navigation/);assert.doesNotMatch(markup(),/Project navigation/);
});
test("project content retains global navigation and project-only sidebar",() => {
 pathname="/workspace/projects/project-a/materials";
 const project=load("v2/components/projects/project-shell.tsx").default;
 const html=markup({children:React.createElement(project,{organisationId:"org-a",projectId:"project-a",projectName:"Neutral Project",projectNumber:"P-001",sections:[{key:"materials",label:"Materials",routeSegment:"materials"}]},"content")});
 assert.equal((html.match(/<header/g)||[]).length,1);
 assert.equal((html.match(/aria-label="Global navigation"/g)||[]).length,1);
 assert.match(html,/Global navigation/);assert.match(html,/Project navigation/);assert.match(html,/Neutral Project/);
 pathname="/workspace";assert.doesNotMatch(markup(),/Project navigation/);
});
test("disabled module is hidden even with permission",() => assert.equal(nav.canShowWorkspaceSection({key:"workspace_assets",moduleKey:"assets"},new Set(),{"assets.view":true}),false));
test("enabled module requires its dynamic view capability",() => {
 assert.equal(nav.canShowWorkspaceSection({key:"workspace_people",moduleKey:"people"},new Set(["people"]),{}),false);
 assert.equal(nav.canShowWorkspaceSection({key:"workspace_people",moduleKey:"people"},new Set(["people"]),{"people.view":true}),true);
});
test("Settings requires organisation settings permission",() => assert.equal(nav.canShowWorkspaceSection({key:"workspace_settings",moduleKey:null},new Set(),{}),false));
test("only canonical platform authority exposes platform entry",() => {
 assert.doesNotMatch(markup(),/>Platform Admin</);assert.match(markup({platformAdmin:true}),/>Platform Admin</);
});
test("party shell has client identity and only shared-project destinations",() => {
 const html=markup({contextKind:"client",sections});assert.match(html,/Client workspace/);assert.match(html,/Projects/);assert.doesNotMatch(html,/>Settings</);assert.doesNotMatch(html,/>People</);
});
test("organisation switching leaves project and targets selected workspace",() => {
 const other={...org,organisationId:"org-b",organisationName:"Other Workspace"};const html=markup({memberships:[org,other]});
 assert.match(html,/Search organisations/);assert.match(html,/workspace\?organisation=org-b/);assert.doesNotMatch(html,/projects\/project-a\?organisation=org-b/);
});
test("platform console is distinct, has return flow and denies non-platform users",async () => {
 const mocks={"next/headers":{cookies:async () => ({get:() => ({value:"org-a"})})},"@/lib/platform/server":{requirePlatformAdmin:async () => ({})}};
 const platform=load("v2/app/platform-admin/layout.tsx",mocks).default;
 const html=renderToStaticMarkup(await platform({children:"console"}));assert.match(html,/TTTracker Platform/);assert.match(html,/Back to workspace/);assert.match(html,/href="\/workspace"/);assert.doesNotMatch(html,/Project navigation/);
 mocks["@/lib/platform/server"]={requirePlatformAdmin:async () => {throw Error("FORBIDDEN");}};
 await assert.rejects(load("v2/app/platform-admin/layout.tsx",mocks).default({children:"secret"}),/NOT_FOUND/);
});
test("workspace frame does not treat platform authority as tenant access",async () => {
 const mocks={"@/lib/projects/list-context":{requireProjectListContext:async () => {throw Error("NO_ACTIVE_ORGANISATION_MEMBERSHIP");}},"@/lib/platform/server":{isPlatformAdmin:async () => true},"@/lib/supabase/server":{createSupabaseServer:async () => ({auth:{getClaims:async () => ({data:{claims:{sub:"platform-user"}}})}})},"./app-shell":{default:shell}};
 const Frame=load("v2/components/workspace/workspace-frame.tsx",mocks).default;
 const html=renderToStaticMarkup(await Frame({children:"secret tenant data"}));assert.doesNotMatch(html,/secret tenant data/);assert.match(html,/Platform Admin/);assert.match(html,/No active organisation/);
 const personal=renderToStaticMarkup(await Frame({children:"personal controls",personal:true}));assert.match(personal,/personal controls/);
});

function homeContext(overrides={}) {
 return {organisation:org,projectOnly:false,sections,enabledModules:new Set(["projects"]),permissions:{},...overrides};
}
async function home(overrides={},projects=[]) {
 const page=load("v2/app/workspace/page.tsx",{
  "@/lib/projects/list-context":{requireProjectListContext:async()=>homeContext(overrides)},
  "@/lib/projects/list":{listAccessibleProjects:async()=>projects},
 }).default;
 return renderToStaticMarkup(await page({searchParams:Promise.resolve({organisation:"org-a"})}));
}
test("Home register shows only accessible canonical project links and actual fields",async()=>{
 const html=await home({},[{id:"p",name:"Allowed project",code:"P-001",project_number:null,status:"active",href:"/workspace/projects/p?organisation=org-a",party:false}]);
 assert.match(html,/Allowed project/);assert.match(html,/P-001/);assert.match(html,/active/);assert.match(html,/workspace\/projects\/p/);
 assert.doesNotMatch(html,/New project/);
});
test("Home New project requires permission and enabled Projects module",async()=>{
 assert.match(await home({permissions:{"projects.create":true}}),/New project/);
 assert.doesNotMatch(await home({permissions:{"projects.create":true},enabledModules:new Set()}),/New project/);
});
test("foundation shortcuts have useful wording without fabricated metrics",async()=>{
 const html=await home({sections:[...sections,{key:"workspace_people",label:"People",routeSegment:"people"},{key:"workspace_assets",label:"Assets",routeSegment:"assets"}]});
 assert.match(html,/Open People/);assert.match(html,/Open Assets/);assert.doesNotMatch(html,/foundation|People 0|Assets 0/);
});
test("Home hides unpermitted module shortcuts",async()=>{
 assert.doesNotMatch(await home(),/Open People|Open Assets|Open Settings/);
});
test("client Home has no tenant settings or project creation actions",async()=>{
 const html=await home({projectOnly:true,permissions:{"projects.create":true},sections:[...sections,{key:"workspace_settings",label:"Settings",routeSegment:"settings"}]});
 assert.match(html,/Client workspace/);assert.doesNotMatch(html,/New project|Open Settings/);
});
