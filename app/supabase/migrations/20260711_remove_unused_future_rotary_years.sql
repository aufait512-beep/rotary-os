delete from public.rotary_years as year
where year.name in (
  '2027-2028',
  '2028-2029',
  '2029-2030',
  '2030-2031',
  '2031-2032'
)
and not exists (
  select 1
  from public.events as event
  where event.rotary_year_id = year.id
);
