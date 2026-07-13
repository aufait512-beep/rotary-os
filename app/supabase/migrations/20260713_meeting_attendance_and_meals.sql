alter table public.events
  add column if not exists event_meal_amount integer default 0;

create table if not exists public.meeting_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  response_status text not null default 'pending',
  planned_attendance boolean default false,
  actual_attendance boolean default false,
  planned_meal boolean default true,
  actual_meal boolean default false,
  guest_count integer default 0,
  vegetarian_count integer default 0,
  no_meal boolean default false,
  meal_amount integer default 0,
  include_in_dues boolean default true,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'meeting_attendance_response_status_check'
  ) then
    alter table public.meeting_attendance
      add constraint meeting_attendance_response_status_check
      check (response_status in ('pending', 'attending', 'absent', 'no_response'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'meeting_attendance_event_member_unique'
  ) then
    alter table public.meeting_attendance
      add constraint meeting_attendance_event_member_unique unique (event_id, member_id);
  end if;
end $$;

create index if not exists meeting_attendance_event_id_idx
  on public.meeting_attendance(event_id);

create index if not exists meeting_attendance_member_id_idx
  on public.meeting_attendance(member_id);

create index if not exists meeting_attendance_response_status_idx
  on public.meeting_attendance(response_status);

create index if not exists meeting_attendance_actual_attendance_idx
  on public.meeting_attendance(actual_attendance);

create index if not exists meeting_attendance_actual_meal_idx
  on public.meeting_attendance(actual_meal);

create or replace function public.set_meeting_attendance_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_meeting_attendance_updated_at on public.meeting_attendance;
create trigger set_meeting_attendance_updated_at
before update on public.meeting_attendance
for each row
execute function public.set_meeting_attendance_updated_at();

alter table public.meeting_attendance enable row level security;

drop policy if exists "meeting_attendance_select_public" on public.meeting_attendance;
create policy "meeting_attendance_select_public"
on public.meeting_attendance
for select
to anon, authenticated
using (true);

drop policy if exists "meeting_attendance_insert_public" on public.meeting_attendance;
create policy "meeting_attendance_insert_public"
on public.meeting_attendance
for insert
to anon, authenticated
with check (true);

drop policy if exists "meeting_attendance_update_public" on public.meeting_attendance;
create policy "meeting_attendance_update_public"
on public.meeting_attendance
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "meeting_attendance_delete_public" on public.meeting_attendance;
create policy "meeting_attendance_delete_public"
on public.meeting_attendance
for delete
to anon, authenticated
using (true);
