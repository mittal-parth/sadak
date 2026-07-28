-- SADAK: district worlds + per-user core progress (#11)
-- Run in Supabase Dashboard → SQL Editor before 002_seed_districts.sql

create table if not exists public.districts (
  id text primary key,
  district jsonb not null,
  task_pack jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.district_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  district_id text not null references public.districts (id) on delete cascade,
  comfort text not null default 'medium'
    check (comfort in ('easy', 'medium', 'hard')),
  cash integer not null default 0,
  xp integer not null default 0,
  completed_task_ids text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, district_id)
);

create index if not exists district_progress_user_id_idx
  on public.district_progress (user_id);

alter table public.districts enable row level security;
alter table public.district_progress enable row level security;

create policy "Authenticated users can read districts"
  on public.districts
  for select
  to authenticated
  using (true);

create policy "Users read own progress"
  on public.district_progress
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users insert own progress"
  on public.district_progress
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users update own progress"
  on public.district_progress
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
