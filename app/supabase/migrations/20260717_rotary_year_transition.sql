-- Rotary OS Beta 1.0 annual transition foundation.
-- Safe to rerun. Never deletes or overwrites historical events, programs,
-- attendance, dues, payments, accounting entries, snapshots, or month closes.

create extension if not exists pgcrypto;

create table if not exists public.program_templates (
  id uuid primary key default gen_random_uuid(),
  rotary_year_id uuid not null references public.rotary_years(id) on delete restrict,
  template_type text not null default 'custom',
  name text not null,
  description text not null default '',
  print_settings jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rotary_year_id, name)
);

create table if not exists public.program_template_blocks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.program_templates(id) on delete cascade,
  block_key text not null,
  title text not null default '',
  content text not null default '',
  start_time time null,
  display_condition jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, block_key)
);

create table if not exists public.event_types (
  id uuid primary key default gen_random_uuid(),
  rotary_year_id uuid not null references public.rotary_years(id) on delete restrict,
  name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rotary_year_id, name)
);

create table if not exists public.accounting_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  rotary_year_id uuid not null references public.rotary_years(id) on delete restrict,
  item_key text not null,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rotary_year_id, item_key)
);

create table if not exists public.rotary_year_settings (
  id uuid primary key default gen_random_uuid(),
  rotary_year_id uuid not null references public.rotary_years(id) on delete restrict,
  setting_key text not null,
  setting_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rotary_year_id, setting_key)
);

create table if not exists public.accounting_year_opening_balances (
  id uuid primary key default gen_random_uuid(),
  rotary_year_id uuid not null references public.rotary_years(id) on delete restrict,
  item_name text not null,
  amount numeric not null default 0,
  source_year_id uuid null references public.rotary_years(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rotary_year_id, item_name)
);

create table if not exists public.rotary_year_transitions (
  id uuid primary key default gen_random_uuid(),
  source_year_id uuid not null references public.rotary_years(id) on delete restrict,
  target_year_id uuid not null references public.rotary_years(id) on delete restrict,
  status text not null default 'draft' check (
    status in ('draft', 'previewed', 'completed', 'partial', 'failed', 'cancelled')
  ),
  selected_modules jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  note text
);

create index if not exists idx_program_templates_year
  on public.program_templates(rotary_year_id, sort_order);
create index if not exists idx_program_template_blocks_template
  on public.program_template_blocks(template_id, sort_order);
create index if not exists idx_event_types_year
  on public.event_types(rotary_year_id, sort_order);
create index if not exists idx_accounting_checklist_templates_year
  on public.accounting_checklist_templates(rotary_year_id, sort_order);
create index if not exists idx_rotary_year_settings_year
  on public.rotary_year_settings(rotary_year_id, setting_key);
create index if not exists idx_accounting_year_opening_balances_year
  on public.accounting_year_opening_balances(rotary_year_id);
create index if not exists idx_rotary_year_transitions_source_target
  on public.rotary_year_transitions(source_year_id, target_year_id, created_at desc);

create or replace function public.set_rotary_transition_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_program_templates_updated_at on public.program_templates;
create trigger set_program_templates_updated_at before update on public.program_templates
for each row execute function public.set_rotary_transition_updated_at();
drop trigger if exists set_program_template_blocks_updated_at on public.program_template_blocks;
create trigger set_program_template_blocks_updated_at before update on public.program_template_blocks
for each row execute function public.set_rotary_transition_updated_at();
drop trigger if exists set_event_types_updated_at on public.event_types;
create trigger set_event_types_updated_at before update on public.event_types
for each row execute function public.set_rotary_transition_updated_at();
drop trigger if exists set_accounting_checklist_templates_updated_at on public.accounting_checklist_templates;
create trigger set_accounting_checklist_templates_updated_at before update on public.accounting_checklist_templates
for each row execute function public.set_rotary_transition_updated_at();
drop trigger if exists set_rotary_year_settings_updated_at on public.rotary_year_settings;
create trigger set_rotary_year_settings_updated_at before update on public.rotary_year_settings
for each row execute function public.set_rotary_transition_updated_at();
drop trigger if exists set_accounting_year_opening_balances_updated_at on public.accounting_year_opening_balances;
create trigger set_accounting_year_opening_balances_updated_at before update on public.accounting_year_opening_balances
for each row execute function public.set_rotary_transition_updated_at();

alter table public.program_templates enable row level security;
alter table public.program_template_blocks enable row level security;
alter table public.event_types enable row level security;
alter table public.accounting_checklist_templates enable row level security;
alter table public.rotary_year_settings enable row level security;
alter table public.accounting_year_opening_balances enable row level security;
alter table public.rotary_year_transitions enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'program_templates',
    'program_template_blocks',
    'event_types',
    'accounting_checklist_templates',
    'rotary_year_settings',
    'accounting_year_opening_balances',
    'rotary_year_transitions'
  ] loop
    execute format('drop policy if exists "%s public read" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s public insert" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s public update" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s public delete" on public.%I', table_name, table_name);
    execute format('create policy "%s public read" on public.%I for select to anon, authenticated using (true)', table_name, table_name);
    execute format('create policy "%s public insert" on public.%I for insert to anon, authenticated with check (true)', table_name, table_name);
    execute format('create policy "%s public update" on public.%I for update to anon, authenticated using (true) with check (true)', table_name, table_name);
    execute format('create policy "%s public delete" on public.%I for delete to anon, authenticated using (true)', table_name, table_name);
  end loop;
end $$;

-- Add baseline settings to the current year only when absent. User-edited rows
-- are never updated by a safe rerun.
with template_defaults(template_type, name, description, sort_order) as (
  values
    ('regular', '一般例會模板', '高雄晨光扶輪社一般例會固定程序', 10),
    ('celebration', '慶生暨結婚紀念例會模板', '慶生與結婚紀念例會', 20),
    ('board', '理監事會模板', '理監事會議程', 30),
    ('service', '社區服務活動模板', '社區服務活動程序', 40),
    ('induction', '新社員入社典禮模板', '新社員入社典禮程序', 50),
    ('custom', '其他自訂模板', '其他自訂程序模板', 90)
)
insert into public.program_templates (
  rotary_year_id, template_type, name, description, print_settings, sort_order, is_active
)
select y.id, d.template_type, d.name, d.description,
  '{"paper":"A4","orientation":"portrait"}'::jsonb, d.sort_order, true
from public.rotary_years y
cross join template_defaults d
where y.is_active = true
on conflict (rotary_year_id, name) do nothing;

insert into public.program_template_blocks (
  template_id, block_key, title, content, start_time, display_condition, sort_order, is_active
)
select t.id, 'main_agenda', '主要程序',
  case when t.template_type = 'regular'
    then '會議開始、社長鳴鐘、扶輪頌、四大考驗、社長致詞、秘書報告、專題演講、糾察時間、閉會'
    else t.description
  end,
  case when t.template_type = 'regular' then '19:15'::time else null end,
  '{}'::jsonb, 10, true
from public.program_templates t
join public.rotary_years y on y.id = t.rotary_year_id and y.is_active = true
on conflict (template_id, block_key) do nothing;

with event_type_defaults(name, description, sort_order) as (
  values
    ('例會', '一般例會', 10),
    ('慶生暨結婚紀念例會', '每月慶生暨結婚紀念', 20),
    ('理監事會', '理監事會議', 30),
    ('社區服務', '社區服務活動', 40),
    ('其他活動', '其他扶輪活動', 90)
)
insert into public.event_types (rotary_year_id, name, description, sort_order, is_active)
select y.id, d.name, d.description, d.sort_order, true
from public.rotary_years y
cross join event_type_defaults d
where y.is_active = true
on conflict (rotary_year_id, name) do nothing;

with checklist_defaults(item_key, label, sort_order) as (
  values
    ('unclassified_income', '確認無未分類收入', 10),
    ('unclassified_expense', '確認無未分類支出', 20),
    ('bank_reconciliation', '完成銀行對帳', 30),
    ('balance_sheet', '確認資產負債表平衡', 40),
    ('dues_posting', '確認社費與餐費已入帳', 50),
    ('month_close', '完成本月份月結', 90)
)
insert into public.accounting_checklist_templates (
  rotary_year_id, item_key, label, sort_order, is_active
)
select y.id, d.item_key, d.label, d.sort_order, true
from public.rotary_years y
cross join checklist_defaults d
where y.is_active = true
on conflict (rotary_year_id, item_key) do nothing;

with setting_defaults(setting_key, setting_value) as (
  values
    ('report.default_paper', '{"value":"A4"}'::jsonb),
    ('report.orientation', '{"value":"portrait"}'::jsonb),
    ('brand.product', '{"value":"Rotary OS"}'::jsonb),
    ('brand.club', '{"value":"高雄晨光扶輪社"}'::jsonb),
    ('language.default', '{"value":"zh-Hant"}'::jsonb)
)
insert into public.rotary_year_settings (rotary_year_id, setting_key, setting_value)
select y.id, d.setting_key, d.setting_value
from public.rotary_years y
cross join setting_defaults d
where y.is_active = true
on conflict (rotary_year_id, setting_key) do nothing;

create or replace function public.execute_rotary_year_transition(
  p_source_year_id uuid,
  p_target_year_id uuid default null,
  p_target_year jsonb default null,
  p_selected_modules jsonb default '{}'::jsonb,
  p_role_mappings jsonb default '[]'::jsonb,
  p_budget_mode text default 'structure_only',
  p_fee_conflict_mode text default 'insert_missing',
  p_carry_forward_amount numeric default null,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_target_year_id uuid := p_target_year_id;
  v_target_start date;
  v_target_end date;
  v_transition_id uuid;
  v_result jsonb := jsonb_build_object(
    'inserted', '{}'::jsonb,
    'skipped', '{}'::jsonb,
    'conflicts', '{}'::jsonb,
    'manual_confirmation', jsonb_build_array('年度職務', '目前年度切換')
  );
  v_count integer := 0;
  v_total integer := 0;
  v_inserted_count integer := 0;
  v_block_inserted_count integer := 0;
  v_template record;
  v_target_template_id uuid;
  v_mapping jsonb;
begin
  if not exists (select 1 from public.rotary_years where id = p_source_year_id) then
    raise exception '來源年度不存在';
  end if;

  if v_target_year_id is null then
    if p_target_year is null then raise exception '缺少目標年度資料'; end if;
    v_target_start := (p_target_year->>'start_date')::date;
    v_target_end := (p_target_year->>'end_date')::date;
    if v_target_start is null or v_target_end is null or v_target_end < v_target_start then
      raise exception '目標年度日期範圍不正確';
    end if;
    if exists (select 1 from public.rotary_years where name = p_target_year->>'name') then
      raise exception '年度名稱已存在';
    end if;
    if exists (
      select 1 from public.rotary_years
      where v_target_start <= end_date and v_target_end >= start_date
    ) then
      raise exception '目標年度日期與既有年度重疊';
    end if;
    insert into public.rotary_years (name, display_name, start_date, end_date, is_active)
    values (
      p_target_year->>'name', p_target_year->>'display_name',
      v_target_start, v_target_end, false
    ) returning id into v_target_year_id;
  else
    select start_date, end_date into v_target_start, v_target_end
    from public.rotary_years where id = v_target_year_id;
    if not found then raise exception '目標年度不存在'; end if;
  end if;

  if p_source_year_id = v_target_year_id then raise exception '來源與目標年度不可相同'; end if;
  if p_budget_mode not in ('structure_only', 'with_amounts') then raise exception '年度預算帶入模式無效'; end if;
  if p_fee_conflict_mode not in ('skip', 'insert_missing', 'update_selected') then raise exception '社費規則衝突處理模式無效'; end if;

  if coalesce((p_selected_modules->>'program_templates')::boolean, false)
    or coalesce((p_selected_modules->>'program_blocks')::boolean, false) then
    select count(*) into v_total from public.program_templates where rotary_year_id = p_source_year_id;
    v_inserted_count := 0;
    v_block_inserted_count := 0;
    for v_template in select * from public.program_templates where rotary_year_id = p_source_year_id
    loop
      if coalesce((p_selected_modules->>'program_templates')::boolean, false) then
        insert into public.program_templates (
          rotary_year_id, template_type, name, description, print_settings, sort_order, is_active
        ) values (
          v_target_year_id, v_template.template_type, v_template.name,
          v_template.description, v_template.print_settings, v_template.sort_order, v_template.is_active
        ) on conflict (rotary_year_id, name) do nothing;
        get diagnostics v_count = row_count;
        v_inserted_count := v_inserted_count + v_count;
      end if;

      v_target_template_id := null;
      select id into v_target_template_id from public.program_templates
      where rotary_year_id = v_target_year_id and name = v_template.name;
      if coalesce((p_selected_modules->>'program_blocks')::boolean, false)
        and v_target_template_id is not null then
        insert into public.program_template_blocks (
          template_id, block_key, title, content, start_time,
          display_condition, sort_order, is_active
        )
        select v_target_template_id, block_key, title, content, start_time,
          display_condition, sort_order, is_active
        from public.program_template_blocks
        where template_id = v_template.id
        on conflict (template_id, block_key) do nothing;
        get diagnostics v_count = row_count;
        v_block_inserted_count := v_block_inserted_count + v_count;
      end if;
    end loop;
    if coalesce((p_selected_modules->>'program_templates')::boolean, false) then
      v_result := jsonb_set(v_result, '{inserted,program_templates}', to_jsonb(v_inserted_count), true);
      v_result := jsonb_set(v_result, '{conflicts,program_templates}', to_jsonb(greatest(v_total - v_inserted_count, 0)), true);
    end if;
    if coalesce((p_selected_modules->>'program_blocks')::boolean, false) then
      v_result := jsonb_set(v_result, '{inserted,program_blocks}', to_jsonb(v_block_inserted_count), true);
    end if;
  end if;

  if coalesce((p_selected_modules->>'event_types')::boolean, false) then
    insert into public.event_types (rotary_year_id, name, description, sort_order, is_active)
    select v_target_year_id, name, description, sort_order, is_active
    from public.event_types where rotary_year_id = p_source_year_id
    on conflict (rotary_year_id, name) do nothing;
    get diagnostics v_count = row_count;
    v_result := jsonb_set(v_result, '{inserted,event_types}', to_jsonb(v_count), true);
  end if;

  if coalesce((p_selected_modules->>'accounting_income')::boolean, false)
    or coalesce((p_selected_modules->>'accounting_expense')::boolean, false)
    or coalesce((p_selected_modules->>'budget_structure')::boolean, false) then
    insert into public.accounting_categories (
      rotary_year_id, entry_type, group_name, name, annual_budget, sort_order, is_active
    )
    select v_target_year_id, entry_type, group_name, name,
      case when p_budget_mode = 'with_amounts' then annual_budget else 0 end,
      sort_order, is_active
    from public.accounting_categories source
    where source.rotary_year_id = p_source_year_id
      and (
        coalesce((p_selected_modules->>'budget_structure')::boolean, false)
        or (source.entry_type = 'income' and coalesce((p_selected_modules->>'accounting_income')::boolean, false))
        or (source.entry_type = 'expense' and coalesce((p_selected_modules->>'accounting_expense')::boolean, false))
      )
      and not exists (
        select 1 from public.accounting_categories target
        where target.rotary_year_id = v_target_year_id
          and target.entry_type = source.entry_type
          and coalesce(target.group_name, '') = coalesce(source.group_name, '')
          and target.name = source.name
      );
    get diagnostics v_count = row_count;
    v_result := jsonb_set(v_result, '{inserted,accounting_categories}', to_jsonb(v_count), true);
  end if;

  if coalesce((p_selected_modules->>'balance_categories')::boolean, false) then
    insert into public.accounting_balance_categories (
      rotary_year_id, item_type, group_name, name, sort_order, is_system, is_active
    )
    select v_target_year_id, item_type, group_name, name, sort_order, is_system, is_active
    from public.accounting_balance_categories where rotary_year_id = p_source_year_id
    on conflict (rotary_year_id, item_type, group_name, name) do nothing;
    get diagnostics v_count = row_count;
    v_result := jsonb_set(v_result, '{inserted,balance_categories}', to_jsonb(v_count), true);
  end if;

  if coalesce((p_selected_modules->>'fee_rules')::boolean, false) then
    if p_fee_conflict_mode <> 'skip' or not exists (
      select 1 from public.member_fee_rules where rotary_year_id = v_target_year_id
    ) then
      insert into public.member_fee_rules (
        rotary_year_id, fee_type, condition_type, condition_value,
        amount, priority, is_active
      )
      select v_target_year_id, fee_type, condition_type, condition_value,
        amount, priority, is_active
      from public.member_fee_rules where rotary_year_id = p_source_year_id
      on conflict (rotary_year_id, fee_type, condition_type, condition_value) do nothing;
      get diagnostics v_count = row_count;
      v_result := jsonb_set(v_result, '{inserted,fee_rules}', to_jsonb(v_count), true);
    else
      select count(*) into v_count from public.member_fee_rules where rotary_year_id = p_source_year_id;
      v_result := jsonb_set(v_result, '{skipped,fee_rules}', to_jsonb(v_count), true);
    end if;

    if p_fee_conflict_mode = 'update_selected' then
      update public.member_fee_rules target
      set amount = source.amount,
          priority = source.priority,
          is_active = source.is_active,
          updated_at = now()
      from public.member_fee_rules source
      where source.rotary_year_id = p_source_year_id
        and target.rotary_year_id = v_target_year_id
        and target.fee_type = source.fee_type
        and target.condition_type = source.condition_type
        and target.condition_value = source.condition_value
        and source.id::text in (
          select jsonb_array_elements_text(coalesce(p_selected_modules->'fee_rule_update_ids', '[]'::jsonb))
        );
      get diagnostics v_count = row_count;
      v_result := jsonb_set(v_result, '{inserted,fee_rules_updated}', to_jsonb(v_count), true);
    end if;
  end if;

  if coalesce((p_selected_modules->>'senior_roles')::boolean, false) then
    insert into public.member_roles (
      member_id, rotary_year_id, role_type, role_name,
      start_date, end_date, is_active
    )
    select member_id, v_target_year_id, role_type, role_name,
      v_target_start, v_target_end, is_active
    from public.member_roles source
    where source.rotary_year_id = p_source_year_id and source.role_type = 'senior_member'
    on conflict (member_id, rotary_year_id, role_type, start_date) do nothing;
    get diagnostics v_count = row_count;
    v_result := jsonb_set(v_result, '{inserted,senior_roles}', to_jsonb(v_count), true);
  end if;

  if coalesce((p_selected_modules->>'member_roles')::boolean, false) then
    v_inserted_count := 0;
    for v_mapping in select value from jsonb_array_elements(coalesce(p_role_mappings, '[]'::jsonb))
    loop
      if coalesce((v_mapping->>'include')::boolean, false)
        and coalesce(v_mapping->>'role_type', '') <> '' then
        insert into public.member_roles (
          member_id, rotary_year_id, role_type, role_name,
          start_date, end_date, is_active
        ) values (
          (v_mapping->>'member_id')::uuid, v_target_year_id,
          v_mapping->>'role_type', coalesce(v_mapping->>'role_name', ''),
          coalesce(nullif(v_mapping->>'start_date', '')::date, v_target_start),
          coalesce(nullif(v_mapping->>'end_date', '')::date, v_target_end), true
        ) on conflict (member_id, rotary_year_id, role_type, start_date) do nothing;
        get diagnostics v_count = row_count;
        v_inserted_count := v_inserted_count + v_count;
      end if;
    end loop;
    v_result := jsonb_set(v_result, '{inserted,member_roles}', to_jsonb(v_inserted_count), true);
  end if;

  if coalesce((p_selected_modules->>'accounting_accounts')::boolean, false) then
    insert into public.accounting_accounts (
      rotary_year_id, account_type, account_category, name,
      opening_balance, sort_order, is_active
    )
    select v_target_year_id, account_type, account_category, name,
      0, sort_order, is_active
    from public.accounting_accounts source
    where source.rotary_year_id = p_source_year_id
      and not exists (
        select 1 from public.accounting_accounts target
        where target.rotary_year_id = v_target_year_id and target.name = source.name
      );
    get diagnostics v_count = row_count;
    v_result := jsonb_set(v_result, '{inserted,accounting_accounts}', to_jsonb(v_count), true);
  end if;

  if coalesce((p_selected_modules->>'checklist_templates')::boolean, false) then
    insert into public.accounting_checklist_templates (
      rotary_year_id, item_key, label, sort_order, is_active
    )
    select v_target_year_id, item_key, label, sort_order, is_active
    from public.accounting_checklist_templates where rotary_year_id = p_source_year_id
    on conflict (rotary_year_id, item_key) do nothing;
    get diagnostics v_count = row_count;
    v_result := jsonb_set(v_result, '{inserted,checklist_templates}', to_jsonb(v_count), true);
  end if;

  insert into public.rotary_year_settings (rotary_year_id, setting_key, setting_value)
  select v_target_year_id, setting_key, setting_value
  from public.rotary_year_settings source
  where source.rotary_year_id = p_source_year_id
    and (
      (setting_key like 'report.%' and coalesce((p_selected_modules->>'report_settings')::boolean, false))
      or (setting_key like 'brand.%' and coalesce((p_selected_modules->>'brand_settings')::boolean, false))
      or (setting_key like 'language.%' and coalesce((p_selected_modules->>'language_settings')::boolean, false))
    )
  on conflict (rotary_year_id, setting_key) do nothing;
  get diagnostics v_count = row_count;
  v_result := jsonb_set(v_result, '{inserted,year_settings}', to_jsonb(v_count), true);

  if p_carry_forward_amount is not null then
    insert into public.accounting_year_opening_balances (
      rotary_year_id, item_name, amount, source_year_id, note
    ) values (
      v_target_year_id, '歷屆累計餘絀', p_carry_forward_amount,
      p_source_year_id, '由年度交接精靈確認帶入'
    ) on conflict (rotary_year_id, item_name) do nothing;
    get diagnostics v_count = row_count;
    v_result := jsonb_set(v_result, '{inserted,opening_retained_surplus}', to_jsonb(v_count), true);
  end if;

  insert into public.rotary_year_transitions (
    source_year_id, target_year_id, status, selected_modules,
    result_summary, completed_at, note
  ) values (
    p_source_year_id, v_target_year_id, 'completed', p_selected_modules,
    v_result, now(), p_note
  ) returning id into v_transition_id;

  return jsonb_build_object(
    'transition_id', v_transition_id,
    'target_year_id', v_target_year_id,
    'status', 'completed',
    'summary', v_result
  );
end;
$$;

grant execute on function public.execute_rotary_year_transition(
  uuid, uuid, jsonb, jsonb, jsonb, text, text, numeric, text
) to anon, authenticated;
