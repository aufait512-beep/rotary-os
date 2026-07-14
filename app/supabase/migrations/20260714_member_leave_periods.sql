create table if not exists public.member_leave_periods (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  start_date date not null,
  end_date date null,
  reason text null,
  annual_fee_amount integer not null default 1000,
  is_active boolean not null default true,
  note text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint member_leave_periods_date_range_check
    check (end_date is null or end_date >= start_date)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'member_leave_periods_date_range_check'
  ) then
    alter table public.member_leave_periods
      add constraint member_leave_periods_date_range_check
      check (end_date is null or end_date >= start_date);
  end if;
end $$;

create index if not exists member_leave_periods_member_id_idx
  on public.member_leave_periods(member_id);

create index if not exists member_leave_periods_start_date_idx
  on public.member_leave_periods(start_date);

create index if not exists member_leave_periods_end_date_idx
  on public.member_leave_periods(end_date);

create index if not exists member_leave_periods_is_active_idx
  on public.member_leave_periods(is_active);

create or replace function public.set_member_leave_periods_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_member_leave_periods_updated_at on public.member_leave_periods;
create trigger set_member_leave_periods_updated_at
before update on public.member_leave_periods
for each row
execute function public.set_member_leave_periods_updated_at();

alter table public.member_leave_periods enable row level security;

drop policy if exists "member_leave_periods_select_public" on public.member_leave_periods;
create policy "member_leave_periods_select_public"
on public.member_leave_periods
for select
to anon, authenticated
using (true);

drop policy if exists "member_leave_periods_insert_public" on public.member_leave_periods;
create policy "member_leave_periods_insert_public"
on public.member_leave_periods
for insert
to anon, authenticated
with check (true);

drop policy if exists "member_leave_periods_update_public" on public.member_leave_periods;
create policy "member_leave_periods_update_public"
on public.member_leave_periods
for update
to anon, authenticated
using (true)
with check (true);
