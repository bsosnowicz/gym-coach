-- The user's profile from the interview and their weekly plans
-- (src/coach/plan-store.js). Server-only, like user_injuries.
--
-- user_profiles: one row per user, overwritten by every new interview.
-- training_plans: one row per plan variant. A new interview gives variant A;
-- changes made during a workout give B (C, …) with parent_id pointing at A,
-- and A stays. Only one plan per user is active at a time.
-- days: [{ weekday, type, focus, exercises: [{ id, sets, reps, seconds, restS }] }].

create table if not exists public.user_profiles (
  user_id text primary key,
  age integer check (age between 10 and 100),
  sex text check (sex in ('male', 'female', 'other')),
  height_cm integer check (height_cm between 100 and 250),
  weight_kg numeric(5, 1) check (weight_kg between 30 and 300),
  level text check (level in ('beginner', 'intermediate', 'expert')),
  goal text check (goal in ('strength', 'muscle', 'endurance', 'general')),
  days_per_week integer check (days_per_week between 1 and 7),
  weekdays jsonb not null default '[]'::jsonb,
  session_minutes integer check (session_minutes between 10 and 180),
  equipment text,
  priorities jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  split_type text not null check (split_type in (
    'full_body', 'upper_lower', 'push_pull_legs', 'ppl_upper_lower', 'body_part'
  )),
  intensity text not null check (intensity in ('heavy', 'moderate', 'light')),
  goal text,
  level text,
  variant text not null default 'A',
  parent_id uuid references public.training_plans (id) on delete cascade,
  active boolean not null default true,
  days jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists training_plans_user_created_idx
  on public.training_plans (user_id, created_at desc);
create unique index if not exists training_plans_one_active_uidx
  on public.training_plans (user_id) where active;

alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from anon, authenticated;
grant all on public.user_profiles to service_role;

alter table public.training_plans enable row level security;
revoke all on public.training_plans from anon, authenticated;
grant all on public.training_plans to service_role;
