create table if not exists public.analysis_feedback (
  id uuid primary key default gen_random_uuid(),
  scan_id text not null references public.analysis_history(scan_id) on delete cascade,
  rating text not null check (rating in ('up', 'down')),
  created_at timestamptz not null default now()
);

create index if not exists analysis_feedback_scan_id_idx on public.analysis_feedback (scan_id);
alter table public.analysis_feedback enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'analysis_feedback' and policyname = 'Service role manages feedback') then
    create policy "Service role manages feedback" on public.analysis_feedback for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;
