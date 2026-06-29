create extension if not exists pgcrypto;

create table if not exists public.analysis_cache (
  cache_key text primary key,
  input_kind text not null,
  input_text text not null,
  input_url text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists analysis_cache_expires_at_idx on public.analysis_cache (expires_at);

create table if not exists public.analysis_history (
  id uuid primary key default gen_random_uuid(),
  scan_id text not null unique,
  cache_key text,
  user_id uuid references auth.users(id) on delete set null,
  input_kind text not null,
  input_text text not null,
  input_url text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists analysis_history_scan_id_idx on public.analysis_history (scan_id);
create index if not exists analysis_history_user_id_idx on public.analysis_history (user_id);
create index if not exists analysis_history_created_at_idx on public.analysis_history (created_at desc);

create table if not exists public.scan_pages (
  scan_id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  input_kind text not null,
  input_text text not null,
  input_url text,
  payload jsonb not null,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists scan_pages_user_id_idx on public.scan_pages (user_id);
create index if not exists scan_pages_created_at_idx on public.scan_pages (created_at desc);

create table if not exists public.analysis_rate_limits (
  scope_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.check_analysis_rate_limit(
  p_scope_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  request_count integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count integer;
begin
  insert into public.analysis_rate_limits (scope_key, window_started_at, request_count, updated_at)
  values (p_scope_key, v_now, 1, v_now)
  on conflict (scope_key) do update
    set request_count = case
      when public.analysis_rate_limits.window_started_at < (v_now - make_interval(secs => p_window_seconds))
        then 1
      else public.analysis_rate_limits.request_count + 1
    end,
    window_started_at = case
      when public.analysis_rate_limits.window_started_at < (v_now - make_interval(secs => p_window_seconds))
        then v_now
      else public.analysis_rate_limits.window_started_at
    end,
    updated_at = v_now
  returning window_started_at, request_count into v_window_start, v_count;

  allowed := v_count <= p_limit;
  request_count := v_count;
  reset_at := v_window_start + make_interval(secs => p_window_seconds);
  return next;
end;
$$;

alter table public.analysis_cache enable row level security;
alter table public.analysis_history enable row level security;
alter table public.scan_pages enable row level security;
alter table public.analysis_rate_limits enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'analysis_history' and policyname = 'Users can read their own history'
  ) then
    create policy "Users can read their own history"
      on public.analysis_history
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'analysis_history' and policyname = 'Users can insert their own history'
  ) then
    create policy "Users can insert their own history"
      on public.analysis_history
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'scan_pages' and policyname = 'Public can read published scans'
  ) then
    create policy "Public can read published scans"
      on public.scan_pages
      for select
      using (is_public = true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'scan_pages' and policyname = 'Authenticated users can create scan pages'
  ) then
    create policy "Authenticated users can create scan pages"
      on public.scan_pages
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'analysis_cache' and policyname = 'Service role manages cache'
  ) then
    create policy "Service role manages cache"
      on public.analysis_cache
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'analysis_rate_limits' and policyname = 'Service role manages rate limits'
  ) then
    create policy "Service role manages rate limits"
      on public.analysis_rate_limits
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;
