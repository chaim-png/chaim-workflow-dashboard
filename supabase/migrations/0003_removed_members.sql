-- Members with role 'removed' can no longer sign up or use the app.
create or replace function public.is_team_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members where user_id = auth.uid() and role <> 'removed');
$$;

create or replace function public.guard_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.team_members where email = lower(new.email) and role <> 'removed') then
    raise exception 'This email address has not been invited to the dashboard';
  end if;
  return new;
end $$;

revoke execute on function public.guard_signup() from public, anon, authenticated;
