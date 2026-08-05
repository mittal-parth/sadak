-- SADAK: global leaderboard view (#67)
-- Run in Supabase Dashboard → SQL Editor after 001_worlds_and_progress.sql

create or replace view public.leaderboard as
with per_district as (
  select
    dp.user_id,
    dp.xp,
    dp.cash,
    coalesce(array_length(dp.completed_task_ids, 1), 0) as errands_done,
    case
      when jsonb_array_length(d.task_pack -> 'tasks') > 0
        and coalesce(array_length(dp.completed_task_ids, 1), 0)
          >= jsonb_array_length(d.task_pack -> 'tasks')
      then 1
      else 0
    end as city_completed
  from public.district_progress dp
  join public.districts d on d.id = dp.district_id
),
aggregated as (
  select
    user_id,
    sum(xp)::integer as total_xp,
    sum(cash)::integer as total_cash,
    sum(errands_done)::integer as errands_completed,
    sum(city_completed)::integer as cities_completed
  from per_district
  group by user_id
)
select
  row_number() over (
    order by
      a.total_xp desc,
      a.total_cash desc,
      a.errands_completed desc,
      a.cities_completed desc
  )::integer as rank,
  a.user_id,
  coalesce(
    nullif(split_part(trim(u.raw_user_meta_data ->> 'full_name'), ' ', 1), ''),
    nullif(split_part(trim(u.raw_user_meta_data ->> 'name'), ' ', 1), ''),
    left(split_part(u.email, '@', 1), 3) || '***'
  ) as display_name,
  a.total_xp,
  a.total_cash,
  a.errands_completed,
  a.cities_completed
from aggregated a
join auth.users u on u.id = a.user_id;

grant select on public.leaderboard to authenticated;
