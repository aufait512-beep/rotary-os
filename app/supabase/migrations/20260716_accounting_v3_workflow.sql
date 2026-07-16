-- Rotary OS Accounting V3 workflow.
-- Safe to rerun. This migration never deletes business data, accounting
-- entries, dues records, balance snapshots, or closed-month history.

create extension if not exists pgcrypto;

alter table public.accounting_accounts
  add column if not exists account_category text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.accounting_entries
  add column if not exists account_id uuid null references public.accounting_accounts(id) on delete set null,
  add column if not exists source_type text null,
  add column if not exists source_id uuid null,
  add column if not exists status text not null default 'posted',
  add column if not exists reversal_of_id uuid null references public.accounting_entries(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

-- V1 used one unique dues_record_id per accounting entry. V3 deliberately
-- permits one dues record to be split across multiple accounting categories.
drop index if exists public.accounting_entries_dues_record_id_unique;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'accounting_entries_status_check'
      and conrelid = 'public.accounting_entries'::regclass
  ) then
    alter table public.accounting_entries
      add constraint accounting_entries_status_check
      check (status in ('draft', 'posted', 'voided')) not valid;
  end if;
end $$;

create table if not exists public.dues_payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  payment_date date not null,
  amount integer not null check (amount > 0),
  payment_method text not null,
  account_id uuid null references public.accounting_accounts(id) on delete set null,
  reference_no text null,
  note text null,
  status text not null default 'received' check (status in ('draft', 'received', 'posted', 'voided')),
  posted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dues_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.dues_payments(id) on delete restrict,
  dues_record_id uuid not null references public.dues_records(id) on delete restrict,
  allocated_amount integer not null check (allocated_amount > 0),
  created_at timestamptz not null default now(),
  unique (payment_id, dues_record_id)
);

create table if not exists public.accounting_reconciliations (
  id uuid primary key default gen_random_uuid(),
  rotary_year_id uuid not null references public.rotary_years(id) on delete restrict,
  report_month text not null,
  account_id uuid not null references public.accounting_accounts(id) on delete restrict,
  opening_balance numeric not null default 0,
  calculated_balance numeric not null default 0,
  actual_balance numeric null,
  difference numeric null,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  note text null,
  confirmed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rotary_year_id, report_month, account_id)
);

create table if not exists public.accounting_reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.accounting_reconciliations(id) on delete cascade,
  item_type text not null,
  description text not null,
  amount numeric not null default 0,
  is_resolved boolean not null default false,
  note text null,
  created_at timestamptz not null default now()
);

create table if not exists public.accounting_month_checklists (
  id uuid primary key default gen_random_uuid(),
  rotary_year_id uuid not null references public.rotary_years(id) on delete restrict,
  report_month text not null,
  item_key text not null,
  is_completed boolean not null default false,
  completed_at timestamptz null,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rotary_year_id, report_month, item_key)
);

create or replace function public.record_dues_payment(
  p_id uuid,
  p_member_id uuid,
  p_payment_date date,
  p_amount integer,
  p_payment_method text,
  p_account_id uuid,
  p_reference_no text,
  p_note text,
  p_allocations jsonb,
  p_apply_to_dues boolean default true
)
returns uuid
language plpgsql
security invoker
as $$
declare
  allocation jsonb;
  allocation_total integer := 0;
  target_record public.dues_records%rowtype;
begin
  if p_amount <= 0 then raise exception 'Payment amount must be positive'; end if;
  if p_account_id is null then raise exception 'Payment account is required'; end if;

  select coalesce(sum((item->>'allocated_amount')::integer), 0)
  into allocation_total
  from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) item;
  if allocation_total <= 0 or allocation_total > p_amount then
    raise exception 'Allocated amount must be positive and cannot exceed payment amount';
  end if;

  insert into public.dues_payments (
    id, member_id, payment_date, amount, payment_method, account_id,
    reference_no, note, status
  ) values (
    p_id, p_member_id, p_payment_date, p_amount, p_payment_method, p_account_id,
    nullif(p_reference_no, ''), nullif(p_note, ''), 'received'
  );

  for allocation in select * from jsonb_array_elements(p_allocations)
  loop
    select * into target_record
    from public.dues_records
    where id = (allocation->>'dues_record_id')::uuid
    for update;
    if target_record.id is null or target_record.member_id <> p_member_id then
      raise exception 'Dues allocation does not belong to the selected member';
    end if;
    insert into public.dues_payment_allocations (
      id, payment_id, dues_record_id, allocated_amount
    ) values (
      (allocation->>'id')::uuid,
      p_id,
      target_record.id,
      (allocation->>'allocated_amount')::integer
    );
    if p_apply_to_dues then
      update public.dues_records
      set paid_amount = coalesce(paid_amount, 0) + (allocation->>'allocated_amount')::integer,
          payment_date = p_payment_date,
          payment_method = p_payment_method
      where id = target_record.id;
    end if;
  end loop;
  return p_id;
end;
$$;

create or replace function public.post_dues_payment(
  p_payment_id uuid,
  p_rotary_year_id uuid,
  p_lines jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  payment_row public.dues_payments%rowtype;
  line jsonb;
  line_total integer := 0;
begin
  select * into payment_row from public.dues_payments where id = p_payment_id for update;
  if payment_row.id is null then raise exception 'Payment not found'; end if;
  if payment_row.status <> 'received' then raise exception 'Payment is not waiting to be posted'; end if;
  select coalesce(sum((item->>'amount')::integer), 0)
  into line_total from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) item;
  if line_total <> payment_row.amount then raise exception 'Posting lines do not equal payment amount'; end if;

  for line in select * from jsonb_array_elements(p_lines)
  loop
    insert into public.accounting_entries (
      id, rotary_year_id, entry_date, entry_type, category_id, category,
      description, amount, member_id, dues_record_id, account_id,
      payment_method, reference_no, is_pass_through, note,
      source_type, source_id, status
    ) values (
      (line->>'id')::uuid,
      p_rotary_year_id,
      payment_row.payment_date,
      'income',
      (line->>'category_id')::uuid,
      line->>'category',
      line->>'description',
      (line->>'amount')::integer,
      payment_row.member_id,
      case when coalesce(line->>'dues_record_id', '') = '' then null else (line->>'dues_record_id')::uuid end,
      payment_row.account_id,
      payment_row.payment_method,
      payment_row.reference_no,
      coalesce((line->>'is_pass_through')::boolean, false),
      nullif(payment_row.note, ''),
      line->>'source_type',
      (line->>'source_id')::uuid,
      'posted'
    );
  end loop;
  update public.dues_payments set status = 'posted', posted_at = now() where id = p_payment_id;
  return p_payment_id;
end;
$$;

create or replace function public.void_dues_payment(
  p_payment_id uuid,
  p_reversal_date date,
  p_reversal_lines jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  payment_row public.dues_payments%rowtype;
  allocation public.dues_payment_allocations%rowtype;
  line jsonb;
begin
  select * into payment_row from public.dues_payments where id = p_payment_id for update;
  if payment_row.id is null then raise exception 'Payment not found'; end if;
  if payment_row.status = 'voided' then raise exception 'Payment is already voided'; end if;

  if payment_row.status = 'posted' then
    if jsonb_array_length(coalesce(p_reversal_lines, '[]'::jsonb)) = 0 then
      raise exception 'Posted payment requires reversal lines';
    end if;
    for line in select * from jsonb_array_elements(p_reversal_lines)
    loop
      insert into public.accounting_entries (
        id, rotary_year_id, entry_date, entry_type, category_id, category,
        description, amount, member_id, dues_record_id, account_id,
        payment_method, reference_no, is_pass_through, note,
        source_type, source_id, reversal_of_id, status
      ) values (
        (line->>'id')::uuid,
        (line->>'rotary_year_id')::uuid,
        p_reversal_date,
        line->>'entry_type',
        case when coalesce(line->>'category_id', '') = '' then null else (line->>'category_id')::uuid end,
        line->>'category',
        line->>'description',
        (line->>'amount')::integer,
        payment_row.member_id,
        case when coalesce(line->>'dues_record_id', '') = '' then null else (line->>'dues_record_id')::uuid end,
        payment_row.account_id,
        payment_row.payment_method,
        payment_row.reference_no,
        coalesce((line->>'is_pass_through')::boolean, false),
        '保留原始交易，以反向分錄沖銷。',
        'dues_payment_reversal',
        (line->>'source_id')::uuid,
        (line->>'reversal_of_id')::uuid,
        'posted'
      );
    end loop;
  end if;

  for allocation in
    select * from public.dues_payment_allocations where payment_id = p_payment_id
  loop
    update public.dues_records
    set paid_amount = greatest(0, coalesce(paid_amount, 0) - allocation.allocated_amount)
    where id = allocation.dues_record_id;
  end loop;
  update public.dues_payments set status = 'voided' where id = p_payment_id;
  return p_payment_id;
end;
$$;

create index if not exists idx_accounting_entries_account_date
  on public.accounting_entries(account_id, entry_date);
create index if not exists idx_accounting_entries_source
  on public.accounting_entries(source_type, source_id);
create unique index if not exists accounting_entries_source_category_unique
  on public.accounting_entries(source_type, source_id, category_id)
  where source_type is not null and source_id is not null and category_id is not null and status <> 'voided';
create index if not exists idx_dues_payments_member_date
  on public.dues_payments(member_id, payment_date);
create index if not exists idx_dues_payments_status
  on public.dues_payments(status, payment_date);
create index if not exists idx_dues_payment_allocations_record
  on public.dues_payment_allocations(dues_record_id);
create index if not exists idx_accounting_reconciliations_month
  on public.accounting_reconciliations(rotary_year_id, report_month);
create index if not exists idx_accounting_reconciliation_items_parent
  on public.accounting_reconciliation_items(reconciliation_id);
create index if not exists idx_accounting_month_checklists_month
  on public.accounting_month_checklists(rotary_year_id, report_month);

create or replace function public.set_accounting_v3_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_accounting_accounts_v3_updated_at on public.accounting_accounts;
create trigger set_accounting_accounts_v3_updated_at
before update on public.accounting_accounts
for each row execute function public.set_accounting_v3_updated_at();

drop trigger if exists set_accounting_entries_v3_updated_at on public.accounting_entries;
create trigger set_accounting_entries_v3_updated_at
before update on public.accounting_entries
for each row execute function public.set_accounting_v3_updated_at();

drop trigger if exists set_dues_payments_updated_at on public.dues_payments;
create trigger set_dues_payments_updated_at
before update on public.dues_payments
for each row execute function public.set_accounting_v3_updated_at();

drop trigger if exists set_accounting_reconciliations_updated_at on public.accounting_reconciliations;
create trigger set_accounting_reconciliations_updated_at
before update on public.accounting_reconciliations
for each row execute function public.set_accounting_v3_updated_at();

drop trigger if exists set_accounting_month_checklists_updated_at on public.accounting_month_checklists;
create trigger set_accounting_month_checklists_updated_at
before update on public.accounting_month_checklists
for each row execute function public.set_accounting_v3_updated_at();

-- Close the remaining insert gap in the existing month-lock protection.
drop trigger if exists prevent_locked_accounting_entry_insert on public.accounting_entries;
create trigger prevent_locked_accounting_entry_insert
before insert on public.accounting_entries
for each row execute function public.prevent_locked_accounting_entry_change();

alter table public.dues_payments enable row level security;
alter table public.dues_payment_allocations enable row level security;
alter table public.accounting_reconciliations enable row level security;
alter table public.accounting_reconciliation_items enable row level security;
alter table public.accounting_month_checklists enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'dues_payments',
    'dues_payment_allocations',
    'accounting_reconciliations',
    'accounting_reconciliation_items',
    'accounting_month_checklists'
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

-- Keep current frontend access behavior for the two altered existing tables.
drop policy if exists "accounting_accounts public read" on public.accounting_accounts;
drop policy if exists "accounting_accounts public insert" on public.accounting_accounts;
drop policy if exists "accounting_accounts public update" on public.accounting_accounts;
drop policy if exists "accounting_accounts public delete" on public.accounting_accounts;
create policy "accounting_accounts public read" on public.accounting_accounts for select using (true);
create policy "accounting_accounts public insert" on public.accounting_accounts for insert with check (true);
create policy "accounting_accounts public update" on public.accounting_accounts for update using (true) with check (true);
create policy "accounting_accounts public delete" on public.accounting_accounts for delete using (true);

drop policy if exists "accounting_entries public read" on public.accounting_entries;
drop policy if exists "accounting_entries public insert" on public.accounting_entries;
drop policy if exists "accounting_entries public update" on public.accounting_entries;
drop policy if exists "accounting_entries public delete" on public.accounting_entries;
create policy "accounting_entries public read" on public.accounting_entries for select using (true);
create policy "accounting_entries public insert" on public.accounting_entries for insert with check (true);
create policy "accounting_entries public update" on public.accounting_entries for update using (true) with check (true);
create policy "accounting_entries public delete" on public.accounting_entries for delete using (true);

-- Add the standard cash and bank accounts once per Rotary year. Existing
-- accounts and opening balances remain untouched.
with account_defaults(account_type, account_category, name, sort_order) as (
  values
    ('asset', 'bank_current', '國泰世華銀行活存', 10),
    ('asset', 'bank_current', '新光銀行活存', 20),
    ('asset', 'bank_deposit', '國泰世華銀行定存', 30),
    ('asset', 'bank_deposit', '新光銀行定存', 40),
    ('asset', 'cash', '零用金', 50),
    ('asset', 'other', '其他帳戶', 90)
)
insert into public.accounting_accounts (
  rotary_year_id, account_type, account_category, name, opening_balance, sort_order, is_active
)
select y.id, d.account_type, d.account_category, d.name, 0, d.sort_order, true
from public.rotary_years y
cross join account_defaults d
where not exists (
  select 1 from public.accounting_accounts a
  where a.rotary_year_id = y.id and a.name = d.name
);
