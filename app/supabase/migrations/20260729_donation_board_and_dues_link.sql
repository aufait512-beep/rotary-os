-- Rotary OS Beta 1.0
-- 社友捐獻矩陣、單位金額與當月社費安全串接。
-- 可安全重跑；不刪除既有捐獻、社費或會計紀錄。

alter table public.donation_plans
  add column if not exists unit_amount integer not null default 0,
  add column if not exists currency text not null default 'TWD',
  add column if not exists target_units integer not null default 0,
  add column if not exists source_label text null,
  add column if not exists source_url text null;

alter table public.donation_records
  add column if not exists member_id uuid null references public.members(id) on delete set null,
  add column if not exists quantity integer not null default 0,
  add column if not exists unit_amount integer not null default 0,
  add column if not exists billing_month text null;

alter table public.dues_line_items
  add column if not exists donation_record_id uuid null references public.donation_records(id) on delete cascade;

alter table public.donation_plans
  drop constraint if exists donation_plans_unit_amount_nonnegative,
  add constraint donation_plans_unit_amount_nonnegative check (unit_amount >= 0),
  drop constraint if exists donation_plans_target_units_nonnegative,
  add constraint donation_plans_target_units_nonnegative check (target_units >= 0),
  drop constraint if exists donation_plans_currency_supported,
  add constraint donation_plans_currency_supported check (currency in ('TWD', 'USD'));

alter table public.donation_records
  drop constraint if exists donation_records_quantity_nonnegative,
  add constraint donation_records_quantity_nonnegative check (quantity >= 0),
  drop constraint if exists donation_records_unit_amount_nonnegative,
  add constraint donation_records_unit_amount_nonnegative check (unit_amount >= 0),
  drop constraint if exists donation_records_billing_month_format,
  add constraint donation_records_billing_month_format
    check (billing_month is null or billing_month ~ '^\d{4}-(0[1-9]|1[0-2])$');

create unique index if not exists donation_records_member_plan_month_unique
  on public.donation_records(member_id, plan_id, billing_month)
  where member_id is not null and billing_month is not null;

create unique index if not exists dues_line_items_donation_record_unique
  on public.dues_line_items(donation_record_id)
  where donation_record_id is not null;

update public.donation_plans
set unit_amount = 4000,
    currency = 'TWD',
    target_units = 48
where id = '53b8147c-643e-4e73-b394-81be1639d298'
  and unit_amount = 0;

update public.donation_plans
set description = '保羅哈里斯之友（PHF）可由個人捐至年度基金、小兒麻痺或核准的獎助金專案，累計 US$1,000，或透過表彰積點轉移達成。3510 地區同頁另列扶輪基金表彰門檻：鉅額捐獻人（Major Donor）累計或與配偶合計 US$10,000、阿奇柯蘭夫會（AKS）累計 US$250,000、遺贈會（Bequest Society）遺產捐贈 US$10,000；這些是表彰門檻，不另當作社費認捐欄位。',
    unit_amount = 1000,
    currency = 'USD',
    source_label = '國際扶輪 3510 地區｜扶輪基金的捐獻項目及表彰說明',
    source_url = 'https://www.rid3510.org/eventdetail.html?actid=4B94D0BF-7412-4999-9A8E-3D70582C8FF6'
where id = 'f33744f1-113d-43c4-92d7-77c20f982d72';

insert into public.donation_plans (
  id, category, title, description, suggested_amount_text,
  unit_amount, currency, target_units, source_label, source_url,
  start_date, end_date, status, sort_order
)
values
  (
    '6e421a37-a2f2-4f71-91d7-1f4db75921ef', '全球計畫', '年度基金 EREY',
    'Every Rotarian, Every Year（每位社員、每年捐獻）鼓勵每位社友持續支持扶輪基金年度基金。3510 地區說明：全社年度計畫基金平均捐獻超過美金 100 元，且每位社員都有捐獻，可符合 EREY Club 表彰要件。',
    '參考統計單位為每位社員每年 US$100；實際捐獻與匯率請由執行秘書依當年度地區通知確認。',
    100, 'USD', 26, '國際扶輪 3510 地區｜EREY 線上繳款操作說明',
    'https://www.rid3510.org/eventdetail.html?actid=F7B9E262-5FF1-44D1-B315-C03EC24F9711',
    null, null, 'open', 2
  ),
  (
    '7b2ef9b5-ccae-41b6-a822-ad1d3f678926', '全球計畫', '保羅哈里斯會 PHS',
    'Paul Harris Society 會員承諾每年至少捐獻 US$1,000，可捐至年度基金、小兒麻痺或核准的獎助金專案。',
    '1 單位代表每年承諾捐獻 US$1,000；美元項目不會直接併入台幣社費。',
    1000, 'USD', 0, '國際扶輪 3510 地區｜扶輪基金的捐獻項目及表彰說明',
    'https://www.rid3510.org/eventdetail.html?actid=4B94D0BF-7412-4999-9A8E-3D70582C8FF6',
    null, null, 'open', 3
  ),
  (
    'b3d18fa0-af3d-49ed-97ad-738ba71b47d2', '全球計畫', '捐助基金 Benefactor',
    'Benefactor（捐助人）表彰適用於捐助基金（原永久基金）；3510 地區資料列出的資格為捐獻至少 US$1,000。',
    '1 單位代表 US$1,000；美元項目不會直接併入台幣社費。',
    1000, 'USD', 0, '國際扶輪 3510 地區｜扶輪基金的捐獻項目及表彰說明',
    'https://www.rid3510.org/eventdetail.html?actid=4B94D0BF-7412-4999-9A8E-3D70582C8FF6',
    null, null, 'open', 4
  ),
  (
    '394023f8-f236-4a35-bcd5-2521bb0618ec', '全球計畫', '終結小兒麻痺 PolioPlus',
    '支持國際扶輪根除小兒麻痺工作。此捐獻亦可計入 PHF、PHS 等相關扶輪基金表彰，但實際金額可由社友自由選擇。',
    '自由捐獻；請由執行秘書確認當年度收款與換匯方式。',
    0, 'USD', 0, '國際扶輪 3510 地區｜扶輪基金的捐獻項目及表彰說明',
    'https://www.rid3510.org/eventdetail.html?actid=4B94D0BF-7412-4999-9A8E-3D70582C8FF6',
    null, null, 'open', 5
  ),
  (
    'e2bd04c3-6b29-41ad-beb1-da59c9061561', '地區計畫', '3510 綠色奇蹟｜再生電腦',
    '募集與整理可再利用的電腦設備，支持在地非營利組織、偏鄉學校及弱勢族群。此為實物支持型計畫，預設不列金額；執行秘書可在確認本年度募集方式後設定單位與開放狀態。',
    '實物捐贈／待執行秘書確認本年度募集規格。',
    0, 'TWD', 0, '國際扶輪 3510 地區｜綠色奇蹟再生電腦支持專案',
    'https://www.rid3510.org/pcdonation.html',
    null, null, 'closed', 5
  )
on conflict (id) do update set
  category = excluded.category,
  title = excluded.title,
  description = excluded.description,
  suggested_amount_text = excluded.suggested_amount_text,
  unit_amount = excluded.unit_amount,
  currency = excluded.currency,
  target_units = excluded.target_units,
  source_label = excluded.source_label,
  source_url = excluded.source_url,
  status = excluded.status,
  sort_order = excluded.sort_order;

update public.donation_records record
set member_id = member.id
from public.members member
where record.member_id is null
  and regexp_replace(lower(trim(record.donor_name)), '\s+', '', 'g')
      in (
        regexp_replace(lower(trim(coalesce(member.chinese_name, '') || coalesce(member.rotary_name, ''))), '\s+', '', 'g'),
        regexp_replace(lower(trim(coalesce(member.chinese_name, '') || ' ' || coalesce(member.rotary_name, ''))), '\s+', '', 'g'),
        regexp_replace(lower(trim(coalesce(member.rotary_name, ''))), '\s+', '', 'g')
      );

update public.donation_records record
set unit_amount = plan.unit_amount,
    quantity = case
      when plan.unit_amount > 0 and record.amount % plan.unit_amount = 0
        then record.amount / plan.unit_amount
      else record.quantity
    end
from public.donation_plans plan
where record.plan_id = plan.id
  and record.unit_amount = 0;

create or replace function public.donation_board_members()
returns table(id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.app_users
    where user_id = auth.uid() and is_active
  ) then
    raise exception 'active member sign-in required';
  end if;

  return query
  select
    member.id,
    trim(concat_ws(' ', nullif(member.chinese_name, ''), nullif(member.rotary_name, ''))) as display_name
  from public.members member
  where coalesce(member.status, 'active') = 'active'
  order by
    trim(concat_ws(' ', nullif(member.chinese_name, ''), nullif(member.rotary_name, '')));
end;
$$;

create or replace function public.set_my_donation_units(
  p_plan_id uuid,
  p_quantity integer,
  p_billing_month text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_member_name text;
  v_plan public.donation_plans%rowtype;
  v_record public.donation_records%rowtype;
  v_dues public.dues_records%rowtype;
  v_amount integer;
  v_record_id uuid;
begin
  if p_quantity < 0 or p_quantity > 10 then
    raise exception 'quantity must be between 0 and 10';
  end if;
  if p_billing_month is null or p_billing_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'billing month must use YYYY-MM';
  end if;

  select app_user.member_id
  into v_member_id
  from public.app_users app_user
  where app_user.user_id = auth.uid()
    and app_user.is_active
  limit 1;

  if v_member_id is null then
    raise exception 'active linked member account required';
  end if;

  select *
  into v_plan
  from public.donation_plans
  where id = p_plan_id
  for update;

  if v_plan.id is null or v_plan.status <> 'open' then
    raise exception 'donation plan is not open';
  end if;
  if v_plan.start_date is not null and v_plan.start_date > current_date then
    raise exception 'donation plan has not started';
  end if;
  if v_plan.end_date is not null and v_plan.end_date < current_date then
    raise exception 'donation plan has ended';
  end if;
  if coalesce(v_plan.unit_amount, 0) <= 0 then
    raise exception 'donation unit amount has not been configured';
  end if;
  if coalesce(v_plan.currency, 'TWD') <> 'TWD' then
    raise exception 'only TWD donations can be added to monthly dues';
  end if;

  select trim(concat_ws(' ', nullif(chinese_name, ''), nullif(rotary_name, '')))
  into v_member_name
  from public.members
  where id = v_member_id;

  select *
  into v_record
  from public.donation_records
  where member_id = v_member_id
    and plan_id = p_plan_id
    and billing_month = p_billing_month
  for update;

  if v_record.id is not null and v_record.payment_status = 'received' then
    raise exception 'received donation cannot be changed by member';
  end if;

  if v_record.id is not null then
    select dues.*
    into v_dues
    from public.dues_line_items line
    join public.dues_records dues on dues.id = line.dues_record_id
    where line.donation_record_id = v_record.id
    for update of dues;

    if v_dues.id is not null
       and (coalesce(v_dues.paid_amount, 0) > 0 or v_dues.payment_date is not null) then
      raise exception 'closed or paid monthly dues cannot be changed';
    end if;
  end if;

  if p_quantity = 0 then
    if v_record.id is not null then
      delete from public.dues_line_items where donation_record_id = v_record.id;
      delete from public.donation_records where id = v_record.id;
      if v_dues.id is not null then
        update public.dues_records dues
        set current_due = coalesce((
          select sum(line.amount)
          from public.dues_line_items line
          where line.dues_record_id = dues.id
        ), 0)
        where dues.id = v_dues.id;
      end if;
    end if;
    return null;
  end if;

  v_amount := p_quantity * v_plan.unit_amount;

  if v_record.id is null then
    insert into public.donation_records (
      id, plan_id, member_id, donor_name, club_name, donor_type,
      amount, quantity, unit_amount, billing_month,
      transfer_last_five, note, payment_status, created_at
    ) values (
      gen_random_uuid(), p_plan_id, v_member_id, v_member_name, '高雄晨光扶輪社', '晨光社友',
      v_amount, p_quantity, v_plan.unit_amount, p_billing_month,
      '', '由社友捐獻總表加入當月社費', 'pending', now()
    )
    returning id into v_record_id;
  else
    update public.donation_records
    set amount = v_amount,
        quantity = p_quantity,
        unit_amount = v_plan.unit_amount,
        donor_name = v_member_name,
        note = '由社友捐獻總表加入當月社費'
    where id = v_record.id
    returning id into v_record_id;
  end if;

  if v_dues.id is null then
    select *
    into v_dues
    from public.dues_records
    where member_id = v_member_id and period_month = p_billing_month
    order by created_at desc
    limit 1
    for update;
  end if;

  if v_dues.id is null then
    insert into public.dues_records (
      id, member_id, period_month, previous_balance, current_due,
      paid_amount, discount_amount, payment_method, note, created_at
    ) values (
      gen_random_uuid(), v_member_id, p_billing_month, 0, 0,
      0, 0, '轉帳', '由社友捐獻總表建立', now()
    )
    returning * into v_dues;
  elsif coalesce(v_dues.paid_amount, 0) > 0 or v_dues.payment_date is not null then
    raise exception 'closed or paid monthly dues cannot be changed';
  end if;

  insert into public.dues_line_items (
    id, dues_record_id, item_type, item_name, quantity,
    unit_amount, amount, note, donation_record_id, created_at
  ) values (
    gen_random_uuid(), v_dues.id, 'special_donation', v_plan.title, p_quantity,
    v_plan.unit_amount, v_amount, '由社友捐獻總表加入', v_record_id, now()
  )
  on conflict (donation_record_id) where donation_record_id is not null
  do update set
    dues_record_id = excluded.dues_record_id,
    item_name = excluded.item_name,
    quantity = excluded.quantity,
    unit_amount = excluded.unit_amount,
    amount = excluded.amount,
    note = excluded.note;

  update public.dues_records dues
  set current_due = coalesce((
    select sum(line.amount)
    from public.dues_line_items line
    where line.dues_record_id = dues.id
  ), 0)
  where dues.id = v_dues.id;

  return v_record_id;
end;
$$;

alter table public.donation_plans enable row level security;
alter table public.donation_records enable row level security;

do $$
declare policy_row record;
begin
  for policy_row in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'donation_plans'
  loop
    execute format('drop policy if exists %I on public.donation_plans', policy_row.policyname);
  end loop;

  for policy_row in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'donation_records'
  loop
    execute format('drop policy if exists %I on public.donation_records', policy_row.policyname);
  end loop;
end $$;

create policy "donation plans public read"
  on public.donation_plans for select to anon, authenticated using (true);
create policy "donation plans executive manage"
  on public.donation_plans for all to authenticated
  using (public.is_executive_secretary())
  with check (public.is_executive_secretary());

create policy "donation records active members read"
  on public.donation_records for select to authenticated
  using (
    exists (
      select 1 from public.app_users
      where user_id = auth.uid() and is_active
    )
  );
create policy "donation records executive manage"
  on public.donation_records for all to authenticated
  using (public.is_executive_secretary())
  with check (public.is_executive_secretary());

revoke all on function public.donation_board_members() from public, anon;
grant execute on function public.donation_board_members() to authenticated;
revoke all on function public.set_my_donation_units(uuid, integer, text) from public, anon;
grant execute on function public.set_my_donation_units(uuid, integer, text) to authenticated;

comment on function public.donation_board_members() is
  '只向有效登入社友提供捐獻總表需要的最小社友名單。';
comment on function public.set_my_donation_units(uuid, integer, text) is
  '以同一交易更新本人捐獻單位與當月份社費明細，避免重複計費。';

