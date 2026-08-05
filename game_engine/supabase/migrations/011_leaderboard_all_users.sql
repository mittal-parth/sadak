-- SADAK: include all registered users on the leaderboard
-- Run in Supabase Dashboard → SQL Editor after 010_leaderboard_view.sql

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
      coalesce(a.total_xp, 0) desc,
      coalesce(a.total_cash, 0) desc,
      coalesce(a.errands_completed, 0) desc,
      coalesce(a.cities_completed, 0) desc,
      u.created_at asc
  )::integer as rank,
  u.id as user_id,
  coalesce(
    nullif(split_part(trim(u.raw_user_meta_data ->> 'full_name'), ' ', 1), ''),
    nullif(split_part(trim(u.raw_user_meta_data ->> 'name'), ' ', 1), ''),
    left(split_part(u.email, '@', 1), 3) || '***'
  ) as display_name,
  coalesce(a.total_xp, 0)::integer as total_xp,
  coalesce(a.total_cash, 0)::integer as total_cash,
  coalesce(a.errands_completed, 0)::integer as errands_completed,
  coalesce(a.cities_completed, 0)::integer as cities_completed
from auth.users u
left join aggregated a on a.user_id = u.id;

grant select on public.leaderboard to authenticated;
