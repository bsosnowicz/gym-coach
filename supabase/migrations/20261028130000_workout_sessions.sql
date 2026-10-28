-- The workout journal (src/coach/workout-log.js): one row per session,
-- upserted after every set and change. exercises: the plan as it ended up
-- (after swaps); sets: [{ id, set, reps, seconds }]; changes: swaps, skips,
-- missing gear and pain, in order. Server-only, like user_injuries.

create table if not exists public.workout_sessions (
  session_id text primary key,
  user_id text not null,
  started_at timestamptz not null,
  updated_at timestamptz not null default now(),
  finished boolean not null default false,
  profile jsonb,
  exercises jsonb not null default '[]'::jsonb,
  sets jsonb not null default '[]'::jsonb,
  changes jsonb not null default '[]'::jsonb
);

create index if not exists workout_sessions_user_started_idx
  on public.workout_sessions (user_id, started_at desc);

alter table public.workout_sessions enable row level security;
revoke all on public.workout_sessions from anon, authenticated;
grant all on public.workout_sessions to service_role;
