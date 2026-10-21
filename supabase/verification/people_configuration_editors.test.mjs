import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const require = createRequire(import.meta.url);
const ts = require(path.join(root, "v2/node_modules/typescript"));
const jsx = {
  jsx: (type, props) => ({ type, props }),
  jsxs: (type, props) => ({ type, props }),
  Fragment: "fragment",
};
function walk(node, match) {
  if (Array.isArray(node)) return node.flatMap((n) => walk(n, match));
  if (!node || typeof node !== "object") return [];
  return [
    ...(match(node) ? [node] : []),
    ...walk(node.props?.children, match),
    ...walk(node.props?.footer, match),
  ];
}
const nodes = (tree, type) => walk(tree, (n) => n.type === type);
function text(node) {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node && typeof node === "object" ? text(node.props?.children) : "";
}
function harness(file, exportName, initialProps) {
  let cursor = 0;
  const cells = [],
    effects = [],
    cache = new Map(),
    requests = [];
  let props = initialProps;
  const oldFetch = globalThis.fetch;
  const oldDocument = globalThis.document;
  if (!oldDocument)
    globalThis.document = {
      body: { style: { overflow: "" } },
      activeElement: null,
    };
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), ...options });
    return {
      ok: true,
      json: async () => ({
        rows: [
          {
            id: "rule",
            name: "Configured Rule",
            category: "training",
            folder_template: "People/{person_display_name}",
            filename_template:
              "{employee_number}_{training_type}_{expiry_date}",
          },
        ],
        total: 1,
        policies: {},
      }),
    };
  };
  const react = {
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
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
    useId: () => `field-${cursor++}`,
    useCallback: (fn) => {
      cursor++;
      return fn;
    },
    useEffect: (fn, deps) => {
      const i = cursor++;
      if (!cells[i] || JSON.stringify(cells[i]) !== JSON.stringify(deps)) {
        cells[i] = deps;
        effects.push(fn);
      }
    },
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    let source = fs.readFileSync(path.join(root, file), "utf8");
    source = source.replace(
      /^function (ReviewRules|TemplateBuilder|OnboardingFieldEditor|TrainingRequirementControl)\(/gm,
      "export function $1(",
    );
    const code = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText;
    new Function("require", "exports", code)((name) => {
      if (name === "react") return react;
      if (name === "react-dom") return { createPortal: (content) => content };
      if (name === "react/jsx-runtime") return jsx;
      if (name === "next/image") return { default: "img" };
      if (name === "next/link") return { default: "a" };
      if (name === "lucide-react")
        return new Proxy({}, { get: (_, key) => key });
      if (name.endsWith(".module.css"))
        return { default: new Proxy({}, { get: (_, key) => key }) };
      if (name === "./people-ui")
        return { PeopleDateInput: "date-input", BackLink: "back-link" };
      if (name === "@/components/materials/workflow-controls")
        return { MaterialsSearch: "search" };
      if (name.startsWith("@/")) {
        const base = "v2/" + name.slice(2);
        return load(fs.existsSync(path.join(root, base + ".tsx")) ? base + ".tsx" : base + ".ts");
      }
      if (name.startsWith("./")) {
        const base = path.posix.join(path.posix.dirname(file), name);
        return load(
          fs.existsSync(path.join(root, base + ".tsx"))
            ? base + ".tsx"
            : base + ".ts",
        );
      }
      throw Error(name);
    }, exports);
    return exports;
  }
  const component = load(file)[exportName];
  return {
    render(next) {
      props = next ?? props;
      cursor = 0;
      return component(props);
    },
    async flush() {
      for (const effect of effects.splice(0)) effect();
      await new Promise((r) => setImmediate(r));
    },
    mount() {
      return effects
        .splice(0)
        .map((fn) => fn())
        .filter(Boolean);
    },
    requests,
    cleanup() {
      globalThis.fetch = oldFetch;
      globalThis.document = oldDocument;
    },
  };
}
const findEditor = (tree) =>
  walk(
    tree,
    (n) => typeof n.type === "function" && n.type.name === "Editor",
  )[0];
const base = {
  organisation: "org",
  heading: "New Configuration",
  surface: "medium",
  onCancel: () => {},
  onSave: async () => {},
};

test("shared presets keep modal and drawers controlled, single column and bottom actions", () => {
  const css = fs.readFileSync(
    path.join(root, "v2/components/people/people.module.css"),
    "utf8",
  );
  assert.match(css, /\.configuration\.small[\s\S]*?460px/);
  assert.match(css, /\.configuration\.medium[\s\S]*?560px/);
  assert.match(css, /\.configuration\.large\s*\{[\s\S]*?680px/);
  assert.match(css, /\.configuration\[open\][\s\S]*?flex-direction: column/);
  assert.match(css, /\.configuration \.fields[\s\S]*?minmax\(0, 1fr\)/);
});
test("native modal opens, restores trigger focus and locks background scrolling", () => {
  const old = globalThis.document;
  let opens = 0,
    closes = 0,
    focus = 0;
  globalThis.document = {
    activeElement: { focus: () => focus++ },
    body: { style: { overflow: "auto" } },
  };
  const h = harness(
    "v2/components/people/configuration-surface.tsx",
    "ConfigurationSurface",
    { title: "Rule", onClose: () => {}, children: "Fields" },
  );
  try {
    const tree = h.render();
    assert.equal(tree.type, "dialog");
    tree.props.ref.current = {
      showModal: () => opens++,
      close: () => closes++,
    };
    const cleanup = h.mount();
    assert.equal(opens, 1);
    assert.equal(document.body.style.overflow, "hidden");
    cleanup.forEach((fn) => fn());
    assert.equal(closes, 1);
    assert.equal(focus, 1);
    assert.equal(document.body.style.overflow, "auto");
  } finally {
    h.cleanup();
    globalThis.document = old;
  }
});
test("Escape and Cancel guard dirty changes; Keep Editing and Discard are distinct", () => {
  let closes = 0;
  const h = harness(
    "v2/components/people/configuration-surface.tsx",
    "ConfigurationSurface",
    {
      title: "Rule",
      dirty: true,
      onClose: () => closes++,
      children: "Fields",
      footer: "Save",
    },
  );
  try {
    let prevented = 0;
    h.render().props.onCancel({
      preventDefault: () => prevented++,
      stopPropagation() {},
    });
    assert.equal(prevented, 1);
    assert.equal(closes, 0);
    assert.match(text(h.render()), /Discard unsaved changes/);
    nodes(h.render(), "button")
      .find((n) => text(n) === "Keep Editing")
      .props.onClick();
    assert.doesNotMatch(text(h.render()), /Discard unsaved changes/);
    nodes(h.render(), "button")
      .find((n) => text(n) === "Cancel")
      .props.onClick();
    nodes(h.render(), "button")
      .find((n) => text(n) === "Discard")
      .props.onClick();
    assert.equal(closes, 1);
  } finally {
    h.cleanup();
  }
});
test("unchanged editor closes directly and busy editor cannot be dismissed", () => {
  for (const busy of [false, true]) {
    let closes = 0;
    const h = harness(
      "v2/components/people/configuration-surface.tsx",
      "ConfigurationSurface",
      {
        title: "Rule",
        dirty: false,
        busy,
        onClose: () => closes++,
        children: "Fields",
      },
    );
    try {
      h.render().props.onCancel({ preventDefault() {}, stopPropagation() {} });
      assert.equal(closes, busy ? 0 : 1);
      assert.doesNotMatch(text(h.render()), /Discard unsaved changes/);
    } finally {
      h.cleanup();
    }
  }
});
test("required field error is inline, avoids mutation and switches to its section", async () => {
  let saves = 0;
  const h = harness("v2/components/people/people-controls.tsx", "Editor", {
    ...base,
    fields: [
      { key: "name", label: "Training Type", group: "Basic", required: true },
      { key: "category", label: "Category", group: "Category", required: true },
    ],
    initial: { name: "Ticket" },
    onSave: async () => saves++,
  });
  try {
    await nodes(h.render(), "form")[0].props.onSubmit({
      preventDefault() {},
      stopPropagation() {},
    });
    assert.equal(saves, 0);
    assert.match(text(h.render()), /Category is required/);
    assert.equal(
      nodes(h.render(), "button").find((n) => text(n) === "Category").props[
        "aria-current"
      ],
      "page",
    );
  } finally {
    h.cleanup();
  }
});
test("successful editor submits canonical values; save action lives in sticky surface footer", async () => {
  let payload;
  const h = harness("v2/components/people/people-controls.tsx", "Editor", {
    ...base,
    saveLabel: "Save Training Type",
    fields: [{ key: "name", label: "Training Type", required: true }],
    initial: { name: "Configured Ticket" },
    onSave: async (data) => {
      payload = data;
    },
  });
  try {
    const tree = h.render();
    assert.equal(tree.type.name, "ConfigurationSurface");
    assert.equal(text(tree.props.footer), "Save Training Type");
    assert.equal(tree.props.footer.props.form, nodes(tree, "form")[0].props.id);
    assert.equal(nodes(tree, "back-link").length, 0);
    await nodes(tree, "form")[0].props.onSubmit({
      preventDefault() {},
      stopPropagation() {},
    });
    assert.equal(payload.name, "Configured Ticket");
  } finally {
    h.cleanup();
  }
});
test("conditional fields hide irrelevant validity and required validation", async () => {
  let saved;
  const h = harness("v2/components/people/people-controls.tsx", "Editor", {
    ...base,
    fields: [
      {
        key: "validity_mode",
        label: "Expiry method",
        options: ["never", "automatic"],
      },
      {
        key: "validity_months",
        label: "Validity period",
        required: true,
        visible: (data) => data.validity_mode === "automatic",
      },
    ],
    initial: { validity_mode: "never" },
    onSave: async (data) => (saved = data),
  });
  try {
    assert.doesNotMatch(text(h.render()), /Validity period/);
    await nodes(h.render(), "form")[0].props.onSubmit({
      preventDefault() {},
      stopPropagation() {},
    });
    assert.equal(saved.validity_mode, "never");
    nodes(h.render(), "select")[0].props.onChange({
      target: { value: "automatic" },
    });
    assert.match(text(h.render()), /Validity period/);
    await nodes(h.render(), "form")[0].props.onSubmit({
      preventDefault() {},
      stopPropagation() {},
    });
    assert.match(text(h.render()), /Validity period is required/);
  } finally {
    h.cleanup();
  }
});
test("All and Root are explicit picker selections, stored as canonical empty scope", () => {
  for (const label of [
    "Root",
    "All training categories",
    "All employment / engagement types",
  ]) {
    let selected = "x";
    const h = harness(
      "v2/components/people/people-controls.tsx",
      "PeoplePicker",
      {
        organisation: "org",
        area: "types",
        label: "Scope",
        selected: "",
        emptyLabel: label,
        onChange: (id) => (selected = id),
      },
    );
    try {
      assert.equal(nodes(h.render(), "search")[0].props.value, label);
      nodes(h.render(), "search")[0].props.onFocus();
      const option = nodes(h.render(), "button").find((n) => text(n) === label);
      assert.ok(option);
      option.props.onClick();
      assert.equal(selected, "");
    } finally {
      h.cleanup();
    }
  }
});
test("token picker replaces cursor selection and rejects unsupported tokens/path syntax", () => {
  const h = harness("v2/components/people/token-input.tsx", "TokenInput", {
    value: "prefix OLD suffix",
    onChange: () => {},
  });
  try {
    const tree = h.render();
    assert.equal(nodes(tree, "input").length, 1);
    const options = nodes(tree, "option");
    assert.ok(options.some((n) => n.props.value === "expiry_date"));
    assert.equal(nodes(tree, "optgroup").length, 5);
    let changed;
    const next = h.render({
      value: "prefix OLD suffix",
      onChange: (value) => (changed = value),
    });
    let focus = 0,
      cursor;
    nodes(next, "input")[0].props.ref.current = {
      selectionStart: 7,
      selectionEnd: 10,
      focus: () => focus++,
      setSelectionRange: (start) => (cursor = start),
    };
    const old = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (fn) => fn();
    try {
      nodes(next, "select")[0].props.onChange({
        target: { value: "person_id" },
      });
      assert.equal(changed, "prefix {person_id} suffix");
      assert.equal(focus, 1);
      assert.equal(cursor, 18);
    } finally {
      globalThis.requestAnimationFrame = old;
    }
  } finally {
    h.cleanup();
  }
});
test("unsafe filename template receives specific inline error and cannot save", async () => {
  let saves = 0;
  const h = harness("v2/components/people/people-controls.tsx", "Editor", {
    ...base,
    fields: [
      {
        key: "filename_template",
        label: "Filename Template",
        type: "token",
        required: true,
      },
    ],
    initial: { filename_template: "{arbitrary_sql}" },
    onSave: async () => saves++,
  });
  try {
    await nodes(h.render(), "form")[0].props.onSubmit({
      preventDefault() {},
      stopPropagation() {},
    });
    assert.equal(saves, 0);
    assert.match(
      text(h.render()),
      /Filename Template contains an unsupported token/,
    );
  } finally {
    h.cleanup();
  }
});
test("Document Rule uses compact surface, explicit All/Root scopes and hides disconnected library", async () => {
  const h = harness(
    "v2/components/people/people-operations.tsx",
    "PeopleOperationsPanel",
    {
      organisation: "org",
      area: "document_rules",
      permissions: { "people.configure": true },
    },
  );
  try {
    nodes(h.render(), "button")
      .find((n) => text(n) === "New Document Rule")
      .props.onClick();
    const editor = findEditor(h.render());
    assert.equal(editor.props.surface, "medium");
    assert.equal(editor.props.saveLabel, "Save Rule");
    assert.equal(nodes(h.render(), "back-link").length, 0);
    assert.equal(
      editor.props.fields.find((f) => f.key === "parent_id").emptyLabel,
      "Root",
    );
    assert.equal(
      editor.props.fields.find((f) => f.key === "training_category_id")
        .emptyLabel,
      "All training categories",
    );
    assert.equal(
      editor.props.fields.find((f) => f.key === "relationship_type_id")
        .emptyLabel,
      "All employment / engagement types",
    );
    assert.equal(
      editor.props.fields
        .find((f) => f.key === "library_reference")
        .visible({ provider: "sharepoint" }),
      false,
    );
    assert.match(
      text(editor.props.sectionContent("Storage", { provider: "sharepoint" })),
      /SharePoint is not connected/,
    );
    assert.equal(
      editor.props.sectionContent("Storage", { provider: "internal" }),
      null,
    );
    await editor.props.onSave({
      name: "Rule",
      category: "__new__",
      new_category: "Configured Evidence",
      provider: "internal",
    });
    assert.equal(findEditor(h.render()), undefined);
    assert.match(text(h.render()), /Document rule saved/);
    assert.equal(
      JSON.parse(h.requests.find((r) => r.method === "POST").body).data
        .category,
      "Configured Evidence",
    );
  } finally {
    h.cleanup();
  }
});
test("configuration mutation remains hidden without its capability", () => {
  const h = harness(
    "v2/components/people/people-operations.tsx",
    "PeopleOperationsPanel",
    { organisation: "org", area: "document_rules", permissions: {} },
  );
  try {
    assert.ok(
      !nodes(h.render(), "button").some((n) => text(n) === "New Document Rule"),
    );
  } finally {
    h.cleanup();
  }
});
test("Category and Option editors use small modal; save closes and refreshes register", async () => {
  for (const area of ["training_categories", "training_options"]) {
    const h = harness(
      "v2/components/people/training-catalogue.tsx",
      "TrainingCatalogue",
      { organisation: "org", area },
    );
    try {
      nodes(h.render(), "button")
        .find((n) => text(n).trim().startsWith("Add"))
        .props.onClick();
      const editor = findEditor(h.render());
      assert.equal(editor.props.surface, "small");
      assert.equal(nodes(h.render(), "back-link").length, 0);
      await editor.props.onSave({
        name: "Configured",
        category_id: "category",
      });
      assert.equal(findEditor(h.render()), undefined);
      assert.ok(h.requests.some((r) => !r.method));
      assert.match(text(h.render()), /saved/);
    } finally {
      h.cleanup();
    }
  }
});
test("Training Type option editor edits owned definitions without writing outside Save", async () => {
  const h = harness(
    "v2/components/people/training-editor-content.tsx",
    "TrainingClassSelection",
    {
      organisation: "org",
      definitions: [{ id: "option", code: "DG", name: "Dogging", is_active: true }],
      onChange: () => {},
    },
  );
  try {
    await h.flush();
    h.render();
    const tree = h.render();
    assert.ok(walk(tree, (n) => n.type === "input").some((input) => input.props.value === "Dogging" || input.props.value === "DG"));
    assert.match(text(tree), /Add Multiple/);
    assert.match(text(tree), /belong to this Training Type/);
    assert.ok(!h.requests.some((r) => r.method === "POST"));
  } finally {
    h.cleanup();
  }
});
test("Training Type option editor remains dense with twenty configurable classes", () => {
  const definitions = Array.from({ length: 20 }, (_, index) => ({ id: `option-${index}`, code: `C${index}`, name: `Class ${index}`, is_active: true }));
  const h = harness("v2/components/people/training-editor-content.tsx", "TrainingClassSelection", { definitions, onChange: () => {} });
  try {
    const tree = h.render();
    assert.equal(walk(tree, (node) => node.type === "tr").length, 21);
    assert.match(text(tree), /Add Multiple/);
    assert.ok(walk(tree, (node) => node.type === "input").some((input) => input.props.value === "C19"));
  } finally { h.cleanup(); }
});
test("filename and folder preview are synthetic, filesystem-safe and separate from token help", () => {
  const h = harness(
    "v2/components/people/people-operations.tsx",
    "FilenamePreview",
    {
      template: "{employee_number}_{training_type}_{expiry_date}",
      folder: "People/{person_display_name}/Training",
    },
  );
  try {
    const tree = h.render();
    assert.equal(tree.props.className, "previewCard");
    assert.match(text(tree), /EMP-0042_Configured Ticket_04-10-2027.pdf/);
    assert.match(text(tree), /People\/Alex Smith\/Training/);
    assert.match(text(tree), /Display date: 04\/10\/2027/);
    assert.doesNotMatch(text(tree), /Safe tokens:/);
  } finally {
    h.cleanup();
  }
});
test("onboarding field edits stay local until Save Field; classifications remain gated", () => {
  let saved;
  const initial = {
    key: "field",
    label: "Field",
    type: "text",
    classification: "operational",
  };
  const h = harness(
    "v2/components/people/onboarding-admin.tsx",
    "OnboardingFieldEditor",
    {
      organisation: "org",
      initial,
      earlier: [],
      onClose: () => {},
      onSave: (field) => (saved = field),
    },
  );
  try {
    const tree = h.render();
    assert.equal(tree.type.name, "ConfigurationSurface");
    nodes(tree, "input")[0].props.onChange({ target: { value: "New label" } });
    assert.equal(initial.label, "Field");
    assert.equal(saved, undefined);
    assert.ok(
      nodes(h.render(), "details").some((n) =>
        text(n).includes("Advanced settings"),
      ),
    );
    h.render().props.footer.props.onClick();
    assert.equal(saved.label, "New label");
    const confidential = h.render({
      organisation: "org",
      initial,
      earlier: [],
      onClose: () => {},
      onSave: () => {},
    });
    const type = nodes(confidential, "select")[0];
    type.props.onChange({ target: { value: "bank_account" } });
    assert.match(text(h.render()), /Confidential collection unavailable/);
    assert.equal(
      nodes(h.render(), "input").filter((n) => n.props.type === "file").length,
      0,
    );
  } finally {
    h.cleanup();
  }
});

test("training expiry and evidence questions hide follow-up controls when disabled", () => {
  for (const [kind, value, heading] of [
    ["training-validity", "never", "Does this training expire?"],
    ["training-evidence", "none", "Require evidence?"],
  ]) {
    let next;
    const h = harness(
      "v2/components/people/people-controls.tsx",
      "TrainingRequirementControl",
      { kind, value, onChange: (value) => (next = value) },
    );
    try {
      assert.match(text(h.render()), new RegExp(heading.replace("?", "\\?")));
      assert.equal(nodes(h.render(), "select").length, 1);
      nodes(h.render(), "select")[0].props.onChange({
        target: { value: "yes" },
      });
      assert.equal(next, kind === "training-validity" ? "manual" : "single");
      h.render({ kind, value: next, onChange: (value) => (next = value) });
      assert.equal(nodes(h.render(), "select").length, 2);
      assert.doesNotMatch(
        text(h.render()),
        /front_back|single_or_front_back|automatic/,
      );
    } finally {
      h.cleanup();
    }
  }
});

test("nested editor submissions stop propagation before performing their own save", async () => {
  let saved = 0,
    stopped = 0;
  const h = harness("v2/components/people/people-controls.tsx", "Editor", {
    ...base,
    fields: [{ key: "name", label: "Name", required: true }],
    initial: { name: "Option" },
    onSave: async () => saved++,
  });
  try {
    await nodes(h.render(), "form")[0].props.onSubmit({
      preventDefault() {},
      stopPropagation() {
        stopped++;
      },
    });
    assert.equal(stopped, 1);
    assert.equal(saved, 1);
  } finally {
    h.cleanup();
  }
});
test("Review Rule save preserves other source policies and closes modal", async () => {
  const h = harness(
    "v2/components/people/people-operations.tsx",
    "ReviewRules",
    { organisation: "org" },
  );
  try {
    await h.flush();
    nodes(h.render(), "button")
      .find((n) => text(n) === "Edit")
      .props.onClick();
    const editor = findEditor(h.render());
    assert.equal(editor.props.surface, "small");
    await editor.props.onSave({ policy: "trusted" });
    assert.equal(findEditor(h.render()), undefined);
    const payload = JSON.parse(
      h.requests.find((r) => r.method === "POST").body,
    );
    assert.equal(payload.action, "review_rules");
    assert.equal(payload.organisation, "org");
    assert.equal(payload.data.internal, "trusted");
    assert.match(text(h.render()), /Review rule saved/);
  } finally {
    h.cleanup();
  }
});

test("editing and reverting an empty input or numeric value does not prompt discard", () => {
  const h = harness("v2/components/people/people-controls.tsx", "Editor", {
    ...base,
    fields: [
      { key: "name", label: "Name" },
      { key: "days", label: "Days", type: "number" },
    ],
    initial: { days: 30 },
  });
  try {
    nodes(h.render(), "input")[0].props.onChange({
      target: { value: "Draft" },
    });
    assert.equal(h.render().props.dirty, true);
    nodes(h.render(), "input")[0].props.onChange({ target: { value: "" } });
    nodes(h.render(), "input")[1].props.onChange({ target: { value: "30" } });
    assert.equal(h.render().props.dirty, false);
  } finally {
    h.cleanup();
  }
});
