import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const dependency = createRequire(import.meta.url);
import { test  } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ts = dependency(path.join(root, "v2/node_modules/typescript"));
function layout(file, projectId, denied = false) {
  const calls = [];
  const workspace = { organisation: { organisationId: "participant" }, memberships: [], sections: [], email: "test", projectOnly: true };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  new Function("require", "exports", code)((name) => {
    if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }) };
    if (name === "next/headers") return { headers: async () => ({ get: (key) => key === "x-tttracker-project-id" ? projectId : null }) };
    if (name === "@/components/workspace/workspace-frame") return { default: "WorkspaceFrame" };
    if (name === "@/lib/projects/list-context") return { requireProjectListContext: async () => workspace };
    if (name === "@/lib/workspace/context") return { requireWorkspaceContext: async () => { calls.push("workspace"); return workspace; } };
    if (name === "@/lib/projects/project-context") return { requireProjectContext: async (id, organisation, scope) => { calls.push([id, organisation, scope]); if (denied) throw new Error("PROJECT_ACCESS_DENIED"); return { workspace, project: { name: "Test", code: "TEST" }, sections: [] }; } };
    return { default: name };
  }, exports);
  return { render: exports.default, calls };
}
test("workspace home requires only workspace access", async () => {
  const l = layout("v2/app/workspace/layout.tsx", null);
  await l.render({ children: "home" });
  assert.deepEqual(l.calls, []);
  const tree = await l.render({ children:"home" });
  assert.equal(tree.type,"WorkspaceFrame");
  assert.equal(tree.props.children,"home");
});
test("workspace parent owns the global shell on project routes", async () => {
  const l = layout("v2/app/workspace/layout.tsx", "project");
  const tree = await l.render({ children: "project child" });
  assert.equal(tree.type, "WorkspaceFrame");
  assert.equal(tree.props.children, "project child");
  assert.deepEqual(l.calls, []);
});
test("project layout authorizes before rendering either shell", async () => {
  const l = layout("v2/app/workspace/projects/[projectId]/layout.tsx", "project");
  const tree = await l.render({ children: "materials", params: Promise.resolve({ projectId: "project" }) });
  assert.deepEqual(l.calls, [["project", null, "shell"]]);
  assert.equal(tree.props.organisationId,"participant");
  assert.equal(tree.type,"@/components/projects/project-shell");
  assert.equal(tree.props.children,"materials");
});
test("project layout propagates access denial without rendering a shell", async () => {
  const l = layout("v2/app/workspace/projects/[projectId]/layout.tsx", "project", true);
  await assert.rejects(l.render({ children: "private", params: Promise.resolve({ projectId: "project" }) }), /PROJECT_ACCESS_DENIED/);
});
