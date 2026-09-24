-- Owners can read their private scan pages. Public readers retain access only
-- to rows that were explicitly published.
drop policy if exists "Users can read their own scan pages" on public.scan_pages;
create policy "Users can read their own scan pages"
  on public.scan_pages for select
  using (auth.uid() = user_id);

-- Publishing is intentionally restricted to this narrow owner-checked RPC.
revoke insert, update, delete on public.scan_pages from authenticated;
revoke insert, update, delete on public.analysis_history from authenticated;

create or replace function public.set_scan_visibility(p_scan_id text, p_is_public boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.scan_pages
  set is_public = p_is_public
  where scan_id = p_scan_id and user_id = auth.uid();
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.set_scan_visibility(text, boolean) from public, anon;
grant execute on function public.set_scan_visibility(text, boolean) to authenticated;

-- Persist the private history row and scan page in one database transaction.
create or replace function public.persist_analysis(
  p_scan_id text,
  p_user_id uuid,
  p_cache_key text,
  p_input_kind text,
  p_input_text text,
  p_input_url text,
  p_payload jsonb,
  p_created_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.analysis_history (scan_id, user_id, cache_key, input_kind, input_text, input_url, payload, created_at)
  values (p_scan_id, p_user_id, p_cache_key, p_input_kind, p_input_text, p_input_url, p_payload, p_created_at);

  insert into public.scan_pages (scan_id, user_id, input_kind, input_text, input_url, payload, is_public, created_at)
  values (p_scan_id, p_user_id, p_input_kind, p_input_text, p_input_url, p_payload, false, p_created_at);
end;
$$;

revoke all on function public.persist_analysis(text, uuid, text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.persist_analysis(text, uuid, text, text, text, text, jsonb, timestamptz) to service_role;

-- Only the Edge Function's service role may consume analysis quota.
revoke all on function public.check_analysis_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_analysis_rate_limit(text, integer, integer) to service_role;
