-- WhatsApp: client chats from Chaim's and Nadine's numbers (WhatsApp Business app in coexistence mode).
-- Written only by the whatsapp-webhook edge function (service role). Privacy rule: message text is
-- stored only for contacts marked 'client'. For 'unsorted' contacts it is kept for at most
-- whatsapp_settings.unsorted_hold_hours (0 = never stored); for 'personal' contacts nothing is stored.

create table public.whatsapp_numbers (
  display_phone text primary key check (display_phone ~ '^[0-9]+$'),
  phone_number_id text unique,
  waba_id text,
  owner text not null references public.team_members(email),
  label text not null,
  connected_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.whatsapp_settings (
  id boolean primary key default true check (id),
  unsorted_hold_hours int not null default 72 check (unsorted_hold_hours between 0 and 168)
);
insert into public.whatsapp_settings default values;

-- The webhook's secret path and Meta verify token. One row, written at go-live with random values
-- (never committed). No policies, so only the service role can read it.
create table public.whatsapp_webhook_secret (
  id boolean primary key default true check (id),
  path_secret text not null check (length(path_secret) >= 24),
  verify_token text not null check (length(verify_token) >= 16)
);

create table public.whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  display_phone text not null references public.whatsapp_numbers(display_phone),
  wa_id text not null,
  name text,
  status text not null default 'unsorted' check (status in ('unsorted','client','personal')),
  client_id uuid references public.clients(id),
  message_count int not null default 0,
  first_seen timestamptz not null default now(),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (display_phone, wa_id)
);
create index on public.whatsapp_contacts (status, last_message_at desc);

create table public.whatsapp_messages (
  id text primary key,                       -- WhatsApp message id (wamid)
  contact_id uuid not null references public.whatsapp_contacts(id),
  direction text not null check (direction in ('in','out')),
  sent_at timestamptz not null,
  type text not null,
  body text,
  from_history boolean not null default false,
  processed_at timestamptz,                  -- set by the sync once read for suggestions
  created_at timestamptz not null default now()
);
create index on public.whatsapp_messages (contact_id, sent_at desc);
create index on public.whatsapp_messages (sent_at) where processed_at is null;

-- Enforce the privacy rule in the database too, whatever the writer does.
create or replace function public.whatsapp_message_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v_status text;
begin
  select status into v_status from public.whatsapp_contacts where id = new.contact_id;
  if v_status = 'personal' then
    if tg_op = 'INSERT' then return null; end if;
    new.body := null;
    return new;
  end if;
  if v_status = 'unsorted' and (select unsorted_hold_hours from public.whatsapp_settings) = 0 then
    new.body := null;
  end if;
  return new;
end $$;
create trigger guard before insert or update of body on public.whatsapp_messages
  for each row execute function public.whatsapp_message_guard();

-- Keeps the per-contact count and last-message time current.
create or replace function public.whatsapp_count_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.whatsapp_contacts
    set message_count = message_count + 1,
        last_message_at = greatest(coalesce(last_message_at, new.sent_at), new.sent_at)
    where id = new.contact_id;
  return null;
end $$;
create trigger count_message after insert on public.whatsapp_messages
  for each row execute function public.whatsapp_count_message();

-- Marking a contact personal wipes any text already stored for it.
create or replace function public.whatsapp_contact_status_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'personal' and old.status is distinct from 'personal' then
    update public.whatsapp_messages set body = null where contact_id = new.id and body is not null;
  end if;
  return new;
end $$;
create trigger status_changed after update of status on public.whatsapp_contacts
  for each row execute function public.whatsapp_contact_status_changed();

-- Drops held text for contacts still unsorted after the hold window. Called by the webhook on each
-- delivery and by the sync, so it runs at least a few times a day.
create or replace function public.whatsapp_purge_unsorted()
returns int language sql security definer set search_path = '' as $$
  with purged as (
    update public.whatsapp_messages m set body = null
    from public.whatsapp_contacts c
    where c.id = m.contact_id and c.status = 'unsorted' and m.body is not null
      and m.created_at < now() - make_interval(hours => (select unsorted_hold_hours from public.whatsapp_settings))
    returning 1
  )
  select count(*)::int from purged;
$$;

-- Only client-related sorting decisions go to the shared history, so personal contacts never
-- appear there. Webhook bookkeeping (counts, timestamps) is not audited.
create trigger audit after update of status, client_id on public.whatsapp_contacts
  for each row when (old.status = 'client' or new.status = 'client')
  execute function public.write_audit();
create trigger touch before update on public.whatsapp_contacts
  for each row execute function public.touch_updated_at();

-- Visibility: client chats are shared with the whole team; unsorted and personal contacts (and any
-- held text) are visible only to the person whose number it is.
create or replace function public.owns_whatsapp_number(p_display_phone text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.whatsapp_numbers n join public.team_members m on m.email = n.owner
    where n.display_phone = p_display_phone and m.user_id = auth.uid() and m.role <> 'removed'
  );
$$;

create or replace function public.can_see_whatsapp_contact(p_contact_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.whatsapp_contacts c
    where c.id = p_contact_id
      and ((c.status = 'client' and public.is_team_member()) or public.owns_whatsapp_number(c.display_phone))
  );
$$;

alter table public.whatsapp_numbers enable row level security;
alter table public.whatsapp_settings enable row level security;
alter table public.whatsapp_webhook_secret enable row level security;
alter table public.whatsapp_contacts enable row level security;
alter table public.whatsapp_messages enable row level security;

create policy team_select on public.whatsapp_numbers for select to authenticated using (public.is_team_member());
create policy team_select on public.whatsapp_settings for select to authenticated using (public.is_team_member());
create policy visible_select on public.whatsapp_contacts for select to authenticated
  using ((status = 'client' and public.is_team_member()) or public.owns_whatsapp_number(display_phone));
create policy owner_update on public.whatsapp_contacts for update to authenticated
  using (public.owns_whatsapp_number(display_phone)) with check (public.owns_whatsapp_number(display_phone));
create policy visible_select on public.whatsapp_messages for select to authenticated
  using (public.can_see_whatsapp_contact(contact_id));

-- People may only sort contacts (status, client link); everything else is written by the webhook.
revoke insert, update, delete on public.whatsapp_contacts from anon, authenticated;
grant update (status, client_id) on public.whatsapp_contacts to authenticated;
revoke insert, update, delete on public.whatsapp_messages, public.whatsapp_numbers, public.whatsapp_settings from anon, authenticated;
revoke all on public.whatsapp_webhook_secret from anon, authenticated;

revoke execute on function public.whatsapp_message_guard() from public, anon, authenticated;
revoke execute on function public.whatsapp_contact_status_changed() from public, anon, authenticated;
revoke execute on function public.whatsapp_purge_unsorted() from public, anon, authenticated;
revoke execute on function public.whatsapp_count_message() from public, anon, authenticated;
revoke execute on function public.owns_whatsapp_number(text) from public, anon;
revoke execute on function public.can_see_whatsapp_contact(uuid) from public, anon;
grant execute on function public.owns_whatsapp_number(text) to authenticated;
grant execute on function public.can_see_whatsapp_contact(uuid) to authenticated;

-- The two numbers. Chaim's mobile is added once he confirms it; phone_number_id and waba_id are
-- filled in by the webhook the first time Meta sends events for the number.
insert into public.whatsapp_numbers (display_phone, owner, label) values
  ('27651745729', 'nadine@firzt.co.za', 'Nadine');
