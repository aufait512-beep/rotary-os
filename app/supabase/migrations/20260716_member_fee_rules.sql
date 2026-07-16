-- Rotary OS member fee rules and dated member roles.
-- Safe to rerun. Existing members, dues records, dues line items, payments,
-- accounting data, role history, and user-edited fee rules are preserved.

create extension if not exists pgcrypto;

create table if not exists public.member_roles (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  rotary_year_id uuid not null references public.rotary_years(id) on delete restrict,
  role_type text not null check (role_type in (
    'president',
    'secretary',
    'president_elect',
    'board_member',
    'committee_member',
    'senior_member',
    'other'
  )),
  role_name text not null default '',
  start_date date not null,
  end_date date null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_roles_date_range_check
    check (end_date is null or end_date >= start_date),
  unique (member_id, rotary_year_id, role_type, start_date)
);

create table if not exists public.member_fee_rules (
  id uuid primary key default gen_random_uuid(),
  rotary_year_id uuid not null references public.rotary_years(id) on delete restrict,
  fee_type text not null check (fee_type in ('annual_fee', 'special_donation')),
  condition_type text not null check (condition_type in ('general', 'senior', 'long_leave', 'role')),
  condition_value text not null default '',
  amount integer not null default 0 check (amount >= 0),
  priority integer not null default 100 check (priority >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rotary_year_id, fee_type, condition_type, condition_value)
);

create index if not exists idx_member_roles_member_date
  on public.member_roles(member_id, start_date, end_date);
create index if not exists idx_member_roles_year_type
  on public.member_roles(rotary_year_id, role_type, is_active);
create index if not exists idx_member_fee_rules_year_priority
  on public.member_fee_rules(rotary_year_id, fee_type, is_active, priority);

create or replace function public.set_member_fee_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_member_roles_updated_at on public.member_roles;
create trigger set_member_roles_updated_at
before update on public.member_roles
for each row execute function public.set_member_fee_updated_at();

drop trigger if exists set_member_fee_rules_updated_at on public.member_fee_rules;
create trigger set_member_fee_rules_updated_at
before update on public.member_fee_rules
for each row execute function public.set_member_fee_updated_at();

alter table public.member_roles enable row level security;
alter table public.member_fee_rules enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['member_roles', 'member_fee_rules']
  loop
    execute format('drop policy if exists "%s public read" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s public insert" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s public update" on public.%I', table_name, table_name);
    execute format('create policy "%s public read" on public.%I for select using (true)', table_name, table_name);
    execute format('create policy "%s public insert" on public.%I for insert with check (true)', table_name, table_name);
    execute format('create policy "%s public update" on public.%I for update using (true) with check (true)', table_name, table_name);
  end loop;
end $$;

-- Lower priority numbers win. These rows are inserted only when absent, so a
-- later safe rerun never overwrites amounts edited in the application.
with defaults(fee_type, condition_type, condition_value, amount, priority) as (
  values
    ('annual_fee', 'long_leave', '', 1000, 10),
    ('annual_fee', 'senior', '', 1000, 20),
    ('annual_fee', 'general', '', 2000, 100),
    ('special_donation', 'long_leave', '', 250, 10),
    ('special_donation', 'senior', '', 250, 20),
    ('special_donation', 'role', 'president', 1000, 30),
    ('special_donation', 'role', 'secretary', 1000, 40),
    ('special_donation', 'role', 'president_elect', 1000, 50),
    ('special_donation', 'role', 'board_member', 800, 60),
    ('special_donation', 'role', 'committee_member', 800, 60),
    ('special_donation', 'general', '', 500, 100)
)
insert into public.member_fee_rules (
  rotary_year_id,
  fee_type,
  condition_type,
  condition_value,
  amount,
  priority,
  is_active
)
select
  y.id,
  d.fee_type,
  d.condition_type,
  d.condition_value,
  d.amount,
  d.priority,
  true
from public.rotary_years y
cross join defaults d
where y.name = '2026-2027'
on conflict (rotary_year_id, fee_type, condition_type, condition_value) do nothing;
