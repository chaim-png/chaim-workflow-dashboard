-- write_audit referenced new.deleted_at, which fails on tables without that column (suggestions).
create or replace function public.write_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_label text;
  v_old jsonb;
  v_new jsonb;
  v_fields text[];
  v_action text := lower(tg_op);
begin
  select full_name into v_label from public.team_members where user_id = v_actor;
  v_label := coalesce(v_label, nullif(current_setting('app.actor', true), ''), 'System');
  if tg_op in ('UPDATE','DELETE') then v_old := to_jsonb(old) - 'updated_at'; end if;
  if tg_op in ('INSERT','UPDATE') then v_new := to_jsonb(new) - 'updated_at'; end if;
  if tg_op = 'UPDATE' then
    select array_agg(k) into v_fields
      from jsonb_object_keys(v_new) k
      where v_new -> k is distinct from v_old -> k;
    if v_fields is null then return new; end if;
    if 'deleted_at' = any(v_fields) then
      v_action := case when v_new ->> 'deleted_at' is not null then 'delete' else 'restore' end;
    end if;
  end if;
  insert into public.audit_log (table_name, row_id, action, actor, actor_label, changed_fields, old_data, new_data)
  values (tg_table_name, coalesce(v_new->>'id', v_old->>'id'), v_action, v_actor, v_label, v_fields, v_old, v_new);
  return coalesce(new, old);
end $$;

revoke execute on function public.write_audit() from public, anon, authenticated;
