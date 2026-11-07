-- Visitor counter for the landing page footer (see src/lib/store.ts → countVisit).
-- The table is locked down by RLS; clients can only go through visit_count(), which can
-- add 1 or read the total, never set or reset it.

create table if not exists public.site_stats (
  key   text primary key,
  count bigint not null default 0
);

alter table public.site_stats enable row level security;
-- No RLS policies: anon/authenticated clients can neither read nor write the table directly.

insert into public.site_stats (key, count) values ('visitors', 0)
on conflict (key) do nothing;

-- Atomically increments (or just reads) the visitor counter and returns the current value.
create or replace function public.visit_count(increment boolean default false)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  result bigint;
begin
  if increment then
    insert into public.site_stats (key, count) values ('visitors', 1)
    on conflict (key) do update set count = public.site_stats.count + 1
    returning count into result;
  else
    select count into result from public.site_stats where key = 'visitors';
  end if;
  return coalesce(result, 0);
end;
$$;

revoke all on function public.visit_count(boolean) from public;
grant execute on function public.visit_count(boolean) to anon, authenticated, service_role;
