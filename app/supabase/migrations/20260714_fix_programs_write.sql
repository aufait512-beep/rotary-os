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
