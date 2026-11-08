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

-- ---------------------------------------------------------------
-- Claude connector support
-- Each user gets one private link. Only a SHA 256 hash of the secret
-- is stored. The connector server uses the public anon key and these
-- narrow functions, so no service role key is needed anywhere.
-- ---------------------------------------------------------------

create table if not exists public.connector_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.connector_tokens enable row level security;
revoke all on table public.connector_tokens from anon, authenticated;

create or replace function public._connector_user(p_token text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  update public.connector_tokens
     set last_used_at = now()
   where token_hash = encode(digest(p_token, 'sha256'), 'hex')
  returning user_id into uid;
  return uid;
end $$;

create or replace function public.create_connector_token()
returns text language plpgsql security definer set search_path = public, extensions as $$
declare t text; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  t := encode(gen_random_bytes(32), 'hex');
  insert into public.connector_tokens (user_id, token_hash, created_at, last_used_at)
  values (uid, encode(digest(t, 'sha256'), 'hex'), now(), null)
  on conflict (user_id) do update
    set token_hash = excluded.token_hash, created_at = now(), last_used_at = null;
  return t;
end $$;

create or replace function public.revoke_connector_token()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from public.connector_tokens where user_id = auth.uid();
end $$;

create or replace function public.connector_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select created_at, last_used_at into r from public.connector_tokens where user_id = auth.uid();
  if not found then return jsonb_build_object('connected', false); end if;
  return jsonb_build_object('connected', true, 'created_at', r.created_at, 'last_used_at', r.last_used_at);
end $$;

create or replace function public.mcp_load(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid; d jsonb;
begin
  uid := public._connector_user(p_token);
  if uid is null then return null; end if;
  select data into d from public.dashboards where user_id = uid;
  return coalesce(d, '{"companies":[],"selected":null}'::jsonb);
end $$;

create or replace function public.mcp_store(p_token text, p_data jsonb)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid;
begin
  uid := public._connector_user(p_token);
  if uid is null then return false; end if;
  if jsonb_typeof(p_data -> 'companies') is distinct from 'array' then return false; end if;
  if length(p_data::text) > 1000000 then return false; end if;
  insert into public.dashboards (user_id, data, updated_at)
  values (uid, p_data, now())
  on conflict (user_id) do update set data = excluded.data, updated_at = excluded.updated_at;
  return true;
end $$;

revoke all on function public._connector_user(text) from public, anon, authenticated;

revoke all on function public.create_connector_token() from public, anon, authenticated;
grant execute on function public.create_connector_token() to authenticated;
revoke all on function public.revoke_connector_token() from public, anon, authenticated;
grant execute on function public.revoke_connector_token() to authenticated;
revoke all on function public.connector_status() from public, anon, authenticated;
grant execute on function public.connector_status() to authenticated;

-- Called by the connector server with the public anon key.
revoke all on function public.mcp_load(text) from public, anon, authenticated;
grant execute on function public.mcp_load(text) to anon;
revoke all on function public.mcp_store(text, jsonb) from public, anon, authenticated;
grant execute on function public.mcp_store(text, jsonb) to anon;
