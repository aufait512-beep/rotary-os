-- Rotary OS official 2026-2027 accounting category structure.
-- Source files read locally:
-- - reference/2026-27年度預算.xlsx: category names, groups, and order only.
-- - reference/2026-7月收支表.xls: report layout reference only.
--
-- Important:
-- - Does not import any annual budget amount from Excel.
-- - Does not import any monthly amount, year-to-date amount, bank balance,
--   asset amount, pass-through amount, or liability amount from Excel.
-- - Safe to run more than once.
-- - Does not delete accounting_entries or any member, dues, event, donation,
--   or activity data.

with official(entry_type, group_name, name, sort_order) as (
  values
    ('income', '1.社費收入', '入社費', 1010),
    ('income', '1.社費收入', '常年會費', 1020),
    ('income', '1.社費收入', '特別捐款', 1030),
    ('income', '2.捐款IOU收入', '捐款IOU收入', 2010),
    ('income', '3.例會餐費', '例會餐費', 3010),
    ('income', '4.慶典紅箱', '慶典紅箱', 4010),
    ('income', '5.利息收入', '利息收入', 5010),
    ('income', '6.其他收入', '其他收入', 6010),

    ('expense', '1.辦事處經費', '人事費', 1010),
    ('expense', '1.辦事處經費', '勞退準備金', 1020),
    ('expense', '1.辦事處經費', '印刷費', 1030),
    ('expense', '1.辦事處經費', '文具用品費', 1040),
    ('expense', '1.辦事處經費', '郵電網路費', 1050),
    ('expense', '1.辦事處經費', '勞保費', 1060),
    ('expense', '1.辦事處經費', '健保費', 1070),
    ('expense', '1.辦事處經費', '雜項', 1080),
    ('expense', '1.辦事處經費', '電腦、耗材及設備等費用', 1090),
    ('expense', '1.辦事處經費', '扶輪用品', 1100),
    ('expense', '1.辦事處經費', '場租費用', 1110),
    ('expense', '2.會費', '社務講習會', 2010),
    ('expense', '2.會費', '社秘出席餐費', 2020),
    ('expense', '2.會費', '地區年會費', 2030),
    ('expense', '3.行政管理費用', '節目費', 3010),
    ('expense', '3.行政管理費用', '康樂費', 3020),
    ('expense', '3.行政管理費用', '手冊、社刊印刷費', 3030),
    ('expense', '3.行政管理費用', '膳食費', 3040),
    ('expense', '3.行政管理費用', '理監事會議膳食費', 3050),
    ('expense', '3.行政管理費用', '體育費', 3060),
    ('expense', '4.服務計劃費用', '社區服務費', 4010),
    ('expense', '4.服務計劃費用', '國際服務費', 4020),
    ('expense', '4.服務計劃費用', '職業服務費', 4030),
    ('expense', '4.服務計劃費用', '新世代青年(RYLA)', 4040),
    ('expense', '4.服務計劃費用', '青少年交換(RYE)', 4050),
    ('expense', '5.社員委員計劃費用', '扶輪家庭費', 5010),
    ('expense', '6.扶輪基金計劃費用', '扶輪基金計劃費用', 6010),
    ('expense', '7.公共形象費', '公共形象費', 7010),
    ('expense', '8.內輪會費用', '內輪會費用', 8010),
    ('expense', '9.預備金', '預備金', 9010)
),
target_year as (
  select id from public.rotary_years where name = '2026-2027'
)
update public.accounting_categories c
set
  group_name = official.group_name,
  annual_budget = 0,
  sort_order = official.sort_order,
  is_active = true
from official, target_year
where c.rotary_year_id = target_year.id
  and c.entry_type = official.entry_type
  and c.name = official.name;

with official(entry_type, group_name, name, sort_order) as (
  values
    ('income', '1.社費收入', '入社費', 1010),
    ('income', '1.社費收入', '常年會費', 1020),
    ('income', '1.社費收入', '特別捐款', 1030),
    ('income', '2.捐款IOU收入', '捐款IOU收入', 2010),
    ('income', '3.例會餐費', '例會餐費', 3010),
    ('income', '4.慶典紅箱', '慶典紅箱', 4010),
    ('income', '5.利息收入', '利息收入', 5010),
    ('income', '6.其他收入', '其他收入', 6010),
    ('expense', '1.辦事處經費', '人事費', 1010),
    ('expense', '1.辦事處經費', '勞退準備金', 1020),
    ('expense', '1.辦事處經費', '印刷費', 1030),
    ('expense', '1.辦事處經費', '文具用品費', 1040),
    ('expense', '1.辦事處經費', '郵電網路費', 1050),
    ('expense', '1.辦事處經費', '勞保費', 1060),
    ('expense', '1.辦事處經費', '健保費', 1070),
    ('expense', '1.辦事處經費', '雜項', 1080),
    ('expense', '1.辦事處經費', '電腦、耗材及設備等費用', 1090),
    ('expense', '1.辦事處經費', '扶輪用品', 1100),
    ('expense', '1.辦事處經費', '場租費用', 1110),
    ('expense', '2.會費', '社務講習會', 2010),
    ('expense', '2.會費', '社秘出席餐費', 2020),
    ('expense', '2.會費', '地區年會費', 2030),
    ('expense', '3.行政管理費用', '節目費', 3010),
    ('expense', '3.行政管理費用', '康樂費', 3020),
    ('expense', '3.行政管理費用', '手冊、社刊印刷費', 3030),
    ('expense', '3.行政管理費用', '膳食費', 3040),
    ('expense', '3.行政管理費用', '理監事會議膳食費', 3050),
    ('expense', '3.行政管理費用', '體育費', 3060),
    ('expense', '4.服務計劃費用', '社區服務費', 4010),
    ('expense', '4.服務計劃費用', '國際服務費', 4020),
    ('expense', '4.服務計劃費用', '職業服務費', 4030),
    ('expense', '4.服務計劃費用', '新世代青年(RYLA)', 4040),
    ('expense', '4.服務計劃費用', '青少年交換(RYE)', 4050),
    ('expense', '5.社員委員計劃費用', '扶輪家庭費', 5010),
    ('expense', '6.扶輪基金計劃費用', '扶輪基金計劃費用', 6010),
    ('expense', '7.公共形象費', '公共形象費', 7010),
    ('expense', '8.內輪會費用', '內輪會費用', 8010),
    ('expense', '9.預備金', '預備金', 9010)
),
target_year as (
  select id from public.rotary_years where name = '2026-2027'
)
insert into public.accounting_categories (
  rotary_year_id,
  entry_type,
  group_name,
  name,
  annual_budget,
  sort_order,
  is_active
)
select
  target_year.id,
  official.entry_type,
  official.group_name,
  official.name,
  0,
  official.sort_order,
  true
from official, target_year
where not exists (
  select 1
  from public.accounting_categories c
  where c.rotary_year_id = target_year.id
    and c.entry_type = official.entry_type
    and c.name = official.name
);

with official(entry_type, name) as (
  values
    ('income', '入社費'),
    ('income', '常年會費'),
    ('income', '特別捐款'),
    ('income', '捐款IOU收入'),
    ('income', '例會餐費'),
    ('income', '慶典紅箱'),
    ('income', '利息收入'),
    ('income', '其他收入'),
    ('expense', '人事費'),
    ('expense', '勞退準備金'),
    ('expense', '印刷費'),
    ('expense', '文具用品費'),
    ('expense', '郵電網路費'),
    ('expense', '勞保費'),
    ('expense', '健保費'),
    ('expense', '雜項'),
    ('expense', '電腦、耗材及設備等費用'),
    ('expense', '扶輪用品'),
    ('expense', '場租費用'),
    ('expense', '社務講習會'),
    ('expense', '社秘出席餐費'),
    ('expense', '地區年會費'),
    ('expense', '節目費'),
    ('expense', '康樂費'),
    ('expense', '手冊、社刊印刷費'),
    ('expense', '膳食費'),
    ('expense', '理監事會議膳食費'),
    ('expense', '體育費'),
    ('expense', '社區服務費'),
    ('expense', '國際服務費'),
    ('expense', '職業服務費'),
    ('expense', '新世代青年(RYLA)'),
    ('expense', '青少年交換(RYE)'),
    ('expense', '扶輪家庭費'),
    ('expense', '扶輪基金計劃費用'),
    ('expense', '公共形象費'),
    ('expense', '內輪會費用'),
    ('expense', '預備金')
),
target_year as (
  select id from public.rotary_years where name = '2026-2027'
)
update public.accounting_categories c
set is_active = false
from target_year
where c.rotary_year_id = target_year.id
  and not exists (
    select 1
    from official
    where official.entry_type = c.entry_type
      and official.name = c.name
  )
  and not exists (
    select 1
    from public.accounting_entries e
    where e.category_id = c.id
       or (
        e.rotary_year_id = c.rotary_year_id
        and e.entry_type = c.entry_type
        and coalesce(e.category, '') = c.name
      )
  );

-- Balance sheet items are layout references only. Amounts are all zero and
-- must be maintained from Rotary OS data, not imported from Excel.
with official_balance(item_type, group_name, name, sort_order) as (
  values
    ('asset', '資產', '銀行活存(國泰世華)', 1010),
    ('asset', '資產', '銀行活存(新光銀行)', 1020),
    ('asset', '資產', '零用金', 1030),
    ('asset', '資產', '銀行定存(國泰世華)', 1040),
    ('asset', '資產', '銀行定存(新光銀行)', 1050),
    ('asset', '資產', '暫付款', 1060),
    ('asset', '資產', '應收款(社友)', 1070),
    ('fund', '資本', '歷屆累計餘絀', 2010),
    ('liability', '資本', '代收付-2026年慈善音樂會', 2030),
    ('liability', '負債', '應付款', 2040),
    ('liability', '負債', '其他負債', 2090)
),
target_year as (
  select id from public.rotary_years where name = '2026-2027'
)
update public.balance_sheet_items b
set
  group_name = official_balance.group_name,
  sort_order = official_balance.sort_order
from official_balance, target_year
where b.rotary_year_id = target_year.id
  and b.item_type = official_balance.item_type
  and b.name = official_balance.name;

with official_balance(item_type, group_name, name, sort_order) as (
  values
    ('asset', '資產', '銀行活存(國泰世華)', 1010),
    ('asset', '資產', '銀行活存(新光銀行)', 1020),
    ('asset', '資產', '零用金', 1030),
    ('asset', '資產', '銀行定存(國泰世華)', 1040),
    ('asset', '資產', '銀行定存(新光銀行)', 1050),
    ('asset', '資產', '暫付款', 1060),
    ('asset', '資產', '應收款(社友)', 1070),
    ('fund', '資本', '歷屆累計餘絀', 2010),
    ('liability', '資本', '代收付-2026年慈善音樂會', 2030),
    ('liability', '負債', '應付款', 2040),
    ('liability', '負債', '其他負債', 2090)
),
target_year as (
  select id from public.rotary_years where name = '2026-2027'
)
insert into public.balance_sheet_items (
  rotary_year_id,
  item_type,
  group_name,
  name,
  amount,
  sort_order
)
select
  target_year.id,
  official_balance.item_type,
  official_balance.group_name,
  official_balance.name,
  0,
  official_balance.sort_order
from official_balance, target_year
where not exists (
  select 1
  from public.balance_sheet_items b
  where b.rotary_year_id = target_year.id
    and b.item_type = official_balance.item_type
    and b.name = official_balance.name
);

