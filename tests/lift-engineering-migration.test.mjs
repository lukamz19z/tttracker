import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("V1 Lift Engineering migration applies against the required existing project/access contract", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.projects(id uuid primary key);
      create table public.towers(id uuid primary key, project_id uuid references public.projects(id));
      create table public.access_groups(id uuid primary key default gen_random_uuid(), code text unique not null, name text not null, description text, sort_order integer, is_active boolean not null, updated_at timestamptz default now());
      create table public.access_areas(id uuid primary key default gen_random_uuid(), group_id uuid references public.access_groups(id), category text, code text unique, name text, description text, type text, permission_level text, route text, source text, sort_order integer, is_active boolean, updated_at timestamptz default now());
      create table public.access_route_rules(id uuid primary key default gen_random_uuid(), name text, route_pattern text, match_type text, access_area_id uuid references public.access_areas(id), priority integer, is_active boolean);
    `);
    const migration = await readFile(new URL("../supabase/migrations/20261120120000_v1_lift_engineering.sql", import.meta.url), "utf8");
    await db.exec(migration);
    const migrationFiles = await readdir(new URL("../supabase/migrations/", import.meta.url));
    const chartConfigurationMigrations = migrationFiles.filter((name) => name.endsWith("_v1_lift_chart_configuration.sql"));
    assert.equal(chartConfigurationMigrations.length, 1, "expected one V1 lift chart configuration migration");
    await db.exec(await readFile(new URL(`../supabase/migrations/${chartConfigurationMigrations[0]}`, import.meta.url), "utf8"));
    const tables = await db.query("select tablename from pg_tables where schemaname='public' and tablename like 'lift_%'");
    const names = new Set(tables.rows.map((row) => row.tablename));
    for (const table of ["lift_crane_profiles", "lift_crane_profile_revisions", "lift_rigging_arrangements", "lift_load_chart_points", "lift_tower_templates", "lift_studies", "lift_study_revisions", "lift_study_outrigger_results", "lift_documents", "lift_study_reviews"]) assert.ok(names.has(table), `migration should create ${table}`);
    const permissions = await db.query("select code from public.access_areas where code like 'tt.lift_engineering.%'");
    assert.equal(permissions.rows.length, 7);
    const rls = await db.query("select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname like 'lift_%' and relkind='r'");
    assert.ok(rls.rows.length > 20);
    assert.ok(rls.rows.every((row) => row.relrowsecurity), "all engineering tables must have RLS enabled");
    const grants = await db.query("select has_table_privilege('service_role','public.lift_studies','select') as service_select, has_table_privilege('authenticated','public.lift_studies','select') as authenticated_select");
    assert.equal(grants.rows[0].service_select, true);
    assert.equal(grants.rows[0].authenticated_select, false);
    const chartColumns = await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='lift_load_charts' and column_name in ('manufacturer_configuration','status')");
    assert.deepEqual(new Set(chartColumns.rows.map((row) => row.column_name)), new Set(["manufacturer_configuration", "status"]));
    const chartRls = await db.query("select relrowsecurity from pg_class where oid='public.lift_load_charts'::regclass");
    assert.equal(chartRls.rows[0].relrowsecurity, true);
    const routines = await db.query("select proname from pg_proc where proname in ('v1_lift_study_save_calculation','v1_lift_study_workflow')");
    assert.equal(routines.rows.length, 2);
    const projectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const studyId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const revisionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const liftId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    await db.query("insert into public.projects(id) values($1)", [projectId]);
    await db.query("insert into public.lift_studies(id,project_id,study_number,title,created_by) values($1,$2,'LS-TEST','Test lift',$3)", [studyId, projectId, userId]);
    await db.query("insert into public.lift_study_revisions(id,study_id,revision_no,revision_label,prepared_by) values($1,$2,1,'A',$3)", [revisionId, studyId, userId]);
    await db.query("update public.lift_studies set current_revision_id=$1 where id=$2", [revisionId, studyId]);
    await db.query("select public.v1_lift_study_save_calculation($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,'v1.0.0','test-method')", [
      revisionId, JSON.stringify({ lifts: [{ liftNumber: "L1" }] }), JSON.stringify({ lifts: [] }),
      JSON.stringify([{ id: liftId, liftNumber: "L1", sequenceNo: 1, description: "Lift 1", liftType: "Custom", inputSnapshot: { massKg: 10 } }]),
      JSON.stringify([{ studyLiftId: liftId, phaseKey: "place", phaseName: "Place", mainLoadShare: 1, auxiliaryLoadShare: 0, radiusM: 2, inputSnapshot: {} }]),
      JSON.stringify([{ studyLiftId: liftId, phaseKey: "place", effectiveElementMassKg: 10, riggingTareKg: 0, mainOverheadKg: 0, auxiliaryOverheadKg: 0, mainTotalLoadT: 0.01, auxiliaryTotalLoadT: 0, requiredRadiusM: 2, chartRadiusM: 2, chartCapacityT: 1, utilisationPct: 1, chartSource: {}, warnings: [] }]),
    ]);
    const resultCount = await db.query("select count(*)::int as count from public.lift_study_lift_results");
    assert.equal(resultCount.rows[0].count, 1);
    await db.query("select public.v1_lift_study_workflow($1,'submit',$2,'Test Reviewer',null)", [revisionId, userId]);
    await assert.rejects(db.query("update public.lift_study_revisions set input_snapshot='{}'::jsonb where id=$1", [revisionId]), /immutable/);
    await assert.rejects(db.query("insert into public.lift_study_lifts(study_revision_id,lift_number,sequence_no,description,lift_type) values($1,'L2',2,'Second','Custom')", [revisionId]), /immutable/);
    const audit = await db.query("select action from public.lift_study_reviews where study_revision_id=$1", [revisionId]);
    assert.equal(audit.rows[0].action, "submitted");
  } finally { await db.close(); }
});
