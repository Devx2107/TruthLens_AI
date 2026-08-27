-- Scans contain user-provided text and must be private unless explicitly
-- published by a future, authenticated workflow.
alter table public.scan_pages
  alter column is_public set default false;

update public.scan_pages
set is_public = false
where is_public = true;
