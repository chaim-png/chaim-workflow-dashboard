-- Chaim's Work Flow dashboard: core schema
-- Every change to business tables is written to audit_log by trigger.
-- Rows are soft-deleted (deleted_at), never hard-deleted from the app.

create table public.team_members (
  email text primary key check (email = lower(email)),
  full_name text not null,
  role text not null default 'member',
  user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

insert into public.team_members (email, full_name, role) values
  ('chaim@firzt.co.za', 'Chaim Bronstein', 'owner'),
  ('nadine@firzt.co.za', 'Nadine Jackson', 'assistant');

create or replace function public.is_team_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members where user_id = auth.uid());
$$;

create or replace function public.current_member_email()
returns text language sql stable security definer set search_path = '' as $$
  select email from public.team_members where user_id = auth.uid();
$$;

-- Only invited emails may create an account.
create or replace function public.guard_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.team_members where email = lower(new.email)) then
    raise exception 'This email address has not been invited to the dashboard';
  end if;
  return new;
end $$;

create trigger guard_signup before insert on auth.users
  for each row execute function public.guard_signup();

create or replace function public.link_member()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.team_members set user_id = new.id where email = lower(new.email);
  return new;
end $$;

create trigger link_member after insert on auth.users
  for each row execute function public.link_member();

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  details text,
  client_id uuid references public.clients(id),
  assignee text references public.team_members(email),
  status text not null default 'todo' check (status in ('todo','in_progress','waiting','done')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  due_date date,
  waiting_on text,
  source text not null default 'manual' check (source in ('manual','email','calendar','granola','plaud','whatsapp','kb')),
  source_ref text,
  source_url text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz
);
create index on public.tasks (assignee) where deleted_at is null;
create index on public.tasks (due_date) where deleted_at is null;
create index on public.tasks (client_id);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id),
  body text not null,
  author uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.task_comments (task_id);

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  matter text not null,
  client_id uuid references public.clients(id),
  contact_name text,
  contact_email text,
  direction text not null check (direction in ('they_wait_on_us','we_wait_on_them')),
  asked_on date,
  what text,
  draft text,
  assignee text references public.team_members(email),
  status text not null default 'open' check (status in ('open','done','snoozed')),
  next_action_on date,
  task_id uuid references public.tasks(id),
  source text not null default 'manual' check (source in ('manual','email','calendar','granola','plaud','whatsapp','kb')),
  source_ref text,
  source_url text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('task','follow_up')),
  title text not null,
  details text,
  client_name text,
  contact_name text,
  contact_email text,
  suggested_assignee text references public.team_members(email),
  suggested_due date,
  draft text,
  source text not null check (source in ('email','calendar','granola','plaud','whatsapp','kb')),
  source_ref text,
  source_url text,
  source_date timestamptz,
  status text not null default 'pending' check (status in ('pending','accepted','dismissed')),
  decided_by uuid,
  decided_at timestamptz,
  result_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, source, source_ref, title)
);

create table public.calendar_events (
  id text primary key,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  location text,
  attendees text,
  url text,
  synced_at timestamptz not null default now()
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('granola','plaud')),
  source_ref text not null,
  title text not null,
  occurred_at timestamptz,
  summary text,
  action_items jsonb not null default '[]',
  url text,
  synced_at timestamptz not null default now(),
  unique (source, source_ref)
);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  ran_at timestamptz not null default now(),
  items_found int not null default 0,
  notes text
);

-- Audit trail
create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id text not null,
  action text not null,
  actor uuid,
  actor_label text not null,
  changed_at timestamptz not null default now(),
  changed_fields text[],
  old_data jsonb,
  new_data jsonb
);
create index on public.audit_log (table_name, row_id);
create index on public.audit_log (changed_at desc);

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
    if 'deleted_at' = any(v_fields) and new.deleted_at is not null then v_action := 'delete'; end if;
    if 'deleted_at' = any(v_fields) and new.deleted_at is null then v_action := 'restore'; end if;
  end if;
  insert into public.audit_log (table_name, row_id, action, actor, actor_label, changed_fields, old_data, new_data)
  values (tg_table_name, coalesce(v_new->>'id', v_old->>'id'), v_action, v_actor, v_label, v_fields, v_old, v_new);
  return coalesce(new, old);
end $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_table_name = 'tasks' then
    if new.status = 'done' and old.status is distinct from 'done' then new.completed_at := now(); end if;
    if new.status <> 'done' then new.completed_at := null; end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['clients','tasks','task_comments','follow_ups','suggestions'] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.write_audit()', t);
    execute format('create trigger touch before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- Row level security: only signed-in team members see or change anything.
alter table public.team_members enable row level security;
alter table public.clients enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.follow_ups enable row level security;
alter table public.suggestions enable row level security;
alter table public.calendar_events enable row level security;
alter table public.meetings enable row level security;
alter table public.sync_runs enable row level security;
alter table public.audit_log enable row level security;

create policy members_read on public.team_members for select to authenticated using (public.is_team_member());

do $$
declare t text;
begin
  foreach t in array array['clients','tasks','follow_ups','suggestions'] loop
    execute format('create policy team_select on public.%I for select to authenticated using (public.is_team_member())', t);
    execute format('create policy team_insert on public.%I for insert to authenticated with check (public.is_team_member())', t);
    execute format('create policy team_update on public.%I for update to authenticated using (public.is_team_member()) with check (public.is_team_member())', t);
  end loop;
  foreach t in array array['calendar_events','meetings','sync_runs','audit_log'] loop
    execute format('create policy team_select on public.%I for select to authenticated using (public.is_team_member())', t);
  end loop;
end $$;

create policy comments_select on public.task_comments for select to authenticated using (public.is_team_member());
create policy comments_insert on public.task_comments for insert to authenticated
  with check (public.is_team_member() and author = auth.uid());
create policy comments_update on public.task_comments for update to authenticated
  using (author = auth.uid()) with check (author = auth.uid());

revoke execute on function public.guard_signup() from public, anon, authenticated;
revoke execute on function public.link_member() from public, anon, authenticated;
revoke execute on function public.write_audit() from public, anon, authenticated;
