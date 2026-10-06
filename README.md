# Chaim's Work Flow dashboard

Task dashboard for Chaim Bronstein and Nadine Jackson (FIRZT): tasks, follow-ups, clients,
calendar, and suggested tasks drafted from Gmail, Google Calendar, Granola and Plaud.

- **Stack:** Next.js (App Router) on Vercel, Supabase (Postgres + Auth) for data and logins.
- **Logins:** email and password. Only emails in `team_members` can create an account
  (enforced by a trigger on `auth.users`); each person sets their own password.
- **Audit trail:** every insert, update and soft delete on tasks, comments, follow-ups,
  suggestions and clients is written to `audit_log` with who did it and the before/after values.
  Nothing is hard-deleted from the app (`deleted_at` is set instead).
- **Suggestions:** the sync writes rows to `suggestions`. Nothing becomes a task or follow-up until
  a person accepts it, and drafts are only copied, never sent from the app.

## Setup

1. Apply `supabase/migrations/*.sql` to the Supabase project in order.
2. Set these environment variables (Vercel project settings, or `.env.local` for local dev):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

   Both are browser-safe keys. No secret keys are used by the app.
3. In Supabase, Authentication → URL Configuration: set **Site URL** to the production URL and add
   `https://<production-domain>/**` to Redirect URLs, so confirmation and reset links land on the app.

## Adding a team member

```sql
insert into public.team_members (email, full_name) values ('someone@firzt.co.za', 'Their Name');
```

They then use "First time? Create account" on the login page.

## How the sync writes data

The sync (run by Claude with the Gmail, Calendar, Granola and Plaud connectors) writes directly to
Supabase. It sets `select set_config('app.actor', 'Claude (sync)', false);` first so the audit trail
attributes its changes, and it only writes to:

| Table | What |
|---|---|
| `calendar_events` | upsert by Google event id |
| `meetings` | Granola / Plaud summaries and action items, unique on `(source, source_ref)` |
| `suggestions` | suggested tasks and follow-ups, unique on `(kind, source, source_ref, title)` |
| `sync_runs` | one row per source per run (drives "last synced") |

## Development

```bash
npm install
npm run dev
npm run typecheck
```

## WhatsApp

Chaim's and Nadine's numbers run the WhatsApp Business app connected to Meta's Cloud API in
"coexistence" mode through Dualhook, whose Webhook Override sends Meta's events straight to the
`whatsapp-webhook` edge function. Group chats are not available through coexistence.

- **Privacy rule:** message text is stored only for contacts marked `client`. `unsorted` contacts
  keep only name and number (text is kept for `whatsapp_settings.unsorted_hold_hours`, default 72,
  then wiped). Nothing is stored for `personal` contacts, and marking a contact personal wipes its
  text. A trigger on `whatsapp_messages` enforces this whatever the writer does.
- **Who sees what:** client chats are shared with the team; unsorted and personal contacts only
  with the person whose number it is (`whatsapp_numbers.owner`). Only the owner can sort a contact.
- **Endpoint:** `https://<project>.supabase.co/functions/v1/whatsapp-webhook/<path_secret>`, with
  `path_secret` and `verify_token` in the one-row `whatsapp_webhook_secret` table (service role
  only; set at go-live, never committed). Deployed with `verify_jwt = false`. Events are only
  accepted for numbers listed in `whatsapp_numbers`; the first event fills in `phone_number_id`.

**For the sync:** read new client messages with
`select ... from whatsapp_messages m join whatsapp_contacts c on c.id = m.contact_id where c.status = 'client' and m.processed_at is null`,
write suggestions with `source = 'whatsapp'`, `source_ref = 'wa:' || contact_id || ':' || <date>`
and `suggested_assignee` = the number's owner, then set `processed_at = now()` on those rows and
call `select public.whatsapp_purge_unsorted();`.
