-- Safely void a posted accounting entry and its linked voucher.
-- Historical rows and voucher lines remain available for audit.

create or replace function public.void_accounting_entry_with_voucher(
  p_entry_id uuid,
  p_reason text default '使用者取消錯誤紀錄'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entry public.accounting_entries%rowtype;
  v_voucher public.accounting_vouchers%rowtype;
  v_reason text := coalesce(nullif(trim(p_reason), ''), '使用者取消錯誤紀錄');
begin
  select * into v_entry
  from public.accounting_entries
  where id = p_entry_id
  for update;

  if not found then raise exception '找不到指定收支紀錄'; end if;
  if v_entry.status = 'voided' then raise exception '這筆收支已經沖銷'; end if;

  if exists (
    select 1 from public.accounting_month_closes
    where rotary_year_id = v_entry.rotary_year_id
      and report_month = to_char(v_entry.entry_date, 'YYYY-MM')
      and status = 'closed'
  ) then
    raise exception '本月份已月結，請先解除月結後再操作';
  end if;

  select * into v_voucher
  from public.accounting_vouchers
  where source_entry_id = p_entry_id
  for update;

  if not found then raise exception '這筆收支沒有關聯傳票，請使用一般刪除'; end if;

  update public.accounting_vouchers
  set status = 'voided',
      note = concat_ws(E'\n', nullif(note, ''), '沖銷原因：' || v_reason),
      updated_at = now()
  where id = v_voucher.id;

  update public.accounting_entries
  set status = 'voided',
      note = concat_ws(E'\n', nullif(note, ''), '沖銷原因：' || v_reason),
      updated_at = now()
  where id = p_entry_id;

  return jsonb_build_object(
    'entry_id', p_entry_id,
    'voucher_id', v_voucher.id,
    'voucher_no', v_voucher.voucher_no,
    'status', 'voided'
  );
end;
$$;

grant execute on function public.void_accounting_entry_with_voucher(uuid, text)
to anon, authenticated;
