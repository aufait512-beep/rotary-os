alter table public.programs
  add column if not exists rotary_year_id uuid references public.rotary_years(id) on delete set null,
  add column if not exists meeting_no text,
  add column if not exists date date,
  add column if not exists dinner_time time,
  add column if not exists meeting_time time,
  add column if not exists location text,
  add column if not exists room text,
  add column if not exists topic text,
  add column if not exists speaker text,
  add column if not exists schedule jsonb,
  add column if not exists content text,
  add column if not exists agenda jsonb,
  add column if not exists updated_at timestamptz default now();

create or replace function public.set_programs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_programs_updated_at on public.programs;
create trigger set_programs_updated_at
before update on public.programs
for each row
execute function public.set_programs_updated_at();

alter table public.programs enable row level security;

drop policy if exists "programs_select_public" on public.programs;
create policy "programs_select_public"
on public.programs
for select
to anon, authenticated
using (true);

drop policy if exists "programs_insert_public" on public.programs;
create policy "programs_insert_public"
on public.programs
for insert
to anon, authenticated
with check (true);

drop policy if exists "programs_update_public" on public.programs;
create policy "programs_update_public"
on public.programs
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "programs_delete_public" on public.programs;
create policy "programs_delete_public"
on public.programs
for delete
to anon, authenticated
using (true);

alter table public.events enable row level security;

drop policy if exists "events_select_public" on public.events;
create policy "events_select_public"
on public.events
for select
to anon, authenticated
using (true);

drop policy if exists "events_insert_public" on public.events;
create policy "events_insert_public"
on public.events
for insert
to anon, authenticated
with check (true);

drop policy if exists "events_update_public" on public.events;
create policy "events_update_public"
on public.events
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "events_delete_public" on public.events;
create policy "events_delete_public"
on public.events
for delete
to anon, authenticated
using (true);
