import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const authFile = "mobile/contexts/AuthContext.tsx";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function createHookHarness() {
  const slots = [];
  const effects = [];
  let cursor = 0;
  let dirty = false;
  const react = {
    createContext: () => ({ Provider: "AuthProvider" }),
    useContext: () => null,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (next) => {
        const value = typeof next === "function" ? next(slots[index]) : next;
        if (value !== slots[index]) { slots[index] = value; dirty = true; }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo(factory, dependencies) {
      const index = cursor++;
      const current = slots[index];
      if (!current || dependencies.some((value, i) => value !== current.dependencies[i])) {
        slots[index] = { dependencies, value: factory() };
      }
      return slots[index].value;
    },
    useCallback(callback, dependencies) {
      const index = cursor++;
      const current = slots[index];
      if (!current || dependencies.some((value, i) => value !== current.dependencies[i])) slots[index] = { dependencies, value: callback };
      return slots[index].value;
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const current = slots[index];
      if (!current || dependencies.some((value, i) => value !== current.dependencies[i])) {
        current?.cleanup?.();
        slots[index] = { dependencies, cleanup: null };
        effects.push(() => { slots[index].cleanup = effect(); });
      }
    },
  };
  return {
    react,
    effects,
    render(component, props) { cursor = 0; dirty = false; return { output: component(props), get dirty() { return dirty; } }; },
    async settle(component, props) {
      let output;
      for (let i = 0; i < 20; i++) {
        const rendered = this.render(component, props);
        output = rendered.output;
        const pending = effects.splice(0);
        for (const effect of pending) effect();
        await Promise.resolve();
        await new Promise((resolve) => setImmediate(resolve));
        if (!rendered.dirty && effects.length === 0) break;
      }
      return output.props.value;
    },
  };
}

function loadAuthProvider({ getSession, cachedProfile = null, queriesFail = false }) {
  const harness = createHookHarness();
  let authListener, authListenerCount = 0;
  const storage = {
    async getItem(key) { return key.startsWith("tttracker:mobile-profile:") && cachedProfile ? JSON.stringify({ profile: cachedProfile }) : null; },
    async setItem() {}, async removeItem() {},
  };
  function query(table) {
    const result = queriesFail
      ? { data: null, error: new TypeError("Failed to fetch") }
      : { data: table === "employees" ? null : [], error: null };
    const builder = {
      select() { return this; }, eq() { return this; },
      maybeSingle() { return Promise.resolve(result); },
      then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
    };
    return builder;
  }
  const supabase = {
    auth: {
      getSession,
      onAuthStateChange(callback) { authListenerCount++; authListener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
      signInWithPassword: async () => ({ error: null }), signOut: async () => ({ error: null }),
    },
    from: query,
    rpc: async () => ({ error: null }),
  };
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(authFile, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "exports", compiled)((name) => {
    if (name === "react") return harness.react;
    if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }) };
    if (name === "@react-native-async-storage/async-storage") return storage;
    if (name === "@/lib/supabase") return { supabase };
    if (name.endsWith("/backend-resilience")) return { isTransientBackendFailure: (error) => /network|fetch/i.test(error?.message || "") };
    throw new Error(`Unexpected AuthContext dependency: ${name}`);
  }, exports);
  return { ...harness, AuthProvider: exports.AuthProvider, fire: (event, session) => authListener(event, session), get authListenerCount() { return authListenerCount; } };
}

const persistedSession = { access_token: "cached-access", user: { id: "user-ios", email: "crew@example.test", user_metadata: { full_name: "Field User" } } };
const cachedProfile = { userId: persistedSession.user.id, email: "crew@example.test", employeeId: "emp-1", fullName: "Field User", employeeRole: null, crewId: null, crewNumber: null, crewName: null, projectId: "project-1", projectName: "Project", projectNumber: "P-1", projectStatus: "Active", availableProjects: [] };

test("iOS-like delayed storage event restores the local session before getSession settles", async () => {
  const pending = deferred();
  const harness = loadAuthProvider({ getSession: () => pending.promise, cachedProfile });
  let value = await harness.settle(harness.AuthProvider, { children: null });
  assert.equal(value.status, "initialising");
  assert.equal(value.loading, true);
  assert.equal(harness.authListenerCount, 1);
  harness.fire("INITIAL_SESSION", persistedSession);
  value = await harness.settle(harness.AuthProvider, { children: null });
  assert.equal(value.status, "signed_in");
  assert.equal(value.session.user.id, persistedSession.user.id);
  assert.equal(value.loading, false);
  await harness.settle(harness.AuthProvider, { children: null });
  assert.equal(harness.authListenerCount, 1, "rerenders must not add auth listeners");
  pending.resolve({ data: { session: null }, error: null });
  await new Promise((resolve) => setImmediate(resolve));
  value = await harness.settle(harness.AuthProvider, { children: null });
  assert.equal(value.status, "signed_in", "stale empty getSession result must not replace newer auth event");
  assert.equal(value.profile.userId, persistedSession.user.id);
});

test("transient local session check failure waits for INITIAL_SESSION instead of reporting signed out", async () => {
  const harness = loadAuthProvider({ getSession: async () => { throw new TypeError("network request failed"); }, cachedProfile });
  let value = await harness.settle(harness.AuthProvider, { children: null });
  assert.equal(value.status, "initialising");
  assert.equal(value.loading, true);
  harness.fire("INITIAL_SESSION", persistedSession);
  value = await harness.settle(harness.AuthProvider, { children: null });
  assert.equal(value.status, "signed_in");
  assert.equal(value.session.user.id, persistedSession.user.id);
  assert.equal(value.profile.userId, persistedSession.user.id);
});

test("Android-equivalent restore uses the same local-session state and does not require remote getUser", async () => {
  const supabaseResult = { data: { session: persistedSession }, error: null };
  const harness = loadAuthProvider({ getSession: async () => supabaseResult, cachedProfile });
  const value = await harness.settle(harness.AuthProvider, { children: null });
  assert.equal(value.status, "signed_in");
  assert.equal(value.session.user.id, persistedSession.user.id);
  assert.equal(value.profile.userId, persistedSession.user.id);
  assert.doesNotMatch(fs.readFileSync(authFile, "utf8"), /supabase\.auth\.getUser\(/);
});

test("native AppState refresh listener is single and transition-deduplicated", () => {
  const source = ts.transpileModule(fs.readFileSync("mobile/lib/supabase.ts", "utf8"), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let listenerCount = 0, callback, starts = 0, stops = 0;
  const appState = { currentState: "active", addEventListener(event, listener) { assert.equal(event, "change"); listenerCount++; callback = listener; return { remove() {} }; } };
  const previousUrl = process.env.EXPO_PUBLIC_SUPABASE_URL, previousKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  process.env.EXPO_PUBLIC_SUPABASE_URL = "https://supabase.example.test";
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  const exports = {};
  new Function("require", "exports", source)((name) => {
    if (name === "react-native-url-polyfill/auto") return {};
    if (name === "@react-native-async-storage/async-storage") return { default: {} };
    if (name === "react-native") return { AppState: appState, Platform: { OS: "ios" } };
    if (name === "@supabase/supabase-js") return { createClient: () => ({ auth: { startAutoRefresh() { starts++; }, stopAutoRefresh() { stops++; } } }) };
    if (name.endsWith("/backend-resilience")) return { resilientFetch: (...args) => globalThis.fetch(...args) };
    throw new Error(`Unexpected Supabase dependency: ${name}`);
  }, exports);
  for (let i = 0; i < 5; i++) { callback("background"); callback("active"); callback("active"); }
  assert.equal(listenerCount, 1);
  assert.equal(starts, 6);
  assert.equal(stops, 5);
  if (previousUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL; else process.env.EXPO_PUBLIC_SUPABASE_URL = previousUrl;
  if (previousKey === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY; else process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = previousKey;
});

test("Materials consumes profile from AuthContext and does not make its own auth decision", () => {
  const files = ["mobile/app/materials", "mobile/components/materials", "mobile/lib/api"];
  for (const file of files) {
    const entries = fs.readdirSync(file, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !/materials.*\.(tsx?|jsx?)$/i.test(entry.name) && file !== "mobile/app/materials") continue;
      const source = fs.readFileSync(`${file}/${entry.name}`, "utf8");
      assert.doesNotMatch(source, /supabase\.auth\.(?:getUser|getSession)\(/, `${file}/${entry.name} must use canonical AuthContext`);
    }
  }
});

test("Quality photo viewers use responsive insets, tappable controls and a shared Before/After viewer", () => {
  const gallery = fs.readFileSync("mobile/components/quality/QualityEvidenceGallery.tsx", "utf8");
  assert.match(gallery, /useSafeAreaInsets\(\)/);
  assert.match(gallery, /paddingTop:insets\.top\+12/);
  assert.match(gallery, /paddingLeft:insets\.left\+12/);
  assert.match(gallery, /paddingRight:insets\.right\+12/);
  assert.match(gallery, /width:52,height:52/);
  assert.match(gallery, /zIndex:21,elevation:21/);
  assert.match(gallery, /pointerEvents="auto"/);
  assert.match(fs.readFileSync("mobile/components/quality/QualityPhotoPicker.tsx", "utf8"), /<QualitySwipeViewer/);
  assert.match(gallery, /<QualitySwipeViewer/);
  assert.match(gallery, /label==="After"\?"No after photos yet"/);
});
