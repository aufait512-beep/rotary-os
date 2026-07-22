-- Rotary OS Beta 1.0 - identity and role based access control.
-- Roles: executive_secretary, president, member.
-- IMPORTANT: the earliest existing auth user (or the first future signup)
-- becomes executive secretary so the application cannot be locked out.

create extension if not exists pgcrypto;

create table if not exists public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  role text not null default 'member' check (role in ('executive_secretary', 'president', 'member')),
  member_id uuid null references public.members(id) on delete set null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists app_users_member_id_unique
  on public.app_users(member_id) where member_id is not null;
create index if not exists app_users_role_active_idx on public.app_users(role, is_active);

create or replace function public.is_executive_secretary()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.app_users
  where user_id = auth.uid() and role = 'executive_secretary' and is_active
); $$;

create or replace function public.is_event_manager()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.app_users
  where user_id = auth.uid() and role in ('executive_secretary', 'president') and is_active
); $$;

create or replace function public.current_app_member_id()
returns uuid language sql stable security definer set search_path = public
as $$ select member_id from public.app_users where user_id = auth.uid() and is_active limit 1; $$;

create or replace function public.handle_new_app_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_role text;
  v_member_id uuid;
begin
  select case when exists(select 1 from public.app_users where role = 'executive_secretary')
    then 'member' else 'executive_secretary' end into v_role;
  select id into v_member_id from public.members
    where lower(coalesce(email, '')) = lower(coalesce(new.email, '')) and coalesce(email, '') <> '' limit 1;
  insert into public.app_users(user_id, email, display_name, role, member_id, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    v_role,
    v_member_id,
    v_role = 'executive_secretary'
  ) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_rotary_os on auth.users;
create trigger on_auth_user_created_rotary_os
after insert on auth.users for each row execute function public.handle_new_app_user();

-- Backfill existing Auth users. The earliest account is the initial executive secretary.
with ranked_users as (
  select u.*, row_number() over(order by u.created_at, u.id) as position
  from auth.users u
), prepared as (
  select
    u.id,
    coalesce(u.email, '') as email,
    coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '') as display_name,
    case
      when exists(select 1 from public.app_users where role = 'executive_secretary') then 'member'
      when u.position = 1 then 'executive_secretary'
      else 'member'
    end as role,
    (select m.id from public.members m where lower(coalesce(m.email, '')) = lower(coalesce(u.email, '')) and coalesce(m.email, '') <> '' limit 1) as member_id
  from ranked_users u
)
insert into public.app_users(user_id, email, display_name, role, member_id, is_active)
select id, email, display_name, role, member_id, role = 'executive_secretary' from prepared
on conflict (user_id) do nothing;

alter table public.app_users enable row level security;

do $$
declare policy_row record;
begin
  for policy_row in select policyname from pg_policies where schemaname='public' and tablename='app_users'
  loop execute format('drop policy if exists %I on public.app_users', policy_row.policyname); end loop;
end $$;

create policy "app users read own or executive" on public.app_users for select to authenticated
using (user_id = auth.uid() or public.is_executive_secretary());
create policy "app users executive update" on public.app_users for update to authenticated
using (public.is_executive_secretary()) with check (public.is_executive_secretary());

-- Remove old permissive policies from internal tables.
do $$
declare table_name text; policy_row record;
begin
  foreach table_name in array array[
    'rotary_years','events','programs','program_templates','program_template_blocks','event_types',
    'members','member_roles','member_leave_periods','member_fee_rules','meeting_attendance',
    'dues_records','dues_line_items','dues_payments','dues_payment_allocations','dues_reference_documents',
    'accounting_categories','accounting_entries','accounting_accounts','balance_sheet_items','accounting_year_opening_balances','accounting_month_closes',
    'accounting_month_close_logs','accounting_balance_categories','accounting_balance_snapshots',
    'accounting_balance_values','accounting_reconciliations','accounting_reconciliation_items',
    'accounting_month_checklists','accounting_checklist_templates','accounting_vouchers',
    'accounting_voucher_lines','rotary_year_settings','rotary_year_transitions'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      for policy_row in select policyname from pg_policies where schemaname='public' and tablename=table_name
      loop execute format('drop policy if exists %I on public.%I', policy_row.policyname, table_name); end loop;
    end if;
  end loop;
end $$;

-- Calendar: every active signed-in account can read; president and executive secretary manage events.
create policy "years authenticated read" on public.rotary_years for select to authenticated using (true);
create policy "years executive insert" on public.rotary_years for insert to authenticated with check (public.is_executive_secretary());
create policy "years executive update" on public.rotary_years for update to authenticated using (public.is_executive_secretary()) with check (public.is_executive_secretary());
create policy "years executive delete" on public.rotary_years for delete to authenticated using (public.is_executive_secretary());
create policy "events authenticated read" on public.events for select to authenticated using (true);
create policy "events managers insert" on public.events for insert to authenticated with check (public.is_event_manager());
create policy "events managers update" on public.events for update to authenticated using (public.is_event_manager()) with check (public.is_event_manager());
create policy "events managers delete" on public.events for delete to authenticated using (public.is_event_manager());

-- Members can only read their own member and dues rows. Executive secretary manages all.
create policy "members own or executive read" on public.members for select to authenticated
using (id = public.current_app_member_id() or public.is_executive_secretary());
create policy "members executive insert" on public.members for insert to authenticated with check (public.is_executive_secretary());
create policy "members executive update" on public.members for update to authenticated using (public.is_executive_secretary()) with check (public.is_executive_secretary());
create policy "members executive delete" on public.members for delete to authenticated using (public.is_executive_secretary());
create policy "dues own or executive read" on public.dues_records for select to authenticated
using (member_id = public.current_app_member_id() or public.is_executive_secretary());
create policy "dues executive insert" on public.dues_records for insert to authenticated with check (public.is_executive_secretary());
create policy "dues executive update" on public.dues_records for update to authenticated using (public.is_executive_secretary()) with check (public.is_executive_secretary());
create policy "dues executive delete" on public.dues_records for delete to authenticated using (public.is_executive_secretary());
create policy "dues lines own or executive read" on public.dues_line_items for select to authenticated
using (exists(select 1 from public.dues_records d where d.id=dues_record_id and (d.member_id=public.current_app_member_id() or public.is_executive_secretary())));
create policy "dues lines executive all" on public.dues_line_items for all to authenticated
using (public.is_executive_secretary()) with check (public.is_executive_secretary());

-- All remaining internal management tables are executive-secretary only.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'programs','program_templates','program_template_blocks','event_types','member_roles','member_leave_periods',
    'member_fee_rules','meeting_attendance','dues_payments','dues_payment_allocations','dues_reference_documents',
    'accounting_categories','accounting_entries','accounting_accounts','balance_sheet_items','accounting_year_opening_balances','accounting_month_closes',
    'accounting_month_close_logs','accounting_balance_categories','accounting_balance_snapshots',
    'accounting_balance_values','accounting_reconciliations','accounting_reconciliation_items',
    'accounting_month_checklists','accounting_checklist_templates','accounting_vouchers',
    'accounting_voucher_lines','rotary_year_settings','rotary_year_transitions'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('create policy %I on public.%I for all to authenticated using (public.is_executive_secretary()) with check (public.is_executive_secretary())', table_name || ' executive access', table_name);
    end if;
  end loop;
end $$;

-- Read-only financial aggregate. No transaction, voucher, bank, or member detail is returned.
create or replace function public.get_current_financial_summary()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_year public.rotary_years%rowtype; v_month_start date; v_month_end date;
  v_income_budget numeric; v_expense_budget numeric; v_income numeric; v_expense numeric;
begin
  if auth.uid() is null or not exists(select 1 from public.app_users where user_id=auth.uid() and is_active) then
    raise exception 'not authorized';
  end if;
  select * into v_year from public.rotary_years where is_active order by start_date desc limit 1;
  v_month_start := date_trunc('month', timezone('Asia/Taipei', now()))::date;
  v_month_end := (v_month_start + interval '1 month')::date;
  select coalesce(sum(annual_budget) filter(where entry_type='income'),0), coalesce(sum(annual_budget) filter(where entry_type='expense'),0)
    into v_income_budget,v_expense_budget from public.accounting_categories where rotary_year_id=v_year.id and is_active;
  select coalesce(sum(amount) filter(where entry_type='income'),0), coalesce(sum(amount) filter(where entry_type='expense'),0)
    into v_income,v_expense from public.accounting_entries
    where rotary_year_id=v_year.id and entry_date>=v_month_start and entry_date<v_month_end
      and coalesce(is_pass_through,false)=false and coalesce(status,'posted')<>'voided';
  return jsonb_build_object(
    'rotaryYear',coalesce(v_year.display_name,v_year.name,''),'month',to_char(v_month_start,'YYYY-MM'),
    'annualIncomeBudget',coalesce(v_income_budget,0),'annualExpenseBudget',coalesce(v_expense_budget,0),
    'monthIncome',coalesce(v_income,0),'monthExpense',coalesce(v_expense,0),
    'monthBalance',coalesce(v_income,0)-coalesce(v_expense,0)
  );
end;
$$;
revoke all on function public.get_current_financial_summary() from public, anon;
grant execute on function public.get_current_financial_summary() to authenticated;

-- Restrict replaceable dues-reference storage to executive secretary.
drop policy if exists "dues reference storage read" on storage.objects;
drop policy if exists "dues reference storage insert" on storage.objects;
drop policy if exists "dues reference storage update" on storage.objects;
drop policy if exists "dues reference storage delete" on storage.objects;
create policy "dues reference executive read" on storage.objects for select to authenticated
using (bucket_id='dues-reference' and public.is_executive_secretary());
create policy "dues reference executive insert" on storage.objects for insert to authenticated
with check (bucket_id='dues-reference' and public.is_executive_secretary());
create policy "dues reference executive update" on storage.objects for update to authenticated
using (bucket_id='dues-reference' and public.is_executive_secretary()) with check (bucket_id='dues-reference' and public.is_executive_secretary());
create policy "dues reference executive delete" on storage.objects for delete to authenticated
using (bucket_id='dues-reference' and public.is_executive_secretary());

grant execute on function public.is_executive_secretary() to authenticated;
grant execute on function public.is_event_manager() to authenticated;
grant execute on function public.current_app_member_id() to authenticated;
