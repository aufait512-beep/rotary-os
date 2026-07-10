create extension if not exists pgcrypto;

create table if not exists public.rotary_years (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_name text not null,
  start_date date not null,
  end_date date not null,
  is_active boolean default false,
  created_at timestamptz default now()
);

insert into public.rotary_years (name, display_name, start_date, end_date, is_active)
values
  ('2026-2027', '26-27年度', '2026-07-01', '2027-06-30', true),
  ('2027-2028', '27-28年度', '2027-07-01', '2028-06-30', false),
  ('2028-2029', '28-29年度', '2028-07-01', '2029-06-30', false),
  ('2029-2030', '29-30年度', '2029-07-01', '2030-06-30', false),
  ('2030-2031', '30-31年度', '2030-07-01', '2031-06-30', false),
  ('2031-2032', '31-32年度', '2031-07-01', '2032-06-30', false)
on conflict (name) do update set
  display_name = excluded.display_name,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  is_active = excluded.is_active;
