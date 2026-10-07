import { createRequire } from "node:module";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const ts = require(path.join(root, "v2/node_modules/typescript"));
const { PGlite } = require(process.env.PGLITE_MODULE);
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
    if (name.startsWith("@/"))
      return load("v2/" + name.slice(2) + ".ts", mocks);
    return require(name);
  }, exports);
  return exports;
}
const navigation = load("v2/lib/security/navigation.ts");
const errors = load("v2/lib/security/errors.ts");
let db;
const user = "00000000-0000-0000-0000-000000000001",
  session = "00000000-0000-0000-0000-000000000002",
  other = "00000000-0000-0000-0000-000000000003";
const hash = "a".repeat(64),
  bad = "b".repeat(64);
const id = (n) =>
  `00000000-0000-0000-0000-${String(n + 100).padStart(12, "0")}`;
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20261004150000_security_email_challenge_integrity.sql",
  ),
  "utf8",
);
before(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
 create table auth.users(id uuid primary key,email text);
 create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
 insert into auth.users values('${user}','recipient@example.test'),('${other}','other@example.test');
 insert into auth.sessions values('${session}','${user}',null);
 create table v2_email_mfa_challenges(id uuid primary key,user_id uuid,session_id text,email text,code_hash text,expires_at timestamptz,attempts integer default 0,max_attempts integer,status text default 'pending',created_at timestamptz default now(),verified_at timestamptz);
 create table v2_security_session_verifications(user_id uuid,session_id text,verification_type text,verified_at timestamptz,expires_at timestamptz,unique(user_id,session_id,verification_type));`);
  await db.exec(migration);
});
after(async () => await db.close());
async function reserve(n = 1) {
  return (
    await db.query(
      "select tttracker_v2_reserve_email_challenge($1,$2,$3,$4,$5,10,5) r",
      [user, session, id(n), "recipient@example.test", hash],
    )
  ).rows[0].r;
}
async function verify(n = 1, h = hash, s = session, u = user) {
  return (
    await db.query(
      "select tttracker_v2_verify_email_challenge($1,$2,$3,$4,12) r",
      [u, s, id(n), h],
    )
  ).rows[0].r;
}
async function reset() {
  await db.exec(
    "truncate v2_email_mfa_challenges,v2_security_session_verifications",
  );
}
test("safe return path preserves project/org query and rejects loops/external redirect", () => {
  assert.equal(
    navigation.securityReturnPath("/workspace/projects/abc?organisation=org"),
    "/workspace/projects/abc?organisation=org",
  );
  for (const v of [
    "https://evil.test",
    "//evil.test",
    "/security-check?next=/security-check",
    "/login",
    "/api/security",
    "/\\evil.test",
  ])
    assert.equal(navigation.securityReturnPath(v), "/workspace");
});
test("email is masked; auth errors never expose raw provider messages", () => {
  assert.equal(
    navigation.maskedSecurityEmail("recipient@example.test"),
    "re***@example.test",
  );
  assert.equal(
    errors.securityError(new Error("raw token/provider secret")).code,
    "AUTH_ERROR",
  );
  for (const code of [
    "CODE_INVALID",
    "CODE_EXPIRED",
    "CHALLENGE_EXPIRED",
    "SEND_FAILED",
    "RATE_LIMITED",
    "SESSION_MISSING",
    "MFA_NOT_CONFIGURED",
  ])
    assert.equal(errors.securityError(new Error(code)).code, code);
});
test("reserve creates only a hash, expiry and actual configured six-digit response", async () => {
  await reset();
  const result = await reserve();
  assert.equal(result.codeLength, 6);
  assert.ok(Date.parse(result.expiresAt) > Date.now());
  const row = (await db.query("select * from v2_email_mfa_challenges")).rows[0];
  assert.equal(row.code_hash, hash);
  assert.equal(row.session_id, session);
});
test("rapid resend is rejected atomically and retains original challenge", async () => {
  await reset();
  await reserve();
  await assert.rejects(reserve(2), /RATE_LIMITED/);
  assert.equal(
    (await db.query("select status from v2_email_mfa_challenges")).rows[0]
      .status,
    "pending",
  );
});
test("resend after cooldown supersedes only current-session pending challenge", async () => {
  await reset();
  await reserve();
  await db.exec(
    "update v2_email_mfa_challenges set created_at=now()-interval '31 seconds' where user_id='" +
      user +
      "'",
  );
  await reserve(2);
  const rows = (
    await db.query("select status from v2_email_mfa_challenges order by id")
  ).rows;
  assert.deepEqual(
    rows.map((r) => r.status),
    ["cancelled", "pending"],
  );
});
test("incorrect code persists failed attempt without granting verification", async () => {
  await reset();
  await reserve();
  assert.equal((await verify(1, bad)).error, "CODE_INVALID");
  assert.equal(
    (await db.query("select attempts from v2_email_mfa_challenges")).rows[0]
      .attempts,
    1,
  );
  assert.equal(
    (await db.query("select count(*) n from v2_security_session_verifications"))
      .rows[0].n,
    0,
  );
});
test("attempt limit blocks brute force and correct retry afterwards", async () => {
  await reset();
  await reserve();
  for (let i = 0; i < 5; i++) await verify(1, bad);
  assert.equal((await verify()).error, "CHALLENGE_EXPIRED");
});
test("expired challenge persists expiry and accepts no code", async () => {
  await reset();
  await reserve();
  await db.exec(
    "update v2_email_mfa_challenges set expires_at=now()-interval '1 second' where user_id='" +
      user +
      "'",
  );
  assert.equal((await verify()).error, "CODE_EXPIRED");
  assert.equal(
    (await db.query("select status from v2_email_mfa_challenges")).rows[0]
      .status,
    "expired",
  );
});
test("valid code consumes once and writes server assurance for exactly this session", async () => {
  await reset();
  await reserve();
  assert.equal((await verify()).verified, true);
  assert.equal((await verify()).error, "CHALLENGE_EXPIRED");
  const rows = (
    await db.query("select * from v2_security_session_verifications")
  ).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].session_id, session);
});
test("another authenticated session cannot consume challenge", async () => {
  await reset();
  await reserve();
  await db.query(
    "insert into auth.sessions values($1,$2,null) on conflict do nothing",
    [other, user],
  );
  assert.equal((await verify(1, hash, other)).error, "CHALLENGE_EXPIRED");
  assert.equal(
    (await db.query("select status from v2_email_mfa_challenges")).rows[0]
      .status,
    "pending",
  );
});
test("missing/deleted auth session is rejected", async () => {
  await assert.rejects(verify(1, hash, "unknown"), /SESSION_MISSING/);
});
test("late failure rolls back both consumption and session verification", async () => {
  await reset();
  await reserve();
  await db.exec("begin");
  await verify();
  await db.exec("rollback");
  assert.equal(
    (await db.query("select status from v2_email_mfa_challenges")).rows[0]
      .status,
    "pending",
  );
  assert.equal(
    (await db.query("select count(*) n from v2_security_session_verifications"))
      .rows[0].n,
    0,
  );
});
test("browser cannot call privileged transition RPCs", async () => {
  await db.exec("set role authenticated");
  try {
    await assert.rejects(reserve(), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
});

function harness(initial, sendFailure = false, verifyFailure = false) {
  const cells = [],
    effects = [];
  let cursor = 0;
  const routes = [],
    requests = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requests.push(url);
    if (url.includes("/verify")) {
      if (verifyFailure)
        return {
          ok: false,
          status: 400,
          json: async () => ({
            error: "That verification code is incorrect.",
            code: "CODE_INVALID",
          }),
        };
      initial = {
        ...initial,
        emailCodeVerified: true,
        complete: true,
        activeChallenge: null,
      };
      return { ok: true, status: 200, json: async () => ({ verified: true }) };
    }
    return {
      ok: !sendFailure || !url.includes("/send"),
      status: 200,
      json: async () =>
        url.includes("/send")
          ? sendFailure
            ? { error: "We could not send the verification email." }
            : {
                challengeId: id(1),
                expiresAt: new Date(Date.now() + 600000).toISOString(),
                resendAfter: new Date(Date.now() + 30000).toISOString(),
                codeLength: 6,
              }
          : initial,
    };
  };
  const react = {
    useState: (v) => {
      const i = cursor++;
      if (!(i in cells)) cells[i] = v;
      return [
        cells[i],
        (value) => {
          cells[i] = typeof value === "function" ? value(cells[i]) : value;
        },
      ];
    },
    useMemo: (f) => f(),
    useCallback: (f) => f,
    useRef: (v) => {
      const i = cursor++;
      return cells[i] ?? (cells[i] = { current: v });
    },
    useEffect: (f) => {
      effects.push(f);
    },
  };
  const component = load("v2/app/security-check/security-check-client.tsx", {
    react: react,
    "react/jsx-runtime": {
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    },
    "next/navigation": {
      useRouter: () => ({ replace: (p) => routes.push(p), refresh: () => {} }),
      useSearchParams: () =>
        new URLSearchParams("next=/workspace?organisation=org"),
    },
    "@/lib/supabase/browser": {
      createSupabaseBrowser: () => ({ auth: { mfa: {} } }),
    },
  }).default;
  const render = () => {
    cursor = 0;
    effects.length = 0;
    return component();
  };
  return {
    render,
    routes,
    requests,
    async start() {
      render();
      effects[0]();
      await new Promise((resolve) => setImmediate(resolve));
    },
    restore() {
      globalThis.fetch = previous;
    },
  };
}
function nodes(tree, type) {
  if (Array.isArray(tree)) return tree.flatMap((t) => nodes(t, type));
  if (!tree || typeof tree !== "object") return [];
  return [
    ...(tree.type === type ? [tree] : []),
    ...nodes(tree.props?.children, type),
  ];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join(" ");
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  return tree && typeof tree === "object" ? text(tree.props?.children) : "";
}
const status = {
  email: "recipient@example.test",
  emailCodeRequired: true,
  emailCodeVerified: false,
  totpRequired: false,
  totpVerified: false,
  totpEnrolled: false,
  complete: false,
  activeChallenge: null,
};
test("required check auto-sends and renders labelled OTP input with resend cooldown", async () => {
  const h = harness(status);
  try {
    await h.start();
    const tree = h.render();
    assert.ok(h.requests.includes("/api/security/email-code/send"));
    assert.equal(nodes(tree, "input")[0].props.autoComplete, "one-time-code");
    assert.match(text(tree), /Resend in 30s/);
  } finally {
    h.restore();
  }
});
test("existing challenge resumes without another send", async () => {
  const h = harness({
    ...status,
    activeChallenge: {
      challengeId: id(1),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      resendAfter: new Date(Date.now() - 1000).toISOString(),
      codeLength: 6,
    },
  });
  try {
    await h.start();
    assert.equal(h.requests.length, 1);
    assert.equal(nodes(h.render(), "input").length, 1);
  } finally {
    h.restore();
  }
});
test("send failure visibly offers retry and never shows success", async () => {
  const h = harness(status, true);
  try {
    await h.start();
    const t = text(h.render());
    assert.match(t, /could not send/);
    assert.match(t, /Send code/);
    assert.doesNotMatch(t, /Verification code sent/);
  } finally {
    h.restore();
  }
});
test("policy-complete session redirects safely and still has Continue fallback", async () => {
  const h = harness({ ...status, emailCodeRequired: false, complete: true });
  try {
    await h.start();
    assert.deepEqual(h.routes, ["/workspace?organisation=org"]);
    assert.equal(h.requests.length, 1);
    assert.match(text(h.render()), /Continue to workspace/);
  } finally {
    h.restore();
  }
});
test("TOTP-required user without factor receives setup action", async () => {
  const h = harness({
    ...status,
    emailCodeRequired: false,
    totpRequired: true,
  });
  try {
    await h.start();
    assert.match(text(h.render()), /Set up authenticator/);
  } finally {
    h.restore();
  }
});

function proxyHarness(complete, fail = false) {
  const cookies = [{ name: "refreshed-session", value: "synthetic" }];
  const response = (extra = {}) => ({
    ...extra,
    cookies: { getAll: () => cookies, set: () => {} },
  });
  const api = load("v2/lib/supabase/proxy.ts", {
    "@supabase/ssr": {
      createServerClient: () => ({
        auth: {
          getClaims: async () => ({ data: { claims: { sub: "user" } } }),
        },
      }),
    },
    "next/server": {
      NextResponse: {
        next: () => response({ kind: "next" }),
        json: (body, options) => response({ kind: "json", body, ...options }),
        redirect: (url) => response({ kind: "redirect", url: String(url) }),
      },
    },
    "@/lib/security/status": {
      getSecurityStatus: async () => {
        if (fail) throw new Error("provider secret");
        return { complete };
      },
    },
  });
  return async (pathname) => {
    const previous = [
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ];
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.test";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "synthetic";
    try {
      return await api.updateSession({
        url: "https://app.test" + pathname,
        nextUrl: new URL("https://app.test" + pathname),
        cookies: { getAll: () => [], set: () => {} },
      });
    } finally {
      for (const [key, v] of [
        ["NEXT_PUBLIC_SUPABASE_URL", previous[0]],
        ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", previous[1]],
      ]) {
        if (v === undefined) delete process.env[key];
        else process.env[key] = v;
      }
    }
  };
}
test("required security cannot be bypassed by direct workspace/project/API navigation", async () => {
  const request = proxyHarness(false);
  const result = await request("/workspace/projects/project?organisation=org");
  assert.equal(result.kind, "redirect");
  assert.match(result.url, /security-check\?next=/);
  assert.match(decodeURIComponent(result.url), /organisation=org/);
  const api = await request("/api/people");
  assert.equal(api.status, 403);
  assert.equal(api.body.code, "SECURITY_CHECK_REQUIRED");
});
test("complete server assurance proceeds without a redirect loop", async () => {
  assert.equal((await proxyHarness(true)("/workspace")).kind, "next");
});
test("security endpoints/account setup remain available to satisfy the requirement", async () => {
  const request = proxyHarness(false);
  for (const path of [
    "/api/security/status",
    "/api/security/email-code/send",
    "/security-check",
    "/account",
    "/onboarding",
  ])
    assert.equal((await request(path)).kind, "next");
});
test("security provider failure fails closed and never leaks provider details", async () => {
  const r = await proxyHarness(false, true)("/api/projects");
  assert.equal(r.status, 503);
  assert.equal(r.body.code, "AUTH_ERROR");
  assert.doesNotMatch(r.body.error, /provider secret/);
});

const liveChallenge = {
  challengeId: id(1),
  expiresAt: new Date(Date.now() + 600000).toISOString(),
  resendAfter: new Date(Date.now() - 1000).toISOString(),
  codeLength: 6,
};
test("valid pasted code re-reads server status and returns to intended workspace", async () => {
  const h = harness({ ...status, activeChallenge: liveChallenge });
  try {
    await h.start();
    nodes(h.render(), "input")[0].props.onChange({
      target: { value: "123456" },
    });
    await nodes(h.render(), "form")[0].props.onSubmit({ preventDefault() {} });
    assert.deepEqual(h.routes, ["/workspace?organisation=org"]);
    assert.ok(h.requests.includes("/api/security/email-code/verify"));
    assert.match(text(h.render()), /Continue to workspace/);
  } finally {
    h.restore();
  }
});
test("invalid code stays editable on Security Check, not account setup/expiry", async () => {
  const h = harness({ ...status, activeChallenge: liveChallenge }, false, true);
  try {
    await h.start();
    nodes(h.render(), "input")[0].props.onChange({
      target: { value: "123456" },
    });
    await nodes(h.render(), "form")[0].props.onSubmit({ preventDefault() {} });
    assert.equal(h.routes.length, 0);
    assert.match(text(h.render()), /verification code is incorrect/);
    assert.equal(nodes(h.render(), "input").length, 1);
  } finally {
    h.restore();
  }
});
test("expired UI shows new-code option and disables verification", async () => {
  const h = harness({
    ...status,
    activeChallenge: {
      ...liveChallenge,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    },
  });
  try {
    await h.start();
    const tree = h.render();
    assert.match(text(tree), /has expired/);
    const verify = nodes(tree, "button").find((b) => text(b) === "Verify");
    assert.equal(verify.props.disabled, true);
    assert.match(text(tree), /Resend code/);
  } finally {
    h.restore();
  }
});
test("AAL2 session meeting configured policy receives no new challenge", async () => {
  const h = harness({
    ...status,
    emailCodeRequired: false,
    totpRequired: true,
    totpEnrolled: true,
    totpVerified: true,
    currentLevel: "aal2",
    nextLevel: "aal2",
    complete: true,
  });
  try {
    await h.start();
    assert.equal(h.requests.length, 1);
    assert.equal(h.routes.length, 1);
  } finally {
    h.restore();
  }
});

function statusFixture({
  aal = "aal1",
  emailRequired = true,
  totpRequired = false,
  verified = false,
  failure = false,
} = {}) {
  const filters = [];
  const admin = {
    from: (table) => {
      const query = {
        select: () => query,
        eq: (k, v) => {
          filters.push([table, k, v]);
          return query;
        },
        gt: () => query,
        not: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({
          data:
            table === "v2_security_session_verifications" && verified
              ? { id: "verification" }
              : null,
          error: failure ? { message: "private database detail" } : null,
        }),
      };
      return query;
    },
  };
  const api = load("v2/lib/security/status.ts", {
    "@/lib/security/session": {
      requireAuthSessionIdentity: async () => ({
        userId: "user",
        sessionId: "session",
        email: "recipient@example.test",
      }),
    },
    "@/lib/security/policy": {
      resolveSecurityPolicy: async () => ({
        emailCodeMode: emailRequired ? "required" : "optional",
        totpMode: totpRequired ? "required" : "optional",
      }),
    },
    "@/lib/supabase/admin": { createSupabaseAdmin: () => admin },
    "@/lib/supabase/server": {
      createSupabaseServer: async () => ({
        auth: {
          mfa: {
            getAuthenticatorAssuranceLevel: async () => ({
              data: { currentLevel: aal, nextLevel: aal },
            }),
            listFactors: async () => ({ data: { totp: [] } }),
          },
        },
      }),
    },
  });
  return { api, filters };
}
test("actual status uses policy and authenticated session, not organisation role", async () => {
  const h = statusFixture();
  const result = await h.api.getSecurityStatus();
  assert.equal(result.complete, false);
  assert.equal(result.emailCodeRequired, true);
  assert.equal(result.totpRequired, false);
  assert.equal(result.currentLevel, "aal1");
  assert.ok(
    h.filters.some(([, k, v]) => k === "session_id" && v === "session"),
  );
});
test("server session email assurance completes email-only policy without AAL elevation", async () => {
  const h = statusFixture({ verified: true });
  const r = await h.api.getSecurityStatus();
  assert.equal(r.complete, true);
  assert.equal(r.currentLevel, "aal1");
});
test("email verification never satisfies a separately required authenticator", async () => {
  assert.equal(
    (
      await statusFixture({
        verified: true,
        totpRequired: true,
      }).api.getSecurityStatus()
    ).complete,
    false,
  );
  assert.equal(
    (
      await statusFixture({
        verified: true,
        totpRequired: true,
        aal: "aal2",
      }).api.getSecurityStatus()
    ).complete,
    true,
  );
  assert.equal(
    (
      await statusFixture({
        verified: true,
        totpRequired: true,
        aal: "unknown",
      }).api.getSecurityStatus()
    ).complete,
    false,
  );
});
test("optional-policy user is complete and database failures do not downgrade security", async () => {
  assert.equal(
    (await statusFixture({ emailRequired: false }).api.getSecurityStatus())
      .complete,
    true,
  );
  await assert.rejects(
    statusFixture({ failure: true }).api.getSecurityStatus(),
    /AUTH_ERROR/,
  );
});
