import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
const dependency = createRequire(import.meta.url);
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const ts = dependency(path.join(root, "v2/node_modules/typescript"));
function load(file, mocks) {
  const exports = {};
  const code = ts.transpileModule(
    fs.readFileSync(path.join(root, file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2020,
      },
    },
  ).outputText;
  new Function("require", "exports", code)((name) => {
    if (name in mocks) return mocks[name];
    if(name==='./person-avatar')return {PersonAvatar:'person-avatar'};
    if(name==='./person-photo-panel')return {PersonPhotoPanel:'person-photo-panel'};
    if(name==='./people-ui')return {BackLink:'back-link',PeopleDateInput:'date-input'};
    if(name==='@/components/integrations/person-xero')return {PersonXero:'person-xero'};
    if(name==='@/components/documents/document-preview')return {DocumentPreview:'document-preview'};
    if(name==='@/components/documents/document-storage-status')return {DocumentStorageStatus:'document-storage-status'};
    if(name==='./training-editor-content')return {TrainingClassSelection:'training-classes',TrainingFileRules:'file-rules'};
    if(name==='./configuration-surface')return {ConfigurationSurface:'configuration-surface'};
    if(name==='./token-input')return {TokenInput:'token-input',validateTemplate:()=>{}};
    if(name==='./training-catalogue')return {TrainingCatalogue:'catalogue',TrainingTypeOptions:'class-editor'};
    if(name.startsWith('@/lib/people/'))return load('v2/'+name.slice(2)+'.ts',mocks);
    if(name==='./people-controls')return load('v2/components/people/people-controls.tsx',mocks);
    if(name==='./people-operations')return {PeopleOperationsPanel:'operations',TrainingUpload:'training-upload',PrivateDomains:'private-domains',TrainingHistory:'training-history'};
    if(name==='./onboarding-admin')return {OnboardingPanel:'onboarding'};
    if(name==='./people-document-naming')return {PeopleDocumentNaming:'people-document-naming'};
    if(name==='@/components/workspace/workspace-navigation'){
      return {
        WorkspaceHeading:"workspace-heading",
        WorkspaceTabs:"workspace-tabs",
        ContextTabs:"context-tabs",
        ConfigurationLayout:"configuration-layout",
        Breadcrumbs:"breadcrumbs",
        PageHeading:"page-heading",
      };
    }
    if (name.endsWith(".module.css"))
      return { default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name === "next/link") return { default: "a" };
    if (name === "lucide-react") return new Proxy({}, { get: (_, key) => key });
    if (name === "@/components/materials/workflow-controls")
      return { MaterialsSearch: "search" };
    if (name === "@/components/integrations/document-template-builder")
      return { DocumentTemplateBuilder: "document-template-builder" };
    if (name === "@/lib/integrations/resolver")
      return { contextTokens: { training: ["employee_number", "person_display_name", "training_type", "training_category", "training_option", "document_side", "issue_date", "expiry_date"] } };
    if (name === "react/jsx-runtime")
      return {
        jsx: (type, props) => ({ type, props }),
        jsxs: (type, props) => ({ type, props }),
        Fragment: "fragment",
      };
    throw new Error("Unexpected dependency: " + name);
  }, exports);
  return exports;
}
function nodes(tree, type) {
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, type));
  if (!tree || typeof tree !== "object") return [];
  return [
    ...(tree.type === type ? [tree] : []),
    ...nodes(tree.props?.children, type),
  ];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join(" ");
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (!tree || typeof tree !== "object") return "";
  return text(tree.props?.children);
}
function harness(props, result = { rows: [], total: 0 }) {
  const cells = [],
    effects = [],
    timers = [];
  let cursor = 0;
  const requests = [];
  const oldFetch = globalThis.fetch,
    oldWindow = globalThis.window;
  globalThis.window = {
    setTimeout: (fn) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimeout: () => {},
    confirm: () => true,
  };
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), ...options });
    return {
      ok: true,
      json: async () =>
        options.method === "POST"
          ? { id: "created" }
          : String(url).includes("area=profile")
            ? {
                rows: [
                  {
                    id: "person",
                    display_name: "Person One",
                    employment_status: "active",
                    account_status: "No TTTracker account",
                  },
                ],
              }
            : result,
    };
  };
  const same = (a, b) =>
    a && b && a.length === b.length && a.every((v, i) => v === b[i]);
  const react = {
    useState: (initial) => {
      const i = cursor++;
      if (!(i in cells))
        cells[i] = typeof initial === "function" ? initial() : initial;
      return [
        cells[i],
        (next) => {
          cells[i] = typeof next === "function" ? next(cells[i]) : next;
        },
      ];
    },
    useRef: (initial) => {
      const i = cursor++;
      if (!(i in cells)) cells[i] = { current: initial };
      return cells[i];
    },
    useCallback: (fn, deps) => {
      const i = cursor++;
      if (!same(cells[i]?.deps, deps)) cells[i] = { deps, fn };
      return cells[i].fn;
    },
    useEffect: (fn, deps) => {
      const i = cursor++;
      if (!same(cells[i]?.deps, deps)) {
        cells[i] = { deps };
        effects.push(fn);
      }
    },
    useId: () => "picker",
  };
  const component = load("v2/components/people/people-client.tsx", {
    react,
  }).default;
  return {
    render() {
      cursor = 0;
      return component({
        organisationId: "org",
        organisationName: "Neutral Organisation",
        permissions: { "people.view": true },
        ...props,
      });
    },
    async prepare() {
      this.render();
      effects.splice(0).forEach((fn) => fn());
      timers.splice(0).forEach((fn) => fn());
      await new Promise((resolve) => setImmediate(resolve));
    },
    requests,
    cleanup() {
      globalThis.fetch = oldFetch;
      globalThis.window = oldWindow;
    },
  };
}
test("People navigation remains organisation-level with no project sidebar", async () => {
  const h = harness({
    section: "people",
    permissions: {
      "people.view": true,
      "people.crews.view": true,
      "training.view": true,
      "training.approve": true,
      "people.site_prestarts.view": true,
    },
  });
  try {
    await h.prepare();
    const tree = h.render();
    assert.equal(nodes(tree,"workspace-heading")[0].props.title,"People");
    assert.deepEqual(nodes(tree,"workspace-tabs")[0].props.items.map(item=>item.label),["Overview","Employee Register","Crews","Training","Site Prestarts"]);
    assert.equal(nodes(tree,"workspace-tabs")[0].props.label,"People navigation");
    assert.doesNotMatch(text(tree), /Project navigation|Module foundation/);
  } finally {
    h.cleanup();
  }
});
test("reviewer-only role sees Review without People private administration", async () => {
  const h = harness({
    section: "review",
    permissions: { "training.approve": true },
  });
  try {
    await h.prepare();
    const tree = h.render();
    const links = nodes(tree,"workspace-tabs")[0].props.items;
    const contextLinks = nodes(tree,"context-tabs")[0].props.items;
    assert.ok(links.map(item=>item.label).includes("Training"));
    assert.ok(!links.map(item=>item.label).includes("Employee Register"));
    assert.ok(contextLinks.map(item=>item.label).includes("Review / Approvals"));
    assert.doesNotMatch(
      text(tree),
      /Private|Confidential|Add record|Add Person/,
    );
  } finally {
    h.cleanup();
  }
});
test("Training Register Add Record mounts the canonical TrainingUpload workflow", async () => {
  const permissions = { "training.view": true, "training.create": true };
  for (const personId of [undefined, "person-1"]) {
    const h = harness({ section: "training", personId, permissions });
    try {
      await h.prepare();
      const button = nodes(h.render(), "button").find((item) => text(item).includes("Add Record"));
      assert.ok(button, "the permitted Training Register action is rendered");
      assert.equal(button.props.type, "button");
      button.props.onClick();
      const tree = h.render();
      const dialog = nodes(tree, "section").find((item) => item.props.role === "dialog");
      assert.ok(dialog, "the Add Training drawer is mounted after click");
      const upload = nodes(dialog, "training-upload")[0];
      assert.ok(upload, "the canonical TrainingUpload component is mounted in the drawer");
      assert.equal(upload.props.organisation, "org");
      assert.equal(upload.props.personId, personId);
      assert.equal(typeof upload.props.onSaved, "function");
    } finally {
      h.cleanup();
    }
  }
});
test("register renders compact rows with explicit no-account status", async () => {
  const h = harness(
    { section: "people" },
    {
      rows: [
        {
          id: "person",
          display_name: "Person One",
          position: "Rigger",
          account_status: "No TTTracker account",
          employment_status: "active",
        },
      ],
      total: 1,
    },
  );
  try {
    await h.prepare();
    const tree = h.render();
    assert.equal(nodes(tree, "table").length, 1);
    assert.match(text(tree), /Person One/);
    assert.match(text(tree), /No TTTracker account/);
    assert.equal(nodes(tree, "search").length, 1);
    assert.ok(
      nodes(tree, "a").some((link) =>
        String(link.props.href).includes("/workspace/people/person"),
      ),
    );
  } finally {
    h.cleanup();
  }
});
test("create action hidden without capability and visible when permitted", async () => {
  for (const create of [false, true]) {
    const h = harness({
      section: "people",
      permissions: { "people.view": true, "people.create": create },
    });
    try {
      await h.prepare();
      assert.equal(
        nodes(h.render(), "button").some((button) =>
          text(button).includes("Add Person"),
        ),
        create,
      );
    } finally {
      h.cleanup();
    }
  }
});
test("Add Person does not require TTTracker user; link option is separately permissioned", async () => {
  const h = harness({
    section: "people",
    permissions: {
      "people.view": true,
      "people.create": true,
      "organisation.users.configure": true,
    },
  });
  try {
    await h.prepare();
    nodes(h.render(), "button")
      .find((button) => text(button).includes("Add Person"))
      .props.onClick();
    const form = nodes(h.render(), "form");
    assert.equal(form.length, 0);
    const tree = h.render();
    const editor = (function find(node){if(Array.isArray(node))return node.map(find).find(Boolean);if(!node||typeof node!=="object")return undefined;return typeof node.type === "function" && node.props.heading ? node : find(node.props?.children);})(tree);
    assert.match(editor.props.heading, /no account required/);
    const user = editor.props.fields.find((field) => field.key === "user_id");
    assert.ok(user);
    assert.equal(user.required, undefined);
  } finally {
    h.cleanup();
  }
});
test("search uses server-side query and resets pagination", async () => {
  const h = harness({ section: "people" }, { rows: [], total: 45 });
  try {
    await h.prepare();
    nodes(h.render(), "search")[0].props.onChange({
      target: { value: "Person One" },
    });
    await h.prepare();
    assert.ok(
      h.requests.some(
        (request) =>
          request.url.includes("q=Person+One") &&
          request.url.includes("page=1"),
      ),
    );
  } finally {
    h.cleanup();
  }
});
test("pagination uses scoped API page rather than loading entire register", async () => {
  const h = harness(
    { section: "people" },
    { rows: [{ id: "one", display_name: "One" }], total: 45 },
  );
  try {
    await h.prepare();
    nodes(h.render(), "button")
      .find((button) => text(button).includes("Next"))
      .props.onClick();
    await h.prepare();
    assert.ok(h.requests.some((request) => request.url.includes("page=2")));
  } finally {
    h.cleanup();
  }
});
test("overview contains real metrics only and no invented onboarding count", async () => {
  const h = harness(
    { section: "overview" },
    {
      active_people: 12,
      active_crews: null,
      pending_review: null,
      training_attention: null,
    },
  );
  try {
    await h.prepare();
    const content = text(h.render());
    assert.match(content, /Active People 12/);
    assert.doesNotMatch(
      content,
      /Active crews|Pending onboarding|Training requiring attention/,
    );
  } finally {
    h.cleanup();
  }
});
test("person profile uses distinct section links and hides classified areas without grants", async () => {
  const h = harness({
    personId: "person",
    section: "profile",
    permissions: {
      "people.view": true,
      "training.view": true,
      "people.crews.view": true,
      "people.site_prestarts.view": true,
    },
  });
  try {
    await h.prepare();
    const tree=h.render();
    const content = text(tree);
    assert.match(content, /Employment \/ Engagement/);
    const profile=nodes(tree,"context-tabs")[0].props.items.map(item=>item.label).join(" ");
    assert.match(profile,/Projects Crews Documents Site Prestarts Access/);
    assert.equal(nodes(tree,"workspace-tabs")[0].props.items.find(item=>item.label==="Employee Register").active,true);
    assert.doesNotMatch(content, /Private|Confidential/);
    assert.equal(nodes(h.render(), "details").length, 0);
  } finally {
    h.cleanup();
  }
});
test("onboarding opens the canonical operational register", async () => {
  const h = harness({
    section: "onboarding",
    permissions: { "people.onboarding.view": true },
  });
  try {
    await h.prepare();
    assert.equal(nodes(h.render(),"onboarding").length,1);
    assert.equal(nodes(h.render(), "form").length, 0);
  } finally {
    h.cleanup();
  }
});
test("People API takes organisation identity from verified workspace context", async () => {
  const calls = [];
  const api = load("v2/app/api/people/route.ts", {
    "next/server": {
      NextResponse: { json: (data, options) => ({ data, ...options }) },
    },
    "next/navigation": { unstable_rethrow: () => {} },
    "@/lib/people/server": {
      requirePeopleContext: async () => ({
        organisation: { organisationId: "verified-org" },
      }),
      peopleRead: () => {},
      peopleError: () => ({ status: 403, error: "PEOPLE_PERMISSION_DENIED" }),
    },
    "@/lib/supabase/server": {
      createSupabaseServer: async () => ({
        rpc: async (name, args) => {
          calls.push({ name, args });
          return { data: { id: "person" }, error: null };
        },
      }),
    },
    "@/lib/supabase/admin": { createSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq() { return this; }, maybeSingle: async () => ({ data: null, error: null }) }), update: () => ({ eq() { return this; }, select: () => ({ maybeSingle: async () => ({ data: { id: "record" }, error: null }) }) }), insert: async () => ({ error: null }) }) }) },
  });
  await api.POST({
    json: async () => ({
      organisation: "browser-org",
      action: "create_person",
      data: { display_name: "Person One", actor_id: "spoofed" },
    }),
  });
  assert.equal(calls[0].args.p_organisation_id, "verified-org");
  assert.equal(calls[0].args.p_actor, undefined);
});

test("Training Configuration renders once with People/Training navigation and no duplicated overview links",async()=>{
 const h=harness({settings:true,from:"training",section:"training_types",permissions:{"training.configure":true,"people.configure":true}},{rows:[{id:"type",name:"Ticket",category:"Configured Group",validity_mode:"automatic",validity_months:12,document_requirement:"front_back",review_policy:"trusted",is_active:true}],total:1});
 try{await h.prepare();const tree=h.render();assert.equal(nodes(tree,"workspace-heading")[0].props.title,"People");assert.equal(nodes(tree,"workspace-tabs").length,1);assert.equal(nodes(tree,"context-tabs").length,1);assert.equal(nodes(tree,"breadcrumbs").length,0);assert.equal(nodes(tree,"context-tabs")[0].props.label,"Training navigation");assert.equal(nodes(tree,"configuration-layout").length,1);assert.equal(nodes(tree,"page-heading").filter(node=>node.props.title==="Training Configuration").length,1);assert.deepEqual(nodes(tree,"configuration-layout")[0].props.items.map(item=>item.label),["Overview","Categories","Options / Classes","Tickets / Training Types","Document Rules","File Naming"]);assert.doesNotMatch(text(tree),/Employment \/ Engagement Types|Onboarding Templates/);assert.match(text(tree),/12 months/);assert.match(text(tree),/Front \+ back/);assert.match(text(tree),/Trusted Submitter May Confirm/);assert.match(text(tree),/Add Training Type/);}finally{h.cleanup();}
});
test("Training Configuration Overview reports status without repeating sidebar navigation",()=>{
 const source=fs.readFileSync(path.join(root,"v2/components/people/people-client.tsx"),"utf8");
 const overview=source.slice(source.indexOf("function TrainingConfigurationOverview"));
 assert.match(overview,/Configuration status/);assert.match(overview,/Needs Attention/);assert.match(overview,/Training Types/);assert.match(overview,/Document Storage/);assert.doesNotMatch(overview,/>Manage<\/span>/);assert.doesNotMatch(overview,/section=training_categories|section=training_options|section=training_types|section=file_naming/);
 assert.doesNotMatch(source,/styles\.moduleHeading/);
});
test("Training Configuration tables use compact actions and clearly label linked qualifications",()=>{
 const source=fs.readFileSync(path.join(root,"v2/components/people/people-client.tsx"),"utf8");
 const catalogue=fs.readFileSync(path.join(root,"v2/components/people/training-catalogue.tsx"),"utf8");
 const naming=fs.readFileSync(path.join(root,"v2/components/people/people-document-naming.tsx"),"utf8");
 const css=fs.readFileSync(path.join(root,"v2/components/people/people.module.css"),"utf8");
 assert.match(source,/trainingTypeConfigurationTable/);assert.match(source,/linkedQualificationBadge/);assert.match(source,/Linked: <LinkedCaption/);assert.match(source,/More actions for \$\{value\(row, "name"\)\}/);assert.match(source,/Link qualification/);assert.match(source,/Remove link: <LinkedCaption/);assert.match(source,/\(\(row\.linked_types \?\? \[\]\) as string\[\]\)\.length > 0/);
 assert.match(catalogue,/styles\.configurationTable/);assert.match(catalogue,/styles\.configurationRowAction/);assert.match(naming,/styles\.configurationTable/);assert.match(naming,/styles\.configurationRowAction/);
 assert.match(css,/\.page button\.configurationRowAction/);assert.match(css,/\.trainingTypeRowActions/);assert.match(css,/\.linkedQualificationBadge/);assert.match(css,/\.trainingTypeMoreMenu/);assert.match(css,/min-height:\s*30px/);assert.match(css,/trainingTypeToolbar/);
});
test("People Settings navigation links to dedicated configuration without catalogue tabs",async()=>{
 const h=harness({settings:true,section:"types",permissions:{"training.configure":true,"people.configure":true}});
 try{await h.prepare();const tree=h.render();assert.equal(nodes(tree,"workspace-tabs")[0].props.label,"People navigation");const nav=nodes(tree,"context-tabs")[0];assert.equal(nav.props.label,"People settings navigation");assert.ok(nav.props.items.some(link=>link.href.includes("/training/configuration")));}finally{h.cleanup();}
});

test("People Settings is a permission-gated workspace action and Person Training stays in the profile shell",async()=>{
 const allowed=harness({section:"matrix",permissions:{"people.view":true,"training.view":true,"people.configure":true}});
 const denied=harness({section:"matrix",permissions:{"people.view":true,"training.view":true}});
 const person=harness({personId:"person",section:"training",permissions:{"people.view":true,"training.view":true,"people.configure":true}});
 try {
  await allowed.prepare();await denied.prepare();await person.prepare();
  const allowedTree=allowed.render(),deniedTree=denied.render(),personTree=person.render();
  assert.equal(nodes(allowedTree,"a").filter(link=>String(link.props.href).includes("/workspace/settings/people")).length,1);
  assert.equal(nodes(deniedTree,"a").some(link=>String(link.props.href).includes("/workspace/settings/people")),false);
  assert.equal(nodes(personTree,"context-tabs").some(nav=>nav.props.label==="Training navigation"),false);
 } finally {allowed.cleanup();denied.cleanup();person.cleanup();}
});


test("Training Type editor owns Options / Classes and keeps conditional validity", async()=>{
 const h=harness({settings:true,from:"training",section:"training_types",permissions:{"training.configure":true,"people.configure":true}});
 try {await h.prepare();nodes(h.render(),"button").find(button=>text(button).includes("Add Training Type")).props.onClick();const editor=(function find(node){if(Array.isArray(node))return node.map(find).find(Boolean);if(!node||typeof node!=="object")return;return typeof node.type==="function"&&node.type.name==="Editor"?node:find(node.props?.children);})(h.render());assert.equal(editor.props.surface,"medium");assert.equal(editor.props.saveLabel,"Save Training Type");assert.equal(editor.props.heading,"New Training Type");assert.equal(editor.props.fields.find(f=>f.key==="category_id").required,true);const months=editor.props.fields.find(f=>f.key==="validity_months");assert.equal(months.visible({validity_mode:"automatic"}),true);assert.equal(months.visible({validity_mode:"never"}),false);assert.equal(editor.props.fields.find(f=>f.key==="renewal_lead_days").visible({validity_mode:"never"}),false);assert.deepEqual(editor.props.fields.find(f=>f.key==="option_selection_mode").options,["none","single","multiple"]);assert.deepEqual(editor.props.fields.find(f=>f.key==="option_evidence_mode").options,["shared","separate"]);const classes=editor.props.sectionContent("Options / Classes",{option_definitions:[{id:"class",code:"DG",name:"Dogging"}]},()=>{});assert.deepEqual(classes.props.definitions,[{id:"class",code:"DG",name:"Dogging"}]);assert.match(text(editor.props.sectionContent("Review",{review_policy:"trusted"},()=>{})),/employee, mobile and onboarding/);} finally {h.cleanup();}
});

test("Training Type Add action is hidden without Training configuration permission", async()=>{
 const h=harness({settings:true,from:"training",section:"training_types",permissions:{"training.configure":false,"people.configure":true}});
 try {await h.prepare();assert.equal(nodes(h.render(),"button").some(button=>text(button).includes("Add Training Type")),false);} finally {h.cleanup();}
});

test("Training upload retry displays saved Person and Training Type labels",()=>{
 const source=fs.readFileSync(path.join(root,"v2/components/people/people-operations.tsx"),"utf8");
 const retry=source.slice(source.indexOf("export function TrainingUpload("),source.indexOf("async function stableTrainingDocumentId"));
 assert.match(retry,/draft\?\.display_name/);assert.match(retry,/draft\?\.training_type/);
 assert.match(retry,/<strong>1\. Person<\/strong>/);assert.match(retry,/<strong>2\. Training Type<\/strong>/);
 assert.match(retry,/onSelect=\{\(row\) => \{ setPersonName/);assert.match(retry,/onSelect=\{\(row\) => setTypeName/);
 assert.doesNotMatch(retry,/Selected record/);
});
