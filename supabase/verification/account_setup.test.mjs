import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const dependency = createRequire(import.meta.url);
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const ts = dependency(path.join(root, "v2/node_modules/typescript"));
function load(file, mocks = {}) {
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
    if (name === "server-only") return {};
    if (name.startsWith("@/")) return load(`v2/${name.slice(2)}.ts`, mocks);
    if (name.startsWith("."))
      return load(
        path.relative(
          root,
          path.resolve(path.dirname(path.join(root, file)), `${name}.ts`),
        ),
        mocks,
      );
    return dependency(name);
  }, exports);
  return exports;
}
const policy = load("v2/lib/auth/password-policy.ts");
const errors = load("v2/lib/auth/setup-errors.ts");
const sessionHelper = load("v2/lib/auth/setup-session.ts");
const invitationId = "00000000-0000-0000-0000-000000000001";
function fixture(overrides = {}) {
  const events = [];
  const invitation = {
    id: invitationId,
    organisation_id: "org",
    email: "recipient@example.test",
    status: "pending",
    auth_user_id: "recipient",
    accepted_user_id: null,
    expires_at: new Date(Date.now() + 60000).toISOString(),
    ...overrides,
  };
  let saved = false,
    policyFailure = null,
    rpcFailure = null;
  const api = {
    auth: {
      getUser: async () => {
        events.push("verify-user");
        return {
          data: {
            user: {
              id: "recipient",
              email: invitation.email,
              email_confirmed_at: "confirmed",
            },
          },
          error: null,
        };
      },
      updateUser: async () => {
        events.push("password-update");
        if (policyFailure) return { error: policyFailure };
        if (saved) return { error: { code: "same_password" } };
        saved = true;
        return { error: null };
      },
    },
    rpc: async () => {
      events.push("accept");
      if (rpcFailure) return { error: { message: rpcFailure } };
      invitation.status = "accepted";
      invitation.accepted_user_id = "recipient";
      return { data: { organisationId: "org" }, error: null };
    },
  };
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: invitation, error: null }),
  };
  const helpers = load("v2/lib/invitations/account-setup.ts", {
    "@/lib/supabase/admin": {
      createSupabaseAdmin: () => ({ from: () => builder }),
    },
  });
  return {
    events,
    invitation,
    api,
    helpers,
    setPolicy: (e) => (policyFailure = e),
    setRpc: (e) => (rpcFailure = e),
  };
}
test("TTTracker password policy is shared and stronger than six-character Auth minimum", () => {
  assert.equal(policy.PASSWORD_POLICY.minimumLength, 8);
  assert.equal(
    policy.validateSetupPassword("12345", "12345").code,
    "PASSWORD_TOO_SHORT",
  );
  assert.equal(policy.validateSetupPassword("", "").code, "PASSWORD_REQUIRED");
});
test("short password makes no Auth or provisioning calls; valid retry succeeds without resend", async () => {
  const f = fixture();
  const first = await f.helpers.completeInvitationSetup(
    f.api,
    invitationId,
    "12345",
    "12345",
  );
  assert.equal(first.error.message, "Password must be at least 8 characters.");
  assert.deepEqual(f.events, []);
  assert.equal(f.invitation.status, "pending");
  assert.equal(
    (
      await f.helpers.completeInvitationSetup(
        f.api,
        invitationId,
        "Neutral#123",
        "Neutral#123",
      )
    ).ok,
    true,
  );
  assert.ok(f.events.indexOf("password-update") < f.events.indexOf("accept"));
});
test("mismatch makes no Auth or provisioning calls and correction succeeds", async () => {
  const f = fixture();
  assert.equal(
    (
      await f.helpers.completeInvitationSetup(
        f.api,
        invitationId,
        "Neutral#123",
        "Wrong#123",
      )
    ).error.code,
    "PASSWORD_MISMATCH",
  );
  assert.deepEqual(f.events, []);
  assert.equal(
    (
      await f.helpers.completeInvitationSetup(
        f.api,
        invitationId,
        "Neutral#123",
        "Neutral#123",
      )
    ).ok,
    true,
  );
});
test("server password-policy rejection is not expiry and leaves pending invitation retryable", async () => {
  const f = fixture();
  f.setPolicy({
    code: "weak_password",
    name: "AuthWeakPasswordError",
    reasons: ["length"],
    message: "Password should be at least 12 characters.",
  });
  const r = await f.helpers.completeInvitationSetup(
    f.api,
    invitationId,
    "Neutral#123",
    "Neutral#123",
  );
  assert.equal(r.error.code, "PASSWORD_TOO_SHORT");
  assert.match(r.error.message, /12 characters/);
  assert.equal(f.invitation.status, "pending");
  assert.ok(!f.events.includes("accept"));
  f.setPolicy(null);
  assert.equal(
    (
      await f.helpers.completeInvitationSetup(
        f.api,
        invitationId,
        "Neutral#123456",
        "Neutral#123456",
      )
    ).ok,
    true,
  );
});
test("retry after password saved can provision with same password without resend", async () => {
  const f = fixture();
  f.setRpc("temporary database failure");
  const r = await f.helpers.completeInvitationSetup(
    f.api,
    invitationId,
    "Neutral#123",
    "Neutral#123",
  );
  assert.equal(r.error.code, "PASSWORD_SAVED_PROVISIONING_PENDING");
  assert.equal(f.invitation.status, "pending");
  f.setRpc(null);
  assert.equal(
    (
      await f.helpers.completeInvitationSetup(
        f.api,
        invitationId,
        "Neutral#123",
        "Neutral#123",
      )
    ).ok,
    true,
  );
});
test("already accepted setup is read-only; retry makes no second password or acceptance call", async () => {
  const f = fixture();
  await f.helpers.completeInvitationSetup(
    f.api,
    invitationId,
    "Neutral#123",
    "Neutral#123",
  );
  const count = f.events.filter((e) => e === "accept").length;
  assert.equal(
    (
      await f.helpers.completeInvitationSetup(
        f.api,
        invitationId,
        "Neutral#123",
        "Neutral#123",
      )
    ).error.code,
    "INVITATION_ALREADY_USED",
  );
  assert.equal(f.events.filter((e) => e === "accept").length, count);
});
for (const [name, override, code] of [
  ["expired", { expires_at: "2000-01-01T00:00:00Z" }, "INVITATION_EXPIRED"],
  ["revoked", { status: "cancelled" }, "INVITATION_REVOKED"],
  ["wrong recipient", { auth_user_id: "other" }, "INVALID_TOKEN"],
])
  test(`${name} invitation stops before password mutation`, async () => {
    const f = fixture(override);
    assert.equal(
      (
        await f.helpers.completeInvitationSetup(
          f.api,
          invitationId,
          "Neutral#123",
          "Neutral#123",
        )
      ).error.code,
      code,
    );
    assert.ok(!f.events.includes("password-update"));
  });
test("unknown Auth/network errors never expose raw messages or claim expiry", () => {
  assert.equal(
    errors.mapSetupAuthError({
      code: "unexpected_failure",
      message: "internal secret",
    }).code,
    "SETUP_RETRY_REQUIRED",
  );
  assert.doesNotMatch(
    errors.mapSetupAuthError({ message: "internal secret" }).message,
    /secret|expired/,
  );
  assert.equal(
    errors.mapSetupAuthError({ name: "AuthSessionMissingError" }).code,
    "AUTH_SESSION_MISSING",
  );
  assert.equal(
    errors.mapSetupAuthError({ code: "otp_expired" }).code,
    "INVITATION_EXPIRED",
  );
  assert.equal(
    errors.mapSetupAuthError({ code: "weak_password", reasons: ["pwned"] })
      .code,
    "PASSWORD_POLICY_FAILED",
  );
});
test("setup URL cleanup happens after durable session and validation leaves it intact", async () => {
  const events = [];
  let durable = false;
  const api = {
    auth: {
      setSession: async () => {
        events.push("save");
        durable = true;
        return { error: null };
      },
      getSession: async () => ({
        data: { session: durable ? { user: { id: "recipient" } } : null },
        error: null,
      }),
    },
  };
  const result = await sessionHelper.establishSetupSession(
    api,
    "https://example.test/onboarding?invitation=abc#access_token=fixture-access&refresh_token=fixture-refresh",
    (url) => {
      assert.equal(durable, true);
      assert.equal(url, "/onboarding?invitation=abc");
      events.push("clean");
    },
  );
  assert.equal(result, null);
  assert.deepEqual(events, ["save", "clean"]);
  policy.validateSetupPassword("12345", "12345");
  assert.equal(durable, true);
});
test("invalid token does not clean URL or create a setup session", async () => {
  let cleaned = false;
  const api = {
    auth: { setSession: async () => ({ error: { code: "bad_jwt" } }) },
  };
  assert.equal(
    (
      await sessionHelper.establishSetupSession(
        api,
        "https://example.test/onboarding#access_token=bad&refresh_token=bad",
        () => (cleaned = true),
      )
    ).code,
    "INVALID_TOKEN",
  );
  assert.equal(cleaned, false);
});
test("expired callback and absent session are distinct from password failures", async () => {
  const api = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
    },
  };
  assert.equal(
    (
      await sessionHelper.establishSetupSession(
        api,
        "https://example.test/onboarding#error_code=otp_expired",
        () => {},
      )
    ).code,
    "INVITATION_EXPIRED",
  );
  assert.equal(
    (
      await sessionHelper.establishSetupSession(
        api,
        "https://example.test/onboarding",
        () => {},
      )
    ).code,
    "AUTH_SESSION_MISSING",
  );
});
test("actual SSR/Auth SDK reproduces PKCE mismatch and explicit session handoff persists cookies", async () => {
  const oldWindow = globalThis.window,
    oldDocument = globalThis.document;
  const jwt = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: "recipient",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    "test-signature",
  ].join(".");
  const href = `https://example.test/onboarding?invitation=abc#access_token=${jwt}&refresh_token=fixture-refresh&expires_in=3600&token_type=bearer&type=magiclink`;
  globalThis.window = {
    location: { href, hash: new URL(href).hash },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  globalThis.document = {
    visibilityState: "visible",
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  globalThis.window.document = globalThis.document;
  const cookies = new Map();
  let client;
  try {
    const { createBrowserClient } = dependency(
      path.join(root, "v2/node_modules/@supabase/ssr"),
    );
    client = createBrowserClient(
      "https://neutral.supabase.co",
      "fixture-publishable",
      {
        isSingleton: false,
        cookies: {
          getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
          setAll: (values) =>
            values.forEach((v) => cookies.set(v.name, v.value)),
        },
        global: {
          fetch: async () =>
            new Response(
              JSON.stringify({
                id: "recipient",
                email: "recipient@example.test",
                email_confirmed_at: "confirmed",
                app_metadata: {},
                user_metadata: {},
                aud: "authenticated",
                created_at: "2026-01-01T00:00:00Z",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
        },
      },
    );
    const initial = await client.auth.initialize();
    assert.equal(initial.error?.name, "AuthPKCEGrantCodeExchangeError");
    assert.equal((await client.auth.getSession()).data.session, null);
    assert.equal(
      await sessionHelper.establishSetupSession(client, href, () => {}),
      null,
    );
    assert.equal(
      (await client.auth.getSession()).data.session.user.id,
      "recipient",
    );
    assert.ok([...cookies.values()].some(Boolean));
  } finally {
    await client?.auth.stopAutoRefresh();
    client?.auth.broadcastChannel?.close();
    globalThis.window = oldWindow;
    globalThis.document = oldDocument;
  }
});

function ui(initialStatus = "pending", serverError = null) {
  const cells = [],
    effects = [];
  let cursor = 0,
    effectScheduled = false;
  const requests = [],
    redirects = [];
  const originalWindow = globalThis.window,
    originalFetch = globalThis.fetch;
  globalThis.window = {
    location: {
      href: `https://example.test/onboarding?invitation=${invitationId}`,
    },
    history: { state: null, replaceState: () => {} },
  };
  globalThis.fetch = async (_url, options = {}) => {
    requests.push(options.method ?? "GET");
    return options.method === "POST" && serverError
      ? { ok: false, json: async () => serverError }
      : {
          ok: true,
          json: async () =>
            options.method === "POST"
              ? { ok: true, organisationId: "org" }
              : { status: initialStatus },
        };
  };
  const auth = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "recipient" } } },
        error: null,
      }),
    },
  };
  const mockReact = {
    useState: (initial) => {
      const i = cursor++;
      if (!(i in cells)) cells[i] = initial;
      return [
        cells[i],
        (v) => (cells[i] = typeof v === "function" ? v(cells[i]) : v),
      ];
    },
    useRef: (initial) => {
      const i = cursor++;
      if (!(i in cells)) cells[i] = { current: initial };
      return cells[i];
    },
    useMemo: (fn) => fn(),
    useEffect: (fn) => {
      if (!effectScheduled) {
        effectScheduled = true;
        effects.push(fn);
      }
    },
  };
  const component = load("v2/app/onboarding/setup-account-client.tsx", {
    react: mockReact,
    "react/jsx-runtime": {
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
      Fragment: "fragment",
    },
    "next/link": { default: "a" },
    "next/navigation": {
      useRouter: () => ({
        replace: (url) => redirects.push(url),
        refresh: () => {},
      }),
      useSearchParams: () => new URLSearchParams(`invitation=${invitationId}`),
    },
    "@/lib/supabase/browser": { createSupabaseBrowser: () => auth },
  }).default;
  function render() {
    cursor = 0;
    return component({ supportEmail: null });
  }
  function nodes(tree, type) {
    if (!tree || typeof tree !== "object") return [];
    const children = tree.props?.children;
    return [
      ...(tree.type === type ? [tree] : []),
      ...(Array.isArray(children) ? children : [children]).flatMap((child) =>
        nodes(child, type),
      ),
    ];
  }
  function text(tree) {
    if (typeof tree === "string" || typeof tree === "number")
      return String(tree);
    if (!tree || typeof tree !== "object") return "";
    const c = tree.props?.children;
    return (Array.isArray(c) ? c : [c]).map(text).join(" ");
  }
  return {
    render,
    nodes,
    text,
    requests,
    redirects,
    async prepare() {
      render();
      effects.forEach((fn) => fn());
      await new Promise((resolve) => setImmediate(resolve));
    },
    cleanup() {
      globalThis.window = originalWindow;
      globalThis.fetch = originalFetch;
    },
  };
}
test("setup UI visibly explains password policy, keeps fields/session, and retries after short password", async () => {
  const h = ui();
  try {
    await h.prepare();
    let tree = h.render();
    assert.match(h.text(tree), /at least 8 characters/);
    let inputs = h.nodes(tree, "input");
    assert.equal(inputs.length, 2);
    inputs[0].props.onChange({ target: { value: "12345" } });
    inputs[1].props.onChange({ target: { value: "12345" } });
    await h
      .nodes(h.render(), "form")[0]
      .props.onSubmit({ preventDefault: () => {} });
    tree = h.render();
    assert.match(h.text(tree), /Password must be at least 8 characters/);
    assert.doesNotMatch(h.text(tree), /expired/);
    assert.equal(h.nodes(tree, "input").length, 2);
    assert.deepEqual(h.requests, ["GET"]);
    inputs = h.nodes(tree, "input");
    inputs[0].props.onChange({ target: { value: "Neutral#123" } });
    inputs[1].props.onChange({ target: { value: "Neutral#123" } });
    await h
      .nodes(h.render(), "form")[0]
      .props.onSubmit({ preventDefault: () => {} });
    assert.deepEqual(h.requests, ["GET", "POST"]);
    assert.deepEqual(h.redirects, ["/setup?organisation=org"]);
  } finally {
    h.cleanup();
  }
});
test("mismatch UI keeps editable confirmation and makes no completion request", async () => {
  const h = ui();
  try {
    await h.prepare();
    const inputs = h.nodes(h.render(), "input");
    inputs[0].props.onChange({ target: { value: "Neutral#123" } });
    inputs[1].props.onChange({ target: { value: "Wrong#123" } });
    await h
      .nodes(h.render(), "form")[0]
      .props.onSubmit({ preventDefault: () => {} });
    assert.match(h.text(h.render()), /Passwords do not match/);
    assert.equal(h.nodes(h.render(), "input").length, 2);
    assert.deepEqual(h.requests, ["GET"]);
  } finally {
    h.cleanup();
  }
});
test("already completed account renders Sign in instead of password form", async () => {
  const h = ui("accepted");
  try {
    await h.prepare();
    assert.match(h.text(h.render()), /Account setup is complete/);
    assert.match(h.text(h.render()), /Sign in/);
    assert.equal(h.nodes(h.render(), "form").length, 0);
  } finally {
    h.cleanup();
  }
});
test("server password policy error leaves setup UI editable without an expiry message", async () => {
  const h = ui("pending", {
    code: "PASSWORD_POLICY_FAILED",
    error: "Choose a stronger password.",
    retryable: true,
  });
  try {
    await h.prepare();
    const inputs = h.nodes(h.render(), "input");
    inputs[0].props.onChange({ target: { value: "Neutral#123" } });
    inputs[1].props.onChange({ target: { value: "Neutral#123" } });
    await h
      .nodes(h.render(), "form")[0]
      .props.onSubmit({ preventDefault: () => {} });
    assert.match(h.text(h.render()), /stronger password/);
    assert.doesNotMatch(h.text(h.render()), /expired/);
    assert.equal(h.nodes(h.render(), "input").length, 2);
    assert.equal(h.nodes(h.render(), "button")[0].props.disabled, false);
  } finally {
    h.cleanup();
  }
});
