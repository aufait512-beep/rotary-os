create extension if not exists pgcrypto;

create table if not exists public.accounting_vouchers (
  id uuid primary key default gen_random_uuid(),
  rotary_year_id uuid not null references public.rotary_years(id) on delete restrict,
  voucher_no text not null unique,
  voucher_date date not null,
  description text not null,
  source_entry_id uuid null references public.accounting_entries(id) on delete restrict,
  status text not null default 'posted' check (status in ('draft', 'posted', 'voided')),
  total_debit numeric not null default 0 check (total_debit >= 0),
  total_credit numeric not null default 0 check (total_credit >= 0),
  smart_input text null,
  smart_confidence text null,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_entry_id)
);

create table if not exists public.accounting_voucher_lines (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.accounting_vouchers(id) on delete restrict,
  line_no integer not null check (line_no > 0),
  line_side text not null check (line_side in ('debit', 'credit')),
  account_id uuid null references public.accounting_accounts(id) on delete restrict,
  category_id uuid null references public.accounting_categories(id) on delete restrict,
  subject_name text not null,
  amount numeric not null check (amount > 0),
  note text null,
  created_at timestamptz not null default now(),
  check (
    (account_id is not null and category_id is null)
    or (account_id is null and category_id is not null)
  ),
  unique (voucher_id, line_no)
);

create index if not exists idx_accounting_vouchers_year_date
  on public.accounting_vouchers(rotary_year_id, voucher_date desc);
create index if not exists idx_accounting_voucher_lines_voucher
  on public.accounting_voucher_lines(voucher_id, line_no);

create or replace function public.set_accounting_voucher_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_accounting_vouchers_updated_at on public.accounting_vouchers;
create trigger set_accounting_vouchers_updated_at
before update on public.accounting_vouchers
for each row execute function public.set_accounting_voucher_updated_at();

alter table public.accounting_vouchers enable row level security;
alter table public.accounting_voucher_lines enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['accounting_vouchers', 'accounting_voucher_lines']
  loop
    execute format('drop policy if exists "%s public read" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s public insert" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s public update" on public.%I', table_name, table_name);
    execute format('create policy "%s public read" on public.%I for select to anon, authenticated using (true)', table_name, table_name);
    execute format('create policy "%s public insert" on public.%I for insert to anon, authenticated with check (true)', table_name, table_name);
    execute format('create policy "%s public update" on public.%I for update to anon, authenticated using (true) with check (true)', table_name, table_name);
  end loop;
end $$;

create or replace function public.create_accounting_voucher(
  p_voucher_id uuid,
  p_rotary_year_id uuid,
  p_voucher_date date,
  p_description text,
  p_smart_input text,
  p_smart_confidence text,
  p_note text,
  p_source_entry_id uuid default null,
  p_entry_payload jsonb default null,
  p_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source_entry public.accounting_entries%rowtype;
  v_source_entry_id uuid := p_source_entry_id;
  v_voucher_no text;
  v_sequence integer;
  v_debit_total numeric := 0;
  v_credit_total numeric := 0;
  v_line jsonb;
  v_account_id uuid;
  v_category_id uuid;
  v_subject_name text;
begin
  if p_voucher_id is null or p_rotary_year_id is null or p_voucher_date is null then
    raise exception '傳票年度、日期與識別碼不可空白';
  end if;
  if nullif(trim(p_description), '') is null then
    raise exception '傳票摘要不可空白';
  end if;
  if not exists (select 1 from public.rotary_years where id = p_rotary_year_id) then
    raise exception '找不到指定扶輪年度';
  end if;
  if exists (
    select 1 from public.accounting_month_closes
    where rotary_year_id = p_rotary_year_id
      and report_month = to_char(p_voucher_date, 'YYYY-MM')
      and status = 'closed'
  ) then
    raise exception '本月份已月結，請先解除月結後再建立傳票';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) < 2 then
    raise exception '傳票至少需要一筆借方與一筆貸方';
  end if;

  select
    coalesce(sum((item->>'amount')::numeric) filter (where item->>'line_side' = 'debit'), 0),
    coalesce(sum((item->>'amount')::numeric) filter (where item->>'line_side' = 'credit'), 0)
  into v_debit_total, v_credit_total
  from jsonb_array_elements(p_lines) item;

  if v_debit_total <= 0 or v_credit_total <= 0 or v_debit_total <> v_credit_total then
    raise exception '傳票借貸不平衡：借方 %，貸方 %', v_debit_total, v_credit_total;
  end if;

  if p_source_entry_id is not null then
    select * into v_source_entry
    from public.accounting_entries
    where id = p_source_entry_id
    for update;
    if not found then raise exception '找不到選定的收支紀錄'; end if;
    if v_source_entry.rotary_year_id <> p_rotary_year_id then raise exception '收支紀錄不屬於選定年度'; end if;
    if v_source_entry.entry_date <> p_voucher_date then raise exception '傳票日期必須與選定收支日期相同'; end if;
    if abs(v_source_entry.amount) <> v_debit_total then raise exception '傳票金額與選定收支金額不一致'; end if;
    if exists (select 1 from public.accounting_vouchers where source_entry_id = p_source_entry_id) then
      raise exception '這筆收支已經建立傳票，不可重複列帳';
    end if;
  elsif p_entry_payload is null then
    raise exception '請選擇既有收支，或提供要列帳的交易資料';
  end if;

  perform pg_advisory_xact_lock(hashtext('accounting-voucher-' || p_voucher_date::text));
  select count(*) + 1 into v_sequence
  from public.accounting_vouchers
  where voucher_date = p_voucher_date;
  v_voucher_no := to_char(p_voucher_date, 'YYYYMMDD') || '-' || lpad(v_sequence::text, 3, '0');

  insert into public.accounting_vouchers (
    id, rotary_year_id, voucher_no, voucher_date, description,
    source_entry_id, status, total_debit, total_credit,
    smart_input, smart_confidence, note
  ) values (
    p_voucher_id, p_rotary_year_id, v_voucher_no, p_voucher_date, trim(p_description),
    v_source_entry_id, 'posted', v_debit_total, v_credit_total,
    nullif(trim(p_smart_input), ''), nullif(trim(p_smart_confidence), ''), nullif(trim(p_note), '')
  );

  if v_source_entry_id is null then
    if coalesce((p_entry_payload->>'amount')::numeric, 0) <> v_debit_total then
      raise exception '列帳金額與傳票金額不一致';
    end if;
    if (p_entry_payload->>'entry_type') not in ('income', 'expense') then
      raise exception '交易類型必須為收入或支出';
    end if;
    if nullif(p_entry_payload->>'category_id', '') is null or nullif(p_entry_payload->>'account_id', '') is null then
      raise exception '列帳科目與收付款帳戶不可空白';
    end if;

    v_source_entry_id := coalesce(nullif(p_entry_payload->>'id', '')::uuid, gen_random_uuid());
    insert into public.accounting_entries (
      id, rotary_year_id, entry_date, entry_type, category_id, category,
      description, amount, account_id, payment_method, reference_no,
      is_pass_through, note, source_type, source_id, status
    ) values (
      v_source_entry_id, p_rotary_year_id, p_voucher_date,
      p_entry_payload->>'entry_type', (p_entry_payload->>'category_id')::uuid,
      p_entry_payload->>'category', trim(p_description),
      (p_entry_payload->>'amount')::numeric, (p_entry_payload->>'account_id')::uuid,
      coalesce(nullif(p_entry_payload->>'payment_method', ''), '其他'),
      nullif(p_entry_payload->>'reference_no', ''), false,
      nullif(p_entry_payload->>'note', ''), 'smart_voucher', p_voucher_id, 'posted'
    );
    update public.accounting_vouchers
    set source_entry_id = v_source_entry_id
    where id = p_voucher_id;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_account_id := case when nullif(v_line->>'account_id', '') is null then null else (v_line->>'account_id')::uuid end;
    v_category_id := case when nullif(v_line->>'category_id', '') is null then null else (v_line->>'category_id')::uuid end;
    if (v_account_id is null) = (v_category_id is null) then
      raise exception '每筆分錄必須選擇一個帳戶或一個會計科目';
    end if;
    if v_account_id is not null then
      select name into v_subject_name from public.accounting_accounts
      where id = v_account_id and rotary_year_id = p_rotary_year_id;
    else
      select name into v_subject_name from public.accounting_categories
      where id = v_category_id and rotary_year_id = p_rotary_year_id;
    end if;
    if v_subject_name is null then raise exception '找不到分錄科目'; end if;

    insert into public.accounting_voucher_lines (
      id, voucher_id, line_no, line_side, account_id,
      category_id, subject_name, amount, note
    ) values (
      coalesce(nullif(v_line->>'id', '')::uuid, gen_random_uuid()),
      p_voucher_id, (v_line->>'line_no')::integer,
      v_line->>'line_side', v_account_id, v_category_id,
      v_subject_name, (v_line->>'amount')::numeric,
      nullif(v_line->>'note', '')
    );
  end loop;

  return jsonb_build_object(
    'voucher_id', p_voucher_id,
    'voucher_no', v_voucher_no,
    'source_entry_id', v_source_entry_id,
    'total_debit', v_debit_total,
    'total_credit', v_credit_total,
    'status', 'posted'
  );
end;
$$;

grant execute on function public.create_accounting_voucher(
  uuid, uuid, date, text, text, text, text, uuid, jsonb, jsonb
) to anon, authenticated;
