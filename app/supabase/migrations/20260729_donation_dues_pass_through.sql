-- 社友在年度捐獻總表登記的台幣項目，一律以「代收款」列入當月社費。
-- donation_record_id 是捐獻紀錄與社費明細的唯一連結。

create or replace function public.normalize_donation_dues_line_item()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.donation_record_id is not null then
    new.item_type := 'pass_through';
    if position('代收款' in coalesce(new.note, '')) = 0 then
      new.note := concat_ws('；', nullif(new.note, ''), '會計分類：代收款');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_donation_dues_line_item_trigger
  on public.dues_line_items;

create trigger normalize_donation_dues_line_item_trigger
before insert or update of item_type, donation_record_id, note
on public.dues_line_items
for each row
execute function public.normalize_donation_dues_line_item();

update public.dues_line_items
set item_type = 'pass_through',
    note = case
      when position('代收款' in coalesce(note, '')) > 0 then note
      else concat_ws('；', nullif(note, ''), '會計分類：代收款')
    end
where donation_record_id is not null;

comment on function public.normalize_donation_dues_line_item() is
  '確保年度捐獻總表產生的社費明細一律歸類為代收款。';

