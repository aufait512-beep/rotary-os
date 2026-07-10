-- Rotary OS v1.1 migration
-- Safe to run more than once. Does not delete existing data.

create extension if not exists pgcrypto;

create table if not exists public.rotary_years (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_name text not null,
  start_date date not null,
  end_date date not null,
  is_active boolean default false,
  created_at timestamptz default now()
);

insert into public.rotary_years (name, display_name, start_date, end_date, is_active)
values ('2026-2027', '26-27年度', '2026-07-01', '2027-06-30', true)
on conflict (name) do update set
  display_name = excluded.display_name,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  is_active = excluded.is_active;

alter table public.events
  add column if not exists rotary_year_id uuid null references public.rotary_years(id) on delete set null;

update public.events e
set rotary_year_id = y.id
from public.rotary_years y
where y.name = '2026-2027'
  and e.date between y.start_date and y.end_date
  and e.rotary_year_id is null;

create table if not exists public.dues_line_items (
  id uuid primary key default gen_random_uuid(),
  dues_record_id uuid not null references public.dues_records(id) on delete cascade,
  item_type text not null check (item_type in ('meal', 'annual_fee', 'special_donation', 'red_box', 'rotary_foundation', 'pass_through')),
  item_name text,
  service_date date null,
  quantity integer default 1,
  unit_amount integer default 0,
  amount integer default 0,
  note text,
  created_at timestamptz default now()
);

create table if not exists public.accounting_categories (
  id uuid primary key default gen_random_uuid(),
  rotary_year_id uuid references public.rotary_years(id) on delete set null,
  entry_type text not null check (entry_type in ('income', 'expense')),
  group_name text,
  name text not null,
  annual_budget integer default 0,
  sort_order integer default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.accounting_entries (
  id uuid primary key default gen_random_uuid(),
  rotary_year_id uuid references public.rotary_years(id) on delete set null,
  entry_date date not null,
  entry_type text not null check (entry_type in ('income', 'expense')),
  category_id uuid null references public.accounting_categories(id) on delete set null,
  category text,
  description text,
  amount integer not null,
  member_id uuid null references public.members(id) on delete set null,
  dues_record_id uuid null references public.dues_records(id) on delete set null,
  donation_record_id uuid null references public.donation_records(id) on delete set null,
  payment_method text null,
  reference_no text null,
  is_pass_through boolean default false,
  note text,
  created_at timestamptz default now()
);

create table if not exists public.accounting_accounts (
  id uuid primary key default gen_random_uuid(),
  rotary_year_id uuid references public.rotary_years(id) on delete set null,
  account_type text,
  name text,
  opening_balance integer default 0,
  sort_order integer default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.balance_sheet_items (
  id uuid primary key default gen_random_uuid(),
  rotary_year_id uuid references public.rotary_years(id) on delete set null,
  item_type text not null check (item_type in ('asset', 'liability', 'fund')),
  group_name text,
  name text not null,
  amount integer default 0,
  sort_order integer default 0,
  note text,
  created_at timestamptz default now()
);

create unique index if not exists accounting_entries_dues_record_id_unique
  on public.accounting_entries(dues_record_id)
  where dues_record_id is not null;
create index if not exists idx_events_rotary_year_id on public.events(rotary_year_id);
create index if not exists idx_events_date_time on public.events(date, meeting_time);
create index if not exists idx_dues_line_items_dues_record_id on public.dues_line_items(dues_record_id);
create index if not exists idx_accounting_categories_year on public.accounting_categories(rotary_year_id, entry_type, sort_order);
create index if not exists idx_accounting_entries_year_month on public.accounting_entries(rotary_year_id, entry_date);
create index if not exists idx_accounting_entries_category on public.accounting_entries(category_id);
create index if not exists idx_accounting_accounts_year on public.accounting_accounts(rotary_year_id, sort_order);
create index if not exists idx_balance_sheet_items_year on public.balance_sheet_items(rotary_year_id, item_type, sort_order);

insert into public.accounting_categories (rotary_year_id, entry_type, group_name, name, annual_budget, sort_order)
select y.id, v.entry_type, v.group_name, v.name, 0, v.sort_order
from public.rotary_years y
cross join (values
  ('income', '社費收入', '常年費', 10),
  ('income', '社費收入', '餐費', 20),
  ('income', '捐獻收入', '社內服務基金', 30),
  ('income', '其他收入', '雜項收入', 90),
  ('expense', '例會支出', '餐費', 10),
  ('expense', '行政支出', '文具印刷', 20),
  ('expense', '服務支出', '公益服務', 30),
  ('expense', '其他支出', '雜項支出', 90)
) as v(entry_type, group_name, name, sort_order)
where y.name = '2026-2027'
  and not exists (
    select 1 from public.accounting_categories c
    where c.rotary_year_id = y.id and c.entry_type = v.entry_type and c.name = v.name
  );

insert into public.balance_sheet_items (rotary_year_id, item_type, group_name, name, amount, sort_order)
select y.id, v.item_type, v.group_name, v.name, 0, v.sort_order
from public.rotary_years y
cross join (values
  ('asset', '流動資產', '銀行活存', 10),
  ('asset', '固定資產', '銀行定存', 20),
  ('asset', '流動資產', '零用金', 30),
  ('asset', '流動資產', '應收款', 40),
  ('asset', '其他資產', '其他資產', 90),
  ('liability', '流動負債', '應付款', 10),
  ('liability', '代收款', '扶輪基金', 20),
  ('liability', '代收款', '社費代收', 30),
  ('liability', '代收款', '活動代收', 40),
  ('liability', '其他負債', '其他負債', 90)
) as v(item_type, group_name, name, sort_order)
where y.name = '2026-2027'
  and not exists (
    select 1 from public.balance_sheet_items b
    where b.rotary_year_id = y.id and b.item_type = v.item_type and b.name = v.name
  );

alter table public.rotary_years enable row level security;
alter table public.dues_line_items enable row level security;
alter table public.accounting_categories enable row level security;
alter table public.accounting_entries enable row level security;
alter table public.accounting_accounts enable row level security;
alter table public.balance_sheet_items enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'rotary_years',
    'dues_line_items',
    'accounting_categories',
    'accounting_entries',
    'accounting_accounts',
    'balance_sheet_items'
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
