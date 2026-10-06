-- A daily target per person for the barometer (the bar turns gold once it is reached).

alter table public.team_members add column daily_goal integer not null default 8 check (daily_goal between 1 and 100);

create or replace function public.set_member_goal(p_email text, p_goal integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_team_member() then raise exception 'not a team member'; end if;
  if p_goal is null or p_goal < 1 or p_goal > 100 then raise exception 'goal must be between 1 and 100'; end if;
  update public.team_members set daily_goal = p_goal where email = p_email and role <> 'removed';
end $$;
revoke all on function public.set_member_goal(text, integer) from public, anon;
grant execute on function public.set_member_goal(text, integer) to authenticated;
