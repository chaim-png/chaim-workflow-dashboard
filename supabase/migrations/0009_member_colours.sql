-- A colour per person, used for their initials chip and barometer bar. Any team member can change it.

alter table public.team_members add column color text check (color ~ '^#[0-9a-fA-F]{6}$');
update public.team_members set color = '#2b6cb0' where email = 'chaim@firzt.co.za';
update public.team_members set color = '#b83280' where email = 'nadine@firzt.co.za';

create or replace function public.set_member_color(p_email text, p_color text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_team_member() then raise exception 'not a team member'; end if;
  if p_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'colour must look like #2b6cb0'; end if;
  update public.team_members set color = lower(p_color) where email = p_email and role <> 'removed';
end $$;
revoke all on function public.set_member_color(text, text) from public, anon;
grant execute on function public.set_member_color(text, text) to authenticated;
