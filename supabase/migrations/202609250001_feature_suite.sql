alter table public.analysis_feedback add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.analysis_feedback add column if not exists comment text;
alter table public.analysis_feedback add column if not exists status text not null default 'open' check (status in ('open', 'reviewed', 'corrected'));
alter table public.analysis_feedback add column if not exists admin_notes text;
alter table public.analysis_feedback add column if not exists reviewed_at timestamptz;

create table if not exists public.claim_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  latest_payload jsonb,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, query)
);
alter table public.claim_watchlist enable row level security;
drop policy if exists "Users manage their own watchlist" on public.claim_watchlist;
create policy "Users manage their own watchlist" on public.claim_watchlist for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.claim_watchlist to authenticated;

create table if not exists public.scan_revisions (
  id uuid primary key default gen_random_uuid(),
  scan_id text not null references public.analysis_history(scan_id) on delete cascade,
  previous_scan_id text not null references public.analysis_history(scan_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  previous_payload jsonb not null,
  current_payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.scan_revisions enable row level security;
drop policy if exists "Users read their own scan revisions" on public.scan_revisions;
create policy "Users read their own scan revisions" on public.scan_revisions for select using (auth.uid() = user_id);
grant select on public.scan_revisions to authenticated;

drop policy if exists "Admins review feedback" on public.analysis_feedback;
create policy "Admins review feedback" on public.analysis_feedback for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "Admins update feedback" on public.analysis_feedback;
create policy "Admins update feedback" on public.analysis_feedback for update
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
grant select, update on public.analysis_feedback to authenticated;

create or replace function public.persist_analysis(
  p_scan_id text,
  p_user_id uuid,
  p_cache_key text,
  p_input_kind text,
  p_input_text text,
  p_input_url text,
  p_payload jsonb,
  p_created_at timestamptz,
  p_previous_scan_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_payload jsonb;
begin
  insert into public.analysis_history (scan_id, user_id, cache_key, input_kind, input_text, input_url, payload, created_at)
  values (p_scan_id, p_user_id, p_cache_key, p_input_kind, p_input_text, p_input_url, p_payload, p_created_at);

  insert into public.scan_pages (scan_id, user_id, input_kind, input_text, input_url, payload, is_public, created_at)
  values (p_scan_id, p_user_id, p_input_kind, p_input_text, p_input_url, p_payload, false, p_created_at);

  if p_user_id is not null and p_previous_scan_id is not null then
    select payload into previous_payload from public.analysis_history
    where scan_id = p_previous_scan_id and user_id = p_user_id;
    if previous_payload is not null then
      insert into public.scan_revisions (scan_id, previous_scan_id, user_id, previous_payload, current_payload)
      values (p_scan_id, p_previous_scan_id, p_user_id, previous_payload, p_payload);
    end if;
  end if;
end;
$$;

revoke all on function public.persist_analysis(text, uuid, text, text, text, text, jsonb, timestamptz, text) from public, anon, authenticated;
grant execute on function public.persist_analysis(text, uuid, text, text, text, text, jsonb, timestamptz, text) to service_role;
