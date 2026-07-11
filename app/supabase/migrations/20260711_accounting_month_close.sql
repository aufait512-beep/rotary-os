create extension if not exists pgcrypto;

create table if not exists public.accounting_month_closes (
  id uuid primary key default gen_random_uuid(),
  rotary_year_id uuid not null references public.rotary_years(id) on delete cascade,
  report_month text not null,
  status text not null default 'draft' check (status in ('draft', 'closed')),
  closed_at timestamptz null,
  closed_by text null,
  note text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (rotary_year_id, report_month)
);

create table if not exists public.accounting_month_close_logs (
  id uuid primary key default gen_random_uuid(),
  month_close_id uuid not null references public.accounting_month_closes(id) on delete cascade,
  action text not null,
  reason text null,
  created_at timestamptz default now()
);

create index if not exists idx_accounting_month_closes_year_month
  on public.accounting_month_closes(rotary_year_id, report_month);

create index if not exists idx_accounting_month_close_logs_close_id
  on public.accounting_month_close_logs(month_close_id);

create or replace function public.prevent_locked_accounting_entry_change()
returns trigger
language plpgsql
as $$
declare
  target_year_id uuid;
  target_entry_date date;
  target_month text;
begin
  target_year_id := coalesce(old.rotary_year_id, new.rotary_year_id);
  target_entry_date := coalesce(old.entry_date, new.entry_date);
  target_month := to_char(target_entry_date, 'YYYY-MM');

  if exists (
    select 1
    from public.accounting_month_closes close_row
    where close_row.rotary_year_id = target_year_id
      and close_row.report_month = target_month
      and close_row.status = 'closed'
  ) then
    raise exception 'Accounting month % is closed. Unlock it before editing entries.', target_month;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists prevent_locked_accounting_entry_update on public.accounting_entries;
create trigger prevent_locked_accounting_entry_update
before update on public.accounting_entries
for each row execute function public.prevent_locked_accounting_entry_change();

drop trigger if exists prevent_locked_accounting_entry_delete on public.accounting_entries;
create trigger prevent_locked_accounting_entry_delete
before delete on public.accounting_entries
for each row execute function public.prevent_locked_accounting_entry_change();

alter table public.accounting_month_closes enable row level security;
alter table public.accounting_month_close_logs enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'accounting_month_closes',
    'accounting_month_close_logs'
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
