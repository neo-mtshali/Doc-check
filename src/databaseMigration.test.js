import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const candidates = [
  path.resolve("supabase/migrations/202607280001_shared_case_platform.sql"),
  path.resolve("Doc-check/supabase/migrations/202607280001_shared_case_platform.sql"),
];
const migrationPath = candidates.find(existsSync);
const sql = migrationPath ? readFileSync(migrationPath, "utf8") : "";

test("shared-case migration enables RLS on every exposed table", () => {
  assert.ok(migrationPath, "database migration should exist");
  for (const table of ["profiles", "cases", "case_internal_data", "case_activity"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
});

test("database separates Presenter data and blocks duplicate case references", () => {
  assert.match(sql, /check \(not \(case_data \? 'presenter'\)\)/i);
  assert.match(sql, /create unique index[\s\S]*lower\(btrim\(case_reference\)\)/i);
  assert.match(sql, /internal_data_select_internal/i);
  assert.match(sql, /internal_data_admin_update/i);
  assert.match(sql, /function public\.save_case_snapshot[\s\S]*insert into public\.case_internal_data/i);
});

test("database policies encode tracer ownership, internal reads, and admin control", () => {
  assert.match(sql, /cases_select_visible/i);
  assert.match(sql, /owner_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /current_app_role\(\) in \('internal', 'admin'\)/i);
  assert.match(sql, /cases_update_owned_or_admin/i);
  assert.match(sql, /profiles_admin_update/i);
});
