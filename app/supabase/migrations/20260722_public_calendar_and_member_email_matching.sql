-- Public calendar and automatic member-email matching.
-- Exposes only safe calendar fields. Private notes, attendance, dues and accounting remain protected.

create or replace function public.get_public_rotary_years()
returns table (
  id uuid,
  name text,
  display_name text,
  start_date date,
  end_date date,
  is_active boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select y.id, y.name, y.display_name, y.start_date, y.end_date,
         coalesce(y.is_active, false), y.created_at
  from public.rotary_years y
  order by y.start_date;
$$;

create or replace function public.get_public_calendar_events()
returns table (
  id uuid,
  rotary_year_id uuid,
  title text,
  event_type text,
  meeting_no text,
  date date,
  weekday text,
  dinner_time text,
  meeting_time text,
  end_time text,
  location text,
  room text,
  topic text,
  speaker text,
  fellowship_chair text,
  sergeant_at_arms text,
  description text,
  note text,
  event_meal_amount integer
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.rotary_year_id, coalesce(e.title, ''), coalesce(e.event_type, ''),
         coalesce(e.meeting_no::text, ''), e.date, coalesce(e.weekday, ''),
         e.dinner_time::text, e.meeting_time::text, e.end_time::text, coalesce(e.location, ''),
         coalesce(e.room, ''), coalesce(e.topic, ''), coalesce(e.speaker, ''),
         ''::text, ''::text, ''::text, ''::text, 0::integer
  from public.events e
  order by e.date, e.meeting_time;
$$;

revoke all on function public.get_public_rotary_years() from public;
revoke all on function public.get_public_calendar_events() from public;
grant execute on function public.get_public_rotary_years() to anon, authenticated;
grant execute on function public.get_public_calendar_events() to anon, authenticated;

-- Match accounts that existed before this migration to members by normalized email.
update public.app_users au
set member_id = m.id,
    updated_at = now()
from public.members m
where au.member_id is null
  and nullif(trim(au.email), '') is not null
  and lower(trim(au.email)) = lower(trim(m.email))
  and not exists (
    select 1 from public.app_users linked where linked.member_id = m.id
  );
