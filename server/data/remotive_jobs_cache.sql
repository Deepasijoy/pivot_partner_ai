-- Run this once in the Supabase SQL editor for this project. I can't run
-- DDL myself: this server only has the publishable/anon key (same one the
-- browser has — see server.js's existing Supabase health-check comment),
-- no service_role key, and there's no Supabase CLI/migrations setup in
-- this repo yet. Until this is run, server/services/remotiveCache.js
-- degrades gracefully to an in-memory-only cache (logs a warning, keeps
-- working within a single running process, just doesn't survive a
-- Render free-tier sleep/restart).

create table if not exists remotive_jobs_cache (
  id integer primary key,
  jobs jsonb not null,
  fetched_at timestamptz not null
);

alter table remotive_jobs_cache enable row level security;

-- This table only ever holds Remotive's own public, non-sensitive job
-- listings (no PII, no secrets) and the backend writes it using the same
-- anon-level key the browser already has — so anon read+write is an
-- intentional, low-risk tradeoff for this ONE cache table, not a pattern
-- to reuse for anything sensitive. If a service_role key gets added to
-- this project later, tighten this to service_role-only writes.
create policy "Allow anon read on remotive_jobs_cache"
  on remotive_jobs_cache for select
  using (true);

create policy "Allow anon insert on remotive_jobs_cache"
  on remotive_jobs_cache for insert
  with check (true);

create policy "Allow anon update on remotive_jobs_cache"
  on remotive_jobs_cache for update
  using (true)
  with check (true);
