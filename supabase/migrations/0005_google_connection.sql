-- Direct Google (Gmail + Calendar) connection for the dashboard.
-- Refresh tokens are stored encrypted by the app server (AES-GCM, key held only in Vercel env),
-- and the table is reachable only through the functions below.

create table public.google_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_email text not null,
  refresh_token_enc text,
  scopes text,
  connected_at timestamptz not null default now(),
  last_gmail_sync timestamptz,
  last_calendar_sync timestamptz,
  last_error text
);
alter table public.google_connections enable row level security;
revoke all on public.google_connections from anon, authenticated;

-- Save (or replace) the signed-in member's connection.
create or replace function public.save_google_connection(p_email text, p_token_enc text, p_scopes text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_team_member() then raise exception 'not a team member'; end if;
  insert into public.google_connections (user_id, google_email, refresh_token_enc, scopes, connected_at, last_error)
  values (auth.uid(), p_email, p_token_enc, p_scopes, now(), null)
  on conflict (user_id) do update set google_email = excluded.google_email,
    refresh_token_enc = excluded.refresh_token_enc, scopes = excluded.scopes,
    connected_at = now(), last_error = null;
end $$;

-- Connections the team can pull from (token stays encrypted; only the app server can decrypt it).
create or replace function public.get_google_connections()
returns table (user_id uuid, google_email text, refresh_token_enc text, last_gmail_sync timestamptz, last_calendar_sync timestamptz)
language sql stable security definer set search_path = public as $$
  select user_id, google_email, refresh_token_enc, last_gmail_sync, last_calendar_sync
  from public.google_connections
  where public.is_team_member() and refresh_token_enc is not null
$$;

-- Status for the account page, without tokens.
create or replace function public.google_connection_status()
returns table (user_id uuid, google_email text, connected_at timestamptz, last_gmail_sync timestamptz, last_calendar_sync timestamptz, last_error text, active boolean)
language sql stable security definer set search_path = public as $$
  select user_id, google_email, connected_at, last_gmail_sync, last_calendar_sync, last_error, refresh_token_enc is not null
  from public.google_connections
  where public.is_team_member()
$$;

create or replace function public.mark_google_sync(p_user uuid, p_gmail boolean, p_calendar boolean, p_error text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_team_member() then raise exception 'not a team member'; end if;
  update public.google_connections set
    last_gmail_sync = case when p_gmail then now() else last_gmail_sync end,
    last_calendar_sync = case when p_calendar then now() else last_calendar_sync end,
    last_error = p_error
  where user_id = p_user;
end $$;

-- Only the person who connected can disconnect; the token is wiped, the row stays for history.
create or replace function public.disconnect_google()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.google_connections set refresh_token_enc = null, last_error = null where user_id = auth.uid();
end $$;

revoke all on function public.save_google_connection(text, text, text) from public, anon;
revoke all on function public.get_google_connections() from public, anon;
revoke all on function public.google_connection_status() from public, anon;
revoke all on function public.mark_google_sync(uuid, boolean, boolean, text) from public, anon;
revoke all on function public.disconnect_google() from public, anon;
grant execute on function public.save_google_connection(text, text, text) to authenticated;
grant execute on function public.get_google_connections() to authenticated;
grant execute on function public.google_connection_status() to authenticated;
grant execute on function public.mark_google_sync(uuid, boolean, boolean, text) to authenticated;
grant execute on function public.disconnect_google() to authenticated;

-- The live pull runs under the signed-in member's session, so members may write these.
create policy team_insert on public.calendar_events for insert to authenticated with check (public.is_team_member());
create policy team_update on public.calendar_events for update to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy team_insert on public.sync_runs for insert to authenticated with check (public.is_team_member());
