-- Emails from any connected mailbox (Chaim's, Nadine's) matched to the tasks and follow-ups they relate to.
-- Rows are evidence only: matching never changes a task or follow-up.

create table public.email_links (
  id uuid primary key default gen_random_uuid(),
  mailbox text not null,                 -- whose mailbox the thread was read from
  thread_id text not null,
  subject text,
  last_from text,                        -- email of whoever wrote the newest message
  last_from_name text,
  team_wrote_last boolean not null default false,
  last_at timestamptz,
  snippet text,
  url text,
  task_id uuid references public.tasks(id) on delete cascade,
  follow_up_id uuid references public.follow_ups(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  matched_by text not null,              -- 'thread', 'contact', 'client', 'client+title'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- each row points at exactly one task, follow-up or client
  check (num_nonnulls(task_id, follow_up_id, client_id) = 1),
  target text generated always as (coalesce(task_id::text, follow_up_id::text, client_id::text)) stored,
  unique (mailbox, thread_id, target)
);
create index email_links_task on public.email_links (task_id) where task_id is not null;
create index email_links_follow_up on public.email_links (follow_up_id) where follow_up_id is not null;
create index email_links_client on public.email_links (client_id) where client_id is not null;

alter table public.email_links enable row level security;
create policy team_select on public.email_links for select to authenticated using (public.is_team_member());
create policy team_insert on public.email_links for insert to authenticated with check (public.is_team_member());
create policy team_update on public.email_links for update to authenticated using (public.is_team_member()) with check (public.is_team_member());
