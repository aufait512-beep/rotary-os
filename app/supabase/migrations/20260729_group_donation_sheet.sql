-- Rotary OS Beta 1.0
-- LINE 群組共用、免登入、即時總覽的捐獻表。

-- 全球扶輪基金只保留單一「保羅哈里斯認捐」欄位。
delete from public.donation_plans plan
where plan.id in (
  '6e421a37-a2f2-4f71-91d7-1f4db75921ef',
  '7b2ef9b5-ccae-41b6-a822-ad1d3f678926',
  'b3d18fa0-af3d-49ed-97ad-738ba71b47d2',
  '394023f8-f236-4a35-bcd5-2521bb0618ec'
)
and not exists (
  select 1 from public.donation_records record where record.plan_id = plan.id
);

update public.donation_plans
set status = 'closed'
where id in (
  '6e421a37-a2f2-4f71-91d7-1f4db75921ef',
  '7b2ef9b5-ccae-41b6-a822-ad1d3f678926',
  'b3d18fa0-af3d-49ed-97ad-738ba71b47d2',
  '394023f8-f236-4a35-bcd5-2521bb0618ec'
);

update public.donation_plans
set title = '保羅哈里斯認捐',
    description = '保羅哈里斯之友（PHF）認捐：個人捐至年度基金、根除小兒麻痺或核准的獎助金專案，累計達 US$1,000，或透過表彰積點轉移達成。總表以 1 單位 US$1,000 登錄認捐。',
    suggested_amount_text = '1 單位代表 US$1,000；本項只登錄認捐，不自動換算台幣社費。',
    unit_amount = 1000,
    currency = 'USD',
    target_units = 0,
    status = 'open',
    sort_order = 1
where id = 'f33744f1-113d-43c4-92d7-77c20f982d72';

create or replace function public.set_public_donation_units(
  p_member_public_key uuid,
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
  v_record_id uuid;
  v_amount integer;
begin
  select link.member_id
  into v_member_id
  from public.donation_member_links link
  join public.members member on member.id = link.member_id
  where link.public_key = p_member_public_key
    and link.is_active
    and coalesce(member.status, 'active') = 'active';

  if v_member_id is null then
    raise exception 'invalid member row';
  end if;

  select *
  into v_plan
  from public.donation_plans
  where id = p_plan_id
  for update;

  if v_plan.id is null or v_plan.status <> 'open' then
    raise exception 'donation plan is not open';
  end if;
  if p_quantity < 0 or p_quantity > 10 then
    raise exception 'quantity must be between 0 and 10';
  end if;
  if p_billing_month is null or p_billing_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'billing month must use YYYY-MM';
  end if;
  if coalesce(v_plan.unit_amount, 0) <= 0 then
    raise exception 'donation unit amount has not been configured';
  end if;

  -- 台幣項目沿用同一交易的社費串接。
  if coalesce(v_plan.currency, 'TWD') = 'TWD' then
    return public._set_member_donation_units(
      v_member_id, p_plan_id, p_quantity, p_billing_month
    );
  end if;

  -- 外幣項目只登錄認捐，不換算台幣社費。
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
    raise exception 'received donation cannot be changed';
  end if;

  if p_quantity = 0 then
    if v_record.id is not null then
      delete from public.dues_line_items where donation_record_id = v_record.id;
      delete from public.donation_records where id = v_record.id;
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
      gen_random_uuid(), p_plan_id, v_member_id, v_member_name,
      '高雄晨光扶輪社', '晨光社友',
      v_amount, p_quantity, v_plan.unit_amount, p_billing_month,
      '', '由社友共用捐獻總表登錄外幣認捐', 'pending', now()
    )
    returning id into v_record_id;
  else
    update public.donation_records
    set amount = v_amount,
        quantity = p_quantity,
        unit_amount = v_plan.unit_amount,
        donor_name = v_member_name,
        note = '由社友共用捐獻總表登錄外幣認捐'
    where id = v_record.id
    returning id into v_record_id;
  end if;

  return v_record_id;
end;
$$;

revoke all on function public.set_public_donation_units(uuid, uuid, integer, text)
  from public;
grant execute on function public.set_public_donation_units(uuid, uuid, integer, text)
  to anon, authenticated;

comment on function public.set_public_donation_units(uuid, uuid, integer, text) is
  '免登入共用捐獻總表：以公開列代碼更新指定社友與計畫；台幣同步社費，外幣只登錄認捐。';

