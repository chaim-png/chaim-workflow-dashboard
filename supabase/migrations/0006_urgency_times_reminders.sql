-- Urgency (Low / Medium / Urgent) and due times on every item, calendar items in the to-do list,
-- reminder bookkeeping, and the item list used by the Morning and Evening Briefs.

select set_config('app.actor', 'Dashboard upgrade', true);

-- Tasks: priority becomes urgency (low / medium / urgent), plus a due time.
alter table public.tasks drop constraint tasks_priority_check;
update public.tasks set priority = case priority when 'high' then 'urgent' when 'normal' then 'medium' else priority end
  where priority in ('high', 'normal');
alter table public.tasks alter column priority set default 'medium';
alter table public.tasks add constraint tasks_priority_check check (priority in ('low', 'medium', 'urgent'));
alter table public.tasks add column due_time time;

-- One task per calendar event or meeting action item.
create unique index tasks_source_ref_once on public.tasks (source, source_ref)
  where deleted_at is null and source in ('calendar', 'granola', 'plaud') and source_ref is not null;

-- Follow-ups: urgency and a time to chase.
alter table public.follow_ups add column urgency text not null default 'medium' check (urgency in ('low', 'medium', 'urgent'));
alter table public.follow_ups add column next_action_time time;

-- Suggestions: urgency and a time of day, both editable before accepting.
alter table public.suggestions add column urgency text not null default 'medium' check (urgency in ('low', 'medium', 'urgent'));
alter table public.suggestions add column suggested_time time;

-- Calendar: remember events Chaim declined so they stay off the to-do list.
alter table public.calendar_events add column declined boolean not null default false;

-- Reminder emails already sent, so a routine never sends the same one twice.
create table public.reminder_log (
  item_table text not null check (item_table in ('tasks', 'follow_ups')),
  item_id uuid not null,
  kind text not null,
  sent_for date not null,
  sent_to text,
  sent_at timestamptz not null default now(),
  primary key (item_table, item_id, kind, sent_for)
);
alter table public.reminder_log enable row level security;
create policy team_select on public.reminder_log for select to authenticated using (public.is_team_member());

-- Everything due on or before p_day that is still open, for briefs and reminders.
create or replace function public.brief_items(p_day date)
returns table (
  item_type text, id uuid, title text, client text, assignee text, assignee_name text,
  due_date date, due_time time, urgency text, overdue boolean,
  contact_name text, contact_email text, details text, url text
)
language sql stable set search_path = public as $$
  select 'task', t.id, t.title, c.name, t.assignee, m.full_name,
         t.due_date, t.due_time, t.priority, t.due_date < p_day,
         null::text, null::text, left(t.details, 300), t.source_url
  from tasks t
  left join clients c on c.id = t.client_id
  left join team_members m on m.email = t.assignee
  where t.deleted_at is null and t.status <> 'done'
    and (t.due_date <= p_day or (t.priority = 'urgent' and t.due_date is null))
  union all
  select 'follow_up', f.id, f.matter, c.name, f.assignee, m.full_name,
         f.next_action_on, f.next_action_time, f.urgency, f.next_action_on < p_day,
         f.contact_name, f.contact_email, left(coalesce(f.what, ''), 300), f.source_url
  from follow_ups f
  left join clients c on c.id = f.client_id
  left join team_members m on m.email = f.assignee
  where f.deleted_at is null and f.status = 'open'
    and (f.next_action_on <= p_day or (f.urgency = 'urgent' and f.next_action_on is null))
$$;
revoke all on function public.brief_items(date) from public, anon;
grant execute on function public.brief_items(date) to authenticated;
