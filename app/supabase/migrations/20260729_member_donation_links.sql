-- Rotary OS Beta 1.0
-- 社友免登入專屬捐獻連結與公開總表。
-- 專屬連結使用不可猜測的 UUID 權杖；權杖只提供給執行秘書與該社友。

create table if not exists public.donation_member_links (
  member_id uuid primary key references public.members(id) on delete cascade,
  public_key uuid not null unique default gen_random_uuid(),
  access_token uuid not null unique default gen_random_uuid(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.donation_member_links (member_id)
select member.id
from public.members member
where coalesce(member.status, 'active') = 'active'
on conflict (member_id) do nothing;

alter table public.donation_member_links enable row level security;
revoke all on table public.donation_member_links from public, anon, authenticated;

create or replace function public._set_member_donation_units(
  p_member_id uuid,
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
  v_member_name text;
  v_plan public.donation_plans%rowtype;
  v_record public.donation_records%rowtype;
  v_dues public.dues_records%rowtype;
  v_amount integer;
  v_record_id uuid;
begin
  if p_member_id is null or not exists (
    select 1
    from public.members member
    where member.id = p_member_id
      and coalesce(member.status, 'active') = 'active'
  ) then
    raise exception 'active member required';
  end if;
  if p_quantity < 0 or p_quantity > 10 then
    raise exception 'quantity must be between 0 and 10';
  end if;
  if p_billing_month is null or p_billing_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'billing month must use YYYY-MM';
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
  where id = p_member_id;

  select *
  into v_record
  from public.donation_records
  where member_id = p_member_id
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
      gen_random_uuid(), p_plan_id, p_member_id, v_member_name, '高雄晨光扶輪社', '晨光社友',
      v_amount, p_quantity, v_plan.unit_amount, p_billing_month,
      '', '由社友專屬捐獻連結加入當月社費', 'pending', now()
    )
    returning id into v_record_id;
  else
    update public.donation_records
    set amount = v_amount,
        quantity = p_quantity,
        unit_amount = v_plan.unit_amount,
        donor_name = v_member_name,
        note = '由社友專屬捐獻連結加入當月社費'
    where id = v_record.id
    returning id into v_record_id;
  end if;

  if v_dues.id is null then
    select *
    into v_dues
    from public.dues_records
    where member_id = p_member_id and period_month = p_billing_month
    order by created_at desc
    limit 1
    for update;
  end if;

  if v_dues.id is null then
    insert into public.dues_records (
      id, member_id, period_month, previous_balance, current_due,
      paid_amount, discount_amount, payment_method, note, created_at
    ) values (
      gen_random_uuid(), p_member_id, p_billing_month, 0, 0,
      0, 0, '轉帳', '由社友專屬捐獻連結建立', now()
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
begin
  select app_user.member_id
  into v_member_id
  from public.app_users app_user
  where app_user.user_id = auth.uid()
    and app_user.is_active
  limit 1;

  if v_member_id is null then
    raise exception 'active linked member account required';
  end if;

  return public._set_member_donation_units(
    v_member_id, p_plan_id, p_quantity, p_billing_month
  );
end;
$$;

create or replace function public.set_linked_donation_units(
  p_access_token uuid,
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
begin
  select link.member_id
  into v_member_id
  from public.donation_member_links link
  join public.members member on member.id = link.member_id
  where link.access_token = p_access_token
    and link.is_active
    and coalesce(member.status, 'active') = 'active';

  if v_member_id is null then
    raise exception 'invalid or inactive member link';
  end if;

  return public._set_member_donation_units(
    v_member_id, p_plan_id, p_quantity, p_billing_month
  );
end;
$$;

create or replace function public.public_donation_board(
  p_access_token uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  select link.member_id
  into v_member_id
  from public.donation_member_links link
  where p_access_token is not null
    and link.access_token = p_access_token
    and link.is_active;

  if v_member_id is null and auth.uid() is not null then
    select app_user.member_id
    into v_member_id
    from public.app_users app_user
    where app_user.user_id = auth.uid()
      and app_user.is_active
    limit 1;
  end if;

  return jsonb_build_object(
    'viewer_member_id', (
      select link.public_key
      from public.donation_member_links link
      where link.member_id = v_member_id
    ),
    'viewer_name', (
      select trim(concat_ws(' ', nullif(member.chinese_name, ''), nullif(member.rotary_name, '')))
      from public.members member
      where member.id = v_member_id
    ),
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', link.public_key,
          'display_name', trim(concat_ws(' ', nullif(member.chinese_name, ''), nullif(member.rotary_name, '')))
        )
        order by trim(concat_ws(' ', nullif(member.chinese_name, ''), nullif(member.rotary_name, '')))
      )
      from public.members member
      join public.donation_member_links link on link.member_id = member.id
      where coalesce(member.status, 'active') = 'active'
        and link.is_active
    ), '[]'::jsonb),
    'records', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', record.id,
          'plan_id', record.plan_id,
          'member_id', link.public_key,
          'donor_name', record.donor_name,
          'amount', record.amount,
          'quantity', record.quantity,
          'unit_amount', record.unit_amount,
          'billing_month', record.billing_month,
          'payment_status', record.payment_status,
          'created_at', record.created_at
        )
        order by record.created_at
      )
      from public.donation_records record
      left join public.donation_member_links link on link.member_id = record.member_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_donation_member_links()
returns table(
  member_id uuid,
  display_name text,
  access_token uuid,
  is_active boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_executive_secretary() then
    raise exception 'executive secretary required';
  end if;

  insert into public.donation_member_links (member_id)
  select member.id
  from public.members member
  where coalesce(member.status, 'active') = 'active'
  on conflict (member_id) do nothing;

  return query
  select
    member.id,
    trim(concat_ws(' ', nullif(member.chinese_name, ''), nullif(member.rotary_name, ''))),
    link.access_token,
    link.is_active
  from public.members member
  join public.donation_member_links link on link.member_id = member.id
  where coalesce(member.status, 'active') = 'active'
  order by trim(concat_ws(' ', nullif(member.chinese_name, ''), nullif(member.rotary_name, '')));
end;
$$;

create or replace function public.rotate_donation_member_link(p_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
begin
  if not public.is_executive_secretary() then
    raise exception 'executive secretary required';
  end if;

  insert into public.donation_member_links (
    member_id, public_key, access_token, is_active, updated_at
  )
  values (
    p_member_id, gen_random_uuid(), gen_random_uuid(), true, now()
  )
  on conflict (member_id) do update
  set access_token = gen_random_uuid(),
      is_active = true,
      updated_at = now()
  returning access_token into v_token;

  return v_token;
end;
$$;

revoke all on function public._set_member_donation_units(uuid, uuid, integer, text)
  from public, anon, authenticated;
revoke all on function public.public_donation_board(uuid) from public;
grant execute on function public.public_donation_board(uuid) to anon, authenticated;
revoke all on function public.set_linked_donation_units(uuid, uuid, integer, text)
  from public;
grant execute on function public.set_linked_donation_units(uuid, uuid, integer, text)
  to anon, authenticated;
revoke all on function public.admin_donation_member_links() from public, anon;
grant execute on function public.admin_donation_member_links() to authenticated;
revoke all on function public.rotate_donation_member_link(uuid) from public, anon;
grant execute on function public.rotate_donation_member_link(uuid) to authenticated;
revoke all on function public.set_my_donation_units(uuid, integer, text) from public, anon;
grant execute on function public.set_my_donation_units(uuid, integer, text) to authenticated;

comment on table public.donation_member_links is
  '每位社友的公開總表代碼與免登入專屬連結權杖；權杖視同個人操作憑證。';
comment on function public.public_donation_board(uuid) is
  '提供捐獻總表需要的最小社友名單與捐獻資料，不公開專屬權杖。';
comment on function public.set_linked_donation_units(uuid, uuid, integer, text) is
  '使用社友專屬連結權杖更新本人捐獻單位與當月社費。';

