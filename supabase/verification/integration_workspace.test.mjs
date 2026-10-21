import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), root = path.resolve(import.meta.dirname, '../..');
const ts = require(path.join(root, 'v2/node_modules/typescript'));
const react = require(path.join(root, 'v2/node_modules/react'));
const { renderToStaticMarkup } = require(path.join(root, 'v2/node_modules/react-dom/server'));
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name === '@/lib/integrations/entitlements') return { resolveOrganisationEntitlement: async () => ({enabled:true,source:'subscription_plan'}), requireIntegrationEntitlement: async () => {} };
    if (name === 'server-only') return {};
    if (name === '@/components/integrations/retry-status') return { RetryIntegrationStatus: () => react.createElement('button', null, 'Retry') };
    if (name.endsWith('.module.css')) return { default: {} };
    if (name === 'next/link') return { default: ({ children, ...props }) => react.createElement('a', props, children) };
    if (name.startsWith('@/')) return load('v2/' + name.slice(2) + (name.includes('components/') ? '.tsx' : '.ts'), mocks);
    if (name.startsWith('./')) return load(path.posix.join(path.posix.dirname(file), name + (fs.existsSync(path.join(root,path.posix.join(path.posix.dirname(file), name + '.tsx')))?'.tsx':'.ts')), mocks);
    try { return require(path.join(root, 'v2/node_modules', name)); } catch { return require(name); }
  }, exports);
  return exports;
}
const presentation = load('v2/lib/integrations/presentation.ts');
test('status labels distinguish platform readiness from tenant connection', () => {
  assert.equal(presentation.integrationStatus('not_connected', false), 'Platform Setup Required');
  assert.equal(presentation.integrationStatus('not_connected'), 'Not Connected');
  assert.equal(presentation.integrationStatus('attention_required'), 'Attention Required');
  assert.equal(presentation.integrationStatus('connected'), 'Connected');
});
test('callback origin allows local development but refuses insecure hosted and production URLs', () => {
  const old = process.env.VERCEL; delete process.env.VERCEL;
  try {
    assert.equal(presentation.integrationOrigin('http://localhost:3001', 'development'), 'http://localhost:3001');
    for (const url of ['http://example.test', 'https://user:secret@example.test', 'https://example.test/path', 'https://example.test/?token=secret']) assert.throws(() => presentation.integrationOrigin(url, 'development'));
    assert.throws(() => presentation.integrationOrigin('http://localhost:3001', 'production'));
    process.env.VERCEL = '1'; assert.throws(() => presentation.integrationOrigin('http://localhost:3001', 'development'));
  } finally { if (old === undefined) delete process.env.VERCEL; else process.env.VERCEL = old; }
});
test('readiness returns safe flags, never tests KMS before configured authorised management', async () => {
  let calls = 0, configured = false;
  const readiness = load('v2/lib/integrations/readiness.ts', { './sharepoint': { microsoftConfig: () => ({ clientSecret: 'SYNTHETIC-SECRET' }) }, './xero': { xeroConfig: () => { if (!configured) throw Error(); return {}; } }, './credential-crypto': { integrationCredentialReady: async () => { calls++; return false; } } });
  assert.equal((await readiness.providerReadiness('sharepoint', true)).connectReady, true);
  assert.equal((await readiness.providerReadiness('xero', true)).connectReady, false); assert.equal(calls, 0);
  configured = true; assert.equal((await readiness.providerReadiness('xero', false)).kmsReady, null); assert.equal(calls, 0);
  const result = await readiness.providerReadiness('xero', true); assert.equal(result.connectReady, false); assert.equal(calls, 1); assert.ok(!JSON.stringify(result).includes('SECRET'));
});
function routeFixture(org = 'org-a') {
  const events = [], updates = [], runtime={ready:true};
  const connection={id:'connection',microsoft_tenant_verified_at:'2026-10-12T00:00:00Z',tenant_id:'11111111-1111-4111-8111-111111111111',status:'setup_required'};
  const site = { id: 'site-record', verified_at:'2026-10-12T00:00:00Z', organisation_id: org, site_id: 'example.sharepoint.com,11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222', drive_id: 'drive', drive_name: 'Documents' };
  const admin = { from(table) {
    const query = { select() { return this; }, eq(key, value) { events.push(['eq', table, key, value]); return this; }, update(value) { updates.push([table, value]); return this; }, insert(value) { events.push(['insert', table, value]); return this; }, upsert() { return this; }, async single() { return { data: table === 'v2_sharepoint_sites' ? site : { id: 'saved' } }; }, then(resolve) { resolve({ data: table==='v2_document_destinations'?[{site_id:site.id,is_active:true,context:'training',filename_template:'{person_id}',access_profile_id:'profile',root_path:''}]:table==='v2_integration_access_profiles'?[{id:'profile',native_mode:'inherit',read_capability:'training.view',manage_capability:'training.manage',classification:'operational'}]:[], error: null }); } };
    return query;
  } };
  const graph = { site: async () => { events.push(['site']); return { id: site.site_id, webUrl: 'https://example.sharepoint.com/sites/Operations' }; }, drives: async () => [{ id: 'drive', name: 'Documents' }], root: async () => ({ id: 'root' }), upload: async () => { events.push(['upload']); return { id: 'test-file', eTag: 'version-1' }; }, metadata: async () => { events.push(['metadata']); }, deleteTestItem: async () => { events.push(['cleanup']); } };
  const route = load('v2/app/api/integrations/sharepoint/route.ts', { '@/lib/integrations/server': { integrationContext: async (requested) => { if (requested !== org) throw Error('INTEGRATION_ACCESS_DENIED'); return { org, admin, context: { userId: 'actor' } }; }, loadIntegration: async () => connection, integrationAudit: async (...args) => events.push(['audit', args[3]]), integrationError: e => ({ code: e.message }) }, '@/lib/integrations/readiness': {providerReadiness:async()=>({configured:true}),microsoftDiagnostics:()=>({})}, '@/lib/integrations/sharepoint': { graphForSite: async scope => {events.push(["graph-scope",scope]);return graph;}, microsoftConfig: () => {if(!runtime.ready)throw Error('INTEGRATION_SETUP_REQUIRED');return { origin: 'http://localhost:3001', clientId: 'app' };}, tenantId: v => v } });
  const post = (action, extra = {}, origin = 'http://localhost:3001') => route.POST({ headers: new Headers({ origin }), nextUrl: new URL('http://localhost:3001/api/integrations/sharepoint'), json: async () => ({ organisation: org, action, site: site.id, ...extra }) });
  return { post, events, updates, graph,connection,site,runtime };
}
test('SharePoint library listing resumes from saved org-scoped site after refresh', async () => {
  const f = routeFixture(), r = await f.post('libraries'); assert.equal(r.status, 200); assert.equal((await r.json()).drives[0].id, 'drive'); assert.deepEqual(f.updates, []); assert.ok(f.events.some(e => e[2] === 'organisation_id' && e[3] === 'org-a'));
});
test('saving library does not complete setup; explicit finish rechecks site and drive', async () => {
  const f = routeFixture(); assert.equal((await f.post('library', { drive: 'drive' })).status, 200); assert.equal(f.updates.at(-1)[1].status, 'setup_required');
  assert.equal((await f.post('finish')).status, 200); assert.equal(f.updates.at(-1)[1].status, 'connected'); assert.equal(f.events.filter(e => e[0] === 'site').length, 2);
});
test('ordinary health is read-only at provider; explicit synthetic upload always cleans its file', async () => {
  const f = routeFixture(); await f.post('health'); assert.ok(!f.events.some(e => e[0] === 'upload'));
  await f.post('test_upload'); assert.deepEqual(f.events.filter(e => ['upload', 'metadata', 'cleanup'].includes(e[0])).map(e => e[0]), ['upload', 'metadata', 'cleanup']);
  assert.ok(f.events.some(e => e[0] === 'audit' && e[1] === 'test_upload_cleaned'));
});
test('SharePoint verification rejects wrong org and cross-origin mutations', async () => {
  const f = routeFixture(); assert.equal((await f.post('health', { organisation: 'org-b' })).status, 400); assert.equal((await f.post('health', {}, 'https://attacker.test')).status, 400); assert.equal(f.events.length, 0);
});
test('Connect creates server state and audit, scopes HttpOnly cookie, returns real consent URL', async () => {
  const f = routeFixture(); const r = await f.post('connect', { tenant_id: '11111111-1111-4111-8111-111111111111' });
  const url = new URL((await r.json()).url); assert.equal(url.hostname, 'login.microsoftonline.com'); assert.ok(url.searchParams.get('state').length >= 40); assert.match(r.headers.get('set-cookie'), /HttpOnly/i);
  const stored = f.events.find(e => e[0] === 'insert')[2]; assert.notEqual(stored.state_hash, url.searchParams.get('state')); assert.equal(stored.organisation_id, 'org-a'); assert.equal(stored.actor_id, 'actor'); assert.ok(f.events.some(e => e[1] === 'reconnect_started'));
});
test('different Microsoft tenant reconnect fails before state creation', async () => {
  const f = routeFixture(); assert.equal((await f.post('connect', { tenant_id: 'different-tenant' })).status, 400); assert.equal(f.events.length, 0);
});
test('lost site permission records safe attention status without provider bodies', async () => {
  const f = routeFixture(); f.graph.site = async () => { throw Error('INTEGRATION_SITE_PERMISSION_REQUIRED'); };
  assert.equal((await f.post('health')).status, 400); assert.equal(f.updates.at(-1)[1].status, 'attention_required'); assert.equal(f.updates.at(-1)[1].error_category, 'INTEGRATION_SITE_PERMISSION_REQUIRED');
  assert.equal(presentation.integrationStatus('attention_required', true, 'INTEGRATION_SITE_PERMISSION_REQUIRED'), 'Permission Required');
});
test('test-file cleanup failures are audited and never reported as successful uploads', async () => {
  const f = routeFixture(); f.graph.deleteTestItem = async () => { throw Error('provider-private-body'); };
  const r = await f.post('test_upload'); assert.equal(r.status, 400); const safe = await r.json(); assert.equal(safe.code, 'INTEGRATION_TEST_CLEANUP_REQUIRED'); assert.ok(!JSON.stringify(safe).includes('private-body')); assert.ok(f.events.some(e => e[1] === 'test_upload_cleanup_failed')); assert.ok(!f.events.some(e => e[1] === 'test_upload_cleaned'));
});
test('site URL resolution is constrained to SharePoint HTTPS and never performs tenant-wide discovery', async () => {
  const oldFetch=global.fetch, oldEnv={...process.env}, tenant='11111111-1111-4111-8111-111111111111', calls=[];
  Object.assign(process.env,{TTTRACKER_MICROSOFT_CLIENT_ID:'app',TTTRACKER_MICROSOFT_CLIENT_SECRET:'SYNTHETIC',NEXT_PUBLIC_APP_URL:'https://example.test'});
  global.fetch=async(url)=>{calls.push(url);return url.includes('/token')?Response.json({access_token:'x.'+Buffer.from(JSON.stringify({tid:tenant,appid:'app',roles:['Sites.Selected']})).toString('base64url')+'.x'}):Response.json({id:'site',webUrl:'https://example.sharepoint.com/sites/Operations'});};
  try{
    const graph=await load('v2/lib/integrations/sharepoint.ts').graphForSite({tenant_id:tenant});await graph.resolveSite('https://example.sharepoint.com/sites/Operations');assert.match(calls.at(-1),/\/sites\/example.sharepoint.com:\/sites\/Operations$/);
    for(const url of ['http://example.sharepoint.com/sites/Operations','https://attacker.test/sites/Operations','https://example.sharepoint.com/sites/Operations?token=secret','https://example.sharepoint.com:444/sites/Operations'])await assert.rejects(graph.resolveSite(url),/SITE_URL_INVALID/);
    assert.equal(calls.length,2);assert.ok(!calls.some(url=>url.includes('search=')));
  }finally{global.fetch=oldFetch;process.env=oldEnv;}
});
function ui(Component, data, tab) {
  let index = 0;
  const hooks = { useState: initial => { const current = index++; return [current === 0 ? data : current === 3 ? tab : typeof initial === 'function' ? initial() : initial, () => {}]; }, useEffect() {}, useCallback: fn => fn, useRef: initial => ({ current: initial }) };
  const mocks = { react: hooks, '@/components/people/configuration-surface': { ConfigurationSurface: 'dialog' }, '@/components/people/token-input': { TokenInput: 'token-input' }, '@/components/people/people-controls': { PeoplePicker: 'people-picker' }, './timesheet-preflight': { TimesheetPreflight: 'timesheet-preflight' } };
  const component = load(`v2/components/integrations/${Component}-settings.tsx`, mocks);
  return renderToStaticMarkup(component[Component === 'sharepoint' ? 'SharePointSettings' : 'XeroSettings']({ organisation: 'org-a', manage: true, permissions: { 'integrations.xero.manage': true } }));
}
test('SharePoint UI shows safe platform state and disables real connection until configured', () => {
  const html = ui('sharepoint', { configured: false, sites: [], destinations: [], profiles: [], jobs: [] }, 'Tenant'); assert.match(html, /Microsoft Integration Setup Required/); assert.match(html, /disabled=""[^>]*>Connect Microsoft 365/); assert.doesNotMatch(html, /client_secret/);
});
test('site setup exposes grant guidance and URL input rather than broad discovery', () => {
  const html = ui('sharepoint', { configured: true, sites: [], destinations: [], profiles: [], applicationId: 'app', connection: { tenant_id: 'tenant',microsoft_tenant_verified_at:'2026-10-12T00:00:00Z',status:'setup_required' } }, 'Site'); assert.match(html, /SharePoint Site URL/); assert.match(html, /View Grant Instructions/); assert.match(html, /Sites.Selected/);
});
test('Xero UI distinguishes missing application and blocked KMS storage; tenant selection is explicit', () => {
  const html = ui('xero', { configured: true, credentialReady: false, candidates: [{ id: 'c', tenantId: 't', tenantName: 'Synthetic Company' }] }, 'Connection'); assert.match(html, /Secure integration credential storage/); assert.match(html, /Choose Xero Organisation/); assert.match(html, /Connect Selected Organisation/); assert.match(html, /disabled=""[^>]*>Connect Xero/);
});
test('integration home renders only permitted providers with setup and management actions', async () => {
  const mocks = {
    '@/lib/integrations/server': { loadIntegration: async (_, provider) => provider === 'sharepoint' ? { status: 'connected', last_success_at: '2026-10-12T00:35:00Z' } : null },
    '@/lib/integrations/readiness': { providerReadiness: async provider => ({ configured: provider === 'sharepoint', kmsReady: false }) },
    '@/lib/supabase/admin': { createSupabaseAdmin: () => ({ from: table => { const query = { select() { return this; }, eq() { return this; }, limit() { return this; }, maybeSingle() { return this; }, then(resolve) { resolve({ data: table === 'v2_sharepoint_sites' ? [{ site_name: 'Operations', drive_name: 'Documents' }] : null, count: 8 }); } }; return query; } }) },
  };
  const { IntegrationHub } = load('v2/components/integrations/integration-hub.tsx', mocks);
  const html = renderToStaticMarkup(await IntegrationHub({ organisation: 'org-a', permissions: { 'integrations.sharepoint.view': true, 'integrations.sharepoint.manage': true, 'integrations.xero.view': true, 'integrations.xero.manage': true } }));
  assert.match(html, /Operations/); assert.match(html, /8 destinations configured/); assert.match(html, /Platform Setup Required/); assert.match(html, /12\/10\/2026/); assert.match(html, /sharepoint\?organisation=org-a/); assert.match(html, />Manage</);
  const limited = renderToStaticMarkup(await IntegrationHub({ organisation: 'org-a', permissions: { 'integrations.sharepoint.view': true } })); assert.match(limited, />Xero</); assert.match(limited, /Read-only/);
});
function xeroRouteFixture({ ready = true, manage = true, org = 'org-a' } = {}) {
  const events = [];
  const admin = { from(table) { const query = { select() { return this; }, eq() { return this; }, gt() { return this; }, insert(value) { events.push(['insert', table, value]); return this; }, upsert(value) { events.push(['upsert', table, value]); return this; }, update(value) { events.push(['update', table, value]); return this; }, delete() { events.push(['delete', table]); return this; }, async single() { return { data: { candidates: [{ id: 'connection-x', tenantId: 'tenant-x', tenantName: 'Synthetic Xero' }, { id: 'connection-y', tenantId: 'tenant-y', tenantName: 'Another Xero' }] } }; }, then(resolve) { resolve({ error: null }); } }; return query; } };
  const route = load('v2/app/api/integrations/xero/route.ts', {
    '@/lib/integrations/server': { integrationContext: async (requested, provider, action) => { if (requested !== org || (!manage && action === 'manage')) throw Error('INTEGRATION_ACCESS_DENIED'); events.push(['authorize', action]); return { org, admin, context: { userId: 'actor', permissions: { 'xero.people.map': true } } }; }, loadIntegration: async () => ({ id: 'integration', status: 'setup_required' }), integrationAudit: async (...args) => events.push(['audit', args[3]]), integrationError: e => ({ code: e.message }) },
    '@/lib/integrations/credential-crypto': { integrationCredentialReady: async () => ready },
    '@/lib/integrations/xero': { xeroConfig: () => ({ clientId: 'app', redirectUri: 'http://localhost:3001/api/integrations/xero/callback' }), xeroAccessToken: async () => 'SYNTHETIC', xeroConnections: async () => [{ id: 'connection-x', tenantId: 'tenant-x' }, { id: 'connection-y', tenantId: 'tenant-y' }], xeroRead: async () => [{ id: 'employee', name: 'Synthetic Person' }] },
  });
  return { events, post: (action, extra = {}) => route.POST({ headers: new Headers({ origin: 'http://localhost:3001' }), nextUrl: new URL('http://localhost:3001/api/integrations/xero'), json: async () => ({ organisation: org, action, ...extra }) }) };
}
test('Xero Connect starts provider OAuth with server-created actor/org state when KMS ready', async () => {
  const f = xeroRouteFixture(), r = await f.post('connect', { features: ['employee_mapping'], payroll_region: 'AU' });
  assert.equal(r.status, 200); const url = new URL((await r.json()).url); assert.equal(url.hostname, 'login.xero.com'); assert.equal(url.searchParams.get('scope'), 'openid offline_access payroll.employees.read');
  const state = f.events.find(e => e[0] === 'insert')[2]; assert.equal(state.organisation_id, 'org-a'); assert.equal(state.actor_id, 'actor'); assert.notEqual(state.state_hash, url.searchParams.get('state')); assert.match(r.headers.get('set-cookie'), /HttpOnly/);
});
test('Xero KMS failure prevents OAuth state and settings mutation', async () => {
  const f = xeroRouteFixture({ ready: false }), r = await f.post('connect'); assert.equal(r.status, 400); assert.equal((await r.json()).code, 'INTEGRATION_CREDENTIAL_STORAGE_UNAVAILABLE'); assert.ok(!f.events.some(e => e[0] === 'insert' || e[0] === 'upsert'));
});
test('explicit Xero tenant selection persists selected tenant, never the first candidate', async () => {
  const f = xeroRouteFixture(), r = await f.post('select_tenant', { tenant_id: 'tenant-y' }); assert.equal(r.status, 200); assert.equal(f.events.find(e => e[0] === 'update' && e[1] === 'v2_integrations')[2].tenant_id, 'tenant-y');
  assert.equal((await f.post('select_tenant', { tenant_id: 'unknown' })).status, 400);
});
test('employee lookup needs mapping and provider view, not connection management', async () => {
  const f = xeroRouteFixture({ manage: false }); assert.equal((await f.post('search_employees')).status, 200); assert.ok(f.events.some(e => e[0] === 'authorize' && e[1] === 'view')); assert.equal((await f.post('connect')).status, 400);
});
function catalogueFixture({ configured = false, connection = null, failure = false, entitled = true } = {}) {
  let reads = 0;
  const { IntegrationHub } = load('v2/components/integrations/integration-hub.tsx', {
    '@/lib/integrations/entitlements': { resolveOrganisationEntitlement: async () => ({ enabled: entitled, source: 'subscription_plan' }) },
    '@/lib/integrations/server': { loadIntegration: async () => { reads++; return connection; } },
    '@/lib/integrations/readiness': { providerReadiness: async () => { if (failure) throw Error('private provider error'); return { configured, kmsReady: configured }; } },
    '@/lib/supabase/admin': { createSupabaseAdmin: () => ({ from: () => { const query = { select() { return this; }, eq() { return this; }, limit() { return this; }, maybeSingle() { return this; }, then(resolve) { resolve({ data: null, count: 0 }); } }; return query; } }) },
  });
  return { render: async permissions => renderToStaticMarkup(await IntegrationHub({ organisation: 'synthetic-org', permissions })), reads: () => reads };
}
test('Settings view alone always renders both catalogue cards without provider queries', async () => {
  const f = catalogueFixture(), html = await f.render({ 'organisation.settings.view': true });
  assert.match(html, /<h2>SharePoint<\/h2>/); assert.match(html, /<h2>Xero<\/h2>/); assert.equal((html.match(/Platform Setup Required/g) ?? []).length, 2); assert.equal(f.reads(), 0); assert.doesNotMatch(html, /href=.*integrations\/sharepoint/);
});
test('zero integration rows still renders both Not Connected cards and real connect routes', async () => {
  const f = catalogueFixture({ configured: true }), html = await f.render({ 'organisation.settings.view': true, 'integrations.sharepoint.view': true, 'integrations.sharepoint.manage': true, 'integrations.xero.view': true, 'integrations.xero.manage': true });
  assert.equal((html.match(/>Not Connected</g) ?? []).length, 2); assert.match(html, /Connect Microsoft 365/); assert.match(html, /Connect Xero/); assert.equal(f.reads(), 2);
});
test('read-only provider viewers see cards and status without manage actions', async () => {
  const html = await catalogueFixture({ configured: true, connection: { status: 'connected' } }).render({ 'organisation.settings.view': true, 'integrations.sharepoint.view': true, 'integrations.xero.view': true });
  assert.equal((html.match(/>Connected</g) ?? []).length, 2); assert.equal((html.match(/Read-only/g) ?? []).length, 2); assert.doesNotMatch(html, /href=/);
});
test('provider deny cannot be overridden by catalogue view or manage grant', async () => {
  const f = catalogueFixture({ configured: true }), html = await f.render({ 'organisation.settings.view': true, 'integrations.sharepoint.view': false, 'integrations.sharepoint.manage': true });
  assert.match(html, /SharePoint/); assert.match(html, /Xero/); assert.match(html, /Connection Details Restricted/); assert.equal(f.reads(), 0); assert.doesNotMatch(html, /Connect SharePoint|>Manage</);
});
test('readiness failures keep both cards with safe unavailable state and Retry', async () => {
  const html = await catalogueFixture({ failure: true }).render({ 'organisation.settings.view': true });
  assert.match(html, /SharePoint/); assert.match(html, /Xero/); assert.equal((html.match(/Status Unavailable/g) ?? []).length, 2); assert.equal((html.match(/>Retry</g) ?? []).length, 2); assert.doesNotMatch(html, /private provider error/);
});
test('no catalogue access produces an explicit denial rather than empty cards', async () => {
  const f = catalogueFixture(), html = await f.render({}); assert.match(html, /do not have permission/); assert.equal(f.reads(), 0);
});
test('loading UI renders two provider shells while configuration is pending', () => {
  const html = renderToStaticMarkup(load('v2/app/workspace/settings/integrations/loading.tsx').default()); assert.match(html, /SharePoint/); assert.match(html, /Xero/); assert.equal((html.match(/Checking configuration/g) ?? []).length, 2);
});

test('not entitled blocks both catalogue actions without hiding supported providers', async () => {
 const html=await catalogueFixture({configured:true,entitled:false}).render({'organisation.settings.view':true,'integrations.sharepoint.view':true,'integrations.sharepoint.manage':true,'integrations.xero.view':true,'integrations.xero.manage':true});
 assert.equal((html.match(/Not Included in Current Plan/g)??[]).length,2);assert.match(html,/SharePoint/);assert.match(html,/Xero/);assert.doesNotMatch(html,/href=|Read-only/);
});
test('entitled managers get Setup Information rather than Read-only before provider configuration', async () => {
 const html=await catalogueFixture().render({'integrations.sharepoint.view':true,'integrations.sharepoint.manage':true,'integrations.xero.view':true,'integrations.xero.manage':true});
 assert.equal((html.match(/Setup Information/g)??[]).length,2);assert.doesNotMatch(html,/Read-only/);
});

test('tenant management requires RBAC before entitlement and cannot inherit Platform Admin authority', async () => {
 let permission=true, entitled=true, adminCalls=0;
 const server=load('v2/lib/integrations/server.ts',{'@/lib/workspace/context':{requireWorkspacePermission:async()=>{if(!permission)throw Error('DENIED');return {organisation:{organisationId:'org-a'},platformAdmin:true};}},'./entitlements':{requireIntegrationEntitlement:async(org)=>{assert.equal(org,'org-a');if(!entitled)throw Error('INTEGRATION_NOT_ENTITLED');}},'@/lib/supabase/admin':{createSupabaseAdmin:()=>{adminCalls++;return {};}}});
 entitled=false;await assert.rejects(server.integrationContext('org-a','xero','manage'),/NOT_ENTITLED/);assert.equal(adminCalls,0);
 permission=false;entitled=true;await assert.rejects(server.integrationContext('org-a','sharepoint','manage'),/DENIED/);assert.equal(adminCalls,0);
});
test('runtime entitlement resolver fails closed, checks restored connections, scopes to requested organisation',async()=>{
 let enabled=false,check=true,error=null;
 const helper=load('v2/lib/integrations/entitlements.ts',{'@/lib/supabase/admin':{createSupabaseAdmin:()=>({rpc:async(_,args)=>{assert.equal(args.p_organisation_id,'org-a');return {data:{enabled,available:true,source:'organisation_override'},error};},from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{entitlement_check_required:check},error})})})}});
 await assert.rejects(helper.requireIntegrationEntitlement('org-a','xero',true),/NOT_ENTITLED/);enabled=true;await assert.rejects(helper.requireIntegrationEntitlement('org-a','xero',true),/CHECK_REQUIRED/);await helper.requireIntegrationEntitlement('org-a','xero',false);check=false;await helper.requireIntegrationEntitlement('org-a','xero',true);error={message:'synthetic database detail'};await assert.rejects(helper.requireIntegrationEntitlement('org-a','xero'),/ENTITLEMENT_UNAVAILABLE/);
});
test('plan preview honours overrides and global disable instead of plan names',()=>{
 const {previewEnabled}=load('v2/lib/platform/subscription-preview.ts');const f={id:'provider',lifecycle_status:'available'}, assignments=[{plan_version_id:'p1',feature_id:f.id,enabled:true}];
 assert.equal(previewEnabled(f,'p1',assignments,[]),true);assert.equal(previewEnabled(f,'p2',assignments,[]),false);
 assert.equal(previewEnabled(f,'p2',assignments,[{feature_id:f.id,enabled:true}]),true);assert.equal(previewEnabled(f,'p1',assignments,[{feature_id:f.id,enabled:false}]),false);assert.equal(previewEnabled({...f,lifecycle_status:'disabled'},'p1',assignments,[{feature_id:f.id,enabled:true}]),false);
});

test('Platform Admin workspace renders plan, overrides and safe status without tenant operations',()=>{
 const {PlatformSubscription}=load('v2/components/integrations/platform-subscription.tsx',{'next/navigation':{useRouter:()=>({refresh(){}})}});
 const data={organisation:{id:'org-a',name:'Synthetic Organisation'},features:[{id:'sp',feature_key:'sharepoint',name:'SharePoint Integration',lifecycle_status:'available',feature_type:'integration'},{id:'xero',feature_key:'xero',name:'Xero Integration',lifecycle_status:'available',feature_type:'integration'}],versions:[{id:'plan',name:'Configured Plan',version:1}],assignments:[{plan_version_id:'plan',feature_id:'sp',enabled:true}],subscription:{plan_version_id:'plan'},overrides:[],connections:[],audit:[],sharepointSetup:{siteConfigured:false,siteVerified:false,libraryConfigured:false},readiness:{sharepoint:false,xero:false}};
 const owner=renderToStaticMarkup(react.createElement(PlatformSubscription,{data,canManage:true}));assert.match(owner,/Change Plan/);assert.equal((owner.match(/Manage Entitlement/g)??[]).length,2);assert.match(owner,/Use Plan Default/);assert.match(owner,/Platform Setup Required/);assert.doesNotMatch(owner,/Connect SharePoint|Connect Xero|refresh_token|drive_id/);
 const support=renderToStaticMarkup(react.createElement(PlatformSubscription,{data,canManage:false}));assert.doesNotMatch(support,/Change Plan|Manage Entitlement/);assert.match(support,/View Setup Status/);
});

test('wizard server refuses platform-missing mutations before writes',async()=>{const f=routeFixture();f.runtime.ready=false;assert.equal((await f.post('verify_site',{site_url:'https://example.sharepoint.com/sites/Operations'})).status,400);assert.equal(f.events.length,0);assert.equal(f.updates.length,0);});
test('tenant ID without verified Microsoft consent cannot load libraries',async()=>{const f=routeFixture();f.connection.microsoft_tenant_verified_at=null;assert.equal((await f.post('libraries')).status,400);assert.equal(f.events.length,0);});
test('unverified site cannot load libraries despite a saved drive ID',async()=>{const f=routeFixture();f.site.verified_at=null;const r=await f.post('libraries');assert.equal(r.status,400);assert.equal((await r.json()).code,'INTEGRATION_SITE_PERMISSION_REQUIRED');assert.ok(!f.events.some(e=>e[0]==='site'));});
test('different library requires confirmation and preserves destination rows by suspension',async()=>{const f=routeFixture();f.graph.drives=async()=>[{id:'replacement-drive',name:'Replacement'}];assert.equal((await f.post('library',{drive:'replacement-drive'})).status,400);assert.equal(f.updates.length,0);assert.equal((await f.post('library',{drive:'replacement-drive',confirm_change:'true'})).status,200);assert.ok(f.updates.some(([table,value])=>table==='v2_document_destinations'&&value.is_active===false));assert.equal(f.updates.at(-1)[1].status,'setup_required');assert.equal(f.updates.at(-1)[1].entitlement_check_required,true);});
test('Document Library direct entry with no verified site explains prerequisites',()=>{const html=ui('sharepoint',{configured:true,connection:{tenant_id:'verified-tenant',microsoft_tenant_verified_at:'2026-10-12T00:00:00Z',status:'setup_required'},sites:[],profiles:[],destinations:[],jobs:[]},'Library');assert.match(html,/No verified SharePoint site/);assert.match(html,/Go to SharePoint Site/);assert.doesNotMatch(html,/Choose verified site|Load Document Libraries/);});
test('one verified site is auto-selected and displayed without unnecessary selector',()=>{const html=ui('sharepoint',{configured:true,connection:{tenant_id:'tenant',microsoft_tenant_verified_at:'2026-10-12T00:00:00Z',status:'setup_required'},sites:[{id:'site',site_name:'Synthetic Operations',site_url:'https://example.sharepoint.com/sites/Operations',verified_at:'2026-10-12T00:00:00Z'}],profiles:[],destinations:[],jobs:[]},'Library');assert.match(html,/Synthetic Operations/);assert.match(html,/Load Document Libraries/);assert.doesNotMatch(html,/Choose verified site/);});
test('Microsoft consent callback requires verified application authority before storing tenant proof',async()=>{
 const changes=[],checks=[];let deny=false,expected=null;
 const tenant='11111111-1111-4111-8111-111111111111', state='synthetic-state';
 const route=load('v2/app/api/integrations/sharepoint/callback/route.ts',{'@/lib/integrations/server':{integrationContext:async()=>({context:{userId:'actor'},admin:{rpc:async()=>({data:{integration_id:'connection',expected_tenant:expected}}),from:()=>({update(value){changes.push(value);return this;},eq(){return this;},or(){return this;},select(){return this;},single:async()=>({data:{id:'connection'}})})}}),loadIntegration:async()=>({id:'connection'}),integrationAudit:async()=>{}},'@/lib/integrations/sharepoint':{tenantId:v=>v,verifyMicrosoftTenant:async v=>{checks.push(v);if(deny)throw Error('INTEGRATION_AUTH_FAILED');}}});
 const request=()=>({nextUrl:new URL(`http://localhost:3001/api/integrations/sharepoint/callback?state=${state}&admin_consent=true&tenant=${tenant}`),cookies:{get:()=>({value:`org-a.${state}`})}});
 deny=true;assert.match((await route.GET(request())).headers.get('location'),/consent_failed/);assert.equal(changes.length,0);
 deny=false;expected='different-tenant';assert.match((await route.GET(request())).headers.get('location'),/consent_failed/);assert.equal(changes.length,0);
 expected=null;assert.match((await route.GET(request())).headers.get('location'),/site_permission_required/);assert.equal(changes.length,1);assert.equal(changes[0].tenant_id,tenant);assert.ok(changes[0].microsoft_tenant_verified_at);assert.equal(changes[0].status,'setup_required');assert.equal(checks.length,2);
});


test('normal Microsoft 365 connection requires no manual tenant ID and uses customer discovery consent',async()=>{
 const f=routeFixture();f.connection.tenant_id=null;f.connection.microsoft_tenant_verified_at=null;
 const response=await f.post('connect');assert.equal(response.status,200);
 const url=new URL((await response.json()).url);assert.match(url.pathname,/organizations\/v2.0\/adminconsent/);
 const saved=f.events.find(e=>e[0]==='insert')[2];assert.equal(saved.expected_tenant,null);assert.equal(saved.organisation_id,'org-a');
 const html=ui('sharepoint',{configured:true,connection:null,sites:[],destinations:[],profiles:[]},'Tenant');
 assert.match(html,/Microsoft 365 Connection/);assert.match(html,/Microsoft will securely identify/);
 assert.doesNotMatch(html,/<input[^>]*(?:tenant_id|Tenant ID)/);assert.match(html,/Connect Microsoft 365/);
});

test('Microsoft 365 connected summary shows verified identity, actor and DD/MM/YYYY timestamp',()=>{
 const html=ui('sharepoint',{configured:true,connection:{tenant_id:'verified-tenant',tenant_name:'Synthetic Microsoft Organisation',connected_by_name:'Synthetic Operator',connected_at:'2026-10-12T10:35:00Z',microsoft_tenant_verified_at:'2026-10-12T10:35:00Z',status:'setup_required'},sites:[],destinations:[],profiles:[]},'Tenant');
 for(const label of ['Microsoft 365','Connected','Organisation','Synthetic Microsoft Organisation','Microsoft Tenant ID','verified-tenant','Connected by','Synthetic Operator','12/10/2026','Continue'])assert.ok(html.includes(label),label);
 assert.doesNotMatch(html,/<input[^>]*(?:tenant_id|Tenant ID)/);
});

test('Microsoft callback binds independently verified customer tenants to their initiating TTTracker organisations',async()=>{
 const tenants={'org-a':'11111111-1111-4111-8111-111111111111','org-b':'22222222-2222-4222-8222-222222222222'};
 const stored={},checks=[],filters=[];let wrongActor=false;
 const route=load('v2/app/api/integrations/sharepoint/callback/route.ts',{'@/lib/integrations/server':{
  integrationContext:async org=>({context:{userId:wrongActor?'intruder':`actor-${org}`},admin:{
   rpc:async(_,args)=>({data:args.p_actor===`actor-${args.p_org}`?{integration_id:`connection-${args.p_org}`,expected_tenant:null}:null}),
   from:()=>{let value,org;return {update(v){value=v;return this;},eq(key,v){filters.push([key,v]);if(key==='organisation_id')org=v;return this;},or(){return this;},select(){return this;},single:async()=>{stored[org]=value;return {data:{id:`connection-${org}`}};}};}
  }}),loadIntegration:async org=>({id:`connection-${org}`,...stored[org]}),integrationAudit:async()=>{}
 },'@/lib/integrations/sharepoint':{tenantId:v=>v,verifyMicrosoftTenant:async tenant=>checks.push(tenant)}});
 const request=(org,tenant=tenants[org])=>({nextUrl:new URL(`http://localhost:3001/api/integrations/sharepoint/callback?state=state-${org}&admin_consent=true&tenant=${tenant}`),cookies:{get:()=>({value:`${org}.state-${org}`})}});
 for(const org of Object.keys(tenants)){assert.match((await route.GET(request(org))).headers.get('location'),/site_permission_required/);assert.equal(stored[org].tenant_id,tenants[org]);assert.ok(stored[org].microsoft_tenant_verified_at);}
 assert.deepEqual(checks,Object.values(tenants));assert.ok(filters.some(([key,value])=>key==='id'&&value==='connection-org-b'));
 assert.match((await route.GET(request('org-a',tenants['org-b']))).headers.get('location'),/consent_failed/);assert.equal(stored['org-a'].tenant_id,tenants['org-a']);
 wrongActor=true;assert.match((await route.GET(request('org-b'))).headers.get('location'),/consent_failed/);assert.equal(checks.length,2);
});

test('site configuration keeps each customer Microsoft token scope and rejects another TTTracker organisation',async()=>{
 const a=routeFixture('org-a'),b=routeFixture('org-b');b.connection.tenant_id='22222222-2222-4222-8222-222222222222';
 await a.post('libraries');await b.post('libraries');
 assert.equal(a.events.find(e=>e[0]==='graph-scope')[1].tenant_id,a.connection.tenant_id);
 assert.equal(b.events.find(e=>e[0]==='graph-scope')[1].tenant_id,b.connection.tenant_id);
 const count=a.events.length;assert.equal((await a.post('libraries',{organisation:'org-b'})).status,400);assert.equal(a.events.length,count);
});


test('platform diagnostics keep configuration, KMS and organisation connection separate and exclude secrets',async()=>{
 const old={...process.env};Object.assign(process.env,{NEXT_PUBLIC_APP_URL:'http://localhost:3001',NODE_ENV:'development',TTTRACKER_XERO_ENVIRONMENT:'development',TTTRACKER_MICROSOFT_CLIENT_ID:'SYNTHETIC-APP',TTTRACKER_MICROSOFT_CLIENT_SECRET:'NEVER-RETURN-SECRET',TTTRACKER_XERO_CLIENT_ID:'XERO-APP',TTTRACKER_XERO_CLIENT_SECRET:'NEVER-RETURN-SECRET'});delete process.env.VERCEL;delete process.env.VERCEL_ENV;delete process.env.VERCEL_TARGET_ENV;
 let kms=false,checks=0;
 const helpers=load('v2/lib/platform/integrations.ts',{'@/lib/integrations/readiness':{microsoftDiagnostics:()=>({applicationIdReady:true,clientCredentialReady:true,callbackReady:true}),providerReadiness:async provider=>({connectReady:provider==='sharepoint'||kms,kmsReady:kms})},'@/lib/integrations/sharepoint':{verifyMicrosoftTenant:async()=>{checks++;}},'@/lib/supabase/admin':{createSupabaseAdmin:()=>({from:()=>{const q={select(){return this;},eq(){return this;},is(){return this;},not(){return this;},then(resolve){resolve({count:0,error:null});}};return q;}})}});
 try{
  const workspace=await helpers.platformIntegrationWorkspace();assert.equal(workspace[0].ready,true);assert.equal(workspace[0].connectedOrganisations,0);assert.equal(workspace[1].ready,false);assert.equal(workspace[1].kmsReady,false);
  assert.equal(workspace[0].callbackUrl,'http://localhost:3001/api/integrations/sharepoint/callback');assert.equal(workspace[1].callbackUrl,'http://localhost:3001/api/integrations/xero/callback');
  assert.ok(!JSON.stringify(workspace).includes('NEVER-RETURN'));assert.ok(!JSON.stringify(workspace).includes('SYNTHETIC-APP'));
  kms=true;assert.equal((await helpers.platformProviderReadiness('xero')).ready,true);
  delete process.env.TTTRACKER_MICROSOFT_PLATFORM_DIRECTORY_ID;assert.match((await helpers.platformIntegrationHealth('sharepoint')).message,/no customer tenant/);assert.equal(checks,0);
  process.env.TTTRACKER_MICROSOFT_PLATFORM_DIRECTORY_ID='operator-directory';assert.equal((await helpers.platformIntegrationHealth('sharepoint')).credentialVerified,true);assert.equal(checks,1);
 }finally{process.env=old;}
});

test('platform API authenticates before diagnostics and cannot invoke tenant provider operations',async()=>{
 let permitted=false,reads=0,checks=0,roles;
 const route=load('v2/app/api/platform/integrations/route.ts',{'@/lib/platform/server':{requirePlatformAdmin:async allowed=>{roles=allowed;if(!permitted)throw Error('FORBIDDEN');}},'@/lib/platform/integrations':{platformIntegrationWorkspace:async()=>{reads++;return [{ready:true,connectedOrganisations:2}];},platformIntegrationHealth:async provider=>{checks++;return {provider,ready:true};}}});
 assert.equal((await route.GET()).status,403);assert.equal(reads,0);permitted=true;assert.equal((await route.GET()).status,200);assert.equal(reads,1);
 const request=(origin,provider)=>({headers:new Headers({origin}),nextUrl:new URL('http://localhost:3001/api/platform/integrations'),json:async()=>({provider})});
 assert.equal((await route.POST(request('https://attacker.test','sharepoint'))).status,403);assert.equal(checks,0);
 assert.equal((await route.POST(request('http://localhost:3001','sharepoint'))).status,200);assert.deepEqual(roles,['owner','admin']);assert.equal(checks,1);
 assert.equal((await route.POST(request('http://localhost:3001','documents'))).status,400);assert.equal(checks,1);
});

test('platform integration UI has independent setup routes, safe diagnostics and no customer connection actions',()=>{
 const {PlatformIntegrations}=load('v2/components/integrations/platform-integrations.tsx');
 const data=[{provider:'sharepoint',status:'Ready',ready:true,applicationIdReady:true,credentialReady:true,callbackReady:true,callbackUrl:'http://localhost:3001/api/integrations/sharepoint/callback',environment:'development',connectedOrganisations:0,healthyOrganisations:0,attentionOrganisations:0},{provider:'xero',status:'Setup Required',ready:false,kmsReady:false,environment:'development',connectedOrganisations:0,healthyOrganisations:0,attentionOrganisations:0}];
 const html=renderToStaticMarkup(react.createElement(PlatformIntegrations,{data,canCheck:true}));assert.match(html,/platform-admin\/integrations\/microsoft/);assert.match(html,/platform-admin\/integrations\/xero/);assert.match(html,/Connected Organisations/);assert.doesNotMatch(html,/Connect Microsoft 365<|Connect Xero<|\/workspace\/settings/);
 const detail=renderToStaticMarkup(react.createElement(PlatformIntegrations,{data,provider:'sharepoint',canCheck:true}));assert.match(detail,/Copy Callback URL/);assert.match(detail,/not a customer Tenant ID/);assert.match(detail,/cannot be retrieved or edited/);
 const source=fs.readFileSync(path.join(root,'v2/app/platform-admin/integrations/microsoft/page.tsx'),'utf8');assert.match(source,/await requirePlatformPage\(\)/);assert.match(source,/Back to Platform Integrations/);
});


test('one platform Xero application starts isolated customer OAuth and explicit tenant selections',async()=>{
 const a=xeroRouteFixture({org:'org-a'}),b=xeroRouteFixture({org:'org-b'});
 const aurl=new URL((await (await a.post('connect',{features:['employee_mapping'],payroll_region:'AU'})).json()).url);
 const burl=new URL((await (await b.post('connect',{features:['employee_mapping'],payroll_region:'AU'})).json()).url);
 assert.equal(aurl.searchParams.get('client_id'),burl.searchParams.get('client_id'));assert.notEqual(aurl.searchParams.get('state'),burl.searchParams.get('state'));
 assert.equal(a.events.find(e=>e[0]==='insert')[2].organisation_id,'org-a');assert.equal(b.events.find(e=>e[0]==='insert')[2].organisation_id,'org-b');
 assert.equal((await a.post('select_tenant',{tenant_id:'tenant-x'})).status,200);assert.equal((await b.post('select_tenant',{tenant_id:'tenant-y'})).status,200);
 assert.equal(a.events.find(e=>e[0]==='update'&&e[1]==='v2_integrations')[2].tenant_id,'tenant-x');assert.equal(b.events.find(e=>e[0]==='update'&&e[1]==='v2_integrations')[2].tenant_id,'tenant-y');
 assert.equal((await a.post('select_tenant',{organisation:'org-b',tenant_id:'tenant-y'})).status,400);
});


test('multi-location workspace locks customer configuration until platform and Microsoft connection are ready',()=>{
 for(const connected of [false,true]){
  let index=0;const data={configured:connected,connection:connected?{tenant_id:'tenant-a',tenant_name:'Customer A',microsoft_tenant_verified_at:'2026-10-12T00:00:00Z',status:'setup_required'}:null,sites:[],locations:[],rules:[],profiles:[],jobs:[],types:[],capabilities:[]};
  const hooks={...react,useState:initial=>[index++===0?data:typeof initial==='function'?initial():initial,()=>{}],useEffect(){},useCallback:fn=>fn};
  const {SharePointWorkspace}=load('v2/components/integrations/sharepoint-workspace.tsx',{'react':hooks,'@/components/people/configuration-surface':{ConfigurationSurface:()=>null},'@/components/people/token-input':{TokenInput:()=>null},'@/components/materials/workflow-controls':{ChoicePicker:()=>null}});
  const html=renderToStaticMarkup(react.createElement(SharePointWorkspace,{organisation:'org-a',manage:true,permissions:{}}));
  assert.match(html,connected?/Reconnect Microsoft 365/:/Connect Microsoft 365/);assert.doesNotMatch(html,/Tenant ID.*input|six-step/);
  if(!connected){assert.match(html,/Platform Setup Required/);assert.doesNotMatch(html,/SharePoint management/);}else{assert.match(html,/Add SharePoint Site/);assert.match(html,/0 Ready/);assert.match(html,/Customer A/);assert.doesNotMatch(html,/\(Locked\)/);}
 }
});


test('SharePoint location register flags only locations of a revoked site',()=>{
 let index=0;const data={configured:true,connection:{tenant_id:'tenant-a',tenant_name:'Customer A',microsoft_tenant_verified_at:'yes',status:'connected'},sites:[{id:'site-a',site_name:'Site A',verified_at:'yes',permission_status:'verified',is_active:true},{id:'site-b',site_name:'Site B',verified_at:null,permission_status:'permission_required',is_active:true}],locations:[{id:'loc-a',site_id:'site-a',name:'Healthy location',drive_name:'Documents',is_active:true},{id:'loc-b',site_id:'site-b',name:'Revoked location',drive_name:'Assets',is_active:true}],rules:[],profiles:[],jobs:[],types:[],capabilities:[]};
 const hooks={...react,useState:initial=>[index++===0?data:index===2?'Document Destinations':typeof initial==='function'?initial():initial,()=>{}],useEffect(){},useCallback:fn=>fn};
 const {SharePointWorkspace}=load('v2/components/integrations/sharepoint-workspace.tsx',{'react':hooks,'@/components/people/configuration-surface':{ConfigurationSurface:()=>null},'@/components/people/token-input':{TokenInput:()=>null},'@/components/materials/workflow-controls':{ChoicePicker:()=>null}});
 const html=renderToStaticMarkup(react.createElement(SharePointWorkspace,{organisation:'org-a',manage:true,permissions:{}}));assert.match(html,/Healthy location/);assert.match(html,/Revoked location/);assert.equal((html.match(/Attention Required/g)??[]).length,1);assert.match(html,/tableWrap|<table/);
});


test('document setup catalogue respects enabled modules and preserves configured future contexts',()=>{
 const ux=load('v2/lib/integrations/sharepoint-ux.ts');
 assert.deepEqual(ux.availableDocumentContexts(new Set(['people']),[]),['people','profile_photos','training','onboarding','site_prestarts','general']);
 assert.ok(!ux.availableDocumentContexts(new Set(['projects']),[]).includes('tendering'));
 assert.ok(ux.availableDocumentContexts(new Set(),['tendering']).includes('tendering'));
 const resolver=load('v2/lib/integrations/resolver.ts');
 for(const area of ux.documentAreas)for(const context of area.contexts){const value=ux.suggestedDocumentTemplate(context);const sample=Object.fromEntries([...resolver.contextTokens[context],'year','month','document_type','document_category'].map(k=>[k,k==='issue_date'?'2026-10-13':'Example']));assert.doesNotThrow(()=>resolver.renderPath(value.folder_template,context,sample));assert.doesNotThrow(()=>resolver.renderPath(value.filename_template,context,sample,true));}
});

test('template builder retains canonical tokens and literals while showing human field labels',()=>{
 const builder=load('v2/components/integrations/document-template-builder.tsx',{'@/components/people/token-input':{TokenInput:()=>null}});
 for(const template of ['{employee_number} - {person_display_name}','Text_{training_type}_{issue_date}.pdf','{project_number}/{project_name}/Quality',''])assert.equal(builder.templateParts(template).join(''),template);
 const html=renderToStaticMarkup(react.createElement(builder.DocumentTemplateBuilder,{value:'{employee_number} - {person_display_name}/Training',tokens:['employee_number','person_display_name'],onChange(){}}));assert.match(html,/Employee Number/);assert.match(html,/Employee Name/);assert.match(html,/Add Folder Level/);assert.doesNotMatch(html,/\{employee_number\}/);
});

function simplifiedWorkspace(tab,overrides={},manage=true){
 const data={configured:true,setupReady:true,availableContexts:['training','projects','assets'],connection:{tenant_id:'tenant-a',tenant_name:'Customer A',microsoft_tenant_verified_at:'verified',status:'connected'},sites:[],locations:[],rules:[],profiles:[],jobs:[],types:[],capabilities:[],...overrides};let index=0;
 const hooks={...react,useState:initial=>[index++===0?data:index===2?tab:typeof initial==='function'?initial():initial,()=>{}],useEffect(){},useCallback:fn=>fn};
 const {SharePointWorkspace}=load('v2/components/integrations/sharepoint-workspace.tsx',{'react':hooks,'@/components/people/configuration-surface':{ConfigurationSurface:()=>null},'@/components/people/token-input':{TokenInput:()=>null},'@/components/materials/workflow-controls':{ChoicePicker:()=>null}});
 return renderToStaticMarkup(react.createElement(SharePointWorkspace,{organisation:'org-a',manage,permissions:{}}));
}

test('normal SharePoint sites UI hides Microsoft implementation details and keeps fallback collapsed',()=>{
 const html=simplifiedWorkspace('SharePoint Sites');const normal=html.replace(/<details>[\s\S]*?<\/details>/g,'');
 assert.match(normal,/SharePoint Sites/);assert.match(normal,/Approve Selected/);assert.match(normal,/No SharePoint sites have been added/);assert.doesNotMatch(normal,/Sites\.Selected|Sites\.FullControl|Delegated|Graph|OAuth|Drive ID|service principal|grant ID/i);assert.match(html,/<summary>Advanced \/ Manual Setup/);
});

test('document setup groups existing advanced rules without losing their configuration',()=>{
 const rule={id:'rule',name:'Specific Training',context:'training',location_id:'loc',folder_template:'{employee_number}/Tickets',filename_template:'{training_type}',relationship_type_id:'worker-type',priority:7,is_active:true};const before=JSON.stringify(rule);
 const html=simplifiedWorkspace('Document Setup',{locations:[{id:'loc',name:'Employee Records',is_active:true}],rules:[rule]});assert.match(html,/People/);assert.match(html,/Training Documents/);assert.match(html,/Employee Records/);assert.match(html,/Advanced rule/);assert.match(html,/Not Configured/);assert.equal(JSON.stringify(rule),before);
 const missing=simplifiedWorkspace('Document Setup');assert.match(missing,/create at least one Document Destination/);assert.match(missing,/Add Destination/);
});

test('setup assistant review uses canonical document configuration and does not overwrite configured types',()=>{
 const {DocumentSetupAssistant}=load('v2/components/integrations/document-setup-assistant.tsx',{'@/components/people/configuration-surface':{ConfigurationSurface:({children})=>react.createElement('div',null,children)}});
 const html=renderToStaticMarkup(react.createElement(DocumentSetupAssistant,{locations:[{id:'loc',name:'Employee Records'}],profiles:[],contexts:['people','training','onboarding'],configured:['training'],onSave(){},onClose(){}}));assert.match(html,/Employment Documents/);assert.match(html,/Onboarding Documents/);assert.doesNotMatch(html,/Training Documents/);assert.match(html,/Existing configuration will be retained/);
});


test('editing a canonical advanced rule retains legacy root, review and collision policies',async()=>{
 let saved;const old={location_id:'loc',root_path:'Legacy Root',conflict_policy:'sequence',review_storage:'immediate'};
 const admin={from(table){let updating=false;const chain={select(){return chain},eq(){return chain},neq(){return chain},is(){return chain},limit(){return chain},async maybeSingle(){return {data:null,error:null}},update(values){updating=true;saved=values;return chain},async single(){return {data:updating?{id:'rule'}:table==='v2_integration_access_profiles'?{classification:'operational'}:table==='v2_person_types'?{id:'worker'}:table==='v2_integrations'?{id:'connection'}:table==='v2_sharepoint_locations'?{id:'loc',site_id:'site'}:table==='v2_sharepoint_sites'?{id:'site'}:old,error:null}}};return chain}};
 const route=load('v2/app/api/integrations/sharepoint/workspace/route.ts',{'@/lib/integrations/readiness':{},'@/lib/integrations/sharepoint-setup':{},'@/lib/projects/list':{},'@/lib/integrations/server':{integrationContext:async()=>({org:'org-a',admin,context:{userId:'actor'}}),integrationAudit:async()=>{},integrationError:e=>({message:e.message})},'@/lib/integrations/sharepoint-locations':{connectedMicrosoft:async()=>({id:'connection',tenant_id:'tenant'}),locationScope:async()=>({location:{id:'loc'},site:{id:'site'}})},'@/lib/integrations/sharepoint':{microsoftConfig:()=>({})}});
 const result=await route.POST({headers:new Headers({origin:'http://localhost:3001'}),nextUrl:new URL('http://localhost:3001/api/integrations/sharepoint/workspace'),json:async()=>({organisation:'org-a',action:'rule',id:'rule',name:'Training',context:'training',location_id:'loc',access_profile_id:'profile',folder_template:'{employee_number}/Tickets',filename_template:'{training_type}',relationship_type_id:'worker',priority:7,creation_policy:'first_upload',child_folders:['Certificates']})});
 assert.equal(result.status,200,JSON.stringify(await result.json()));assert.equal(saved.root_path,old.root_path);assert.equal(saved.review_storage,old.review_storage);assert.equal(saved.conflict_policy,old.conflict_policy);assert.equal(saved.priority,7);assert.equal(saved.relationship_type_id,'worker');assert.deepEqual(saved.child_folders,['Certificates']);
});

test('assistant retry preserves completed types and saves canonical People and Project rules',async()=>{
 let state=[2,'employee-loc','project-loc','profile',['training','projects'],[],false,''],footer,closed=0,calls=[],fail=true;
 const hooks={...react};
 // Hooks are called as imported functions, so use an independent cursor.
 let cursor=0;hooks.useState=initial=>{const i=cursor++;return [state[i]??initial,v=>{state[i]=typeof v==='function'?v(state[i]):v}]};
 const {DocumentSetupAssistant}=load('v2/components/integrations/document-setup-assistant.tsx',{react:hooks,'@/components/people/configuration-surface':{ConfigurationSurface:props=>{footer=props.footer;return react.createElement('div',null,props.children)}}});
 const props={locations:[{id:'employee-loc',name:'Employees'},{id:'project-loc',name:'Projects'}],profiles:[{id:'profile',name:'Operational'}],contexts:['training','projects'],configured:[],onClose(){closed++},async onSave(values){calls.push(values);if(values.context==='projects'&&fail)throw new Error('simulated failure')}};
 function render(){cursor=0;renderToStaticMarkup(react.createElement(DocumentSetupAssistant,props));return react.Children.toArray(footer.props.children).at(-1).props.onClick;}
 await render()();assert.deepEqual(state[5],['training']);assert.equal(closed,0);fail=false;await render()();assert.equal(calls.filter(c=>c.context==='training').length,1);assert.equal(calls.filter(c=>c.context==='projects').length,2);assert.equal(calls[0].location_id,'employee-loc');assert.equal(calls.at(-1).location_id,'project-loc');assert.equal(calls[0].creation_policy,'first_upload');assert.equal(calls[0].rename_policy,'keep');assert.equal(closed,1);
});


test('read-only SharePoint overview does not open document setup or site mutations',()=>{
 const html=simplifiedWorkspace('Overview',{},false);assert.doesNotMatch(html,/>Set Up Documents<|>Add SharePoint Site</);assert.match(html,/Connected to Microsoft 365/);
 const sites=simplifiedWorkspace('SharePoint Sites',{},false);assert.match(sites,/<button[^>]*disabled=""[^>]*>Approve Selected/);
});


function documentSaveFixture(options={}) {
 const rows={v2_integrations:[{id:'connection',organisation_id:'org-a',provider:'sharepoint',status:options.status??'attention_required'}],v2_sharepoint_sites:[{id:'site',organisation_id:'org-a',integration_id:'connection',permission_status:options.siteStatus??'permission_required'}],v2_sharepoint_locations:[{id:'loc',organisation_id:options.foreign?'org-b':'org-a',site_id:'site',drive_id:'drive',name:'Docs',is_active:true}],v2_permissions:[{permission_code:'training.view'},{permission_code:'training.edit'}],v2_integration_access_profiles:[],v2_document_destinations:[]};
 if(options.deleted)rows.v2_sharepoint_locations=[];
 const calls=[];const admin={from(table){let filters=[],operation,values,evaluated,maximum;const q={select(){return q},eq(key,value){filters.push(r=>r[key]===value);return q},neq(key,value){filters.push(r=>r[key]!==value);return q},is(key,value){filters.push(r=>(r[key]??null)===value);return q},in(key,values){filters.push(r=>values.includes(r[key]));return q},limit(n){maximum=n;return q},insert(value){operation='insert';values=value;return q},update(value){operation='update';values=value;return q},upsert(value){operation='upsert';values=value;return q},single(){const result=execute();return Promise.resolve(result.data.length===1?{data:result.data[0],error:null}:{data:null,error:{code:'PGRST116'}})},maybeSingle(){const result=execute();return Promise.resolve({data:result.data[0]??null,error:null})},then(resolve,reject){return Promise.resolve(execute()).then(resolve,reject)}};
 function execute(){if(evaluated)return evaluated;let selected=rows[table].filter(r=>filters.every(f=>f(r)));if(operation==='insert'||operation==='upsert'){const existing=rows[table].find(r=>r.id===values.id);if(operation==='insert'||!existing){const value={id:values.id??'saved-rule',...values};rows[table].push(value);selected=[value];calls.push({table,values:value});}else selected=[existing];}if(operation==='update'){selected.forEach(r=>Object.assign(r,values));calls.push({table,values});}if(maximum)selected=selected.slice(0,maximum);return evaluated={data:selected,error:null};}return q;}};
 const route=load('v2/app/api/integrations/sharepoint/workspace/route.ts',{'@/lib/integrations/readiness':{},'@/lib/integrations/sharepoint-setup':{},'@/lib/projects/list':{},'@/lib/integrations/server':{async integrationContext(){if(options.denied)throw new Error('INTEGRATION_ACCESS_DENIED');if(options.notEntitled)throw new Error('INTEGRATION_NOT_ENTITLED');return {org:'org-a',admin,context:{userId:'actor'}}},integrationAudit:async()=>{},integrationError:e=>({code:e.message,message:e.message})},'@/lib/integrations/sharepoint-locations':{connectedMicrosoft(){assert.fail('Configuration must not require a connected Microsoft tenant')},locationScope(){assert.fail('Configuration must not make Graph calls')}},'@/lib/integrations/sharepoint':{microsoftConfig(){assert.fail('Configuration must not require platform credentials')},graphForSite(){assert.fail('No Graph calls while saving')}}});
 const folder='{employee_number} - {person_display_name}/Training/{training_type}';
 return {rows,calls,folder,async post(overrides={}){return route.POST({headers:new Headers({origin:'http://localhost:3001'}),nextUrl:new URL('http://localhost:3001/api/integrations/sharepoint/workspace'),json:async()=>({organisation:'org-a',action:'rule',name:'Training Documents',context:'training',location_id:'loc',folder_template:folder,filename_template:'{employee_number}_{training_type}_{issue_date}',...overrides})});}};
}

test('exact Training setup saves independently of Microsoft health and creates canonical access defaults',async()=>{
 for(const status of ['connected','attention_required','disconnected','setup_required']){
 const f=documentSaveFixture({status});const result=await f.post();assert.equal(result.status,200,JSON.stringify(await result.json()));const rule=f.rows.v2_document_destinations[0];assert.equal(rule.folder_template,f.folder);assert.equal(rule.context,'training');assert.equal(rule.location_id,'loc');assert.equal(rule.creation_policy,'first_upload');assert.equal(rule.priority,0);assert.equal(rule.review_storage,'after_approval');assert.equal(rule.conflict_policy,'version');const profile=f.rows.v2_integration_access_profiles[0];assert.equal(profile.read_capability,'training.view');assert.equal(profile.manage_capability,'training.edit');assert.equal(profile.classification,'operational');assert.equal(rule.access_profile_id,profile.id);assert.match(profile.id,/^[a-f0-9-]{36}$/);assert.ok(!f.calls.some(c=>c.table==='v2_permissions'));
 const resolver=load('v2/lib/integrations/resolver.ts');assert.equal(resolver.renderPath(rule.folder_template,'training',{employee_number:'EMP-0042',person_display_name:'Alex Smith',training_type:'First Aid'}),'EMP-0042 - Alex Smith/Training/First Aid');assert.throws(()=>resolver.renderPath(rule.folder_template,'training',{employee_number:'',person_display_name:'Alex Smith',training_type:'First Aid'}),/EMPLOYEE_NUMBER_MISSING/);
 const builder=load('v2/components/integrations/document-template-builder.tsx',{'@/components/people/token-input':{TokenInput:()=>null}});assert.equal(builder.templateParts(rule.folder_template).join(''),f.folder);const html=renderToStaticMarkup(react.createElement(builder.DocumentTemplateBuilder,{value:rule.folder_template,tokens:resolver.contextTokens.training,onChange(){}}));assert.match(html,/Employee Number/);assert.match(html,/Employee Name/);assert.match(html,/Training Type/);assert.match(html,/value=" - "/);assert.match(html,/value="Training"/);assert.equal((html.match(/aria-label="Folder Level /g)??[]).length,3);
 }
});

test('deleted/foreign destination, permissions, entitlement and ambiguous defaults reject configuration safely',async()=>{
 for(const [options,code] of [[{deleted:true},'INTEGRATION_DOCUMENT_DESTINATION_INVALID'],[{foreign:true},'INTEGRATION_DOCUMENT_DESTINATION_INVALID'],[{denied:true},'INTEGRATION_ACCESS_DENIED'],[{notEntitled:true},'INTEGRATION_NOT_ENTITLED']]){const f=documentSaveFixture(options);const result=await f.post();assert.equal(result.status,400);assert.equal((await result.json()).code,code);assert.equal(f.rows.v2_document_destinations.length,0);assert.equal(f.rows.v2_integration_access_profiles.length,0);}
 const f=documentSaveFixture();assert.equal((await f.post()).status,200);const second=await f.post();assert.equal((await second.json()).code,'INTEGRATION_DOCUMENT_RULE_CONFLICT');assert.equal(f.rows.v2_document_destinations.length,1);assert.equal(f.rows.v2_integration_access_profiles.length,1);
});

test('invalid folder levels produce specific errors and default filename remains available',async()=>{
 for(const [folder,pattern] of [['{employee_number}//Training',/Folder Level 2 is empty/],['Training/{unknown_field}',/Folder Level 2 contains an unsupported field/],['Training/{training_type',/Folder Level 2 contains a malformed field/]]){const f=documentSaveFixture();const result=await f.post({folder_template:folder});assert.equal(result.status,400);assert.match((await result.json()).message,pattern);assert.equal(f.rows.v2_document_destinations.length,0);}
 const f=documentSaveFixture();assert.equal((await f.post({filename_template:undefined})).status,200);assert.equal(f.rows.v2_document_destinations[0].filename_template,'{employee_number}_{training_type}_{issue_date}');
});


test('document editor has one guarded Cancel, active Save and a non-blocking connection warning',()=>{
 const initial={configured:false,connection:{status:'attention_required'},availableContexts:['training'],sites:[{id:'site',is_active:true,permission_status:'permission_required'}],locations:[{id:'loc',site_id:'site',name:'Docs',is_active:true}],rules:[],profiles:[],jobs:[],types:[],capabilities:[]};
 const draft={name:'Training Documents',context:'training',location_id:'loc',folder_template:'{employee_number} - {person_display_name}/Training/{training_type}',filename_template:'{training_type}',creation_policy:'first_upload',rename_policy:'keep',child_folders:[],is_active:true};
 let index=0,surface;
 const state=[initial,'Document Setup',false,'','',[],'','rule','baseline',[],'',draft,null,false,false,'all',false,null,false,false];
 const hooks={...react,useState:initial=>[index<state.length?state[index++]:initial,()=>{}],useEffect(){},useCallback:fn=>fn};
 const {SharePointWorkspace}=load('v2/components/integrations/sharepoint-workspace.tsx',{'react':hooks,'@/components/people/configuration-surface':{ConfigurationSurface:props=>{surface=props;return react.createElement('section',null,props.children,react.createElement('footer',null,react.createElement('button',null,'Cancel'),props.footer))}},'@/components/people/token-input':{TokenInput:()=>null},'@/components/materials/workflow-controls':{ChoicePicker:()=>null}});
 const html=renderToStaticMarkup(react.createElement(SharePointWorkspace,{organisation:'org-a',manage:true,permissions:{}}));assert.equal((html.match(/>Cancel<\/button>/g)??[]).length,1);assert.match(html,/<button class="tt-button-primary">Save Document Setup<\/button>/);assert.match(html,/SharePoint needs attention/);assert.match(html,/You can continue configuring document storage/);assert.match(html,/View Connection/);assert.match(html,/Docs \/ EMP-0042 - Alex Smith\/Training\/First Aid/);assert.equal(surface.dirty,true);assert.match(html,/Preview uses example data/);assert.match(html,/Data requirements/);assert.match(html,/Employee Number, Employee Name, Training Type/);assert.doesNotMatch(html,/The Microsoft connection needs attention\. Check/);
});

test('shared Cancel and close use the same discard guard without a browser confirm',()=>{
 const previous=global.document;global.document={body:{}};let portal,discard=false;
 const hooks={...react,useSyncExternalStore:()=>true,useRef:()=>({current:null}),useId:()=> 'heading',useEffect(){},useState:()=>[discard,value=>{discard=value}]};
 try{const {ConfigurationSurface}=load('v2/components/people/configuration-surface.tsx',{react:hooks,'react-dom':{createPortal:content=>{portal=content;return content}}});
 function render(){return renderToStaticMarkup(react.createElement(ConfigurationSurface,{title:'Training Documents',dirty:true,onClose(){assert.fail('Must warn before discarding')},footer:react.createElement('button',null,'Save Document Setup')}));}
 assert.equal((render().match(/>Cancel<\/button>/g)??[]).length,1);
 function find(element,predicate){if(!react.isValidElement(element))return null;if(predicate(element))return element;for(const child of react.Children.toArray(element.props.children)){const found=find(child,predicate);if(found)return found;}return null;}
 find(portal,e=>e.type==='button'&&e.props.children==='Cancel').props.onClick();assert.equal(discard,true);const html=render();assert.match(html,/Keep Editing/);assert.match(html,/Discard/);assert.doesNotMatch(html,/Save Document Setup/);
 }finally{global.document=previous;}
});

test('unhealthy provider cannot provision folders even though configuration saves',async()=>{
 const layer=load('v2/lib/integrations/sharepoint-locations.ts',{'@/lib/supabase/admin':{createSupabaseAdmin(){assert.fail('No document reads or writes while unhealthy')}},'./server':{loadIntegration:async()=>({id:'i',tenant_id:'tenant-a',microsoft_tenant_verified_at:'verified',status:'attention_required'})},'./entitlements':{requireIntegrationEntitlement:async()=>{}},'./sharepoint':{graphForSite(){assert.fail('No Graph operations while unhealthy')}}});
 await assert.rejects(layer.provisionFolder('org-a',{rule_id:'rule',location_id:'loc',entity_kind:'person',entity_id:'person',actor_id:'actor'}),/INTEGRATION_CONNECTION_CHECK_REQUIRED/);
});
