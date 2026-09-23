-- Scans are private until the user explicitly chooses to share them.
alter table public.scan_pages
  alter column is_public set default false;

-- Existing deployments previously published every scan automatically.
-- Revoke that accidental exposure when this migration is applied.
update public.scan_pages
set is_public = false
where is_public = true;

-- Keep client writes scoped to the authenticated owner's records.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'analysis_history'
      and policyname = 'Users can update their own history'
  ) then
    create policy "Users can update their own history"
      on public.analysis_history
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'scan_pages'
      and policyname = 'Users can update their own scan pages'
  ) then
    create policy "Users can update their own scan pages"
      on public.scan_pages
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- The rate-limit RPC is called only by the Edge Function using the service role.
revoke execute on function public.check_analysis_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_analysis_rate_limit(text, integer, integer) to service_role;
