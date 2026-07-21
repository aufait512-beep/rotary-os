-- Rotary OS Beta 1.0
-- 每月社費前期未繳安全結轉。
-- 可安全重跑；不刪除任何既有社費、付款或會計資料。

create or replace function public.calculate_dues_previous_balance(
  p_member_id uuid,
  p_period_month text
)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select greatest(
    coalesce(previous_balance, 0)
      + coalesce(current_due, 0)
      - coalesce(paid_amount, 0)
      - coalesce(discount_amount, 0),
    0
  )
  from public.dues_records
  where member_id = p_member_id
    and period_month = to_char(
      (to_date(p_period_month || '-01', 'YYYY-MM-DD') - interval '1 month'),
      'YYYY-MM'
    )
  order by created_at desc
  limit 1;
$$;

create or replace function public.set_dues_previous_balance_from_prior_month()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_previous_balance numeric;
begin
  v_previous_balance := public.calculate_dues_previous_balance(new.member_id, new.period_month);
  new.previous_balance := coalesce(v_previous_balance, 0);
  return new;
end;
$$;

drop trigger if exists dues_records_set_previous_balance on public.dues_records;

create trigger dues_records_set_previous_balance
before insert on public.dues_records
for each row
execute function public.set_dues_previous_balance_from_prior_month();

create or replace function public.refresh_next_month_dues_balance()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_next_month text;
begin
  v_next_month := to_char(
    to_date(new.period_month || '-01', 'YYYY-MM-DD') + interval '1 month',
    'YYYY-MM'
  );

  update public.dues_records next_record
  set previous_balance = greatest(
    coalesce(new.previous_balance, 0)
      + coalesce(new.current_due, 0)
      - coalesce(new.paid_amount, 0)
      - coalesce(new.discount_amount, 0),
    0
  )
  where next_record.member_id = new.member_id
    and next_record.period_month = v_next_month
    and coalesce(next_record.paid_amount, 0) = 0
    and next_record.payment_date is null;

  return new;
end;
$$;

drop trigger if exists dues_records_refresh_next_month_balance on public.dues_records;

create trigger dues_records_refresh_next_month_balance
after update of previous_balance, current_due, paid_amount, discount_amount on public.dues_records
for each row
when (
  old.previous_balance is distinct from new.previous_balance
  or old.current_due is distinct from new.current_due
  or old.paid_amount is distinct from new.paid_amount
  or old.discount_amount is distinct from new.discount_amount
)
execute function public.refresh_next_month_dues_balance();

create or replace function public.roll_forward_dues_balances(p_period_month text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  if p_period_month is null or p_period_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'period month must use YYYY-MM format';
  end if;

  update public.dues_records current_record
  set previous_balance = coalesce(
    public.calculate_dues_previous_balance(current_record.member_id, p_period_month),
    0
  )
  where current_record.period_month = p_period_month
    and coalesce(current_record.paid_amount, 0) = 0
    and current_record.payment_date is null;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

comment on function public.calculate_dues_previous_balance(uuid, text) is
  '計算指定社員前一月份尚待完成金額，供當月前期未繳使用。';

comment on function public.roll_forward_dues_balances(text) is
  '重新結轉指定月份尚未開始收款的社費紀錄；不覆蓋已有收款紀錄。';

-- Supabase 若已啟用 pg_cron，於台灣時間每月 1 日 00:05 執行。
-- 排程每日喚醒一次，但只有台灣日期為 1 日時才會結轉。
create or replace function public.run_monthly_dues_carry_forward()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_taipei_now timestamp;
begin
  v_taipei_now := timezone('Asia/Taipei', now());
  if extract(day from v_taipei_now) <> 1 then
    return 0;
  end if;
  return public.roll_forward_dues_balances(to_char(v_taipei_now, 'YYYY-MM'));
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'rotary-os-dues-monthly-carry-forward';

    perform cron.schedule(
      'rotary-os-dues-monthly-carry-forward',
      '5 16 * * *',
      'select public.run_monthly_dues_carry_forward();'
    );
  end if;
end;
$$;
