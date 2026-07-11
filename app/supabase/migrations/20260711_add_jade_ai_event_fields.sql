alter table public.events
  add column if not exists fellowship_chair text,
  add column if not exists sergeant_at_arms text,
  add column if not exists description text;
