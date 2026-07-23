-- Rotary OS: align annual dues accounting wording.
-- 常年社費 / 常年費 should post to 常年會費, never 入社費.

update public.accounting_categories
set name = '常年會費'
where entry_type = 'income'
  and group_name = '1.社費收入'
  and name in ('常年社費', '常年費');

update public.accounting_entries
set category = '常年會費'
where entry_type = 'income'
  and category in ('常年社費', '常年費')
  and coalesce(status, 'posted') <> 'voided';

do $$
begin
  if to_regclass('public.accounting_voucher_lines') is not null then
    update public.accounting_voucher_lines
    set subject_name = '常年會費'
    where subject_name in ('常年社費', '常年費')
      and category_id in (
        select id
        from public.accounting_categories
        where entry_type = 'income'
          and group_name = '1.社費收入'
          and name = '常年會費'
      );
  end if;
end $$;
