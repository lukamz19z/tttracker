import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '../..'), require = createRequire(import.meta.url);
const ts = require(path.join(root, 'v2/node_modules/typescript'));
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name === 'server-only') return {};
    if (name.startsWith('@/')) return load(`v2/${name.slice(2)}${name.includes('components/') ? '.tsx' : '.ts'}`, mocks);
    if (name.startsWith('./')) return load(path.posix.join(path.posix.dirname(file), `${name}.ts`), mocks);
    try { return require(path.join(root, 'v2/node_modules', name)); } catch { return require(name); }
  }, exports);
  return exports;
}
const folder = '{employee_number} - {person_display_name}/Training/{training_type}';
function fixture() {
  const calls = [], files = new Map(), folders = new Map();
  const rule = { id: 'rule-a', organisation_id: 'org-a', context: 'training', location_id: 'location-a', site_id: 'site-a', is_active: true,
    root_path: '', folder_template: folder, filename_template: '{employee_number}_{training_type}', access_profile_id: 'profile-a', conflict_policy: 'version', priority: 0 };
  const profile = { id: 'profile-a', organisation_id: 'org-a', read_capability: 'training.view', manage_capability: 'training.edit', classification: 'operational', native_mode: 'inherit' };
  const rows = { v2_document_destinations: [rule], v2_integration_access_profiles: [profile], v2_people_documents: [], v2_document_provider_jobs: [], v2_training_records: ['training-a','training-b','another-record'].map(id => ({ id, organisation_id: 'org-a', training_type_id: 'training-type-a' })), v2_training_types: [{ id: 'training-type-a', organisation_id: 'org-a', category_id: null, filename_template: null }], v2_training_categories: [] };
  const state = { connected: true, uploadFailure: false, entitlement: true };
  const db = { storage: new Proxy({}, { get() { assert.fail('No Supabase Storage in normal document operations'); } }), from(table) {
    calls.push({ table }); const filters = []; let mutation = null, one = false, optional = false, count = false;
    const result = () => {
      let matches = (rows[table] ?? []).filter(row => filters.every(([key, value]) => value && typeof value === 'object' && Array.isArray(value.in) ? value.in.includes(row[key]) : row[key] === value));
      if (mutation?.kind === 'insert') { matches = mutation.values.map(row => ({ id: row.id ?? randomUUID(), ...row })); (rows[table] ??= []).push(...matches); }
      if (mutation?.kind === 'upsert') { matches = mutation.values.map(row => { const existing = (rows[table] ?? []).find(r => r.fingerprint === row.fingerprint); if (existing) return existing; const saved = { id: randomUUID(), status: 'pending', ...row }; (rows[table] ??= []).push(saved); return saved; }); }
      if (mutation?.kind === 'update') for (const row of matches) Object.assign(row, mutation.values[0]);
      return { data: one ? matches[0] ?? null : matches, error: one && !optional && !matches.length ? new Error('missing') : null, ...(count ? { count: matches.length } : {}) };
    };
    const query = { select(_fields, options) { count = !!options?.count; return query; }, eq(key, value) { filters.push([key, value]); return query; },
      in(key, values) { filters.push([key,{in:values}]); return query; }, lte() { return query; }, order() { return query; }, limit() { return query; }, insert(value) { mutation = { kind: 'insert', values: [value] }; return query; },
      upsert(value) { mutation = { kind: 'upsert', values: [value] }; return query; }, update(value) { mutation = { kind: 'update', values: [value] }; return query; },
      single() { one = true; return Promise.resolve(result()); }, maybeSingle() { one = optional = true; return Promise.resolve(result()); }, then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); } };
    return query;
  }, async rpc(name, args) {
    if (name === 'tttracker_v2_training_document_access') return { data: rows.v2_people_documents.find(d => d.id === args.p_document && d.organisation_id === args.p_org) };
    if (name === 'tttracker_v2_claim_document_job') {
      const job = rows.v2_document_provider_jobs.find(j => j.organisation_id === args.p_org && j.id === args.p_id);
      if (!job || job.status === 'synced' || job.status === 'syncing') return { error: true };
      Object.assign(job, { lease_id: randomUUID(), status: 'syncing', attempts: (job.attempts ?? 0) + 1 }); return { data: { ...job } };
    }
    if (name === 'tttracker_v2_attach_training_document') {
      const doc = rows.v2_people_documents.find(d => d.id === args.p_document && d.organisation_id === args.p_org);
      assert.ok(doc); doc.evidence_group_id = 'shared-first-aid-cpr'; return { data: { id: doc.id } };
    }
    if (name === 'tttracker_v2_publication_worker_authority') return { data: { 'training.view': true, 'training.edit': true } };
    assert.fail(name);
  } };
  const graph = { root: async () => ({ id: 'root', folder: {} }), ensureFolder: async (parent, name) => {
    const key = `${parent}/${name}`; if (!folders.has(key)) folders.set(key, { id: `folder-${folders.size}`, name, folder: {} }); return folders.get(key);
  }, child: async (parent, name) => files.get(`${parent}/${name}`)?.item ?? null,
  upload: async (parent, name, bytes) => { calls.push({ upload: name }); if (state.uploadFailure) throw new Error('INTEGRATION_PROVIDER_UNAVAILABLE'); const item = { id: `item-${files.size}`, name, eTag: 'version-1' }; files.set(`${parent}/${name}`, { item, bytes: new Uint8Array(bytes) }); return item; },
  download: async id => { calls.push({ download: id }); const stored = [...files.values()].find(f => f.item.id === id); if (!stored) throw new Error('INTEGRATION_RESOURCE_NOT_FOUND'); return Buffer.from(stored.bytes); }, deleteTestItem: async () => { calls.push({ cleanup: true }); },
  };
  const connection = () => ({ id: 'integration-a', status: state.connected ? 'connected' : 'attention_required' });
  const mocks = {
    '@/lib/supabase/admin': { createSupabaseAdmin: () => db }, '@/lib/supabase/server': { createSupabaseServer: async () => db },
    '@/lib/integrations/entitlements': { requireIntegrationEntitlement: async () => { if (!state.entitlement) throw new Error('INTEGRATION_NOT_ENTITLED'); } },
    '@/lib/integrations/sharepoint-locations': { connectedMicrosoft: async () => connection(), locationScope: async (org, id) => {
      assert.equal(org, 'org-a'); assert.equal(id, 'location-a');
      return { connection: connection(), graph, site: { site_id: 'microsoft-site-a' }, location: { id: 'location-a', organisation_id: org, site_id: 'site-a', drive_id: 'library-a', root_path: 'Employees', is_active: true } };
    } }, '@/lib/integrations/server': { integrationAudit: async (...args) => calls.push({ audit: args }) },
  };
  const service = load('v2/lib/documents/service.ts', mocks);
  const authority = { organisationId: 'org-a', actorId: 'actor-a', permissions: { 'training.view': true, 'training.edit': true } };
  const input = { context: 'training', entityType: 'training', entityId: 'training-a', personId: 'person-a', values: { employee_number: 'EMP-0042', person_display_name: 'Alex Smith', training_type: 'First Aid' } };
  const file = { name: 'Certificate.pdf', mime: 'application/pdf', bytes: new TextEncoder().encode('%PDF-synthetic test') };
  return { rows, rule, profile, state, db, graph, calls, folders, files, mocks, service, authority, input, file };
}

test('Training uploads directly to SharePoint and persists stable references and canonical metadata', async () => {
  const f = fixture(), doc = await f.service.uploadDocument(f.authority, f.input, f.file);
  assert.equal(f.calls.filter(c => c.upload).length, 1);
  assert.equal(doc.organisation_id, 'org-a'); assert.equal(doc.document_context, 'training'); assert.equal(doc.entity_id, 'training-a');
  assert.equal(doc.person_id, 'person-a'); assert.equal(doc.sharepoint_site_id, 'microsoft-site-a'); assert.equal(doc.sharepoint_drive_id, 'library-a');
  assert.equal(doc.sharepoint_item_id, 'item-0'); assert.equal(doc.content_type, 'application/pdf'); assert.equal(doc.size_bytes, f.file.bytes.length);
  assert.equal(doc.resolved_folder, 'Employees/EMP-0042 - Alex Smith/Training/First Aid'); assert.equal(doc.resolved_filename, 'EMP-0042_First Aid.pdf'); assert.equal(doc.name, 'Certificate.pdf'); assert.equal(doc.sync_status, 'synced');
  assert.ok(doc.published_at); assert.equal(doc.provider, 'sharepoint');
  assert.equal((await f.service.downloadDocument(f.authority, doc)).toString(), '%PDF-synthetic test');
});
test('configured filename is used directly, while colliding different evidence gets a deterministic suffix', async () => {
  const f = fixture();
  const first = await f.service.uploadDocument(f.authority, f.input, f.file);
  assert.equal(first.resolved_filename, 'EMP-0042_First Aid.pdf');
  const second = await f.service.uploadDocument(f.authority, { ...f.input, entityId: 'training-b' }, { ...f.file, bytes: new TextEncoder().encode('%PDF-different test') });
  assert.match(second.resolved_filename, /^EMP-0042_First Aid_[a-f0-9-]+\.pdf$/i);
  assert.equal(f.files.size, 2);
});
test('front/back evidence receives distinct configured SharePoint names and retries the same side identity', async () => {
  const f=fixture(),frontId=randomUUID(),backId=randomUUID();
  f.rule.filename_template='{employee_number}_{training_type}_{expiry_date}';
  const common={...f.input,values:{...f.input.values,employee_number:'1600',person_display_name:'Luka Zetovic',training_type:'Drivers Licence',expiry_date:'2029-10-29'}};
  const jpeg={name:'Drivers Licence (front).jpeg',mime:'image/jpeg',bytes:new Uint8Array([255,216,255,0])};
  const front=await f.service.uploadDocument(f.authority,{...common,side:'front',values:{...common.values,document_side:'Front'}},jpeg,frontId);
  const back=await f.service.uploadDocument(f.authority,{...common,side:'back',values:{...common.values,document_side:'Back'}},{...jpeg,name:'Drivers Licence (back).jpeg'},backId);
  assert.equal(front.resolved_filename,'1600_Drivers Licence_29-10-2029 - Front.jpg');
  assert.equal(back.resolved_filename,'1600_Drivers Licence_29-10-2029 - Back.jpg');
  assert.equal(front.side,'front'); assert.equal(back.side,'back'); assert.notEqual(front.resolved_filename,back.resolved_filename);
  assert.equal((await f.service.uploadDocument(f.authority,{...common,side:'front',values:{...common.values,document_side:'Front'}},jpeg,frontId)).sharepoint_item_id,front.sharepoint_item_id);
  assert.equal(f.files.size,2);
});
test('failed/unhealthy SharePoint uploads have no false document record or storage fallback', async () => {
  for (const condition of ['uploadFailure', 'connected']) {
    const f = fixture(); f.state[condition] = condition === 'uploadFailure';
    await assert.rejects(f.service.uploadDocument(f.authority, f.input, f.file), /UNAVAILABLE/);
    assert.equal(f.rows.v2_people_documents.length, 0);
  }
});
test('foreign organisation, RBAC deny, entitlement and confidential boundaries reject before upload', async () => {
  for (const mode of ['organisation', 'permission', 'entitlement', 'confidential']) {
    const f = fixture();
    if (mode === 'organisation') f.authority.organisationId = 'org-b';
    if (mode === 'permission') f.authority.permissions['training.edit'] = false;
    if (mode === 'entitlement') f.state.entitlement = false;
    if (mode === 'confidential') f.input.classification = 'confidential';
    await assert.rejects(f.service.uploadDocument(f.authority, f.input, f.file)); assert.equal(f.files.size, 0);
  }
});
test('missing employee number is classified for the user; identical folder provisioning is reused', async () => {
  const f = fixture(); delete f.input.values.employee_number;
  await assert.rejects(f.service.uploadDocument(f.authority, f.input, f.file), /INTEGRATION_EMPLOYEE_NUMBER_MISSING/);
  assert.equal(f.service.documentError(new Error('INTEGRATION_EMPLOYEE_NUMBER_MISSING')).error,
    'People document setup uses Employee Number in its folder or file name, but this person does not have an Employee Number.');
  assert.equal(f.calls.filter(c => c.upload).length, 0);
  f.input.values.employee_number = 'EMP-0042';
  await f.service.uploadDocument(f.authority, f.input, f.file); const count = f.folders.size;
  await f.service.uploadDocument(f.authority, f.input, f.file); assert.equal(f.folders.size, count);
});
test('Training employee identifier, literal separator, name and Training Type resolve to the configured path', async () => {
  const f=fixture();
  const record=await f.service.uploadDocument(f.authority,{...f.input,values:{...f.input.values,employee_number:'V2-0042',person_display_name:'Luka Zetovic',training_type:'CPR'}},f.file);
  assert.equal(record.resolved_folder,'Employees/V2-0042 - Luka Zetovic/Training/CPR');
});
test('Training filename override precedence uses canonical Ticket, Category and destination configuration', async () => {
  const f = fixture();
  f.rows.v2_document_destinations[0].filename_template = '{training_type}_ORGANISATION';
  f.rows.v2_training_types[0].category_id = 'category-a';
  f.rows.v2_training_types[0].filename_template = '{training_type}_TICKET';
  f.rows.v2_training_categories.push({ id: 'category-a', organisation_id: 'org-a', filename_template: '{training_type}_CATEGORY' });
  let saved = await f.service.uploadDocument(f.authority, f.input, f.file);
  assert.equal(saved.resolved_filename, 'First Aid_TICKET.pdf');
  f.rows.v2_training_types[0].filename_template = null;
  saved = await f.service.uploadDocument(f.authority, { ...f.input, entityId: 'training-b' }, f.file);
  assert.equal(saved.resolved_filename, 'First Aid_CATEGORY.pdf');
  f.rows.v2_training_categories[0].filename_template = null;
  saved = await f.service.uploadDocument(f.authority, { ...f.input, entityId: 'another-record' }, f.file);
  assert.equal(saved.resolved_filename, 'First Aid_ORGANISATION.pdf');
});
test('generated revisions are idempotent and use the same item after retry', async () => {
  const f = fixture(), revision = randomUUID();
  const first = await f.service.uploadDocument(f.authority, f.input, f.file, revision);
  const second = await f.service.uploadDocument(f.authority, f.input, f.file, revision);
  assert.equal(first.id, second.id); assert.equal(first.sharepoint_item_id, second.sharepoint_item_id); assert.equal(f.files.size, 1);
  await assert.rejects(f.service.uploadDocument(f.authority, { ...f.input, entityId: 'another-record' }, f.file, revision), /ACCESS_DENIED/);
});

test('Training reviewer preview uses canonical relationships without destination configuration permissions', async () => {
  const f=fixture(),doc=await f.service.uploadDocument(f.authority,f.input,f.file);
  f.profile.read_capability='integrations.sharepoint.manage';
  assert.equal((await f.service.downloadDocument({...f.authority,permissions:{'training.approve':true}},doc)).toString(),'%PDF-synthetic test');
  await assert.rejects(f.service.downloadDocument({...f.authority,permissions:{}},doc),/ACCESS_DENIED/);
});
test('Training retry preserves one item and refuses different bytes under the same submission identity', async () => {
  const f=fixture(),key=randomUUID();const doc=await f.service.uploadDocument(f.authority,f.input,f.file,key);
  const retry=await f.service.uploadDocument(f.authority,f.input,f.file,key);assert.equal(doc.id,retry.id);assert.equal(f.files.size,1);
  await assert.rejects(f.service.uploadDocument(f.authority,f.input,{...f.file,bytes:new TextEncoder().encode('%PDF-changed')},key),/CONFLICT/);assert.equal(f.files.size,1);
});
test('safe SharePoint errors survive the actual People response mapper',async()=>{
  const source=fs.readFileSync(path.join(root,'v2/components/people/people-controls.tsx'),'utf8');
  const tree=ts.createSourceFile('controls.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const mapper=tree.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='responseData');assert.ok(mapper);
  const compiled=ts.transpileModule(mapper.getText(tree),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};new Function('exports','labels',compiled)(exports,{});
  const f=fixture(),safe=f.service.documentError(new Error('DOCUMENT_STORAGE_NOT_CONFIGURED'));
  await assert.rejects(exports.responseData(new Response(JSON.stringify(safe),{status:422})),/Document storage is not configured/);
  await assert.rejects(exports.responseData(new Response(JSON.stringify({error:'UNKNOWN_INTERNAL_CODE'}),{status:500})),/Unable to complete/);
});
test('preview uses stable IDs; permission/org/missing item fail safely without leaking tokens', async () => {
  const f = fixture(), doc = await f.service.uploadDocument(f.authority, f.input, f.file);
  await assert.rejects(f.service.downloadDocument({ ...f.authority, organisationId: 'org-b' }, doc), /ACCESS_DENIED/);
  await assert.rejects(f.service.downloadDocument({ ...f.authority, permissions: {} }, doc), /ACCESS_DENIED/);
  f.files.clear(); await assert.rejects(f.service.downloadDocument(f.authority, doc), /RESOURCE_NOT_FOUND/);
  assert.match(f.service.documentError(new Error('INTEGRATION_RESOURCE_NOT_FOUND'), 'preview').error, /could not be found/);
});
test('PDF/image/text preview headers are inline; Office/HTML are download only', () => {
  const { documentHeaders } = load('v2/lib/documents/preview.ts');
  for (const mime of ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv']) {
    const headers = documentHeaders(mime, 'Certificate.pdf', true); assert.match(headers['Content-Disposition'], /^inline/); assert.equal(headers['Content-Type'], mime); assert.equal(headers['Cache-Control'], 'private, no-store');
  }
  assert.match(documentHeaders('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Report.docx', true)['Content-Disposition'], /^attachment/);
  assert.match(documentHeaders('text/html', 'Unsafe.html', true)['Content-Disposition'], /^attachment/);
  assert.doesNotMatch(documentHeaders('application/pdf', 'bad\r\nfilename.pdf', true)['Content-Disposition'], /\r|\n/);
});
test('PNG/JPEG/WEBP are validated before direct upload', async () => {
  for (const [mime, bytes] of [['image/png', [137,80,78,71,13,10,26,10,0]], ['image/jpeg', [255,216,255,0]], ['image/webp', [...Buffer.from('RIFFxxxxWEBP')]]]) {
    const f = fixture(); const doc = await f.service.uploadDocument(f.authority, f.input, { name: 'Evidence', mime, bytes: new Uint8Array(bytes) }); assert.equal(doc.content_type, mime);
  }
  const f = fixture(); await assert.rejects(f.service.uploadDocument(f.authority, f.input, { ...f.file, bytes: new Uint8Array([1,2,3]) }), /FILE_INVALID/);
});
test('universal preview API streams PDF/PNG/JPEG only after organisation and entity checks', async () => {
  const { NextRequest } = require(path.join(root, 'v2/node_modules/next/server'));
  for (const [mime, bytes] of [['application/pdf', [...Buffer.from('%PDF-synthetic')]], ['image/png', [137,80,78,71,13,10,26,10,0]], ['image/jpeg', [255,216,255,0]]]) {
    const f = fixture();
    const doc = await f.service.uploadDocument(f.authority, f.input, { name: 'Evidence', mime, bytes: new Uint8Array(bytes) });
    let entityAllowed = true, selectedOrg = 'org-a';
    const mocks = { ...f.mocks, '@/lib/documents/service': f.service, '@/lib/documents/legacy-storage': { readLegacyDocument: () => assert.fail('New files are not in Storage') },
      '@/lib/workspace/context': { requireWorkspaceContext: async () => ({ organisation: { organisationId: selectedOrg }, userId: 'actor-a', enabledModules: new Set(['people']), permissions: f.authority.permissions }) },
      '@/lib/people/server': { peopleRead: async () => ({ rows: entityAllowed ? [doc] : [] }) },
      '@/lib/projects/project-context': {}, 'next/navigation': { unstable_rethrow() {} } };
    const api = load('v2/app/api/documents/[documentId]/route.ts', mocks);
    const request = new NextRequest(`http://localhost:3001/api/documents/${doc.id}?organisation=org-a`), params = { params: Promise.resolve({ documentId: doc.id }) };
    const response = await api.GET(request, params); assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), mime); assert.match(response.headers.get('content-disposition'), /^inline/);
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], bytes);
    entityAllowed = false; assert.equal((await api.GET(request, params)).status, 403);
    entityAllowed = true; selectedOrg = 'org-b'; assert.equal((await api.GET(request, params)).status, 404);
  }
});
test('Training route commits one shared physical certificate to the canonical evidence group', async () => {
  const f = fixture();
  const context = { organisation: { organisationId: 'org-a' }, userId: 'actor-a', permissions: f.authority.permissions };
  const scope = { person: { display_name: 'Alex Smith', employee_number: 'EMP-0042' }, training: { name: 'First Aid', category: 'First Aid' } };
  const people = { requirePeopleContext: async () => context, peopleRead: async () => scope, peopleError: e => ({ error: e.message, status: 403 }) };
  const api = load('v2/app/api/people/documents/route.ts', { ...f.mocks, '@/lib/documents/service': f.service, '@/lib/people/server': people, 'next/navigation': { unstable_rethrow() {} } });
  const { NextRequest } = require(path.join(root, 'v2/node_modules/next/server'));
  const form = new FormData(); form.set('organisation', 'org-a'); form.set('person_id', 'person-a'); form.set('record_id', 'training-a'); form.set('file', new File([f.file.bytes], 'First Aid.pdf', { type: 'application/pdf' }));
  const response = await api.POST(new NextRequest('http://localhost:3001/api/people/documents', { method: 'POST', headers: { origin: 'http://localhost:3001' }, body: form }));
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal(f.files.size, 1); assert.equal(f.rows.v2_people_documents[0].evidence_group_id, 'shared-first-aid-cpr');
});
test('publication queue contains revision/source metadata only and queues without Microsoft health', async () => {
  const f = fixture(); f.state.connected = false;
  const publication = load('v2/lib/documents/publication.ts', { ...f.mocks, './service': f.service, './migration': {} });
  const first = await publication.queueGeneratedDocument(f.authority, f.input, 'revision-4');
  const second = await publication.queueGeneratedDocument(f.authority, f.input, 'revision-4');
  assert.equal(first.id, second.id); assert.equal(f.rows.v2_document_provider_jobs.length, 1);
  assert.doesNotMatch(JSON.stringify(f.rows.v2_document_provider_jobs), /%PDF|access_token|storage_key|bytes|client_secret/);
  assert.equal(f.files.size, 0);
});

test('external Onboarding validates its session/field, uploads directly and fails without submitting a missing file', async () => {
  const { NextRequest } = require(path.join(root, 'v2/node_modules/next/server'));
  const previous = process.env.NEXT_PUBLIC_APP_URL; process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3001';
  try {
    for (const fail of [false, true]) {
      const f = fixture(); f.rule.context = 'onboarding'; f.rule.folder_template = 'Onboarding/{document_type}'; f.rule.filename_template = '{document_type}';
      f.state.uploadFailure = fail; const original = f.db.rpc;
      let committed = 0;
      f.db.rpc = async (name, args) => {
        if (name !== 'tttracker_v2_onboarding_external') return original(name, args);
        assert.equal(args.p_session_hash, 'validated-session'); assert.equal(args.p_field, 'certificate');
        if (args.p_action === 'upload_scope') return { data: { organisation_id: 'org-a', instance_id: 'instance-a', field: { label: 'Certificate', classification: 'operational' } } };
        if (args.p_action === 'document') { committed++; assert.ok(f.rows.v2_people_documents.some(d => d.storage_key === args.p_value.storage_key && d.provider === 'sharepoint')); return { data: { saved: true } }; }
        assert.fail(args.p_action);
      };
      const api = load('v2/app/api/onboarding/security/workflow/route.ts', { ...f.mocks, '@/lib/documents/service': f.service,
        '@/lib/documents/onboarding': {}, '@/lib/people/confidential': { tokenHash: value => { assert.equal(value, 'session-cookie'); return 'validated-session'; } } });
      const form = new FormData(); form.set('field', 'certificate'); form.set('file', new File([f.file.bytes], 'Certificate.pdf', { type: 'application/pdf' }));
      const response = await api.POST(new NextRequest('http://localhost:3001/api/onboarding/security/workflow', { method: 'POST', headers: { origin: 'http://localhost:3001', cookie: 'tttracker_onboarding=session-cookie' }, body: form }));
      assert.equal(response.status, fail ? 422 : 200, JSON.stringify(await response.clone().json()));
      assert.equal(committed, fail ? 0 : 1); assert.equal(f.rows.v2_people_documents.length, fail ? 0 : 1);
    }
  } finally { if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = previous; }
});

test('tenant Onboarding reviewers cannot bypass destination private capabilities via an external-session flag', async () => {
  const f = fixture(); f.rule.context = 'onboarding'; f.rule.folder_template = 'Onboarding'; f.rule.filename_template = 'Certificate';
  const input = { ...f.input, context: 'onboarding', entityType: 'onboarding' };
  const doc = await f.service.uploadDocument({ organisationId: 'org-a', actorId: null, permissions: {}, externalClassification: 'operational' }, input, f.file);
  await assert.rejects(f.service.downloadDocument({ ...f.authority, permissions: {}, externalClassification: 'operational' }, doc), /ACCESS_DENIED/);
  assert.equal((await f.service.downloadDocument({ organisationId: 'org-a', actorId: null, permissions: {}, externalClassification: 'operational' }, doc)).toString(), '%PDF-synthetic test');
});
test('generated publication success, failure/backoff and retry regenerate source without persistent bytes', async () => {
  const f = fixture(); const publication = load('v2/lib/documents/publication.ts', { ...f.mocks, './service': f.service, './migration': {} });
  const job = await publication.queueGeneratedDocument(f.authority, f.input, 'revision-4');
  let regenerated = 0;
  const generators = { training: async source => { regenerated++; assert.equal(source.source_revision, 'revision-4'); return { authority: f.authority, input: f.input, revision: source.source_revision, ...f.file, bytes: new Uint8Array(f.file.bytes) }; } };
  f.state.uploadFailure = true;
  assert.equal((await publication.processPublicationJob('org-a', job.id, generators)).status, 'failed');
  assert.equal(f.rows.v2_people_documents.length, 0); assert.equal(f.rows.v2_document_provider_jobs[0].lease_id, null); assert.ok(f.rows.v2_document_provider_jobs[0].available_at);
  f.state.uploadFailure = false;
  assert.equal((await publication.processPublicationJob('org-a', job.id, generators)).status, 'synced');
  assert.equal(regenerated, 2); assert.equal(f.files.size, 1); assert.ok(f.rows.v2_document_provider_jobs[0].publication_document_id);
});

test('architecture guard disallows new module Storage calls and direct Graph endpoints', () => {
  const allowedStorage = new Set(['lib/documents/legacy-storage.ts', 'lib/people/confidential.ts']);
  const allowedGraph = new Set(['lib/integrations/sharepoint.ts', 'lib/integrations/sharepoint-setup.ts']);
  function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => { const p = path.join(dir, e.name); return e.isDirectory() ? walk(p) : /\.[jt]sx?$/.test(p) ? [p] : []; }); }
  for (const dir of ['app', 'components', 'lib']) for (const file of walk(path.join(root, 'v2', dir))) {
    const relative = path.relative(path.join(root, 'v2'), file).replaceAll('\\', '/'), source = fs.readFileSync(file, 'utf8');
    if (!allowedStorage.has(relative)) assert.doesNotMatch(source, /\.storage\s*(?:\.\s*from|\n\s*\.from)|supabase\.storage|createSignedUrl/, relative);
    if (!allowedGraph.has(relative)) assert.doesNotMatch(source, /https:\/\/graph\.microsoft\.com\/v1\.0/, relative);
  }
});


test('Person headshot uses central configured SharePoint publication, preserving existing photo on provider failure', async()=>{
 const f=fixture();f.rule.context='profile_photos';f.rule.folder_template='{employee_number} - {person_display_name}/Profile Photos';f.rule.filename_template='{employee_number} - {person_display_name} - {document_type}';
 f.profile.read_capability='people.profile_photo.view';f.profile.manage_capability='people.profile_photo.manage';
 const authority={...f.authority,permissions:{'people.profile_photo.view':true,'people.profile_photo.manage':true}};
 const input={...f.input,context:'profile_photos',entityType:'person_profile_photo',entityId:'person-a',values:{employee_number:'1600',person_display_name:'Alex Smith',document_type:'Profile Photo'}};
 const file={name:'phone.jpg',mime:'image/jpeg',bytes:new Uint8Array([255,216,255,1,2,3])};
 const a=await f.service.uploadDocument(authority,input,file);
 assert.equal(a.resolved_filename,'1600 - Alex Smith - Profile Photo.jpg');assert.equal(a.person_id,'person-a');assert.equal(a.document_context,'profile_photos');
 f.state.uploadFailure=true;
 await assert.rejects(f.service.uploadDocument(authority,input,{...file,bytes:new Uint8Array([255,216,255,7,8,9])}),/PROVIDER_UNAVAILABLE/);
 assert.equal(f.rows.v2_people_documents.length,1);assert.equal(f.rows.v2_people_documents[0].id,a.id);
 f.state.uploadFailure=false;const b=await f.service.uploadDocument(authority,input,{...file,bytes:new Uint8Array([255,216,255,7,8,9])});assert.notEqual(a.id,b.id);assert.notEqual(a.sharepoint_item_id,b.sharepoint_item_id);assert.equal(f.rows.v2_people_documents.length,2);
 await assert.rejects(f.service.uploadDocument({...authority,permissions:{'people.profile_photo.view':true}},input,file),/ACCESS_DENIED/);
});

async function pendingPhotoFixture(crossLibrary=false) {
 const f=fixture();f.rule.context='profile_photos';f.rule.folder_template='{employee_number} - {person_display_name}/Profile Photos';f.rule.filename_template='{employee_number} - {person_display_name} - {document_type}';f.profile.manage_capability='people.profile_photo.manage';f.profile.read_capability='people.profile_photo.view';
 const bytes=new Uint8Array([255,216,255,1,2,3]);f.files.set('staging/Photo.jpg',{item:{id:'stable-source',name:'Photo.jpg',eTag:'original-etag'},bytes});
 const source={id:randomUUID(),organisation_id:'org-a',person_id:'person-a',name:'Photo.jpg',document_context:'onboarding',entity_type:'onboarding',entity_id:'instance-a',destination_id:crossLibrary?'staging-location':'location-a',sharepoint_drive_id:crossLibrary?'staging-library':'library-a',sharepoint_site_id:'microsoft-site-a',sharepoint_item_id:'stable-source',storage_key:'org-a/onboarding/instance-a/photo',photo_publication_pending:true,photo_source:'onboarding',photo_retry_after:new Date(0).toISOString(),content_type:'image/jpeg'};
 f.rows.v2_people_documents.push(source);f.rows.v2_people=[{id:'person-a',organisation_id:'org-a',display_name:'Alex Smith',employee_number:'1600'}];
 let assigned=null,moveFailure=false;
 f.graph.metadata=async id=>[...f.files.values()].find(v=>v.item.id===id).item;
 f.graph.move=async(id,parent,name)=>{f.calls.push({move:id});if(moveFailure)throw Error('INTEGRATION_PROVIDER_UNAVAILABLE');const stored=[...f.files.values()].find(v=>v.item.id===id);stored.item={...stored.item,name,eTag:'moved-etag'};f.files.set(`${parent}/${name}`,stored);return stored.item;};
 const previousRpc=f.db.rpc.bind(f.db);
 f.db.rpc=async(name,args)=>{if(name==='tttracker_v2_onboarding_photo_authority')return{data:{actor_id:'actor-a',person_id:'person-a'}};if(name==='tttracker_v2_finish_onboarding_photo'){assigned=args.p_document;const d=f.rows.v2_people_documents.find(d=>d.id===assigned);d.photo_publication_pending=false;if(d.source_document_id)source.photo_publication_pending=false;return{data:{id:assigned}};}return previousRpc(name,args);};
 const previousScope=f.mocks['@/lib/integrations/sharepoint-locations'].locationScope;
 f.mocks['@/lib/integrations/sharepoint-locations'].locationScope=async(org,id)=>id==='staging-location'?{...(await previousScope(org,'location-a')),location:{id,drive_id:'staging-library'}}:previousScope(org,id);
 const photos=load('v2/lib/people/profile-photo.ts',f.mocks);
 return {...f,source,photos,assigned:()=>assigned,failMove:value=>{moveFailure=value;}};
}
test('onboarding publication keeps stable SharePoint item in-library and retries failed movement before current assignment',async()=>{
 const f=await pendingPhotoFixture();f.failMove(true);assert.equal((await f.photos.publishPendingProfilePhotos()).deferred,1);assert.equal(f.assigned(),null);assert.equal(f.source.photo_publication_pending,true);
 f.failMove(false);assert.equal((await f.photos.publishPendingProfilePhotos()).published,1);assert.equal(f.assigned(),f.source.id);assert.equal(f.source.sharepoint_item_id,'stable-source');assert.equal(f.source.document_context,'profile_photos');assert.equal(f.calls.filter(c=>c.upload).length,0);assert.equal(f.source.resolved_filename,'1600 - Alex Smith - Profile Photo.jpg');
});
test('cross-library onboarding publication uses central idempotent upload and retains source provenance',async()=>{
 const f=await pendingPhotoFixture(true);assert.equal((await f.photos.publishPendingProfilePhotos()).published,1);const current=f.rows.v2_people_documents.find(d=>d.id===f.assigned());assert.notEqual(current.id,f.source.id);assert.equal(current.source_document_id,f.source.id);assert.equal(current.person_id,'person-a');assert.equal(current.sharepoint_drive_id,'library-a');assert.equal(f.source.photo_publication_pending,false);assert.equal(f.rows.v2_people_documents.length,2);assert.equal(f.calls.filter(c=>c.upload).length,1);assert.equal((await f.photos.publishPendingProfilePhotos()).published,0);
});

test('completed onboarding photo preview resolves canonical moved metadata and never falls back to legacy storage',async()=>{
 const f=fixture();f.rule.context='profile_photos';f.rule.folder_template='{person_id}/Photos';f.rule.filename_template='Photo';f.profile.read_capability='people.profile_photo.view';f.profile.manage_capability='people.profile_photo.manage';
 const authority={...f.authority,permissions:{'people.profile_photo.view':true,'people.profile_photo.manage':true}};
 const doc=await f.service.uploadDocument(authority,{...f.input,context:'profile_photos',entityType:'person_profile_photo',values:{...f.input.values,person_id:'person-a'}},{name:'Photo.jpg',mime:'image/jpeg',bytes:new Uint8Array([255,216,255,1])});
 doc.storage_key='org-a/onboarding/instance-a/photo';f.rows.v2_people_documents[0].storage_key=doc.storage_key;
 const {previewOnboardingDocument}=load('v2/lib/documents/onboarding.ts',f.mocks);
 const preview=await previewOnboardingDocument(authority,{storage_key:doc.storage_key,name:'Photo.jpg'});assert.equal(preview.headers['Content-Type'],'image/jpeg');assert.equal(preview.bytes.length,4);
});
