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
