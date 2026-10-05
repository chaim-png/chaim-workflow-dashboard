revoke execute on function public.is_team_member() from public, anon;
grant execute on function public.is_team_member() to authenticated;
revoke execute on function public.current_member_email() from public, anon, authenticated;
