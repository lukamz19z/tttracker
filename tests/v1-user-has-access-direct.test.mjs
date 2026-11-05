import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const sql = await readFile(new URL("../supabase/migrations/20261105120000_v1_user_has_access_direct_lookup.sql", import.meta.url), "utf8");

test("V1 user_has_access uses direct indexed lookups and does not read a broad permissions view", () => {
  const body = sql.replace(/^\s*--.*$/gm, "");
  assert.match(body, /create or replace function public\.user_has_access\(\s*p_user_id uuid,\s*p_access_code text/s);
  assert.match(body, /aa\.code = p_access_code[\s\S]*aa\.is_active = true/);
  assert.match(body, /upo\.user_id = p_user_id[\s\S]*upo\.access_area_id = v_access_area_id/);
  assert.match(body, /if found then\s+return coalesce\(v_override, false\)/);
  assert.match(body, /ura\.user_id = p_user_id/);
  assert.match(body, /r\.is_active = true/);
  assert.match(body, /r\.grants_all = true/);
  assert.match(body, /rp\.allowed = true/);
  assert.doesNotMatch(body, /effective_user_permissions/);
});

test("direct permission function preserves access override and active role semantics in PostgreSQL", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.access_areas(id uuid primary key, code text unique, is_active boolean not null);
      create table public.roles(id uuid primary key, is_active boolean not null, grants_all boolean not null default false);
      create table public.user_role_assignments(user_id uuid not null, role_id uuid not null);
      create table public.role_permissions(role_id uuid not null, access_area_id uuid not null, allowed boolean not null, unique(role_id, access_area_id));
      create table public.user_permission_overrides(user_id uuid not null, access_area_id uuid not null, allowed boolean not null, unique(user_id, access_area_id));
      create index on public.user_role_assignments(user_id);
      create index on public.user_permission_overrides(user_id, access_area_id);
      create index on public.role_permissions(role_id, access_area_id);
    `);
    await db.exec(sql);
    await db.exec(`
      insert into public.access_areas values
        ('00000000-0000-0000-0000-000000000001','allow-code',true),
        ('00000000-0000-0000-0000-000000000002','deny-code',true),
        ('00000000-0000-0000-0000-000000000003','inactive-code',false);
      insert into public.roles values
        ('10000000-0000-0000-0000-000000000001',true,false),
        ('10000000-0000-0000-0000-000000000002',true,true),
        ('10000000-0000-0000-0000-000000000003',false,true),
        ('10000000-0000-0000-0000-000000000004',true,false);
      insert into public.user_role_assignments values
        ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
        ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001'),
        ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002'),
        ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000003'),
        ('20000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000004');
      insert into public.role_permissions values
        ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',true),
        ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',false);
      insert into public.user_permission_overrides values
        ('20000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000001',true),
        ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002',true),
        ('20000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002',false);
    `);
    const cases = [
      ["20000000-0000-0000-0000-000000000006", "allow-code", true, "explicit allow"],
      ["20000000-0000-0000-0000-000000000002", "deny-code", true, "override allow beats role deny"],
      ["20000000-0000-0000-0000-000000000003", "deny-code", false, "override deny beats grant-all"],
      ["20000000-0000-0000-0000-000000000001", "allow-code", true, "role permission allow"],
      ["20000000-0000-0000-0000-000000000001", "deny-code", false, "role permission deny"],
      ["20000000-0000-0000-0000-000000000003", "allow-code", true, "grants-all role"],
      ["20000000-0000-0000-0000-000000000004", "allow-code", false, "inactive role ignored"],
      ["20000000-0000-0000-0000-000000000005", "allow-code", false, "role with no matching permission"],
      ["20000000-0000-0000-0000-000000000007", "allow-code", false, "no role assignment"],
      ["20000000-0000-0000-0000-000000000006", "missing-code", false, "unknown access code"],
      ["20000000-0000-0000-0000-000000000006", "inactive-code", false, "inactive access area"],
    ];
    for (const [userId, code, expected, label] of cases) {
      const result = await db.query("select public.user_has_access($1::uuid, $2::text) as allowed", [userId, code]);
      assert.equal(result.rows[0].allowed, expected, label);
    }
  } finally {
    await db.close();
  }
});
