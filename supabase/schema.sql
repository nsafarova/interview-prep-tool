-- Run this once in the Supabase SQL editor.
-- One row per user holds their whole dashboard as JSON.

create table if not exists public.dashboards (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{"companies":[],"selected":null}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.dashboards enable row level security;

create policy "Users read own dashboard"
  on public.dashboards for select
  using (auth.uid() = user_id);

create policy "Users insert own dashboard"
  on public.dashboards for insert
  with check (auth.uid() = user_id);

create policy "Users update own dashboard"
  on public.dashboards for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own dashboard"
  on public.dashboards for delete
  using (auth.uid() = user_id);
