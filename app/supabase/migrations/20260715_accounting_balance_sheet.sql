-- Rotary OS accounting balance sheet V2.
-- Safe to rerun. Does not delete or modify accounting_entries,
-- accounting_categories, budgets, or legacy balance_sheet_items.

create table if not exists public.accounting_balance_categories (
  id uuid primary key default gen_random_uuid(),
  rotary_year_id uuid not null references public.rotary_years(id) on delete cascade,
  item_type text not null check (item_type in ('asset', 'liability', 'fund')),
  group_name text not null,
  name text not null,
  sort_order integer not null default 0,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rotary_year_id, item_type, group_name, name)
);

create table if not exists public.accounting_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  rotary_year_id uuid not null references public.rotary_years(id) on delete cascade,
  report_month date not null,
  report_date date not null,
  status text not null default 'draft' check (status in ('draft', 'closed')),
  imbalance_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rotary_year_id, report_month)
);

create table if not exists public.accounting_balance_values (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.accounting_balance_snapshots(id) on delete cascade,
  category_id uuid not null references public.accounting_balance_categories(id) on delete restrict,
  amount numeric not null default 0,
  system_calculated_amount numeric,
  manual_adjustment numeric not null default 0,
  adjustment_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (snapshot_id, category_id)
);

create index if not exists idx_accounting_balance_categories_year
  on public.accounting_balance_categories(rotary_year_id, item_type, sort_order);

create index if not exists idx_accounting_balance_snapshots_year_month
  on public.accounting_balance_snapshots(rotary_year_id, report_month);

create index if not exists idx_accounting_balance_values_snapshot
  on public.accounting_balance_values(snapshot_id, category_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_accounting_balance_categories_updated_at on public.accounting_balance_categories;
create trigger set_accounting_balance_categories_updated_at
before update on public.accounting_balance_categories
for each row execute function public.set_updated_at();

drop trigger if exists set_accounting_balance_snapshots_updated_at on public.accounting_balance_snapshots;
create trigger set_accounting_balance_snapshots_updated_at
before update on public.accounting_balance_snapshots
for each row execute function public.set_updated_at();

drop trigger if exists set_accounting_balance_values_updated_at on public.accounting_balance_values;
create trigger set_accounting_balance_values_updated_at
before update on public.accounting_balance_values
for each row execute function public.set_updated_at();

alter table public.accounting_balance_categories enable row level security;
alter table public.accounting_balance_snapshots enable row level security;
alter table public.accounting_balance_values enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'accounting_balance_categories',
    'accounting_balance_snapshots',
    'accounting_balance_values'
  ] loop
    execute format('drop policy if exists "%s public read" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s public insert" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s public update" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s public delete" on public.%I', table_name, table_name);
    execute format('create policy "%s public read" on public.%I for select using (true)', table_name, table_name);
    execute format('create policy "%s public insert" on public.%I for insert with check (true)', table_name, table_name);
    execute format('create policy "%s public update" on public.%I for update using (true) with check (true)', table_name, table_name);
    execute format('create policy "%s public delete" on public.%I for delete using (true)', table_name, table_name);
  end loop;
end $$;

with defaults(item_type, group_name, name, sort_order, is_system) as (
  values
    ('asset', '銀行活存', '國泰世華銀行', 1010, true),
    ('asset', '銀行活存', '新光銀行', 1020, true),
    ('asset', '零用金', '零用金', 2010, true),
    ('asset', '銀行定存', '國泰世華銀行', 3010, true),
    ('asset', '銀行定存', '新光銀行', 3020, true),
    ('asset', '應收款項', '應收款項', 4010, true),
    ('asset', '其他資產', '其他資產', 9010, true),
    ('fund', '基金／累積結餘', '歷屆累計餘絀', 5010, true),
    ('fund', '基金／累積結餘', '本年度累積結餘', 5020, true),
    ('fund', '基金／累積結餘', '其他基金', 5090, true),
    ('liability', '應付款項', '應付款項', 6010, true),
    ('liability', '代收付款', '扶輪基金代收', 7010, true),
    ('liability', '代收付款', '社費代收', 7020, true),
    ('liability', '代收付款', '活動代收', 7030, true),
    ('liability', '其他負債', '其他負債', 9010, true)
)
insert into public.accounting_balance_categories (
  rotary_year_id,
  item_type,
  group_name,
  name,
  sort_order,
  is_system,
  is_active
)
select
  y.id,
  defaults.item_type,
  defaults.group_name,
  defaults.name,
  defaults.sort_order,
  defaults.is_system,
  true
from public.rotary_years y
cross join defaults
on conflict (rotary_year_id, item_type, group_name, name) do nothing;
