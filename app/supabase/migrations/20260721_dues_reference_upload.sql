-- Rotary OS Beta 1.0 - replaceable dues reference image.
-- Safe to rerun; does not modify dues, members, payments, or accounting data.

create table if not exists public.dues_reference_documents (
  id text primary key,
  storage_path text not null,
  file_name text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.dues_reference_documents enable row level security;

drop policy if exists "dues reference public read" on public.dues_reference_documents;
drop policy if exists "dues reference public insert" on public.dues_reference_documents;
drop policy if exists "dues reference public update" on public.dues_reference_documents;
drop policy if exists "dues reference public delete" on public.dues_reference_documents;

create policy "dues reference public read"
on public.dues_reference_documents for select to anon, authenticated using (true);
create policy "dues reference public insert"
on public.dues_reference_documents for insert to anon, authenticated with check (true);
create policy "dues reference public update"
on public.dues_reference_documents for update to anon, authenticated using (true) with check (true);
create policy "dues reference public delete"
on public.dues_reference_documents for delete to anon, authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dues-reference',
  'dues-reference',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "dues reference storage read" on storage.objects;
drop policy if exists "dues reference storage insert" on storage.objects;
drop policy if exists "dues reference storage update" on storage.objects;
drop policy if exists "dues reference storage delete" on storage.objects;

create policy "dues reference storage read"
on storage.objects for select to anon, authenticated
using (bucket_id = 'dues-reference');
create policy "dues reference storage insert"
on storage.objects for insert to anon, authenticated
with check (bucket_id = 'dues-reference');
create policy "dues reference storage update"
on storage.objects for update to anon, authenticated
using (bucket_id = 'dues-reference') with check (bucket_id = 'dues-reference');
create policy "dues reference storage delete"
on storage.objects for delete to anon, authenticated
using (bucket_id = 'dues-reference');

